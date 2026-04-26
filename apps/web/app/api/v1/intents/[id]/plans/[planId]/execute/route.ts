import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { ExecuteSchema } from '@uni-agent/shared';
import { store } from '@/lib/store';

export async function POST(req: Request, { params }: { params: Promise<{ id: string; planId: string }> }) {
  const { id, planId } = await params;
  const body = await req.json();
  const result = ExecuteSchema.safeParse(body);
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 });

  const plans = store.plans.get(id);
  const plan = plans?.find((p) => p.planId === planId);
  if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

  const executionId = `exec_${nanoid(8)}`;
  store.executions.set(executionId, {
    executionId,
    planId,
    status: 'submitted',
    steps: plan.steps.map((s) => ({ type: s.type, status: 'pending' as const })),
    createdAt: new Date().toISOString(),
    // store plan snapshot for polling simulation
    _plan: plan,
  } as any);

  return NextResponse.json({ executionId, status: 'submitted' }, { status: 202 });
}
