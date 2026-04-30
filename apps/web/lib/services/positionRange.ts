import type { Plan, Position } from '@uni-agent/shared';

export type PositionRange = {
  tickLower: number;
  tickUpper: number;
  currentTick?: number;
};

type PositionWithRange = Position & {
  tickLower?: number | null;
  tickUpper?: number | null;
  currentTick?: number | null;
};

export function derivePositionRangeFromPlan(plan: Plan): PositionRange | null {
  const addLiquidityStep = plan.steps.find((step) => step.type === 'add_liquidity');
  if (
    !addLiquidityStep ||
    typeof addLiquidityStep.tickLower !== 'number' ||
    typeof addLiquidityStep.tickUpper !== 'number'
  ) {
    return null;
  }

  return {
    tickLower: addLiquidityStep.tickLower,
    tickUpper: addLiquidityStep.tickUpper,
    currentTick: Math.round((addLiquidityStep.tickLower + addLiquidityStep.tickUpper) / 2),
  };
}

export function formatPositionRange(position?: PositionWithRange | null): string | null {
  if (
    !position ||
    typeof position.tickLower !== 'number' ||
    typeof position.tickUpper !== 'number'
  ) {
    return null;
  }

  const currentTick =
    typeof position.currentTick === 'number' ? ` · current ${position.currentTick}` : '';
  return `ticks ${position.tickLower} → ${position.tickUpper}${currentTick}`;
}
