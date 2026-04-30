import { Redis } from '@upstash/redis';
import type { Intent, Plan, Execution } from '@uni-agent/shared';

const TTL = 3600; // 1 hour — demo data auto-expires
type ExecutionRecord = Execution & { intentId: string };
const executionIntentKey = (intentId: string) => `exec:intent:${intentId}`;
const executionPositionKey = (positionId: string) => `exec:position:${positionId}`;

type MemoryRecord<T> = {
  value: T;
  expiresAt: number;
};

const memory = {
  intents: new Map<string, MemoryRecord<Intent>>(),
  plans: new Map<string, MemoryRecord<Plan[]>>(),
  executions: new Map<string, MemoryRecord<ExecutionRecord>>(),
  executionByIntent: new Map<string, MemoryRecord<string>>(),
  executionByPosition: new Map<string, MemoryRecord<string>>(),
};

const hasRedisEnv = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const redis = hasRedisEnv ? Redis.fromEnv() : null;

function nowPlusTtl(): number {
  return Date.now() + TTL * 1000;
}

function getMemory<T>(bucket: Map<string, MemoryRecord<T>>, key: string): T | null {
  const entry = bucket.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    bucket.delete(key);
    return null;
  }
  return entry.value;
}

function setMemory<T>(bucket: Map<string, MemoryRecord<T>>, key: string, value: T): void {
  bucket.set(key, { value, expiresAt: nowPlusTtl() });
}

async function write<T>(key: string, value: T, memoryBucket: Map<string, MemoryRecord<T>>) {
  if (redis) {
    try {
      await redis.set(key, value, { ex: TTL });
      return;
    } catch {
      // Fall through to memory for local dev / transient upstream failures.
    }
  }
  setMemory(memoryBucket, key, value);
}

async function read<T>(key: string, memoryBucket: Map<string, MemoryRecord<T>>): Promise<T | null> {
  if (redis) {
    try {
      const value = await redis.get<T>(key);
      if (value !== null && value !== undefined) return value;
    } catch {
      // Fall through to memory for local dev / transient upstream failures.
    }
  }
  return getMemory(memoryBucket, key);
}

export const store = {
  intents: {
    set: (id: string, intent: Intent) => write(`intent:${id}`, intent, memory.intents),
    get: (id: string) => read(`intent:${id}`, memory.intents),
  },
  plans: {
    set: (intentId: string, plans: Plan[]) => write(`plans:${intentId}`, plans, memory.plans),
    get: async (intentId: string) => (await read<Plan[]>(`plans:${intentId}`, memory.plans)) ?? [],
  },
  executions: {
    set: async (id: string, exec: ExecutionRecord) => {
      await write(`exec:${id}`, exec, memory.executions);
      await write(executionIntentKey(exec.intentId), id, memory.executionByIntent);
      const positionId = (exec as { _positionMeta?: { positionId?: string } })._positionMeta?.positionId;
      if (positionId) {
        await write(executionPositionKey(positionId), id, memory.executionByPosition);
      }
    },
    get: (id: string) => read(`exec:${id}`, memory.executions),
    findByIntent: async (intentId: string) => {
      const execId = (await read<string>(executionIntentKey(intentId), memory.executionByIntent)) ?? null;
      if (!execId) return null;
      return read<ExecutionRecord>(`exec:${execId}`, memory.executions);
    },
    findByPosition: async (positionId: string) => {
      const execId = (await read<string>(executionPositionKey(positionId), memory.executionByPosition)) ?? null;
      if (!execId) return null;
      return read<ExecutionRecord>(`exec:${execId}`, memory.executions);
    },
    update: async (id: string, patch: Partial<Execution>) => {
      const existing = await read<ExecutionRecord>(`exec:${id}`, memory.executions);
      if (existing) {
        const next = { ...existing, ...patch };
        await write(`exec:${id}`, next, memory.executions);
        await write(executionIntentKey(existing.intentId), id, memory.executionByIntent);
        const positionId = (existing as { _positionMeta?: { positionId?: string } })._positionMeta?.positionId;
        if (positionId) {
          await write(executionPositionKey(positionId), id, memory.executionByPosition);
        }
      }
    },
  },
};
