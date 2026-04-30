import test from 'node:test';
import assert from 'node:assert/strict';
import { clearAprSnapshotCache, getAprSnapshot } from './apr';
import { ACTIVE_MARKET } from '../markets';

const originalFetch = globalThis.fetch;

test('getAprSnapshot prefers the best Base Uniswap pool matches', async () => {
  clearAprSnapshotCache();

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
});
