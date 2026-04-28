import test from 'node:test';
import assert from 'node:assert/strict';
import type { Intent } from '@uni-agent/shared';
import { assertExecutionAuthorized, startExecution } from './route';

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

test('startExecution marks the intent as executing and stores one execution record', async () => {
  const intent = makeIntent();
  const executions: Record<string, unknown> = {};
  const updatedIntents: Intent[] = [];
  const store = {
    intents: {
      get: async () => intent,
      set: async (_id: string, next: Intent) => {
        updatedIntents.push(next);
      },
    },
    plans: {
      get: async () => [
        {
          planId: 'plan_123',
          steps: [{ type: 'swap', amountIn: '1', estimatedAmountOut: '2' }],
        },
      ],
    },
    executions: {
      set: async (id: string, execution: unknown) => {
        executions[id] = execution;
      },
    },
  };

  const outcome = await startExecution(
    store,
    intent.intentId,
    'plan_123',
    intent.userAddress,
  );

  assert.equal(outcome.ok, true);
  assert.equal(updatedIntents.at(-1)?.status, 'executing');
  assert.equal(Object.keys(executions).length, 1);

  const execution = Object.values(executions)[0] as { intentId?: string; planId?: string; status?: string };
  assert.equal(execution.intentId, intent.intentId);
  assert.equal(execution.planId, 'plan_123');
  assert.equal(execution.status, 'submitted');
});

test('startExecution rejects a duplicate execution for the same intent', async () => {
  const intent = makeIntent();
  const store = {
    intents: {
      get: async () => intent,
      set: async () => undefined,
    },
    plans: {
      get: async () => [
        {
          planId: 'plan_123',
          steps: [{ type: 'swap', amountIn: '1', estimatedAmountOut: '2' }],
        },
      ],
    },
    executions: {
      findByIntent: async () => ({ executionId: 'exec_existing' }),
      set: async () => undefined,
    },
  };

  const outcome = await startExecution(
    store,
    intent.intentId,
    'plan_123',
    intent.userAddress,
  );

  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.status, 409);
    assert.match(outcome.error, /Execution already exists/);
  }
});
