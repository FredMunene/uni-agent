// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract IntentVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Deposit {
        address user;
        address token;
        uint256 amount;
        bool released;
        bool refunded;
    }

    address public immutable executor;
    mapping(bytes32 => Deposit) public deposits;

    event Deposited(bytes32 indexed intentId, address indexed user, address token, uint256 amount);
    event Released(bytes32 indexed intentId, address indexed executor, uint256 amount);
    event Refunded(bytes32 indexed intentId, address indexed user, uint256 amount);

    error Unauthorized();
    error AlreadySettled();
    error NothingToRefund();

    constructor(address _executor) {
        executor = _executor;
    }

    function deposit(address token, uint256 amount, bytes32 intentId) external nonReentrant {
        require(deposits[intentId].user == address(0), "Intent already deposited");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        deposits[intentId] = Deposit({
            user: msg.sender,
            token: token,
            amount: amount,
            released: false,
            refunded: false
        });
        emit Deposited(intentId, msg.sender, token, amount);
    }

    function releaseToExecutor(bytes32 intentId) external nonReentrant {
        if (msg.sender != executor) revert Unauthorized();
        Deposit storage d = deposits[intentId];
        if (d.released || d.refunded) revert AlreadySettled();
        d.released = true;
        IERC20(d.token).safeTransfer(executor, d.amount);
        emit Released(intentId, executor, d.amount);
    }

    function refund(bytes32 intentId) external nonReentrant {
        Deposit storage d = deposits[intentId];
        if (d.user == address(0)) revert NothingToRefund();
        if (d.released || d.refunded) revert AlreadySettled();
        // Allow refund by the user or the executor (e.g. on failure)
        if (msg.sender != d.user && msg.sender != executor) revert Unauthorized();
        d.refunded = true;
        IERC20(d.token).safeTransfer(d.user, d.amount);
        emit Refunded(intentId, d.user, d.amount);
    }
}
