import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';
import { CreateIntentSchema, ExecuteSchema } from '@uni-agent/shared';
import type { Intent } from '@uni-agent/shared';
import { store } from '../store.js';
import { generatePlansForIntent } from '../services/planner.js';
import { validatePlan } from '../services/risk.js';

export async function intentRoutes(app: FastifyInstance) {
  // Create intent
  app.post('/intents', async (req, reply) => {
    const result = CreateIntentSchema.safeParse(req.body);
    if (!result.success) {
      return reply.status(400).send({ error: result.error.flatten() });
    }

    const intent: Intent = {
      intentId: `int_${nanoid(8)}`,
      ...result.data,
      status: 'created',
      createdAt: new Date().toISOString(),
    };

    store.intents.set(intent.intentId, intent);
    return reply.status(201).send({ intentId: intent.intentId, status: intent.status });
  });

  // Get intent
  app.get('/intents/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const intent = store.intents.get(id);
    if (!intent) return reply.status(404).send({ error: 'Intent not found' });
    return intent;
  });

  // Generate plan (triggers Claude agent)
  app.post('/intents/:id/plan', async (req, reply) => {
    const { id } = req.params as { id: string };
    const intent = store.intents.get(id);
    if (!intent) return reply.status(404).send({ error: 'Intent not found' });

    store.intents.set(id, { ...intent, status: 'planning' });

    try {
      const plans = await generatePlansForIntent(intent);

      // Validate each plan against constraints
      for (const plan of plans) {
        const risk = validatePlan(plan, intent.constraints);
        if (!risk.passed) {
          app.log.warn({ planId: plan.planId, errors: risk.errors }, 'Plan failed risk check');
        }
      }

      store.plans.set(id, plans);
      store.intents.set(id, { ...intent, status: 'planned' });

      return {
        intentId: id,
        recommendedPlanId: plans[0]?.planId,
        plans,
      };
    } catch (err) {
      store.intents.set(id, { ...intent, status: 'failed' });
      app.log.error(err, 'Plan generation failed');
      return reply.status(500).send({ error: 'Plan generation failed', detail: String(err) });
    }
  });

  // Get bundle for a plan
  app.post('/intents/:id/plans/:planId/bundle', async (req, reply) => {
    const { id, planId } = req.params as { id: string; planId: string };
    const plans = store.plans.get(id);
    const plan = plans?.find((p) => p.planId === planId);
    if (!plan) return reply.status(404).send({ error: 'Plan not found' });

    const intent = store.intents.get(id);
    if (!intent) return reply.status(404).send({ error: 'Intent not found' });

    const deadline = Math.floor(Date.now() / 1000) + intent.constraints.deadlineSeconds;

    return {
      planId,
      executionMode: 'user_signed',
      requiredSignatures: [
        {
          type: 'permit2',
          token: plan.steps[0]?.fromToken,
          spender: process.env.INTENT_EXECUTOR_ADDRESS ?? '0x0000000000000000000000000000000000000000',
          amount: intent.inputAmount,
          deadline,
        },
      ],
      transaction: {
        chainId: plan.steps[0]?.chainId,
        to: process.env.INTENT_EXECUTOR_ADDRESS ?? '0x0000000000000000000000000000000000000000',
        data: '0x', // TODO: encode IntentExecutor.execute() calldata
        value: '0',
        gasEstimate: '340000',
      },
      safety: {
        maxLossUsd: plan.risk.maxLossUsd,
        deadline,
      },
    };
  });

  // Execute plan
  app.post('/intents/:id/plans/:planId/execute', async (req, reply) => {
    const { id, planId } = req.params as { id: string; planId: string };
    const result = ExecuteSchema.safeParse(req.body);
    if (!result.success) return reply.status(400).send({ error: result.error.flatten() });

    const plans = store.plans.get(id);
    const plan = plans?.find((p) => p.planId === planId);
    if (!plan) return reply.status(404).send({ error: 'Plan not found' });

    const executionId = `exec_${nanoid(8)}`;
    store.executions.set(executionId, {
      executionId,
      planId,
      status: 'submitted',
      steps: plan.steps.map((s) => ({ type: s.type, status: 'pending' as const })),
      createdAt: new Date().toISOString(),
    });

    // TODO: submit transaction via viem walletClient + track steps
    return reply.status(202).send({ executionId, status: 'submitted' });
  });

  // Track execution
  app.get('/executions/:execId', async (req, reply) => {
    const { execId } = req.params as { execId: string };
    const exec = store.executions.get(execId);
    if (!exec) return reply.status(404).send({ error: 'Execution not found' });
    return exec;
  });
}
