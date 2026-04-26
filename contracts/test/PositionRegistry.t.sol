// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PositionRegistry} from "../src/PositionRegistry.sol";
import {IPositionRegistry} from "../src/IPositionRegistry.sol";

contract PositionRegistryTest is Test {
    PositionRegistry registry;

    address executor = address(0x10);
    address owner = address(0x11);
    address attacker = address(0x12);
    address token0 = address(0xA0);
    address token1 = address(0xB0);

    bytes32 positionId = keccak256("pos-001");

    function setUp() public {
        registry = new PositionRegistry(executor);
    }

    function test_recordPosition() public {
        IPositionRegistry.Position memory pos = IPositionRegistry.Position({
            owner: owner,
            chainId: 84532,
            token0: token0,
            token1: token1,
            amount0: 50e6,
            amount1: 21e15,
            liquidity: 1_234_567,
            createdAt: block.timestamp
        });

        vm.prank(executor);
        registry.recordPosition(positionId, pos);

        IPositionRegistry.Position memory stored = registry.getPosition(positionId);
        assertEq(stored.owner, owner);
        assertEq(stored.token0, token0);
        assertEq(stored.amount0, 50e6);
        assertEq(stored.liquidity, 1_234_567);
    }

    function test_emitsEvent() public {
        IPositionRegistry.Position memory pos = IPositionRegistry.Position({
            owner: owner,
            chainId: 84532,
            token0: token0,
            token1: token1,
            amount0: 50e6,
            amount1: 21e15,
            liquidity: 1_234_567,
            createdAt: block.timestamp
        });

        vm.expectEmit(true, true, true, true);
        emit IPositionRegistry.PositionRecorded(positionId, owner, token0, token1, 1_234_567);

        vm.prank(executor);
        registry.recordPosition(positionId, pos);
    }

    function test_revert_recordByNonExecutor() public {
        IPositionRegistry.Position memory pos = IPositionRegistry.Position({
            owner: owner,
            chainId: 84532,
            token0: token0,
            token1: token1,
            amount0: 50e6,
            amount1: 21e15,
            liquidity: 1_234_567,
            createdAt: block.timestamp
        });

        vm.prank(attacker);
        vm.expectRevert(PositionRegistry.Unauthorized.selector);
        registry.recordPosition(positionId, pos);
    }
}
