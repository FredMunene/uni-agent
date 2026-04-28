import test from 'node:test';
import assert from 'node:assert/strict';
import type { Intent } from '@uni-agent/shared';
import { assertPlanningAllowed } from './route';

function makeIntent(status: Intent['status']): Intent {
  return {
    intentId: 'int_123',
    userAddress: '0x1111111111111111111111111111111111111111',
    inputToken: 'USDC',
    inputAmount: '1000000',
    goal: 'Make USDC productive',
    risk: 'low',
    constraints: {
      maxSlippageBps: 50,
      deadlineSeconds: 900,
      allowBridge: false,
      allowBorrow: false,
    },
    status,
    createdAt: '2026-04-28T00:00:00.000Z',
  };
}

test('assertPlanningAllowed accepts created intents', () => {
  assert.doesNotThrow(() => assertPlanningAllowed(makeIntent('created')));
});

test('assertPlanningAllowed accepts failed intents for retry', () => {
  assert.doesNotThrow(() => assertPlanningAllowed(makeIntent('failed')));
});

test('assertPlanningAllowed rejects planned intents', () => {
  assert.throws(
    () => assertPlanningAllowed(makeIntent('planned')),
    /not ready for planning/,
  );
});

test('assertPlanningAllowed rejects executing intents', () => {
  assert.throws(
    () => assertPlanningAllowed(makeIntent('executing')),
    /not ready for planning/,
  );
});
