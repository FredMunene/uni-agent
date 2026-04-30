# Uni-Agent — Architecture, Economics & User Flow

---

## Why This Exists — The Research Case

### The LP Management Problem

Uniswap v3 and v4 introduced concentrated liquidity — LPs earn dramatically more fees
by providing liquidity within a price range instead of full-range. But this comes with
a cost most users cannot manage:

- **~50% of Uniswap v3 liquidity is out of range at any given time** (Topaze Blue, 2023)
  — meaning half of all LP capital earns zero fees while still exposed to impermanent loss.
- **Bancor research (2021)** found that 49.5% of Uniswap v3 LPs lost money compared
  to simply holding — primarily due to unmanaged range drift.
- **JIT liquidity** (just-in-time) bots actively exploit passive LPs around large swaps,
  further eroding returns for retail positions.
- **Median LP on Uniswap v3 holds a position for <7 days** before abandoning it
  (Uniswap Labs data, 2022) — not because they want to exit, but because managing it
  manually is too complex.

### Why People Still Engage

Despite these risks, DeFi LP participation grows because:

- Fee APRs of 10–80% are unavailable in traditional finance
- Stablecoin pairs (USDC/USDT) offer near-zero IL with 3–6% APR — better than any savings account
- On-chain composability: LP positions are programmable, collateralizable, transferable
- Self-custody: no counterparty risk from a centralized exchange

### The Gap Uni-Agent Fills

Users want yield. They don't want to manage tick ranges, read pool math, or know when
to rebalance. Existing solutions:

| Solution | Problem |
|---|---|
| Arrakis / Gamma | Vault-based, you give up custody |
| 1inch / ParaSwap | Only swaps, no LP |
| DeFi Llama yield | Data only, no execution |
| Manual Uniswap UI | Complex, no rebalancing alerts |

**Uni-Agent**: intent in, optimal position out. Non-custodial. AI-managed. Solver-competed.

---

## What It Is

An **open intent execution protocol** for DeFi liquidity positioning.

Users submit a plain-English financial intent. Any registered AI agent, protocol, or
algorithm (a "solver") can respond with a competing execution strategy and lock a
bid bond to signal confidence. The user picks the best strategy and signs the txs.
The winning solver earns a protocol fee. The protocol monitors the position and
generates rebalancing intents autonomously when price drifts out of range.

The reference UI is one consumer of the protocol — not the protocol itself.

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         INTENT LAYER                             │
│                                                                  │
│  User / dApp / bot                                               │
│  POST /api/v1/intents  { goal, asset, amount, risk, deadline }   │
│                 │                                                │
│                 ├─▶ Redis: intent:{id}                           │
│                 └─▶ IntentRegistry.sol: emit IntentCreated       │
└─────────────────────────────┬────────────────────────────────────┘
                              │  solvers listen on-chain + webhook
┌─────────────────────────────▼────────────────────────────────────┐
│                         SOLVER LAYER                             │
│                                                                  │
│  Any registered solver can respond:                              │
│                                                                  │
│  Solver A (Gemini 2.0 Flash — built-in)                          │
│    tool 1: get_swap_quote    Uniswap Trading API                 │
│    tool 2: get_lp_params     v4 PositionManager math             │
│    tool 3: simulate_bundle   eth_call gas estimate               │
│    tool 4: get_pool_apr      Uniswap subgraph / The Graph        │
│    → submits 3 strategies + locks bid bond (0.001 ETH each)      │
│                                                                  │
│  Solver B (external AI agent, GPT / Claude / specialist model)   │
│    → submits competing strategies + locks bid bond               │
│                                                                  │
│  Solver C (protocol-specific e.g. Aerodrome, Beefy)              │
│    → submits strategies from its own pool data                   │
│                                                                  │
│  All strategies visible to user ranked by: APR, risk, gas        │
└─────────────────────────────┬────────────────────────────────────┘
                              │  user selects strategy
┌─────────────────────────────▼────────────────────────────────────┐
│                       SETTLEMENT LAYER                           │
│                                                                  │
│  IntentRegistry.sol: selectStrategy(intentId, strategyId)        │
│    → winning solver: bid bond returned + fee earned              │
│    → losing solvers: bid bonds returned                          │
│    → emit IntentFulfilled(intentId, winnerAddress, fee)          │
└─────────────────────────────┬────────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────────┐
│                      EXECUTION LAYER                             │
│                                                                  │
│  wagmi useWriteContract (user signs, non-custodial)              │
│                                                                  │
│  Tx 1  Permit2            approve USDC spend                     │
│  Tx 2  Universal Router   swap 50% USDC → WETH                   │
│  Tx 3  v4 PositionManager addLiquidity(USDC, WETH, tick range)   │
│                                                                  │
│  Real txs on Base Sepolia. Protocol never holds user funds.      │
└─────────────────────────────┬────────────────────────────────────┘
                              │  positionTokenId stored
┌─────────────────────────────▼────────────────────────────────────┐
│                       MONITOR LAYER                              │
│                                                                  │
│  GET /api/v1/positions/:posId/monitor (poll every 60s)           │
│  v0: reads the recorded position snapshot from the registry      │
│  and derives a demo-grade health signal                           │
│                                                                  │
│  v1+: reads current pool tick from v4 PoolManager via viem       │
│  and compares to position tickLower / tickUpper                  │
│                                                                  │
│  In range  → show position value, fees earned                    │
│  Out of range →                                                  │
│    auto-create rebalancing intent                                │
│    alert user → one-click approve → remove → swap → add_liq     │
└──────────────────────────────────────────────────────────────────┘
```

---

## Full User Flow

```
Step 1 — Connect
  User opens app, connects MetaMask or Coinbase Wallet via RainbowKit
  wagmi reads connected address, balance displayed

Step 2 — State Intent
  User types: "Make 500 USDC work for me, medium risk"
  or structured: { inputToken: USDC, amount: 500, risk: medium }

Step 3 — Solvers Compete (off-chain + on-chain)
  POST /api/v1/intents → intent stored, IntentCreated emitted on-chain
  Built-in Gemini solver triggers immediately
  External solvers (if registered) receive webhook + see on-chain event
  Each solver:
    - fetches live quotes from Uniswap Trading API
    - queries subgraph for real 7-day APR
    - estimates gas via eth_call
    - submits strategy + bid bond

Step 4 — User Picks Strategy
  UI shows competing strategy cards, each displaying:
    ┌────────────────────────────────┐
    │ BALANCED          RECOMMENDED  │
    │ USDC/WETH 0.05% full-range     │
    │ APR: 12.4%   Gas: ~$0.08       │
    │ IL Risk: Low  Max Loss: $4.20  │
    │ Solver: Gemini-LP-v1           │
    │ Bond: 0.001 ETH locked         │
    └────────────────────────────────┘
  User selects one

Step 5 — Execute (3 txs, user signs each)
  Tx 1: Permit2.approve(USDC, Universal Router, amount)
  Tx 2: UniversalRouter.execute(swap USDC → WETH)
  Tx 3: PositionManager.mint(USDC, WETH, tickLower, tickUpper)

Step 6 — Settlement
  IntentRegistry.fulfillIntent(intentId, strategyId)
  Winning solver: receives 0.1% of position value + bid bond back
  Losing solvers: bid bonds returned
  User: holds LP position NFT, non-custodial

Step 7 — Monitor
  v0: Protocol polls registry-backed snapshot every 60s
  v1+: Protocol polls pool tick every 60s
  Position card shows: current value, fees earned, range status

Step 8 — Rebalance (if needed)
  Price drifts outside tickLower / tickUpper
  Alert: "Your position is out of range. Earning 0 fees."
  One-click: "Rebalance" → new intent → solvers compete again → user approves 3 txs
```

---

## Economics

### Protocol Fee
- **0.1% of input amount** deducted at execution time
- Split: **70% to winning solver**, **30% to protocol treasury**
- Example: user deposits 1000 USDC → $1.00 fee → $0.70 to solver, $0.30 to treasury

### Solver Registration
- One-time stake: **0.05 ETH** deposited into `IntentRegistry.sol`
- Stake is slashed if solver: submits a strategy then goes offline, or submits invalid calldata
- Solver withdraws stake by calling `withdrawSolver()` (24hr timelock)

### Bid Bond (per strategy submission)
- Solver locks **0.001 ETH** when submitting each strategy
- Bond purpose: signals genuine confidence, deters spam submissions
- On resolution:
  - **Winner**: bond returned + earns solver fee
  - **Losers**: bonds returned, no penalty
  - **No-show** (submitted but strategy expired): bond slashed

### Strategy Expiry
- All submitted strategies have a `validUntil` timestamp (5 min TTL)
- Quotes become stale — if user doesn't select within 5 min, strategies expire
- Solver gets bond back on expiry, user must re-trigger solvers

### Example Economics at Scale

| Daily volume | Protocol fee (0.1%) | Solver share (70%) | Treasury (30%) |
|---|---|---|---|
| $10,000 / day | $10 | $7 | $3 |
| $100,000 / day | $100 | $70 | $30 |
| $1,000,000 / day | $1,000 | $700 | $300 |

Solvers are incentivized to offer the most accurate APR estimates and lowest gas costs —
better strategies win more often, earning more fees.

---

## Agent Identity — ENS + Builder Codes

AI agents are first-class on-chain participants in this protocol. Trust is established
through two composable layers: **human-readable identity** (ENS) and
**immutable attribution** (builder codes in calldata).

### ENS as Agent Identity

Each solver registers an ENS name. The protocol controls a parent domain
(`solvers.uni-agent.eth`) and issues subdomains only to staked, registered agents —
the subdomain itself becomes a trust signal.

```
gemini-lp.solvers.uni-agent.eth
  ├── addr               → 0xSolverAddress  (fee recipient)
  ├── text: description  → "Uniswap v4 LP optimizer"
  ├── text: url          → https://myagent.xyz/api
  ├── text: version      → "2.1.0"
  ├── text: capabilities → "swap,lp,rebalance"
  └── text: model        → "gemini-2.5-flash"
```

**Why ENS:**
- Agents have a durable, human-readable identity that persists across key rotations
- Reputation accrues to the name, not the private key
- Users see `gemini-lp.solvers.uni-agent.eth` in strategy cards — not `0xABC...`
- ENS text records are the agent's public spec sheet — capabilities, model, version
- Subdomains under the protocol-controlled parent signal the agent passed registration

**No existing ERC covers this.** ERC-7715 (MetaMask, 2024) scopes wallet permissions
for delegating to agents but does not address agent identity or verifiability.
EIP-7702 (Pectra) lets EOAs run smart contract code temporarily but doesn't answer
"who built this agent." ENS is currently the most practical composable primitive.

### Builder Codes (Calldata Attribution)

Inspired by Base's Onchain Kit referral attribution and mini-app builder codes:
when a user executes a solver's strategy, the **solver's 4-byte builder code is
embedded in the execution calldata**. This creates an immutable on-chain record of
which agent authored each strategy — the builder code is the agent's execution fingerprint.

```
execution tx calldata:
  [permit2 data]
  [swap params]
  [lp params]
  [0xDEAD1234]   ← solver builder code (last 4 bytes, immutable once broadcast)
```

`IntentRegistry.sol` reads the builder code, looks up the registered solver address,
and routes the 0.1% execution fee automatically. No off-chain coordination required.

**Builder code registry:**
```
solver address    builder code    ENS name
0xABC...          0xDEAD1234      gemini-lp.solvers.uni-agent.eth
0xDEF...          0xBEEF5678      specialist-v2.solvers.uni-agent.eth
```

Every fulfilled intent becomes on-chain proof of that agent's execution history —
accumulated across all users, permanently auditable, composable with any analytics tool.

### Combined Trust Model

```
Agent registers:
  address        = 0xABC...
  ensName        = gemini-lp.solvers.uni-agent.eth
  builderCode    = 0xDEAD1234   ← 4-byte unique code, assigned at registration
  stake          = 0.05 ETH     ← economic skin in the game

User executes:
  tx calldata includes 0xDEAD1234
  IntentRegistry reads it → routes 0.1% fee to 0xABC...
  ENS name displayed to user in strategy card and position history
  event: IntentFulfilled(intentId, solver="gemini-lp.solvers.uni-agent.eth", fee)

Over time:
  agent builds on-chain history: N fulfilled intents, 0 slashes
  reputation is public, composable, non-custodial
  users can filter strategy cards by solver reputation
```

| Trust layer | What it proves |
|---|---|
| Registration stake (0.05 ETH) | Economic commitment, slashable |
| ENS name (protocol subdomain) | Identity passed protocol onboarding |
| Builder code in calldata | Immutable attribution per execution |
| On-chain fulfillment history | Track record, publicly auditable |
| Bid bond per strategy | Confidence signal, not spam |

---

## Solver Registration (AI Agent Native)

Any AI agent, protocol, or bot can become a solver:

```
IntentRegistry.registerSolver(
  address feeRecipient,    // where fees are paid
  string calldata name,    // "Gemini-LP-v1"
  string calldata ensName, // "gemini-lp.solvers.uni-agent.eth"
  bytes4 builderCode,      // 4-byte attribution code embedded in exec calldata
  string calldata endpoint // webhook URL for push notifications
) external payable         // must send 0.05 ETH stake
```

The protocol pushes intents to registered endpoints:
```json
POST https://your-solver.example.com/intents
{
  "intentId": "int_abc123",
  "userAddress": "0x...",
  "inputToken": "USDC",
  "inputAmount": "500000000",
  "goal": "medium risk yield",
  "risk": "medium",
  "deadline": "2026-04-28T12:05:00Z"
}
```

Solver responds by calling:
```
IntentRegistry.submitStrategy(
  bytes32 intentId,
  bytes calldata planJson,  // serialized Plan
  uint256 validUntil
) external payable           // must send 0.001 ETH bid bond
```

No whitelist. No permission required. Any agent with 0.05 ETH stake can participate.

---

## Protocol API (Open)

```
POST   /api/v1/intents                         Submit intent
GET    /api/v1/intents/:id                     Get intent + status
POST   /api/v1/intents/:id/plan                Trigger built-in solver
GET    /api/v1/intents/:id/plans               Get all competing strategies
POST   /api/v1/intents/:id/plans/:pid/execute  Execute chosen strategy
GET    /api/v1/executions/:execId              Track on-chain tx status
GET    /api/v1/positions/:posId/monitor        LP range drift status
POST   /api/v1/solvers/register                Register external solver
```

---

## IntentRegistry.sol Interface

```solidity
// Registration
function registerSolver(address feeRecipient, string calldata name, string calldata endpoint)
  external payable;  // 0.05 ETH stake required

function withdrawSolver() external;  // 24hr timelock

// Per-intent
function createIntent(bytes32 intentId, address asset, uint256 amount, uint8 risk)
  external;

function submitStrategy(bytes32 intentId, bytes calldata plan, uint256 validUntil)
  external payable;  // 0.001 ETH bid bond

function selectStrategy(bytes32 intentId, bytes32 strategyId)
  external;  // called by user at execution — triggers fee settlement

function fulfillIntent(bytes32 intentId)
  external;  // called after txs confirmed — releases fee to solver

// Events
event IntentCreated(bytes32 indexed intentId, address indexed caller, address asset, uint256 amount);
event StrategySubmitted(bytes32 indexed intentId, bytes32 strategyId, address indexed solver);
event IntentFulfilled(bytes32 indexed intentId, address indexed solver, uint256 fee);
event SolverSlashed(address indexed solver, uint256 amount, string reason);
```

---

## Component Map

| Component | Path | Purpose |
|---|---|---|
| Intent API | `apps/web/app/api/v1/intents/` | Intent CRUD + solver trigger |
| Execution API | `apps/web/app/api/v1/executions/` | On-chain tx tracking |
| Position Monitor | `apps/web/app/api/v1/positions/` | LP range drift |
| Solver Registry API | `apps/web/app/api/v1/solvers/` | Register external solvers |
| Gemini Agent | `apps/web/lib/agent/index.ts` | Built-in solver tool loop |
| Tool Definitions | `apps/web/lib/agent/tools.ts` | Gemini function schemas |
| Quote Service | `apps/web/lib/services/quote.ts` | Uniswap Trading API |
| APR Service | `apps/web/lib/services/apr.ts` | Uniswap subgraph (The Graph) |
| LP Service | `apps/web/lib/services/lp.ts` | v4 pool param math |
| Execute Service | `apps/web/lib/services/execute.ts` | On-chain calldata builder |
| Permit2 Service | `apps/web/lib/services/permit2.ts` | USDC spend approval |
| Monitor Service | `apps/web/lib/services/monitor.ts` | Pool tick polling |
| Registry Service | `apps/web/lib/services/registry.ts` | IntentRegistry.sol calls |
| Risk Service | `apps/web/lib/services/risk.ts` | Plan validation |
| Store | `apps/web/lib/store.ts` | Upstash Redis |
| Shared Types | `packages/shared/src/types.ts` | TypeScript types |
| Shared Schemas | `packages/shared/src/schemas.ts` | Zod validation |
| IntentRegistry | `contracts/src/IntentRegistry.sol` | On-chain settlement |
| Frontend | `apps/web/app/page.tsx` | Reference UI |

---

## On-chain Contracts (Base Sepolia — chainId 84532)

### Protocol (to deploy)
| Contract | Purpose |
|---|---|
| `IntentRegistry.sol` | Solver registration, bid bonds, fee settlement |

### Uniswap (deployed)
| Contract | Address |
|---|---|
| v4 PoolManager | `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408` |
| v4 PositionManager | `0x4B2C77d209D3405F41a037EC6c77F7F5b8e2ca80` |
| Universal Router | `0x050E797f3625EC8785265e1d9BDd4799b97528A1` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| USDC (test) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| WETH | `0x4200000000000000000000000000000000000006` |

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 App Router, React, Tailwind |
| Wallet | RainbowKit v2, wagmi v2, viem |
| Built-in Solver | Google Gemini 2.0 Flash (tool-calling) |
| DeFi Data | Uniswap Trading API, Uniswap v3 subgraph (The Graph) |
| On-chain Execution | Uniswap Universal Router, v4 PositionManager, Permit2 |
| Protocol Contract | IntentRegistry.sol (Base Sepolia) |
| Storage | Upstash Redis |
| Deploy | Vercel (Fluid Compute) |
| Monorepo | Turborepo, shared Zod types |

---

## Key Design Decisions

**Protocol-first, UI-second** — The REST API is the product. The frontend is a reference
implementation. Any dApp integrates the same endpoints.

**Non-custodial always** — The protocol never holds user funds. Permit2 approvals are
scoped to exact amounts. Solvers never touch user assets.

**Bid bond = quality signal** — Solvers with skin in the game submit accurate strategies.
The bond amount is small enough to be accessible but meaningful enough to deter spam.

**AI as competing solver, not oracle** — Gemini is the built-in solver, but it has no
privileged position. An external model with better pool data can outcompete it and earn
more fees.

**Rebalancing preserves intent** — When a position goes out of range, the protocol
re-uses the same intent → solver → approve → execute flow. Users only ever approve,
never configure.
