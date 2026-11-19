// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IXGRInterchainValidatorSetV2} from "./IXGRInterchainValidatorSetV2.sol";
import {XITADirectProtocol} from "./XITADirectProtocol.sol";

interface IXITADirectInboundRouter {
    function verifyInboundRoute(
        uint64 sourceChainId, uint32 sourceDomain,
        address sourceRouter, bytes32 routeId
    ) external view returns (bool);
}

/// @notice Shared direct-message policy for every explicit signature adapter.
/// The source Gateway/Router/Mailbox and fee-paid operation are independently
/// checked by each signing validator, NOT trusted from caller metadata.
abstract contract XITADirectISMCore {
    IXGRInterchainValidatorSetV2 public immutable registry;
    uint32 public immutable destinationDomain;
    uint8 private constant MODULE_TYPE_CUSTOM = 0;

    error InvalidConfiguration();

    constructor(address registry_) {
        if (registry_ == address(0) || registry_.code.length == 0)
            revert InvalidConfiguration();
        IXGRInterchainValidatorSetV2 r = IXGRInterchainValidatorSetV2(registry_);
        uint32 domain = r.destinationDomain();
        if (domain == 0 || r.verifier() == address(0))
            revert InvalidConfiguration();
        registry = r;
        destinationDomain = domain;
    }

    function moduleType() external pure returns (uint8) {
        return MODULE_TYPE_CUSTOM;
    }

    struct CoreMetadata {
        XITADirectProtocol.Authorization authorization;
        bytes signerBitmap;
        bytes quorumProof;
    }

    function verify(bytes calldata metadata, bytes calldata message)
        external view returns (bool)
    {
        if (message.length < 77) return false;
        CoreMetadata memory signed = abi.decode(metadata, (CoreMetadata));
        XITADirectProtocol.Authorization memory a = signed.authorization;

        // A signature is valid ONLY for the current destination validator
        // set. Rotation forces re-attestation, never a new source Lock.
        if (!_isCurrentSet(a.setId) ||
            a.destinationDomain != destinationDomain ||
            a.sourceDomain == a.destinationDomain ||
            a.sourceChainId == 0 || a.sourceDomain == 0 ||
            a.sourceBlockNumber == 0 || a.routeId == bytes32(0) ||
            a.sourceRegistry == address(0) || a.gateway == address(0) ||
            a.sourceRouter == address(0) || a.sourceMailbox == address(0) ||
            a.destinationRouter == address(0) || a.validatorFeeWei == 0 ||
            a.messageId == bytes32(0) ||
            signed.signerBitmap.length == 0 || signed.quorumProof.length == 0)
            return false;

        // Canonical Hyperlane V3 message header:
        // version[1] nonce[4] origin[4] sender[32] destination[4]
        // recipient[32] body[N].
        if (uint32(bytes4(message[5:9])) != a.sourceDomain ||
            uint32(bytes4(message[41:45])) != destinationDomain ||
            bytes32(message[9:41]) != bytes32(uint256(uint160(a.sourceRouter))) ||
            bytes32(message[45:77]) != bytes32(uint256(uint160(a.destinationRouter))) ||
            keccak256(message) != a.messageId)
            return false;

        // Fail closed if the actual recipient is not the asset owning the
        // canonical reverse route. A valid vote for another token must
        // never unlock the destination router's collateral.
        (bool ok, bytes memory result) = a.destinationRouter.staticcall(
            abi.encodeCall(
                IXITADirectInboundRouter.verifyInboundRoute,
                (a.sourceChainId, a.sourceDomain, a.sourceRouter, a.routeId)
            )
        );
        if (!ok || result.length != 32 || !abi.decode(result,(bool)))
            return false;

        return registry.verifyQuorum(
            a.setId, _encodeAuthorization(a),
            signed.signerBitmap, signed.quorumProof
        );
    }

    function encodeAuthorization(XITADirectProtocol.Authorization calldata a)
        external view returns (bytes memory)
    {
        return _encodeAuthorization(a);
    }

    function _isCurrentSet(uint64 requestedSetId) internal view virtual returns (bool) {
        return requestedSetId == registry.setId();
    }

    function _encodeAuthorization(XITADirectProtocol.Authorization memory a)
        internal view virtual returns (bytes memory);
}
