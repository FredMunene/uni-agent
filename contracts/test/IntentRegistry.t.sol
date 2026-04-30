// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IntentRegistry} from "../src/IntentRegistry.sol";

contract IntentRegistryTest is Test {
    IntentRegistry registry;

    address owner    = address(this);
    address treasury = address(0xFEE5);
    address solver1  = address(0xAAAA);
    address solver2  = address(0xBBBB);
    address user     = address(0xCCCC);

    bytes4  code1    = bytes4(0xDEAD1234);
    bytes4  code2    = bytes4(0xBEEF5678);
    bytes32 intentId = keccak256("intent-001");
    bytes32 planHash = keccak256("plan-balanced");

    uint256 constant STAKE    = 0.05 ether;
    uint256 constant BOND     = 0.001 ether;

    function setUp() public {
        registry = new IntentRegistry(treasury);
        vm.deal(solver1, 10 ether);
        vm.deal(solver2, 10 ether);
        vm.deal(user, 10 ether);
    }

    // ── registration ─────────────────────────────────────────────────────────

    function test_register_solver_stores_all_fields() public {
        vm.prank(solver1);
        registry.registerSolver{value: STAKE}(
            solver1, "Gemini-LP-v1", "gemini-lp.solvers.uni-agent.eth", code1, "https://solver.example.com"
        );

        (
            address feeRecipient,
            string memory name,
            string memory ensName,
            bytes4 bCode,
            ,
            uint256 stake,
            uint256 fulfilled,
            uint256 slashed,
            IntentRegistry.SolverStatus status,
        ) = registry.solvers(solver1);

        assertEq(feeRecipient, solver1);
        assertEq(name, "Gemini-LP-v1");
        assertEq(ensName, "gemini-lp.solvers.uni-agent.eth");
        assertEq(bCode, code1);
        assertEq(stake, STAKE);
        assertEq(fulfilled, 0);
        assertEq(slashed, 0);
        assertEq(uint8(status), uint8(IntentRegistry.SolverStatus.Active));
        assertEq(registry.builderCodeToSolver(code1), solver1);
    }

    function test_register_reverts_wrong_stake() public {
        vm.prank(solver1);
        vm.expectRevert(IntentRegistry.WrongStake.selector);
        registry.registerSolver{value: 0.01 ether}(
            solver1, "X", "x.eth", code1, ""
        );
    }

    function test_register_reverts_if_already_registered() public {
        vm.startPrank(solver1);
        registry.registerSolver{value: STAKE}(solver1, "X", "x.eth", code1, "");
        vm.expectRevert(IntentRegistry.AlreadyRegistered.selector);
        registry.registerSolver{value: STAKE}(solver1, "X", "x.eth", code2, "");
        vm.stopPrank();
    }

    function test_register_reverts_duplicate_builder_code() public {
        vm.prank(solver1);
        registry.registerSolver{value: STAKE}(solver1, "A", "a.eth", code1, "");

        vm.prank(solver2);
        vm.expectRevert(IntentRegistry.BuilderCodeTaken.selector);
        registry.registerSolver{value: STAKE}(solver2, "B", "b.eth", code1, "");
    }

    // ── withdrawal ───────────────────────────────────────────────────────────

    function test_withdrawal_requires_24h_delay() public {
        vm.startPrank(solver1);
        registry.registerSolver{value: STAKE}(solver1, "X", "x.eth", code1, "");
        registry.requestWithdrawal();

        vm.expectRevert(IntentRegistry.WithdrawalTooEarly.selector);
        registry.claimWithdrawal();
        vm.stopPrank();
    }

    function test_withdrawal_succeeds_after_delay() public {
        vm.startPrank(solver1);
        registry.registerSolver{value: STAKE}(solver1, "X", "x.eth", code1, "");
        registry.requestWithdrawal();

        vm.warp(block.timestamp + 25 hours);
        uint256 before = solver1.balance;
        registry.claimWithdrawal();
        assertEq(solver1.balance - before, STAKE);
        vm.stopPrank();
    }

    function test_withdrawal_without_request_reverts() public {
        vm.startPrank(solver1);
        registry.registerSolver{value: STAKE}(solver1, "X", "x.eth", code1, "");
        vm.expectRevert(IntentRegistry.WithdrawalNotRequested.selector);
        registry.claimWithdrawal();
        vm.stopPrank();
    }

    // ── intent lifecycle ─────────────────────────────────────────────────────

    function test_create_intent_stores_correctly() public {
        address usdc = address(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
        registry.createIntent(intentId, user, usdc, 1000e6, 1);

        (
            address u,
            address asset,
            uint256 amount,
            uint8 risk,
            IntentRegistry.IntentStatus status,
        ) = registry.intents(intentId);

        assertEq(u, user);
        assertEq(asset, usdc);
        assertEq(amount, 1000e6);
        assertEq(risk, 1);
        assertEq(uint8(status), uint8(IntentRegistry.IntentStatus.Open));
    }

    // ── strategy submission ───────────────────────────────────────────────────

    function _registerAndCreateIntent() internal {
        vm.prank(solver1);
        registry.registerSolver{value: STAKE}(solver1, "X", "x.eth", code1, "");
        registry.createIntent(intentId, user, address(0), 1000e6, 1);
    }

    function test_submit_strategy_records_and_returns_id() public {
        _registerAndCreateIntent();

        uint256 validUntil = block.timestamp + 5 minutes;
        vm.prank(solver1);
        bytes32 stratId = registry.submitStrategy{value: BOND}(intentId, planHash, validUntil);

        (address s, bytes32 ph, uint256 vu, uint256 bond, bool refunded) = registry.strategies(stratId);
        assertEq(s, solver1);
        assertEq(ph, planHash);
        assertEq(vu, validUntil);
        assertEq(bond, BOND);
        assertEq(refunded, false);

        bytes32[] memory ids = registry.getIntentStrategies(intentId);
        assertEq(ids.length, 1);
        assertEq(ids[0], stratId);
    }

    function test_submit_strategy_reverts_wrong_bond() public {
        _registerAndCreateIntent();
        vm.prank(solver1);
        vm.expectRevert(IntentRegistry.WrongBidBond.selector);
        registry.submitStrategy{value: 0.0001 ether}(intentId, planHash, block.timestamp + 5 minutes);
    }

    function test_submit_strategy_reverts_inactive_solver() public {
        registry.createIntent(intentId, user, address(0), 1000e6, 1);
        vm.prank(solver1); // not registered
        vm.expectRevert(IntentRegistry.SolverNotActive.selector);
        registry.submitStrategy{value: BOND}(intentId, planHash, block.timestamp + 5 minutes);
    }

    function test_submit_strategy_reverts_intent_not_open() public {
        _registerAndCreateIntent();
        uint256 validUntil = block.timestamp + 5 minutes;

        vm.prank(solver1);
        bytes32 stratId = registry.submitStrategy{value: BOND}(intentId, planHash, validUntil);

        // user selects it → intent moves to Selected
        vm.prank(user);
        registry.selectStrategy(intentId, stratId);

        // now submitting again should fail
        vm.prank(solver1);
        vm.expectRevert(IntentRegistry.IntentNotOpen.selector);
        registry.submitStrategy{value: BOND}(intentId, planHash, block.timestamp + 5 minutes);
    }

    // ── strategy selection ────────────────────────────────────────────────────

    function test_select_strategy_transitions_intent() public {
        _registerAndCreateIntent();
        uint256 validUntil = block.timestamp + 5 minutes;

        vm.prank(solver1);
        bytes32 stratId = registry.submitStrategy{value: BOND}(intentId, planHash, validUntil);

        vm.prank(user);
        registry.selectStrategy(intentId, stratId);

        (,,,, IntentRegistry.IntentStatus status, bytes32 selected) = registry.intents(intentId);
        assertEq(uint8(status), uint8(IntentRegistry.IntentStatus.Selected));
        assertEq(selected, stratId);
    }

    function test_select_strategy_reverts_wrong_user() public {
        _registerAndCreateIntent();
        vm.prank(solver1);
        bytes32 stratId = registry.submitStrategy{value: BOND}(intentId, planHash, block.timestamp + 5 minutes);

        vm.prank(solver2); // not the intent user
        vm.expectRevert(IntentRegistry.NotIntentUser.selector);
        registry.selectStrategy(intentId, stratId);
    }

    function test_select_strategy_reverts_if_expired() public {
        _registerAndCreateIntent();
        uint256 validUntil = block.timestamp + 5 minutes;

        vm.prank(solver1);
        bytes32 stratId = registry.submitStrategy{value: BOND}(intentId, planHash, validUntil);

        vm.warp(block.timestamp + 10 minutes); // strategy expired
        vm.prank(user);
        vm.expectRevert(IntentRegistry.StrategyExpired.selector);
        registry.selectStrategy(intentId, stratId);
    }

    // ── intent fulfillment ────────────────────────────────────────────────────

    function _setupSelectedIntent() internal returns (bytes32 stratId) {
        _registerAndCreateIntent();
        vm.prank(solver1);
        stratId = registry.submitStrategy{value: BOND}(intentId, planHash, block.timestamp + 5 minutes);
        vm.prank(user);
        registry.selectStrategy(intentId, stratId);
    }

    function test_fulfill_intent_routes_fee_correctly() public {
        _setupSelectedIntent();

        uint256 fee = 1 ether;
        uint256 solverBefore   = solver1.balance;
        uint256 treasuryBefore = treasury.balance;

        // Protocol calls fulfillIntent with fee amount + correct builder code
        registry.fulfillIntent{value: fee}(intentId, code1);

        uint256 expectedSolverShare   = (fee * 7000) / 10_000; // 70%
        uint256 expectedTreasuryShare = fee - expectedSolverShare; // 30%

        // solver gets share + bid bond back
        assertEq(solver1.balance, solverBefore + expectedSolverShare + BOND);
        assertEq(treasury.balance, treasuryBefore + expectedTreasuryShare);
    }

    function test_fulfill_intent_increments_fulfilled_count() public {
        _setupSelectedIntent();
        registry.fulfillIntent{value: 0.1 ether}(intentId, code1);

        (,,,,, , uint256 count,,, ) = registry.solvers(solver1);
        assertEq(count, 1);
    }

    function test_fulfill_intent_marks_strategy_refunded() public {
        bytes32 stratId = _setupSelectedIntent();
        registry.fulfillIntent{value: 0.1 ether}(intentId, code1);

        (,,,, bool refunded) = registry.strategies(stratId);
        assertEq(refunded, true);
    }

    function test_fulfill_intent_reverts_wrong_builder_code() public {
        _setupSelectedIntent();
        vm.expectRevert("Builder code mismatch");
        registry.fulfillIntent{value: 0.1 ether}(intentId, code2); // code2 not solver1's code
    }

    function test_fulfill_intent_reverts_if_not_selected() public {
        _registerAndCreateIntent();
        vm.expectRevert(IntentRegistry.IntentNotSelected.selector);
        registry.fulfillIntent{value: 0.1 ether}(intentId, code1);
    }

    // ── bid bond refund ───────────────────────────────────────────────────────

    function test_refund_bid_bond_after_expiry() public {
        _registerAndCreateIntent();
        uint256 validUntil = block.timestamp + 5 minutes;

        vm.prank(solver1);
        bytes32 stratId = registry.submitStrategy{value: BOND}(intentId, planHash, validUntil);

        vm.warp(block.timestamp + 10 minutes);
        uint256 before = solver1.balance;
        vm.prank(solver1);
        registry.refundBidBond(stratId);
        assertEq(solver1.balance, before + BOND);
    }

    function test_refund_bid_bond_reverts_before_expiry() public {
        _registerAndCreateIntent();
        vm.prank(solver1);
        bytes32 stratId = registry.submitStrategy{value: BOND}(intentId, planHash, block.timestamp + 5 minutes);

        vm.prank(solver1);
        vm.expectRevert("Not yet expired");
        registry.refundBidBond(stratId);
    }

    // ── slashing ─────────────────────────────────────────────────────────────

    function test_slash_solver_transfers_stake_to_treasury() public {
        vm.prank(solver1);
        registry.registerSolver{value: STAKE}(solver1, "X", "x.eth", code1, "");

        uint256 before = treasury.balance;
        registry.slashSolver(solver1, "Submitted invalid calldata");

        assertEq(treasury.balance, before + STAKE);

        (,,,,, uint256 stake,, uint256 slashed, IntentRegistry.SolverStatus status,) = registry.solvers(solver1);
        assertEq(stake, 0);
        assertEq(slashed, STAKE);
        assertEq(uint8(status), uint8(IntentRegistry.SolverStatus.Slashed));
    }

    function test_slash_reverts_for_non_owner() public {
        vm.prank(solver1);
        registry.registerSolver{value: STAKE}(solver1, "X", "x.eth", code1, "");

        vm.prank(solver2);
        vm.expectRevert(IntentRegistry.Unauthorized.selector);
        registry.slashSolver(solver1, "attack");
    }

    function test_slash_is_idempotent() public {
        vm.prank(solver1);
        registry.registerSolver{value: STAKE}(solver1, "X", "x.eth", code1, "");

        registry.slashSolver(solver1, "first");
        // second call must not revert, stake is already 0
        registry.slashSolver(solver1, "second");
    }

    // ── two solvers competing ─────────────────────────────────────────────────

    function test_two_solvers_only_winner_gets_fee() public {
        vm.prank(solver1);
        registry.registerSolver{value: STAKE}(solver1, "A", "a.eth", code1, "");
        vm.prank(solver2);
        registry.registerSolver{value: STAKE}(solver2, "B", "b.eth", code2, "");

        registry.createIntent(intentId, user, address(0), 1000e6, 1);

        uint256 validUntil = block.timestamp + 5 minutes;
        vm.prank(solver1);
        registry.submitStrategy{value: BOND}(intentId, keccak256("plan-A"), validUntil);
        vm.prank(solver2);
        bytes32 strat2 = registry.submitStrategy{value: BOND}(intentId, keccak256("plan-B"), validUntil);

        // user picks solver2
        vm.prank(user);
        registry.selectStrategy(intentId, strat2);

        uint256 fee = 0.1 ether;
        uint256 s2Before = solver2.balance;

        registry.fulfillIntent{value: fee}(intentId, code2);

        uint256 expectedShare = (fee * 7000) / 10_000;
        assertEq(solver2.balance, s2Before + expectedShare + BOND);
    }
}
