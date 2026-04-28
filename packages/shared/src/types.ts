export type RiskLevel = 'low' | 'medium' | 'high';
export type StepType = 'swap' | 'add_liquidity' | 'supply' | 'borrow' | 'bridge';
export type StepStatus = 'pending' | 'submitted' | 'confirmed' | 'failed' | 'skipped';
export type IntentStatus = 'created' | 'planning' | 'planned' | 'executing' | 'completed' | 'failed';
export type StrategyLabel = 'conservative' | 'balanced' | 'aggressive';
export type SolverStatus = 'active' | 'slashed' | 'withdrawn';

export interface Intent {
  intentId: string;
  userAddress: string;
  inputToken: string;
  inputAmount: string;
  goal: string;
  risk: RiskLevel;
  constraints: IntentConstraints;
  status: IntentStatus;
  createdAt: string;
}

export interface IntentConstraints {
  maxSlippageBps: number;
  deadlineSeconds: number;
  allowBridge?: boolean;
  allowBorrow?: boolean;
}

export interface PlanStep {
  stepId: string;
  type: StepType;
  provider: string;
  chainId: number;
  fromToken?: string;
  toToken?: string;
  amountIn?: string;
  estimatedAmountOut?: string;
  slippageBps?: number;
  token0AmountIn?: string;
  token1AmountIn?: string;
  tickLower?: number;
  tickUpper?: number;
  calldata?: string;
}

export interface Plan {
  planId: string;
  intentId: string;
  strategy: StrategyLabel;
  label: string;
  estimatedNetApyBps: number;
  estimatedGasUsd: string;
  riskScore: RiskLevel;
  steps: PlanStep[];
  risk: {
    maxLossUsd: string;
    notes: string;
  };
  createdAt: string;
  // solver fields — present when submitted by a registered solver
  solver?: SolverMeta;
}

export interface SolverMeta {
  solverAddress: string;    // on-chain address, receives fee on win
  solverName: string;       // human-readable label e.g. "Gemini-LP-v1"
  bidBondWei: string;       // bid bond locked on strategy submission
  validUntil: string;       // ISO timestamp — strategy expires after this
}

export interface SwapQuote {
  quoteId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  gasEstimate: string;
  priceImpactBps: number;
  validUntil: string;
  calldata?: string;
  permit2?: unknown;
}

export interface LpParams {
  token0: string;
  token1: string;
  fee: number;
  tickLower: number;
  tickUpper: number;
  amount0Desired: string;
  amount1Desired: string;
  amount0Min: string;
  amount1Min: string;
}

export interface ExecutionStep {
  type: StepType;
  status: StepStatus;
  txHash?: string;
  error?: string;
}

export interface Execution {
  executionId: string;
  planId: string;
  status: StepStatus | 'completed';
  steps: ExecutionStep[];
  position?: Position;
  createdAt: string;
}

export interface Position {
  positionId: string;
  pool: string;
  liquidity?: string;
  token0Amount: string;
  token1Amount: string;
  collateralValueUsd?: string;
}
