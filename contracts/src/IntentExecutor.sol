// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IPositionRegistry} from "./IPositionRegistry.sol";

interface IIntentRegistry {
    function fulfillIntent(bytes32 intentId, bytes4 builderCode) external payable;
}

contract IntentExecutor is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum StepType { Swap, AddLiquidity, Supply, Borrow, Bridge }

    struct Step {
        StepType stepType;
        address target;
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
        bytes32 planHash;
        bytes   signature;
        Step[]  steps;
        // Optional registry settlement.
        // Set registryAddress = address(0) to skip.
        // When set, the ETH sent with execute() is forwarded as the protocol fee.
        address registryAddress;
        bytes4  builderCode;
    }

    address public immutable owner;
    IPositionRegistry public immutable registry;
    mapping(address => bool) public allowedTargets;

    event ExecutionStarted(bytes32 indexed intentId, address indexed user);
    event StepExecuted(bytes32 indexed intentId, uint256 stepIndex, StepType stepType);
    event ExecutionCompleted(bytes32 indexed intentId);
    event ExecutionFailed(bytes32 indexed intentId, uint256 stepIndex, bytes reason);
    event RegistrySettled(bytes32 indexed intentId, address registry, uint256 fee);

    error DeadlineExpired();
    error PlanHashMismatch();
    error EmptyPlan();
    error InvalidSignature();
    error CallerMismatch();
    error TargetNotAllowed(address target);
    error StepFailed(uint256 index);
    error Unauthorized();
    error RegistryCallFailed();

    constructor(address _registry) {
        owner    = msg.sender;
        registry = IPositionRegistry(_registry);
    }

    function setAllowedTarget(address target, bool allowed) external {
        if (msg.sender != owner) revert Unauthorized();
        allowedTargets[target] = allowed;
    }

    /// @notice Execute a signed plan. If registryAddress is set, forwards
    ///         msg.value to IntentRegistry.fulfillIntent as the protocol fee.
    function execute(ExecutionParams calldata params) external payable nonReentrant {
        if (block.timestamp > params.deadline) revert DeadlineExpired();
        if (params.steps.length == 0) revert EmptyPlan();

        bytes32 computedHash = keccak256(abi.encode(params.steps));
        if (computedHash != params.planHash) revert PlanHashMismatch();

        bytes32 digest = keccak256(abi.encode(
            block.chainid,
            address(this),
            params.intentId,
            params.user,
            params.deadline,
            params.planHash
        ));
        address recovered = ECDSA.recover(
            MessageHashUtils.toEthSignedMessageHash(digest),
            params.signature
        );
        if (recovered != params.user) revert InvalidSignature();
        if (msg.sender != params.user) revert CallerMismatch();

        emit ExecutionStarted(params.intentId, params.user);

        for (uint256 i = 0; i < params.steps.length; i++) {
            Step calldata step = params.steps[i];
            if (!allowedTargets[step.target]) revert TargetNotAllowed(step.target);

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

        // Settle fee with IntentRegistry if wired. Forwards all msg.value as fee.
        if (params.registryAddress != address(0) && msg.value > 0) {
            IIntentRegistry(params.registryAddress).fulfillIntent{value: msg.value}(
                params.intentId,
                params.builderCode
            );
            emit RegistrySettled(params.intentId, params.registryAddress, msg.value);
        }
    }
}
