// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IXGRInterchainBLSVerifier} from "./IXGRInterchainBLSVerifier.sol";
import {XGRInterchainRegistryCore} from "./XGRInterchainRegistryCore.sol";

/// @notice BLS adapter for the common destination membership authority.
/// @dev V3 ABI, signing domains, key formats and bitmap representation are
///      unchanged. Lifecycle, reserves and historical membership live in core.
contract XGRInterchainValidatorRegistryV3 is XGRInterchainRegistryCore {
    bytes private constant DOMAIN_V2 = "XGR_INTERCHAIN_V2";
    bytes private constant BOOTSTRAP_DOMAIN_V1 = "XGR_INTERCHAIN_BOOTSTRAP_V1";
    uint256 private constant BLS_PUBLIC_KEY_LENGTH = 48;
    uint256 private constant BLS_PUBLIC_KEY_EIP2537_LENGTH = 128;
    uint8 public constant VERIFIER_FORMAT_COMPRESSED = 1;
    uint8 public constant VERIFIER_FORMAT_EIP2537 = 2;
    bytes private constant HALF_BLS_FIELD =
        hex"0d0088f51cbff34d258dd3db21a5d66bb23ba5c279c2895fb39869507b587b120f55ffff58a9ffffdcff7fffffffd555";

    struct ValidatorKeys {
        bytes blsPublicKey;
        bytes blsPublicKeyEIP2537;
    }

    struct MembershipTransition {
        uint64 expectedSetId;
        uint64 validUntil;
        uint8 action;
        address validator;
        bytes blsPublicKey;
        bytes blsPublicKeyEIP2537;
    }

    IXGRInterchainBLSVerifier private immutable engine;
    uint8 public immutable override verifierKeyFormat;
    mapping(address => ValidatorKeys) private validatorKeys;
    mapping(bytes32 => address) private activeBLSKeyOwner;
    mapping(uint64 => bytes[]) private historicalKeys;
    mapping(bytes32 => bool) public possessionVerified;

    event PossessionVerified(address indexed validator, bytes32 indexed keyHash);

    function registryVersion() external pure returns (uint256) { return 3; }
    function verifier() external view override returns (address) { return address(engine); }

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
    ) payable XGRInterchainRegistryCore(
        originChainId_, destinationDomain_,
        minimumDeactivationReserveWei_, maxExecutorReimbursementWei_
    ) {
        if (verifier_ == address(0) ||
            (verifierKeyFormat_ != VERIFIER_FORMAT_COMPRESSED &&
                verifierKeyFormat_ != VERIFIER_FORMAT_EIP2537) ||
            initialValidators_.length != initialBLSPublicKeys_.length ||
            initialValidators_.length != initialBLSPublicKeysEIP2537_.length ||
            initialValidators_.length != initialBLSPossessionProofs_.length)
            revert InvalidBootstrap();
        engine = IXGRInterchainBLSVerifier(verifier_);
        verifierKeyFormat = verifierKeyFormat_;
        uint256 reserve = _bootstrapReserve(initialValidators_.length);
        for (uint256 i; i < initialValidators_.length; ++i) {
            _bootstrapValidator(
                originChainId_, destinationDomain_, initialValidators_[i],
                initialBLSPublicKeys_[i], initialBLSPublicKeysEIP2537_[i],
                initialBLSPossessionProofs_[i], reserve
            );
        }
        _finishBootstrap();
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
            (verifierKeyFormat == VERIFIER_FORMAT_EIP2537 && !_matchesCompressedKey(blsKey, blsKeyEIP2537)) ||
            possessionProof.length == 0
        ) revert InvalidBootstrap();

        bytes[] memory bootstrapKeys = new bytes[](1);
        bootstrapKeys[0] = _verificationKey(blsKey, blsKeyEIP2537);
        if (
            !engine.verify(
                encodeBootstrapPayload(originChainId_, destinationDomain_, validator, blsKey, blsKeyEIP2537),
                bootstrapKeys,
                hex"01",
                possessionProof
            )
        ) revert InvalidBootstrap();

        validatorKeys[validator] = ValidatorKeys(blsKey, blsKeyEIP2537);
        _bootstrapMember(validator, reservePerValidator);
        activeBLSKeyOwner[keyHash] = validator;
    }

    function provePossession(
        address validator,
        bytes calldata blsKey,
        bytes calldata blsKeyEIP2537,
        bytes calldata possessionProof
    ) external {
        if (validator == address(0) || blsKey.length != BLS_PUBLIC_KEY_LENGTH ||
            blsKeyEIP2537.length != BLS_PUBLIC_KEY_EIP2537_LENGTH ||
            possessionProof.length == 0 ||
            (verifierKeyFormat == VERIFIER_FORMAT_EIP2537 && !_matchesCompressedKey(blsKey, blsKeyEIP2537)))
            revert InvalidTransition();

        bytes[] memory keys = new bytes[](1);
        keys[0] = _verificationKey(blsKey, blsKeyEIP2537);
        if (!engine.verify(
            encodeBootstrapPayload(originChainId,destinationDomain,validator,
                blsKey,blsKeyEIP2537),
            keys, hex"01", possessionProof
        )) revert InvalidTransition();
        bytes32 keyHash = keccak256(abi.encode(validator,blsKey,blsKeyEIP2537));
        possessionVerified[keyHash] = true;
        emit PossessionVerified(validator,keyHash);
    }

    function getValidatorSetEIP2537()
        external
        view
        returns (address[] memory validators, bytes[] memory blsPublicKeysEIP2537, uint64 currentSetId)
    {
        validators = activeValidators;
        blsPublicKeysEIP2537 = new bytes[](validators.length);
        for (uint256 i = 0; i < validators.length; i++) {
            blsPublicKeysEIP2537[i] = validatorKeys[validators[i]].blsPublicKeyEIP2537;
        }
        return (validators, blsPublicKeysEIP2537, setId);
    }

    /// @dev PRE-S03 decision (2026-10-24): accepted residual cross-registry replay risk.
    ///      This membership payload intentionally does NOT bind address(this).
    ///      With matching chain/domain, setId and signer set, the same valid 2/3
    ///      quorum signature may be usable at two separate Registry deployments.
    ///      This is an acknowledged risk, not a cryptographic replay fix.
    ///      XITA's operating invariant is exactly ONE ACTIVE ValidatorRegistry
    ///      per chain. ISM and admin deployment receipts must reference that
    ///      selected Registry; old deployments must never be configured as
    ///      simultaneously active. Revisit if this invariant changes.
    ///      No impact on permissionless route/token admission.
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

    function _matchesCompressedKey(bytes memory compressed, bytes memory uncompressed)
        private pure returns (bool)
    {
        if (compressed.length != 48 || uncompressed.length != 128) return false;
        // BLS compressed flag on, infinity flag off; sign flag is checked below.
        if ((uint8(compressed[0]) & 0xC0) != 0x80) return false;
        for (uint256 i; i < 16; ++i) {
            if (uncompressed[i] != 0 || uncompressed[64 + i] != 0) return false;
        }
        if ((uint8(compressed[0]) & 0x1F) != uint8(uncompressed[16])) return false;
        for (uint256 i = 1; i < 48; ++i) {
            if (compressed[i] != uncompressed[16 + i]) return false;
        }
        // The BLS G1 compressed sign is the lexicographic sign of Y.
        // Compare the 381-bit coordinate with (p-1)/2 without big integer math.
        bool yIsLexicographicallyLargest;
        for (uint256 i; i < 48; ++i) {
            uint8 actual = uint8(uncompressed[80 + i]);
            uint8 half = uint8(HALF_BLS_FIELD[i]);
            if (actual > half) {
                yIsLexicographicallyLargest = true;
                break;
            }
            if (actual < half) break;
        }
        return ((uint8(compressed[0]) & 0x20) != 0) == yIsLexicographicallyLargest;
    }

    function applyMembership(
        MembershipTransition calldata transition,
        bytes calldata signerBitmap,
        bytes calldata aggregateSignature
    ) external payable {
        // Include adapter argument construction in the same reimbursement
        // measurement boundary as the original public V3 entry point.
        uint256 gasStart = gasleft();
        _applyMembership(
            Transition(transition.expectedSetId, transition.validUntil, transition.action, transition.validator),
            abi.encode(transition.blsPublicKey, transition.blsPublicKeyEIP2537),
            signerBitmap, aggregateSignature, gasStart
        );
    }

    function _membershipPayload(Transition memory transition, bytes memory keyMaterial)
        internal view override returns (bytes memory)
    {
        (bytes memory compressed, bytes memory eip2537) = abi.decode(keyMaterial, (bytes, bytes));
        return encodeMembershipPayload(
            originChainId, destinationDomain, transition.expectedSetId,
            transition.validUntil, transition.action, transition.validator, compressed, eip2537
        );
    }

    function _admitKey(address validator, bytes memory keyMaterial) internal override {
        (bytes memory compressed, bytes memory eip2537) = abi.decode(keyMaterial, (bytes, bytes));
        bytes32 keyHash = keccak256(compressed);
        if (!possessionVerified[keccak256(abi.encode(validator, compressed, eip2537))] ||
            (verifierKeyFormat == VERIFIER_FORMAT_EIP2537 && !_matchesCompressedKey(compressed, eip2537)) ||
            activeBLSKeyOwner[keyHash] != address(0))
            revert InvalidTransition();
        validatorKeys[validator] = ValidatorKeys(compressed, eip2537);
        activeBLSKeyOwner[keyHash] = validator;
    }

    function _removeKey(address validator, bytes memory keyMaterial) internal override {
        (bytes memory compressed, bytes memory eip2537) = abi.decode(keyMaterial, (bytes, bytes));
        ValidatorKeys storage keys = validatorKeys[validator];
        if (keccak256(keys.blsPublicKey) != keccak256(compressed) ||
            keccak256(keys.blsPublicKeyEIP2537) != keccak256(eip2537))
            revert InvalidTransition();
        delete activeBLSKeyOwner[keccak256(compressed)];
        // Retain the last public key for the existing V3 getValidator ABI.
    }

    function _maximumValidators() internal pure override returns (uint256) {
        return type(uint256).max;
    }

    function _publicKey(address validator) internal view override returns (bytes memory) {
        return validatorKeys[validator].blsPublicKey;
    }

    function _snapshotKey(uint64 id, address validator) internal override {
        ValidatorKeys storage keys = validatorKeys[validator];
        historicalKeys[id].push(_verificationKey(keys.blsPublicKey, keys.blsPublicKeyEIP2537));
    }

    function _snapshotKeys(uint64 id) internal view override returns (bytes[] memory) {
        return historicalKeys[id];
    }

    function _commitmentSeed(uint256 count) internal pure override returns (bytes32) {
        return keccak256(abi.encodePacked("XGR_INTERCHAIN_SET_V2", count));
    }

    function _appendCommitment(bytes32 commitment, address validator)
        internal view override returns (bytes32)
    {
        return keccak256(abi.encodePacked(commitment, validator, keccak256(validatorKeys[validator].blsPublicKey)));
    }

    function _verifySnapshot(
        uint64 id, bytes memory payload, bytes calldata bitmap, bytes calldata proof
    ) internal view override returns (bool) {
        uint256 count = historicalValidators[id].length;
        if (!snapshotExists[id] || historicalKeys[id].length != count ||
            !_bitmapHasQuorum(bitmap, count, (2 * count + 2) / 3)) return false;
        return engine.verify(payload, historicalKeys[id], bitmap, proof);
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
