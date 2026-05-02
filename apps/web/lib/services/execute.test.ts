import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFunctionData } from 'viem';
import { BASE_SEPOLIA } from '@uni-agent/shared';

import {
  buildPositionManagerModifyLiquidities,
  buildUniversalRouterExecute,
  positionManagerAbi,
  universalRouterAbi,
} from './execute';

test('buildUniversalRouterExecute encodes execute(bytes,bytes[],uint256)', () => {
  const tx = buildUniversalRouterExecute({
    commands: '0x0b',
    inputs: ['0x1234'],
    deadline: 1_700_000_000n,
  });

  assert.equal(tx.address, BASE_SEPOLIA.UNISWAP_UNIVERSAL_ROUTER);

  const decoded = decodeFunctionData({
    abi: universalRouterAbi,
    data: tx.data,
  });

  assert.equal(decoded.functionName, 'execute');
  assert.deepEqual(decoded.args, ['0x0b', ['0x1234'], 1_700_000_000n]);
});

test('buildPositionManagerModifyLiquidities encodes modifyLiquidities(bytes,uint256)', () => {
  const tx = buildPositionManagerModifyLiquidities({
    unlockData: '0xdeadbeef',
    deadline: 1_700_000_123n,
  });

  assert.equal(tx.address, BASE_SEPOLIA.UNISWAP_V4_POSITION_MANAGER);

  const decoded = decodeFunctionData({
    abi: positionManagerAbi,
    data: tx.data,
  });

  assert.equal(decoded.functionName, 'modifyLiquidities');
  assert.deepEqual(decoded.args, ['0xdeadbeef', 1_700_000_123n]);
});
