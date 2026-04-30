import { NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { marketPoolLabel } from '@/lib/marketPresentation';
import { deriveMonitorSnapshot } from '@/lib/services/monitor';
import { maybeReadCurrentUniswapV3Tick } from '@/lib/services/uniswapTick';
import { positionRegistryAbi } from '@/lib/onchain';
import { store } from '@/lib/store';

const registryAddress = process.env.POSITION_REGISTRY_ADDRESS ?? process.env.NEXT_PUBLIC_POSITION_REGISTRY_ADDRESS;

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.RPC_BASE_SEPOLIA ?? 'https://sepolia.base.org'),
});

type ExecutionWithMeta = {
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

type RegistryPosition = {
  owner: `0x${string}`;
  chainId: bigint;
  token0: `0x${string}`;
  token1: `0x${string}`;
  amount0: bigint;
  amount1: bigint;
  liquidity: bigint;
  createdAt: bigint;
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

export async function resolveCurrentTick(execution: ExecutionWithMeta): Promise<number | undefined> {
  const liveTick = await maybeReadCurrentUniswapV3Tick();
  if (typeof liveTick === 'number') return liveTick;
  return execution._positionMeta?.currentTick;
}

export async function GET(_req: Request, { params }: { params: Promise<{ posId: string }> }) {
  const { posId } = await params;
  const execution = await store.executions.findByPosition?.(posId) as ExecutionWithMeta | null | undefined;

  if (!registryAddress) {
    if (execution?._positionMeta?.positionId === posId) {
      return NextResponse.json(buildStoredMonitorFallback(posId, execution));
    }
    return NextResponse.json({ error: 'Position registry address not configured' }, { status: 500 });
  }

  try {
    const currentTick = execution ? await resolveCurrentTick(execution) : undefined;
    const position = await client.readContract({
      address: registryAddress as `0x${string}`,
      abi: positionRegistryAbi,
      functionName: 'getPosition',
      args: [posId as `0x${string}`],
    }) as RegistryPosition;

    const snapshot = deriveMonitorSnapshot({
      positionId: posId,
      pool: marketPoolLabel(),
      token0Amount: position.amount0.toString(),
      token1Amount: position.amount1.toString(),
      liquidity: position.liquidity.toString(),
      currentTick,
      tickLower: execution?._positionMeta?.tickLower,
      tickUpper: execution?._positionMeta?.tickUpper,
    });

    return NextResponse.json({
      posId,
      snapshot,
      position: {
        owner: position.owner,
        chainId: position.chainId.toString(),
        token0: position.token0,
        token1: position.token1,
        amount0: position.amount0.toString(),
        amount1: position.amount1.toString(),
        liquidity: position.liquidity.toString(),
        createdAt: position.createdAt.toString(),
      },
    });
  } catch (error) {
    if (execution?._positionMeta?.positionId === posId) {
      return NextResponse.json(buildStoredMonitorFallback(posId, execution));
    }
    const message = error instanceof Error ? error.message : 'Position not found';
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
