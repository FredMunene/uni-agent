// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// Stub lending adapter — emits events so the demo tracker shows supply/borrow steps
// Replace with Aave V3 IPool calls for production
contract MockLendingAdapter {
    using SafeERC20 for IERC20;

    event Supplied(address indexed user, address indexed asset, uint256 amount);
    event Borrowed(address indexed user, address indexed asset, uint256 amount);

    function supply(address asset, uint256 amount, address onBehalfOf) external {
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        emit Supplied(onBehalfOf, asset, amount);
    }

    function borrow(address asset, uint256 amount, address onBehalfOf) external {
        // In production: call Aave IPool.borrow(), check health factor
        emit Borrowed(onBehalfOf, asset, amount);
    }
}
