import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFunctionData } from 'viem';
import { BASE_SEPOLIA } from '@uni-agent/shared';

import { buildPermit2Approval, permit2Abi } from './permit2';

test('buildPermit2Approval encodes Permit2 approve calldata for Base Sepolia USDC', () => {
  const tx = buildPermit2Approval({
    spender: BASE_SEPOLIA.UNISWAP_UNIVERSAL_ROUTER,
    amount: 1_000_000n,
  });

  assert.equal(tx.address, BASE_SEPOLIA.PERMIT2);
  assert.equal(tx.functionName, 'approve');

  const decoded = decodeFunctionData({
    abi: permit2Abi,
    data: tx.data,
  });

  assert.equal(decoded.functionName, 'approve');
  assert.deepEqual(decoded.args, [
    BASE_SEPOLIA.USDC,
    BASE_SEPOLIA.UNISWAP_UNIVERSAL_ROUTER,
    1_000_000n,
    281474976710655,
  ]);
});
