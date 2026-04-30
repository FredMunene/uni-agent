import test from 'node:test';
import assert from 'node:assert/strict';
import type { Intent } from '@uni-agent/shared';
import { buildPlan, retryTransient } from './index';
import type { AprSnapshot } from '../services/apr';
import { ACTIVE_MARKET } from '../markets';

function makeIntent(): Intent {
  return {
    intentId: 'int_123',
    userAddress: '0x1111111111111111111111111111111111111111',
    inputToken: 'USDC',
    inputAmount: '1000000',
    goal: 'Earn yield on my USDC',
    risk: 'medium',
    constraints: {
      maxSlippageBps: 50,
      deadlineSeconds: 900,
      allowBridge: false,
      allowBorrow: false,
    },
    status: 'created',
    createdAt: '2026-04-28T00:00:00.000Z',
  };
}

const aprSnapshot: AprSnapshot = {
  stable: {
    chain: 'Base',
    project: 'uniswap-v3',
    symbol: 'USDC-USDT',
    pool: 'stable-1',
    tvlUsd: 1000,
    apy: 4.2,
    apyBps: 420,
  },
  balanced: {
    chain: 'Base',
    project: 'uniswap-v3',
    symbol: 'USDC-WETH',
    pool: 'balanced-1',
    tvlUsd: 2500,
    apy: 12.5,
    apyBps: 1250,
  },
  aggressive: {
    chain: 'Base',
    project: 'uniswap-v3',
    symbol: 'USDC-WETH',
    pool: 'balanced-1-aggressive',
    tvlUsd: 2500,
    apy: 16.9,
    apyBps: 1690,
  },
  source: 'defillama',
  updatedAt: '2026-04-28T00:00:00.000Z',
};

test('buildPlan uses live APR data for strategy outputs', () => {
  const plans = buildPlan(
    makeIntent(),
    {
      get_swap_quote: { amountOut: '2500000000000000' },
      get_lp_params: { tickLower: -1000, tickUpper: 1000 },
      simulate_bundle: { gasUsd: '2.00' },
    },
    'summary',
    aprSnapshot,
  );

  assert.equal(plans.length, 3);
  assert.equal(plans[0].estimatedNetApyBps, 420);
  assert.equal(plans[1].estimatedNetApyBps, 1250);
  assert.equal(plans[2].estimatedNetApyBps, 1690);
  assert.match(plans[1].risk.notes, new RegExp(ACTIVE_MARKET.label.replace('/', '\\/')));
  assert.equal(plans[1].steps[0]?.fromToken, ACTIVE_MARKET.executionTokenIn);
  assert.equal(plans[1].steps[0]?.toToken, ACTIVE_MARKET.executionTokenOut);
});

test('retryTransient retries on transient Gemini failures', async () => {
  let attempts = 0;
  const value = await retryTransient(async () => {
    attempts += 1;
    if (attempts < 3) {
      throw new Error('503 Service Unavailable: temporarily unavailable');
    }
    return 'ok';
  }, 3);

  assert.equal(value, 'ok');
  assert.equal(attempts, 3);
});
