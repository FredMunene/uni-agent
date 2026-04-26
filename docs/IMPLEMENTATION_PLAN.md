# Implementation Plan (10 days remaining)

Hackathon ends: May 6, 2026. Today: April 26.

## Priority: working swap → LP demo + strong FEEDBACK.md

---

## Day 1–2: API + Agent Foundation

**Goal:** `POST /intents` → agent plans → Uniswap quote → plan response

Tasks:
- [ ] `packages/shared` — types, schemas, constants
- [ ] `apps/api` — Fastify server, in-memory store
- [ ] `apps/api/src/services/quote.ts` — Uniswap Trading API integration
- [ ] `apps/api/src/agent/tools.ts` — tool definitions
- [ ] `apps/api/src/agent/index.ts` — Claude agent with tool loop
- [ ] `apps/api/src/services/planner.ts` — agent-driven plan generation
- [ ] `apps/api/src/routes/intents.ts` — intent + plan endpoints

Milestone: `curl -X POST /v1/intents` returns a plan with a live Uniswap quote.

---

## Day 3–4: Contracts

**Goal:** IntentExecutor deploys on Base Sepolia, swap + LP executes

Tasks:
- [ ] `contracts/src/IntentVault.sol`
- [ ] `contracts/src/IntentExecutor.sol` — swap step via Universal Router
- [ ] `contracts/src/IntentExecutor.sol` — LP step via v4 PositionManager
- [ ] `contracts/src/RiskGuard.sol` — pre/post checks
- [ ] `contracts/src/PositionRegistry.sol` — position events
- [ ] `contracts/test/` — Foundry unit tests
- [ ] Deploy to Base Sepolia

Milestone: `forge test` passes. `cast send` to IntentExecutor executes a swap on Base Sepolia.

---

## Day 5–6: Frontend

**Goal:** User can go from intent form to signed execution

Tasks:
- [ ] `apps/web` — Next.js scaffold, Wagmi/RainbowKit setup
- [ ] Intent form page
- [ ] Plan comparison cards (steps, gas, risk)
- [ ] Review + sign panel (Permit2 + tx)
- [ ] Execution tracker (step status polling)
- [ ] Position display

Milestone: Full flow works end to end in browser on Base Sepolia.

---

## Day 7–8: Integration + Polish

Tasks:
- [ ] Wire frontend → API → agent → contracts end to end
- [ ] Simulation mode (eth_call fallback if tx fails)
- [ ] Quote refresh before signing
- [ ] Error states in UI (quote expired, tx reverted)
- [ ] Mobile-readable layout

---

## Day 9: Demo prep

Tasks:
- [ ] Deploy frontend (Vercel)
- [ ] Deploy API (Railway or Render)
- [ ] Contracts verified on Basescan
- [ ] Run through demo script 3 times
- [ ] Record demo video (2–4 min, follow DEMO_SCRIPT.md)

---

## Day 10: Submit

Tasks:
- [ ] Final FEEDBACK.md review
- [ ] README complete with quickstart
- [ ] ETHGlobal submission form
- [ ] Select Uniswap partner prize track
- [ ] Paste FEEDBACK.md content into submission form notes

---

## Scope boundaries

**In scope:**
- swap → add_liquidity (2 steps, same chain, Base)
- Live Uniswap quote integration
- Real contract execution on Base Sepolia
- Agent tool schema endpoint
- FEEDBACK.md

**Out of scope (mention in FEEDBACK.md as limitations):**
- Bridge step
- Borrow/supply step (use mock adapter if needed for demo)
- Multi-chain routing
- Persistent database

**Stretch (if ahead of schedule):**
- Add a third mock step (supply collateral to MockLendingAdapter)
- Pool APY display from a DeFi data API
