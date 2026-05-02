import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_SEPOLIA, type Plan } from '@uni-agent/shared';
import { decodeFunctionData } from 'viem';
import {
  buildExecutionDigest,
  buildExecutionSteps,
  buildExecutorExecution,
  buildPlanIntentBytes32,
  positionRegistryAbi,
} from './onchain';

const POSITION_REGISTRY = '0x4d362FC9D4Ac955dd11a359a188Ed90d3132d07b' as const;

const PLAN: Plan = {
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

test('buildExecutionSteps returns PositionRegistry steps and a deterministic positionId', () => {
  const { steps, onchainPlanHash, positionId, position } = buildExecutionSteps({
    userAddress: '0x2222222222222222222222222222222222222222',
    intentId: 'int_123',
    planId: 'plan_123',
    plan: PLAN,
    positionRegistryAddress: POSITION_REGISTRY,
  });

  assert.equal(steps.length, 1);
  assert.equal(steps[0].target, POSITION_REGISTRY);
  assert.ok(onchainPlanHash.startsWith('0x'));
  assert.ok(positionId.startsWith('0x'));
  assert.equal(position.token0, BASE_SEPOLIA.USDC);
  assert.equal(position.token1, BASE_SEPOLIA.WETH);
  assert.equal(position.amount0, 5000000n);
  assert.equal(position.amount1, 1000000000000000n);

  const decoded = decodeFunctionData({
    abi: positionRegistryAbi,
    data: steps[0].callData,
  });
  assert.equal(decoded.functionName, 'recordPosition');
});

test('buildExecutorExecution encodes a valid execute() call', () => {
  const { steps, onchainPlanHash, positionId, position } = buildExecutionSteps({
    userAddress: '0x2222222222222222222222222222222222222222',
    intentId: 'int_123',
    planId: 'plan_123',
    plan: PLAN,
    positionRegistryAddress: POSITION_REGISTRY,
  });

  const tx = buildExecutorExecution({
    executorAddress: '0x1111111111111111111111111111111111111111',
    intentId:        'int_123',
    userAddress:     '0x2222222222222222222222222222222222222222',
    onchainPlanHash,
    signature:       '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc01',
    deadline:        1_700_000_000n,
    steps,
    positionId,
    position,
  });

  assert.equal(tx.address, '0x1111111111111111111111111111111111111111');
  assert.equal(tx.functionName, 'execute');
  assert.equal(tx.args[0].planHash, onchainPlanHash);
  assert.equal(tx.args[0].steps[0].target, POSITION_REGISTRY);
  assert.ok(tx.args[0].steps[0].callData.length > 2);

  const intentIdBytes32 = buildPlanIntentBytes32('int_123');
  assert.equal(tx.args[0].intentId, intentIdBytes32);
});
