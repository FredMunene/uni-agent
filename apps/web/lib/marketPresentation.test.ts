import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDefaultGoal,
  marketAmountLabel,
  marketIntentPlaceholder,
  marketPoolLabel,
} from './marketPresentation';

test('market presentation helpers expose the active target market consistently', () => {
  assert.equal(marketPoolLabel(), 'USDC/WETH 0.05%');
  assert.equal(marketAmountLabel(), 'Amount (USDC)');
  assert.match(marketIntentPlaceholder(), /my USDC with low risk/);
  assert.equal(
    buildDefaultGoal('100', 'balanced'),
    'Earn yield on 100 USDC with balanced risk in USDC/WETH 0.05%',
  );
});
