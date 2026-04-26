// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IntentVault} from "../src/IntentVault.sol";
import {IntentExecutor} from "../src/IntentExecutor.sol";
import {PositionRegistry} from "../src/PositionRegistry.sol";
import {MockLendingAdapter} from "../src/adapters/MockLendingAdapter.sol";

// Base Sepolia addresses
address constant UNIVERSAL_ROUTER = 0x050E797f3625EC8785265e1d9BDd4799b97528A1;
address constant V4_POSITION_MANAGER = 0x4B2C77d209D3405F41a037Ec6c77F7F5b8e2ca80;

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_EXECUTOR_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // 1. Registry (no dependencies)
        PositionRegistry registry = new PositionRegistry(address(0)); // temp executor = zero
        console.log("PositionRegistry:", address(registry));

        // 2. Executor (depends on registry)
        IntentExecutor executor = new IntentExecutor(address(registry));
        console.log("IntentExecutor:", address(executor));

        // 3. Vault (depends on executor)
        IntentVault vault = new IntentVault(address(executor));
        console.log("IntentVault:", address(vault));

        // 4. Mock lending adapter
        MockLendingAdapter lending = new MockLendingAdapter();
        console.log("MockLendingAdapter:", address(lending));

        // 5. Allowlist Uniswap targets in executor
        executor.setAllowedTarget(UNIVERSAL_ROUTER, true);
        executor.setAllowedTarget(V4_POSITION_MANAGER, true);
        executor.setAllowedTarget(address(lending), true);

        vm.stopBroadcast();

        console.log("\nAdd to .env:");
        console.log("INTENT_EXECUTOR_ADDRESS=%s", address(executor));
        console.log("INTENT_VAULT_ADDRESS=%s", address(vault));
        console.log("POSITION_REGISTRY_ADDRESS=%s", address(registry));
    }
}
