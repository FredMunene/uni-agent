# Implementation Plan

Hackathon ends: May 6, 2026. Today: April 28.
**8 days remaining.**

---

## Current Status (Done)

- [x] Intent REST API (Next.js route handlers)
- [x] Gemini 2.0 Flash agent — single-strategy tool loop
- [x] Uniswap Trading API quote integration
- [x] RainbowKit v2 wallet connect (MetaMask + Coinbase)
- [x] Upstash Redis persistence
- [x] Time-based execution simulation
- [x] Human-readable USDC amount input
- [x] Monorepo merged into single Next.js app (Vercel-ready)
- [x] Shared types: `SolverMeta`, `StrategyLabel`, `SolverStatus` added
- [x] Plan hashes stamped server-side and shown in the UI
- [x] Execution route binds owner, lifecycle, duplicate, and integrity checks
- [x] Execution state transitions fail safe on persistence errors
- [x] Execution payloads require a valid plan hash format
- [x] Execution requests are signed in-wallet and verified server-side
- [x] Intent planning and execution helpers have tests
- [x] Plan integrity validation rejects tampered execution payloads
- [x] Execution duplicate submissions are rejected in the live store
- [x] Vault refunds are restricted to the depositor only
- [x] Foundry test suite passes for vault and executor hardening

---

## Phase 1 — Multiple Strategies + Real APR
**Target: April 29 | ~1 day**

Goal: Gemini generates 3 competing strategies with real yield data. User picks one.

- [ ] `lib/services/apr.ts` — query Uniswap v3 subgraph (The Graph) for 7-day fee APR
- [ ] `lib/agent/tools.ts` — add `get_pool_apr` tool definition
- [ ] `lib/agent/index.ts` — update system prompt to output 3 strategies (conservative / balanced / aggressive)
- [ ] `packages/shared/src/types.ts` — `strategy` field already added to `Plan`
- [ ] `app/api/v1/intents/[id]/plan/route.ts` — return array of 3 plans
- [ ] `app/page.tsx` — strategy picker cards showing: APR, IL risk, gas, solver name, recommended badge

Strategies:
| Label | Pool | APR | IL Risk | Tick Range |
|---|---|---|---|---|
| Conservative | USDC/USDT 0.01% | ~4% | None | Full |
| Balanced | USDC/WETH 0.05% | ~12% | Low | Full |
| Aggressive | USDC/WETH 0.05% | ~40% | High | ±5% around current price |

Milestone: UI shows 3 plan cards with real APR from subgraph. User selects before executing.

---

## Phase 2 — Solver Registration + Bid Bond (Protocol Layer)
**Target: April 30 | ~1 day**

Goal: Solvers register on-chain with a stake. Each strategy submission requires a bid bond.

- [ ] `contracts/src/IntentRegistry.sol` — full contract:
  - `registerSolver(feeRecipient, name, endpoint)` payable — 0.05 ETH stake
  - `submitStrategy(intentId, planJson, validUntil)` payable — 0.001 ETH bid bond
  - `selectStrategy(intentId, strategyId)` — user picks, triggers settlement
  - `fulfillIntent(intentId)` — releases fee to solver after tx confirmed
  - `withdrawSolver()` — 24hr timelock
  - events: `IntentCreated`, `StrategySubmitted`, `IntentFulfilled`, `SolverSlashed`
- [ ] Deploy to Base Sepolia, verify on Basescan
- [ ] `lib/services/registry.ts` — viem calls to `createIntent` and `fulfillIntent`
- [ ] `app/api/v1/solvers/register/route.ts` — register external solver endpoint
- [ ] Update `SolverMeta` type with `bidBondWei` + `validUntil`

Milestone: Intent submitted via UI emits `IntentCreated` on-chain. Solver registration visible on Basescan.

---

## Phase 3 — Real On-chain Execution
**Target: May 1–2 | ~2 days**

Goal: Replace simulation with real txs. User signs in wallet. Solver fee settled on-chain.

- [ ] `lib/services/permit2.ts` — Permit2 USDC approval calldata
- [ ] `lib/services/execute.ts` — Universal Router swap calldata + v4 PositionManager addLiquidity calldata
- [ ] `app/api/v1/intents/[id]/plans/[planId]/execute/route.ts` — return calldata, trigger `selectStrategy` on registry
- [ ] `app/page.tsx` — `useWriteContract` for Tx1 (Permit2), Tx2 (swap), Tx3 (add_liq)
- [ ] `app/page.tsx` — `useWaitForTransactionReceipt` for real tx status
- [ ] On confirmation: call `fulfillIntent` on registry, store real `txHash` + `positionTokenId` in Redis

Tx flow:
```
Tx 1: Permit2.approve(USDC, Universal Router, amount)
Tx 2: UniversalRouter.execute(swap 50% USDC → WETH)
Tx 3: PositionManager.mint(USDC, WETH, fee, tickLower, tickUpper)
registry.fulfillIntent(intentId)  ← 0.1% fee sent to winning solver
```

Milestone: Real LP position created on Base Sepolia. txHash + positionTokenId in UI. Solver fee paid.

---

## Phase 4 — Autonomous Rebalancing Monitor
**Target: May 3 | ~1 day**

Goal: Protocol watches the LP and surfaces rebalancing as a new intent when out of range.

- [ ] `lib/services/monitor.ts` — `viem.readContract` on v4 PoolManager for current tick
- [ ] Compare current tick to `tickLower` / `tickUpper` stored in Redis
- [ ] `app/api/v1/positions/[posId]/monitor/route.ts` — returns `{ inRange, currentTick, tickLower, tickUpper, driftPercent }`
- [ ] `app/page.tsx` — poll monitor every 60s when position active
- [ ] Show position card: fees earned, current value, range status indicator
- [ ] Out-of-range banner: "Earning 0 fees. Rebalance?" → one-click → new intent → Phase 1–3 repeats

Milestone: UI detects out-of-range position and offers one-click rebalance.

---

## Phase 5 — Deploy + Demo Prep
**Target: May 4–5 | ~2 days**

- [ ] `export const maxDuration = 60` on plan route (Gemini calls ~20s)
- [ ] Remove broken `dev:api` script from root `package.json`
- [ ] Deploy to Vercel production
- [ ] Add env vars to Vercel dashboard:
  - `GEMINI_API_KEY`
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`
  - `NEXT_PUBLIC_WC_PROJECT_ID`
- [ ] Get Base Sepolia test USDC from faucet
- [ ] Run full flow 3× end to end (connect → intent → pick → sign → monitor → rebalance)
- [ ] Record demo video (2–4 min):
  - Connect wallet
  - Type intent
  - Show 3 competing strategies with real APR
  - Pick balanced strategy
  - Sign 3 txs in MetaMask
  - Show LP position confirmed on Basescan
  - Show monitor detecting out-of-range
  - Show rebalance flow

---

## Phase 6 — Submit
**Target: May 6**

- [ ] README finalized with quickstart + architecture diagram
- [ ] ETHGlobal form complete (all fields answered)
- [ ] Uniswap Foundation prize track selected
- [ ] IntentRegistry.sol address on Basescan linked in submission
- [ ] Demo video uploaded
- [ ] GitHub repo public

---

## Scope

**In scope:**
- Open REST API (protocol layer, any dApp integrates)
- 3 competing AI-generated strategies with real APR from Uniswap subgraph
- Solver registration + stake + bid bond (IntentRegistry.sol)
- Solver fee settlement on-chain (0.1% of position, 70% to solver)
- Real on-chain execution (Permit2 → Universal Router → v4 PositionManager)
- Autonomous LP range monitor + rebalancing alerts

**Out of scope:**
- Multi-chain routing / bridging
- Borrow / lending steps
- Keeper network (autonomous signing — rebalancing requires user approval by design)
- Solver slashing enforcement (tracked but not auto-enforced in hackathon scope)
- Mobile layout optimization

---

## Release Roadmap

The build should be treated as staged productization, not a single launch.

- v0: actualize the core user flow on testnet and prove the intent -> plan -> execute -> monitor loop
- v1: deploy the working product on Base mainnet once the v0 path is stable
- v0.1: return to testnet and harden the system by closing safety gaps, edge cases, and execution risks
- v2: redeploy the hardened system on Base mainnet

Hardening targets for v0.1:

- strict intent and execution authorization
- onchain signature binding for plan execution
- enforced slippage, deadline, and token invariants
- safer target allowlisting and calldata validation
- clearer failure and refund handling
- better monitoring for stale quotes, step failures, and out-of-range positions

---

## Remaining For v0

To make the testnet version complete, the remaining work is mostly product integration, not core security plumbing:

- replace the placeholder transaction execution with actual wallet-signed calls
- finish the APR-backed 3-strategy flow in the current UI if any branch is still stubbed
- validate the monitor/rebalance loop end to end on testnet
- capture the testnet run in a reproducible demo script

After that:

- v1 is the Base mainnet launch of the working flow
- v0.1 is the return-to-testnet hardening cycle
- v2 is the mainnet redeploy after hardening
