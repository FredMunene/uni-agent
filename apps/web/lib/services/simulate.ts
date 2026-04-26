import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { quoteCache } from './quoteCache';

interface SimulateInput {
  chainId: number;
  userAddress: string;
  swapQuoteId: string;
  lpParams: object;
}

interface SimulateResult {
  success: boolean;
  gasSwap: string;
  gasLp: string;
  gasTotal: string;
  gasUsd: string;
  error?: string;
}

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.RPC_BASE_SEPOLIA ?? 'https://sepolia.base.org'),
});

export async function simulateBundle(input: SimulateInput): Promise<SimulateResult> {
  const quote = quoteCache.get(input.swapQuoteId);
  if (!quote) {
    return {
      success: false,
      gasSwap: '180000',
      gasLp: '160000',
      gasTotal: '340000',
      gasUsd: '0.00',
      error: 'Quote not found or expired before simulation',
    };
  }

  // Estimate gas for swap (~180k) + LP (~160k) + overhead
  const gasSwap = 180_000n;
  const gasLp = 160_000n;
  const gasTotal = gasSwap + gasLp;

  try {
    const gasPrice = await client.getGasPrice();
    // ETH price approximation — replace with a price oracle call in production
    const ethPriceUsd = 3800;
    const gasCostEth = Number(gasTotal * gasPrice) / 1e18;
    const gasUsd = (gasCostEth * ethPriceUsd).toFixed(2);

    return {
      success: true,
      gasSwap: gasSwap.toString(),
      gasLp: gasLp.toString(),
      gasTotal: gasTotal.toString(),
      gasUsd,
    };
  } catch {
    return {
      success: false,
      gasSwap: gasSwap.toString(),
      gasLp: gasLp.toString(),
      gasTotal: gasTotal.toString(),
      gasUsd: '1.50',
      error: 'Could not fetch live gas price — using estimate',
    };
  }
}
