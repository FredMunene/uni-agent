// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IntentExecutor} from "../src/IntentExecutor.sol";

contract MockTarget {
    bool public called;

    function run() external {
        called = true;
    }
}

contract IntentExecutorTest is Test {
    IntentExecutor executor;
    MockTarget target;

    address registry = address(0xBEEF);
    uint256 userPk = 0xA11CE;
    address user;
    address attacker = address(0xB0B);
    bytes32 intentId = keccak256("intent-001");
    uint256 deadline;

    function setUp() public {
        user = vm.addr(userPk);
        deadline = block.timestamp + 1 hours;
        executor = new IntentExecutor(registry);
        target = new MockTarget();
        executor.setAllowedTarget(address(target), true);
    }

    function test_execute_requires_valid_user_signature() public {
        IntentExecutor.Step[] memory steps = _buildSteps();
        bytes32 planHash = keccak256(abi.encode(steps));
        bytes memory signature = _signExecution(userPk, intentId, user, deadline, planHash);

        IntentExecutor.ExecutionParams memory params = IntentExecutor.ExecutionParams({
            intentId: intentId,
            user: user,
            deadline: deadline,
            planHash: planHash,
            signature: signature,
            steps: steps
        });

        vm.prank(user);
        executor.execute(params);

        assertEq(target.called(), true);
    }

    function test_execute_reverts_for_invalid_signer() public {
        IntentExecutor.Step[] memory steps = _buildSteps();
        bytes32 planHash = keccak256(abi.encode(steps));
        bytes memory signature = _signExecution(uint256(uint160(attacker)), intentId, user, deadline, planHash);

        IntentExecutor.ExecutionParams memory params = IntentExecutor.ExecutionParams({
            intentId: intentId,
            user: user,
            deadline: deadline,
            planHash: planHash,
            signature: signature,
            steps: steps
        });

        vm.expectRevert(IntentExecutor.InvalidSignature.selector);
        executor.execute(params);
    }

    function test_execute_reverts_for_wrong_caller_even_with_valid_signature() public {
        IntentExecutor.Step[] memory steps = _buildSteps();
        bytes32 planHash = keccak256(abi.encode(steps));
        bytes memory signature = _signExecution(userPk, intentId, user, deadline, planHash);

        IntentExecutor.ExecutionParams memory params = IntentExecutor.ExecutionParams({
            intentId: intentId,
            user: user,
            deadline: deadline,
            planHash: planHash,
            signature: signature,
            steps: steps
        });

        vm.prank(attacker);
        vm.expectRevert(IntentExecutor.CallerMismatch.selector);
        executor.execute(params);
    }

    function _buildSteps() internal view returns (IntentExecutor.Step[] memory steps) {
        steps = new IntentExecutor.Step[](1);
        steps[0] = IntentExecutor.Step({
            stepType: IntentExecutor.StepType.Swap,
            target: address(target),
            tokenIn: address(0),
            tokenOut: address(0),
            amountIn: 0,
            minAmountOut: 0,
            callData: abi.encodeCall(MockTarget.run, ())
        });
    }

    function _signExecution(
        uint256 pk,
        bytes32 _intentId,
        address _user,
        uint256 _deadline,
        bytes32 _planHash
    ) internal view returns (bytes memory signature) {
        bytes32 digest = keccak256(
            abi.encode(block.chainid, address(executor), _intentId, _user, _deadline, _planHash)
        );
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(digest);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, ethHash);
        signature = abi.encodePacked(r, s, v);
    }
}
