import test from 'node:test';
import assert from 'node:assert/strict';
import type { Intent } from '@uni-agent/shared';
import { assertExecutionAuthorized } from './route';

function makeIntent(overrides: Partial<Intent> = {}): Intent {
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
    status: 'planned',
    createdAt: '2026-04-28T00:00:00.000Z',
    ...overrides,
  };
}

test('assertExecutionAuthorized accepts the owning wallet when planned', () => {
  assert.doesNotThrow(() =>
    assertExecutionAuthorized(
      makeIntent(),
      '0x1111111111111111111111111111111111111111',
    )
  );
});

test('assertExecutionAuthorized rejects a non-owner', () => {
  assert.throws(
    () =>
      assertExecutionAuthorized(
        makeIntent(),
        '0x2222222222222222222222222222222222222222',
      ),
    /owner mismatch/,
  );
});

test('assertExecutionAuthorized rejects intents that are not planned', () => {
  assert.throws(
    () =>
      assertExecutionAuthorized(
        makeIntent({ status: 'created' }),
        '0x1111111111111111111111111111111111111111',
      ),
    /not ready for execution/,
  );
});
