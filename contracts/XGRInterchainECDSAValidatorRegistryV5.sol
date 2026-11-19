// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {XGRInterchainRegistryCore} from "./XGRInterchainRegistryCore.sol";
import {XGRInterchainECDSAVerifier} from "./XGRInterchainECDSAVerifier.sol";

/// @notice ECDSA adapter for the same per-destination lifecycle as BLS V3.
/// @dev Only signatures, possession proofs and their encodings differ. The
///      common core owns reserve economics, membership and immutable snapshots.
contract XGRInterchainECDSAValidatorRegistryV5 is XGRInterchainRegistryCore {
    uint8 private constant ECDSA_FORMAT = 3;
    uint256 public constant MAX_VALIDATORS = 64;
    bytes private constant BOOTSTRAP_DOMAIN = "XITA_ECDSA_BOOTSTRAP_V2";
    bytes private constant POSSESSION_DOMAIN = "XITA_ECDSA_POSSESSION_V2";
    bytes private constant MEMBERSHIP_DOMAIN = "XITA_ECDSA_MEMBERSHIP_V2";
    bytes private constant SET_DOMAIN = "XITA_ECDSA_CHAIN_SET_V1";

    struct MembershipTransition {
        uint64 expectedSetId;
        uint64 validUntil;
        uint8 action;
        address validator;
    }

    XGRInterchainECDSAVerifier private immutable engine;
    mapping(address => bool) public possessionVerified;
    event PossessionVerified(address indexed validator);

    constructor(
        uint64 originChainId_,
        uint32 destinationDomain_,
        address verifier_,
        uint256 minimumDeactivationReserveWei_,
        uint256 maxExecutorReimbursementWei_,
        address[] memory initialValidators_,
        bytes[] memory initialPossessionProofs_
    ) payable XGRInterchainRegistryCore(
        originChainId_, destinationDomain_,
        minimumDeactivationReserveWei_, maxExecutorReimbursementWei_
    ) {
        // Preserve the explicit V5 deployment constraints. They do not
        // silently become constraints on the already released BLS adapter.
        if (originChainId_ != 1643 || block.chainid != uint256(destinationDomain_) ||
            verifier_ == address(0) || verifier_.code.length == 0 ||
            initialValidators_.length < 3 || initialValidators_.length > MAX_VALIDATORS ||
            initialValidators_.length != initialPossessionProofs_.length)
            revert InvalidBootstrap();
        engine = XGRInterchainECDSAVerifier(verifier_);
        uint256 reserve = _bootstrapReserve(initialValidators_.length);
        for (uint256 i; i < initialValidators_.length; ++i) {
            address validator = initialValidators_[i];
            if (validator == address(0) || activeIndexPlusOne[validator] != 0 ||
                engine.recover(
                    keccak256(encodeBootstrapPayload(originChainId_, destinationDomain_, validator)),
                    initialPossessionProofs_[i]
                ) != validator) revert InvalidBootstrap();
            _bootstrapMember(validator, reserve);
        }
        _finishBootstrap();
    }

    function registryVersion() external pure returns (uint256) { return 5; }
    function verifier() external view override returns (address) { return address(engine); }
    function verifierKeyFormat() external pure override returns (uint8) { return ECDSA_FORMAT; }

    function encodeBootstrapPayload(uint64 origin, uint32 domain, address validator)
        public pure returns (bytes memory)
    {
        if (origin == 0 || domain == 0 || validator == address(0))
            revert InvalidBootstrap();
        return abi.encodePacked(
            BOOTSTRAP_DOMAIN, bytes8(origin), bytes4(domain), bytes20(validator)
        );
    }

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

    // Preserve the published V5 ABI's result/argument names. These wrappers
    // delegate completely to the same V3 lifecycle and snapshot read paths.
    function getValidator(address validator)
        public view override returns (bool active, bytes memory key, uint256 reserveWei)
    {
        return super.getValidator(validator);
    }

    function getValidatorSet()
        public view override returns (address[] memory validators, bytes[] memory keys, uint64 currentSetId)
    {
        return super.getValidatorSet();
    }

    function getValidatorSetForVerification()
        public view override returns (address[] memory validators, bytes[] memory keys, uint64 currentSetId)
    {
        return super.getValidatorSetForVerification();
    }

    function getValidatorSetForVerification(uint64 requestedSetId)
        public view override returns (address[] memory validators, bytes[] memory keys, uint64 resolvedSetId)
    {
        return super.getValidatorSetForVerification(requestedSetId);
    }

    function verifyQuorum(
        uint64 requestedSetId, bytes calldata payload, bytes calldata bitmap, bytes calldata signatures
    ) public view override returns (bool) {
        return super.verifyQuorum(requestedSetId, payload, bitmap, signatures);
    }

    function applyMembership(
        MembershipTransition calldata transition,
        bytes calldata signerBitmap,
        bytes calldata signatures
    ) external payable {
        // Include adapter argument construction in the same reimbursement
        // measurement boundary as the original public V3 entry point.
        uint256 gasStart = gasleft();
        _applyMembership(
            Transition(transition.expectedSetId, transition.validUntil, transition.action, transition.validator),
            bytes(""), signerBitmap, signatures, gasStart
        );
    }

    function _membershipPayload(Transition memory transition, bytes memory)
        internal view override returns (bytes memory)
    {
        return encodeMembershipPayload(MembershipTransition(
            transition.expectedSetId, transition.validUntil, transition.action, transition.validator
        ));
    }

    function _admitKey(address validator, bytes memory) internal view override {
        if (!possessionVerified[validator]) revert InvalidTransition();
    }

    function _removeKey(address, bytes memory) internal pure override {}

    function _maximumValidators() internal pure override returns (uint256) {
        return MAX_VALIDATORS;
    }

    function _publicKey(address validator) internal pure override returns (bytes memory) {
        return abi.encodePacked(validator);
    }

    function _snapshotKey(uint64, address) internal pure override {}

    /// @dev Existing read ABI carries the recovered signer address as a
    ///      20-byte verification key. Consumers check verifierKeyFormat()==3.
    function _snapshotKeys(uint64 id) internal view override returns (bytes[] memory keys) {
        address[] storage validators = historicalValidators[id];
        keys = new bytes[](validators.length);
        for (uint256 i; i < validators.length; ++i) keys[i] = abi.encodePacked(validators[i]);
    }

    function _commitmentSeed(uint256 count) internal pure override returns (bytes32) {
        return keccak256(abi.encodePacked(SET_DOMAIN, count));
    }

    function _appendCommitment(bytes32 commitment, address validator)
        internal pure override returns (bytes32)
    {
        return keccak256(abi.encodePacked(commitment, validator));
    }

    function _verifySnapshot(
        uint64 id, bytes memory payload, bytes calldata bitmap, bytes calldata signatures
    ) internal view override returns (bool) {
        return snapshotExists[id] && engine.verify(payload, historicalValidators[id], bitmap, signatures);
    }
}
