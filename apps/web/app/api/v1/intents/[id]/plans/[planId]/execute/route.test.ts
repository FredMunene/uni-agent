import test from 'node:test';
import assert from 'node:assert/strict';
import type { Intent } from '@uni-agent/shared';
import { assertExecutionAuthorized, startExecution } from './route';
import { computePlanHash } from '../../../plan/route';

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

function makeStoredPlan(intentId: string, amountIn = '1') {
  const plan = {
    planId: 'plan_123',
    intentId,
    strategy: 'balanced',
    label: 'USDC/WETH LP on Base',
    estimatedNetApyBps: 480,
    estimatedGasUsd: '1.50',
    riskScore: 'low',
    steps: [
      {
        stepId: 'step_001',
        type: 'swap',
        provider: 'uniswap',
        chainId: 84532,
        fromToken: 'USDC',
        toToken: 'WETH',
        amountIn,
        estimatedAmountOut: '2',
        slippageBps: 50,
      },
    ],
    risk: { maxLossUsd: '2.50', notes: 'stable' },
    createdAt: '2026-04-28T00:00:00.000Z',
  } as const;

  return {
    ...plan,
    planHash: computePlanHash(plan as any),
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
        makeStoredPlan(intent.intentId),
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
    makeStoredPlan(intent.intentId).planHash,
  );

  assert.equal(outcome.ok, true);
  assert.equal(updatedIntents.at(-1)?.status, 'executing');
  assert.equal(Object.keys(executions).length, 1);

  const execution = Object.values(executions)[0] as { intentId?: string; planId?: string; status?: string };
  assert.equal(execution.intentId, intent.intentId);
  assert.equal(execution.planId, 'plan_123');
  assert.equal(execution.status, 'submitted');
});

test('startExecution rejects a plan whose contents do not match its hash', async () => {
  const intent = makeIntent();
  const tamperedPlan = {
    ...makeStoredPlan(intent.intentId),
    steps: [
      {
        stepId: 'step_001',
        type: 'swap',
        provider: 'uniswap',
        chainId: 84532,
        fromToken: 'USDC',
        toToken: 'WETH',
        amountIn: '99',
        estimatedAmountOut: '2',
        slippageBps: 50,
      },
    ],
  };
  const store = {
    intents: {
      get: async () => intent,
      set: async () => undefined,
    },
    plans: {
      get: async () => [tamperedPlan],
    },
    executions: {
      set: async () => undefined,
    },
  };

  const outcome = await startExecution(
    store,
    intent.intentId,
    'plan_123',
    intent.userAddress,
    tamperedPlan.planHash,
  );

  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.status, 409);
    assert.match(outcome.error, /Plan integrity mismatch/);
  }
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
        makeStoredPlan(intent.intentId),
      ],
    },
    executions: {
      findByIntent: async () => ({ status: 'submitted' }),
      set: async () => undefined,
    },
  };

  const outcome = await startExecution(
    store,
    intent.intentId,
    'plan_123',
    intent.userAddress,
    makeStoredPlan(intent.intentId).planHash,
  );

  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.status, 409);
    assert.match(outcome.error, /Execution already exists/);
  }
});

test('startExecution rejects a submitted plan hash that does not match the stored hash', async () => {
  const intent = makeIntent();
  const store = {
    intents: {
      get: async () => intent,
      set: async () => undefined,
    },
    plans: {
      get: async () => [
        makeStoredPlan(intent.intentId),
      ],
    },
    executions: {
      set: async () => undefined,
    },
  };

  const outcome = await startExecution(
    store,
    intent.intentId,
    'plan_123',
    intent.userAddress,
    '0x1234',
  );

  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.status, 409);
    assert.match(outcome.error, /Submitted plan hash mismatch/);
  }
});

test('startExecution marks the execution failed when persisting intent state fails', async () => {
  const intent = makeIntent();
  const executions: Record<string, any> = {};
  let executionId = '';
  const store = {
    intents: {
      get: async () => intent,
      set: async () => {
        throw new Error('redis write failed');
      },
    },
    plans: {
      get: async () => [
        makeStoredPlan(intent.intentId),
      ],
    },
    executions: {
      set: async (id: string, execution: unknown) => {
        executionId = id;
        executions[id] = execution;
      },
      findByIntent: async () => null,
    },
  };

  const outcome = await startExecution(
    store,
    intent.intentId,
    'plan_123',
    intent.userAddress,
    makeStoredPlan(intent.intentId).planHash,
  );

  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.status, 500);
    assert.match(outcome.error, /Failed to persist execution state/);
  }

  assert.ok(executionId);
  assert.equal(executions[executionId]?.status, 'failed');
  assert.match(String(executions[executionId]?.error), /redis write failed/);
});
