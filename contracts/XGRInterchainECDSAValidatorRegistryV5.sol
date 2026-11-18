// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IXGRInterchainValidatorSetV2} from "./IXGRInterchainValidatorSetV2.sol";
import {XGRInterchainECDSAVerifier} from "./XGRInterchainECDSAVerifier.sol";

/// @notice XGR Interchain per-destination validator membership, using ECDSA
///         signatures instead of BLS aggregate signatures.
/// @dev Mirrors ValidatorRegistry V3 economics and per-validator lifecycle:
///      explicit funded genesis, possession proofs, quorum ADD/REMOVE,
///      top-ups, capped executor reimbursement, claimable refunds, and
///      immutable fee-recipient snapshots. NO origin-wide validator roster.
///      XGR PoS eligibility is checked by the quorum-signing node protocol;
///      this registry independently binds ONLY the opted-in destination set.
contract XGRInterchainECDSAValidatorRegistryV5 is IXGRInterchainValidatorSetV2 {
    uint8 private constant ACTION_ADD = 1;
    uint8 private constant ACTION_REMOVE = 2;
    uint8 private constant ECDSA_FORMAT = 3;
    uint256 public constant MAX_VALIDATORS = 64;
    uint256 private constant EXECUTOR_GAS_OVERHEAD = 35_000;
    uint256 private constant MAX_MEMBERSHIP_VALIDITY = 10 minutes;

    bytes private constant BOOTSTRAP_DOMAIN = "XITA_ECDSA_BOOTSTRAP_V2";
    bytes private constant POSSESSION_DOMAIN = "XITA_ECDSA_POSSESSION_V2";
    bytes private constant MEMBERSHIP_DOMAIN = "XITA_ECDSA_MEMBERSHIP_V2";
    bytes private constant SET_DOMAIN = "XITA_ECDSA_CHAIN_SET_V1";

    struct Validator {
        bool active;
        uint256 deactivationReserveWei;
    }

    struct MembershipTransition {
        uint64 expectedSetId;
        uint64 validUntil;
        uint8 action;
        address validator;
    }

    uint64 public immutable override originChainId;
    uint32 public immutable override destinationDomain;
    uint256 public immutable minimumDeactivationReserveWei;
    uint256 public immutable maxExecutorReimbursementWei;
    XGRInterchainECDSAVerifier private immutable engine;

    uint64 public override setId;
    mapping(address => Validator) private validatorInfo;
    address[] private activeValidators;
    mapping(address => uint256) private activeIndexPlusOne;
    mapping(address => bool) public possessionVerified;
    mapping(address => uint256) public claimableWei;
    mapping(uint64 => bytes32) public override validatorSetCommitment;
    mapping(uint64 => address[]) private historical;
    mapping(uint64 => bool) private snapshotExists;

    event PossessionVerified(address indexed validator);
    event ValidatorAdded(address indexed validator, uint64 indexed setId, uint256 reserveWei);
    event ValidatorRemoved(address indexed validator, uint64 indexed setId, address indexed executor, uint256 reimbursementWei);
    event ReserveIncreased(address indexed validator, uint256 amountWei, uint256 newReserveWei);
    event Claimed(address indexed account, uint256 amountWei);
    event ValidatorSetCommitted(uint64 indexed setId, bytes32 indexed commitment);

    error InvalidBootstrap();
    error InvalidTransition();
    error StaleSetId(uint64 expected, uint64 got);
    error InsufficientQuorum();
    error InsufficientReserve(uint256 required, uint256 supplied);
    error TransferFailed();
    error NothingToClaim();

    /// @dev All initial validator addresses are explicitly selected for
    ///      THIS destination and provide chain/domain-bound ECDSA PoP.
    ///      msg.value must fund the same reserve for every genesis member.
    constructor(
        uint64 originChainId_,
        uint32 destinationDomain_,
        address verifier_,
        uint256 minimumDeactivationReserveWei_,
        uint256 maxExecutorReimbursementWei_,
        address[] memory initialValidators_,
        bytes[] memory initialPossessionProofs_
    ) payable {
        if (
            originChainId_ != 1643 ||
            destinationDomain_ == 0 ||
            block.chainid != uint256(destinationDomain_) ||
            verifier_ == address(0) ||
            verifier_.code.length == 0 ||
            minimumDeactivationReserveWei_ == 0 ||
            maxExecutorReimbursementWei_ == 0 ||
            minimumDeactivationReserveWei_ < maxExecutorReimbursementWei_ ||
            initialValidators_.length < 3 ||
            initialValidators_.length > MAX_VALIDATORS ||
            initialValidators_.length != initialPossessionProofs_.length
        ) revert InvalidBootstrap();

        originChainId = originChainId_;
        destinationDomain = destinationDomain_;
        engine = XGRInterchainECDSAVerifier(verifier_);
        minimumDeactivationReserveWei = minimumDeactivationReserveWei_;
        maxExecutorReimbursementWei = maxExecutorReimbursementWei_;

        uint256 perValidator = msg.value / initialValidators_.length;
        if (perValidator < minimumDeactivationReserveWei_ ||
            perValidator * initialValidators_.length != msg.value)
            revert InvalidBootstrap();

        for (uint256 i; i < initialValidators_.length; ++i) {
            address validator = initialValidators_[i];
            if (validator == address(0) || activeIndexPlusOne[validator] != 0 ||
                engine.recover(
                    keccak256(encodeBootstrapPayload(
                        originChainId_, destinationDomain_, validator
                    )),
                    initialPossessionProofs_[i]
                ) != validator
            ) revert InvalidBootstrap();

            validatorInfo[validator] = Validator(true, perValidator);
            activeValidators.push(validator);
            activeIndexPlusOne[validator] = activeValidators.length;
        }

        setId = 1;
        _commitValidatorSet();
    }

    function registryVersion() external pure returns (uint256) { return 5; }
    function verifier() external view override returns (address) { return address(engine); }
    function verifierKeyFormat() external pure override returns (uint8) { return ECDSA_FORMAT; }

    /// @notice Bootstrap proof can be produced before the Registry address
    ///         exists. It is bound to the PoS origin, destination and identity.
    function encodeBootstrapPayload(uint64 origin, uint32 domain, address validator)
        public pure returns (bytes memory)
    {
        if (origin == 0 || domain == 0 || validator == address(0))
            revert InvalidBootstrap();
        return abi.encodePacked(
            BOOTSTRAP_DOMAIN, bytes8(origin), bytes4(domain), bytes20(validator)
        );
    }

    /// @notice Subsequent joins require destination-Registry-specific PoP,
    ///         independently of the currently elected signers' quorum.
    function encodePossessionPayload(address validator)
        public view returns (bytes memory)
    {
        if (validator == address(0)) revert InvalidTransition();
        return abi.encodePacked(
            POSSESSION_DOMAIN, bytes8(originChainId), bytes4(destinationDomain),
            address(this), bytes20(validator)
        );
    }

    function provePossession(address validator, bytes calldata signature) external {
        if (validator == address(0) ||
            engine.recover(keccak256(encodePossessionPayload(validator)), signature) != validator)
            revert InvalidTransition();
        possessionVerified[validator] = true;
        emit PossessionVerified(validator);
    }

    function encodeMembershipPayload(MembershipTransition memory transition)
        public view returns (bytes memory)
    {
        if (transition.expectedSetId == 0 || transition.validUntil == 0 ||
            (transition.action != ACTION_ADD && transition.action != ACTION_REMOVE) ||
            transition.validator == address(0))
            revert InvalidTransition();
        return abi.encodePacked(
            MEMBERSHIP_DOMAIN,
            bytes8(originChainId), bytes4(destinationDomain),
            address(this), bytes8(transition.expectedSetId),
            bytes8(transition.validUntil), bytes1(transition.action),
            bytes20(transition.validator)
        );
    }

    /// @notice Same chain-specific ADD/REMOVE semantics as BLS Registry V3.
    ///         ADD locks the caller-supplied native reserve for that validator.
    ///         REMOVE reimburses the executor and credits the remainder.
    function applyMembership(
        MembershipTransition calldata transition,
        bytes calldata signerBitmap,
        bytes calldata signatures
    ) external payable {
        uint256 gasStart = gasleft();
        if (transition.expectedSetId != setId)
            revert StaleSetId(setId, transition.expectedSetId);
        if (transition.validUntil == 0 ||
            block.timestamp > transition.validUntil ||
            transition.validUntil > block.timestamp + MAX_MEMBERSHIP_VALIDITY)
            revert InvalidTransition();
        if (!_verifyCurrent(encodeMembershipPayload(transition), signerBitmap, signatures))
            revert InsufficientQuorum();

        uint256 removedReserve;
        if (transition.action == ACTION_ADD) {
            _applyAdd(transition.validator);
        } else if (transition.action == ACTION_REMOVE) {
            removedReserve = _applyRemove(transition.validator);
        } else {
            revert InvalidTransition();
        }

        setId += 1;
        _commitValidatorSet();
        if (transition.action == ACTION_REMOVE)
            _settleRemoval(transition.validator, removedReserve, gasStart);
    }

    function _applyAdd(address validator) private {
        if (validator == address(0) ||
            !possessionVerified[validator] ||
            validatorInfo[validator].active ||
            activeIndexPlusOne[validator] != 0 ||
            activeValidators.length >= MAX_VALIDATORS)
            revert InvalidTransition();
        if (msg.value < minimumDeactivationReserveWei)
            revert InsufficientReserve(minimumDeactivationReserveWei, msg.value);
        validatorInfo[validator] = Validator(true, msg.value);
        activeValidators.push(validator);
        activeIndexPlusOne[validator] = activeValidators.length;
        emit ValidatorAdded(validator, setId + 1, msg.value);
    }

    function _applyRemove(address validator) private returns (uint256 reserve) {
        if (msg.value != 0 || activeValidators.length <= 1)
            revert InvalidTransition();
        uint256 indexPlusOne = activeIndexPlusOne[validator];
        if (indexPlusOne == 0 || !validatorInfo[validator].active)
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
        reserve = validatorInfo[validator].deactivationReserveWei;
        validatorInfo[validator] = Validator(false, 0);
    }

    function _settleRemoval(address validator, uint256 reserve, uint256 gasStart) private {
        uint256 measuredGas = gasStart - gasleft() + EXECUTOR_GAS_OVERHEAD;
        uint256 reimbursement = measuredGas * tx.gasprice;
        if (reimbursement > maxExecutorReimbursementWei)
            reimbursement = maxExecutorReimbursementWei;
        if (reimbursement > reserve) reimbursement = reserve;
        claimableWei[msg.sender] += reimbursement;
        claimableWei[validator] += reserve - reimbursement;
        emit ValidatorRemoved(validator, setId, msg.sender, reimbursement);
    }

    receive() external payable {
        Validator storage v = validatorInfo[msg.sender];
        if (!v.active) revert InvalidTransition();
        v.deactivationReserveWei += msg.value;
        emit ReserveIncreased(msg.sender, msg.value, v.deactivationReserveWei);
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
        return (validatorInfo[validator].active, setId);
    }

    function getValidator(address validator)
        external view returns (bool active, bytes memory key, uint256 reserveWei)
    {
        Validator storage v = validatorInfo[validator];
        return (v.active, abi.encodePacked(validator), v.deactivationReserveWei);
    }

    function quorumThreshold() public view override returns (uint256) {
        return (2 * activeValidators.length + 2) / 3;
    }

    function _verifyCurrent(
        bytes memory payload, bytes calldata bitmap, bytes calldata signatures
    ) private view returns (bool) {
        return setId != 0 && engine.verify(payload, activeValidators, bitmap, signatures);
    }

    function verifyQuorum(
        uint64 requestedSetId, bytes calldata payload,
        bytes calldata bitmap, bytes calldata signatures
    ) external view override returns (bool) {
        if (!snapshotExists[requestedSetId]) return false;
        return engine.verify(payload, historical[requestedSetId], bitmap, signatures);
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
        address[] storage members = historical[requestedSetId];
        count = members.length;
        for (uint256 i; i < count; ++i)
            if (members[i] == validator) return (i + 1, count);
    }

    function getValidatorSet()
        external view override
        returns (address[] memory validators, bytes[] memory keys, uint64 currentSetId)
    {
        return _encodedSet(setId);
    }

    function getValidatorSetForVerification()
        external view override
        returns (address[] memory validators, bytes[] memory keys, uint64 currentSetId)
    {
        return _encodedSet(setId);
    }

    function getValidatorSetForVerification(uint64 requestedSetId)
        external view override
        returns (address[] memory validators, bytes[] memory keys, uint64 resolvedSetId)
    {
        return _encodedSet(requestedSetId);
    }

    /// @dev The legacy ABI calls the second result "blsPublicKeys"; for ECDSA
    ///      it deliberately carries 20-byte secp256k1 signer addresses.
    ///      Consumers MUST branch on verifierKeyFormat() and reject mismatches.
    function _encodedSet(uint64 requestedSetId)
        private view
        returns (address[] memory validators, bytes[] memory keys, uint64 resolvedSetId)
    {
        if (!snapshotExists[requestedSetId])
            return (new address[](0), new bytes[](0), 0);
        validators = historical[requestedSetId];
        keys = new bytes[](validators.length);
        for (uint256 i; i < validators.length; ++i)
            keys[i] = abi.encodePacked(validators[i]);
        return (validators, keys, requestedSetId);
    }

    function _commitValidatorSet() private {
        if (snapshotExists[setId]) revert InvalidTransition();
        snapshotExists[setId] = true;
        address[] storage snapshot = historical[setId];
        bytes32 commitment = keccak256(
            abi.encodePacked(SET_DOMAIN, uint256(activeValidators.length))
        );
        for (uint256 i; i < activeValidators.length; ++i) {
            snapshot.push(activeValidators[i]);
            commitment = keccak256(abi.encodePacked(commitment, activeValidators[i]));
        }
        validatorSetCommitment[setId] = commitment;
        emit ValidatorSetCommitted(setId, commitment);
    }
}
