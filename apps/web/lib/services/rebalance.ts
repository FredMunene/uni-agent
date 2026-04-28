import type { Position } from '@uni-agent/shared';

export type RebalanceIntentDraft = {
  goal: string;
  amount: string;
};

export function deriveRebalanceIntentDraft(position: Position): RebalanceIntentDraft {
  const baseUnits = BigInt(position.token0Amount || '0');
  const amount = Number(baseUnits) / 1_000_000;
  const normalizedAmount = Number.isFinite(amount) && amount > 0 ? amount.toFixed(2).replace(/\.00$/, '') : '10';

  return {
    goal: `Rebalance my ${position.pool} position`,
    amount: normalizedAmount,
  };
}
