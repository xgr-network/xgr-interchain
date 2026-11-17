// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IXGRInterchainValidatorSetV2} from "./IXGRInterchainValidatorSetV2.sol";
import {XGRInterchainECDSAVerifier} from "./XGRInterchainECDSAVerifier.sol";

/// @notice Destination-scoped secp256k1 quorum for the existing XGR validators.
/// @dev The XGR source set is an independently receipt-pinned *bootstrap input*,
///      not an on-chain proof of XGR consensus. No trusted operator can replace
///      the set. Later updates require the previous ECDSA validator quorum.
///      Until full source-side witnesses are implemented, do NOT activate XDC.
contract XGRInterchainECDSAValidatorRegistry is IXGRInterchainValidatorSetV2 {
    uint8 public constant ECDSA_FORMAT = 3;
    uint256 public constant MAX_VALIDATORS = 64;
    bytes private constant BOOTSTRAP = "XITA_ECDSA_BOOTSTRAP_V1";
    bytes private constant MEMBERSHIP = "XITA_ECDSA_MEMBERSHIP_V1";
    bytes private constant POSSESSION = "XITA_ECDSA_POSSESSION_V1";
    XGRInterchainECDSAVerifier private immutable engine;

    uint64 public immutable override originChainId;
    uint32 public immutable override destinationDomain;
    bytes32 public immutable genesisXGRSetCommitment;
    uint64 public immutable genesisXGRSetId;

    uint64 public override setId;
    mapping(uint64 => bytes32) public override validatorSetCommitment;
    mapping(uint64 => bool) private snapshotExists;
    mapping(uint64 => address[]) private historical;
    mapping(address => bool) private member;
    address[] private current;
    mapping(bytes32 => bool) public possessionVerified;

    event Activated(uint64 indexed setId, bytes32 indexed xgrCommitment);
    event XGRSetUpdated(uint64 indexed previousSetId, uint64 indexed newSetId, bytes32 indexed xgrCommitment);
    event PossessionVerified(address indexed validator, uint64 indexed nextSetId, bytes32 indexed commitment);

    error InvalidConfiguration();
    error InvalidBootstrap();
    error InvalidMembership();
    error InsufficientQuorum();

    constructor(
        uint64 originChainId_,
        uint32 destinationDomain_,
        address verifier_,
        uint64 genesisSetId_,
        bytes32 genesisCommitment_
    ) {
        if (block.chainid != destinationDomain_ ||
            originChainId_ != 1643 || destinationDomain_ != 50 ||
            verifier_ == address(0) || verifier_.code.length == 0 ||
            genesisSetId_ == 0 || genesisCommitment_ == bytes32(0))
            revert InvalidConfiguration();
        originChainId = originChainId_;
        destinationDomain = destinationDomain_;
        engine = XGRInterchainECDSAVerifier(verifier_);
        genesisXGRSetId = genesisSetId_;
        genesisXGRSetCommitment = genesisCommitment_;
    }

    function verifier() external view override returns (address) { return address(engine); }
    function verifierKeyFormat() external pure override returns (uint8) { return ECDSA_FORMAT; }
    function registryVersion() external pure returns (uint256) { return 4; }

    /// @notice Deterministic commitment identical to XGR BLS V3 registry.
    /// @dev Input validator order MUST match source XGR registry order.
    function computeXGRCommitment(address[] memory validators, bytes[] memory blsPublicKeys)
        public pure returns (bytes32 result)
    {
        uint256 n = validators.length;
        if (n == 0 || n > MAX_VALIDATORS || n != blsPublicKeys.length)
            revert InvalidMembership();
        result = keccak256(abi.encodePacked("XGR_INTERCHAIN_SET_V2", uint256(n)));
        for (uint256 i; i < n; ++i) {
            if (validators[i] == address(0) || blsPublicKeys[i].length != 48)
                revert InvalidMembership();
            for (uint256 j; j < i; ++j)
                if (validators[i] == validators[j]) revert InvalidMembership();
            result = keccak256(
                abi.encodePacked(result, validators[i], keccak256(blsPublicKeys[i]))
            );
        }
    }

    function bootstrapPayload() public view returns (bytes memory) {
        return abi.encodePacked(
            BOOTSTRAP, uint64(originChainId), uint32(destinationDomain),
            address(this), genesisXGRSetId, genesisXGRSetCommitment
        );
    }

    /// @notice Requires quorum of the exact externally verified genesis XGR set.
    /// @dev A valid self-signature alone does NOT establish a real XGR set:
    ///      independently verify genesis root/setId against the XGR mainnet
    ///      before any operator is permitted to submit this transaction.
    function activateBootstrap(
        address[] calldata validators,
        bytes[] calldata blsPublicKeys,
        bytes calldata signerBitmap,
        bytes calldata signatures
    ) external {
        if (setId != 0 ||
            computeXGRCommitment(validators, blsPublicKeys) != genesisXGRSetCommitment ||
            !engine.verify(bootstrapPayload(), validators, signerBitmap, signatures))
            revert InvalidBootstrap();
        _commit(genesisXGRSetId, validators, genesisXGRSetCommitment);
        emit Activated(setId, genesisXGRSetCommitment);
    }

    function possessionPayload(uint64 nextSetId, bytes32 nextCommitment, address validator)
        public view returns (bytes memory)
    {
        return abi.encodePacked(
            POSSESSION, uint64(originChainId), uint32(destinationDomain),
            address(this), nextSetId, nextCommitment, validator
        );
    }

    /// @notice A new validator's consent is mandatory in addition to OLD-set quorum.
    function provePossession(
        uint64 nextSetId, bytes32 nextCommitment, bytes calldata signature
    ) external {
        if (setId == 0 || nextSetId <= setId || nextCommitment == bytes32(0) ||
            engine.recover(
                keccak256(possessionPayload(nextSetId, nextCommitment, msg.sender)),
                signature
            ) != msg.sender)
            revert InvalidMembership();
        bytes32 proofKey = keccak256(abi.encode(nextSetId, nextCommitment, msg.sender));
        possessionVerified[proofKey] = true;
        emit PossessionVerified(msg.sender, nextSetId, nextCommitment);
    }

    function membershipPayload(uint64 nextSetId, bytes32 nextCommitment)
        public view returns (bytes memory)
    {
        return abi.encodePacked(
            MEMBERSHIP, uint64(originChainId), uint32(destinationDomain),
            address(this), setId, validatorSetCommitment[setId], nextSetId, nextCommitment
        );
    }

    /// @notice Advance an XGR-derived set; no admin or unilateral membership.
    /// @dev Existing validators must approve the exact NEXT XGR root and ID.
    ///      Delivery uses only current set; old snapshots remain for fee claims.
    function applyXGRValidatorSet(
        uint64 nextSetId,
        address[] calldata nextValidators,
        bytes[] calldata nextBLSPublicKeys,
        bytes calldata signerBitmap,
        bytes calldata signatures
    ) external {
        if (setId == 0 || nextSetId <= setId || snapshotExists[nextSetId])
            revert InvalidMembership();
        bytes32 nextCommitment = computeXGRCommitment(nextValidators, nextBLSPublicKeys);
        if (!_verifyCurrent(
                membershipPayload(nextSetId, nextCommitment),
                signerBitmap, signatures
            )) revert InsufficientQuorum();
        for (uint256 i; i < nextValidators.length; ++i)
            if (!member[nextValidators[i]] &&
                !possessionVerified[keccak256(abi.encode(nextSetId, nextCommitment, nextValidators[i]))])
                revert InvalidMembership();

        uint64 previous = setId;
        for (uint256 i; i < current.length; ++i) member[current[i]] = false;
        _commit(nextSetId, nextValidators, nextCommitment);
        emit XGRSetUpdated(previous, nextSetId, nextCommitment);
    }

    function _commit(uint64 newId, address[] calldata validators, bytes32 commitment) internal {
        if (snapshotExists[newId]) revert InvalidMembership();
        snapshotExists[newId] = true;
        setId = newId;
        validatorSetCommitment[newId] = commitment;
        delete current;
        for (uint256 i; i < validators.length; ++i) {
            current.push(validators[i]);
            historical[newId].push(validators[i]);
            member[validators[i]] = true;
        }
    }

    function _verifyCurrent(
        bytes memory payload, bytes calldata signerBitmap, bytes calldata signatures
    ) internal view returns (bool) {
        if (setId == 0) return false;
        return engine.verify(payload, current, signerBitmap, signatures);
    }

    function verifyQuorum(
        uint64 requestedSetId, bytes calldata payload,
        bytes calldata signerBitmap, bytes calldata signatures
    ) external view override returns (bool) {
        if (!snapshotExists[requestedSetId]) return false;
        // Caller must independently require current set where applicable.
        return engine.verify(payload, historical[requestedSetId], signerBitmap, signatures);
    }

    function quorumThreshold() external view override returns (uint256) {
        return (2 * current.length + 2) / 3;
    }

    function getValidatorStatus(address validator)
        external view override returns (bool active, uint64 currentSetId)
    {
        return (member[validator], setId);
    }

    function getFeeRecipients()
        external view override returns (address[] memory validators, uint64 currentSetId)
    {
        return (current, setId);
    }

    function getFeeRecipientCountAndSetId()
        external view override returns (uint256 count, uint64 currentSetId)
    {
        return (current.length, setId);
    }

    function getFeeRecipientIndexForSet(uint64 requestedSetId, address validator)
        external view override returns (uint256 indexPlusOne, uint256 count)
    {
        address[] storage members = historical[requestedSetId];
        count = members.length;
        for (uint256 i; i < count; ++i)
            if (members[i] == validator) return (i + 1, count);
    }

    /// @dev ABI compatibility; key bytes here hold 20-byte ECDSA addresses,
    ///      NOT BLS public keys. Select by verifierKeyFormat, never infer.
    function getValidatorSet()
        external view override returns (address[] memory validators, bytes[] memory keys, uint64 currentSetId)
    {
        return _encodedSet(setId);
    }

    function getValidatorSetForVerification()
        external view override returns (address[] memory validators, bytes[] memory keys, uint64 currentSetId)
    {
        return _encodedSet(setId);
    }

    function getValidatorSetForVerification(uint64 requestedSetId)
        external view override returns (address[] memory validators, bytes[] memory keys, uint64 resolvedSetId)
    {
        return _encodedSet(requestedSetId);
    }

    function _encodedSet(uint64 requestedSetId)
        internal view returns (address[] memory validators, bytes[] memory keys, uint64 resolvedSetId)
    {
        if (!snapshotExists[requestedSetId])
            return (new address[](0), new bytes[](0), 0);
        validators = historical[requestedSetId];
        keys = new bytes[](validators.length);
        for (uint256 i; i < validators.length; ++i)
            keys[i] = abi.encodePacked(validators[i]);
        return (validators, keys, requestedSetId);
    }
}
