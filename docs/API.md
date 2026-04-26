# API Reference

Base URL: `http://localhost:3001/v1`

## POST /intents

Create a new intent.

**Request**
```json
{
  "userAddress": "0xUser",
  "inputToken": "USDC",
  "inputAmount": "100000000",
  "goal": "productive_collateral",
  "risk": "low",
  "constraints": {
    "maxSlippageBps": 50,
    "deadlineSeconds": 900
  }
}
```

**Response**
```json
{
  "intentId": "int_abc123",
  "status": "created"
}
```

---

## POST /intents/:id/plan

Generate execution plans for an intent. Triggers the Claude agent to call Uniswap quote tools and score strategies.

**Response**
```json
{
  "intentId": "int_abc123",
  "recommendedPlanId": "plan_xyz",
  "plans": [
    {
      "planId": "plan_xyz",
      "label": "USDC/WETH LP on Base",
      "estimatedNetApyBps": 480,
      "estimatedGasUsd": "1.20",
      "riskScore": "low",
      "steps": [
        {
          "stepId": "step_001",
          "type": "swap",
          "provider": "uniswap",
          "chainId": 84532,
          "fromToken": "USDC",
          "toToken": "WETH",
          "amountIn": "50000000",
          "estimatedAmountOut": "13200000000000000",
          "slippageBps": 50
        },
        {
          "stepId": "step_002",
          "type": "add_liquidity",
          "provider": "uniswap_v4",
          "chainId": 84532,
          "pool": "USDC/WETH 0.05%",
          "token0AmountIn": "50000000",
          "token1AmountIn": "13200000000000000",
          "tickLower": -887272,
          "tickUpper": 887272
        }
      ],
      "risk": {
        "maxLossUsd": "2.50",
        "notes": "Full-range LP position. IL risk if WETH price moves >20%."
      }
    }
  ]
}
```

---

## POST /intents/:id/plans/:planId/bundle

Build the signable transaction bundle for a selected plan.

**Response**
```json
{
  "planId": "plan_xyz",
  "executionMode": "user_signed",
  "requiredSignatures": [
    {
      "type": "permit2",
      "token": "USDC",
      "spender": "0xIntentExecutor",
      "amount": "100000000",
      "deadline": 1777210200,
      "message": {}
    }
  ],
  "transaction": {
    "chainId": 84532,
    "to": "0xIntentExecutor",
    "data": "0x...",
    "value": "0",
    "gasEstimate": "320000"
  },
  "safety": {
    "maxLossUsd": "2.50",
    "minSwapOutput": "13068000000000000",
    "deadline": 1777210200
  }
}
```

---

## POST /intents/:id/plans/:planId/execute

Submit the signed bundle for execution.

**Request**
```json
{
  "permit2Signature": "0x...",
  "userAddress": "0xUser"
}
```

**Response**
```json
{
  "executionId": "exec_001",
  "status": "submitted",
  "txHash": "0x..."
}
```

---

## GET /executions/:id

Poll execution status.

**Response**
```json
{
  "executionId": "exec_001",
  "status": "completed",
  "steps": [
    { "type": "swap", "status": "confirmed", "txHash": "0x..." },
    { "type": "add_liquidity", "status": "confirmed", "txHash": "0x..." }
  ],
  "position": {
    "positionId": "pos_001",
    "pool": "USDC/WETH 0.05%",
    "liquidity": "1234567890",
    "token0Amount": "50000000",
    "token1Amount": "13200000000000000"
  }
}
```

---

## POST /quotes

Get a Uniswap swap quote directly (used internally by agent tools).

**Request**
```json
{
  "type": "swap",
  "chainId": 84532,
  "tokenIn": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "tokenOut": "0x4200000000000000000000000000000000000006",
  "amountIn": "50000000",
  "recipient": "0xUser"
}
```

**Response**
```json
{
  "quoteId": "q_001",
  "amountIn": "50000000",
  "amountOut": "13200000000000000",
  "gasEstimate": "180000",
  "priceImpactBps": 3,
  "validUntil": "2026-04-26T18:00:00Z",
  "permit2": { "domain": {}, "types": {}, "values": {} }
}
```

---

## GET /agent/tool-schema

Returns the Anthropic-compatible tool definitions for the agent.

**Response**
```json
{
  "tools": [ ... ]
}
```
