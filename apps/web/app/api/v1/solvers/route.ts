import { NextResponse } from 'next/server';
import { createPublicClient, http, type Address } from 'viem';
import { baseSepolia } from 'viem/chains';

const registryAddress = process.env.NEXT_PUBLIC_INTENT_REGISTRY_ADDRESS as Address | undefined;

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.RPC_BASE_SEPOLIA ?? 'https://sepolia.base.org'),
});

// Solvers mapping is not enumerable on-chain — seed with known addresses.
// The Gemini solver is always the deployer; additional solvers extend this list.
const KNOWN_SOLVER_ADDRESSES: Address[] = [
  '0x8bD204E42a3Ae3B62ea7Da8a9b4e607C2f3Dbb56', // gemini-lp (built-in solver)
];

const solverAbi = [
  {
    type: 'function', name: 'solvers', stateMutability: 'view',
    inputs: [{ name: 'solver', type: 'address' }],
    outputs: [
      { name: 'feeRecipient',           type: 'address' },
      { name: 'name',                   type: 'string'  },
      { name: 'ensName',                type: 'string'  },
      { name: 'builderCode',            type: 'bytes4'  },
      { name: 'endpoint',               type: 'string'  },
      { name: 'stake',                  type: 'uint256' },
      { name: 'fulfilledCount',         type: 'uint256' },
      { name: 'slashedAmount',          type: 'uint256' },
      { name: 'status',                 type: 'uint8'   },
      { name: 'withdrawalRequestedAt',  type: 'uint256' },
    ],
  },
  {
    type: 'function', name: 'reputation', stateMutability: 'view',
    inputs: [{ name: 'solver', type: 'address' }],
    outputs: [
      { name: 'reportedCount',   type: 'uint256' },
      { name: 'avgOutcomeScore', type: 'uint256' },
      { name: 'avgAprAccuracy',  type: 'uint256' },
      { name: 'avgInRangeBps',   type: 'uint256' },
      { name: 'lastReportedAt',  type: 'uint256' },
    ],
  },
] as const;

const STATUS_LABEL = ['Inactive', 'Active', 'Pending Withdrawal'];

export async function GET() {
  if (!registryAddress) {
    return NextResponse.json({ solvers: [] });
  }

  const results = await Promise.allSettled(
    KNOWN_SOLVER_ADDRESSES.map(async (address) => {
      const [solver, rep] = await Promise.all([
        client.readContract({ address: registryAddress, abi: solverAbi, functionName: 'solvers', args: [address] }),
        client.readContract({ address: registryAddress, abi: solverAbi, functionName: 'reputation', args: [address] }),
      ]);

      return {
        address,
        name:         solver[1],
        ensName:      solver[2],
        builderCode:  solver[3],
        endpoint:     solver[4],
        stakeEth:     (Number(solver[5]) / 1e18).toFixed(4),
        fulfilledCount: Number(solver[6]),
        status:       STATUS_LABEL[solver[8]] ?? 'Unknown',
        reputation: {
          reportedCount:   Number(rep[0]),
          avgOutcomeScore: Number(rep[1]),
          avgAprAccuracy:  Number(rep[2]),
          avgInRangeBps:   Number(rep[3]),
        },
      };
    }),
  );

  type SolverResult = {
    address: Address; name: string; ensName: string; builderCode: string;
    endpoint: string; stakeEth: string; fulfilledCount: number; status: string;
    reputation: { reportedCount: number; avgOutcomeScore: number; avgAprAccuracy: number; avgInRangeBps: number };
  };

  const solvers = (results as PromiseSettledResult<SolverResult>[])
    .filter((r): r is PromiseFulfilledResult<SolverResult> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter(s => s.name); // skip unregistered addresses

  return NextResponse.json({ solvers }, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}
