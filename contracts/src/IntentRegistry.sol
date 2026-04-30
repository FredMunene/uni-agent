// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice On-chain solver registration, bid bonds, fee settlement, and
///         reputation tracking for the Uni-Agent open intent execution protocol.
///         See docs/adr/001-solver-reputation-and-outcome-reporting.md
contract IntentRegistry {
    // ── constants ────────────────────────────────────────────────────────────

    uint256 public constant REGISTRATION_STAKE = 0.05 ether;
    uint256 public constant BID_BOND           = 0.001 ether;
    uint256 public constant WITHDRAWAL_DELAY   = 24 hours;
    uint256 public constant SOLVER_SHARE_BPS   = 7000;  // 70% of fee to solver
    uint256 public constant BPS_DENOM          = 10_000;

    // ── types ────────────────────────────────────────────────────────────────

    enum SolverStatus { Active, Slashed, Withdrawn }
    enum IntentStatus { Open, Selected, Fulfilled, Cancelled }

    struct Solver {
        address feeRecipient;
        string  name;
        string  ensName;       // e.g. "gemini-lp.solvers.uni-agent.eth"
        bytes4  builderCode;   // 4-byte attribution embedded in execution calldata
        string  endpoint;      // webhook URL for intent push notifications
        uint256 stake;
        uint256 fulfilledCount;
        uint256 slashedAmount;
        SolverStatus status;
        uint256 withdrawalRequestedAt;
    }

    /// @notice Reputation metrics, updated by reportOutcome after each fulfilled intent.
    struct Reputation {
        uint256 reportedCount;   // number of outcomes reported so far
        uint256 avgOutcomeScore; // 0–10000 bps running mean (APR accuracy × in-range)
        uint256 avgAprAccuracy;  // 0–10000 bps running mean
        uint256 avgInRangeBps;   // 0–10000 bps running mean
        uint256 lastReportedAt;  // timestamp of most recent outcome report
    }

    struct Strategy {
        address solver;
        bytes32 planHash;
        uint256 quotedApyBps;  // APY promised by solver at submission time
        uint256 validUntil;
        uint256 bidBond;
        bool    refunded;
    }

    struct Intent {
        address user;
        address asset;
        uint256 amount;
        uint8   risk;
        IntentStatus status;
        bytes32 selectedStrategyId;
    }

    // ── storage ──────────────────────────────────────────────────────────────

    address public immutable owner;
    address public treasury;
    address public oracle; // authorised to call reportOutcome

    mapping(address  => Solver)     public solvers;
    mapping(address  => Reputation) public reputation;
    mapping(bytes4   => address)    public builderCodeToSolver;
    mapping(bytes32  => Intent)     public intents;
    mapping(bytes32  => Strategy)   public strategies;
    mapping(bytes32  => bytes32[])  public intentStrategies;
    mapping(bytes32  => bool)       public outcomeReported; // intentId → reported

    // ── events ───────────────────────────────────────────────────────────────

    event SolverRegistered(address indexed solver, string name, string ensName, bytes4 builderCode);
    event SolverWithdrawalRequested(address indexed solver, uint256 availableAt);
    event SolverWithdrawn(address indexed solver, uint256 amount);
    event SolverSlashed(address indexed solver, uint256 amount, string reason);
    event OracleUpdated(address indexed oracle);

    event IntentCreated(bytes32 indexed intentId, address indexed user, address asset, uint256 amount);
    event StrategySubmitted(bytes32 indexed intentId, bytes32 indexed strategyId, address indexed solver);
    event StrategySelected(bytes32 indexed intentId, bytes32 indexed strategyId, address indexed solver);
    event IntentFulfilled(bytes32 indexed intentId, bytes32 indexed strategyId, address indexed solver, uint256 fee);
    event BidBondRefunded(bytes32 indexed strategyId, address indexed solver, uint256 amount);
    event OutcomeReported(bytes32 indexed intentId, address indexed solver, uint256 outcomeScore, uint256 aprAccuracy, uint256 inRangeBps);

    // ── errors ───────────────────────────────────────────────────────────────

    error Unauthorized();
    error WrongStake();
    error WrongBidBond();
    error AlreadyRegistered();
    error SolverNotActive();
    error BuilderCodeTaken();
    error WithdrawalNotRequested();
    error WithdrawalTooEarly();
    error IntentNotOpen();
    error IntentNotSelected();
    error IntentNotFulfilled();
    error StrategyExpired();
    error StrategyNotForIntent();
    error NotIntentUser();
    error TransferFailed();
    error AlreadyReported();
    error QuotedApyZero();

    // ── constructor ──────────────────────────────────────────────────────────

    constructor(address _treasury) {
        owner    = msg.sender;
        treasury = _treasury;
        oracle   = msg.sender; // owner acts as oracle until upgraded
    }

    // ── solver registration ──────────────────────────────────────────────────

    function registerSolver(
        address feeRecipient,
        string calldata name,
        string calldata ensName,
        bytes4 builderCode,
        string calldata endpoint
    ) external payable {
        if (msg.value != REGISTRATION_STAKE) revert WrongStake();
        if (solvers[msg.sender].stake != 0)  revert AlreadyRegistered();
        if (builderCodeToSolver[builderCode] != address(0)) revert BuilderCodeTaken();

        solvers[msg.sender] = Solver({
            feeRecipient:          feeRecipient,
            name:                  name,
            ensName:               ensName,
            builderCode:           builderCode,
            endpoint:              endpoint,
            stake:                 msg.value,
            fulfilledCount:        0,
            slashedAmount:         0,
            status:                SolverStatus.Active,
            withdrawalRequestedAt: 0
        });
        builderCodeToSolver[builderCode] = msg.sender;

        emit SolverRegistered(msg.sender, name, ensName, builderCode);
    }

    function requestWithdrawal() external {
        Solver storage s = solvers[msg.sender];
        if (s.stake == 0 || s.status != SolverStatus.Active) revert SolverNotActive();
        s.withdrawalRequestedAt = block.timestamp;
        s.status = SolverStatus.Withdrawn;
        emit SolverWithdrawalRequested(msg.sender, block.timestamp + WITHDRAWAL_DELAY);
    }

    function claimWithdrawal() external {
        Solver storage s = solvers[msg.sender];
        if (s.withdrawalRequestedAt == 0) revert WithdrawalNotRequested();
        if (block.timestamp < s.withdrawalRequestedAt + WITHDRAWAL_DELAY) revert WithdrawalTooEarly();

        uint256 amount = s.stake;
        s.stake = 0;
        _send(msg.sender, amount);
        emit SolverWithdrawn(msg.sender, amount);
    }

    // ── intent lifecycle ─────────────────────────────────────────────────────

    function createIntent(
        bytes32 intentId,
        address user,
        address asset,
        uint256 amount,
        uint8   risk
    ) external {
        intents[intentId] = Intent({
            user:               user,
            asset:              asset,
            amount:             amount,
            risk:               risk,
            status:             IntentStatus.Open,
            selectedStrategyId: bytes32(0)
        });
        emit IntentCreated(intentId, user, asset, amount);
    }

    /// @param quotedApyBps  APY the solver is promising (e.g. 1240 = 12.4%). Stored
    ///                      on-chain so reportOutcome can measure accuracy later.
    function submitStrategy(
        bytes32 intentId,
        bytes32 planHash,
        uint256 quotedApyBps,
        uint256 validUntil
    ) external payable returns (bytes32 strategyId) {
        if (msg.value != BID_BOND) revert WrongBidBond();
        if (quotedApyBps == 0) revert QuotedApyZero();
        Solver storage s = solvers[msg.sender];
        if (s.stake == 0 || s.status != SolverStatus.Active) revert SolverNotActive();
        if (intents[intentId].status != IntentStatus.Open) revert IntentNotOpen();

        strategyId = keccak256(abi.encode(intentId, msg.sender, planHash, block.timestamp));

        strategies[strategyId] = Strategy({
            solver:       msg.sender,
            planHash:     planHash,
            quotedApyBps: quotedApyBps,
            validUntil:   validUntil,
            bidBond:      msg.value,
            refunded:     false
        });
        intentStrategies[intentId].push(strategyId);

        emit StrategySubmitted(intentId, strategyId, msg.sender);
    }

    function selectStrategy(bytes32 intentId, bytes32 strategyId) external {
        Intent storage intent = intents[intentId];
        if (intent.user != msg.sender) revert NotIntentUser();
        if (intent.status != IntentStatus.Open) revert IntentNotOpen();

        Strategy storage strat = strategies[strategyId];
        if (strat.solver == address(0)) revert StrategyNotForIntent();
        if (block.timestamp > strat.validUntil) revert StrategyExpired();

        intent.status             = IntentStatus.Selected;
        intent.selectedStrategyId = strategyId;

        emit StrategySelected(intentId, strategyId, strat.solver);
    }

    /// @notice Called by protocol after on-chain execution is confirmed.
    ///         Routes fee via builder code: 70% solver, 30% treasury.
    function fulfillIntent(bytes32 intentId, bytes4 builderCode) external payable {
        Intent storage intent = intents[intentId];
        if (intent.status != IntentStatus.Selected) revert IntentNotSelected();

        bytes32 strategyId = intent.selectedStrategyId;
        Strategy storage strat = strategies[strategyId];

        address codeOwner = builderCodeToSolver[builderCode];
        require(codeOwner == strat.solver, "Builder code mismatch");

        intent.status = IntentStatus.Fulfilled;

        uint256 solverShare   = (msg.value * SOLVER_SHARE_BPS) / BPS_DENOM;
        uint256 treasuryShare = msg.value - solverShare;

        Solver storage s = solvers[strat.solver];
        s.fulfilledCount += 1;

        uint256 bondReturn = strat.bidBond;
        strat.bidBond  = 0;
        strat.refunded = true;

        _send(s.feeRecipient, solverShare + bondReturn);
        _send(treasury, treasuryShare);

        emit IntentFulfilled(intentId, strategyId, strat.solver, msg.value);
    }

    function refundBidBond(bytes32 strategyId) external {
        Strategy storage strat = strategies[strategyId];
        require(strat.solver == msg.sender, "Not your strategy");
        require(!strat.refunded, "Already refunded");
        require(block.timestamp > strat.validUntil, "Not yet expired");

        uint256 amount = strat.bidBond;
        strat.bidBond  = 0;
        strat.refunded = true;

        _send(msg.sender, amount);
        emit BidBondRefunded(strategyId, msg.sender, amount);
    }

    // ── reputation ───────────────────────────────────────────────────────────

    /// @notice Report the actual outcome of a fulfilled intent.
    ///         Only callable by owner or designated oracle.
    ///         See ADR-001 for scoring formula.
    ///
    /// @param intentId       The fulfilled intent to score.
    /// @param actualFeesBps  Actual APY earned (read from PositionManager after 7 days).
    /// @param inRangeBps     % of time position was in tick range (0–10000).
    function reportOutcome(
        bytes32 intentId,
        uint256 actualFeesBps,
        uint256 inRangeBps
    ) external {
        if (msg.sender != owner && msg.sender != oracle) revert Unauthorized();
        if (outcomeReported[intentId]) revert AlreadyReported();

        Intent storage intent = intents[intentId];
        if (intent.status != IntentStatus.Fulfilled) revert IntentNotFulfilled();

        Strategy storage strat = strategies[intent.selectedStrategyId];
        address solverAddr = strat.solver;

        // APR accuracy: how close was the quoted APY to actual? Capped at 100%.
        uint256 aprAccuracy = strat.quotedApyBps == 0
            ? 0
            : _min((actualFeesBps * BPS_DENOM) / strat.quotedApyBps, BPS_DENOM);

        // Combined score: must be good on both dimensions.
        uint256 outcomeScore = (aprAccuracy * _min(inRangeBps, BPS_DENOM)) / BPS_DENOM;

        // Update running averages on the solver's reputation record.
        Reputation storage rep = reputation[solverAddr];
        uint256 n = rep.reportedCount;

        rep.avgOutcomeScore = (rep.avgOutcomeScore * n + outcomeScore) / (n + 1);
        rep.avgAprAccuracy  = (rep.avgAprAccuracy  * n + aprAccuracy)  / (n + 1);
        rep.avgInRangeBps   = (rep.avgInRangeBps   * n + _min(inRangeBps, BPS_DENOM)) / (n + 1);
        rep.reportedCount   = n + 1;
        rep.lastReportedAt  = block.timestamp;

        outcomeReported[intentId] = true;

        emit OutcomeReported(intentId, solverAddr, outcomeScore, aprAccuracy, inRangeBps);
    }

    // ── admin ────────────────────────────────────────────────────────────────

    function slashSolver(address solver, string calldata reason) external {
        if (msg.sender != owner) revert Unauthorized();
        Solver storage s = solvers[solver];
        if (s.status == SolverStatus.Slashed) return;

        uint256 amount   = s.stake;
        s.stake          = 0;
        s.slashedAmount += amount;
        s.status         = SolverStatus.Slashed;

        _send(treasury, amount);
        emit SolverSlashed(solver, amount, reason);
    }

    /// @notice Upgrade the oracle address. In v1 this will be a ZK verifier contract.
    function setOracle(address _oracle) external {
        if (msg.sender != owner) revert Unauthorized();
        oracle = _oracle;
        emit OracleUpdated(_oracle);
    }

    function setTreasury(address _treasury) external {
        if (msg.sender != owner) revert Unauthorized();
        treasury = _treasury;
    }

    // ── views ────────────────────────────────────────────────────────────────

    function getIntentStrategies(bytes32 intentId) external view returns (bytes32[] memory) {
        return intentStrategies[intentId];
    }

    /// @notice Convenience view: all reputation fields for a solver in one call.
    function getReputation(address solver) external view returns (
        uint256 fulfilledCount,
        uint256 reportedCount,
        uint256 avgOutcomeScore,
        uint256 avgAprAccuracy,
        uint256 avgInRangeBps,
        uint256 slashedAmount,
        uint256 lastReportedAt
    ) {
        Solver storage s     = solvers[solver];
        Reputation storage r = reputation[solver];
        return (
            s.fulfilledCount,
            r.reportedCount,
            r.avgOutcomeScore,
            r.avgAprAccuracy,
            r.avgInRangeBps,
            s.slashedAmount,
            r.lastReportedAt
        );
    }

    // ── internal ─────────────────────────────────────────────────────────────

    function _send(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
