import { ACTIVE_MARKET, type MarketConfig } from '../markets';

type YieldPool = {
  chain?: string;
  project?: string;
  symbol?: string;
  tvlUsd?: number;
  apy?: number | null;
  apyBase?: number | null;
  stablecoin?: boolean;
  pool?: string;
  poolMeta?: string | null;
  underlyingTokens?: string[] | null;
};

type YieldResponse = {
  status?: string;
  data?: YieldPool[];
};

type SubgraphPool = {
  id: string;
  feeTier?: string | null;
  totalValueLockedUSD?: string | null;
  token0?: { id?: string | null; symbol?: string | null } | null;
  token1?: { id?: string | null; symbol?: string | null } | null;
  poolDayData?: Array<{
    date?: number | null;
    feesUSD?: string | null;
    tvlUSD?: string | null;
    volumeUSD?: string | null;
  }> | null;
};

type SubgraphResponse = {
  data?: {
    pools?: SubgraphPool[];
  };
  errors?: Array<{ message?: string }>;
};

export type AprPool = {
  chain: string;
  project: string;
  symbol: string;
  pool: string;
  tvlUsd: number;
  apy: number;
  apyBps: number;
};

export type AprSnapshot = {
  stable: AprPool;
  balanced: AprPool;
  aggressive: AprPool;
  source: 'uniswap-subgraph' | 'defillama' | 'fallback';
  updatedAt: string;
};

const DEFAULT_APRS = {
  stable: 420,
  balanced: 1240,
  aggressive: 3870,
} as const;

const CACHE_TTL_MS = 10 * 60 * 1000;
const YIELDS_URL = 'https://yields.llama.fi/pools';
const UNISWAP_V3_BASE_SUBGRAPH_ID = '96eJ9Go8gFjySRGnndG7EYxThaiwVDV8BYPp1TMDcoYh';
const SUBGRAPH_POOL_QUERY = `
  query UniAgentPools($first: Int!) {
    pools(first: $first, orderBy: totalValueLockedUSD, orderDirection: desc) {
      id
      feeTier
      totalValueLockedUSD
      token0 { id symbol }
      token1 { id symbol }
      poolDayData(first: 1, orderBy: date, orderDirection: desc) {
        date
        feesUSD
        tvlUSD
        volumeUSD
      }
    }
  }
`;

let cachedSnapshot: { marketId: string; value: AprSnapshot; expiresAt: number } | null = null;

function normalize(value?: string | null): string {
  return (value ?? '').toLowerCase();
}

function toApy(pool: YieldPool): number {
  return Number(pool.apyBase ?? pool.apy ?? 0);
}

function toApyBps(pool: YieldPool, multiplier = 1): number {
  return Math.max(0, Math.round(toApy(pool) * 100 * multiplier));
}

function isBaseUniswap(pool: YieldPool): boolean {
  const chain = normalize(pool.chain);
  const project = normalize(pool.project);
  return chain === 'base' && project.includes('uniswap');
}

function matchesSymbols(pool: YieldPool, symbols: readonly string[]): boolean {
  const symbol = normalize(pool.symbol);
  return symbols.every((entry) => symbol.includes(entry.toLowerCase()));
}

function chooseBest(pools: YieldPool[], predicate: (pool: YieldPool) => boolean): YieldPool | null {
  return pools
    .filter(predicate)
    .sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0))[0] ?? null;
}

function getSubgraphUrl(): string | null {
  const explicitUrl = process.env.UNISWAP_V3_BASE_SUBGRAPH_URL?.trim();
  if (explicitUrl) return explicitUrl;

  const apiKey = process.env.THE_GRAPH_API_KEY?.trim();
  if (!apiKey) return null;
  return `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${UNISWAP_V3_BASE_SUBGRAPH_ID}`;
}

function matchesPoolSymbols(pool: SubgraphPool, symbols: readonly string[]): boolean {
  const tokenSymbols = [normalize(pool.token0?.symbol), normalize(pool.token1?.symbol)];
  return symbols.every((symbol) => tokenSymbols.includes(symbol.toLowerCase()));
}

function parseUsd(value?: string | null): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dailyFeesApyBps(pool: SubgraphPool, multiplier = 1): number {
  const day = pool.poolDayData?.[0];
  const feesUsd = parseUsd(day?.feesUSD);
  const tvlUsd = Math.max(parseUsd(day?.tvlUSD), parseUsd(pool.totalValueLockedUSD));
  if (feesUsd <= 0 || tvlUsd <= 0) return 0;
  return Math.max(0, Math.round(((feesUsd * 365) / tvlUsd) * 10_000 * multiplier));
}

async function getSubgraphSnapshot(market: MarketConfig): Promise<AprSnapshot | null> {
  const url = getSubgraphUrl();
  if (!url) return null;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      query: SUBGRAPH_POOL_QUERY,
      variables: { first: 80 },
    }),
  });

  if (!res.ok) {
    throw new Error(`Uniswap subgraph request failed: ${res.status}`);
  }

  const payload = await res.json() as SubgraphResponse;
  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message ?? 'Uniswap subgraph query failed');
  }

  const pools = Array.isArray(payload.data?.pools) ? payload.data?.pools : [];
  const stablePool = pools
    .filter((pool) => matchesPoolSymbols(pool, market.stableReferenceSymbols))
    .sort((a, b) => parseUsd(b.totalValueLockedUSD) - parseUsd(a.totalValueLockedUSD))[0] ?? null;

  const lpPool = pools
    .filter((pool) => matchesPoolSymbols(pool, market.lpSymbols) && Number(pool.feeTier ?? 0) === market.fee)
    .sort((a, b) => parseUsd(b.totalValueLockedUSD) - parseUsd(a.totalValueLockedUSD))[0] ?? null;

  if (!stablePool || !lpPool) {
    return null;
  }

  const stableApyBps = dailyFeesApyBps(stablePool);
  const balancedApyBps = dailyFeesApyBps(lpPool);
  const aggressiveApyBps = dailyFeesApyBps(lpPool, 1.35);

  if (stableApyBps <= 0 || balancedApyBps <= 0 || aggressiveApyBps <= 0) {
    return null;
  }

  return {
    stable: {
      chain: market.chainLabel,
      project: 'uniswap-v3-subgraph',
      symbol: `${stablePool.token0?.symbol ?? market.stableReferenceSymbols[0]}-${stablePool.token1?.symbol ?? market.stableReferenceSymbols[1]}`,
      pool: stablePool.id,
      tvlUsd: parseUsd(stablePool.poolDayData?.[0]?.tvlUSD) || parseUsd(stablePool.totalValueLockedUSD),
      apy: stableApyBps / 100,
      apyBps: stableApyBps,
    },
    balanced: {
      chain: market.chainLabel,
      project: 'uniswap-v3-subgraph',
      symbol: `${lpPool.token0?.symbol ?? market.lpSymbols[0]}-${lpPool.token1?.symbol ?? market.lpSymbols[1]}`,
      pool: lpPool.id,
      tvlUsd: parseUsd(lpPool.poolDayData?.[0]?.tvlUSD) || parseUsd(lpPool.totalValueLockedUSD),
      apy: balancedApyBps / 100,
      apyBps: balancedApyBps,
    },
    aggressive: {
      chain: market.chainLabel,
      project: 'uniswap-v3-subgraph',
      symbol: `${lpPool.token0?.symbol ?? market.lpSymbols[0]}-${lpPool.token1?.symbol ?? market.lpSymbols[1]}`,
      pool: `${lpPool.id}-aggressive`,
      tvlUsd: parseUsd(lpPool.poolDayData?.[0]?.tvlUSD) || parseUsd(lpPool.totalValueLockedUSD),
      apy: aggressiveApyBps / 100,
      apyBps: aggressiveApyBps,
    },
    source: 'uniswap-subgraph',
    updatedAt: new Date().toISOString(),
  };
}

function fallbackSnapshot(market: MarketConfig): AprSnapshot {
  const now = new Date().toISOString();
  const makePool = (label: string, apyBps: number): AprPool => ({
    chain: market.chainLabel,
    project: 'fallback',
    symbol: label,
    pool: `fallback-${label}`,
    tvlUsd: 0,
    apy: apyBps / 100,
    apyBps,
  });

  return {
    stable: makePool(market.stableReferenceSymbols.join('-').toUpperCase(), DEFAULT_APRS.stable),
    balanced: makePool(market.lpSymbols.join('-').toUpperCase(), DEFAULT_APRS.balanced),
    aggressive: makePool(market.lpSymbols.join('-').toUpperCase(), DEFAULT_APRS.aggressive),
    source: 'fallback',
    updatedAt: now,
  };
}

export async function getAprSnapshot(market: MarketConfig = ACTIVE_MARKET): Promise<AprSnapshot> {
  const now = Date.now();
  if (cachedSnapshot && cachedSnapshot.marketId === market.id && cachedSnapshot.expiresAt > now) {
    return cachedSnapshot.value;
  }

  try {
    const subgraphSnapshot = await getSubgraphSnapshot(market);
    if (subgraphSnapshot) {
      cachedSnapshot = { marketId: market.id, value: subgraphSnapshot, expiresAt: now + CACHE_TTL_MS };
      return subgraphSnapshot;
    }

    const res = await fetch(YIELDS_URL, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`DefiLlama yields request failed: ${res.status}`);

    const payload = await res.json() as YieldResponse;
    const pools = Array.isArray(payload.data) ? payload.data : [];

    const stablePool =
      chooseBest(pools, (pool) => isBaseUniswap(pool) && pool.stablecoin === true && matchesSymbols(pool, market.stableReferenceSymbols))
      ?? chooseBest(pools, (pool) => isBaseUniswap(pool) && matchesSymbols(pool, market.stableReferenceSymbols))
      ?? chooseBest(pools, (pool) => normalize(pool.chain) === 'base' && pool.stablecoin === true)
      ?? null;

    const lpPool =
      chooseBest(pools, (pool) => isBaseUniswap(pool) && matchesSymbols(pool, market.lpSymbols))
      ?? chooseBest(pools, (pool) => isBaseUniswap(pool) && matchesSymbols(pool, [market.lpSymbols[0] ?? '']))
      ?? null;

    if (!stablePool || !lpPool) {
      throw new Error('Could not match APR pools');
    }

    const stable = {
      chain: stablePool.chain ?? market.chainLabel,
      project: stablePool.project ?? 'uniswap',
      symbol: stablePool.symbol ?? market.stableReferenceSymbols.join('-').toUpperCase(),
      pool: stablePool.pool ?? 'stable',
      tvlUsd: stablePool.tvlUsd ?? 0,
      apy: toApy(stablePool),
      apyBps: toApyBps(stablePool),
    };

    const balancedApy = toApyBps(lpPool);
    const balanced = {
      chain: lpPool.chain ?? market.chainLabel,
      project: lpPool.project ?? 'uniswap',
      symbol: lpPool.symbol ?? market.lpSymbols.join('-').toUpperCase(),
      pool: lpPool.pool ?? 'balanced',
      tvlUsd: lpPool.tvlUsd ?? 0,
      apy: toApy(lpPool),
      apyBps: balancedApy,
    };

    const aggressive = {
      ...balanced,
      apy: balanced.apy * 1.35,
      apyBps: Math.max(balanced.apyBps + 1, Math.round(balanced.apyBps * 1.35)),
      pool: `${balanced.pool}-aggressive`,
    };

    const snapshot: AprSnapshot = {
      stable,
      balanced,
      aggressive,
      source: 'defillama',
      updatedAt: new Date().toISOString(),
    };

    cachedSnapshot = { marketId: market.id, value: snapshot, expiresAt: now + CACHE_TTL_MS };
    return snapshot;
  } catch {
    const snapshot = fallbackSnapshot(market);
    cachedSnapshot = { marketId: market.id, value: snapshot, expiresAt: now + CACHE_TTL_MS };
    return snapshot;
  }
}

export function clearAprSnapshotCache(): void {
  cachedSnapshot = null;
}
