import test from 'node:test';
import assert from 'node:assert/strict';

import { store } from './store';

test('store.executions can find an execution by predicted position id', async () => {
  const positionId = '0xabc123';
  await store.executions.set('exec_test_position', {
    executionId: 'exec_test_position',
    intentId: 'int_test_position',
    planId: 'plan_test_position',
    status: 'submitted',
    steps: [],
    createdAt: new Date().toISOString(),
    _positionMeta: {
      positionId,
      tickLower: -1000,
      tickUpper: 1000,
      currentTick: 0,
    },
  } as any);

  const execution = await store.executions.findByPosition?.(positionId);
  assert.equal(execution?.executionId, 'exec_test_position');
});
