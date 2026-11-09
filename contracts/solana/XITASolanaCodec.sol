// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Additive Solana-facing codec. Existing XITA V315 EVM contracts and
/// their exact hashes and Direct-BLS signing bytes MUST remain unchanged.
/// @dev Pure codec only. No mint, release, governance or signing authority.
library XITASolanaCodec {
    uint32 internal constant XGR_DOMAIN = 1643;
    uint32 internal constant SOLANA_DOMAIN = 1399811149;
    bytes32 internal constant SOLANA_GENESIS = 0x45296998a6f8e2a784db5d9f95e18fc23f70441a1039446801089879b08c7ef0;
    bytes32 internal constant ASSET_SCOPE = keccak256("XITA_SOLANA_ASSET_V1");
    bytes32 internal constant ROUTE_SCOPE = keccak256("XITA_SOLANA_ROUTE_V1");
    bytes internal constant MESSAGE_SCOPE = "XITA_SOLANA_DIRECT_MESSAGE_V1";

    error InvalidSolanaCodec();

    struct Authorization {
        uint32 sourceDomain;
        uint32 destinationDomain;
        bytes32 assetId;
        bytes32 routeId;
        uint64 setId;
        uint64 sourceHeight;
        bytes32 sourceRegistry;
        bytes32 gateway;
        bytes32 sourceRouter;
        bytes32 sourceMailbox;
        bytes32 destinationRouter;
        uint256 validatorFeeAtomic;
        bytes32 messageId;
        bytes32 recipient;
        uint256 amountCanonical;
        bytes32 destinationIsm;
        bytes32 destinationRegistry;
    }

    function evmAddress32(address a) internal pure returns (bytes32) {
        if (a == address(0)) revert InvalidSolanaCodec();
        return bytes32(uint256(uint160(a)));
    }

    function isEvmAddress32(bytes32 a) internal pure returns (bool) {
        return a != bytes32(0) && uint256(a) >> 160 == 0;
    }

    /// @dev Existing EVM-origin assets KEEP XGRILNProtocol.assetIdV315.
    /// A Solana-native asset uses kind=0,mint=0; SPL uses kind=1,mint!=0.
    function solanaAssetId(bytes32 mint, uint8 kind) internal pure returns (bytes32) {
        if ((kind != 0 && kind != 1) ||
            (kind == 0 && mint != bytes32(0)) ||
            (kind == 1 && mint == bytes32(0)))
            revert InvalidSolanaCodec();
        return keccak256(abi.encode(
            ASSET_SCOPE, SOLANA_DOMAIN, SOLANA_GENESIS, mint, kind
        ));
    }

    function _requireHub(uint32 sourceDomain, uint32 destinationDomain) private pure {
        if (!((sourceDomain == XGR_DOMAIN && destinationDomain == SOLANA_DOMAIN) ||
              (sourceDomain == SOLANA_DOMAIN && destinationDomain == XGR_DOMAIN)))
            revert InvalidSolanaCodec();
    }

    function solanaRouteId(
        bytes32 assetId, uint32 sourceDomain, uint32 destinationDomain,
        bytes32 sourceRouter, bytes32 destinationRouter
    ) internal pure returns (bytes32) {
        _requireHub(sourceDomain, destinationDomain);
        if (assetId == bytes32(0) || sourceRouter == bytes32(0) ||
            destinationRouter == bytes32(0) ||
            (sourceDomain == XGR_DOMAIN && !isEvmAddress32(sourceRouter)) ||
            (destinationDomain == XGR_DOMAIN && !isEvmAddress32(destinationRouter)))
            revert InvalidSolanaCodec();
        return keccak256(abi.encode(
            ROUTE_SCOPE, assetId, sourceDomain, destinationDomain,
            sourceRouter, destinationRouter, SOLANA_GENESIS
        ));
    }

    /// @notice Candidate fixed-width 501-byte signing preimage for future SVM.
    /// NOT permission to sign a transaction. Source evidence, finality,
    /// correct vault accounting and current validator set must be verified.
    function directSigningBytes(Authorization memory a) internal pure returns (bytes memory) {
        _requireHub(a.sourceDomain, a.destinationDomain);
        if (a.assetId == bytes32(0) || a.routeId == bytes32(0) ||
            a.setId == 0 || a.sourceHeight == 0 ||
            a.sourceRegistry == bytes32(0) || a.gateway == bytes32(0) ||
            a.sourceRouter == bytes32(0) || a.sourceMailbox == bytes32(0) ||
            a.destinationRouter == bytes32(0) || a.validatorFeeAtomic == 0 ||
            a.messageId == bytes32(0) || a.recipient == bytes32(0) ||
            a.amountCanonical == 0 || a.destinationIsm == bytes32(0) ||
            a.destinationRegistry == bytes32(0))
            revert InvalidSolanaCodec();
        if (a.sourceDomain == XGR_DOMAIN &&
            (!isEvmAddress32(a.sourceRegistry) || !isEvmAddress32(a.gateway) ||
             !isEvmAddress32(a.sourceRouter) || !isEvmAddress32(a.sourceMailbox)))
            revert InvalidSolanaCodec();
        if (a.destinationDomain == XGR_DOMAIN &&
            (!isEvmAddress32(a.destinationIsm) || !isEvmAddress32(a.destinationRegistry) ||
             !isEvmAddress32(a.destinationRouter) || !isEvmAddress32(a.recipient)))
            revert InvalidSolanaCodec();
        if (a.routeId != solanaRouteId(
            a.assetId, a.sourceDomain, a.destinationDomain,
            a.sourceRouter, a.destinationRouter
        )) revert InvalidSolanaCodec();
        return abi.encodePacked(
            MESSAGE_SCOPE,
            bytes4(a.sourceDomain), bytes4(a.destinationDomain), SOLANA_GENESIS,
            a.assetId, a.routeId, bytes8(a.setId), bytes8(a.sourceHeight),
            a.sourceRegistry, a.gateway, a.sourceRouter, a.sourceMailbox,
            a.destinationRouter, bytes32(a.validatorFeeAtomic), a.messageId,
            a.recipient, bytes32(a.amountCanonical), a.destinationIsm,
            a.destinationRegistry
        );
    }

    function directSigningHash(Authorization memory a) internal pure returns (bytes32) {
        return keccak256(directSigningBytes(a));
    }

    /// @notice Exact original-asset units to destination token units conversion.
    /// @dev Rejects nonrepresentable dust and SPL destination u64 overflow.
    function exactScaleAmount(
        uint256 amount, uint8 sourceDecimals, uint8 targetDecimals, bool destinationSvm
    ) internal pure returns (uint256 result) {
        if (amount == 0 || sourceDecimals > 18 || targetDecimals > 18)
            revert InvalidSolanaCodec();
        if (targetDecimals >= sourceDecimals) {
            uint256 factor = 10 ** (targetDecimals - sourceDecimals);
            if (amount > type(uint256).max / factor) revert InvalidSolanaCodec();
            result = amount * factor;
        } else {
            uint256 factor = 10 ** (sourceDecimals - targetDecimals);
            if (amount % factor != 0) revert InvalidSolanaCodec();
            result = amount / factor;
        }
        if (result == 0 || (destinationSvm && result > type(uint64).max))
            revert InvalidSolanaCodec();
    }
}
