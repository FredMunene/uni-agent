import { NextResponse } from 'next/server';
import { createPublicClient, http, type Address } from 'viem';
import { baseSepolia } from 'viem/chains';

const registryAddress = process.env.NEXT_PUBLIC_INTENT_REGISTRY_ADDRESS as Address | undefined;

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.RPC_BASE_SEPOLIA ?? 'https://sepolia.base.org'),
});

type SolverEntry = {
  address: string;
  name: string;
  ensName: string;
  builderCode: string;
  stakeEth: string;
  fulfilledCount: number;
  status: string;
  demo?: boolean;
  reputation: { reportedCount: number; avgOutcomeScore: number; avgAprAccuracy: number; avgInRangeBps: number };
};

// On-chain addresses to read live. Add new solver addresses here as they register.
const ONCHAIN_ADDRESSES: Address[] = [
  '0x8bD204E42a3Ae3B62ea7Da8a9b4e607C2f3Dbb56', // gemini-lp (built-in solver)
];

// Demo solver entries shown alongside live on-chain data.
// These represent the open solver marketplace — replace with real registrants over time.
const DEMO_SOLVERS: SolverEntry[] = [
  {
    address: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD',
    name: 'Claude LP Agent',
    ensName: 'claude-lp.solvers.uni-agent.eth',
    builderCode: '0xC1A1C1A1',
    stakeEth: '0.0010',
    fulfilledCount: 12,
    status: 'Active',
    demo: true,
    reputation: { reportedCount: 10, avgOutcomeScore: 8750, avgAprAccuracy: 9100, avgInRangeBps: 8400 },
  },
  {
    address: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    name: 'GPT-4o Yield Bot',
    ensName: 'gpt4-yield.solvers.uni-agent.eth',
    builderCode: '0x6F707434',
    stakeEth: '0.0010',
    fulfilledCount: 7,
    status: 'Active',
    demo: true,
    reputation: { reportedCount: 6, avgOutcomeScore: 7900, avgAprAccuracy: 8200, avgInRangeBps: 7600 },
  },
  {
    address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    name: 'DeepSeek Range Optimizer',
    ensName: 'deepseek-range.solvers.uni-agent.eth',
    builderCode: '0xD33F5EEE',
    stakeEth: '0.0010',
    fulfilledCount: 3,
    status: 'Active',
    demo: true,
    reputation: { reportedCount: 2, avgOutcomeScore: 8100, avgAprAccuracy: 7800, avgInRangeBps: 8500 },
  },
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
  // Read live on-chain solvers
  const liveResults = registryAddress
    ? await Promise.allSettled(
        ONCHAIN_ADDRESSES.map(async (address) => {
          const [solver, rep] = await Promise.all([
            client.readContract({ address: registryAddress, abi: solverAbi, functionName: 'solvers', args: [address] }),
            client.readContract({ address: registryAddress, abi: solverAbi, functionName: 'reputation', args: [address] }),
          ]);
          return {
            address,
            name:         solver[1],
            ensName:      solver[2],
            builderCode:  solver[3],
            stakeEth:     (Number(solver[5]) / 1e18).toFixed(4),
            fulfilledCount: Number(solver[6]),
            status:       STATUS_LABEL[solver[8]] ?? 'Unknown',
            reputation: {
              reportedCount:   Number(rep[0]),
              avgOutcomeScore: Number(rep[1]),
              avgAprAccuracy:  Number(rep[2]),
              avgInRangeBps:   Number(rep[3]),
            },
          } as SolverEntry;
        }),
      )
    : [];

  const liveAddresses = new Set<string>();
  const liveSolvers: SolverEntry[] = [];

  for (const r of liveResults) {
    if (r.status === 'fulfilled' && r.value.name) {
      liveSolvers.push(r.value);
      liveAddresses.add(r.value.address.toLowerCase());
    }
  }

  // Merge demo solvers for addresses not already returned from chain
  const demoSolvers = DEMO_SOLVERS.filter(s => !liveAddresses.has(s.address.toLowerCase()));

  return NextResponse.json(
    { solvers: [...liveSolvers, ...demoSolvers] },
    { headers: { 'Access-Control-Allow-Origin': '*' } },
  );
}
