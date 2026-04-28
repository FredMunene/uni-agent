import test from 'node:test';
import assert from 'node:assert/strict';
import type { Plan } from '@uni-agent/shared';
import { computePlanHash } from './route';

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    planId: 'plan_123',
    intentId: 'int_123',
    strategy: 'balanced',
    label: 'USDC/WETH LP on Base',
    estimatedNetApyBps: 480,
    estimatedGasUsd: '1.50',
    riskScore: 'medium',
    steps: [
      {
        stepId: 'step_001',
        type: 'swap',
        provider: 'uniswap',
        chainId: 84532,
        fromToken: 'USDC',
        toToken: 'WETH',
        amountIn: '50000000',
        estimatedAmountOut: '13200000000000000',
        slippageBps: 50,
      },
    ],
    risk: {
      maxLossUsd: '2.50',
      notes: 'stable',
    },
    createdAt: '2026-04-28T00:00:00.000Z',
    ...overrides,
  };
}

test('computePlanHash is stable for identical plans', () => {
  const plan = makePlan();
  assert.equal(computePlanHash(plan), computePlanHash(makePlan()));
});

test('computePlanHash changes when a plan step changes', () => {
  const base = computePlanHash(makePlan());
  const changed = computePlanHash(
    makePlan({
      steps: [
        {
          stepId: 'step_001',
          type: 'swap',
          provider: 'uniswap',
          chainId: 84532,
          fromToken: 'USDC',
          toToken: 'WETH',
          amountIn: '75000000',
          estimatedAmountOut: '19800000000000000',
          slippageBps: 50,
        },
      ],
    }),
  );

  assert.notEqual(base, changed);
});
