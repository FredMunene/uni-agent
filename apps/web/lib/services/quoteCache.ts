import type { SwapQuote } from '@uni-agent/shared';

// Simple TTL cache for quotes (30s expiry matches Uniswap quote validity)
const cache = new Map<string, { quote: SwapQuote; expiresAt: number }>();

export const quoteCache = {
  set(quote: SwapQuote) {
    cache.set(quote.quoteId, {
      quote,
      expiresAt: Date.now() + 30_000,
    });
  },
  get(id: string): SwapQuote | null {
    const entry = cache.get(id);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      cache.delete(id);
      return null;
    }
    return entry.quote;
  },
};
