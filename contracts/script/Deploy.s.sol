// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IntentRegistry} from "../src/IntentRegistry.sol";
import {IntentVault} from "../src/IntentVault.sol";
import {IntentExecutor} from "../src/IntentExecutor.sol";
import {PositionRegistry} from "../src/PositionRegistry.sol";
import {MockLendingAdapter} from "../src/adapters/MockLendingAdapter.sol";

// Base Sepolia — chainId 84532
address constant UNIVERSAL_ROUTER    = 0x050E797f3625EC8785265e1d9BDd4799b97528A1;
address constant V4_POSITION_MANAGER = 0x4B2C77d209D3405F41a037Ec6c77F7F5b8e2ca80;

contract Deploy is Script {
    function run() external {
        uint256 deployerKey  = vm.envUint("PRIVATE_EXECUTOR_KEY");
        address deployer     = vm.addr(deployerKey);
        address treasuryAddr = vm.envOr("TREASURY_ADDRESS", deployer); // defaults to deployer

        console.log("Deployer:  ", deployer);
        console.log("Treasury:  ", treasuryAddr);
        console.log("Chain ID:  ", block.chainid);

        vm.startBroadcast(deployerKey);

        // 1. IntentRegistry — solver registration, bid bonds, fee settlement, reputation
        IntentRegistry intentRegistry = new IntentRegistry(treasuryAddr);
        console.log("IntentRegistry:     ", address(intentRegistry));

        // 2. PositionRegistry — records LP position metadata
        PositionRegistry posRegistry = new PositionRegistry(address(0)); // executor wired below
        console.log("PositionRegistry:   ", address(posRegistry));

        // 3. IntentExecutor — runs DeFi steps, settles fee with IntentRegistry
        IntentExecutor executor = new IntentExecutor(address(posRegistry));
        console.log("IntentExecutor:     ", address(executor));

        // 4. IntentVault — holds user funds during execution
        IntentVault vault = new IntentVault(address(executor));
        console.log("IntentVault:        ", address(vault));

        // 5. Mock lending adapter (testnet only)
        MockLendingAdapter lending = new MockLendingAdapter();
        console.log("MockLendingAdapter: ", address(lending));

        // 6. Allowlist Uniswap contracts + lending adapter in executor
        executor.setAllowedTarget(UNIVERSAL_ROUTER, true);
        executor.setAllowedTarget(V4_POSITION_MANAGER, true);
        executor.setAllowedTarget(address(posRegistry), true);
        executor.setAllowedTarget(address(lending), true);

        // 7. Register built-in Gemini solver in IntentRegistry
        //    builderCode 0xDEAD1234, ENS name gemini-lp.solvers.uni-agent.eth
        uint256 stake = intentRegistry.registrationStake();
        intentRegistry.registerSolver{value: stake}(
            deployer,                              // feeRecipient
            "Gemini-LP-v1",                        // name
            "gemini-lp.solvers.uni-agent.eth",     // ensName
            bytes4(0xDEAD1234),                    // builderCode
            ""                                     // endpoint (server-side, not needed on-chain)
        );
        console.log("Built-in solver registered: gemini-lp.solvers.uni-agent.eth");

        vm.stopBroadcast();

        console.log("\n=== Add to Vercel / .env ===");
        console.log("NEXT_PUBLIC_INTENT_REGISTRY_ADDRESS=%s",  address(intentRegistry));
        console.log("NEXT_PUBLIC_INTENT_EXECUTOR_ADDRESS=%s",  address(executor));
        console.log("NEXT_PUBLIC_INTENT_VAULT_ADDRESS=%s",     address(vault));
        console.log("NEXT_PUBLIC_POSITION_REGISTRY_ADDRESS=%s", address(posRegistry));
    }
}
