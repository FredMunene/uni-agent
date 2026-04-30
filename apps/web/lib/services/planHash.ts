import { keccak256, stringToHex } from 'viem';
import type { Intent, Plan } from '@uni-agent/shared';

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
