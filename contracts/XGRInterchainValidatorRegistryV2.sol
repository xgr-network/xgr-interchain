// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IXGRInterchainBLSVerifier} from "./IXGRInterchainBLSVerifier.sol";

/// @notice Destination-side trust anchor for XGR native interchain membership.
/// @dev No administrator can mutate membership after bootstrap. Every ADD/REMOVE
///      transition requires the current validator-set BLS quorum.
contract XGRInterchainValidatorRegistryV2 {
    uint8 private constant ACTION_ADD = 1;
    uint8 private constant ACTION_REMOVE = 2;

    bytes private constant DOMAIN_V2 = "XGR_INTERCHAIN_V2";
    bytes private constant BOOTSTRAP_DOMAIN_V1 = "XGR_INTERCHAIN_BOOTSTRAP_V1";
    uint256 private constant BLS_PUBLIC_KEY_LENGTH = 48;
    uint256 private constant BLS_PUBLIC_KEY_EIP2537_LENGTH = 128;
    uint8 public constant VERIFIER_FORMAT_COMPRESSED = 1;
    uint8 public constant VERIFIER_FORMAT_EIP2537 = 2;
    uint256 private constant EXECUTOR_GAS_OVERHEAD = 35_000;
    uint256 private constant MAX_MEMBERSHIP_VALIDITY = 10 minutes;

    struct Validator {
        bool active;
        bytes blsPublicKey;
        bytes blsPublicKeyEIP2537;
        uint256 deactivationReserveWei;
    }

    struct MembershipTransition {
        uint64 expectedSetId;
        uint64 validUntil;
        uint8 action;
        address validator;
        bytes blsPublicKey;
        bytes blsPublicKeyEIP2537;
    }

    struct VerificationSetSnapshot {
        address[] validators;
        bytes[] verificationKeys;
    }

    uint64 public immutable originChainId;
    uint32 public immutable destinationDomain;
    uint256 public immutable minimumDeactivationReserveWei;
    uint256 public immutable maxExecutorReimbursementWei;
    IXGRInterchainBLSVerifier public immutable verifier;
    uint8 public immutable verifierKeyFormat;

    uint64 public setId;

    mapping(address => Validator) private validatorInfo;
    address[] private activeValidators;
    mapping(address => uint256) private activeIndexPlusOne;
    mapping(bytes32 => address) private activeBLSKeyOwner;
    mapping(address => uint256) public claimableWei;
    mapping(uint64 => bytes32) public validatorSetCommitment;
    mapping(uint64 => VerificationSetSnapshot) private verificationSetSnapshots;
    mapping(uint64 => bool) private verificationSetSnapshotExists;

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
        address verifier_,
        uint8 verifierKeyFormat_,
        uint256 minimumDeactivationReserveWei_,
        uint256 maxExecutorReimbursementWei_,
        address[] memory initialValidators_,
        bytes[] memory initialBLSPublicKeys_,
        bytes[] memory initialBLSPublicKeysEIP2537_,
        bytes[] memory initialBLSPossessionProofs_
    ) payable {
        if (
            originChainId_ == 0 ||
            destinationDomain_ == 0 ||
            verifier_ == address(0) ||
            (verifierKeyFormat_ != VERIFIER_FORMAT_COMPRESSED &&
                verifierKeyFormat_ != VERIFIER_FORMAT_EIP2537) ||
            minimumDeactivationReserveWei_ == 0 ||
            maxExecutorReimbursementWei_ == 0 ||
            minimumDeactivationReserveWei_ < maxExecutorReimbursementWei_ ||
            initialValidators_.length == 0 ||
            initialValidators_.length != initialBLSPublicKeys_.length ||
            initialValidators_.length != initialBLSPublicKeysEIP2537_.length ||
            initialValidators_.length != initialBLSPossessionProofs_.length
        ) revert InvalidBootstrap();

        originChainId = originChainId_;
        destinationDomain = destinationDomain_;
        verifier = IXGRInterchainBLSVerifier(verifier_);
        verifierKeyFormat = verifierKeyFormat_;
        minimumDeactivationReserveWei = minimumDeactivationReserveWei_;
        maxExecutorReimbursementWei = maxExecutorReimbursementWei_;

        uint256 reservePerValidator = msg.value / initialValidators_.length;
        if (reservePerValidator < minimumDeactivationReserveWei_) revert InvalidBootstrap();
        if (reservePerValidator * initialValidators_.length != msg.value) revert InvalidBootstrap();

        for (uint256 i = 0; i < initialValidators_.length; i++) {
            _bootstrapValidator(
                originChainId_,
                destinationDomain_,
                initialValidators_[i],
                initialBLSPublicKeys_[i],
                initialBLSPublicKeysEIP2537_[i],
                initialBLSPossessionProofs_[i],
                reservePerValidator
            );
        }

        setId = 1;
        _commitValidatorSet();
    }

    function _bootstrapValidator(
        uint64 originChainId_,
        uint32 destinationDomain_,
        address validator,
        bytes memory blsKey,
        bytes memory blsKeyEIP2537,
        bytes memory possessionProof,
        uint256 reservePerValidator
    ) internal {
        bytes32 keyHash = keccak256(blsKey);
        if (
            validator == address(0) ||
            blsKey.length != BLS_PUBLIC_KEY_LENGTH ||
            blsKeyEIP2537.length != BLS_PUBLIC_KEY_EIP2537_LENGTH ||
            activeIndexPlusOne[validator] != 0 ||
            activeBLSKeyOwner[keyHash] != address(0) ||
            possessionProof.length == 0
        ) revert InvalidBootstrap();

        bytes[] memory bootstrapKeys = new bytes[](1);
        bootstrapKeys[0] = _verificationKey(blsKey, blsKeyEIP2537);
        if (
            !verifier.verify(
                encodeBootstrapPayload(originChainId_, destinationDomain_, validator, blsKey, blsKeyEIP2537),
                bootstrapKeys,
                hex"01",
                possessionProof
            )
        ) revert InvalidBootstrap();

        validatorInfo[validator] = Validator({
            active: true,
            blsPublicKey: blsKey,
            blsPublicKeyEIP2537: blsKeyEIP2537,
            deactivationReserveWei: reservePerValidator
        });
        activeValidators.push(validator);
        activeIndexPlusOne[validator] = activeValidators.length;
        activeBLSKeyOwner[keyHash] = validator;
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

    function getValidatorStatus(address validator) external view returns (bool active, uint64 currentSetId) {
        return (validatorInfo[validator].active, setId);
    }

    function getValidator(address validator)
        external
        view
        returns (bool active, bytes memory blsPublicKey, uint256 reserveWei)
    {
        Validator storage v = validatorInfo[validator];
        return (v.active, v.blsPublicKey, v.deactivationReserveWei);
    }

    /// @notice Cheap recipient view for source-chain ILN fee accounting.
    function getFeeRecipients() external view returns (address[] memory validators, uint64 currentSetId) {
        return (activeValidators, setId);
    }

    function getValidatorSet()
        external
        view
        returns (address[] memory validators, bytes[] memory blsPublicKeys, uint64 currentSetId)
    {
        validators = activeValidators;
        blsPublicKeys = new bytes[](validators.length);
        for (uint256 i = 0; i < validators.length; i++) {
            blsPublicKeys[i] = validatorInfo[validators[i]].blsPublicKey;
        }
        return (validators, blsPublicKeys, setId);
    }

    function getValidatorSetEIP2537()
        external
        view
        returns (address[] memory validators, bytes[] memory blsPublicKeysEIP2537, uint64 currentSetId)
    {
        validators = activeValidators;
        blsPublicKeysEIP2537 = new bytes[](validators.length);
        for (uint256 i = 0; i < validators.length; i++) {
            blsPublicKeysEIP2537[i] = validatorInfo[validators[i]].blsPublicKeyEIP2537;
        }
        return (validators, blsPublicKeysEIP2537, setId);
    }

    function getValidatorSetForVerification()
        external
        view
        returns (address[] memory validators, bytes[] memory verificationKeys, uint64 currentSetId)
    {
        return _getValidatorSetForVerification(setId);
    }

    function getValidatorSetForVerification(uint64 requestedSetId)
        external
        view
        returns (address[] memory validators, bytes[] memory verificationKeys, uint64 resolvedSetId)
    {
        return _getValidatorSetForVerification(requestedSetId);
    }

    function quorumThreshold() public view returns (uint256) {
        uint256 n = activeValidators.length;
        return (2 * n + 2) / 3;
    }

    /// @notice Verifies an arbitrary XGR Interchain security payload against
    ///         one historical destination-scoped validator set.
    /// @dev This keeps membership and quorum authority centralized in this
    ///      destination registry. Route/asset semantics remain outside it.
    function verifyQuorum(
        uint64 requestedSetId,
        bytes calldata payload,
        bytes calldata signerBitmap,
        bytes calldata aggregateSignature
    ) external view returns (bool) {
        (
            address[] memory validators,
            bytes[] memory keys,
            uint64 resolvedSetId
        ) = _getValidatorSetForVerification(requestedSetId);

        if (
            resolvedSetId != requestedSetId ||
            validators.length == 0 ||
            validators.length != keys.length
        ) return false;

        uint256 threshold = (2 * validators.length + 2) / 3;
        if (!_bitmapHasQuorum(signerBitmap, validators.length, threshold)) {
            return false;
        }

        return verifier.verify(
            payload,
            keys,
            signerBitmap,
            aggregateSignature
        );
    }

    /// @notice Executes a quorum-approved membership transition.
    /// @dev For ADD, msg.value becomes the validator's locked deactivation reserve.
    ///      For REMOVE, msg.value must be zero and the existing reserve finances the
    ///      successful executor; any remainder is returned to the validator.
    function applyMembership(
        MembershipTransition calldata transition,
        bytes calldata signerBitmap,
        bytes calldata aggregateSignature
    ) external payable {
        uint256 gasStart = gasleft();

        _verifyMembershipTransition(transition, signerBitmap, aggregateSignature);

        uint256 removedReserve;
        if (transition.action == ACTION_ADD) {
            _applyAdd(transition);
        } else if (transition.action == ACTION_REMOVE) {
            removedReserve = _applyRemove(transition);
        } else {
            revert InvalidTransition();
        }

        setId += 1;
        _commitValidatorSet();

        if (transition.action == ACTION_REMOVE) {
            _settleRemoval(transition.validator, removedReserve, gasStart);
        }
    }

    function _verifyMembershipTransition(
        MembershipTransition calldata transition,
        bytes calldata signerBitmap,
        bytes calldata aggregateSignature
    ) internal view {
        if (transition.expectedSetId != setId) revert StaleSetId(setId, transition.expectedSetId);
        if (
            transition.validUntil == 0 ||
            block.timestamp > transition.validUntil ||
            transition.validUntil > block.timestamp + MAX_MEMBERSHIP_VALIDITY
        ) revert InvalidTransition();
        if (
            transition.validator == address(0) ||
            transition.blsPublicKey.length != BLS_PUBLIC_KEY_LENGTH ||
            transition.blsPublicKeyEIP2537.length != BLS_PUBLIC_KEY_EIP2537_LENGTH
        ) revert InvalidTransition();

        bytes memory message = encodeMembershipPayload(
            originChainId,
            destinationDomain,
            transition.expectedSetId,
            transition.validUntil,
            transition.action,
            transition.validator,
            transition.blsPublicKey,
            transition.blsPublicKeyEIP2537
        );

        bytes[] memory currentKeys = new bytes[](activeValidators.length);
        for (uint256 i = 0; i < activeValidators.length; i++) {
            Validator storage v = validatorInfo[activeValidators[i]];
            currentKeys[i] = _verificationKey(v.blsPublicKey, v.blsPublicKeyEIP2537);
        }

        if (!_bitmapHasQuorum(signerBitmap, activeValidators.length, quorumThreshold())) {
            revert InsufficientQuorum();
        }
        if (!verifier.verify(message, currentKeys, signerBitmap, aggregateSignature)) {
            revert InsufficientQuorum();
        }
    }

    function encodeMembershipPayload(
        uint64 originChainId_,
        uint32 destinationDomain_,
        uint64 expectedSetId,
        uint64 validUntil,
        uint8 action,
        address validator,
        bytes memory validatorBLSPublicKey,
        bytes memory validatorBLSPublicKeyEIP2537
    ) public pure returns (bytes memory) {
        if (
            originChainId_ == 0 ||
            destinationDomain_ == 0 ||
            validUntil == 0 ||
            (action != ACTION_ADD && action != ACTION_REMOVE) ||
            validator == address(0) ||
            validatorBLSPublicKey.length != BLS_PUBLIC_KEY_LENGTH ||
            validatorBLSPublicKeyEIP2537.length != BLS_PUBLIC_KEY_EIP2537_LENGTH
        ) revert InvalidTransition();

        return abi.encodePacked(
            DOMAIN_V2,
            bytes8(originChainId_),
            bytes4(destinationDomain_),
            bytes8(expectedSetId),
            bytes8(validUntil),
            bytes1(action),
            bytes20(validator),
            bytes2(uint16(validatorBLSPublicKey.length)),
            validatorBLSPublicKey,
            bytes2(uint16(validatorBLSPublicKeyEIP2537.length)),
            validatorBLSPublicKeyEIP2537
        );
    }

    function encodeBootstrapPayload(
        uint64 originChainId_,
        uint32 destinationDomain_,
        address validator,
        bytes memory validatorBLSPublicKey,
        bytes memory validatorBLSPublicKeyEIP2537
    ) public pure returns (bytes memory) {
        if (
            originChainId_ == 0 ||
            destinationDomain_ == 0 ||
            validator == address(0) ||
            validatorBLSPublicKey.length != BLS_PUBLIC_KEY_LENGTH ||
            validatorBLSPublicKeyEIP2537.length != BLS_PUBLIC_KEY_EIP2537_LENGTH
        ) revert InvalidBootstrap();

        return abi.encodePacked(
            BOOTSTRAP_DOMAIN_V1,
            bytes8(originChainId_),
            bytes4(destinationDomain_),
            bytes20(validator),
            bytes2(uint16(validatorBLSPublicKey.length)),
            validatorBLSPublicKey,
            bytes2(uint16(validatorBLSPublicKeyEIP2537.length)),
            validatorBLSPublicKeyEIP2537
        );
    }

    function computeValidatorSetCommitment(
        address[] calldata validators,
        bytes[] calldata blsPublicKeys
    ) external pure returns (bytes32 commitment) {
        if (validators.length == 0 || validators.length != blsPublicKeys.length) {
            revert InvalidTransition();
        }
        commitment = keccak256(abi.encodePacked("XGR_INTERCHAIN_SET_V2", uint256(validators.length)));
        for (uint256 i = 0; i < validators.length; i++) {
            if (blsPublicKeys[i].length != BLS_PUBLIC_KEY_LENGTH) {
                revert InvalidTransition();
            }
            commitment = keccak256(
                abi.encodePacked(commitment, validators[i], keccak256(blsPublicKeys[i]))
            );
        }
    }

    function _commitValidatorSet() internal {
        if (verificationSetSnapshotExists[setId]) revert InvalidTransition();

        VerificationSetSnapshot storage snapshot = verificationSetSnapshots[setId];
        bytes32 commitment =
            keccak256(abi.encodePacked("XGR_INTERCHAIN_SET_V2", uint256(activeValidators.length)));

        for (uint256 i = 0; i < activeValidators.length; i++) {
            address validator = activeValidators[i];
            Validator storage v = validatorInfo[validator];

            snapshot.validators.push(validator);
            snapshot.verificationKeys.push(_verificationKey(v.blsPublicKey, v.blsPublicKeyEIP2537));

            commitment = keccak256(
                abi.encodePacked(
                    commitment,
                    validator,
                    keccak256(v.blsPublicKey)
                )
            );
        }

        verificationSetSnapshotExists[setId] = true;
        validatorSetCommitment[setId] = commitment;
        emit ValidatorSetCommitted(setId, commitment);
    }

    function _getValidatorSetForVerification(uint64 requestedSetId)
        internal
        view
        returns (address[] memory validators, bytes[] memory verificationKeys, uint64 resolvedSetId)
    {
        if (!verificationSetSnapshotExists[requestedSetId]) {
            return (new address[](0), new bytes[](0), 0);
        }

        VerificationSetSnapshot storage snapshot = verificationSetSnapshots[requestedSetId];
        uint256 length = snapshot.validators.length;

        validators = new address[](length);
        verificationKeys = new bytes[](length);
        for (uint256 i = 0; i < length; i++) {
            validators[i] = snapshot.validators[i];
            verificationKeys[i] = snapshot.verificationKeys[i];
        }

        return (validators, verificationKeys, requestedSetId);
    }

    function _verificationKey(bytes memory compressed, bytes memory eip2537)
        internal
        view
        returns (bytes memory)
    {
        if (verifierKeyFormat == VERIFIER_FORMAT_COMPRESSED) {
            return compressed;
        }
        return eip2537;
    }

    function _applyAdd(MembershipTransition calldata transition) internal {
        bytes32 keyHash = keccak256(transition.blsPublicKey);
        if (
            validatorInfo[transition.validator].active ||
            activeIndexPlusOne[transition.validator] != 0 ||
            activeBLSKeyOwner[keyHash] != address(0)
        ) revert InvalidTransition();
        if (msg.value < minimumDeactivationReserveWei) {
            revert InsufficientReserve(minimumDeactivationReserveWei, msg.value);
        }

        validatorInfo[transition.validator] = Validator({
            active: true,
            blsPublicKey: transition.blsPublicKey,
            blsPublicKeyEIP2537: transition.blsPublicKeyEIP2537,
            deactivationReserveWei: msg.value
        });
        activeValidators.push(transition.validator);
        activeIndexPlusOne[transition.validator] = activeValidators.length;
        activeBLSKeyOwner[keyHash] = transition.validator;

        emit ValidatorAdded(transition.validator, setId + 1, msg.value);
    }

    function _applyRemove(MembershipTransition calldata transition) internal returns (uint256 reserve) {
        if (msg.value != 0 || activeValidators.length <= 1) revert InvalidTransition();

        Validator storage v = validatorInfo[transition.validator];
        if (
            !v.active ||
            keccak256(v.blsPublicKey) != keccak256(transition.blsPublicKey) ||
            keccak256(v.blsPublicKeyEIP2537) != keccak256(transition.blsPublicKeyEIP2537)
        ) revert InvalidTransition();

        uint256 indexPlusOne = activeIndexPlusOne[transition.validator];
        if (indexPlusOne == 0) revert InvalidTransition();

        uint256 last = activeValidators.length;
        uint256 index = indexPlusOne - 1;
        if (index + 1 != last) {
            address moved = activeValidators[last - 1];
            activeValidators[index] = moved;
            activeIndexPlusOne[moved] = index + 1;
        }
        activeValidators.pop();
        delete activeIndexPlusOne[transition.validator];
        delete activeBLSKeyOwner[keccak256(transition.blsPublicKey)];

        reserve = v.deactivationReserveWei;
        v.active = false;
        v.deactivationReserveWei = 0;
    }

    function _settleRemoval(address validator, uint256 reserve, uint256 gasStart) internal {
        uint256 measuredGas = gasStart - gasleft() + EXECUTOR_GAS_OVERHEAD;
        uint256 reimbursement = measuredGas * tx.gasprice;
        if (reimbursement > maxExecutorReimbursementWei) {
            reimbursement = maxExecutorReimbursementWei;
        }
        if (reimbursement > reserve) {
            reimbursement = reserve;
        }
        uint256 remainder = reserve - reimbursement;

        // Membership removal must never depend on an external recipient accepting ETH.
        // Credit both parties and let them pull funds separately.
        if (reimbursement != 0) {
            claimableWei[msg.sender] += reimbursement;
        }
        if (remainder != 0) {
            claimableWei[validator] += remainder;
        }

        emit ValidatorRemoved(validator, setId, msg.sender, reimbursement);
    }

    function _bitmapHasQuorum(bytes calldata bitmap, uint256 validatorCount, uint256 threshold)
        internal
        pure
        returns (bool)
    {
        if (validatorCount == 0 || threshold == 0 || bitmap.length == 0) return false;
        uint256 maxBitmapLength = (validatorCount + 7) / 8;
        if (bitmap.length > maxBitmapLength || bitmap[0] == bytes1(0)) return false;

        uint256 count;
        for (uint256 i = 0; i < validatorCount; i++) {
            uint256 byteFromEnd = i >> 3;
            uint256 bitIndex = i & 7;
            if (
                byteFromEnd < bitmap.length &&
                (uint8(bitmap[bitmap.length - 1 - byteFromEnd]) & (uint8(1) << bitIndex)) != 0
            ) {
                count++;
            }
        }

        // Reject any set bit outside the current set.
        for (uint256 i = validatorCount; i < bitmap.length * 8; i++) {
            uint256 byteFromEnd = i >> 3;
            uint256 bitIndex = i & 7;
            if (
                byteFromEnd < bitmap.length &&
                (uint8(bitmap[bitmap.length - 1 - byteFromEnd]) & (uint8(1) << bitIndex)) != 0
            ) return false;
        }

        return count >= threshold;
    }
}