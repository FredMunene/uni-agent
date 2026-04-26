import { UNISWAP_API_BASE } from '@uni-agent/shared';
import type { SwapQuote } from '@uni-agent/shared';
import { nanoid } from 'nanoid';
import { QUOTE_CHAIN_ID } from '@uni-agent/shared';

interface UniswapQuoteRequest {
  tokenInChainId: number;
  tokenOutChainId: number;
  tokenIn: string;
  tokenOut: string;
  amount: string;
  type: 'EXACT_INPUT' | 'EXACT_OUTPUT';
  swapper?: string;
}

export async function getSwapQuote(params: {
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  recipient?: string;
}): Promise<SwapQuote> {
  const apiKey = process.env.UNISWAP_API_KEY;
  if (!apiKey) throw new Error('UNISWAP_API_KEY not set');
  if (params.chainId !== QUOTE_CHAIN_ID) {
    throw new Error(`Unsupported quote chain ${params.chainId}; expected ${QUOTE_CHAIN_ID}`);
  }

  const body: UniswapQuoteRequest = {
    tokenInChainId: params.chainId,
    tokenOutChainId: params.chainId,
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    amount: params.amountIn,
    type: 'EXACT_INPUT',
    swapper: params.recipient,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(`${UNISWAP_API_BASE}/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Uniswap quote failed ${res.status}: ${text}`);
  }

  const data = await res.json() as {
    quote: {
      output: { amount: string };
      input: { amount: string };
      gasUseEstimate: string;
      gasFeeUSD: string;
      priceImpact: number;
      quoteId: string;
    };
    permitData?: unknown;
  };

  const validUntil = new Date(Date.now() + 30_000).toISOString();

  return {
    quoteId: data.quote.quoteId ?? nanoid(),
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    amountIn: data.quote.input.amount,
    amountOut: data.quote.output.amount,
    gasEstimate: data.quote.gasUseEstimate,
    priceImpactBps: Math.round(data.quote.priceImpact * 100),
    validUntil,
    permit2: data.permitData,
  };
}
