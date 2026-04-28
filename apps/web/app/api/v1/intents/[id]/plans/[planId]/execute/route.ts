import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import type { Intent } from '@uni-agent/shared';
import { ExecuteSchema } from '@uni-agent/shared';
import { store } from '@/lib/store';
import { computePlanHash } from '../../../plan/route';

type PlanLike = {
  planId: string;
  planHash?: string;
  steps: ReadonlyArray<{ type: string }>;
};

const PLAN_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;

export function assertExecutionAuthorized(
  intent: Intent,
  userAddress: string,
): void {
  if (intent.userAddress.toLowerCase() !== userAddress.toLowerCase()) {
    throw new Error('Intent owner mismatch');
  }

  if (intent.status !== 'planned') {
    throw new Error(`Intent not ready for execution: ${intent.status}`);
  }
}

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

export async function startExecution(
  storeApi: StoreLike,
  intentId: string,
  planId: string,
  userAddress: string,
  submittedPlanHash: string,
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

  if (!PLAN_HASH_PATTERN.test(submittedPlanHash)) {
    return { ok: false as const, status: 400, error: 'Invalid plan hash format' };
  }

  if (!plan.planHash || computePlanHash(plan as any) !== plan.planHash) {
    return { ok: false as const, status: 409, error: 'Plan integrity mismatch' };
  }

  if (submittedPlanHash !== plan.planHash) {
    return { ok: false as const, status: 409, error: 'Submitted plan hash mismatch' };
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

export async function POST(req: Request, { params }: { params: Promise<{ id: string; planId: string }> }) {
  const { id, planId } = await params;
  const body = await req.json();
  const result = ExecuteSchema.safeParse(body);
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 });

  const outcome = await startExecution(
    store,
    id,
    planId,
    result.data.userAddress,
    typeof body.planHash === 'string' ? body.planHash : '',
  );
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }

  return NextResponse.json({ executionId: outcome.executionId, status: 'submitted' }, { status: 202 });
}
