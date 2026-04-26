# Demo Script (2–4 minutes)

## Setup

- Wallet: MetaMask connected to Base Sepolia (chainId 84532)
- Have test USDC from the Base Sepolia faucet
- `npm run dev:api` and `npm run dev:web` running

---

## Step 1 — Landing page (15s)

Open `http://localhost:3000`.

Say:
> "This is a Uniswap-powered intent router for AI agents. You give it a goal, it plans and executes a multi-step DeFi strategy."

---

## Step 2 — Submit intent (30s)

Connect wallet. Type into the intent form:

```
Make 100 USDC productive with low risk
```

Set risk to "Low". Hit **Generate Plan**.

Say:
> "The agent sends this goal to Claude, which calls Uniswap quote tools to evaluate strategies."

---

## Step 3 — Show the plan (45s)

Wait for the plan card to appear. Point to each element:

- **Step 1: Swap** — 50 USDC → WETH via Uniswap Trading API. Show the quote: expected WETH out, gas estimate, slippage.
- **Step 2: Add Liquidity** — USDC + WETH into a Uniswap v4 USDC/WETH pool. Show the tick range and estimated LP position.
- **Risk summary** — max loss, IL note.

Say:
> "The agent fetched a live quote from the Uniswap API for the swap leg, then calculated the LP parameters from the pool's current price."

---

## Step 4 — Review and sign (30s)

Click **Execute Plan**. Show the confirmation panel:

- Required Permit2 approval for USDC
- Max slippage: 0.5%
- Execution deadline: 15 minutes
- Max loss: $2.50

MetaMask pops up. Sign the Permit2 message, then confirm the transaction.

Say:
> "The user signs constraints — not arbitrary calldata. The contract enforces the plan hash so nothing can be swapped out after signing."

---

## Step 5 — Execution tracker (30s)

Show the step tracker updating in real time:

```
Step 1: Swap USDC → WETH    ✓ confirmed  [tx hash]
Step 2: Add Liquidity        ✓ confirmed  [tx hash]
```

Say:
> "Each step is visible and auditable. The contract emits step-level events so the frontend can track state independently."

---

## Step 6 — Position dashboard (20s)

Show the resulting position:

```
Pool:       USDC/WETH 0.05%
LP Token:   #1234
Token0:     50.00 USDC
Token1:     0.0132 WETH
Status:     Active
```

Say:
> "The position is recorded on-chain by the PositionRegistry contract and surfaced here. From here an agent could monitor fees, suggest rebalancing, or add a borrow step."

---

## Closing line (15s)

> "Uniswap's quote API made the swap leg clean to implement. The gap we hit — and documented in our FEEDBACK.md — is that connecting that swap output to the next action requires manual orchestration that should be a first-class API feature."

---

## Fallback if contracts aren't deployed

If Base Sepolia is congested, use the **simulation mode** toggle. It runs `eth_call` against the contracts without broadcasting. The plan, quote, and execution trace all display identically — only the final transaction is skipped.
