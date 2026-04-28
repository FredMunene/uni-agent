import test from 'node:test';
import assert from 'node:assert/strict';
import { keccak256, stringToHex } from 'viem';
import type { Plan } from '@uni-agent/shared';
import { buildExecutionAuthorizationMessage, computePlanHash, normalizeBaseUrl, selectDemoPlan } from './demo';

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    planId: 'plan_123',
    intentId: 'int_123',
    strategy: 'balanced',
    label: 'Balanced Growth',
    estimatedNetApyBps: 1250,
    estimatedGasUsd: '1.50',
    riskScore: 'medium',
    steps: [
      {
        stepId: 'step_001',
        type: 'swap',
        provider: 'dex',
        chainId: 8453,
        fromToken: '0x1111111111111111111111111111111111111111',
        toToken: '0x2222222222222222222222222222222222222222',
        amountIn: '50000000',
        estimatedAmountOut: '15000000000000000',
        slippageBps: 50,
      },
    ],
    risk: {
      maxLossUsd: '4.20',
      notes: 'demo',
    },
    createdAt: '2026-04-28T00:00:00.000Z',
    ...overrides,
  };
}

test('normalizeBaseUrl strips trailing slashes and defaults cleanly', () => {
  assert.equal(normalizeBaseUrl('http://localhost:3000///'), 'http://localhost:3000');
  assert.equal(normalizeBaseUrl(undefined), 'http://localhost:3000');
});

test('buildExecutionAuthorizationMessage is stable and explicit', () => {
  const message = buildExecutionAuthorizationMessage(
    'int_123',
    'plan_456',
    '0x' + 'a'.repeat(64),
    '0x1111111111111111111111111111111111111111',
  );

  assert.equal(
    message,
    [
      'Uni-Agent execution authorization',
      'intentId: int_123',
      'planId: plan_456',
      `planHash: 0x${'a'.repeat(64)}`,
      'userAddress: 0x1111111111111111111111111111111111111111',
    ].join('\n'),
  );
});

test('computePlanHash changes when plan contents change', () => {
  const first = makePlan();
  const second = makePlan({
    steps: [
      {
        ...makePlan().steps[0],
        amountIn: '60000000',
      },
    ],
  });

  const firstHash = computePlanHash(first);
  const secondHash = computePlanHash(second);

  assert.match(firstHash, /^0x[a-fA-F0-9]{64}$/);
  assert.match(secondHash, /^0x[a-fA-F0-9]{64}$/);
  assert.notEqual(firstHash, secondHash);
});

test('selectDemoPlan prefers the balanced strategy', () => {
  const conservative = makePlan({ planId: 'plan_a', strategy: 'conservative', label: 'Safe' });
  const balanced = makePlan({ planId: 'plan_b', strategy: 'balanced', label: 'Balanced' });
  const aggressive = makePlan({ planId: 'plan_c', strategy: 'aggressive', label: 'Bold' });

  assert.equal(selectDemoPlan([conservative, balanced, aggressive]).planId, 'plan_b');
});

test('selectDemoPlan falls back to the first plan when balanced is absent', () => {
  const conservative = makePlan({ planId: 'plan_a', strategy: 'conservative', label: 'Safe' });
  const aggressive = makePlan({ planId: 'plan_c', strategy: 'aggressive', label: 'Bold' });

  assert.equal(selectDemoPlan([conservative, aggressive]).planId, 'plan_a');
});
