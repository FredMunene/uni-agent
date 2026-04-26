// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPositionRegistry} from "./IPositionRegistry.sol";

contract PositionRegistry is IPositionRegistry {
    mapping(bytes32 => Position) private positions;
    address public immutable executor;

    error Unauthorized();

    constructor(address _executor) {
        executor = _executor;
    }

    function recordPosition(bytes32 positionId, Position calldata position) external override {
        if (msg.sender != executor) revert Unauthorized();
        positions[positionId] = position;
        emit PositionRecorded(
            positionId,
            position.owner,
            position.token0,
            position.token1,
            position.liquidity
        );
    }

    function getPosition(bytes32 positionId) external view override returns (Position memory) {
        return positions[positionId];
    }
}
