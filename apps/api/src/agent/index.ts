import { GoogleGenerativeAI } from '@google/generative-ai';
import { tools } from './tools.js';
import { getSwapQuote } from '../services/quote.js';
import { getLpParams } from '../services/lp.js';
import { simulateBundle } from '../services/simulate.js';
import { quoteCache } from '../services/quoteCache.js';
import type { Intent, Plan, PlanStep } from '@uni-agent/shared';
import { BASE_MAINNET, BASE_SEPOLIA, CHAIN_ID_BASE_SEPOLIA, EXECUTION_CHAIN_ID, FULL_RANGE_TICKS, LP_FEE_TIERS, QUOTE_CHAIN_ID } from '@uni-agent/shared';
import { nanoid } from 'nanoid';

function getModel() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set — check your .env file');
  const genAI = new GoogleGenerativeAI(key);
  return genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
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
  const chat = getModel().startChat();

  const userMessage = `
Intent: ${intent.goal}
Input: ${intent.inputAmount} units of ${intent.inputToken}
User address: ${intent.userAddress}
Risk: ${intent.risk}
Max slippage: ${intent.constraints.maxSlippageBps}bps

Call get_swap_quote, then get_lp_params, then simulate_bundle, then summarise the plan.
`.trim();

  let response = await chat.sendMessage(userMessage);

  // Tool call loop
  const toolResults: Record<string, unknown> = {};

  while (true) {
    const calls = response.response.functionCalls();
    if (!calls || calls.length === 0) break;

    const responses = await Promise.all(
      calls.map(async (call) => {
        const result = await handleToolCall(call.name, call.args as ToolInput, intent.userAddress);
        toolResults[call.name] = result;
        return {
          functionResponse: {
            name: call.name,
            response: result as object,
          },
        };
      })
    );

    response = await chat.sendMessage(responses);
  }

  const summary = response.response.text();
  return buildPlan(intent, toolResults, summary);
}

function buildPlan(
  intent: Intent,
  toolResults: Record<string, unknown>,
  agentSummary: string
): Plan[] {
  const swapQuote = toolResults['get_swap_quote'] as Record<string, unknown> | undefined;
  const lpParams = toolResults['get_lp_params'] as Record<string, unknown> | undefined;
  const simulation = toolResults['simulate_bundle'] as Record<string, unknown> | undefined;

  const halfAmount = (BigInt(intent.inputAmount) / 2n).toString();

  const steps: PlanStep[] = [
    {
      stepId: 'step_001',
      type: 'swap',
      provider: 'uniswap',
      chainId: EXECUTION_CHAIN_ID,
      fromToken: BASE_SEPOLIA.USDC,
      toToken: BASE_SEPOLIA.WETH,
      amountIn: halfAmount,
      estimatedAmountOut: (swapQuote?.amountOut as string | undefined) ?? '0',
      slippageBps: intent.constraints.maxSlippageBps,
    },
    {
      stepId: 'step_002',
      type: 'add_liquidity',
      provider: 'uniswap_v4',
      chainId: EXECUTION_CHAIN_ID,
      fromToken: BASE_SEPOLIA.USDC,
      toToken: BASE_SEPOLIA.WETH,
      token0AmountIn: halfAmount,
      token1AmountIn: (swapQuote?.amountOut as string | undefined) ?? '0',
      tickLower: (lpParams?.tickLower as number | undefined) ?? FULL_RANGE_TICKS.tickLower,
      tickUpper: (lpParams?.tickUpper as number | undefined) ?? FULL_RANGE_TICKS.tickUpper,
    },
  ];

  return [
    {
      planId: `plan_${nanoid(8)}`,
      intentId: intent.intentId,
      label: 'USDC/WETH LP on Base (swap → add_liquidity)',
      estimatedNetApyBps: 480,
      estimatedGasUsd: (simulation?.gasUsd as string | undefined) ?? '1.50',
      riskScore: intent.risk,
      steps,
      risk: {
        maxLossUsd: '2.50',
        notes: agentSummary.slice(0, 300),
      },
      createdAt: new Date().toISOString(),
    },
  ];
}
