import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { generatePlan } from '@/lib/agent';
import { validatePlan } from '@/lib/services/risk';
import type { Intent } from '@uni-agent/shared';

export function assertPlanningAllowed(intent: Intent): void {
  if (intent.status !== 'created' && intent.status !== 'failed') {
    throw new Error(`Intent not ready for planning: ${intent.status}`);
  }
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const intent = await store.intents.get(id);
  if (!intent) return NextResponse.json({ error: 'Intent not found' }, { status: 404 });

  try {
    assertPlanningAllowed(intent);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Planning not authorized';
    return NextResponse.json({ error: message }, { status: 409 });
  }

  await store.intents.set(id, { ...intent, status: 'planning' });

  try {
    const plans = await generatePlan(intent);
    for (const plan of plans) validatePlan(plan, intent.constraints);
    await store.plans.set(id, plans);
    await store.intents.set(id, { ...intent, status: 'planned' });

    return NextResponse.json({ intentId: id, recommendedPlanId: plans[0]?.planId, plans });
  } catch (err) {
    await store.intents.set(id, { ...intent, status: 'failed' });
    return NextResponse.json({ error: 'Plan generation failed', detail: String(err) }, { status: 500 });
  }
}
