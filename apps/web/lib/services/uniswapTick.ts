import { createPublicClient, http, type Address, type PublicClient } from 'viem';
import { base } from 'viem/chains';

export const uniswapV3PoolAbi = [
  {
    type: 'function',
    name: 'slot0',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'observationIndex', type: 'uint16' },
      { name: 'observationCardinality', type: 'uint16' },
      { name: 'observationCardinalityNext', type: 'uint16' },
      { name: 'feeProtocol', type: 'uint8' },
      { name: 'unlocked', type: 'bool' },
    ],
  },
] as const;

export function resolveUniswapV3PoolAddress(): Address | null {
  const explicit = process.env.UNISWAP_V3_POOL_ADDRESS?.trim();
  if (explicit) return explicit as Address;

  const basePool = process.env.UNISWAP_V3_BASE_POOL_ADDRESS?.trim();
  if (basePool) return basePool as Address;

  return null;
}

export function createBaseMainnetClient(): PublicClient {
  return createPublicClient({
    chain: base,
    transport: http(process.env.RPC_BASE_MAINNET ?? 'https://mainnet.base.org'),
  }) as unknown as PublicClient;
}

export async function readCurrentUniswapV3Tick(client: PublicClient, poolAddress: Address): Promise<number> {
  const slot0 = await client.readContract({
    address: poolAddress,
    abi: uniswapV3PoolAbi,
    functionName: 'slot0',
  });

  return Number(slot0[1]);
}

export async function maybeReadCurrentUniswapV3Tick(
  options: {
    client?: PublicClient;
    poolAddress?: Address | null;
  } = {},
): Promise<number | null> {
  const poolAddress = options.poolAddress ?? resolveUniswapV3PoolAddress();
  if (!poolAddress) return null;

  const client = options.client ?? createBaseMainnetClient();
  try {
    return await readCurrentUniswapV3Tick(client, poolAddress);
  } catch {
    return null;
  }
}
