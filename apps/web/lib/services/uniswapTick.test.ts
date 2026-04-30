import test from 'node:test';
import assert from 'node:assert/strict';

import {
  maybeReadCurrentUniswapV3Tick,
  readCurrentUniswapV3Tick,
  resolveUniswapV3PoolAddress,
} from './uniswapTick';

const originalPoolAddress = process.env.UNISWAP_V3_POOL_ADDRESS;
const originalBasePoolAddress = process.env.UNISWAP_V3_BASE_POOL_ADDRESS;

test('resolveUniswapV3PoolAddress prefers the explicit pool env var', () => {
  process.env.UNISWAP_V3_POOL_ADDRESS = '0x1111111111111111111111111111111111111111';
  process.env.UNISWAP_V3_BASE_POOL_ADDRESS = '0x2222222222222222222222222222222222222222';

  assert.equal(
    resolveUniswapV3PoolAddress(),
    '0x1111111111111111111111111111111111111111',
  );
});

test('readCurrentUniswapV3Tick extracts the tick from slot0', async () => {
  const client = {
    readContract: async () => [0n, 321, 0, 0, 0, 0, true],
  } as any;

  const tick = await readCurrentUniswapV3Tick(
    client,
    '0x1111111111111111111111111111111111111111',
  );

  assert.equal(tick, 321);
});

test('maybeReadCurrentUniswapV3Tick returns null when no pool is configured', async () => {
  delete process.env.UNISWAP_V3_POOL_ADDRESS;
  delete process.env.UNISWAP_V3_BASE_POOL_ADDRESS;

  const tick = await maybeReadCurrentUniswapV3Tick();
  assert.equal(tick, null);
});

test.after(() => {
  if (originalPoolAddress) {
    process.env.UNISWAP_V3_POOL_ADDRESS = originalPoolAddress;
  } else {
    delete process.env.UNISWAP_V3_POOL_ADDRESS;
  }

  if (originalBasePoolAddress) {
    process.env.UNISWAP_V3_BASE_POOL_ADDRESS = originalBasePoolAddress;
  } else {
    delete process.env.UNISWAP_V3_BASE_POOL_ADDRESS;
  }
});
