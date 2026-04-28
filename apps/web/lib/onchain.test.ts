import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_SEPOLIA, type Plan } from '@uni-agent/shared';
import { decodeFunctionData } from 'viem';
import {
  buildExecutionDigest,
  buildExecutorExecution,
  buildPlanIntentBytes32,
  intentExecutorAbi,
  positionRegistryAbi,
} from './onchain';

test('buildExecutionDigest changes when the plan hash changes', () => {
  const common = {
    executorAddress: '0x1111111111111111111111111111111111111111' as const,
    intentId: 'int_123',
    userAddress: '0x2222222222222222222222222222222222222222' as const,
    deadline: 1_700_000_000,
  };

  const digestA = buildExecutionDigest({
    ...common,
    planHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  });
  const digestB = buildExecutionDigest({
    ...common,
    planHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  });

  assert.notEqual(digestA, digestB);
});

test('buildExecutorExecution encodes a registry position record call', () => {
  const plan: Plan = {
    planId: 'plan_123',
    intentId: 'int_123',
    strategy: 'balanced',
    label: 'USDC/WETH LP on Base',
    estimatedNetApyBps: 480,
    estimatedGasUsd: '1.50',
    riskScore: 'low',
    steps: [
      {
        stepId: 'step_001',
        type: 'add_liquidity',
        provider: 'dex_v4',
        chainId: 84532,
        token0AmountIn: '5000000',
        token1AmountIn: '1000000000000000',
      },
    ],
    risk: { maxLossUsd: '2.50', notes: 'stable' },
    createdAt: '2026-04-28T00:00:00.000Z',
  };

  const tx = buildExecutorExecution({
    executorAddress: '0x1111111111111111111111111111111111111111',
    registryAddress: '0x3333333333333333333333333333333333333333',
    intentId: 'int_123',
    planId: plan.planId,
    userAddress: '0x2222222222222222222222222222222222222222',
    plan,
    planHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    signature: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    deadline: 1_700_000_000,
  });

  assert.equal(tx.address, '0x1111111111111111111111111111111111111111');
  assert.equal(tx.functionName, 'execute');
  assert.equal(tx.args[0].steps[0].target, '0x3333333333333333333333333333333333333333');

  const decoded = decodeFunctionData({
    abi: positionRegistryAbi,
    data: tx.args[0].steps[0].callData,
  });

  assert.equal(decoded.functionName, 'recordPosition');
  const [positionId, position] = decoded.args as [
    `0x${string}`,
    {
      owner: `0x${string}`;
      chainId: bigint;
      token0: `0x${string}`;
      token1: `0x${string}`;
      amount0: bigint;
      amount1: bigint;
      liquidity: bigint;
      createdAt: bigint;
    },
  ];

  assert.equal(position.owner, '0x2222222222222222222222222222222222222222');
  assert.equal(position.token0, BASE_SEPOLIA.USDC);
  assert.equal(position.token1, BASE_SEPOLIA.WETH);
  assert.equal(position.amount0, 5000000n);
  assert.equal(position.amount1, 1000000000000000n);
  assert.ok(positionId.startsWith('0x'));

  const intentIdBytes32 = buildPlanIntentBytes32('int_123');
  assert.equal(tx.args[0].intentId, intentIdBytes32);
});
