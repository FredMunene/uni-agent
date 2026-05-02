import test from 'node:test';
import assert from 'node:assert/strict';

import { simulatedExecution } from '@/lib/simulatedExecution';

test('simulatedExecution exposes stored range metadata once execution completes', () => {
  const result = simulatedExecution({
    executionId: 'exec_12345678',
    createdAt: new Date(Date.now() - 20_000).toISOString(),
    _plan: {
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
          amountIn: '5000000',
          estimatedAmountOut: '1000000000000000',
        },
      ],
      risk: {
        maxLossUsd: '4.20',
        notes: 'test',
      },
      createdAt: '2026-04-28T00:00:00.000Z',
    },
    _positionMeta: {
      tickLower: -1200,
      tickUpper: 800,
      currentTick: -200,
    },
  } as any);

  const r = result as Record<string, unknown> & { position?: Record<string, unknown> };
  assert.equal(r.status, 'completed');
  assert.equal(r.position?.tickLower, -1200);
  assert.equal(r.position?.tickUpper, 800);
  assert.equal(r.position?.currentTick, -200);
});
