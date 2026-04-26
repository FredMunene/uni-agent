import type { Plan, IntentConstraints } from '@uni-agent/shared';

export interface RiskResult {
  passed: boolean;
  errors: string[];
}

export function validatePlan(plan: Plan, constraints: IntentConstraints): RiskResult {
  const errors: string[] = [];

  for (const step of plan.steps) {
    if (step.type === 'swap' && step.slippageBps !== undefined) {
      if (step.slippageBps > constraints.maxSlippageBps) {
        errors.push(
          `Step ${step.stepId}: slippage ${step.slippageBps}bps exceeds max ${constraints.maxSlippageBps}bps`
        );
      }
    }
  }

  const gasUsd = parseFloat(plan.estimatedGasUsd);
  if (gasUsd > 20) {
    errors.push(`Estimated gas $${gasUsd} seems high — double-check RPC and quote`);
  }

  return { passed: errors.length === 0, errors };
}
