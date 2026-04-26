import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { intentRoutes } from './routes/intents.js';
import { quoteRoutes } from './routes/quotes.js';
import { agentRoutes } from './routes/agent.js';

const server = Fastify({ logger: true });

const corsOrigin = process.env.CORS_ORIGIN ?? process.env.WEB_ORIGIN ?? '*';
await server.register(cors, {
  origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((value) => value.trim()).filter(Boolean),
});

server.get('/health', async () => ({ ok: true }));

await server.register(intentRoutes, { prefix: '/v1' });
await server.register(quoteRoutes, { prefix: '/v1' });
await server.register(agentRoutes, { prefix: '/v1' });

const port = Number(process.env.PORT ?? 3001);
await server.listen({ port, host: '0.0.0.0' });
console.log(`API running on http://localhost:${port}`);
