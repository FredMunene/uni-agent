# ADR-001: Solver Reputation and Outcome Reporting

**Status:** Accepted  
**Date:** 2026-04-30  
**Deciders:** Protocol design

---

## Context

When a user sees three competing strategy cards, each showing an estimated APR and risk
level, there is currently no way to know whether those numbers are accurate or inflated.
A solver that quotes 40% APR wins more user selections than one that quotes 12% — even if
the 12% estimate is honest and the 40% one never materialises.

This creates an adverse selection problem: solvers are incentivised to over-promise.
Users have no on-chain signal to distinguish a trustworthy solver from a dishonest one.

The bid bond (0.001 ETH) deters spam but does not punish inaccuracy.
The registration stake (0.05 ETH) creates skin in the game but is only slashed for
malicious behaviour, not for optimistic quoting.

---

## Decision

Add an **on-chain reputation score** to each solver, built from two dimensions measured
after execution:

### 1. APR Accuracy

After a position has been open for a meaningful window (7 days by default), the protocol
reads the actual fees earned from the Uniswap v4 `PositionManager` and computes:

```
aprAccuracyBps = min((actualFeesBps * 10000) / quotedFeesBps, 10000)
```

- Capped at 10000 (100%) — over-delivering does not inflate the score above perfect.
- Under-delivering proportionally reduces the score.
- Example: quoted 40% APR, delivered 8% → accuracy = 20%. Quoted 12%, delivered 11.5% → accuracy = 95%.

### 2. In-Range Ratio

The monitor service records how often the LP position was within its tick range during
the observation window:

```
inRangeBps = (ticksInRange / totalTicks) * 10000
```

A solver that places a position in a ±5% concentrated range earns higher fees when
in range but risks going out of range quickly. A solver that overstates the stability
of a concentrated position will have a low in-range ratio.

### Combined Score

```
outcomeScore = (aprAccuracyBps * inRangeBps) / 10000
```

Both dimensions must be good for the score to be good. A position that earned the
promised APR but was out of range 50% of the time only scores 50% of its APR accuracy.

### Running Average

The registry maintains a cumulative mean per solver:

```
newAvg = (oldAvg * fulfilledCount + outcomeScore) / (fulfilledCount + 1)
```

Updated each time `reportOutcome` is called. Simple, cheap, monotonically more
accurate as the solver builds a track record.

### Who calls `reportOutcome`

Only the protocol owner (initially) or a designated oracle address. The solver cannot
report their own outcome — that would be trivially gameable. In v1+, this can be
replaced with a ZK proof over the PositionManager state root.

---

## Why Not Slash on Inaccuracy?

Slashing requires a crisp binary condition (malicious, offline, invalid calldata).
APR accuracy is continuous and noisy — market conditions change, impermanent loss is
inherent, and a 10% miss might be market volatility rather than deception.

Reputation degradation is the right instrument for continuous quality signals.
Slashing remains reserved for clear-cut adversarial behaviour.

---

## Consequences

**Good:**
- Users can filter strategy cards by solver reputation score.
- Solvers are incentivised to quote conservatively and accurately, not optimistically.
- The score is entirely on-chain — auditable, composable, non-custodial.
- Over time, the best agents rise and the dishonest ones get passed over without
  anyone having to intervene.

**Trade-offs:**
- Reputation requires time to accumulate. A new solver starts at 0 fulfilled and
  cannot be distinguished from an untrustworthy one by score alone.
  Mitigation: display fulfilled count prominently; users can take a chance on new
  solvers and the bond provides a floor.
- The `reportOutcome` oracle is centralised in v0. This is an acceptable trust
  assumption for a hackathon; in v1 it should be replaced with a verifiable
  position-state proof.
- APR accuracy requires reading fees from PositionManager after 7 days. This means
  the score lags execution. The count and slash history are available immediately.

---

## What Gets Stored On-Chain (per solver)

```solidity
struct Reputation {
    uint256 fulfilledCount;    // total intents completed
    uint256 avgOutcomeScore;   // running mean of outcomeScore (0–10000 bps)
    uint256 avgAprAccuracy;    // running mean of APR accuracy (0–10000 bps)
    uint256 avgInRangeBps;     // running mean of in-range ratio (0–10000 bps)
    uint256 slashedAmount;     // total ETH slashed (0 = clean history)
    uint256 lastReportedAt;    // timestamp of most recent outcome report
}
```

---

## User-Facing Display

```
Solver:  gemini-lp.solvers.uni-agent.eth
Track record:  247 fulfilled · 0 slashed
APR accuracy:  94%   (promised vs delivered, 7-day window)
In-range:      87%   (time position was earning fees)
Score:         81%   (combined)
```

Score colour: ≥80% green · 50–79% amber · <50% red.

---

## Alternatives Considered

| Alternative | Why rejected |
|---|---|
| Slash on APR miss > 50% | APR is noisy; market moves can cause a 50% miss innocently. Slashing on continuous signals is too blunt. |
| Off-chain reputation only | Loses composability. Any dApp integrating the protocol couldn't read or verify the score. |
| ZK proof of position state | Correct long-term direction but too complex for hackathon scope. Noted as v1 upgrade path. |
| User-submitted rating | Gameable by solvers submitting self-reviews. |

---

## Related

- `contracts/src/IntentRegistry.sol` — `reportOutcome`, `Reputation` struct
- `apps/web/lib/services/monitor.ts` — source of `inRangeBps` measurements
- ADR-002 (planned): Oracle upgrade path — replacing owner-only `reportOutcome` with ZK proof
