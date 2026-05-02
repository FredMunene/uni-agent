# Uni-Agent — Open Intent Execution Protocol

> Any AI, protocol, or algorithm can compete to fill a user's DeFi intent. The best strategy wins. The winning solver earns a fee.

---

## What it is

Uni-Agent is an **open intent execution protocol** for DeFi liquidity positioning.

Users submit a financial intent in plain English. Any registered solver — an AI agent,
a specialized protocol, a quant algorithm — can respond with a competing execution
strategy. The user picks the best one. The winning solver earns a protocol fee from
the executed position.

This is not a swap UI. The UI is a reference implementation. The protocol is the primitive.

---

## How it works

```
User submits intent
  "Make 300 USDC productive with balanced risk"
         │
         ▼
IntentRegistry.sol emits IntentCreated on-chain
         │
         ├──▶ Solver A (Gemini AI)     Conservative: USDC/USDT 0.01%, 4% APR
         ├──▶ Solver B (GPT-4o)        Balanced: USDC/WETH full-range, 12% APR
         └──▶ Solver C (Specialized)   Aggressive: USDC/WETH ±5% range, 38% APR
         │
         ▼
User picks strategy
         │
         ▼
On-chain execution (Base Sepolia)
  Tx 1: Permit2 — USDC spend approval
  Tx 2: Uniswap Universal Router — swap 50% USDC → WETH
  Tx 3: Uniswap v4 PositionManager — add_liquidity
         │
         ▼
IntentRegistry.sol emits IntentFulfilled
Winning solver receives protocol fee (0.1% of position value)
         │
         ▼
Monitor agent watches LP position every 60s
Out of range? → new rebalancing intent surfaced for approval
```

---

## Solver Economics

When a solver's strategy is selected and executed:

- **0.1% of the input amount** is paid to the solver's registered address
- Fee is settled on-chain via `IntentRegistry.sol` at execution time
- Solvers register with an address and a public API endpoint
- Any solver can be permissionlessly added — no whitelist

This creates a real market: solvers compete on yield, gas efficiency, and risk accuracy
because better strategies earn more fees.

---

## Protocol API (open — any dApp can integrate)

```
POST   /api/v1/intents                         Submit intent
GET    /api/v1/intents/:id                     Get intent + status
POST   /api/v1/intents/:id/plan                Trigger registered solvers
GET    /api/v1/intents/:id/plans               Get all competing strategies
POST   /api/v1/intents/:id/plans/:pid/execute  Execute chosen strategy
GET    /api/v1/executions/:execId              Track on-chain tx status
GET    /api/v1/positions/:posId/monitor        Monitor LP range drift
```

Full spec: [docs/API.md](./docs/API.md)

---

## On-chain Contracts (Base Sepolia)

| Contract | Address |
|---|---|
| `IntentRegistry.sol` | `0x1c105A184aA887b6b5E518CF57867b2b47a110F9` |
| `IntentExecutor.sol` | `0x6AF9304414459577d36835D17Ec4eDb61B9CFEB0` |
| `IntentVault.sol` | `0xA5e2A18D67D3505e6fcbE965665b35d5DD4Bc31e` |
| `PositionRegistry.sol` | `0x4d362FC9D4Ac955dd11a359a188Ed90d3132d07b` |
| `MockLendingAdapter.sol` | `0x8F3D8715cdbcfFb745aF587ce9a90c702F479144` |

Uniswap contracts used:

| Contract | Address |
|---|---|
| v4 PositionManager | `0x4B2C77d209D3405F41a037EC6c77F7F5b8e2ca80` |
| Universal Router | `0x050E797f3625EC8785265e1d9BDd4799b97528A1` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| USDC (test) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

---

## Structure

```
apps/
  web/          Next.js 15 — protocol API + reference UI
contracts/      Solidity — IntentRegistry.sol
packages/
  shared/       TypeScript types + Zod schemas (shared across protocol)
docs/
  ARCHITECTURE.md        System design + layer diagram
  API.md                 Full API specification
  IMPLEMENTATION_PLAN.md Build phases + status
  DEMO_SCRIPT.md         Hackathon demo walkthrough
assets/
  logo.svg               512×512 logo
  cover.svg              640×360 cover image
```

---

## Quickstart

**Prerequisites:** Node.js ≥ 20, npm ≥ 9

```bash
git clone https://github.com/fredmunene/uni-agent
cd uni-agent

npm install
```

Create `.env` in the repo root (copy the block below and fill in your keys):

```bash
# AI solver
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash-lite

# Storage (Upstash Redis — free tier works)
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token

# RPC
RPC_BASE_SEPOLIA=https://sepolia.base.org

# Backend executor wallet (testnet only — fund with Base Sepolia ETH)
PRIVATE_EXECUTOR_KEY=0x...
DEPLOYER_ADDRESS=0x...

# Frontend
NEXT_PUBLIC_WC_PROJECT_ID=your_walletconnect_project_id
NEXT_PUBLIC_CHAIN_ID=84532
NEXT_PUBLIC_API_URL=http://localhost:3000

# Deployed contracts — Base Sepolia
NEXT_PUBLIC_INTENT_REGISTRY_ADDRESS=0x1c105A184aA887b6b5E518CF57867b2b47a110F9
NEXT_PUBLIC_INTENT_EXECUTOR_ADDRESS=0x6AF9304414459577d36835D17Ec4eDb61B9CFEB0
NEXT_PUBLIC_INTENT_VAULT_ADDRESS=0xA5e2A18D67D3505e6fcbE965665b35d5DD4Bc31e
NEXT_PUBLIC_POSITION_REGISTRY_ADDRESS=0x4d362FC9D4Ac955dd11a359a188Ed90d3132d07b
NEXT_PUBLIC_MOCK_LENDING_ADAPTER_ADDRESS=0x8F3D8715cdbcfFb745aF587ce9a90c702F479144

# Uniswap Trading API (optional — enables live swap quotes)
UNISWAP_API_KEY=your_key
```

Start the app:

```bash
npm run dev:web    # http://localhost:3000
```

The app and API both run from the single Next.js process — no separate API server needed.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 App Router, React, Tailwind |
| Wallet | RainbowKit v2, wagmi v2, viem |
| AI Solver | Google Gemini 2.0 Flash (tool-calling loop) |
| DeFi APIs | Uniswap Trading API, Uniswap v3 subgraph (The Graph) |
| On-chain | Uniswap Universal Router, v4 PositionManager, Permit2 |
| Protocol | IntentRegistry.sol (Base Sepolia) |
| Storage | Upstash Redis |
| Deploy | Vercel (Fluid Compute) |
| Monorepo | Turborepo |

---

## Uniswap API Feedback

See [FEEDBACK.md](./FEEDBACK.md) for developer experience notes, friction points,
and suggestions for the Uniswap team.
