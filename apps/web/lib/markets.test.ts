import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVE_MARKET } from './markets';

test('ACTIVE_MARKET defines the current v0 target market explicitly', () => {
  assert.equal(ACTIVE_MARKET.id, 'base-usdc-weth-005');
  assert.equal(ACTIVE_MARKET.label, 'USDC/WETH 0.05%');
  assert.equal(ACTIVE_MARKET.inputTokenSymbol, 'USDC');
  assert.equal(ACTIVE_MARKET.outputTokenSymbol, 'WETH');
  assert.deepEqual(ACTIVE_MARKET.stableReferenceSymbols, ['usdc', 'usdt']);
  assert.deepEqual(ACTIVE_MARKET.lpSymbols, ['usdc', 'weth']);
});
