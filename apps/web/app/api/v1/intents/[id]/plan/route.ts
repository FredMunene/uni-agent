import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { generatePlan } from '@/lib/agent';
import { validatePlan } from '@/lib/services/risk';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const intent = store.intents.get(id);
  if (!intent) return NextResponse.json({ error: 'Intent not found' }, { status: 404 });

  store.intents.set(id, { ...intent, status: 'planning' });

  try {
    const plans = await generatePlan(intent);

    for (const plan of plans) {
      validatePlan(plan, intent.constraints);
    }

    store.plans.set(id, plans);
    store.intents.set(id, { ...intent, status: 'planned' });

    return NextResponse.json({
      intentId: id,
      recommendedPlanId: plans[0]?.planId,
      plans,
    });
  } catch (err) {
    store.intents.set(id, { ...intent, status: 'failed' });
    return NextResponse.json(
      { error: 'Plan generation failed', detail: String(err) },
      { status: 500 }
    );
  }
}
