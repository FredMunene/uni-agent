# FEEDBACK.md

## Project

Agentic Stablecoin Position Router

We built an intent-based execution layer for AI agents using the Uniswap Trading API as the swap and routing primitive. The agent takes a high-level user goal and converts it into a multi-step DeFi plan.

For the hackathon we scoped to a working 2-step demo on Base:

```
USDC → swap (Uniswap API) → add_liquidity (Uniswap v4)
```

The broader architecture supports the full chain:

```
USDC → swap → bridge → LP → supply collateral → borrow USDC
```

## What worked well

**Quote API abstraction** — The Trading API quote flow was the strongest part of the integration. It abstracts route discovery, gas estimation, Permit2 approval data, and calldata construction into one call. Agents can reason about swap outcomes without knowing pool topology.

**Permit2 integration** — The fact that Permit2 approval data comes back in the quote response is genuinely useful for agent workflows. The agent can present the full picture (expected output + required approval) in one step.

**Deterministic responses** — Agents need structured, predictable responses. The quote API returns typed data that maps cleanly to agent tool outputs.

**Route abstraction** — Agents should not need to reason about pool paths or fee tiers. The API handles this correctly.

## What was difficult

The main gap is **multi-step orchestration**. A single swap quote is clean, but agent workflows require chained dependent actions:

- swap → bridge
- bridge → swap
- swap → add_liquidity
- add_liquidity → use position as collateral
- borrow → rebalance

After the swap, the agent receives an `amountOut` value. There is no native way to pipe that output directly into the next action type. We had to build the state threading manually: extract `amountOut`, feed it as `amount0` or `amount1` to the LP step, handle token ordering, and manage the combined approval surface.

This orchestration gap is the core DX problem for agentic finance.

## Missing endpoints we wanted

**`POST /intent/plan`**
Accept a high-level goal and return multiple possible execution plans with estimated APY, gas, risk score, and step breakdown. Agents need this to reason about strategies before committing.

**`POST /intent/simulate`**
Simulate a full chained action sequence and return expected output balances, risks, gas, bridge fees, and failure cases. Critical for agents that need to validate before signing.

**`POST /bundle`**
Return a single signable multi-step transaction bundle from a sequence of action types. The hardest manual work in this build was constructing a bundle where step 2 depends on step 1's output.

**`GET /execution/:id`**
Track the status of every step in a chained workflow. After execution, agents need structured state — not just a transaction hash.

**`GET /agent/tool-schema`**
Return OpenAI/Anthropic-compatible tool definitions for Uniswap actions. This would allow agents to integrate Uniswap actions with zero manual schema writing.

## Missing data we wanted

- LP APY estimates by pool (agents need this to compare strategies)
- Pool depth by chain (to estimate slippage on LP entry)
- Route reliability score (historical success rate for a given route)
- Bridge failure probability (for cross-chain step risk scoring)
- Estimated health factor after lending actions
- Standardized token metadata across chains (symbol, decimals, coingecko id)
- Position-level analytics after execution (fees earned, IL estimate)

## Bugs and DX friction

**State threading between steps** — The hardest part was not the swap. It was safely connecting the swap output to the LP input. The amount coming out of a USDC→WETH swap must be split correctly between token0 and token1 for the LP position, accounting for the pool's current price ratio. This math is entirely manual and error-prone.

**No combined approval surface** — Each step requires separate approvals. An agent presenting a 2-step plan has to walk the user through N approval signatures before execution. A bundle endpoint that returns one combined approval would reduce friction significantly.

**Quote expiry vs execution latency** — Quotes expire. In an agentic workflow where the user reviews the plan before signing, there is a meaningful gap between quote time and execution time. We had to build quote refresh logic manually.

**LP calldata construction** — The v4 LP position parameters (tickLower, tickUpper, liquidity amount from desired token amounts) require manual math against the pool's current sqrtPriceX96. This is not documented in an agent-friendly way.

## What Uniswap should build next

A native chained action API:

```http
POST /v1/actions/compose
```

```json
{
  "steps": ["swap", "add_liquidity"],
  "tokenIn": "USDC",
  "amountIn": "1000000000",
  "chainId": 8453,
  "recipient": "0xUser",
  "constraints": {
    "maxSlippageBps": 50,
    "deadline": 900
  }
}
```

Response should include:
- Transaction bundle (single signable payload)
- Required signatures (Permit2 + intent auth)
- Step-by-step output estimates
- Risk summary
- Gas estimate
- Failure handling spec

## Why this matters

Agents will not only swap. They will manage positions, rebalance collateral, source yield, repay debt, and coordinate across protocols and chains.

Uniswap is the best-positioned execution layer for agentic finance because of its routing quality, Permit2 standard, and protocol breadth. The gap is composable multi-step intent support. Closing that gap would make Uniswap the default execution primitive for any DeFi agent.
