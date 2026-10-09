// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IXGRInterchainValidatorSetV2} from "./IXGRInterchainValidatorSetV2.sol";
import {XGRILNProtocol} from "./XGRILNProtocol.sol";

/// @notice Generic destination ISM for XGR Interchain v3.1.3.
/// @dev One instance can verify any legitimate route terminating at the
///      destination represented by the canonical ValidatorRegistryV2.
///      Route and message context are carried inside the signed checkpoint
///      payload; the relayer cannot choose them independently.
contract XGRILNInterchainISMV2 {
    uint256 private constant TREE_DEPTH = 32;
    uint8 private constant MODULE_TYPE_CUSTOM = 0;

    IXGRInterchainValidatorSetV2 public immutable registry;
    uint32 public immutable destinationDomain;

    error InvalidConfiguration();

    constructor(address validatorRegistry_) {
        if (validatorRegistry_ == address(0)) revert InvalidConfiguration();

        IXGRInterchainValidatorSetV2 registryView =
            IXGRInterchainValidatorSetV2(validatorRegistry_);
        uint32 destination = registryView.destinationDomain();

        if (
            destination == 0 ||
            registryView.verifier() == address(0)
        ) revert InvalidConfiguration();

        registry = registryView;
        destinationDomain = destination;
    }

    function moduleType() external pure returns (uint8) {
        return MODULE_TYPE_CUSTOM;
    }

    /// @dev Metadata ABI:
    /// abi.encode(
    ///   uint32 messageIndex,
    ///   bytes32[32] merkleProof,
    ///   uint64 sourceChainId,
    ///   uint32 sourceDomain,
    ///   uint32 destinationDomain,
    ///   bytes32 routeId,
    ///   uint64 setId,
    ///   uint64 sourceBlockNumber,
    ///   address sourceRegistry,
    ///   address sourceGateway,
    ///   address sourceRouter,
    ///   address sourceMailbox,
    ///   address sourceMerkleTreeHook,
    ///   address destinationRouter,
    ///   uint256 validatorFeeWei,
    ///   bytes32 authorizedMessageId,
    ///   bytes32 root,
    ///   uint32 checkpointIndex,
    ///   bytes signerBitmap,
    ///   bytes aggregateSignature
    /// )
    function verify(bytes calldata metadata, bytes calldata message)
        external
        view
        returns (bool)
    {
        if (message.length < 77) return false;

        (
            uint32 messageIndex,
            bytes32[32] memory proof,
            uint64 sourceChainId,
            uint32 sourceDomain,
            uint32 payloadDestinationDomain,
            bytes32 routeId,
            uint64 setId,
            uint64 sourceBlockNumber,
            address sourceRegistry,
            address sourceGateway,
            address sourceRouter,
            address sourceMailbox,
            address sourceMerkleTreeHook,
            address destinationRouter,
            uint256 validatorFeeWei,
            bytes32 authorizedMessageId,
            bytes32 root,
            uint32 checkpointIndex,
            bytes memory signerBitmap,
            bytes memory aggregateSignature
        ) = abi.decode(
            metadata,
            (
                uint32,
                bytes32[32],
                uint64,
                uint32,
                uint32,
                bytes32,
                uint64,
                uint64,
                address,
                address,
                address,
                address,
                address,
                address,
                uint256,
                bytes32,
                bytes32,
                uint32,
                bytes,
                bytes
            )
        );

        if (
            sourceChainId == 0 ||
            sourceDomain == 0 ||
            payloadDestinationDomain != destinationDomain ||
            routeId == bytes32(0) ||
            setId == 0 ||
            sourceBlockNumber == 0 ||
            sourceRegistry == address(0) ||
            sourceGateway == address(0) ||
            sourceRouter == address(0) ||
            sourceMailbox == address(0) ||
            sourceMerkleTreeHook == address(0) ||
            destinationRouter == address(0) ||
            validatorFeeWei == 0 ||
            authorizedMessageId == bytes32(0) ||
            root == bytes32(0) ||
            messageIndex > checkpointIndex
        ) return false;

        // Settlement authority must track the CURRENT destination validator set.
        // Historical membership snapshots remain auditable in RegistryV2, but
        // retired quorums must never authorize delivery after rotation.
        // Pending messages are re-attested by the new set before settlement.
        if (setId != registry.setId()) return false;

        if (_messageOrigin(message) != sourceDomain) return false;
        if (_messageDestination(message) != destinationDomain) return false;

        if (
            _messageSender(message) !=
            bytes32(uint256(uint160(sourceRouter)))
        ) return false;

        if (
            _messageRecipient(message) !=
            bytes32(uint256(uint160(destinationRouter)))
        ) return false;

        bytes32 actualMessageId = keccak256(message);
        if (actualMessageId != authorizedMessageId) return false;

        bytes32 reconstructedRoot = _branchRoot(
            actualMessageId,
            proof,
            uint256(messageIndex)
        );
        if (reconstructedRoot != root) return false;

        XGRILNProtocol.CheckpointPayload memory payload =
            XGRILNProtocol.CheckpointPayload({
                sourceChainId: sourceChainId,
                sourceDomain: sourceDomain,
                destinationDomain: payloadDestinationDomain,
                routeId: routeId,
                setId: setId,
                sourceBlockNumber: sourceBlockNumber,
                registry: sourceRegistry,
                gateway: sourceGateway,
                sourceRouter: sourceRouter,
                mailbox: sourceMailbox,
                merkleTreeHook: sourceMerkleTreeHook,
                destinationRouter: destinationRouter,
                validatorFeeWei: validatorFeeWei,
                authorizedMessageId: authorizedMessageId,
                root: root,
                index: checkpointIndex
            });

        bytes memory signedPayload =
            XGRILNProtocol.encodeCheckpointPayload(payload);

        return registry.verifyQuorum(
            setId,
            signedPayload,
            signerBitmap,
            aggregateSignature
        );
    }

    function encodeCheckpointPayload(
        XGRILNProtocol.CheckpointPayload calldata payload
    ) external pure returns (bytes memory) {
        XGRILNProtocol.CheckpointPayload memory p = payload;
        return XGRILNProtocol.encodeCheckpointPayload(p);
    }

    function _messageOrigin(bytes calldata message)
        private
        pure
        returns (uint32)
    {
        return uint32(bytes4(message[5:9]));
    }

    function _messageSender(bytes calldata message)
        private
        pure
        returns (bytes32)
    {
        return bytes32(message[9:41]);
    }

    function _messageDestination(bytes calldata message)
        private
        pure
        returns (uint32)
    {
        return uint32(bytes4(message[41:45]));
    }

    function _messageRecipient(bytes calldata message)
        private
        pure
        returns (bytes32)
    {
        return bytes32(message[45:77]);
    }

    function _branchRoot(
        bytes32 item,
        bytes32[32] memory branch,
        uint256 index
    ) private pure returns (bytes32 current) {
        current = item;
        for (uint256 i = 0; i < TREE_DEPTH; i++) {
            bytes32 sibling = branch[i];
            if (((index >> i) & 1) == 1) {
                current = keccak256(
                    abi.encodePacked(sibling, current)
                );
            } else {
                current = keccak256(
                    abi.encodePacked(current, sibling)
                );
            }
        }
    }
}
