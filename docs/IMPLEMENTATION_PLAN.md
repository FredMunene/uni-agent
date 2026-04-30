# Implementation Plan

Hackathon ends: May 6, 2026. Today: April 30.
**6 days remaining.**

---

## Progress Overview

```
Protocol layer     ████████████░░░░  75%   API, types, plan hash, execution auth
Solver layer       ████████░░░░░░░░  50%   Gemini 3-strategy loop, APR, bid meta
Agent identity     ████░░░░░░░░░░░░  25%   Designed, in contract, not wired to TS
Smart contract     ██████████████░░  90%   Full contract + 50 tests — needs deploy
On-chain exec      ████░░░░░░░░░░░░  25%   Calldata builders exist, txs not live
Frontend           █████████████░░░  80%   Landing, risk-matched strategies, approval flow
Demo readiness     ████████░░░░░░░░  50%   Flow works, needs real txs + video
```

---

## Done

### Protocol / API
- [x] Intent REST API (POST, GET, status lifecycle)
- [x] Upstash Redis persistence for intents, plans, executions
- [x] Plan hash stamped server-side (`keccak256` of strategy fingerprint)
- [x] Execution route: owner binding, lifecycle checks, duplicate rejection, integrity check
- [x] Execution requests signed in-wallet, verified server-side
- [x] Execution state transitions fail-safe on persistence errors
- [x] `maxDuration = 60` on plan route for Gemini latency

### Solver / AI
- [x] Gemini 2.5 Flash agent with tool-calling loop (`get_swap_quote`, `get_lp_params`, `simulate_bundle`)
- [x] Uniswap Trading API quote integration
- [x] 3-strategy output: Conservative / Balanced / Aggressive from one Gemini loop
- [x] Live APR snapshots per strategy (stable / balanced / aggressive pools)
- [x] Active market config layer for one target LP market, with expansion path for more pairs
- [x] `SolverMeta` type: `solverAddress`, `solverName`, `bidBondWei`, `validUntil`
- [x] `StrategyLabel`, `SolverStatus` types in shared package
- [x] Retry logic for transient Gemini 503 / 429 errors
- [x] Risk-preferred strategy recommendation (`recommendedPlanId`)

### Smart Contracts
- [x] `IntentRegistry.sol` — full contract: registration, bid bond, intent lifecycle, fee settlement, reputation, slash, pause, treasury pull, admin setters
- [x] `IntentExecutor.sol` — wired to IntentRegistry for fee settlement via builder code
- [x] `IntentVault.sol`, `PositionRegistry.sol`, `MockLendingAdapter.sol`
- [x] `Deploy.s.sol` — deploys all contracts, registers built-in Gemini solver
- [x] 50 passing tests: registration, withdrawal, intent lifecycle, fulfillment, reputation, pause, setters, treasury
- [x] Deployer wallet generated, `.env` configured for Base Sepolia
- [x] Configurable `registrationStake` (0.001 ETH) and `bidBond` (0.0001 ETH) for testnet
- [x] `getProtocolParams()` view — agents query fees before registering

### Frontend
- [x] Landing page with Human / Agent mode selector
- [x] Human flow: intent input → 3 strategy cards → approval → execution → position
- [x] Selected strategy collapses into an exact-plan approval screen before wallet signing
- [x] Human flow copy and status surfaces read from the active market config
- [x] Agent flow: solver API docs with code snippets + economics table (copy buttons)
- [x] RainbowKit v2 wallet connect (MetaMask + Coinbase)
- [x] ENS + Basename resolution displayed in wallet button
- [x] Strategy cards: APR, gas, max loss, risk badge, plan hash, recommended badge
- [x] Position monitor card with rebalance trigger
- [x] Light theme (orange / white / grey), mobile-responsive

### Infrastructure
- [x] Monorepo (Turborepo), single Next.js app, Vercel-ready
- [x] Shared Zod schemas + TypeScript types (`packages/shared`)
- [x] Plan integrity validation rejects tampered execution payloads
- [x] CLI demo script: intent → plan → execute → monitor → rebalance
- [x] Foundry test suite for vault and executor hardening
- [x] Range-aware monitor snapshot helper for stored tick bounds

---

## Phase 1 — Multiple Strategies + Real APR ✅ Complete

- [x] 3-strategy output from single Gemini tool loop
- [x] Live APR snapshots (stable / balanced / aggressive)
- [x] Strategy picker cards with APR, gas, max loss, risk badge
- [x] `recommendedPlanId` selected by risk preference
- [x] Explicit v0 market target: Base `USDC/WETH 0.05%`, with market config abstraction for future pairs
- [x] UI and status routes consume the same active market labels
- [x] `lib/services/apr.ts` — wire live Uniswap v3 subgraph query when `UNISWAP_V3_BASE_SUBGRAPH_URL` or `THE_GRAPH_API_KEY` is configured

---

## Phase 1.5 — Agent Identity (ENS + Builder Codes) ✅ Contract done, TS pending

Goal: Solvers have human-readable ENS identity. Execution calldata embeds a builder code
for immutable on-chain attribution and automatic fee routing.

- [x] `contracts/src/IntentRegistry.sol` — `registerSolver` accepts `ensName` + `builderCode`
- [x] `contracts/src/IntentRegistry.sol` — `fulfillIntent` verifies builder code, routes fee to solver
- [x] Built-in solver hard-codes `builderCode: 0xDEAD1234`, `ensName: gemini-lp.solvers.uni-agent.eth` in deploy script
- [ ] `SolverMeta` type — add `ensName: string` and `builderCode: string` (4-byte hex)
- [ ] `lib/services/registry.ts` — emit `builderCode` in `fulfillIntent` calldata
- [ ] `app/page.tsx` — strategy cards display `ensName` instead of raw solver address
- [ ] `app/api/v1/solvers/register/route.ts` — accept + store `ensName` and `builderCode`

---

## Phase 2 — Solver Registration + Bid Bond ✅ Contract done, needs deploy

Goal: Deploy IntentRegistry to Base Sepolia and wire TypeScript services to it.

- [x] `contracts/src/IntentRegistry.sol` — full contract written and tested
- [ ] **Deploy to Base Sepolia** — fund deployer `0x8bD204E42a3Ae3B62ea7Da8a9b4e607C2f3Dbb56` with ~0.005 ETH, run `forge script script/Deploy.s.sol --rpc-url $RPC_BASE_SEPOLIA --broadcast --verify`
- [ ] `lib/services/registry.ts` — viem calls to `createIntent` and `fulfillIntent`
- [ ] `app/api/v1/solvers/register/route.ts` — register external solver endpoint
- [ ] Update `SolverMeta` type with `bidBondWei` + `validUntil`
- [ ] Set `NEXT_PUBLIC_INTENT_REGISTRY_ADDRESS` in `.env` after deploy

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

- [x] `lib/services/monitor.ts` derives in-range / drift status when tick bounds are available
- [x] `/api/v1/positions/[posId]/monitor` can fall back to stored execution tick metadata before the live oracle is finished
- [x] `/api/v1/positions/[posId]/monitor` prefers a live Uniswap v3 `slot0.tick` when `UNISWAP_V3_POOL_ADDRESS` is configured
- [x] Position UI surfaces whether monitor status comes from a live tick or stored fallback data
- [x] Execution status payload carries stored range metadata for downstream UI/monitor consumers
- [x] Position card shows the target LP range from stored execution metadata
- [x] Compare current tick to `tickLower` / `tickUpper` stored in Redis
- [x] `app/api/v1/positions/[posId]/monitor/route.ts` — returns `{ inRange, currentTick, tickLower, tickUpper, driftPercent }`
- [x] `app/page.tsx` — poll monitor every 60s when position active
- [ ] `lib/services/monitor.ts` — `viem.readContract` on v4 PoolManager for current tick
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
  - `NEXT_PUBLIC_INTENT_REGISTRY_ADDRESS`
  - `NEXT_PUBLIC_INTENT_EXECUTOR_ADDRESS`
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
- One production-style target market for v0: Base `USDC/WETH 0.05%`
- 3 competing AI-generated strategies with real APR from Uniswap subgraph
- Solver registration + stake + bid bond (IntentRegistry.sol)
- Solver fee settlement on-chain (0.1% of position, 70% to solver)
- Real on-chain execution (Permit2 → Universal Router → v4 PositionManager)
- Autonomous LP range monitor + rebalancing alerts

**Out of scope:**
- Multi-chain routing / bridging
- Broad multi-market LP support in v0 (infra is being shaped for expansion, but the shipped target remains one market)
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

Contract upgradeability for v1:

- Wrap `IntentRegistry` in a UUPS proxy (OpenZeppelin `UUPSUpgradeable`)
- Replace constructor with `initialize()` — owner, treasury, oracle set at init
- Deploy via `ERC1967Proxy` so the contract address stays stable across logic upgrades
- Add `_authorizeUpgrade` gated to `onlyOwner`

Hardening targets for v0.1:

- strict intent and execution authorization
- onchain signature binding for plan execution
- enforced slippage, deadline, and token invariants
- safer target allowlisting and calldata validation
- clearer failure and refund handling
- better monitoring for stale quotes, step failures, and out-of-range positions

---

## Remaining For v0

Critical path to demo (in order):

1. **Deploy contracts** — fund deployer, run `forge script`, get contract addresses
2. **Wire `registry.ts`** — `createIntent` + `fulfillIntent` viem calls
3. **Phase 3 real txs** — Permit2 → swap → addLiquidity in wallet
4. **Deploy to Vercel** — set env vars, smoke test
5. **Record demo video**

Known limitation:

- the current monitor is registry-snapshot based for v0; the full Uniswap tick-range oracle is tracked in [docs/issues/001-monitor-tick-range-oracle.md](/home/fred/Downloads/hackathons/uni-agent/docs/issues/001-monitor-tick-range-oracle.md)
