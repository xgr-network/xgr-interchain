// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice XITA v3.1.5: one route identity scheme for ALL assets.
/// @dev The signed transfer-checkpoint wire format matches existing XGR PoS
/// validators. There are NO route-governance proposals or legacy registries.
library XGRILNProtocol {
    bytes internal constant SOURCE_FEE_DOMAIN_V315 = "XITA_SOURCE_FEE_V315";
    bytes internal constant ASSET_DOMAIN_V315 = "XITA_ASSET_V315";
    bytes internal constant ROUTE_INSTANCE_DOMAIN_V315 = "XITA_ROUTE_INSTANCE_V315";

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
    /// @dev Every hop has XGRChain (chainId AND domain 1643) at exactly
    /// one endpoint. Router pairs allow independent route instances
    /// without a first-claim monopoly. No direct spoke-to-spoke route.
    function routeInstanceIdV315(
        bytes32 assetId, uint64 sourceChainId, uint32 sourceDomain,
        uint64 destinationChainId, uint32 destinationDomain,
        address sourceRouter, address destinationRouter
    ) internal pure returns (bytes32) {
        if (assetId == bytes32(0) || sourceChainId == 0 ||
            destinationChainId == 0 || sourceDomain == 0 ||
            destinationDomain == 0 || sourceChainId == destinationChainId ||
            sourceDomain == destinationDomain ||
            (sourceChainId == 1643) != (sourceDomain == 1643) ||
            (destinationChainId == 1643) != (destinationDomain == 1643) ||
            (sourceChainId != 1643 && destinationChainId != 1643))
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

}
