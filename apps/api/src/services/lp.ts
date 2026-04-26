import type { LpParams } from '@uni-agent/shared';
import { FULL_RANGE_TICKS } from '@uni-agent/shared';

interface LpParamsInput {
  chainId: number;
  token0: string;
  token1: string;
  fee: number;
  amount0Desired: string;
  amount1Desired: string;
  fullRange?: boolean;
}

export async function getLpParams(input: LpParamsInput): Promise<LpParams> {
  // Ensure token ordering (Uniswap v4 requires token0 < token1 by address)
  let token0 = input.token0.toLowerCase();
  let token1 = input.token1.toLowerCase();
  let amount0 = input.amount0Desired;
  let amount1 = input.amount1Desired;

  if (token0 > token1) {
    [token0, token1] = [token1, token0];
    [amount0, amount1] = [amount1, amount0];
  }

  const tickLower = input.fullRange ? FULL_RANGE_TICKS.tickLower : -887220;
  const tickUpper = input.fullRange ? FULL_RANGE_TICKS.tickUpper : 887220;

  // Apply 0.5% min amounts (same as 50bps slippage tolerance)
  const slippage = 50n;
  const bps = 10000n;
  const amount0Min = ((BigInt(amount0) * (bps - slippage)) / bps).toString();
  const amount1Min = ((BigInt(amount1) * (bps - slippage)) / bps).toString();

  return {
    token0,
    token1,
    fee: input.fee,
    tickLower,
    tickUpper,
    amount0Desired: amount0,
    amount1Desired: amount1,
    amount0Min,
    amount1Min,
  };
}
