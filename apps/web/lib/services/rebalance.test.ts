import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveRebalanceIntentDraft } from './rebalance';

test('deriveRebalanceIntentDraft derives a usable USDC amount', () => {
  const draft = deriveRebalanceIntentDraft({
    positionId: 'pos_123',
    pool: 'USDC/WETH 0.05%',
    token0Amount: '25000000',
    token1Amount: '1000000000000000',
    liquidity: '1',
  });

  assert.equal(draft.goal, 'Rebalance my USDC/WETH 0.05% position');
  assert.equal(draft.amount, '25');
});

test('deriveRebalanceIntentDraft falls back when the amount is unavailable', () => {
  const draft = deriveRebalanceIntentDraft({
    positionId: 'pos_123',
    pool: 'USDC/WETH 0.05%',
    token0Amount: '0',
    token1Amount: '0',
    liquidity: '1',
  });

  assert.equal(draft.amount, '10');
});
