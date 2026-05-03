import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

const SKILLS = {
  protocol: 'uni-agent',
  version: '1.0',
  description: 'Open intent protocol for AI-driven Uniswap v4 LP management on Base.',
  chain: 'base-sepolia',
  contracts: {
    intentRegistry:  process.env.NEXT_PUBLIC_INTENT_REGISTRY_ADDRESS  ?? null,
    intentExecutor:  process.env.NEXT_PUBLIC_INTENT_EXECUTOR_ADDRESS  ?? null,
    intentVault:     process.env.NEXT_PUBLIC_INTENT_VAULT_ADDRESS     ?? null,
    positionRegistry:process.env.NEXT_PUBLIC_POSITION_REGISTRY_ADDRESS ?? null,
  },
  skills: [
    {
      id: 'post_intent',
      name: 'Post Intent',
      description: 'Submit a natural-language liquidity intent. Returns an intentId.',
      method: 'POST',
      endpoint: '/api/v1/intents',
      input: {
        userAddress:  'string — 0x wallet address of the user',
        description:  'string — natural language intent, e.g. "Deposit 100 USDC into Uniswap"',
        inputToken:   'string — token symbol or address, e.g. "USDC"',
        inputAmount:  'string — token amount in smallest unit (e.g. "100000000" for 100 USDC)',
        risk:         'string? — "low" | "medium" | "high" (default "medium")',
      },
      output: { intentId: 'string', status: 'string' },
    },
    {
      id: 'get_strategies',
      name: 'Get Strategies',
      description: 'Fetch AI-generated LP strategies for an intent. Returns 3 competing plans.',
      method: 'POST',
      endpoint: '/api/v1/intents/:intentId/plan',
      input: { intentId: 'string — from post_intent' },
      output: {
        plans: 'Plan[] — conservative / balanced / aggressive strategies',
        recommendedPlanId: 'string — solver-recommended plan',
      },
    },
    {
      id: 'execute_strategy',
      name: 'Execute Strategy',
      description: 'Request calldata to execute a selected strategy on-chain.',
      method: 'POST',
      endpoint: '/api/v1/intents/:intentId/plans/:planId/execute',
      input: {
        intentId:      'string',
        planId:        'string — selected plan from get_strategies',
        userAddress:   'string — 0x address that will sign the tx',
        signature:     'string — EIP-712 signature over execution digest',
        deadline:      'number — unix timestamp',
      },
      output: { executionId: 'string', txHash: 'string?', status: 'string' },
    },
    {
      id: 'monitor_position',
      name: 'Monitor Position',
      description: 'Check if an LP position is in-range. Returns drift % and rebalance signal.',
      method: 'GET',
      endpoint: '/api/v1/positions/:posId/monitor',
      input: { posId: 'string — position ID from execute_strategy' },
      output: {
        snapshot: {
          inRange:      'boolean',
          driftPercent: 'number',
          currentTick:  'number?',
          tickLower:    'number?',
          tickUpper:    'number?',
        },
        monitorSource: 'string — "live_tick" | "stored_tick" | "stored_fallback"',
      },
    },
    {
      id: 'list_solvers',
      name: 'List Solvers',
      description: 'Enumerate registered solver agents with on-chain attribution.',
      method: 'GET',
      endpoint: '/api/v1/solvers',
      output: {
        solvers: 'Solver[] — name, ensName, builderCode, address, reputation',
      },
    },
    {
      id: 'register_solver',
      name: 'Register Solver',
      description: 'Register an AI agent as a solver. Requires on-chain stake.',
      method: 'POST',
      endpoint: '/api/v1/solvers/register',
      input: {
        solverAddress: 'string — 0x address',
        solverName:    'string',
        ensName:       'string? — e.g. "mybot.solvers.uni-agent.eth"',
        builderCode:   'string? — 4-byte hex attribution code',
        stakeWei:      'string — stake amount in wei (min 0.001 ETH)',
      },
    },
  ],
  economics: {
    registrationStake: '0.001 ETH',
    bidBond:           '0.0001 ETH per strategy',
    executionFee:      '0.1% of intent value',
    solverShare:       '70%',
    treasuryShare:     '30%',
  },
};

export async function GET() {
  return NextResponse.json(SKILLS, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}
