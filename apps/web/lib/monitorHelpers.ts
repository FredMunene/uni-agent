import { baseSepolia } from 'viem/chains';
import { marketPoolLabel } from '@/lib/marketPresentation';
import { deriveMonitorSnapshot } from '@/lib/services/monitor';
import { maybeReadCurrentUniswapV3Tick } from '@/lib/services/uniswapTick';

export type ExecutionWithMeta = {
  _plan?: Array<{
    type?: string;
    token0AmountIn?: string;
    token1AmountIn?: string;
  }>;
  _positionMeta?: {
    positionId?: string;
    tickLower?: number;
    tickUpper?: number;
    currentTick?: number;
  };
};

export function buildStoredMonitorFallback(posId: string, execution: ExecutionWithMeta) {
  const planSteps = Array.isArray(execution._plan) ? execution._plan : [];
  const addLiquidityStep = planSteps.find((step) => step.type === 'add_liquidity');
  const positionMeta = execution._positionMeta;

  const snapshot = deriveMonitorSnapshot({
    positionId: posId,
    pool: marketPoolLabel(),
    token0Amount: addLiquidityStep?.token0AmountIn ?? '0',
    token1Amount: addLiquidityStep?.token1AmountIn ?? '0',
    liquidity: '1',
    currentTick: positionMeta?.currentTick,
    tickLower: positionMeta?.tickLower,
    tickUpper: positionMeta?.tickUpper,
  });

  return {
    posId,
    monitorSource: 'stored_fallback' as const,
    snapshot,
    position: {
      owner: null,
      chainId: baseSepolia.id.toString(),
      token0: null,
      token1: null,
      amount0: addLiquidityStep?.token0AmountIn ?? '0',
      amount1: addLiquidityStep?.token1AmountIn ?? '0',
      liquidity: '1',
      createdAt: null,
    },
  };
}

export async function resolveCurrentTick(execution: ExecutionWithMeta): Promise<{
  currentTick: number | undefined;
  monitorSource: 'live_tick' | 'stored_tick' | 'unknown';
}> {
  const liveTick = await maybeReadCurrentUniswapV3Tick();
  if (typeof liveTick === 'number') {
    return { currentTick: liveTick, monitorSource: 'live_tick' };
  }

  if (typeof execution._positionMeta?.currentTick === 'number') {
    return { currentTick: execution._positionMeta.currentTick, monitorSource: 'stored_tick' };
  }

  return { currentTick: undefined, monitorSource: 'unknown' };
}
