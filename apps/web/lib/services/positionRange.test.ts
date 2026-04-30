import test from 'node:test';
import assert from 'node:assert/strict';

import { derivePositionRangeFromPlan, formatPositionRange } from './positionRange';

test('derivePositionRangeFromPlan extracts the add-liquidity range', () => {
  const range = derivePositionRangeFromPlan({
    planId: 'plan_123',
    intentId: 'int_123',
    strategy: 'balanced',
    label: 'Balanced Growth',
    estimatedNetApyBps: 1000,
    estimatedGasUsd: '1.50',
    riskScore: 'medium',
    steps: [
      {
        stepId: 'step_001',
        type: 'swap',
        provider: 'dex',
        chainId: 84532,
      },
      {
        stepId: 'step_002',
        type: 'add_liquidity',
        provider: 'dex_v4',
        chainId: 84532,
        tickLower: -1200,
        tickUpper: 800,
      },
    ],
    risk: { maxLossUsd: '4.20', notes: 'test' },
    createdAt: '2026-04-28T00:00:00.000Z',
  });

  assert.deepEqual(range, {
    tickLower: -1200,
    tickUpper: 800,
    currentTick: -200,
  });
});

test('formatPositionRange renders stored tick metadata cleanly', () => {
  const label = formatPositionRange({
    positionId: '0xpos',
    pool: 'USDC/WETH 0.05%',
    token0Amount: '1',
    token1Amount: '2',
    tickLower: -1200,
    tickUpper: 800,
    currentTick: -200,
  });

  assert.equal(label, 'ticks -1200 → 800 · current -200');
});
