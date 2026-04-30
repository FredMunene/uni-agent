import { nanoid } from 'nanoid';
import { verifyMessage } from 'viem';
import type { Intent } from '@uni-agent/shared';

import { computePlanHash } from './planHash';
import { assertExecutionAuthorized, buildExecutionAuthorizationMessage } from './executionAuth';

type PlanLike = {
  planId: string;
  planHash?: string;
  steps: ReadonlyArray<{ type: string }>;
};

type StoreLike = {
  intents: {
    get(id: string): Promise<Intent | null | undefined>;
    set(id: string, intent: Intent): Promise<unknown>;
  };
  plans: {
    get(intentId: string): Promise<PlanLike[]>;
  };
  executions: {
    findByIntent?(intentId: string): Promise<{ status?: string } | null>;
    set(id: string, execution: unknown): Promise<unknown>;
  };
};

const PLAN_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;

export async function startExecution(
  storeApi: StoreLike,
  intentId: string,
  planId: string,
  userAddress: string,
  submittedPlanHash: string,
  permit2Signature: string,
) {
  const intent = await storeApi.intents.get(intentId);
  if (!intent) return { ok: false as const, status: 404, error: 'Intent not found' };

  try {
    assertExecutionAuthorized(intent, userAddress);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Execution not authorized';
    const status = message.includes('owner mismatch') ? 403 : 409;
    return { ok: false as const, status, error: message };
  }

  const plans = await storeApi.plans.get(intentId);
  const plan = plans?.find((p) => p.planId === planId);
  if (!plan) return { ok: false as const, status: 404, error: 'Plan not found' };

  if (!submittedPlanHash) {
    return { ok: false as const, status: 400, error: 'Missing plan hash' };
  }

  if (!permit2Signature) {
    return { ok: false as const, status: 400, error: 'Missing permit2 signature' };
  }

  if (!PLAN_HASH_PATTERN.test(submittedPlanHash)) {
    return { ok: false as const, status: 400, error: 'Invalid plan hash format' };
  }

  if (!plan.planHash || computePlanHash(plan as any) !== plan.planHash) {
    return { ok: false as const, status: 409, error: 'Plan integrity mismatch' };
  }

  if (submittedPlanHash !== plan.planHash) {
    return { ok: false as const, status: 409, error: 'Submitted plan hash mismatch' };
  }

  const executionMessage = buildExecutionAuthorizationMessage(intentId, planId, plan.planHash, userAddress);
  let signatureValid = false;
  try {
    signatureValid = await verifyMessage({
      address: userAddress as `0x${string}`,
      message: executionMessage,
      signature: permit2Signature as `0x${string}`,
    });
  } catch {
    return { ok: false as const, status: 400, error: 'Invalid permit2 signature' };
  }

  if (!signatureValid) {
    return { ok: false as const, status: 403, error: 'Permit2 signature mismatch' };
  }

  if (storeApi.executions.findByIntent) {
    const existing = await storeApi.executions.findByIntent(intentId);
    if (existing && existing.status !== 'failed') {
      return { ok: false as const, status: 409, error: 'Execution already exists for intent' };
    }
  }

  const executionId = `exec_${nanoid(8)}`;
  const executionRecord = {
    executionId,
    planId,
    intentId,
    planHash: plan.planHash,
    status: 'submitted',
    steps: plan.steps.map((s: any) => ({ type: s.type, status: 'pending' as const })),
    createdAt: new Date().toISOString(),
    _plan: plan,
  };

  await storeApi.executions.set(executionId, executionRecord);

  try {
    await storeApi.intents.set(intentId, { ...intent, status: 'executing' });
  } catch (err) {
    await storeApi.executions.set(executionId, {
      ...executionRecord,
      status: 'failed',
      error: err instanceof Error ? err.message : 'Failed to persist execution state',
    });
    return { ok: false as const, status: 500, error: 'Failed to persist execution state' };
  }

  return { ok: true as const, executionId };
}
