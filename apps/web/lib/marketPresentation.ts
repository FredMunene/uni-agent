import { ACTIVE_MARKET } from './markets';

export function marketPoolLabel(): string {
  return ACTIVE_MARKET.label;
}

export function marketAmountLabel(): string {
  return `Amount (${ACTIVE_MARKET.inputTokenSymbol})`;
}

export function marketIntentPlaceholder(): string {
  return `What do you want to do? e.g. Earn yield on my ${ACTIVE_MARKET.inputTokenSymbol} with low risk`;
}

export function buildDefaultGoal(amount: string, risk: string): string {
  return `Earn yield on ${amount} ${ACTIVE_MARKET.inputTokenSymbol} with ${risk} risk in ${marketPoolLabel()}`;
}
