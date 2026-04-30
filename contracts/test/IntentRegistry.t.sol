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
    address oracle   = address(0xDDDD);

    bytes4  code1    = bytes4(0xDEAD1234);
    bytes4  code2    = bytes4(0xBEEF5678);
    bytes32 intentId = keccak256("intent-001");
    bytes32 planHash = keccak256("plan-balanced");

    uint256 constant STAKE = 0.05 ether;
    uint256 constant BOND  = 0.001 ether;
    uint256 constant QUOTED_APY = 1240; // 12.40% in bps

    function setUp() public {
        registry = new IntentRegistry(treasury);
        vm.deal(solver1, 10 ether);
        vm.deal(solver2, 10 ether);
        vm.deal(user, 10 ether);
        vm.deal(oracle, 1 ether);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    function _register(address s, bytes4 code) internal {
        vm.prank(s);
        registry.registerSolver{value: STAKE}(s, "Solver", "solver.eth", code, "");
    }

    function _createIntent() internal {
        registry.createIntent(intentId, user, address(0xA0b8), 1000e6, 1);
    }

    function _submit(address s, uint256 apy) internal returns (bytes32 stratId) {
        vm.prank(s);
        stratId = registry.submitStrategy{value: BOND}(intentId, planHash, apy, block.timestamp + 5 minutes);
    }

    function _selectAndFulfill(bytes32 stratId, bytes4 code) internal {
        vm.prank(user);
        registry.selectStrategy(intentId, stratId);
        registry.fulfillIntent{value: 0.1 ether}(intentId, code);
    }

    // ── registration ─────────────────────────────────────────────────────────

    function test_register_solver_stores_all_fields() public {
        vm.prank(solver1);
        registry.registerSolver{value: STAKE}(
            solver1, "Gemini-LP-v1", "gemini-lp.solvers.uni-agent.eth", code1, "https://solver.example.com"
        );

        (
            address feeRecipient, string memory name, string memory ensName,
            bytes4 bCode,, uint256 stake, uint256 fulfilled, uint256 slashed,
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
        registry.registerSolver{value: 0.01 ether}(solver1, "X", "x.eth", code1, "");
    }

    function test_register_reverts_if_already_registered() public {
        vm.startPrank(solver1);
        registry.registerSolver{value: STAKE}(solver1, "X", "x.eth", code1, "");
        vm.expectRevert(IntentRegistry.AlreadyRegistered.selector);
        registry.registerSolver{value: STAKE}(solver1, "X", "x.eth", code2, "");
        vm.stopPrank();
    }

    function test_register_reverts_duplicate_builder_code() public {
        _register(solver1, code1);
        vm.prank(solver2);
        vm.expectRevert(IntentRegistry.BuilderCodeTaken.selector);
        registry.registerSolver{value: STAKE}(solver2, "B", "b.eth", code1, "");
    }

    // ── withdrawal ───────────────────────────────────────────────────────────

    function test_withdrawal_requires_24h_delay() public {
        _register(solver1, code1);
        vm.startPrank(solver1);
        registry.requestWithdrawal();
        vm.expectRevert(IntentRegistry.WithdrawalTooEarly.selector);
        registry.claimWithdrawal();
        vm.stopPrank();
    }

    function test_withdrawal_succeeds_after_delay() public {
        _register(solver1, code1);
        vm.startPrank(solver1);
        registry.requestWithdrawal();
        vm.warp(block.timestamp + 25 hours);
        uint256 before = solver1.balance;
        registry.claimWithdrawal();
        assertEq(solver1.balance - before, STAKE);
        vm.stopPrank();
    }

    function test_withdrawal_without_request_reverts() public {
        _register(solver1, code1);
        vm.prank(solver1);
        vm.expectRevert(IntentRegistry.WithdrawalNotRequested.selector);
        registry.claimWithdrawal();
    }

    // ── intent lifecycle ─────────────────────────────────────────────────────

    function test_create_intent_stores_correctly() public {
        address usdc = address(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
        registry.createIntent(intentId, user, usdc, 1000e6, 1);

        (address u, address asset, uint256 amount, uint8 risk, IntentRegistry.IntentStatus status,) =
            registry.intents(intentId);

        assertEq(u, user);
        assertEq(asset, usdc);
        assertEq(amount, 1000e6);
        assertEq(risk, 1);
        assertEq(uint8(status), uint8(IntentRegistry.IntentStatus.Open));
    }

    // ── strategy submission ───────────────────────────────────────────────────

    function test_submit_strategy_records_and_returns_id() public {
        _register(solver1, code1);
        _createIntent();

        vm.prank(solver1);
        bytes32 stratId = registry.submitStrategy{value: BOND}(
            intentId, planHash, QUOTED_APY, block.timestamp + 5 minutes
        );

        (address s, bytes32 ph, uint256 apy,, uint256 bond, bool refunded) = registry.strategies(stratId);
        assertEq(s, solver1);
        assertEq(ph, planHash);
        assertEq(apy, QUOTED_APY);
        assertEq(bond, BOND);
        assertEq(refunded, false);

        assertEq(registry.getIntentStrategies(intentId).length, 1);
    }

    function test_submit_strategy_reverts_wrong_bond() public {
        _register(solver1, code1);
        _createIntent();
        vm.prank(solver1);
        vm.expectRevert(IntentRegistry.WrongBidBond.selector);
        registry.submitStrategy{value: 0.0001 ether}(intentId, planHash, QUOTED_APY, block.timestamp + 5 minutes);
    }

    function test_submit_strategy_reverts_zero_quoted_apy() public {
        _register(solver1, code1);
        _createIntent();
        vm.prank(solver1);
        vm.expectRevert(IntentRegistry.QuotedApyZero.selector);
        registry.submitStrategy{value: BOND}(intentId, planHash, 0, block.timestamp + 5 minutes);
    }

    function test_submit_strategy_reverts_inactive_solver() public {
        _createIntent();
        vm.prank(solver1);
        vm.expectRevert(IntentRegistry.SolverNotActive.selector);
        registry.submitStrategy{value: BOND}(intentId, planHash, QUOTED_APY, block.timestamp + 5 minutes);
    }

    function test_submit_strategy_reverts_intent_not_open() public {
        _register(solver1, code1);
        _createIntent();
        bytes32 stratId = _submit(solver1, QUOTED_APY);
        vm.prank(user);
        registry.selectStrategy(intentId, stratId);

        vm.prank(solver1);
        vm.expectRevert(IntentRegistry.IntentNotOpen.selector);
        registry.submitStrategy{value: BOND}(intentId, planHash, QUOTED_APY, block.timestamp + 5 minutes);
    }

    // ── strategy selection ────────────────────────────────────────────────────

    function test_select_strategy_transitions_intent() public {
        _register(solver1, code1);
        _createIntent();
        bytes32 stratId = _submit(solver1, QUOTED_APY);

        vm.prank(user);
        registry.selectStrategy(intentId, stratId);

        (,,,, IntentRegistry.IntentStatus status, bytes32 selected) = registry.intents(intentId);
        assertEq(uint8(status), uint8(IntentRegistry.IntentStatus.Selected));
        assertEq(selected, stratId);
    }

    function test_select_strategy_reverts_wrong_user() public {
        _register(solver1, code1);
        _createIntent();
        bytes32 stratId = _submit(solver1, QUOTED_APY);

        vm.prank(solver2);
        vm.expectRevert(IntentRegistry.NotIntentUser.selector);
        registry.selectStrategy(intentId, stratId);
    }

    function test_select_strategy_reverts_if_expired() public {
        _register(solver1, code1);
        _createIntent();
        bytes32 stratId = _submit(solver1, QUOTED_APY);

        vm.warp(block.timestamp + 10 minutes);
        vm.prank(user);
        vm.expectRevert(IntentRegistry.StrategyExpired.selector);
        registry.selectStrategy(intentId, stratId);
    }

    // ── intent fulfillment ────────────────────────────────────────────────────

    function test_fulfill_intent_routes_fee_correctly() public {
        _register(solver1, code1);
        _createIntent();
        bytes32 stratId = _submit(solver1, QUOTED_APY);
        vm.prank(user);
        registry.selectStrategy(intentId, stratId);

        uint256 fee = 1 ether;
        uint256 solverBefore   = solver1.balance;
        uint256 treasuryBefore = treasury.balance;

        registry.fulfillIntent{value: fee}(intentId, code1);

        uint256 expectedSolver   = (fee * 7000) / 10_000;
        uint256 expectedTreasury = fee - expectedSolver;

        assertEq(solver1.balance,   solverBefore   + expectedSolver + BOND);
        assertEq(treasury.balance,  treasuryBefore + expectedTreasury);
    }

    function test_fulfill_intent_increments_fulfilled_count() public {
        _register(solver1, code1);
        _createIntent();
        _selectAndFulfill(_submit(solver1, QUOTED_APY), code1);

        (,,,,,, uint256 count,,, ) = registry.solvers(solver1);
        assertEq(count, 1);
    }

    function test_fulfill_intent_reverts_wrong_builder_code() public {
        _register(solver1, code1);
        _register(solver2, code2);
        _createIntent();
        bytes32 stratId = _submit(solver1, QUOTED_APY);
        vm.prank(user);
        registry.selectStrategy(intentId, stratId);

        vm.expectRevert("Builder code mismatch");
        registry.fulfillIntent{value: 0.1 ether}(intentId, code2);
    }

    function test_fulfill_intent_reverts_if_not_selected() public {
        _register(solver1, code1);
        _createIntent();
        vm.expectRevert(IntentRegistry.IntentNotSelected.selector);
        registry.fulfillIntent{value: 0.1 ether}(intentId, code1);
    }

    // ── bid bond refund ───────────────────────────────────────────────────────

    function test_refund_bid_bond_after_expiry() public {
        _register(solver1, code1);
        _createIntent();
        bytes32 stratId = _submit(solver1, QUOTED_APY);

        vm.warp(block.timestamp + 10 minutes);
        uint256 before = solver1.balance;
        vm.prank(solver1);
        registry.refundBidBond(stratId);
        assertEq(solver1.balance, before + BOND);
    }

    function test_refund_bid_bond_reverts_before_expiry() public {
        _register(solver1, code1);
        _createIntent();
        bytes32 stratId = _submit(solver1, QUOTED_APY);

        vm.prank(solver1);
        vm.expectRevert("Not yet expired");
        registry.refundBidBond(stratId);
    }

    // ── reputation / reportOutcome ────────────────────────────────────────────

    function test_report_outcome_updates_reputation() public {
        _register(solver1, code1);
        _createIntent();
        _selectAndFulfill(_submit(solver1, QUOTED_APY), code1);

        // actual = 1200 bps (96.7% of quoted 1240), in-range = 9000 bps (90%)
        registry.reportOutcome(intentId, 1200, 9000);

        (,uint256 reported, uint256 score, uint256 aprAcc, uint256 inRange,,) =
            registry.getReputation(solver1);

        assertEq(reported, 1);
        // aprAccuracy = min(1200*10000/1240, 10000) = min(9677, 10000) = 9677
        assertEq(aprAcc, 9677);
        // inRangeBps capped at 10000 = 9000
        assertEq(inRange, 9000);
        // outcomeScore = 9677 * 9000 / 10000 = 8709
        assertEq(score, 8709);
    }

    function test_report_outcome_running_average_two_reports() public {
        // First intent
        _register(solver1, code1);
        _createIntent();
        _selectAndFulfill(_submit(solver1, QUOTED_APY), code1);
        registry.reportOutcome(intentId, 1200, 9000);

        // Second intent
        bytes32 intentId2 = keccak256("intent-002");
        registry.createIntent(intentId2, user, address(0), 1000e6, 1);
        vm.prank(solver1);
        bytes32 strat2 = registry.submitStrategy{value: BOND}(
            intentId2, keccak256("plan2"), QUOTED_APY, block.timestamp + 5 minutes
        );
        vm.prank(user);
        registry.selectStrategy(intentId2, strat2);
        registry.fulfillIntent{value: 0.1 ether}(intentId2, code1);

        // perfect score second time: actual = quoted, fully in range
        registry.reportOutcome(intentId2, QUOTED_APY, 10000);

        (,uint256 reported, uint256 score,,,, ) = registry.getReputation(solver1);
        assertEq(reported, 2);
        // first score = 8709, second score = 10000 * 10000 / 10000 = 10000
        // avg = (8709 + 10000) / 2 = 9354
        assertEq(score, 9354);
    }

    function test_report_outcome_perfect_score() public {
        _register(solver1, code1);
        _createIntent();
        _selectAndFulfill(_submit(solver1, QUOTED_APY), code1);

        // actual equals quoted, fully in range
        registry.reportOutcome(intentId, QUOTED_APY, 10000);

        (,, uint256 score, uint256 aprAcc,,, ) = registry.getReputation(solver1);
        assertEq(aprAcc, 10000);
        assertEq(score, 10000);
    }

    function test_report_outcome_caps_accuracy_at_100pct() public {
        _register(solver1, code1);
        _createIntent();
        _selectAndFulfill(_submit(solver1, QUOTED_APY), code1);

        // actual exceeds quoted — should cap at 10000
        registry.reportOutcome(intentId, QUOTED_APY * 2, 10000);

        (,, uint256 score, uint256 aprAcc,,, ) = registry.getReputation(solver1);
        assertEq(aprAcc, 10000);
        assertEq(score, 10000);
    }

    function test_report_outcome_bad_solver_low_score() public {
        _register(solver1, code1);
        _createIntent();
        _selectAndFulfill(_submit(solver1, 4000), code1); // quoted 40% APY

        // delivered only 8% of what was promised, out of range half the time
        registry.reportOutcome(intentId, 320, 5000); // actual 3.2%, in-range 50%

        (,, uint256 score, uint256 aprAcc, uint256 inRange,, ) = registry.getReputation(solver1);
        // aprAccuracy = min(320*10000/4000, 10000) = 800
        assertEq(aprAcc, 800);
        // outcomeScore = 800 * 5000 / 10000 = 400
        assertEq(score, 400);
        assertEq(inRange, 5000);
    }

    function test_report_outcome_reverts_if_not_fulfilled() public {
        _register(solver1, code1);
        _createIntent();
        vm.expectRevert(IntentRegistry.IntentNotFulfilled.selector);
        registry.reportOutcome(intentId, 1200, 9000);
    }

    function test_report_outcome_reverts_double_report() public {
        _register(solver1, code1);
        _createIntent();
        _selectAndFulfill(_submit(solver1, QUOTED_APY), code1);
        registry.reportOutcome(intentId, 1200, 9000);

        vm.expectRevert(IntentRegistry.AlreadyReported.selector);
        registry.reportOutcome(intentId, 1200, 9000);
    }

    function test_report_outcome_reverts_for_non_oracle() public {
        _register(solver1, code1);
        _createIntent();
        _selectAndFulfill(_submit(solver1, QUOTED_APY), code1);

        vm.prank(solver2);
        vm.expectRevert(IntentRegistry.Unauthorized.selector);
        registry.reportOutcome(intentId, 1200, 9000);
    }

    function test_set_oracle_allows_new_reporter() public {
        _register(solver1, code1);
        _createIntent();
        _selectAndFulfill(_submit(solver1, QUOTED_APY), code1);

        // owner upgrades oracle to separate address
        registry.setOracle(oracle);

        vm.prank(oracle);
        registry.reportOutcome(intentId, 1200, 9000);

        (,uint256 reported,,,,, ) = registry.getReputation(solver1);
        assertEq(reported, 1);
    }

    // ── slashing ─────────────────────────────────────────────────────────────

    function test_slash_solver_transfers_stake_to_treasury() public {
        _register(solver1, code1);
        uint256 before = treasury.balance;
        registry.slashSolver(solver1, "bad calldata");
        assertEq(treasury.balance, before + STAKE);

        (,,,,, uint256 stake, , uint256 slashed, IntentRegistry.SolverStatus status,) = registry.solvers(solver1);
        assertEq(stake, 0);
        assertEq(slashed, STAKE);
        assertEq(uint8(status), uint8(IntentRegistry.SolverStatus.Slashed));
    }

    function test_slash_reverts_for_non_owner() public {
        _register(solver1, code1);
        vm.prank(solver2);
        vm.expectRevert(IntentRegistry.Unauthorized.selector);
        registry.slashSolver(solver1, "attack");
    }

    function test_slash_is_idempotent() public {
        _register(solver1, code1);
        registry.slashSolver(solver1, "first");
        registry.slashSolver(solver1, "second");
    }

    // ── two solvers competing ─────────────────────────────────────────────────

    function test_two_solvers_only_winner_gets_fee() public {
        _register(solver1, code1);
        _register(solver2, code2);
        _createIntent();

        _submit(solver1, 1200);
        bytes32 strat2 = _submit(solver2, 4000);

        vm.prank(user);
        registry.selectStrategy(intentId, strat2);

        uint256 fee = 0.1 ether;
        uint256 s2Before = solver2.balance;
        registry.fulfillIntent{value: fee}(intentId, code2);

        assertEq(solver2.balance, s2Before + (fee * 7000 / 10_000) + BOND);
    }
}
