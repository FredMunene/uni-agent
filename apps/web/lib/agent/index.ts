import { GoogleGenerativeAI } from '@google/generative-ai';
import { tools } from './tools';
import { getSwapQuote } from '../services/quote';
import { getLpParams } from '../services/lp';
import { simulateBundle } from '../services/simulate';
import { getAprSnapshot, type AprSnapshot } from '../services/apr';
import { quoteCache } from '../services/quoteCache';
import type { Intent, Plan, PlanStep } from '@uni-agent/shared';
import { BASE_MAINNET, BASE_SEPOLIA, EXECUTION_CHAIN_ID, FULL_RANGE_TICKS, LP_FEE_TIERS, QUOTE_CHAIN_ID } from '@uni-agent/shared';
import { nanoid } from 'nanoid';

function getModel() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');
  const genAI = new GoogleGenerativeAI(key);
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
  return genAI.getGenerativeModel({
    model,
    tools: [{ functionDeclarations: tools }],
    systemInstruction: `You are a DeFi strategy planner for an agentic stablecoin router.

Your job: given a user's financial intent, generate a concrete 2-step execution plan using Uniswap on Base.

The 2 steps you always produce:
1. swap — convert half the input USDC to WETH using the Uniswap Trading API
2. add_liquidity — add the USDC and WETH into a Uniswap v4 USDC/WETH 0.05% pool

Rules:
- Always call get_swap_quote first to get a real quote
- Then call get_lp_params using the swap output as amount1Desired
- Then call simulate_bundle to estimate gas
- Split the input amount: 50% stays as USDC (token0), 50% is swapped to WETH (token1)
- Use fullRange: true for the LP position
- Use chainId ${QUOTE_CHAIN_ID} (Base mainnet) for get_swap_quote — the Trading API requires mainnet
- Token addresses for quotes: USDC=${BASE_MAINNET.USDC}, WETH=${BASE_MAINNET.WETH}
- Execution chain ID (for LP params and bundle): ${EXECUTION_CHAIN_ID}, LP fee: ${LP_FEE_TIERS.LOW}

After calling all three tools, summarise the plan in plain text: steps, estimated gas, and one risk note.`,
  });
}

function isTransientGeminiError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /503 Service Unavailable|429 Too Many Requests|high demand|temporarily unavailable/i.test(message);
}

export async function retryTransient<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isTransientGeminiError(error)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Retry failed');
}

type ToolInput = Record<string, unknown>;

async function handleToolCall(name: string, args: ToolInput, userAddress: string): Promise<unknown> {
  if (name === 'get_swap_quote') {
    const quote = await getSwapQuote({
      chainId: args.chainId as number,
      tokenIn: args.tokenIn as string,
      tokenOut: args.tokenOut as string,
      amountIn: args.amountIn as string,
      recipient: (args.recipient as string | undefined) ?? userAddress,
    });
    quoteCache.set(quote);
    return quote;
  }
  if (name === 'get_lp_params') {
    return getLpParams({
      chainId: args.chainId as number,
      token0: args.token0 as string,
      token1: args.token1 as string,
      fee: args.fee as number,
      amount0Desired: args.amount0Desired as string,
      amount1Desired: args.amount1Desired as string,
      fullRange: (args.fullRange as boolean | undefined) ?? true,
    });
  }
  if (name === 'simulate_bundle') {
    return simulateBundle({
      chainId: args.chainId as number,
      userAddress: args.userAddress as string,
      swapQuoteId: args.swapQuoteId as string,
      lpParams: args.lpParams as object,
    });
  }
  return { error: `Unknown tool: ${name}` };
}

export async function generatePlan(intent: Intent): Promise<Plan[]> {
  return retryTransient(async () => {
    const chat = getModel().startChat();
    const aprSnapshot = await getAprSnapshot();

    const userMessage = `
Intent: ${intent.goal}
Input: ${intent.inputAmount} units of ${intent.inputToken}
User address: ${intent.userAddress}
Risk: ${intent.risk}
Max slippage: ${intent.constraints.maxSlippageBps}bps

Call get_swap_quote, then get_lp_params, then simulate_bundle, then summarise the plan.
`.trim();

    let response = await chat.sendMessage(userMessage);
    const toolResults: Record<string, unknown> = {};

    while (true) {
      const calls = response.response.functionCalls();
      if (!calls || calls.length === 0) break;

      const responses = await Promise.all(
        calls.map(async (call) => {
          const result = await handleToolCall(call.name, call.args as ToolInput, intent.userAddress);
          toolResults[call.name] = result;
          return { functionResponse: { name: call.name, response: result as object } };
        })
      );

      response = await chat.sendMessage(responses);
    }

    return buildPlan(intent, toolResults, response.response.text(), aprSnapshot);
  });
}

export function buildPlan(
  intent: Intent,
  toolResults: Record<string, unknown>,
  agentSummary: string,
  aprSnapshot: AprSnapshot,
): Plan[] {
  const swapQuote = toolResults['get_swap_quote'] as Record<string, unknown> | undefined;
  const lpParams  = toolResults['get_lp_params']  as Record<string, unknown> | undefined;
  const simulation = toolResults['simulate_bundle'] as Record<string, unknown> | undefined;

  const fullAmount = intent.inputAmount;
  const halfAmount = (BigInt(intent.inputAmount) / 2n).toString();
  const wethOut    = (swapQuote?.amountOut as string | undefined) ?? '0';
  const gasUsd     = (simulation?.gasUsd  as string | undefined) ?? '1.50';
  const fullTickLower = (lpParams?.tickLower as number | undefined) ?? FULL_RANGE_TICKS.tickLower;
  const fullTickUpper = (lpParams?.tickUpper as number | undefined) ?? FULL_RANGE_TICKS.tickUpper;
  const centerTick    = Math.round((fullTickLower + fullTickUpper) / 2);

  // ±5% concentrated range (~1000 ticks at 0.01% spacing)
  const tightTickLower = centerTick - 1000;
  const tightTickUpper = centerTick + 1000;

  const validUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const solverMeta = {
    solverAddress: '0x0000000000000000000000000000000000000001',
    solverName: 'Gemini-LP-v1',
    bidBondWei: '1000000000000000', // 0.001 ETH
    validUntil,
  };

  // ── Conservative: hold USDC, no swap, stable pool ───────────────────────────
  const conservativeSteps: PlanStep[] = [
    {
      stepId: 'step_001',
      type: 'add_liquidity',
      provider: 'stable_pool',
      chainId: EXECUTION_CHAIN_ID,
      fromToken: BASE_SEPOLIA.USDC,
      toToken: BASE_SEPOLIA.USDC,
      token0AmountIn: fullAmount,
      token1AmountIn: '0',
      tickLower: FULL_RANGE_TICKS.tickLower,
      tickUpper: FULL_RANGE_TICKS.tickUpper,
    },
  ];

  // ── Balanced: swap 50% USDC → WETH, full range ──────────────────────────────
  const balancedSteps: PlanStep[] = [
    {
      stepId: 'step_001',
      type: 'swap',
      provider: 'dex',
      chainId: EXECUTION_CHAIN_ID,
      fromToken: BASE_SEPOLIA.USDC,
      toToken: BASE_SEPOLIA.WETH,
      amountIn: halfAmount,
      estimatedAmountOut: wethOut,
      slippageBps: intent.constraints.maxSlippageBps,
    },
    {
      stepId: 'step_002',
      type: 'add_liquidity',
      provider: 'dex_v4',
      chainId: EXECUTION_CHAIN_ID,
      fromToken: BASE_SEPOLIA.USDC,
      toToken: BASE_SEPOLIA.WETH,
      token0AmountIn: halfAmount,
      token1AmountIn: wethOut,
      tickLower: fullTickLower,
      tickUpper: fullTickUpper,
    },
  ];

  // ── Aggressive: swap 50% USDC → WETH, concentrated ±5% range ───────────────
  const aggressiveSteps: PlanStep[] = [
    {
      stepId: 'step_001',
      type: 'swap',
      provider: 'dex',
      chainId: EXECUTION_CHAIN_ID,
      fromToken: BASE_SEPOLIA.USDC,
      toToken: BASE_SEPOLIA.WETH,
      amountIn: halfAmount,
      estimatedAmountOut: wethOut,
      slippageBps: intent.constraints.maxSlippageBps,
    },
    {
      stepId: 'step_002',
      type: 'add_liquidity',
      provider: 'dex_v4',
      chainId: EXECUTION_CHAIN_ID,
      fromToken: BASE_SEPOLIA.USDC,
      toToken: BASE_SEPOLIA.WETH,
      token0AmountIn: halfAmount,
      token1AmountIn: wethOut,
      tickLower: tightTickLower,
      tickUpper: tightTickUpper,
    },
  ];

  return [
    {
      planId: `plan_${nanoid(8)}`,
      intentId: intent.intentId,
      strategy: 'conservative' as const,
      label: 'Safe & Steady',
      estimatedNetApyBps: aprSnapshot.stable.apyBps,
      estimatedGasUsd: '0.04',
      riskScore: 'low' as const,
      steps: conservativeSteps,
      risk: {
        maxLossUsd: '0.00',
        notes: `Stable pool APR from ${aprSnapshot.stable.project}/${aprSnapshot.stable.pool} via ${aprSnapshot.source}.`,
      },
      createdAt: now,
      solver: solverMeta,
    },
    {
      planId: `plan_${nanoid(8)}`,
      intentId: intent.intentId,
      strategy: 'balanced' as const,
      label: 'Balanced Growth',
      estimatedNetApyBps: aprSnapshot.balanced.apyBps,
      estimatedGasUsd: gasUsd,
      riskScore: 'medium' as const,
      steps: balancedSteps,
      risk: {
        maxLossUsd: '4.20',
        notes: `${agentSummary.slice(0, 140)} Live APR: ${aprSnapshot.balanced.apy.toFixed(2)}% (${aprSnapshot.source}).`,
      },
      createdAt: now,
      solver: solverMeta,
    },
    {
      planId: `plan_${nanoid(8)}`,
      intentId: intent.intentId,
      strategy: 'aggressive' as const,
      label: 'Maximum Yield',
      estimatedNetApyBps: aprSnapshot.aggressive.apyBps,
      estimatedGasUsd: gasUsd,
      riskScore: 'high' as const,
      steps: aggressiveSteps,
      risk: {
        maxLossUsd: '24.00',
        notes: `Concentrated range. Live APR baseline ${aprSnapshot.aggressive.apy.toFixed(2)}% from ${aprSnapshot.aggressive.pool}.`,
      },
      createdAt: now,
      solver: solverMeta,
    },
  ];
}
