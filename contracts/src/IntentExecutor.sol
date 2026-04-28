// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IPositionRegistry} from "./IPositionRegistry.sol";

contract IntentExecutor is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum StepType { Swap, AddLiquidity, Supply, Borrow, Bridge }

    struct Step {
        StepType stepType;
        address target;       // allowlisted contract to call
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        bytes callData;
    }

    struct ExecutionParams {
        bytes32 intentId;
        address user;
        uint256 deadline;
        bytes32 planHash;     // hash of steps — user signed this
        bytes signature;      // signature over the execution digest
        Step[] steps;
    }

    address public immutable owner;
    IPositionRegistry public immutable registry;
    mapping(address => bool) public allowedTargets;

    event ExecutionStarted(bytes32 indexed intentId, address indexed user);
    event StepExecuted(bytes32 indexed intentId, uint256 stepIndex, StepType stepType);
    event ExecutionCompleted(bytes32 indexed intentId);
    event ExecutionFailed(bytes32 indexed intentId, uint256 stepIndex, bytes reason);

    error DeadlineExpired();
    error PlanHashMismatch();
    error EmptyPlan();
    error InvalidSignature();
    error TargetNotAllowed(address target);
    error StepFailed(uint256 index);
    error Unauthorized();

    constructor(address _registry) {
        owner = msg.sender;
        registry = IPositionRegistry(_registry);
    }

    function setAllowedTarget(address target, bool allowed) external {
        if (msg.sender != owner) revert Unauthorized();
        allowedTargets[target] = allowed;
    }

    function execute(ExecutionParams calldata params) external nonReentrant {
        if (block.timestamp > params.deadline) revert DeadlineExpired();
        if (params.steps.length == 0) revert EmptyPlan();

        bytes32 computedHash = keccak256(abi.encode(params.steps));
        if (computedHash != params.planHash) revert PlanHashMismatch();

        bytes32 digest = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                params.intentId,
                params.user,
                params.deadline,
                params.planHash
            )
        );
        address recovered = ECDSA.recover(MessageHashUtils.toEthSignedMessageHash(digest), params.signature);
        if (recovered != params.user) revert InvalidSignature();

        emit ExecutionStarted(params.intentId, params.user);

        for (uint256 i = 0; i < params.steps.length; i++) {
            Step calldata step = params.steps[i];
            if (!allowedTargets[step.target]) revert TargetNotAllowed(step.target);

            // Approve target to spend tokenIn
            if (step.tokenIn != address(0) && step.amountIn > 0) {
                IERC20(step.tokenIn).forceApprove(step.target, step.amountIn);
            }

            (bool success, bytes memory returnData) = step.target.call(step.callData);
            if (!success) {
                emit ExecutionFailed(params.intentId, i, returnData);
                revert StepFailed(i);
            }

            emit StepExecuted(params.intentId, i, step.stepType);
        }

        emit ExecutionCompleted(params.intentId);
    }
}
