// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IntentVault} from "../src/IntentVault.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {
        _mint(msg.sender, 1_000_000e6);
    }
}

contract IntentVaultTest is Test {
    IntentVault vault;
    MockToken token;

    address user = address(0x1);
    address executor = address(0x2);
    address attacker = address(0x3);

    bytes32 intentId = keccak256("intent-001");
    uint256 amount = 100e6;

    function setUp() public {
        token = new MockToken();
        vault = new IntentVault(executor);

        // fund user
        token.transfer(user, amount * 3);
        vm.prank(user);
        token.approve(address(vault), type(uint256).max);
    }

    function test_deposit() public {
        vm.prank(user);
        vault.deposit(address(token), amount, intentId);

        (address _user, address _token, uint256 _amount, bool released, bool refunded) =
            vault.deposits(intentId);
        assertEq(_user, user);
        assertEq(_token, address(token));
        assertEq(_amount, amount);
        assertFalse(released);
        assertFalse(refunded);
        assertEq(token.balanceOf(address(vault)), amount);
    }

    function test_releaseToExecutor() public {
        vm.prank(user);
        vault.deposit(address(token), amount, intentId);

        vm.prank(executor);
        vault.releaseToExecutor(intentId);

        assertEq(token.balanceOf(executor), amount);
        (, , , bool released,) = vault.deposits(intentId);
        assertTrue(released);
    }

    function test_revert_releaseByNonExecutor() public {
        vm.prank(user);
        vault.deposit(address(token), amount, intentId);

        vm.prank(attacker);
        vm.expectRevert(IntentVault.Unauthorized.selector);
        vault.releaseToExecutor(intentId);
    }

    function test_revert_doubleRelease() public {
        vm.prank(user);
        vault.deposit(address(token), amount, intentId);

        vm.prank(executor);
        vault.releaseToExecutor(intentId);

        vm.prank(executor);
        vm.expectRevert(IntentVault.AlreadySettled.selector);
        vault.releaseToExecutor(intentId);
    }

    function test_refundByUser() public {
        vm.prank(user);
        vault.deposit(address(token), amount, intentId);

        uint256 balBefore = token.balanceOf(user);
        vm.prank(user);
        vault.refund(intentId);

        assertEq(token.balanceOf(user), balBefore + amount);
        (, , , , bool refunded) = vault.deposits(intentId);
        assertTrue(refunded);
    }

    function test_refundByExecutor() public {
        vm.prank(user);
        vault.deposit(address(token), amount, intentId);

        vm.prank(executor);
        vault.refund(intentId);

        assertEq(token.balanceOf(user), amount * 3); // full balance restored
    }

    function test_revert_refundAfterRelease() public {
        vm.prank(user);
        vault.deposit(address(token), amount, intentId);

        vm.prank(executor);
        vault.releaseToExecutor(intentId);

        vm.prank(user);
        vm.expectRevert(IntentVault.AlreadySettled.selector);
        vault.refund(intentId);
    }

    function test_revert_refundByAttacker() public {
        vm.prank(user);
        vault.deposit(address(token), amount, intentId);

        vm.prank(attacker);
        vm.expectRevert(IntentVault.Unauthorized.selector);
        vault.refund(intentId);
    }

    function test_revert_duplicateDeposit() public {
        vm.prank(user);
        vault.deposit(address(token), amount, intentId);

        vm.prank(user);
        vm.expectRevert("Intent already deposited");
        vault.deposit(address(token), amount, intentId);
    }
}
