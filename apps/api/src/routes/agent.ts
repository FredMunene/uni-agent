import type { FastifyInstance } from 'fastify';
import { tools } from '../agent/tools.js';

export async function agentRoutes(app: FastifyInstance) {
  // Returns the Anthropic-compatible tool schema for this agent
  // Useful for other agents or frontends that want to integrate
  app.get('/agent/tool-schema', async () => ({
    name: 'agentic_stablecoin_router',
    description:
      'Creates, plans, and executes stablecoin LP strategies via Uniswap on Base. ' +
      'Converts a natural language goal into a swap → add_liquidity execution plan.',
    tools,
  }));
}
