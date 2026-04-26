# Architecture

## Overview

Intent-based DeFi execution layer. The user expresses a goal in natural language; the system plans, quotes, and executes a 2-step onchain action (swap → add_liquidity) on Base.

## Request Flow

```
User (browser)
  │ POST /v1/intents  { goal, inputToken, amount, risk }
  ▼
Intent API (Fastify)
  │ validates schema, stores intent
  ▼
Planner Service
  │ calls Claude claude-sonnet-4-6 with tool use
  │  → tool: get_swap_quote   (Uniswap Trading API)
  │  → tool: get_lp_params    (v4 price math)
  │  → tool: simulate_bundle  (dry run via RPC)
  ▼
Plan Response
  │ steps[], estimated gas, risk summary, required signatures
  ▼
User reviews + signs
  │ Permit2 approval + intent authorization
  ▼
Execution Service
  │ builds calldata, submits to IntentExecutor on Base Sepolia
  ▼
IntentExecutor.sol
  │ step 1: swap via Uniswap Universal Router
  │ step 2: add_liquidity via v4 PositionManager
  ▼
PositionRegistry.sol  →  event emitted  →  frontend poll
```

## Component Map

| Component | Path | Purpose |
|---|---|---|
| Intent API | `apps/api/src/routes/intents.ts` | CRUD for intents and plans |
| Quote API | `apps/api/src/routes/quotes.ts` | Proxy to Uniswap Trading API |
| Planner | `apps/api/src/services/planner.ts` | Generates ranked plans |
| Quote Service | `apps/api/src/services/quote.ts` | Normalizes Uniswap responses |
| Risk Service | `apps/api/src/services/risk.ts` | Validates plan constraints |
| Agent | `apps/api/src/agent/index.ts` | Claude orchestrator |
| Tool Definitions | `apps/api/src/agent/tools.ts` | Anthropic tool schemas |
| Shared Types | `packages/shared/src/types.ts` | Cross-app TypeScript types |
| Schemas | `packages/shared/src/schemas.ts` | Zod validation |
| IntentVault | `contracts/src/IntentVault.sol` | Holds user funds, refund logic |
| IntentExecutor | `contracts/src/IntentExecutor.sol` | Executes ordered steps |
| RiskGuard | `contracts/src/RiskGuard.sol` | Pre/post execution checks |
| PositionRegistry | `contracts/src/PositionRegistry.sol` | Records resulting positions |

## Key Design Decisions

**Agent as planner, not executor** — Claude reasons about the goal and calls tools to fetch quotes, but never signs transactions. The user always signs the final bundle.

**In-memory store for hackathon** — No database dependency. Intents and plans live in a Map. Swap for Postgres/Neon when deploying to production.

**Mock adapters for non-Uniswap steps** — The LP step uses real Uniswap v4. If extending to borrow/bridge, mock adapters let the demo run without live Aave/Across.

**Base Sepolia for demo** — Low gas, Uniswap v4 deployed, fast finality. Tokens available from Base Sepolia faucet.

## Chain Addresses (Base Sepolia, chainId 84532)

| Contract | Address |
|---|---|
| Uniswap v4 PoolManager | `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408` |
| Uniswap v4 PositionManager | `0x4B2C77d209D3405F41a037EC6c77F7F5b8e2ca80` |
| Uniswap Universal Router | `0x050E797f3625EC8785265e1d9BDd4799b97528A1` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| USDC (test) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| WETH | `0x4200000000000000000000000000000000000006` |
