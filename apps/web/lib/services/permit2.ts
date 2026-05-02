import { BASE_SEPOLIA } from '@uni-agent/shared';
import { encodeFunctionData, maxUint48, type Address } from 'viem';

export const permit2Abi = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
    ],
    outputs: [],
  },
] as const;

export function buildPermit2Approval(input: {
  token?: Address;
  spender: Address;
  amount: bigint;
  expiration?: bigint;
}) {
  const token = input.token ?? (BASE_SEPOLIA.USDC as Address);
  const expiration = input.expiration ?? maxUint48;

  return {
    address: BASE_SEPOLIA.PERMIT2 as Address,
    abi: permit2Abi,
    functionName: 'approve' as const,
    args: [token, input.spender, input.amount, expiration] as const,
    data: encodeFunctionData({
      abi: permit2Abi,
      functionName: 'approve',
      args: [token, input.spender, input.amount, expiration],
    }),
  };
}
