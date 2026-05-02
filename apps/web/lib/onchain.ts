import {
  BASE_SEPOLIA,
  EXECUTION_CHAIN_ID,
  type Plan,
} from '@uni-agent/shared';
import {
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  stringToHex,
  zeroAddress,
  type Address,
  type Hex,
} from 'viem';

// ── step type ────────────────────────────────────────────────────────────────

export type ExecutionStep = {
  stepType:     number;
  target:       Address;
  tokenIn:      Address;
  tokenOut:     Address;
  amountIn:     bigint;
  minAmountOut: bigint;
  callData:     Hex;
};

// Shared ABI components — must match IntentExecutor.Step struct exactly
const stepComponents = [
  { name: 'stepType',     type: 'uint8'   },
  { name: 'target',       type: 'address' },
  { name: 'tokenIn',      type: 'address' },
  { name: 'tokenOut',     type: 'address' },
  { name: 'amountIn',     type: 'uint256' },
  { name: 'minAmountOut', type: 'uint256' },
  { name: 'callData',     type: 'bytes'   },
] as const;

// ── ABIs ──────────────────────────────────────────────────────────────────────

export const intentExecutorAbi = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'intentId',        type: 'bytes32'  },
          { name: 'user',            type: 'address'  },
          { name: 'deadline',        type: 'uint256'  },
          { name: 'planHash',        type: 'bytes32'  },
          { name: 'signature',       type: 'bytes'    },
          { name: 'steps',           type: 'tuple[]', components: stepComponents },
          { name: 'registryAddress', type: 'address'  },
          { name: 'builderCode',     type: 'bytes4'   },
        ],
      },
    ],
    outputs: [],
  },
] as const;

export const positionRegistryAbi = [
  {
    type: 'function',
    name: 'recordPosition',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'positionId', type: 'bytes32' },
      {
        name: 'position',
        type: 'tuple',
        components: [
          { name: 'owner',     type: 'address' },
          { name: 'chainId',   type: 'uint256' },
          { name: 'token0',    type: 'address' },
          { name: 'token1',    type: 'address' },
          { name: 'amount0',   type: 'uint256' },
          { name: 'amount1',   type: 'uint256' },
          { name: 'liquidity', type: 'uint256' },
          { name: 'createdAt', type: 'uint256' },
        ],
      },
    ],
    outputs: [],
  },
] as const;

// ── helpers ───────────────────────────────────────────────────────────────────

export function buildPlanIntentBytes32(intentId: string): Hex {
  return keccak256(stringToHex(intentId));
}

export function buildExecutionDigest(input: {
  executorAddress: Address;
  intentId:        string;
  userAddress:     Address;
  deadline:        number;
  planHash:        Hex;
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'uint256' },
        { type: 'address' },
        { type: 'bytes32' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'bytes32' },
      ],
      [
        BigInt(EXECUTION_CHAIN_ID),
        input.executorAddress,
        buildPlanIntentBytes32(input.intentId),
        input.userAddress,
        BigInt(input.deadline),
        input.planHash,
      ],
    ),
  );
}

// Build execution steps and compute the on-chain plan hash.
// Must be called BEFORE signing so the digest uses the correct planHash.
// The on-chain check is: keccak256(abi.encode(steps)) == planHash
export function buildExecutionSteps(input: {
  userAddress:             Address;
  intentId:                string;
  planId:                  string;
  plan:                    Plan;
  positionRegistryAddress: Address;
}) {
  const positionId = keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'address' }],
      [
        buildPlanIntentBytes32(input.intentId),
        keccak256(stringToHex(input.planId)),
        input.userAddress,
      ],
    ),
  );

  const firstStep = input.plan.steps[0];
  const addLiquidityStep = input.plan.steps.find((step) => step.type === 'add_liquidity') ?? firstStep;
  const position = {
    owner:     input.userAddress,
    chainId:   BigInt(EXECUTION_CHAIN_ID),
    token0:    BASE_SEPOLIA.USDC as Address,
    token1:    BASE_SEPOLIA.WETH as Address,
    amount0:   BigInt((addLiquidityStep as any)?.token0AmountIn ?? (firstStep as any)?.amountIn ?? '0'),
    amount1:   BigInt((addLiquidityStep as any)?.token1AmountIn ?? (firstStep as any)?.estimatedAmountOut ?? '0'),
    liquidity: 1_000_000n,
    createdAt: BigInt(Math.floor(Date.now() / 1000)),
  };

  // Testnet demo step: record the predicted LP position on the deployed PositionRegistry.
  // This is a real Base Sepolia contract call, but still not the final Uniswap swap/mint path.
  const steps: ExecutionStep[] = [
    {
      stepType:     1,
      target:       input.positionRegistryAddress,
      tokenIn:      zeroAddress,
      tokenOut:     zeroAddress,
      amountIn:     0n,
      minAmountOut: 0n,
      callData:     encodeFunctionData({
        abi: positionRegistryAbi,
        functionName: 'recordPosition',
        args: [positionId, position],
      }),
    },
  ];

  // On-chain planHash must equal keccak256(abi.encode(steps)) — mirrors IntentExecutor check
  const onchainPlanHash = keccak256(
    encodeAbiParameters(
      [{ type: 'tuple[]', components: stepComponents as unknown as typeof stepComponents }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [steps as any],
    ),
  ) as Hex;

  return { steps, onchainPlanHash, positionId, position };
}

export function buildExecutorExecution(input: {
  executorAddress: Address;
  intentId:        string;
  userAddress:     Address;
  onchainPlanHash: Hex;
  signature:       Hex;
  deadline:        bigint;
  steps:           ExecutionStep[];
  positionId:      Hex;
  position:        ReturnType<typeof buildExecutionSteps>['position'];
}) {
  return {
    positionId:   input.positionId,
    address:      input.executorAddress,
    abi:          intentExecutorAbi,
    functionName: 'execute' as const,
    args: [
      {
        intentId:        buildPlanIntentBytes32(input.intentId),
        user:            input.userAddress,
        deadline:        input.deadline,
        planHash:        input.onchainPlanHash,
        signature:       input.signature,
        steps:           input.steps,
        // Registry settlement skipped in v0 testnet demo — intent lifecycle
        // (createIntent → submitStrategy → selectStrategy) not yet wired server-side.
        // Set to INTENT_REGISTRY_ADDRESS + send ETH value once that chain is implemented.
        registryAddress: zeroAddress,
        builderCode:     '0x00000000' as Hex,
      },
    ] as const,
    position: input.position,
  };
}
