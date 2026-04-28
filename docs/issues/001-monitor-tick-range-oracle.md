# Issue 001: Upgrade monitor from registry snapshot to full Uniswap tick-range oracle

## Summary
The current monitor only reads the recorded position snapshot from the registry and derives a demo-grade health signal from that stored data.

## Impact
- The `In range` / `Needs rebalance` badge is not yet based on live pool tick data.
- The app can show a position as healthy even if the actual Uniswap pool price has moved outside the LP range.
- Rebalance prompts are good for the demo loop, but they are not yet protocol-grade alerts.

## What is missing
- Read the current pool tick from the Uniswap pool contract or pool manager.
- Persist the position's `tickLower` and `tickUpper` alongside the recorded position.
- Compare `currentTick` against the stored tick range.
- Emit a real `driftPercent` based on the pool state, not only the registry snapshot.

## Suggested next step
Implement a dedicated pool-state reader in `lib/services/monitor.ts` and update `/api/v1/positions/[posId]/monitor` to derive range status from live tick data.
