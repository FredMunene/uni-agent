import type { Intent, Plan, Execution } from '@uni-agent/shared';

// Module-level Maps persist across requests in the same Vercel function instance
const intents = new Map<string, Intent>();
const plans = new Map<string, Plan[]>();
const executions = new Map<string, Execution>();

export const store = {
  intents: {
    set: (id: string, intent: Intent) => intents.set(id, intent),
    get: (id: string) => intents.get(id),
  },
  plans: {
    set: (intentId: string, p: Plan[]) => plans.set(intentId, p),
    get: (intentId: string) => plans.get(intentId) ?? [],
  },
  executions: {
    set: (id: string, exec: Execution) => executions.set(id, exec),
    get: (id: string) => executions.get(id),
    update: (id: string, patch: Partial<Execution>) => {
      const existing = executions.get(id);
      if (existing) executions.set(id, { ...existing, ...patch });
    },
  },
};
