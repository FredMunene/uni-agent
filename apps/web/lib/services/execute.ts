import { BASE_SEPOLIA } from '@uni-agent/shared';
import { encodeFunctionData, type Address } from 'viem';

export const universalRouterAbi = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

export const positionManagerAbi = [
  {
    type: 'function',
    name: 'modifyLiquidities',
    stateMutability: 'payable',
    inputs: [
      { name: 'unlockData', type: 'bytes' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

export function buildUniversalRouterExecute(input: {
  commands: `0x${string}`;
  inputs: readonly `0x${string}`[];
  deadline: bigint;
  address?: Address;
}) {
  const address = input.address ?? (BASE_SEPOLIA.UNISWAP_UNIVERSAL_ROUTER as Address);

  return {
    address,
    abi: universalRouterAbi,
    functionName: 'execute' as const,
    args: [input.commands, [...input.inputs], input.deadline] as const,
    data: encodeFunctionData({
      abi: universalRouterAbi,
      functionName: 'execute',
      args: [input.commands, [...input.inputs], input.deadline],
    }),
  };
}

export function buildPositionManagerModifyLiquidities(input: {
  unlockData: `0x${string}`;
  deadline: bigint;
  address?: Address;
}) {
  const address = input.address ?? (BASE_SEPOLIA.UNISWAP_V4_POSITION_MANAGER as Address);

  return {
    address,
    abi: positionManagerAbi,
    functionName: 'modifyLiquidities' as const,
    args: [input.unlockData, input.deadline] as const,
    data: encodeFunctionData({
      abi: positionManagerAbi,
      functionName: 'modifyLiquidities',
      args: [input.unlockData, input.deadline],
    }),
  };
}
