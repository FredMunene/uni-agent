import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { nanoid } from 'nanoid';
import { privateKeyToAccount } from 'viem/accounts';
import { keccak256, stringToHex, verifyMessage } from 'viem';
import {
  BASE_SEPOLIA,
  EXECUTION_CHAIN_ID,
  FULL_RANGE_TICKS,
  LP_FEE_TIERS,
  type Intent,
  type Plan,
} from '@uni-agent/shared';
import { generatePlan, buildPlan } from '../apps/web/lib/agent/index.ts';
import { getAprSnapshot } from '../apps/web/lib/services/apr.ts';
import { getLpParams } from '../apps/web/lib/services/lp.ts';
import { validatePlan } from '../apps/web/lib/services/risk.ts';
import { deriveMonitorSnapshot } from '../apps/web/lib/services/monitor.ts';
import { deriveRebalanceIntentDraft } from '../apps/web/lib/services/rebalance.ts';
import { store } from '../apps/web/lib/store.ts';

type DemoExecution = {
  executionId: string;
  planId: string;
  intentId: string;
  planHash?: string;
  status: string;
  steps: Array<{ type: string; status: string; txHash?: string }>;
  position?: {
    positionId: string;
    pool: string;
    token0Amount: string;
    token1Amount: string;
    liquidity?: string;
  };
  createdAt: string;
  _plan?: Plan;
};

type DemoPlanResult = {
  plans: Plan[];
  source: 'live' | 'fallback';
};

export function normalizeBaseUrl(input?: string): string {
  const raw = input?.trim() || 'http://localhost:3000';
  return raw.replace(/\/+$/, '');
}

export function buildExecutionAuthorizationMessage(
  intentId: string,
  planId: string,
  planHash: string,
  userAddress: string,
): string {
  return [
    'Uni-Agent execution authorization',
    `intentId: ${intentId}`,
    `planId: ${planId}`,
    `planHash: ${planHash}`,
    `userAddress: ${userAddress}`,
  ].join('\n');
}

export function computePlanHash(plan: Plan): string {
  const fingerprint = {
    intentId: plan.intentId,
    strategy: plan.strategy,
    label: plan.label,
    estimatedNetApyBps: plan.estimatedNetApyBps,
    estimatedGasUsd: plan.estimatedGasUsd,
    riskScore: plan.riskScore,
    steps: plan.steps.map((step) => ({
      stepId: step.stepId,
      type: step.type,
      provider: step.provider,
      chainId: step.chainId,
      fromToken: step.fromToken ?? null,
      toToken: step.toToken ?? null,
      amountIn: step.amountIn ?? null,
      estimatedAmountOut: step.estimatedAmountOut ?? null,
      slippageBps: step.slippageBps ?? null,
      token0AmountIn: step.token0AmountIn ?? null,
      token1AmountIn: step.token1AmountIn ?? null,
      tickLower: step.tickLower ?? null,
      tickUpper: step.tickUpper ?? null,
    })),
    risk: {
      maxLossUsd: plan.risk.maxLossUsd,
      notes: plan.risk.notes,
    },
    createdAt: plan.createdAt,
  };

  return keccak256(stringToHex(JSON.stringify(fingerprint)));
}

function ensureDemoIntent(input: {
  goal?: string;
  amount: string;
  risk: Intent['risk'];
  userAddress: string;
}): Intent {
  const now = new Date().toISOString();
  return {
    intentId: `int_${nanoid(8)}`,
    userAddress: input.userAddress,
    inputToken: 'USDC',
    inputAmount: input.amount,
    goal: input.goal ?? 'Increase my portfolio with low-risk yield',
    risk: input.risk,
    constraints: {
      maxSlippageBps: 50,
      deadlineSeconds: 900,
      allowBridge: false,
      allowBorrow: false,
    },
    status: 'created',
    createdAt: now,
  };
}

function estimateDemoWethOut(amountIn: string): string {
  const halfUsdc = Number(BigInt(amountIn) / 2n) / 1_000_000;
  const estimatedWeth = Math.max(1, Math.round((halfUsdc / 3000) * 1e18));
  return estimatedWeth.toString();
}

async function buildFallbackPlans(intent: Intent): Promise<Plan[]> {
  const snapshot = await getAprSnapshot();
  const halfAmount = (BigInt(intent.inputAmount) / 2n).toString();
  const wethOut = estimateDemoWethOut(intent.inputAmount);
  const lpParams = await getLpParams({
    chainId: EXECUTION_CHAIN_ID,
    token0: BASE_SEPOLIA.USDC,
    token1: BASE_SEPOLIA.WETH,
    fee: LP_FEE_TIERS.LOW,
    amount0Desired: halfAmount,
    amount1Desired: wethOut,
    fullRange: true,
  });

  const toolResults = {
    get_swap_quote: {
      amountOut: wethOut,
      gasEstimate: '150000',
      priceImpactBps: 18,
      validUntil: new Date(Date.now() + 30_000).toISOString(),
    },
    get_lp_params: lpParams,
    simulate_bundle: {
      gasUsd: '1.50',
    },
  };

  return buildPlan(intent, toolResults, 'Fallback demo planning path', snapshot).map((plan) => ({
    ...plan,
    planHash: computePlanHash(plan),
  }));
}

async function generateDemoPlans(intent: Intent): Promise<DemoPlanResult> {
  try {
    const plans = await generatePlan(intent);
    for (const plan of plans) {
      validatePlan(plan, intent.constraints);
    }

    return {
      plans: plans.map((plan) => ({
        ...plan,
        planHash: computePlanHash(plan),
      })),
      source: 'live',
    };
  } catch (error) {
    const plans = await buildFallbackPlans(intent);
    for (const plan of plans) {
      validatePlan(plan, intent.constraints);
    }

    console.warn(
      `[demo] live planning failed, using fallback strategy: ${error instanceof Error ? error.message : String(error)}`
    );
    return { plans, source: 'fallback' };
  }
}

export function selectDemoPlan(plans: Plan[]): Plan {
  const balanced = plans.find((plan) => plan.strategy === 'balanced');
  if (balanced) return balanced;
  return plans[0] ?? assert.fail('No plans generated');
}

function buildExecutionRecord(params: {
  intentId: string;
  plan: Plan;
  userAddress: string;
  signature: string;
}): DemoExecution {
  const planHash = params.plan.planHash ?? computePlanHash(params.plan);
  const executionId = `exec_${nanoid(8)}`;
  return {
    executionId,
    planId: params.plan.planId,
    intentId: params.intentId,
    planHash,
    status: 'submitted',
    steps: params.plan.steps.map((step) => ({ type: step.type, status: 'pending' })),
    createdAt: new Date().toISOString(),
    _plan: params.plan,
    position: undefined,
  };
}

async function submitDemoExecution(params: {
  intent: Intent;
  plan: Plan;
  userAddress: string;
  signature: string;
}): Promise<DemoExecution> {
  if (!params.plan.planHash) {
    throw new Error('Missing plan hash for execution');
  }

  const message = buildExecutionAuthorizationMessage(
    params.intent.intentId,
    params.plan.planId,
    params.plan.planHash,
    params.userAddress,
  );

  const signatureValid = await verifyMessage({
    address: params.userAddress as `0x${string}`,
    message,
    signature: params.signature as `0x${string}`,
  });
  if (!signatureValid) {
    throw new Error('Execution signature check failed');
  }

  const existing = await store.executions.findByIntent(params.intent.intentId);
  if (existing && existing.status !== 'failed') {
    throw new Error(`Execution already exists for intent ${params.intent.intentId}`);
  }

  const execution = buildExecutionRecord({
    intentId: params.intent.intentId,
    plan: params.plan,
    userAddress: params.userAddress,
    signature: params.signature,
  });

  await store.executions.set(execution.executionId, execution as never);
  await store.intents.set(params.intent.intentId, { ...params.intent, status: 'executing' });
  return execution;
}

async function pollExecution(executionId: string, timeoutMs = 20_000): Promise<DemoExecution> {
  const start = Date.now();
  let last: DemoExecution | null = null;

  while (Date.now() - start < timeoutMs) {
    const current = await store.executions.get(executionId) as DemoExecution | null;
    if (!current) throw new Error(`Execution ${executionId} not found`);
    last = current;

    const elapsed = Date.now() - new Date(current.createdAt).getTime();
    const steps = current._plan?.steps ?? [];
    const nextSteps = steps.map((step, index) => {
      const submitted = (index + 1) * 2500;
      const confirmed = submitted + 2000;
      const status = elapsed >= confirmed ? 'confirmed' : elapsed >= submitted ? 'submitted' : 'pending';
      const txHash = elapsed >= submitted ? `0x${nanoid(40)}` : undefined;
      return { type: step.type, status, ...(txHash ? { txHash } : {}) };
    });

    const completed = elapsed >= steps.length * 4500 + 1000;
    const next: DemoExecution = completed
      ? {
          ...current,
          status: 'completed',
          steps: nextSteps,
          position: {
            positionId: `pos_${executionId.slice(5)}`,
            pool: 'USDC/WETH 0.05%',
            token0Amount: current._plan?.steps[0]?.token0AmountIn ?? current._plan?.steps[0]?.amountIn ?? '0',
            token1Amount: current._plan?.steps[0]?.token1AmountIn ?? current._plan?.steps[0]?.estimatedAmountOut ?? '0',
            liquidity: '847392918274',
          },
        }
      : {
          ...current,
          status: 'submitted',
          steps: nextSteps,
        };

    await store.executions.set(executionId, next as never);

    if (next.status === 'completed') {
      await store.intents.set(current.intentId, {
        ...(await store.intents.get(current.intentId))!,
        status: 'completed',
      } as Intent);
      return next;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  return last ?? assert.fail('Execution polling timed out with no execution state');
}

export async function runDemo(): Promise<void> {
  const userPrivateKey = process.env.DEMO_PRIVATE_KEY?.trim() as `0x${string}` | undefined;
  const privateKey = userPrivateKey ?? (`0x${randomBytes(32).toString('hex')}` as const);
  const account = privateKeyToAccount(privateKey);
  const userAddress = process.env.DEMO_USER_ADDRESS?.trim() || account.address;

  if (process.env.DEMO_USER_ADDRESS && process.env.DEMO_USER_ADDRESS.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error('DEMO_USER_ADDRESS does not match DEMO_PRIVATE_KEY');
  }

  const goal = process.env.DEMO_GOAL?.trim() || 'Increase my portfolio with low-risk yield';
  const amount = process.env.DEMO_AMOUNT?.trim() || '100000000';
  const risk = (process.env.DEMO_RISK?.trim() as Intent['risk'] | undefined) ?? 'medium';
  const intent = ensureDemoIntent({ goal, amount, risk, userAddress });

  console.log(`[demo] wallet ${account.address}`);
  console.log(`[demo] creating intent ${intent.intentId}`);
  await store.intents.set(intent.intentId, intent);

  const planResult = await generateDemoPlans(intent);
  await store.plans.set(intent.intentId, planResult.plans as never);
  await store.intents.set(intent.intentId, { ...intent, status: 'planned' });

  console.log(`[demo] planned ${planResult.plans.length} strategies via ${planResult.source} APR/planner data`);
  for (const plan of planResult.plans) {
    console.log(`  - ${plan.strategy}: ${plan.label} | APR ${plan.estimatedNetApyBps} bps | hash ${plan.planHash?.slice(0, 10)}…`);
  }

  const plan = selectDemoPlan(planResult.plans);
  assert.ok(plan.planHash, 'Selected plan is missing a hash');
  console.log(`[demo] selected ${plan.strategy} plan ${plan.planId}`);

  const signature = await account.signMessage({
    message: buildExecutionAuthorizationMessage(intent.intentId, plan.planId, plan.planHash, userAddress),
  });

  const execution = await submitDemoExecution({
    intent,
    plan,
    userAddress,
    signature,
  });
  console.log(`[demo] submitted execution ${execution.executionId}`);

  const completed = await pollExecution(execution.executionId);
  console.log(`[demo] execution ${completed.status}`);
  for (const step of completed.steps) {
    console.log(`  - ${step.type}: ${step.status}${step.txHash ? ` (${step.txHash.slice(0, 10)}…)` : ''}`);
  }

  const position = completed.position;
  if (position) {
    const monitor = deriveMonitorSnapshot({
      positionId: position.positionId,
      pool: position.pool,
      token0Amount: position.token0Amount,
      token1Amount: position.token1Amount,
      liquidity: position.liquidity,
    });
    console.log(
      `[demo] monitor inRange=${monitor.inRange} currentTick=${monitor.currentTick} tickLower=${monitor.tickLower} tickUpper=${monitor.tickUpper}`
    );

    const rebalance = deriveRebalanceIntentDraft({
      positionId: position.positionId,
      pool: position.pool,
      token0Amount: position.token0Amount,
      token1Amount: position.token1Amount,
      liquidity: position.liquidity,
    });
    console.log(`[demo] rebalance draft: ${rebalance.goal} (${rebalance.amount} USDC)`);
  }

  console.log('[demo] complete');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDemo().catch((error) => {
    console.error('[demo] failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
