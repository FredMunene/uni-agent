import { NextResponse } from 'next/server';
import { keccak256, stringToHex } from 'viem';
import { store } from '@/lib/store';
import { generatePlan } from '@/lib/agent';
import { validatePlan } from '@/lib/services/risk';
import type { Intent, Plan } from '@uni-agent/shared';

export const maxDuration = 60;

export function assertPlanningAllowed(intent: Intent): void {
  if (intent.status !== 'created' && intent.status !== 'failed') {
    throw new Error(`Intent not ready for planning: ${intent.status}`);
  }
}

export function computePlanHash(plan: Plan): string {
  const fingerprint = {
    intentId: plan.intentId,
    strategy: plan.strategy,
    label: plan.label,
    estimatedNetApyBps: plan.estimatedNetApyBps,
    estimatedGasUsd: plan.estimatedGasUsd,
    riskScore: plan.riskScore,
    steps: plan.steps.map((step) => ({
      stepId: step.stepId,
      type: step.type,
      provider: step.provider,
      chainId: step.chainId,
      fromToken: step.fromToken ?? null,
      toToken: step.toToken ?? null,
      amountIn: step.amountIn ?? null,
      estimatedAmountOut: step.estimatedAmountOut ?? null,
      slippageBps: step.slippageBps ?? null,
      token0AmountIn: step.token0AmountIn ?? null,
      token1AmountIn: step.token1AmountIn ?? null,
      tickLower: step.tickLower ?? null,
      tickUpper: step.tickUpper ?? null,
    })),
    risk: {
      maxLossUsd: plan.risk.maxLossUsd,
      notes: plan.risk.notes,
    },
    createdAt: plan.createdAt,
  };

  return keccak256(stringToHex(JSON.stringify(fingerprint)));
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
    const plansWithHashes = plans.map((plan) => ({
      ...plan,
      planHash: computePlanHash(plan),
    }));
    await store.plans.set(id, plansWithHashes as any);
    await store.intents.set(id, { ...intent, status: 'planned' });

    const recommended = plansWithHashes.find(p => p.strategy === 'balanced') ?? plansWithHashes[0];
    console.log(`[plan] ${id} generated ${plansWithHashes.length} strategies, recommended=${recommended?.planId}`);
    return NextResponse.json({ intentId: id, recommendedPlanId: recommended?.planId, plans: plansWithHashes });
  } catch (err) {
    console.error(`[plan] ${id} failed:`, err);
    await store.intents.set(id, { ...intent, status: 'failed' });
    return NextResponse.json({ error: 'Plan generation failed', detail: String(err) }, { status: 500 });
  }
}
