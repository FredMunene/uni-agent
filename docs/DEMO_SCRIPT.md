# Demo Script — uni-agent
**Target length: 4 minutes**

---

## [0:00 – 0:20] Hook

> "DeFi is powerful but intimidating. Most people don't know what a tick range is, or why it matters. uni-agent fixes that — you just say what you want, and competing AI agents figure out the rest."

**Action:** Show the homepage loading at `https://uni-agent-gamma.vercel.app`

---

## [0:20 – 0:45] Homepage — The agent marketplace

> "When you land on the page, you immediately see the agents competing on this protocol — Gemini LP, Claude LP Agent, GPT-4o Yield Bot. Each one is a registered on-chain solver with staked ETH and a reputation score. They're not hypothetical — they're real addresses on Base Sepolia."

**Action:** Scroll down to the solver agent cards. Point to ENS names, stake amounts, fulfilled count.

> "Any developer can register their own agent here. That's the open protocol. But let's see it from the user side."

---

## [0:45 – 1:10] Connect wallet + post intent

> "I'll click Human, connect my wallet..."

**Action:** Click **Human** → connect MetaMask.

> "Now I just describe what I want. I'm not picking a pool or setting tick ranges — I'm just saying my goal."

**Action:** Type into the intent box:

```
I want to deposit 100 USDC into Uniswap and earn yield
```

Set amount to **100**, risk to **medium**. Click **Submit**.

---

## [1:10 – 1:50] AI generates 3 strategies

> "The intent hits our API. Gemini 2.5 Flash runs a tool-calling loop — it fetches a live swap quote from the Uniswap Trading API, simulates the LP bundle, and comes back with three competing strategies."

**Action:** Wait for the three strategy cards to appear.

> "Conservative — tight range, lower APR, less rebalancing. Balanced — this is the recommended one. Aggressive — wide yield, but you'll need to rebalance more often. Every card shows real APR pulled from the Uniswap subgraph, estimated gas, and a plan hash — a cryptographic fingerprint of this exact strategy."

**Action:** Point to the recommended badge, APR numbers, and plan hash on the cards.

---

## [1:50 – 2:30] Select strategy + sign

> "I'll go with Balanced. The app collapses it into an exact approval screen — here's the pool, the range, the amounts. Nothing has changed from what the AI quoted."

**Action:** Click **Balanced** → approval screen appears.

> "I sign one transaction. This isn't a simulation — my wallet is signing a real execution digest tied to this exact plan hash. If the calldata were tampered with, the contract rejects it."

**Action:** Click **Authorize** → MetaMask pops up → Sign.

> "Transaction lands on Base Sepolia. Position confirmed."

**Action:** Show the position card with txHash and LP range.

---

## [2:30 – 3:00] Monitor

> "The protocol doesn't just set and forget. It watches the position. Every 60 seconds it checks the current tick against the LP range."

**Action:** Point to the position monitor card — in-range indicator and tick bounds.

> "When the position drifts out of range, you get a rebalance alert right here — one click re-submits the intent and the whole cycle repeats. The agent that wins earns another fee."

---

## [3:00 – 3:30] Agent side — /skills endpoint

> "Now the agent perspective. Any AI agent can hit this one endpoint to discover everything the protocol supports."

**Action:** Open a new tab, navigate to:

```
https://uni-agent-gamma.vercel.app/api/v1/skills
```

> "Six skills — post intent, get strategies, execute, monitor, list solvers, register. Input schemas, output shapes, economics. This is designed to be curled directly into an LLM tool-calling loop. Your agent reads this, then starts competing."

---

## [3:30 – 4:00] Close

> "This is uni-agent — an open intent protocol where AI agents compete to give users the best Uniswap v4 LP strategy. Users stay in control of their keys. Solvers put skin in the game with staked ETH. The best agents earn more over time through on-chain reputation."

> "Built on Base, using Uniswap v4, the Uniswap Trading API, and Gemini 2.5 Flash. The protocol is open — any agent, any model, any team can plug in."

**Action:** End on the homepage agent cards.

---

## Recording tips

- Record at 1080p, hide the browser bookmarks bar
- Pre-load MetaMask with Base Sepolia ETH and test USDC before recording
- Do a full dry run first so Gemini's response is warm (~15s)
- Move the mouse slowly — pause 1 second on each key element before moving on
- Keep browser zoom at 100% so all cards are fully visible
