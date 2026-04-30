import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { generatePlan } from '@/lib/agent';
import { validatePlan } from '@/lib/services/risk';
import { assertPlanningAllowed, computePlanHash } from '../../../../../../lib/services/planHash';
import type { Intent } from '@uni-agent/shared';

export const maxDuration = 60;

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
    const plansWithHashes = plans.map((plan) => ({
      ...plan,
      planHash: computePlanHash(plan),
    }));
    await store.plans.set(id, plansWithHashes as any);
    await store.intents.set(id, { ...intent, status: 'planned' });

    const riskPreferredStrategy = intent.risk === 'low'
      ? 'conservative'
      : intent.risk === 'high'
        ? 'aggressive'
        : 'balanced';
    const recommended = plansWithHashes.find(p => p.strategy === riskPreferredStrategy)
      ?? plansWithHashes.find(p => p.strategy === 'balanced')
      ?? plansWithHashes[0];
    console.log(`[plan] ${id} generated ${plansWithHashes.length} strategies, recommended=${recommended?.planId}`);
    return NextResponse.json({ intentId: id, recommendedPlanId: recommended?.planId, plans: plansWithHashes });
  } catch (err) {
    console.error(`[plan] ${id} failed:`, err);
    await store.intents.set(id, { ...intent, status: 'failed' });
    return NextResponse.json({ error: 'Plan generation failed', detail: String(err) }, { status: 500 });
  }
}
