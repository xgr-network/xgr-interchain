// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Canonical XGR Interchain v3.1.3 wire-format helpers.
/// @dev These encoders MUST remain byte-for-byte compatible with xgrchain PoS_3.
library XGRILNProtocol {
    bytes internal constant ROUTE_DOMAIN = "XGR_ILN_ROUTE_V2";
    bytes internal constant GOVERNANCE_DOMAIN = "XGR_ILN_GOVERNANCE_V2";
    bytes internal constant CHECKPOINT_DOMAIN = "XGR_ILN_CHECKPOINT_V2";

    uint8 internal constant PROPOSAL_FEE_UPDATE = 1;
    uint8 internal constant PROPOSAL_ROUTE_ADD = 2;
    uint8 internal constant PROPOSAL_ROUTE_ENABLE = 3;
    uint8 internal constant PROPOSAL_ROUTE_DISABLE = 4;

    struct RouteKey {
        uint64 sourceChainId;
        uint32 sourceDomain;
        uint32 destinationDomain;
        bytes32 routeId;
    }

    struct Route {
        RouteKey key;
        address gateway;
        address sourceRouter;
        address mailbox;
        address merkleTreeHook;
        address destinationRouter;
        uint256 validatorFeeWei;
        bool enabled;
    }

    struct GovernanceProposal {
        uint8 proposalType;
        address registry;
        uint64 setId;
        uint64 nonce;
        uint64 validUntil;
        Route route;
    }

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

    bytes internal constant SOURCE_FEE_DOMAIN_V315 = "XITA_SOURCE_FEE_V315";
    bytes internal constant ASSET_DOMAIN_V315 = "XITA_ASSET_V315";
    bytes internal constant ROUTE_DOMAIN_V315 = "XITA_ROUTE_V315";

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

    function routeIdV315(
        bytes32 assetId, uint64 sourceChainId, uint32 sourceDomain,
        uint64 destinationChainId, uint32 destinationDomain
    ) internal pure returns (bytes32) {
        if (assetId == bytes32(0) || sourceChainId == 0 || destinationChainId == 0 ||
            sourceDomain == 0 || destinationDomain == 0 ||
            sourceChainId == destinationChainId || sourceDomain == destinationDomain ||
            (sourceDomain != 1643 && destinationDomain != 1643)) revert InvalidRouteKey();
        return keccak256(abi.encode(
            keccak256(ROUTE_DOMAIN_V315), assetId,
            sourceChainId, sourceDomain, destinationChainId, destinationDomain
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

    function encodeRouteKey(RouteKey memory key) internal pure returns (bytes memory) {
        _requireRouteKey(key);
        return abi.encodePacked(
            ROUTE_DOMAIN,
            bytes8(key.sourceChainId),
            bytes4(key.sourceDomain),
            bytes4(key.destinationDomain),
            key.routeId
        );
    }

    function routeKeyHash(RouteKey memory key) internal pure returns (bytes32) {
        return keccak256(encodeRouteKey(key));
    }

    function encodeGovernanceProposal(GovernanceProposal memory proposal)
        internal
        pure
        returns (bytes memory)
    {
        _requireGovernanceProposal(proposal);

        return abi.encodePacked(
            GOVERNANCE_DOMAIN,
            bytes8(proposal.route.key.sourceChainId),
            bytes4(proposal.route.key.sourceDomain),
            bytes4(proposal.route.key.destinationDomain),
            proposal.route.key.routeId,
            bytes20(proposal.registry),
            bytes8(proposal.setId),
            bytes8(proposal.nonce),
            bytes8(proposal.validUntil),
            bytes1(proposal.proposalType),
            bytes20(proposal.route.gateway),
            bytes20(proposal.route.sourceRouter),
            bytes20(proposal.route.mailbox),
            bytes20(proposal.route.merkleTreeHook),
            bytes20(proposal.route.destinationRouter),
            bytes32(proposal.route.validatorFeeWei)
        );
    }

    function proposalId(GovernanceProposal memory proposal) internal pure returns (bytes32) {
        return keccak256(encodeGovernanceProposal(proposal));
    }

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

    function _requireRouteKey(RouteKey memory key) private pure {
        if (
            key.sourceChainId == 0 ||
            key.sourceDomain == 0 ||
            key.destinationDomain == 0 ||
            key.routeId == bytes32(0)
        ) revert InvalidRouteKey();
    }

    function _requireGovernanceProposal(GovernanceProposal memory proposal) private pure {
        _requireRouteKey(proposal.route.key);

        if (
            proposal.registry == address(0) ||
            proposal.setId == 0 ||
            proposal.nonce == 0 ||
            proposal.validUntil == 0
        ) revert InvalidGovernanceProposal();

        if (proposal.proposalType == PROPOSAL_FEE_UPDATE) {
            if (
                proposal.route.gateway != address(0) ||
                proposal.route.sourceRouter != address(0) ||
                proposal.route.mailbox != address(0) ||
                proposal.route.merkleTreeHook != address(0) ||
                proposal.route.destinationRouter != address(0) ||
                proposal.route.validatorFeeWei == 0 ||
                proposal.route.enabled
            ) revert InvalidGovernanceProposal();
            return;
        }

        if (proposal.proposalType == PROPOSAL_ROUTE_ADD) {
            if (
                proposal.route.gateway == address(0) ||
                proposal.route.sourceRouter == address(0) ||
                proposal.route.mailbox == address(0) ||
                proposal.route.merkleTreeHook == address(0) ||
                proposal.route.destinationRouter == address(0) ||
                proposal.route.validatorFeeWei == 0 ||
                !proposal.route.enabled
            ) revert InvalidGovernanceProposal();
            return;
        }

        if (
            proposal.proposalType == PROPOSAL_ROUTE_ENABLE ||
            proposal.proposalType == PROPOSAL_ROUTE_DISABLE
        ) {
            if (
                proposal.route.gateway != address(0) ||
                proposal.route.sourceRouter != address(0) ||
                proposal.route.mailbox != address(0) ||
                proposal.route.merkleTreeHook != address(0) ||
                proposal.route.destinationRouter != address(0) ||
                proposal.route.validatorFeeWei != 0 ||
                proposal.route.enabled
            ) revert InvalidGovernanceProposal();
            return;
        }

        revert InvalidGovernanceProposal();
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
