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
  source: 'defillama' | 'fallback';
  updatedAt: string;
};

const DEFAULT_APRS = {
  stable: 420,
  balanced: 1240,
  aggressive: 3870,
} as const;

const CACHE_TTL_MS = 10 * 60 * 1000;
const YIELDS_URL = 'https://yields.llama.fi/pools';

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
