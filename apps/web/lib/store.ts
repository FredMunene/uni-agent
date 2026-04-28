import { Redis } from '@upstash/redis';
import type { Intent, Plan, Execution } from '@uni-agent/shared';

const redis = Redis.fromEnv();

const TTL = 3600; // 1 hour — demo data auto-expires
type ExecutionRecord = Execution & { intentId: string };
const executionIntentKey = (intentId: string) => `exec:intent:${intentId}`;

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
    set: async (id: string, exec: ExecutionRecord) => {
      await redis.set(`exec:${id}`, exec, { ex: TTL });
      await redis.set(executionIntentKey(exec.intentId), id, { ex: TTL });
    },
    get: (id: string) =>
      redis.get<ExecutionRecord>(`exec:${id}`),
    findByIntent: async (intentId: string) => {
      const execId = await redis.get<string>(executionIntentKey(intentId));
      if (!execId) return null;
      return redis.get<ExecutionRecord>(`exec:${execId}`);
    },
    update: async (id: string, patch: Partial<Execution>) => {
      const existing = await redis.get<ExecutionRecord>(`exec:${id}`);
      if (existing) {
        const next = { ...existing, ...patch };
        await redis.set(`exec:${id}`, next, { ex: TTL });
        await redis.set(executionIntentKey(existing.intentId), id, { ex: TTL });
      }
    },
  },
};
