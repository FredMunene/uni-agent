// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice On-chain solver registration, bid bonds, fee settlement, and
///         reputation tracking for the Uni-Agent open intent execution protocol.
///         See docs/adr/001-solver-reputation-and-outcome-reporting.md
contract IntentRegistry {
    // ── constants ────────────────────────────────────────────────────────────

    uint256 public constant WITHDRAWAL_DELAY = 24 hours;
    uint256 public constant SOLVER_SHARE_BPS = 7000;  // 70% of fee to solver
    uint256 public constant BPS_DENOM        = 10_000;

    // ── configurable params (owner can update) ────────────────────────────────
    // Defaults are intentionally low for testnet. Set higher on mainnet via setters.

    uint256 public registrationStake = 0.001 ether;  // mainnet target: 0.05 ETH
    uint256 public bidBond           = 0.0001 ether; // mainnet target: 0.001 ETH

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

    struct Reputation {
        uint256 reportedCount;
        uint256 avgOutcomeScore; // 0–10000 bps running mean (APR accuracy × in-range)
        uint256 avgAprAccuracy;  // 0–10000 bps running mean
        uint256 avgInRangeBps;   // 0–10000 bps running mean
        uint256 lastReportedAt;
    }

    struct Strategy {
        address solver;
        bytes32 planHash;
        uint256 quotedApyBps;
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
    address public oracle;
    bool    public paused;

    uint256 public treasuryBalance; // accrued fees — pull via withdrawTreasury()

    mapping(address  => Solver)     public solvers;
    mapping(address  => Reputation) public reputation;
    mapping(bytes4   => address)    public builderCodeToSolver;
    mapping(bytes32  => Intent)     public intents;
    mapping(bytes32  => Strategy)   public strategies;
    mapping(bytes32  => bytes32[])  public intentStrategies;
    mapping(bytes32  => bool)       public outcomeReported;

    // ── events ───────────────────────────────────────────────────────────────

    event SolverRegistered(address indexed solver, string name, string ensName, bytes4 builderCode);
    event SolverWithdrawalRequested(address indexed solver, uint256 availableAt);
    event SolverWithdrawn(address indexed solver, uint256 amount);
    event SolverSlashed(address indexed solver, uint256 amount, string reason);

    event IntentCreated(bytes32 indexed intentId, address indexed user, address asset, uint256 amount);
    event StrategySubmitted(bytes32 indexed intentId, bytes32 indexed strategyId, address indexed solver);
    event StrategySelected(bytes32 indexed intentId, bytes32 indexed strategyId, address indexed solver);
    event IntentFulfilled(bytes32 indexed intentId, bytes32 indexed strategyId, address indexed solver, uint256 fee);
    event BidBondRefunded(bytes32 indexed strategyId, address indexed solver, uint256 amount);
    event OutcomeReported(bytes32 indexed intentId, address indexed solver, uint256 outcomeScore, uint256 aprAccuracy, uint256 inRangeBps);

    event RegistrationStakeUpdated(uint256 oldStake, uint256 newStake);
    event BidBondUpdated(uint256 oldBond, uint256 newBond);
    event TreasuryWithdrawn(address indexed to, uint256 amount);
    event OracleUpdated(address indexed oracle);
    event TreasuryUpdated(address indexed treasury);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    // ── errors ───────────────────────────────────────────────────────────────

    error Unauthorized();
    error ContractPaused();
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
    error NothingToWithdraw();

    // ── modifiers ────────────────────────────────────────────────────────────

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    // ── constructor ──────────────────────────────────────────────────────────

    constructor(address _treasury) {
        owner    = msg.sender;
        treasury = _treasury;
        oracle   = msg.sender;
    }

    // ── solver registration ──────────────────────────────────────────────────

    function registerSolver(
        address feeRecipient,
        string calldata name,
        string calldata ensName,
        bytes4 builderCode,
        string calldata endpoint
    ) external payable whenNotPaused {
        if (msg.value != registrationStake) revert WrongStake();
        if (solvers[msg.sender].stake != 0) revert AlreadyRegistered();
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
    ) external whenNotPaused {
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

    function submitStrategy(
        bytes32 intentId,
        bytes32 planHash,
        uint256 quotedApyBps,
        uint256 validUntil
    ) external payable whenNotPaused returns (bytes32 strategyId) {
        if (msg.value != bidBond) revert WrongBidBond();
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

    function selectStrategy(bytes32 intentId, bytes32 strategyId) external whenNotPaused {
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

    function fulfillIntent(bytes32 intentId, bytes4 builderCode) external payable whenNotPaused {
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

        // Solver: immediate push (they earned it)
        _send(s.feeRecipient, solverShare + bondReturn);

        // Treasury: pull pattern — accumulate, owner withdraws when ready
        treasuryBalance += treasuryShare;

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

        uint256 aprAccuracy = strat.quotedApyBps == 0
            ? 0
            : _min((actualFeesBps * BPS_DENOM) / strat.quotedApyBps, BPS_DENOM);

        uint256 outcomeScore = (aprAccuracy * _min(inRangeBps, BPS_DENOM)) / BPS_DENOM;

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

    /// @notice Update registration stake. Affects future registrations only.
    function setRegistrationStake(uint256 newStake) external onlyOwner {
        emit RegistrationStakeUpdated(registrationStake, newStake);
        registrationStake = newStake;
    }

    /// @notice Update bid bond. Affects future strategy submissions only.
    function setBidBond(uint256 newBond) external onlyOwner {
        emit BidBondUpdated(bidBond, newBond);
        bidBond = newBond;
    }

    /// @notice Withdraw accumulated treasury fees to the treasury address.
    function withdrawTreasury() external {
        if (msg.sender != owner && msg.sender != treasury) revert Unauthorized();
        uint256 amount = treasuryBalance;
        if (amount == 0) revert NothingToWithdraw();
        treasuryBalance = 0;
        _send(treasury, amount);
        emit TreasuryWithdrawn(treasury, amount);
    }

    function slashSolver(address solver, string calldata reason) external onlyOwner {
        Solver storage s = solvers[solver];
        if (s.status == SolverStatus.Slashed) return;

        uint256 amount   = s.stake;
        s.stake          = 0;
        s.slashedAmount += amount;
        s.status         = SolverStatus.Slashed;

        // Slashed stake goes to treasury balance (pull pattern)
        treasuryBalance += amount;
        emit SolverSlashed(solver, amount, reason);
    }

    function setOracle(address _oracle) external onlyOwner {
        oracle = _oracle;
        emit OracleUpdated(_oracle);
    }

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    // ── views ─────────────────────────────────────────────────────────────────

    /// @notice Everything an agent needs to know before registering.
    function getProtocolParams() external view returns (
        uint256 currentRegistrationStake,
        uint256 currentBidBond,
        uint256 withdrawalDelay,
        uint256 solverShareBps,
        uint256 treasuryShareBps,
        bool    isPaused
    ) {
        return (
            registrationStake,
            bidBond,
            WITHDRAWAL_DELAY,
            SOLVER_SHARE_BPS,
            BPS_DENOM - SOLVER_SHARE_BPS,
            paused
        );
    }

    function getIntentStrategies(bytes32 intentId) external view returns (bytes32[] memory) {
        return intentStrategies[intentId];
    }

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
