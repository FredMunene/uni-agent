import test from 'node:test';
import assert from 'node:assert/strict';
import { clearAprSnapshotCache, getAprSnapshot } from './apr';
import { ACTIVE_MARKET } from '../markets';

const originalFetch = globalThis.fetch;
const originalSubgraphUrl = process.env.UNISWAP_V3_BASE_SUBGRAPH_URL;

test('getAprSnapshot prefers Uniswap subgraph data when configured', async () => {
  clearAprSnapshotCache();
  process.env.UNISWAP_V3_BASE_SUBGRAPH_URL = 'https://example.com/subgraph';

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('example.com/subgraph')) {
      return {
        ok: true,
        json: async () => ({
          data: {
            pools: [
              {
                id: 'stable-pool',
                feeTier: '100',
                totalValueLockedUSD: '2000000',
                token0: { symbol: 'USDC' },
                token1: { symbol: 'USDT' },
                poolDayData: [{ date: 1, feesUSD: '200', tvlUSD: '2000000', volumeUSD: '100000' }],
              },
              {
                id: 'lp-pool',
                feeTier: '500',
                totalValueLockedUSD: '5000000',
                token0: { symbol: 'USDC' },
                token1: { symbol: 'WETH' },
                poolDayData: [{ date: 1, feesUSD: '1000', tvlUSD: '5000000', volumeUSD: '200000' }],
              },
            ],
          },
        }),
      } as Response;
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const snapshot = await getAprSnapshot(ACTIVE_MARKET);
  assert.equal(snapshot.stable.project, 'uniswap-v3-subgraph');
  assert.equal(snapshot.stable.pool, 'stable-pool');
  assert.equal(snapshot.stable.apyBps, 365);
  assert.equal(snapshot.balanced.pool, 'lp-pool');
  assert.equal(snapshot.balanced.apyBps, 730);
  assert.equal(snapshot.aggressive.apyBps, 986);
});

test('getAprSnapshot prefers the best Base Uniswap pool matches', async () => {
  clearAprSnapshotCache();
  delete process.env.UNISWAP_V3_BASE_SUBGRAPH_URL;

  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({
      status: 'success',
      data: [
        {
          chain: 'Base',
          project: 'uniswap-v3',
          symbol: 'USDC-USDT',
          pool: 'stable-1',
          tvlUsd: 1000,
          apy: 4.2,
          apyBase: 4.2,
          stablecoin: true,
        },
        {
          chain: 'Base',
          project: 'uniswap-v3',
          symbol: 'USDC-WETH',
          pool: 'balanced-1',
          tvlUsd: 2500,
          apy: 12.5,
          apyBase: 12.5,
          stablecoin: false,
        },
      ],
    }),
  })) as unknown as typeof fetch;

  const snapshot = await getAprSnapshot(ACTIVE_MARKET);
  assert.equal(snapshot.source, 'defillama');
  assert.equal(snapshot.stable.pool, 'stable-1');
  assert.equal(snapshot.stable.apyBps, 420);
  assert.equal(snapshot.balanced.pool, 'balanced-1');
  assert.equal(snapshot.balanced.apyBps, 1250);
  assert.equal(snapshot.aggressive.apyBps, 1688);
  assert.equal(snapshot.balanced.symbol, 'USDC-WETH');
});

test('getAprSnapshot falls back when the feed cannot be read', async () => {
  clearAprSnapshotCache();
  delete process.env.UNISWAP_V3_BASE_SUBGRAPH_URL;

  globalThis.fetch = (async () => ({
    ok: false,
    status: 500,
  })) as unknown as typeof fetch;

  const snapshot = await getAprSnapshot(ACTIVE_MARKET);
  assert.equal(snapshot.source, 'fallback');
  assert.equal(snapshot.stable.apyBps, 420);
  assert.equal(snapshot.balanced.apyBps, 1240);
  assert.equal(snapshot.aggressive.apyBps, 3870);
  assert.equal(snapshot.balanced.symbol, 'USDC-WETH');
});

test.after(() => {
  globalThis.fetch = originalFetch;
  if (originalSubgraphUrl) {
    process.env.UNISWAP_V3_BASE_SUBGRAPH_URL = originalSubgraphUrl;
  } else {
    delete process.env.UNISWAP_V3_BASE_SUBGRAPH_URL;
  }
});
