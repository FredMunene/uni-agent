import { NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { marketPoolLabel } from '@/lib/marketPresentation';
import { deriveMonitorSnapshot } from '@/lib/services/monitor';
import { positionRegistryAbi } from '@/lib/onchain';

const registryAddress = process.env.POSITION_REGISTRY_ADDRESS ?? process.env.NEXT_PUBLIC_POSITION_REGISTRY_ADDRESS;

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.RPC_BASE_SEPOLIA ?? 'https://sepolia.base.org'),
});

export async function GET(_req: Request, { params }: { params: Promise<{ posId: string }> }) {
  const { posId } = await params;
  if (!registryAddress) {
    return NextResponse.json({ error: 'Position registry address not configured' }, { status: 500 });
  }

  try {
    const position = await client.readContract({
      address: registryAddress as `0x${string}`,
      abi: positionRegistryAbi,
      functionName: 'getPosition',
      args: [posId as `0x${string}`],
    }) as {
      owner: `0x${string}`;
      chainId: bigint;
      token0: `0x${string}`;
      token1: `0x${string}`;
      amount0: bigint;
      amount1: bigint;
      liquidity: bigint;
      createdAt: bigint;
    };

    const snapshot = deriveMonitorSnapshot({
      positionId: posId,
      pool: marketPoolLabel(),
      token0Amount: position.amount0.toString(),
      token1Amount: position.amount1.toString(),
      liquidity: position.liquidity.toString(),
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
    const message = error instanceof Error ? error.message : 'Position not found';
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
