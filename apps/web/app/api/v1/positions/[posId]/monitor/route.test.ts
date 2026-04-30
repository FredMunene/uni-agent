import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStoredMonitorFallback } from './route';

test('buildStoredMonitorFallback derives a range-aware snapshot from stored execution metadata', () => {
  const payload = buildStoredMonitorFallback('0xpos123', {
    _plan: [
      {
        type: 'add_liquidity',
        token0AmountIn: '5000000',
        token1AmountIn: '1000000000000000',
      },
    ],
    _positionMeta: {
      positionId: '0xpos123',
      tickLower: -1200,
      tickUpper: 800,
      currentTick: 1000,
    },
  });

  assert.equal(payload.snapshot.inRange, false);
  assert.equal(payload.snapshot.tickLower, -1200);
  assert.equal(payload.snapshot.tickUpper, 800);
  assert.equal(payload.snapshot.currentTick, 1000);
  assert.equal(payload.snapshot.driftPercent, 10);
  assert.equal(payload.position.amount0, '5000000');
  assert.equal(payload.position.amount1, '1000000000000000');
});
