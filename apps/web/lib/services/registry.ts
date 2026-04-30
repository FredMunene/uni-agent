import { createPublicClient, createWalletClient, http, keccak256, stringToHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

const INTENT_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'createIntent',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'intentId', type: 'bytes32' },
      { name: 'user',     type: 'address' },
      { name: 'asset',    type: 'address' },
      { name: 'amount',   type: 'uint256' },
      { name: 'risk',     type: 'uint8'   },
    ],
    outputs: [],
  },
] as const;

function getClients() {
  const privateKey = process.env.PRIVATE_EXECUTOR_KEY;
  const registryAddress = process.env.NEXT_PUBLIC_INTENT_REGISTRY_ADDRESS;
  const rpcUrl = process.env.RPC_BASE_SEPOLIA ?? 'https://sepolia.base.org';

  if (!privateKey || !registryAddress) return null;

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const transport = http(rpcUrl);

  const publicClient = createPublicClient({ chain: baseSepolia, transport });
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport });

  return { publicClient, walletClient, account, registryAddress: registryAddress as `0x${string}` };
}

// Mirrors IntentExecutor.buildPlanIntentBytes32 — intentId string → bytes32
function toBytes32(intentId: string): `0x${string}` {
  return keccak256(stringToHex(intentId));
}

const RISK_MAP: Record<string, number> = { low: 0, medium: 1, high: 2 };

// Called server-side when a new intent is persisted to Redis.
// Fire-and-forget — caller should not await or surface errors to the user.
export async function createIntentOnChain(opts: {
  intentId:    string;
  userAddress: string;
  asset:       string;
  amount:      string;  // raw token units (e.g. USDC with 6 decimals)
  risk:        string;
}): Promise<void> {
  const clients = getClients();
  if (!clients) return;

  const { walletClient, registryAddress } = clients;

  await walletClient.writeContract({
    address: registryAddress,
    abi:     INTENT_REGISTRY_ABI,
    functionName: 'createIntent',
    args: [
      toBytes32(opts.intentId),
      opts.userAddress as `0x${string}`,
      opts.asset as `0x${string}`,
      BigInt(opts.amount),
      RISK_MAP[opts.risk] ?? 1,
    ],
  });
}
