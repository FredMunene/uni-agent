import test from 'node:test';
import assert from 'node:assert/strict';
import { getSwapQuote } from './quote';

const originalFetch = globalThis.fetch;

test('getSwapQuote falls back when Uniswap returns no quotes', async () => {
  globalThis.fetch = (async () => ({
    ok: false,
    status: 404,
    text: async () => '{"errorCode":"ResourceNotFound","detail":"No quotes available"}',
  })) as unknown as typeof fetch;

  process.env.UNISWAP_API_KEY = 'demo';

  const quote = await getSwapQuote({
    chainId: 8453,
    tokenIn: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    tokenOut: '0x4200000000000000000000000000000000000006',
    amountIn: '50000000',
    recipient: '0x1111111111111111111111111111111111111111',
  });

  assert.equal(quote.amountIn, '50000000');
  assert.match(quote.quoteId, /^fallback_/);
  assert.equal(quote.gasEstimate, '180000');
  assert.equal(quote.priceImpactBps, 25);
  assert.equal(quote.permit2 && typeof quote.permit2, 'object');
});

test.after(() => {
  globalThis.fetch = originalFetch;
});
