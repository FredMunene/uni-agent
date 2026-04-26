// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPositionRegistry {
    struct Position {
        address owner;
        uint256 chainId;
        address token0;
        address token1;
        uint256 amount0;
        uint256 amount1;
        uint256 liquidity;
        uint256 createdAt;
    }

    event PositionRecorded(
        bytes32 indexed positionId,
        address indexed owner,
        address token0,
        address token1,
        uint256 liquidity
    );

    function recordPosition(bytes32 positionId, Position calldata position) external;
    function getPosition(bytes32 positionId) external view returns (Position memory);
}
