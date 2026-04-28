# Demo Script

The reproducible demo is the CLI runner in [scripts/demo.ts](/home/fred/Downloads/hackathons/uni-agent/scripts/demo.ts).

## Run

```bash
npx tsx scripts/demo.ts
```

## What it does

The script runs the product loop in-process:

1. Creates an intent with a demo wallet
2. Generates 3 strategies using the live planner when available
3. Falls back to deterministic APR-backed plans if Gemini or Uniswap APIs are unavailable
4. Signs the execution authorization message
5. Submits execution into the shared store
6. Polls the execution until it completes
7. Prints the monitor snapshot
8. Prints the rebalance draft from the active position

## Optional env vars

- `DEMO_PRIVATE_KEY`: use a specific wallet instead of a generated demo key
- `DEMO_USER_ADDRESS`: force the user address to match a known wallet
- `DEMO_GOAL`: override the default intent goal
- `DEMO_AMOUNT`: override the default USDC amount in base units
- `DEMO_RISK`: `low`, `medium`, or `high`

## Notes

- `GEMINI_API_KEY` and `UNISWAP_API_KEY` enable the live planning path.
- If they are missing, the script still runs by using the fallback planner.
- The script does not require the Next dev server to be running.
