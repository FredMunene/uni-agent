import type { FastifyInstance } from 'fastify';
import { GetQuoteSchema } from '@uni-agent/shared';
import { getSwapQuote } from '../services/quote.js';
import { quoteCache } from '../services/quoteCache.js';

export async function quoteRoutes(app: FastifyInstance) {
  app.post('/quotes', async (req, reply) => {
    const result = GetQuoteSchema.safeParse(req.body);
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() });

    try {
      const quote = await getSwapQuote(result.data);
      quoteCache.set(quote);
      return quote;
    } catch (err) {
      app.log.error(err, 'Quote fetch failed');
      return reply.status(502).send({ error: 'Uniswap quote failed', detail: String(err) });
    }
  });
}
