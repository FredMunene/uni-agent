# Agentic Stablecoin Position Router

A Uniswap-powered intent router for agentic DeFi. The agent converts a high-level user goal into a multi-step onchain execution plan.

**Demo flow (swap → LP on Base):**

```
"Make 100 USDC productive with low risk"
  → agent plans: USDC swap to WETH + add USDC/WETH liquidity on Uniswap v4
  → quotes both steps via Uniswap Trading API
  → user reviews plan + signs
  → executes + tracks resulting LP position
```

## Structure

```
apps/
  api/        Fastify backend — intent API, agent orchestration, Uniswap integration
  web/        Next.js frontend — intent form, plan comparison, execution tracker
contracts/    Solidity (Foundry) — IntentVault, IntentExecutor, RiskGuard, adapters
packages/
  shared/     Shared TypeScript types and Zod schemas
docs/
  PRD.md              Product requirements
  ARCHITECTURE.md     System design
  API.md              Full API specification
  CONTRACTS.md        Contract design and hook patterns
  DEMO_SCRIPT.md      Hackathon demo walkthrough
  IMPLEMENTATION_PLAN.md  10-day build schedule
FEEDBACK.md   Uniswap API developer experience feedback (required for prize eligibility)
```

## Quickstart

```bash
cp .env.example .env
# fill in UNISWAP_API_KEY, RPC_BASE_SEPOLIA, GEMINI_API_KEY
# set CORS_ORIGIN=http://localhost:3000 for the API and NEXT_PUBLIC_API_URL=http://localhost:3001 for the web app

npm install
npm run build
npm run dev:api    # http://localhost:3001
npm run dev:web    # http://localhost:3000
```

## Contract deployment (Base Sepolia)

```bash
cd contracts
forge install
forge test
forge script script/Deploy.s.sol --rpc-url $RPC_BASE_SEPOLIA --broadcast
```

## Tech stack

| Layer | Stack |
|---|---|
| Frontend | Next.js, TypeScript, Wagmi, Viem, RainbowKit, Tailwind, shadcn/ui |
| Backend | Fastify, TypeScript, Zod, Viem, Anthropic SDK |
| Contracts | Solidity ^0.8.24, Foundry, Uniswap v4 |
| Chain | Base / Base Sepolia |
| Uniswap | Trading API (quotes), v4 PositionManager (LP) |
| Agent | Claude claude-sonnet-4-6 with tool use |

## Uniswap API feedback

See [FEEDBACK.md](./FEEDBACK.md) for full developer experience notes, missing endpoints, DX friction, and what Uniswap should build next.
