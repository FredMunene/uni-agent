# Agentic Stablecoin Position Router

## PRD, API Spec, Smart Contract Outline, Hook Design, Full Stack Implementation Plan, and FEEDBACK.md Draft

## 1. Executive Summary

Agentic Stablecoin Position Router is an intent based DeFi execution layer for AI agents and users.

The product lets a user or agent submit a high level financial intent such as:

```text
Make my USDC productive, keep risk low, allow borrowing, and keep the position liquid.
```

The system converts that intent into a multi step onchain execution plan:

```text
USDC -> swap -> bridge -> LP -> supply collateral -> borrow USDC
```

The core wedge is not another yield dashboard. The wedge is a programmable execution planner for agentic finance.

Uniswap API becomes the swap and routing execution primitive. The router adds planning, safety constraints, multi step orchestration, risk checks, and position lifecycle tracking.

## 2. Verified Technical Basis

### Uniswap API

Uniswap's developer platform supports API driven swap integrations and developer tooling for swap and liquidity workflows. The Uniswap API quote flow is useful for routes, gas estimates, token approval flow, and execution preparation.

Relevant product assumption:

```text
Uniswap handles best execution for swap routes.
Our system handles intent decomposition, chained execution, risk validation, and agent compatible orchestration.
```

### UniswapX

UniswapX is an intent based, auction driven swap system where users sign orders offchain and fillers compete to execute. This validates the broader direction of intent based DeFi execution.

Relevant product assumption:

```text
Intent based execution is already a major direction in Uniswap's ecosystem.
The gap is extending intent execution beyond a single swap into multi step financial workflows.
```

### Uniswap v4 Hooks

Uniswap v4 hooks allow custom logic around pool lifecycle actions such as swaps and liquidity changes.

Relevant product assumption:

```text
Hooks can be used for risk checks, execution metadata, fee logic, position accounting, and agent readable events.
```

### Aave V3

Aave V3 provides lending actions such as supply, withdraw, borrow, repay, collateral enablement, liquidation, and flash loans.

Relevant product assumption:

```text
Aave is a practical borrowing integration target for the borrow leg of the chained workflow.
```

### Across and ERC 7683

Across supports programmatic cross chain bridging, quote retrieval, swap functionality, and deposit status tracking. ERC 7683 provides a standard interface for cross chain value transfer intents.

Relevant product assumption:

```text
Cross chain execution can be modeled as an intent step with status tracking and failure handling.
```

## 3. Product Vision

### One sentence

A Uniswap powered intent router that lets agents convert stablecoins into productive collateral through chained onchain actions.

### User facing promise

```text
Tell the agent what you want.
It plans, quotes, checks risk, executes, and tracks the position.
```

### Developer facing promise

```text
A simple API for agentic DeFi workflows.
No manual routing, no custom transaction composition, no fragmented protocol integrations.
```

### Agent facing promise

```text
A tool schema that lets agents call DeFi actions safely using structured constraints.
```

## 4. Problem

Agents are becoming capable of reasoning about finance, but execution is fragmented.

A simple goal like:

```text
Make 1,000 USDC productive and borrow against it.
```

Requires multiple complex actions:

1. Check user balance
2. Quote swaps
3. Check possible destination chains
4. Estimate bridge fees
5. Select yield strategy
6. Split stablecoin into LP ratios
7. Add liquidity
8. Supply position or underlying asset as collateral
9. Calculate health factor
10. Borrow safely
11. Track execution
12. Handle failure or rollback

Today, most APIs expose protocol level actions, not user intent level workflows.

## 5. Target Users

### Primary users

1. AI agents that need onchain execution tools
2. DeFi power users who want yield automation
3. Hackathon builders building agentic finance applications
4. Wallets and embedded finance apps that need one call DeFi workflows

### Secondary users

1. DAOs that manage treasury stablecoins
2. Market makers managing multi chain capital
3. Stablecoin protocols seeking productive collateral flows
4. DeFi strategy managers

## 6. Core Use Cases

### Use Case 1: Productive USDC

User submits:

```json
{
  "goal": "productive_collateral",
  "inputToken": "USDC",
  "amount": "1000",
  "risk": "low"
}
```

System returns:

```text
Recommended plan:
Supply USDC to lending market
Use part of position for Uniswap stable LP
Borrow up to safe LTV
Maintain minimum health factor of 1.6
```

### Use Case 2: Cross chain yield route

User submits:

```json
{
  "goal": "maximize_stable_yield",
  "inputToken": "USDC",
  "amount": "5000",
  "allowBridge": true,
  "allowedChains": ["base", "arbitrum"]
}
```

System evaluates:

```text
Base USDC strategy
Arbitrum USDC strategy
Bridge cost
Gas
Estimated APY
Risk score
```

### Use Case 3: Agent to agent capital routing

Agent A has idle USDC.

Agent B provides strategy discovery.

The router exposes an execution API:

```text
Agent A -> asks for plan
Agent B -> suggests route
Router -> quotes and executes through Uniswap and integrations
```

## 7. MVP Scope

### Build in 3 days

The MVP should prove:

```text
A user or agent can submit an intent.
The backend can generate a multi step execution plan.
The system can fetch Uniswap quotes.
The user can sign required approvals.
The system can execute or simulate chained actions.
The dashboard can show position state and risk.
The FEEDBACK.md clearly explains Uniswap API gaps.
```

### MVP execution path

For the hackathon, use this staged path:

```text
Phase 1 real execution:
USDC -> swap using Uniswap API

Phase 2 simulated or partially executed:
swap -> LP -> supply -> borrow

Phase 3 stretch:
bridge -> swap -> LP -> supply -> borrow
```

This keeps the demo realistic while still showing the full architecture.

## 8. Non Goals for MVP

Do not build:

```text
A generic DeFi dashboard
A pure arbitrage bot
A full autonomous fund manager
A production borrowing system with real leverage
A custom bridge
A custom lending protocol
```

The product should stay focused on:

```text
intent -> plan -> quote -> execute -> track
```

## 9. System Architecture

```text
Frontend
  |
  | create intent
  v
Backend API
  |
  | calls
  v
Intent Planner
  |
  | evaluates
  v
Strategy Engine
  |
  | gets quotes from
  v
Uniswap API + Bridge API + Lending Data
  |
  | produces
  v
Execution Bundle
  |
  | user signs
  v
IntentExecutor Contract
  |
  | executes
  v
Uniswap / Bridge / Lending Protocol
  |
  | emits
  v
Position Registry + Dashboard
```

## 10. Full Stack Expectations

### Frontend

Recommended stack:

```text
Next.js
TypeScript
Wagmi
Viem
RainbowKit or Privy
Tailwind CSS
shadcn/ui
Recharts
```

Frontend pages:

```text
/
/intent
/plans
/execute
/positions
/feedback
```

Core frontend features:

```text
Connect wallet
Enter intent
Select risk profile
Show generated plans
Show route comparison
Show required signatures
Submit transaction
Track execution status
Show position health
Show FEEDBACK.md preview
```

### Backend

Recommended stack:

```text
Node.js
TypeScript
Fastify or Express
Zod
PostgreSQL
Prisma
Redis
Viem
Uniswap API client
Across API client
Aave data provider client
```

Backend modules:

```text
intent-controller
planner-service
quote-service
risk-service
execution-service
position-service
agent-tool-service
feedback-generator
```

### Smart Contracts

Recommended stack:

```text
Solidity
Foundry
OpenZeppelin
Permit2 integration where useful
Viem for frontend interaction
```

Contracts:

```text
IntentVault.sol
IntentExecutor.sol
RiskGuard.sol
PositionRegistry.sol
AgentFeeManager.sol
MockLendingAdapter.sol for MVP
MockBridgeAdapter.sol for MVP
```

### Data Layer

Use PostgreSQL.

Tables:

```text
users
agents
intents
plans
plan_steps
executions
execution_steps
positions
risk_snapshots
quotes
feedback_notes
```

### Infrastructure

For hackathon:

```text
Vercel for frontend
Render or Railway for backend
Supabase or Neon for Postgres
Upstash Redis
Base Sepolia for contract testing
Base Mainnet optional for real small amount demo
```

## 11. API Specification

## 11.1 Create Intent

```http
POST /v1/intents
```

### Request

```json
{
  "user": "0xUser",
  "agentId": "yield-agent-001",
  "sourceChainId": 8453,
  "inputToken": "USDC",
  "inputAmount": "1000000000",
  "goal": "productive_collateral",
  "constraints": {
    "targetChainIds": [8453, 42161],
    "maxSlippageBps": 50,
    "maxBridgeFeeBps": 30,
    "minApyBps": 500,
    "minHealthFactor": "1.6",
    "maxBorrowLtvBps": 5500,
    "deadlineSeconds": 900,
    "allowBridge": true,
    "allowBorrow": true,
    "allowLp": true
  }
}
```

### Response

```json
{
  "intentId": "int_01J...",
  "status": "created",
  "next": "/v1/intents/int_01J.../plan"
}
```

## 11.2 Generate Plan

```http
POST /v1/intents/{intentId}/plan
```

### Response

```json
{
  "intentId": "int_01J...",
  "recommendedPlanId": "plan_01J...",
  "plans": [
    {
      "planId": "plan_01J...",
      "label": "Base USDC productive collateral",
      "estimatedNetApyBps": 640,
      "estimatedGasUsd": "2.14",
      "estimatedBridgeFeeUsd": "0",
      "riskScore": "low",
      "steps": [
        {
          "stepId": "step_001",
          "type": "swap",
          "provider": "uniswap",
          "chainId": 8453,
          "fromToken": "USDC",
          "toToken": "WETH",
          "amountIn": "300000000",
          "slippageBps": 50
        },
        {
          "stepId": "step_002",
          "type": "add_liquidity",
          "provider": "uniswap_v4",
          "chainId": 8453,
          "pool": "USDC/WETH",
          "token0": "USDC",
          "token1": "WETH"
        },
        {
          "stepId": "step_003",
          "type": "supply_collateral",
          "provider": "aave_v3_or_mock",
          "chainId": 8453,
          "asset": "USDC"
        },
        {
          "stepId": "step_004",
          "type": "borrow",
          "provider": "aave_v3_or_mock",
          "chainId": 8453,
          "asset": "USDC",
          "borrowAmount": "200000000"
        }
      ],
      "risk": {
        "minHealthFactor": "1.6",
        "estimatedHealthFactor": "1.82",
        "maxLossUsd": "5.00",
        "failureMode": "refund_unexecuted_steps"
      }
    }
  ]
}
```

## 11.3 Quote Step

```http
POST /v1/quotes
```

### Request

```json
{
  "type": "swap",
  "provider": "uniswap",
  "chainId": 8453,
  "tokenIn": "USDC",
  "tokenOut": "WETH",
  "amountIn": "1000000000",
  "slippageBps": 50,
  "recipient": "0xUser"
}
```

### Response

```json
{
  "quoteId": "quote_01J...",
  "provider": "uniswap",
  "chainId": 8453,
  "amountIn": "1000000000",
  "amountOut": "312345678901234",
  "gasEstimate": "180000",
  "validUntil": "2026-04-26T16:30:00Z",
  "raw": {}
}
```

## 11.4 Get Transaction Bundle

```http
POST /v1/plans/{planId}/bundle
```

### Response

```json
{
  "planId": "plan_01J...",
  "executionMode": "user_signed_bundle",
  "requiredSignatures": [
    {
      "type": "permit2",
      "token": "USDC",
      "spender": "0xIntentExecutor",
      "message": {}
    },
    {
      "type": "intent_authorization",
      "message": {
        "intentId": "int_01J...",
        "planId": "plan_01J...",
        "deadline": 1777210200,
        "maxSlippageBps": 50
      }
    }
  ],
  "transactions": [
    {
      "chainId": 8453,
      "to": "0xIntentExecutor",
      "data": "0x...",
      "value": "0"
    }
  ],
  "safety": {
    "maxLossUsd": "5.00",
    "minOutputAmount": "995000000",
    "minHealthFactorAfterBorrow": "1.6"
  }
}
```

## 11.5 Execute Plan

```http
POST /v1/plans/{planId}/execute
```

### Request

```json
{
  "signatures": [
    {
      "type": "permit2",
      "signature": "0x..."
    },
    {
      "type": "intent_authorization",
      "signature": "0x..."
    }
  ]
}
```

### Response

```json
{
  "executionId": "exec_01J...",
  "status": "submitted",
  "transactions": [
    {
      "chainId": 8453,
      "hash": "0x..."
    }
  ]
}
```

## 11.6 Track Execution

```http
GET /v1/executions/{executionId}
```

### Response

```json
{
  "executionId": "exec_01J...",
  "status": "completed",
  "completedSteps": [
    "swap",
    "bridge",
    "add_liquidity",
    "supply_collateral",
    "borrow"
  ],
  "position": {
    "positionId": "pos_01J...",
    "collateralValueUsd": "1008.42",
    "borrowedUsd": "300.00",
    "healthFactor": "1.82",
    "netApyBps": 611
  }
}
```

## 11.7 Agent Tool Schema

```http
GET /v1/agent/tool-schema
```

### Response

```json
{
  "name": "agentic_stablecoin_router",
  "description": "Create, plan, execute, and track stablecoin yield collateral strategies.",
  "tools": [
    {
      "name": "createIntent",
      "description": "Create a DeFi execution intent.",
      "input_schema": {
        "type": "object",
        "properties": {
          "inputToken": { "type": "string" },
          "amount": { "type": "string" },
          "goal": { "type": "string" },
          "risk": { "type": "string" }
        },
        "required": ["inputToken", "amount", "goal"]
      }
    },
    {
      "name": "generatePlan",
      "description": "Generate execution plans for an intent."
    },
    {
      "name": "executePlan",
      "description": "Execute a selected plan after user authorization."
    }
  ]
}
```

## 12. Data Model

## 12.1 Intents Table

```sql
CREATE TABLE intents (
  id TEXT PRIMARY KEY,
  user_address TEXT NOT NULL,
  agent_id TEXT,
  source_chain_id INTEGER NOT NULL,
  input_token TEXT NOT NULL,
  input_amount NUMERIC NOT NULL,
  goal TEXT NOT NULL,
  constraints JSONB NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## 12.2 Plans Table

```sql
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL REFERENCES intents(id),
  label TEXT NOT NULL,
  estimated_net_apy_bps INTEGER,
  estimated_gas_usd NUMERIC,
  estimated_bridge_fee_usd NUMERIC,
  risk_score TEXT,
  risk_summary JSONB,
  status TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 12.3 Plan Steps Table

```sql
CREATE TABLE plan_steps (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  step_index INTEGER NOT NULL,
  step_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  token_in TEXT,
  token_out TEXT,
  amount_in NUMERIC,
  min_amount_out NUMERIC,
  call_data TEXT,
  metadata JSONB,
  status TEXT NOT NULL
);
```

## 12.4 Executions Table

```sql
CREATE TABLE executions (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  user_address TEXT NOT NULL,
  status TEXT NOT NULL,
  transaction_hash TEXT,
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## 12.5 Positions Table

```sql
CREATE TABLE positions (
  id TEXT PRIMARY KEY,
  user_address TEXT NOT NULL,
  execution_id TEXT REFERENCES executions(id),
  chain_id INTEGER NOT NULL,
  collateral_asset TEXT,
  collateral_amount NUMERIC,
  debt_asset TEXT,
  debt_amount NUMERIC,
  health_factor NUMERIC,
  net_apy_bps INTEGER,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## 13. Smart Contract Design

## 13.1 IntentVault.sol

Purpose:

```text
Hold user funds temporarily.
Release funds only to approved executor.
Refund unexecuted or failed intents.
Avoid leaving user funds stranded.
```

Interface:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract IntentVault {
    struct Deposit {
        address user;
        address token;
        uint256 amount;
        bool released;
        bool refunded;
    }

    mapping(bytes32 => Deposit) public deposits;
    address public executor;
    address public owner;

    event Deposited(bytes32 indexed intentId, address indexed user, address token, uint256 amount);
    event Released(bytes32 indexed intentId, address indexed executor);
    event Refunded(bytes32 indexed intentId, address indexed user);

    function deposit(address token, uint256 amount, bytes32 intentId) external {
        // transferFrom user
        // record deposit
    }

    function releaseToExecutor(bytes32 intentId) external {
        // only executor
        // transfer funds to executor
    }

    function refund(bytes32 intentId) external {
        // allow user or owner to refund if not released
    }
}
```

## 13.2 IntentExecutor.sol

Purpose:

```text
Execute ordered plan steps.
Reject unauthorized targets.
Check deadlines.
Emit step level events.
Call RiskGuard before and after execution.
```

Interface:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract IntentExecutor {
    enum ActionType {
        Swap,
        Bridge,
        AddLiquidity,
        SupplyCollateral,
        Borrow,
        Refund
    }

    struct Step {
        ActionType actionType;
        address target;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        bytes callData;
    }

    event ExecutionStarted(bytes32 indexed intentId, address indexed user);
    event StepExecuted(bytes32 indexed intentId, uint256 indexed stepIndex, ActionType actionType);
    event ExecutionCompleted(bytes32 indexed intentId);
    event ExecutionFailed(bytes32 indexed intentId, uint256 indexed stepIndex, bytes reason);

    function execute(
        bytes32 intentId,
        address user,
        Step[] calldata steps,
        bytes calldata userSignature
    ) external {
        // verify user signature
        // validate allowed targets
        // run each step
        // validate post conditions
    }
}
```

## 13.3 RiskGuard.sol

Purpose:

```text
Enforce constraints.
Validate plan before execution.
Validate resulting position after execution.
```

Checks:

```text
Max slippage
Min output
Deadline
Chain allowlist
Protocol allowlist
Target allowlist
Minimum health factor
Maximum borrow LTV
Minimum remaining balance
```

Interface:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract RiskGuard {
    struct RiskParams {
        uint256 maxSlippageBps;
        uint256 minHealthFactor;
        uint256 maxBorrowLtvBps;
        uint256 deadline;
        bytes32 planHash;
    }

    function validateBefore(
        bytes32 intentId,
        address user,
        RiskParams calldata params
    ) external view {
        // verify deadline
        // verify plan hash
    }

    function validateAfter(
        bytes32 intentId,
        address user,
        RiskParams calldata params
    ) external view {
        // verify health factor if lending is used
        // verify post execution balances
    }
}
```

## 13.4 PositionRegistry.sol

Purpose:

```text
Record resulting positions.
Emit agent readable events.
Let frontend and indexer reconstruct position state.
```

Interface:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PositionRegistry {
    struct Position {
        address owner;
        uint256 chainId;
        address collateralAsset;
        address debtAsset;
        uint256 collateralAmount;
        uint256 debtAmount;
        uint256 createdAt;
        bytes32 strategyId;
    }

    mapping(bytes32 => Position) public positions;

    event PositionRecorded(
        bytes32 indexed positionId,
        address indexed owner,
        uint256 chainId,
        address collateralAsset,
        address debtAsset,
        uint256 collateralAmount,
        uint256 debtAmount
    );

    function recordPosition(bytes32 positionId, Position calldata position) external {
        // only executor
        // save position
        // emit event
    }
}
```

## 13.5 AgentFeeManager.sol

Purpose:

```text
Collect transparent execution fee only after successful execution.
Support fee sharing for agents or frontends.
```

Fee model:

```text
0 fee for failed plans
small basis point fee on successful routed amount
fee paid in USDC
fee event emitted
```

Interface:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AgentFeeManager {
    event FeeCollected(bytes32 indexed intentId, address indexed token, uint256 amount, address recipient);

    function collectFee(
        bytes32 intentId,
        address token,
        uint256 amount,
        address recipient
    ) external {
        // only executor
    }
}
```

## 14. Uniswap v4 Hook Design

## 14.1 AgentRiskHook

Purpose:

```text
Prevent unsafe swaps or liquidity changes.
```

Hook behavior:

```text
beforeSwap:
  verify pool is allowlisted
  verify agent policy allows this token pair
  verify slippage policy

afterSwap:
  emit execution metadata
  check output threshold

beforeAddLiquidity:
  check tick range
  check token exposure

afterAddLiquidity:
  emit LP metadata
```

Events:

```solidity
event AgentSwapChecked(
    address indexed user,
    bytes32 indexed intentId,
    address tokenIn,
    address tokenOut,
    uint256 maxSlippageBps
);

event AgentLiquidityAdded(
    address indexed user,
    bytes32 indexed intentId,
    bytes32 indexed poolId,
    uint256 liquidity
);
```

## 14.2 YieldCollateralHook

Purpose:

```text
Make LP positions easier for agents to reason about.
```

Behavior:

```text
Record LP metadata
Emit collateral readiness events
Track fee growth snapshots
Notify when rebalance is suggested
```

Events:

```solidity
event ProductiveCollateralCreated(
    address indexed user,
    bytes32 indexed intentId,
    bytes32 indexed poolId,
    uint256 liquidity
);

event RebalanceSuggested(
    address indexed user,
    bytes32 indexed positionId,
    string reason
);
```

## 14.3 AgentFeeHook

Purpose:

```text
Monetize successful agent routed execution.
```

Behavior:

```text
Fee only on successful swap or liquidity add
Fee paid in stablecoin where possible
Fee event emitted for transparency
```

## 15. Strategy Engine

## 15.1 Inputs

```json
{
  "inputToken": "USDC",
  "amount": "1000",
  "chain": "base",
  "risk": "low",
  "allowBridge": true,
  "allowBorrow": true,
  "allowLp": true
}
```

## 15.2 Candidate strategies

```text
Hold USDC
Supply USDC to lending market
Swap portion to paired asset and LP on Uniswap
Bridge USDC to higher yield chain
LP then borrow against collateral if available
```

## 15.3 Scoring model

```text
score =
  estimatedNetApy
  - gasPenalty
  - bridgePenalty
  - volatilityPenalty
  - smartContractRiskPenalty
  - liquidityRiskPenalty
  - healthFactorPenalty
```

Example:

```ts
type StrategyScore = {
  estimatedApyBps: number;
  gasCostUsd: number;
  bridgeCostUsd: number;
  volatilityRisk: number;
  liquidityRisk: number;
  smartContractRisk: number;
  healthFactorRisk: number;
  finalScore: number;
};
```

## 15.4 Low risk mode

Allowed:

```text
USDC only lending
Stable stable pools
No high LTV borrow
No volatile LP
No unknown bridge
```

## 15.5 Medium risk mode

Allowed:

```text
Stablecoin LP
Limited borrowing
Bridge to known chains
Moderate LTV
```

## 15.6 High risk mode

Allowed:

```text
Volatile LP
Higher LTV
Cross chain routing
More active rebalancing
```

## 16. Execution Design

## 16.1 Same chain flow

```text
User signs Permit2
User signs intent authorization
Backend builds transaction
IntentExecutor pulls funds
IntentExecutor swaps via Uniswap
IntentExecutor adds liquidity or calls adapter
IntentExecutor supplies collateral or mock lending
IntentExecutor borrows or simulates borrow
PositionRegistry records position
```

## 16.2 Cross chain flow

```text
User signs source chain execution
Source chain executor starts bridge
Backend monitors bridge status
Destination chain executor completes swap and position actions
PositionRegistry records final state
If bridge fails, refund or retry
```

## 16.3 Failure handling

Failure cases:

```text
Quote expired
Slippage exceeded
Bridge delayed
Bridge failed
Borrow health factor too low
User rejected signature
Gas too high
Protocol target not allowlisted
```

Required behavior:

```text
No silent failure
No unsafe partial borrow
Refund unexecuted funds where possible
Record execution status
Expose trace in frontend
```

## 17. Security Model

## 17.1 Threats

```text
Malicious route target
Quote manipulation
Oracle manipulation
Bridge failure
Reentrancy
Unsafe external calls
Approval abuse
Partial execution leaving funds stranded
Health factor miscalculation
Agent prompt injection causing unsafe intent
```

## 17.2 Controls

```text
Protocol allowlist
Token allowlist
Chain allowlist
Target allowlist
Plan hash signed by user
Execution deadline
Max slippage
Min output
Min health factor
Max LTV
Reentrancy guard
Pull based refunds
No arbitrary call execution without allowlist
```

## 17.3 Agent safety

Agents should not execute raw text directly.

Required pipeline:

```text
Natural language prompt
  -> structured intent
  -> validated constraints
  -> generated plan
  -> user review
  -> user signature
  -> execution
```

## 18. Repository Structure

```text
agentic-stablecoin-router/
  README.md
  FEEDBACK.md
  PRD.md
  SPEC.md
  IMPLEMENTATION_PLAN.md
  SECURITY.md
  apps/
    web/
      app/
      components/
      lib/
      hooks/
      package.json
    api/
      src/
        controllers/
        services/
        adapters/
        db/
        routes/
        schemas/
      package.json
  contracts/
    src/
      IntentVault.sol
      IntentExecutor.sol
      RiskGuard.sol
      PositionRegistry.sol
      AgentFeeManager.sol
      adapters/
        UniswapAdapter.sol
        MockBridgeAdapter.sol
        MockLendingAdapter.sol
      hooks/
        AgentRiskHook.sol
        YieldCollateralHook.sol
        AgentFeeHook.sol
    test/
    script/
    foundry.toml
  packages/
    shared/
      src/
        types.ts
        constants.ts
        schemas.ts
  docs/
    architecture.md
    api.md
    contracts.md
    demo-script.md
```

## 19. Implementation Plan

## Day 1: Product and API Foundation

### Tasks

```text
Create repo
Create frontend scaffold
Create backend scaffold
Create shared types
Create intent schema
Create plan schema
Create mock strategy engine
Integrate Uniswap quote endpoint
Store intents and plans in database
Display plan comparison in frontend
```

### Deliverables

```text
POST /v1/intents
POST /v1/intents/:id/plan
POST /v1/quotes
Frontend intent form
Frontend plan cards
```

## Day 2: Contracts and Execution

### Tasks

```text
Create Foundry project
Write IntentVault
Write IntentExecutor
Write RiskGuard
Write PositionRegistry
Write mock adapters
Write unit tests
Generate transaction bundle
Connect frontend wallet signing
```

### Deliverables

```text
Contracts compile
Tests pass
User can sign execution transaction
Execution emits events
Frontend shows transaction hash
```

## Day 3: Demo, Feedback, and Polish

### Tasks

```text
Add execution tracking
Add position dashboard
Add FEEDBACK.md
Add demo script
Add architecture diagram
Add README
Record demo video
Deploy frontend and backend
Deploy contracts to Base Sepolia
```

### Deliverables

```text
Working demo
Clean repo
FEEDBACK.md in root
Demo video
Submission ready
```

## 20. Milestones

## Milestone 1

```text
Intent API works
```

Success criteria:

```text
User can submit intent
Backend stores intent
Backend validates constraints
```

## Milestone 2

```text
Plan generation works
```

Success criteria:

```text
Backend returns at least 2 possible plans
Each plan has estimated APY, gas, risk, and steps
```

## Milestone 3

```text
Uniswap quote works
```

Success criteria:

```text
Backend fetches quote
Frontend displays expected output
Quote is attached to plan
```

## Milestone 4

```text
Execution bundle works
```

Success criteria:

```text
Backend returns transaction object
User can sign transaction
Transaction can be submitted
```

## Milestone 5

```text
Position tracking works
```

Success criteria:

```text
Position appears after execution
Dashboard shows collateral, debt, health factor, and status
```

## 21. Frontend UX Flow

## Screen 1: Landing

Headline:

```text
One intent. Multiple DeFi actions. Executed through Uniswap.
```

CTA:

```text
Make USDC productive
```

## Screen 2: Intent Form

Fields:

```text
Input token
Amount
Risk level
Allow bridge
Allow LP
Allow borrow
Minimum health factor
Maximum slippage
```

## Screen 3: Plan Comparison

Show cards:

```text
Plan name
Estimated APY
Gas cost
Bridge cost
Risk score
Steps
Why this plan
```

## Screen 4: Review and Sign

Show:

```text
Required approvals
Intent authorization
Maximum loss
Minimum output
Health factor after borrow
Execution deadline
```

## Screen 5: Execution Tracker

Show:

```text
Step 1 swap
Step 2 bridge
Step 3 LP
Step 4 supply
Step 5 borrow
```

Each step status:

```text
pending
submitted
confirmed
failed
skipped
```

## Screen 6: Position Dashboard

Show:

```text
Collateral value
Debt value
Health factor
Net APY
Unrealized fees
Recommended action
```

## 22. Backend Service Details

## 22.1 PlannerService

Responsibilities:

```text
Read intent
Generate strategy candidates
Request quotes
Score strategies
Return ranked plans
```

Pseudo code:

```ts
async function generatePlans(intent: Intent): Promise<Plan[]> {
  const candidates = buildCandidateStrategies(intent);
  const quoted = await quoteCandidates(candidates);
  const riskChecked = await applyRiskChecks(quoted, intent.constraints);
  return rankPlans(riskChecked);
}
```

## 22.2 QuoteService

Responsibilities:

```text
Call Uniswap API
Normalize quote response
Cache quotes
Handle quote expiry
```

Pseudo code:

```ts
async function getSwapQuote(input: SwapQuoteInput): Promise<SwapQuote> {
  const quote = await uniswapClient.quote(input);
  return normalizeUniswapQuote(quote);
}
```

## 22.3 RiskService

Responsibilities:

```text
Validate plan constraints
Estimate health factor
Check token allowlists
Check chain allowlists
Check bridge fee limits
```

Pseudo code:

```ts
function validatePlan(plan: Plan, constraints: Constraints): RiskResult {
  assert(plan.slippageBps <= constraints.maxSlippageBps);
  assert(plan.estimatedHealthFactor >= constraints.minHealthFactor);
  assert(plan.bridgeFeeBps <= constraints.maxBridgeFeeBps);
  return { passed: true };
}
```

## 22.4 ExecutionService

Responsibilities:

```text
Build transaction calldata
Attach signatures
Submit transaction
Track transaction status
Record execution trace
```

## 23. Environment Variables

```env
DATABASE_URL=
REDIS_URL=
UNISWAP_API_KEY=
ACROSS_API_BASE_URL=
RPC_BASE_MAINNET=
RPC_BASE_SEPOLIA=
RPC_ARBITRUM=
PRIVATE_EXECUTOR_KEY=
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
```

## 24. Testing Plan

## Backend tests

```text
Intent validation
Plan generation
Quote normalization
Risk checks
Execution bundle construction
Failure states
```

## Contract tests

```text
Deposit
Refund
Only executor release
Reject expired plan
Reject unapproved target
Execute mock swap
Record position
Collect fee only after success
```

## Frontend tests

```text
Connect wallet
Submit intent
Render plans
Review transaction
Track execution state
Render dashboard
```

## Integration tests

```text
Intent -> plan -> quote
Plan -> bundle
Bundle -> transaction
Transaction -> position
```

## 25. Demo Script

## Step 1

Open landing page.

Say:

```text
This is a Uniswap powered intent router for agentic finance.
```

## Step 2

Submit intent:

```text
Make 100 USDC productive with low risk.
```

## Step 3

Show generated plans:

```text
The planner compares hold, supply, LP, and borrow enabled strategies.
```

## Step 4

Select recommended plan.

Say:

```text
The route uses Uniswap for swap execution and wraps the rest as composable intent steps.
```

## Step 5

Sign transaction.

Say:

```text
The user signs constraints, not arbitrary hidden actions.
```

## Step 6

Show execution tracker.

Say:

```text
Each step is visible and auditable.
```

## Step 7

Show position dashboard.

Say:

```text
The final output is a tracked position with collateral, debt, health factor, and net APY.
```

## 26. Known Gaps and Limitations

## Gap 1: No native arbitrary multi step Uniswap intent endpoint

Current Uniswap API flows are strong for swaps and route abstraction. The gap is arbitrary multi step DeFi composition.

Needed:

```text
swap -> bridge -> LP -> supply -> borrow
```

## Gap 2: LP collateral is not universally supported

Not every lending market accepts LP positions as collateral.

MVP approach:

```text
Use mock lending or supply underlying stablecoin first.
Show LP collateral as future extension.
```

## Gap 3: Cross chain rollback is hard

Once a bridge step executes, rollback is not atomic.

MVP approach:

```text
Track bridge status.
Support retry.
Support destination chain continuation.
Support refund for unexecuted funds.
```

## Gap 4: Borrowing needs live risk data

Borrowing requires:

```text
Collateral factor
Liquidation threshold
Oracle price
Borrow caps
Supply caps
Health factor
```

MVP approach:

```text
Use conservative LTV.
Use mock health factor.
Add Aave data integration as stretch.
```

## Gap 5: Hook security is non trivial

Hooks can introduce risk.

MVP approach:

```text
Use hooks for metadata and checks first.
Avoid complex accounting changes in MVP.
```

## 27. FEEDBACK.md Draft

```md
# FEEDBACK.md

## Project

Agentic Stablecoin Position Router

We built an intent based execution layer for agents using the Uniswap API as the swap and routing primitive.

The agent converts a high level user goal into a multi step DeFi plan:

USDC -> swap -> bridge -> LP -> supply collateral -> borrow USDC

## What worked well

The Uniswap API quote flow was useful because it abstracts route discovery, gas estimation, and swap preparation.

The routing abstraction made it easier to let an agent reason about outcomes instead of manually constructing pool paths.

The API fits agentic finance well because agents need deterministic quote responses, structured routes, execution metadata, and predictable transaction construction.

## What was difficult

The main gap was multi step orchestration.

A swap quote is clean, but agent workflows often require multiple dependent actions:

swap then bridge
bridge then swap
swap then add liquidity
add liquidity then use position as collateral
borrow then rebalance

The API does not yet feel like a full intent execution engine for arbitrary DeFi workflows.

## Missing endpoints we wanted

POST /intent/plan

Generate multiple possible execution plans from a high level goal.

POST /intent/simulate

Simulate a full chained action and return expected balances, risks, gas, bridge fees, and failure cases.

POST /bundle

Return a signable multi step transaction bundle.

GET /execution/:id

Track every step of a chained workflow.

POST /agent/tool-schema

Return tool definitions that agents can directly consume.

## Missing data we wanted

LP APY estimates
pool depth by chain
route reliability score
historical quote success rate
bridge failure probability
estimated health factor after lending actions
standardized token metadata across chains
position level analytics after execution

## Bugs or DX friction

The hardest part was not the swap itself.

The hard part was safely connecting the swap to the next action.

For agentic finance, the API needs richer execution state, not just quote state.

## What Uniswap should build next

A native chained action API.

Example:

POST /v1/actions/compose

{
  "steps": [
    "swap",
    "bridge",
    "add_liquidity",
    "supply",
    "borrow"
  ]
}

The response should include:

transaction bundle
required signatures
risk summary
gas estimate
failure handling
step by step execution trace

## Why this matters

Agents will not only swap.

They will manage positions, rebalance collateral, source yield, repay debt, and coordinate across protocols.

Uniswap can become the execution layer for agentic finance if it supports composable multi step intents.
```

## 28. README.md Draft

```md
# Agentic Stablecoin Position Router

A Uniswap powered intent router for agentic finance.

## What it does

It converts high level financial intents into multi step DeFi execution plans.

Example:

Make my USDC productive and let me borrow safely against the position.

Execution path:

USDC -> swap -> bridge -> LP -> supply collateral -> borrow USDC

## Why it matters

Agents should not need to manually understand every protocol contract call.

They should be able to express goals, receive risk checked plans, and execute with user approved constraints.

## Core features

Intent API
Strategy planner
Uniswap quote integration
Multi step execution bundle
Risk guard
Position dashboard
Agent tool schema
FEEDBACK.md for Uniswap API feedback

## Tech stack

Frontend:
Next.js, TypeScript, Wagmi, Viem, Tailwind

Backend:
Node.js, TypeScript, Fastify, PostgreSQL, Redis

Contracts:
Solidity, Foundry

Integrations:
Uniswap API
Uniswap v4 hooks
Aave V3 or mock lending adapter
Across or mock bridge adapter

## Quickstart

Install dependencies:

npm install

Run frontend:

npm run dev:web

Run backend:

npm run dev:api

Run contracts:

cd contracts
forge test

## Demo

1. Connect wallet
2. Create intent
3. Generate plans
4. Select recommended plan
5. Sign approval and intent
6. Execute
7. Track resulting position
```

## 29. Pitch

```text
We built a Uniswap powered intent router that lets agents turn stablecoins into productive collateral through chained onchain actions.
```

## 30. Judging Alignment

### Best Uniswap API Integration

Strong alignment because:

```text
Uniswap API is the primary swap execution primitive.
The system gives agents structured access to Uniswap execution.
The project documents clear API feedback.
The project proposes missing endpoints that would improve agentic finance.
```

### Agentic Finance

Strong alignment because:

```text
Agents can submit intents.
Agents can compare strategies.
Agents can execute only after user authorization.
Agents can monitor resulting positions.
```

### Innovation

Strong alignment because:

```text
The product is not a dashboard.
The product is a DeFi execution abstraction layer.
It combines intents, routing, risk, chained actions, and position tracking.
```

## 31. Final Build Recommendation

For the hackathon, build the smallest credible version:

```text
Intent form
Plan generation
Uniswap quote
Execution bundle
Mock LP/supply/borrow
Position dashboard
FEEDBACK.md
```

Do not overbuild borrowing or cross chain execution unless the core flow already works.

The winning demo is:

```text
A user gives one instruction.
The agent turns it into a risk checked multi step DeFi plan.
Uniswap powers the execution layer.
The user signs.
The system tracks the result.
```
