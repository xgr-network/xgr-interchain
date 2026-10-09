// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice XITA v3.1.5: one route identity scheme for ALL assets.
/// @dev The signed transfer-checkpoint wire format matches existing XGR PoS
/// validators. There are NO route-governance proposals or legacy registries.
library XGRILNProtocol {
    bytes internal constant CHECKPOINT_DOMAIN = "XGR_ILN_CHECKPOINT_V2";
    bytes internal constant SOURCE_FEE_DOMAIN_V315 = "XITA_SOURCE_FEE_V315";
    bytes internal constant ASSET_DOMAIN_V315 = "XITA_ASSET_V315";
    bytes internal constant ROUTE_INSTANCE_DOMAIN_V315 = "XITA_ROUTE_INSTANCE_V315";

    struct CheckpointPayload {
        uint64 sourceChainId;
        uint32 sourceDomain;
        uint32 destinationDomain;
        bytes32 routeId;
        uint64 setId;
        uint64 sourceBlockNumber;
        address registry;
        address gateway;
        address sourceRouter;
        address mailbox;
        address merkleTreeHook;
        address destinationRouter;
        uint256 validatorFeeWei;
        bytes32 authorizedMessageId;
        bytes32 root;
        uint32 index;
    }

    struct SourceFeeProposalV315 {
        uint64 sourceChainId;
        uint32 sourceDomain;
        address registry;
        uint64 setId;
        uint64 nonce;
        uint64 validUntil;
        uint256 validatorFeeWei;
    }

    /// @notice Native assets use token=address(0), kind=0; ERC-20 kind=1.
    function assetIdV315(uint64 canonicalChainId, address token, uint8 kind)
        internal pure returns (bytes32)
    {
        if (canonicalChainId == 0 || (kind == 0 && token != address(0)) ||
            (kind == 1 && token == address(0)) || kind > 1) revert InvalidRouteKey();
        return keccak256(abi.encode(keccak256(ASSET_DOMAIN_V315), canonicalChainId, token, kind));
    }

    /// @notice Identity of one directed, independently collateralized route.
    /// @dev Router addresses are included ONLY for the open multi-instance
    /// profile. The established XGR canonical routeIdV315 stays unchanged.
    /// Neither factory nonce nor registrar address grants exclusive ownership.
    function routeInstanceIdV315(
        bytes32 assetId, uint64 sourceChainId, uint32 sourceDomain,
        uint64 destinationChainId, uint32 destinationDomain,
        address sourceRouter, address destinationRouter
    ) internal pure returns (bytes32) {
        if (assetId == bytes32(0) || sourceChainId == 0 ||
            destinationChainId == 0 || sourceDomain == 0 ||
            destinationDomain == 0 || sourceChainId == destinationChainId ||
            sourceDomain == destinationDomain ||
            (sourceDomain != 1643 && destinationDomain != 1643))
            revert InvalidRouteKey();
        if (sourceRouter == address(0) || destinationRouter == address(0))
            revert InvalidRouteKey();
        return keccak256(abi.encode(
            keccak256(ROUTE_INSTANCE_DOMAIN_V315),
            assetId, sourceChainId, sourceDomain,
            destinationChainId, destinationDomain,
            sourceRouter, destinationRouter
        ));
    }

    function encodeSourceFeeProposalV315(SourceFeeProposalV315 memory p)
        internal pure returns (bytes memory)
    {
        if (p.sourceChainId == 0 || p.sourceDomain == 0 || p.registry == address(0) ||
            p.setId == 0 || p.nonce == 0 || p.validUntil == 0 || p.validatorFeeWei == 0)
            revert InvalidGovernanceProposal();
        return abi.encodePacked(
            SOURCE_FEE_DOMAIN_V315, bytes8(p.sourceChainId), bytes4(p.sourceDomain),
            bytes20(p.registry), bytes8(p.setId), bytes8(p.nonce),
            bytes8(p.validUntil), bytes32(p.validatorFeeWei)
        );
    }


    error InvalidRouteKey();
    error InvalidGovernanceProposal();
    error InvalidCheckpointPayload();

    function encodeCheckpointPayload(CheckpointPayload memory payload)
        internal
        pure
        returns (bytes memory)
    {
        _requireCheckpointPayload(payload);

        return abi.encodePacked(
            CHECKPOINT_DOMAIN,
            bytes8(payload.sourceChainId),
            bytes4(payload.sourceDomain),
            bytes4(payload.destinationDomain),
            payload.routeId,
            bytes8(payload.setId),
            bytes8(payload.sourceBlockNumber),
            bytes20(payload.registry),
            bytes20(payload.gateway),
            bytes20(payload.sourceRouter),
            bytes20(payload.mailbox),
            bytes20(payload.merkleTreeHook),
            bytes20(payload.destinationRouter),
            bytes32(payload.validatorFeeWei),
            payload.authorizedMessageId,
            payload.root,
            bytes4(payload.index)
        );
    }

    function checkpointHash(CheckpointPayload memory payload) internal pure returns (bytes32) {
        return keccak256(encodeCheckpointPayload(payload));
    }

    function _requireCheckpointPayload(CheckpointPayload memory payload) private pure {
        if (
            payload.sourceChainId == 0 ||
            payload.sourceDomain == 0 ||
            payload.destinationDomain == 0 ||
            payload.routeId == bytes32(0) ||
            payload.setId == 0 ||
            payload.sourceBlockNumber == 0 ||
            payload.registry == address(0) ||
            payload.gateway == address(0) ||
            payload.sourceRouter == address(0) ||
            payload.mailbox == address(0) ||
            payload.merkleTreeHook == address(0) ||
            payload.destinationRouter == address(0) ||
            payload.validatorFeeWei == 0 ||
            payload.authorizedMessageId == bytes32(0) ||
            payload.root == bytes32(0)
        ) revert InvalidCheckpointPayload();
    }
}
