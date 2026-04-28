import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import type { Intent } from '@uni-agent/shared';
import { ExecuteSchema } from '@uni-agent/shared';
import { store } from '@/lib/store';

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

export async function POST(req: Request, { params }: { params: Promise<{ id: string; planId: string }> }) {
  const { id, planId } = await params;
  const body = await req.json();
  const result = ExecuteSchema.safeParse(body);
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 });

  const intent = await store.intents.get(id);
  if (!intent) return NextResponse.json({ error: 'Intent not found' }, { status: 404 });

  try {
    assertExecutionAuthorized(intent, result.data.userAddress);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Execution not authorized';
    const status = message.includes('owner mismatch') ? 403 : 409;
    return NextResponse.json({ error: message }, { status });
  }

  const plans = await store.plans.get(id);
  const plan = plans?.find((p) => p.planId === planId);
  if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

  const executionId = `exec_${nanoid(8)}`;
  await store.executions.set(executionId, {
    executionId,
    planId,
    status: 'submitted',
    steps: plan.steps.map((s) => ({ type: s.type, status: 'pending' as const })),
    createdAt: new Date().toISOString(),
    _plan: plan,
  } as any);

  return NextResponse.json({ executionId, status: 'submitted' }, { status: 202 });
}
