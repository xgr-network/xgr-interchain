// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IXGRInterchainValidatorSetV2} from "./IXGRInterchainValidatorSetV2.sol";

/// @notice The destination's single membership and quorum authority.
/// @dev Preserves the V3 separation: this registry owns ordered, immutable
///      validator-set snapshots; consumers own route and message semantics.
///      Signature adapters supply only key/proof handling and wire encodings.
abstract contract XGRInterchainRegistryCore is IXGRInterchainValidatorSetV2 {
    uint8 internal constant ACTION_ADD = 1;
    uint8 internal constant ACTION_REMOVE = 2;
    uint256 private constant EXECUTOR_GAS_OVERHEAD = 35_000;
    uint256 private constant MAX_MEMBERSHIP_VALIDITY = 10 minutes;

    struct Member {
        bool active;
        uint256 deactivationReserveWei;
    }

    struct Transition {
        uint64 expectedSetId;
        uint64 validUntil;
        uint8 action;
        address validator;
    }

    uint64 public immutable override originChainId;
    uint32 public immutable override destinationDomain;
    uint256 public immutable minimumDeactivationReserveWei;
    uint256 public immutable maxExecutorReimbursementWei;
    uint64 public override setId;

    mapping(address => Member) internal members;
    address[] internal activeValidators;
    mapping(address => uint256) internal activeIndexPlusOne;
    mapping(address => uint256) public claimableWei;
    mapping(uint64 => bytes32) public override validatorSetCommitment;
    mapping(uint64 => address[]) internal historicalValidators;
    mapping(uint64 => bool) internal snapshotExists;

    error InvalidBootstrap();
    error InvalidTransition();
    error StaleSetId(uint64 expected, uint64 got);
    error InsufficientQuorum();
    error InsufficientReserve(uint256 required, uint256 supplied);
    error TransferFailed();
    error NothingToClaim();

    event ValidatorAdded(address indexed validator, uint64 indexed setId, uint256 reserveWei);
    event ValidatorRemoved(address indexed validator, uint64 indexed setId, address indexed executor, uint256 reimbursementWei);
    event ReserveIncreased(address indexed validator, uint256 amountWei, uint256 newReserveWei);
    event Claimed(address indexed account, uint256 amountWei);
    event ValidatorSetCommitted(uint64 indexed setId, bytes32 indexed commitment);

    constructor(
        uint64 originChainId_,
        uint32 destinationDomain_,
        uint256 minimumDeactivationReserveWei_,
        uint256 maxExecutorReimbursementWei_
    ) {
        if (originChainId_ == 0 || destinationDomain_ == 0 ||
            minimumDeactivationReserveWei_ == 0 || maxExecutorReimbursementWei_ == 0 ||
            minimumDeactivationReserveWei_ < maxExecutorReimbursementWei_)
            revert InvalidBootstrap();
        originChainId = originChainId_;
        destinationDomain = destinationDomain_;
        minimumDeactivationReserveWei = minimumDeactivationReserveWei_;
        maxExecutorReimbursementWei = maxExecutorReimbursementWei_;
    }

    function _bootstrapReserve(uint256 count) internal view returns (uint256 reserve) {
        if (count == 0) revert InvalidBootstrap();
        reserve = msg.value / count;
        if (reserve < minimumDeactivationReserveWei || reserve * count != msg.value)
            revert InvalidBootstrap();
    }

    /// @dev Called only after the concrete adapter has checked the explicit
    ///      genesis member's key and possession proof. No origin roster import.
    function _bootstrapMember(address validator, uint256 reserve) internal {
        if (validator == address(0) || activeIndexPlusOne[validator] != 0)
            revert InvalidBootstrap();
        members[validator] = Member(true, reserve);
        activeValidators.push(validator);
        activeIndexPlusOne[validator] = activeValidators.length;
    }

    function _finishBootstrap() internal {
        if (setId != 0 || activeValidators.length == 0) revert InvalidBootstrap();
        setId = 1;
        _commitValidatorSet();
    }

    /// @dev Both adapters enter exactly this state machine. Key material is
    ///      opaque here; no scheme can bypass epochs, funding or settlement.
    function _applyMembership(
        Transition memory transition,
        bytes memory keyMaterial,
        bytes calldata signerBitmap,
        bytes calldata proof,
        uint256 gasStart
    ) internal {
        if (transition.expectedSetId != setId)
            revert StaleSetId(setId, transition.expectedSetId);
        if (transition.validUntil == 0 || block.timestamp > transition.validUntil ||
            transition.validUntil > block.timestamp + MAX_MEMBERSHIP_VALIDITY)
            revert InvalidTransition();

        bytes memory payload = _membershipPayload(transition, keyMaterial);
        if (!_verifySnapshot(setId, payload, signerBitmap, proof))
            revert InsufficientQuorum();

        uint256 removedReserve;
        if (transition.action == ACTION_ADD) {
            _admitKey(transition.validator, keyMaterial);
            _addMember(transition.validator);
        } else if (transition.action == ACTION_REMOVE) {
            _removeKey(transition.validator, keyMaterial);
            removedReserve = _removeMember(transition.validator);
        } else {
            revert InvalidTransition();
        }

        setId += 1;
        _commitValidatorSet();
        if (transition.action == ACTION_REMOVE)
            _settleRemoval(transition.validator, removedReserve, gasStart);
    }

    function _addMember(address validator) private {
        if (validator == address(0) || members[validator].active ||
            activeIndexPlusOne[validator] != 0 || activeValidators.length >= _maximumValidators())
            revert InvalidTransition();
        if (msg.value < minimumDeactivationReserveWei)
            revert InsufficientReserve(minimumDeactivationReserveWei, msg.value);
        members[validator] = Member(true, msg.value);
        activeValidators.push(validator);
        activeIndexPlusOne[validator] = activeValidators.length;
        emit ValidatorAdded(validator, setId + 1, msg.value);
    }

    function _removeMember(address validator) private returns (uint256 reserve) {
        if (msg.value != 0 || activeValidators.length <= 1)
            revert InvalidTransition();
        uint256 indexPlusOne = activeIndexPlusOne[validator];
        if (indexPlusOne == 0 || !members[validator].active)
            revert InvalidTransition();
        uint256 last = activeValidators.length;
        uint256 index = indexPlusOne - 1;
        if (index + 1 != last) {
            address moved = activeValidators[last - 1];
            activeValidators[index] = moved;
            activeIndexPlusOne[moved] = index + 1;
        }
        activeValidators.pop();
        delete activeIndexPlusOne[validator];
        reserve = members[validator].deactivationReserveWei;
        members[validator] = Member(false, 0);
    }

    function _settleRemoval(address validator, uint256 reserve, uint256 gasStart) private {
        uint256 measuredGas = gasStart - gasleft() + EXECUTOR_GAS_OVERHEAD;
        uint256 reimbursement = measuredGas * tx.gasprice;
        if (reimbursement > maxExecutorReimbursementWei) reimbursement = maxExecutorReimbursementWei;
        if (reimbursement > reserve) reimbursement = reserve;
        // Removal never calls an executor or validator. Both pull their credit.
        if (reimbursement != 0) claimableWei[msg.sender] += reimbursement;
        if (reserve != reimbursement) claimableWei[validator] += reserve - reimbursement;
        emit ValidatorRemoved(validator, setId, msg.sender, reimbursement);
    }

    receive() external payable {
        Member storage member = members[msg.sender];
        if (!member.active) revert InvalidTransition();
        member.deactivationReserveWei += msg.value;
        emit ReserveIncreased(msg.sender, msg.value, member.deactivationReserveWei);
    }

    function claim() external {
        uint256 amount = claimableWei[msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimableWei[msg.sender] = 0;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) {
            claimableWei[msg.sender] = amount;
            revert TransferFailed();
        }
        emit Claimed(msg.sender, amount);
    }

    function getValidatorStatus(address validator)
        external view override returns (bool active, uint64 currentSetId)
    {
        return (members[validator].active, setId);
    }

    function getValidator(address validator)
        public view virtual returns (bool active, bytes memory blsPublicKey, uint256 reserveWei)
    {
        Member storage member = members[validator];
        return (member.active, _publicKey(validator), member.deactivationReserveWei);
    }

    function getFeeRecipients()
        external view override returns (address[] memory validators, uint64 currentSetId)
    {
        return (activeValidators, setId);
    }

    function getFeeRecipientCountAndSetId()
        external view override returns (uint256 count, uint64 currentSetId)
    {
        return (activeValidators.length, setId);
    }

    function getFeeRecipientIndexForSet(uint64 requestedSetId, address validator)
        external view override returns (uint256 indexPlusOne, uint256 count)
    {
        address[] storage validators = historicalValidators[requestedSetId];
        count = validators.length;
        for (uint256 i; i < count; ++i)
            if (validators[i] == validator) return (i + 1, count);
    }

    function getValidatorSet()
        public view virtual override
        returns (address[] memory validators, bytes[] memory blsPublicKeys, uint64 currentSetId)
    {
        validators = activeValidators;
        blsPublicKeys = new bytes[](validators.length);
        for (uint256 i; i < validators.length; ++i) blsPublicKeys[i] = _publicKey(validators[i]);
        return (validators, blsPublicKeys, setId);
    }

    function getValidatorSetForVerification()
        public view virtual override
        returns (address[] memory validators, bytes[] memory verificationKeys, uint64 currentSetId)
    {
        return _getValidatorSetForVerification(setId);
    }

    function getValidatorSetForVerification(uint64 requestedSetId)
        public view virtual override
        returns (address[] memory validators, bytes[] memory verificationKeys, uint64 resolvedSetId)
    {
        return _getValidatorSetForVerification(requestedSetId);
    }

    function _getValidatorSetForVerification(uint64 requestedSetId)
        internal view
        returns (address[] memory validators, bytes[] memory verificationKeys, uint64 resolvedSetId)
    {
        if (!snapshotExists[requestedSetId]) return (new address[](0), new bytes[](0), 0);
        return (historicalValidators[requestedSetId], _snapshotKeys(requestedSetId), requestedSetId);
    }

    function quorumThreshold() public view override returns (uint256) {
        return (2 * activeValidators.length + 2) / 3;
    }

    /// @notice Historical authority is available to consumers that explicitly
    ///         permit it. Direct delivery separately requires the current set.
    function verifyQuorum(
        uint64 requestedSetId, bytes calldata payload,
        bytes calldata signerBitmap, bytes calldata aggregateSignature
    ) public view virtual override returns (bool) {
        if (!snapshotExists[requestedSetId]) return false;
        return _verifySnapshot(requestedSetId, payload, signerBitmap, aggregateSignature);
    }

    function _commitValidatorSet() private {
        if (snapshotExists[setId]) revert InvalidTransition();
        address[] storage snapshot = historicalValidators[setId];
        bytes32 commitment = _commitmentSeed(activeValidators.length);
        for (uint256 i; i < activeValidators.length; ++i) {
            address validator = activeValidators[i];
            snapshot.push(validator);
            _snapshotKey(setId, validator);
            commitment = _appendCommitment(commitment, validator);
        }
        snapshotExists[setId] = true;
        validatorSetCommitment[setId] = commitment;
        emit ValidatorSetCommitted(setId, commitment);
    }

    function _maximumValidators() internal pure virtual returns (uint256);
    function _publicKey(address validator) internal view virtual returns (bytes memory);
    function _snapshotKeys(uint64 id) internal view virtual returns (bytes[] memory);
    function _snapshotKey(uint64 id, address validator) internal virtual;
    function _commitmentSeed(uint256 count) internal pure virtual returns (bytes32);
    function _appendCommitment(bytes32 commitment, address validator) internal view virtual returns (bytes32);
    function _membershipPayload(Transition memory transition, bytes memory keyMaterial)
        internal view virtual returns (bytes memory);
    function _admitKey(address validator, bytes memory keyMaterial) internal virtual;
    function _removeKey(address validator, bytes memory keyMaterial) internal virtual;
    function _verifySnapshot(uint64 id, bytes memory payload, bytes calldata bitmap, bytes calldata proof)
        internal view virtual returns (bool);
}
