import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveMonitorSnapshot } from './monitor';

test('deriveMonitorSnapshot marks empty positions out of range', () => {
  const snapshot = deriveMonitorSnapshot(null);
  assert.equal(snapshot.inRange, false);
  assert.equal(snapshot.driftPercent, 100);
});

test('deriveMonitorSnapshot marks funded positions in range', () => {
  const snapshot = deriveMonitorSnapshot({
    positionId: 'pos_123',
    pool: 'USDC/WETH 0.05%',
    token0Amount: '5000000',
    token1Amount: '1000000000000000',
    liquidity: '1',
    currentTick: 0,
    tickLower: -1000,
    tickUpper: 1000,
  });

  assert.equal(snapshot.inRange, true);
  assert.equal(snapshot.driftPercent, 0);
});

test('deriveMonitorSnapshot marks positions above range with proportional drift', () => {
  const snapshot = deriveMonitorSnapshot({
    positionId: 'pos_456',
    pool: 'USDC/WETH 0.05%',
    token0Amount: '5000000',
    token1Amount: '1000000000000000',
    liquidity: '1',
    currentTick: 1500,
    tickLower: -1000,
    tickUpper: 1000,
  });

  assert.equal(snapshot.inRange, false);
  assert.equal(snapshot.currentTick, 1500);
  assert.equal(snapshot.driftPercent, 25);
});

test('deriveMonitorSnapshot marks positions below range with proportional drift', () => {
  const snapshot = deriveMonitorSnapshot({
    positionId: 'pos_789',
    pool: 'USDC/WETH 0.05%',
    token0Amount: '5000000',
    token1Amount: '1000000000000000',
    liquidity: '1',
    currentTick: -1300,
    tickLower: -1000,
    tickUpper: 1000,
  });

  assert.equal(snapshot.inRange, false);
  assert.equal(snapshot.currentTick, -1300);
  assert.equal(snapshot.driftPercent, 15);
});
