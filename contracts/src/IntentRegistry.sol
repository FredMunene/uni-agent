// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice On-chain solver registration, bid bonds, and fee settlement for the
///         Uni-Agent open intent execution protocol.
contract IntentRegistry {
    // ── constants ────────────────────────────────────────────────────────────

    uint256 public constant REGISTRATION_STAKE = 0.05 ether;
    uint256 public constant BID_BOND           = 0.001 ether;
    uint256 public constant WITHDRAWAL_DELAY   = 24 hours;
    uint256 public constant PROTOCOL_FEE_BPS   = 10;    // 0.1%
    uint256 public constant SOLVER_SHARE_BPS   = 7000;  // 70% of fee to solver
    uint256 public constant BPS_DENOM          = 10_000;

    // ── types ────────────────────────────────────────────────────────────────

    enum SolverStatus  { Active, Slashed, Withdrawn }
    enum IntentStatus  { Open, Selected, Fulfilled, Cancelled }

    struct Solver {
        address feeRecipient;
        string  name;
        string  ensName;        // e.g. "gemini-lp.solvers.uni-agent.eth"
        bytes4  builderCode;    // 4-byte attribution embedded in execution calldata
        string  endpoint;       // webhook URL for intent push notifications
        uint256 stake;
        uint256 fulfilledCount;
        uint256 slashedAmount;
        SolverStatus status;
        uint256 withdrawalRequestedAt; // non-zero once withdrawal initiated
    }

    struct Strategy {
        address solver;
        bytes32 planHash;
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

    mapping(address  => Solver)   public solvers;
    mapping(bytes4   => address)  public builderCodeToSolver; // code → solver address
    mapping(bytes32  => Intent)   public intents;
    mapping(bytes32  => Strategy) public strategies;          // strategyId → Strategy
    // intentId → list of strategyIds submitted
    mapping(bytes32  => bytes32[]) public intentStrategies;

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
    error StrategyExpired();
    error StrategyNotForIntent();
    error NotIntentUser();
    error TransferFailed();

    // ── constructor ──────────────────────────────────────────────────────────

    constructor(address _treasury) {
        owner    = msg.sender;
        treasury = _treasury;
    }

    // ── solver registration ──────────────────────────────────────────────────

    /// @notice Register as a solver. Requires exactly REGISTRATION_STAKE.
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
            feeRecipient:           feeRecipient,
            name:                   name,
            ensName:                ensName,
            builderCode:            builderCode,
            endpoint:               endpoint,
            stake:                  msg.value,
            fulfilledCount:         0,
            slashedAmount:          0,
            status:                 SolverStatus.Active,
            withdrawalRequestedAt:  0
        });
        builderCodeToSolver[builderCode] = msg.sender;

        emit SolverRegistered(msg.sender, name, ensName, builderCode);
    }

    /// @notice Initiate stake withdrawal — starts the 24-hour timelock.
    function requestWithdrawal() external {
        Solver storage s = solvers[msg.sender];
        if (s.stake == 0 || s.status != SolverStatus.Active) revert SolverNotActive();
        s.withdrawalRequestedAt = block.timestamp;
        s.status = SolverStatus.Withdrawn;
        emit SolverWithdrawalRequested(msg.sender, block.timestamp + WITHDRAWAL_DELAY);
    }

    /// @notice Claim stake after the 24-hour delay has passed.
    function claimWithdrawal() external {
        Solver storage s = solvers[msg.sender];
        if (s.withdrawalRequestedAt == 0)                          revert WithdrawalNotRequested();
        if (block.timestamp < s.withdrawalRequestedAt + WITHDRAWAL_DELAY) revert WithdrawalTooEarly();

        uint256 amount = s.stake;
        s.stake = 0;
        _send(msg.sender, amount);
        emit SolverWithdrawn(msg.sender, amount);
    }

    // ── intent lifecycle ─────────────────────────────────────────────────────

    /// @notice Called by the protocol when a user posts an intent.
    function createIntent(
        bytes32 intentId,
        address user,
        address asset,
        uint256 amount,
        uint8   risk
    ) external {
        // Any address can record an intent — protocol server calls this.
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

    /// @notice Submit a competing strategy for an intent. Requires BID_BOND.
    function submitStrategy(
        bytes32 intentId,
        bytes32 planHash,
        uint256 validUntil
    ) external payable returns (bytes32 strategyId) {
        if (msg.value != BID_BOND) revert WrongBidBond();
        Solver storage s = solvers[msg.sender];
        if (s.stake == 0 || s.status != SolverStatus.Active) revert SolverNotActive();
        if (intents[intentId].status != IntentStatus.Open) revert IntentNotOpen();

        strategyId = keccak256(abi.encode(intentId, msg.sender, planHash, block.timestamp));

        strategies[strategyId] = Strategy({
            solver:    msg.sender,
            planHash:  planHash,
            validUntil: validUntil,
            bidBond:   msg.value,
            refunded:  false
        });
        intentStrategies[intentId].push(strategyId);

        emit StrategySubmitted(intentId, strategyId, msg.sender);
    }

    /// @notice User selects a strategy — locks in the choice before execution.
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

    /// @notice Called after on-chain execution is confirmed.
    ///         Routes 0.1% fee: 70% to solver, 30% to treasury.
    ///         Bid bond of winning solver is returned.
    ///         builderCode must match the strategy's solver.
    function fulfillIntent(bytes32 intentId, bytes4 builderCode) external payable {
        Intent storage intent = intents[intentId];
        if (intent.status != IntentStatus.Selected) revert IntentNotSelected();

        bytes32 strategyId = intent.selectedStrategyId;
        Strategy storage strat = strategies[strategyId];

        // Verify builder code matches the solver who submitted the strategy
        address codeOwner = builderCodeToSolver[builderCode];
        require(codeOwner == strat.solver, "Builder code mismatch");

        intent.status = IntentStatus.Fulfilled;

        // Fee split from msg.value (0.1% of intent amount sent by protocol)
        uint256 total        = msg.value;
        uint256 solverShare  = (total * SOLVER_SHARE_BPS) / BPS_DENOM;
        uint256 treasuryShare = total - solverShare;

        Solver storage s = solvers[strat.solver];
        s.fulfilledCount += 1;

        // Return bid bond to winning solver and pay their fee share
        uint256 bondReturn = strat.bidBond;
        strat.bidBond  = 0;
        strat.refunded = true;

        _send(s.feeRecipient, solverShare + bondReturn);
        _send(treasury, treasuryShare);

        emit IntentFulfilled(intentId, strategyId, strat.solver, total);
    }

    /// @notice Refund bid bonds for strategies that were not selected (expired or outcompeted).
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

    function setTreasury(address _treasury) external {
        if (msg.sender != owner) revert Unauthorized();
        treasury = _treasury;
    }

    // ── views ────────────────────────────────────────────────────────────────

    function getIntentStrategies(bytes32 intentId) external view returns (bytes32[] memory) {
        return intentStrategies[intentId];
    }

    // ── internal ─────────────────────────────────────────────────────────────

    function _send(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
