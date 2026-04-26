import { Redis } from '@upstash/redis';
import type { Intent, Plan, Execution } from '@uni-agent/shared';

const redis = Redis.fromEnv();

const TTL = 3600; // 1 hour — demo data auto-expires

export const store = {
  intents: {
    set: (id: string, intent: Intent) =>
      redis.set(`intent:${id}`, intent, { ex: TTL }),
    get: (id: string) =>
      redis.get<Intent>(`intent:${id}`),
  },
  plans: {
    set: (intentId: string, plans: Plan[]) =>
      redis.set(`plans:${intentId}`, plans, { ex: TTL }),
    get: (intentId: string) =>
      redis.get<Plan[]>(`plans:${intentId}`).then((p) => p ?? []),
  },
  executions: {
    set: (id: string, exec: Execution) =>
      redis.set(`exec:${id}`, exec, { ex: TTL }),
    get: (id: string) =>
      redis.get<Execution>(`exec:${id}`),
    update: async (id: string, patch: Partial<Execution>) => {
      const existing = await redis.get<Execution>(`exec:${id}`);
      if (existing) await redis.set(`exec:${id}`, { ...existing, ...patch }, { ex: TTL });
    },
  },
};
