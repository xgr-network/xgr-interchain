// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice One fee-qualified Hyperlane message, directly attested by 2/3 BLS.
/// No Merkle root, insertion index, checkpoint or replica is part of the wire format.
library XITADirectProtocol {
    bytes internal constant DOMAIN = "XITA_DIRECT_MESSAGE_V1";

    struct Authorization {
        uint64 sourceChainId;
        uint32 sourceDomain;
        uint32 destinationDomain;
        bytes32 routeId;
        uint64 setId;
        uint64 sourceBlockNumber;
        address sourceRegistry;
        address gateway;
        address sourceRouter;
        address sourceMailbox;
        address destinationRouter;
        uint256 validatorFeeWei;
        bytes32 messageId;
    }

    function encode(Authorization memory a, address destinationIsm, address destinationRegistry)
        internal pure returns (bytes memory)
    {
        require(
            a.sourceChainId != 0 && a.sourceDomain != 0 &&
            a.destinationDomain != 0 && a.sourceDomain != a.destinationDomain &&
            a.routeId != bytes32(0) && a.setId != 0 && a.sourceBlockNumber != 0 &&
            a.sourceRegistry != address(0) && a.gateway != address(0) &&
            a.sourceRouter != address(0) && a.sourceMailbox != address(0) &&
            a.destinationRouter != address(0) && a.validatorFeeWei != 0 &&
            a.messageId != bytes32(0) && destinationIsm != address(0) &&
            destinationRegistry != address(0),
            "invalid direct message authorization"
        );
        // Fixed-width canonical signing bytes; no ambiguous abi.encodePacked
        // dynamic types. Destination ISM and registry prevent cross-deployment
        // reuse even when the same validator set happens to be shared.
        return abi.encodePacked(
            DOMAIN, bytes8(a.sourceChainId), bytes4(a.sourceDomain),
            bytes4(a.destinationDomain), a.routeId, bytes8(a.setId),
            bytes8(a.sourceBlockNumber), bytes20(a.sourceRegistry),
            bytes20(a.gateway), bytes20(a.sourceRouter),
            bytes20(a.sourceMailbox), bytes20(a.destinationRouter),
            bytes32(a.validatorFeeWei), a.messageId,
            bytes20(destinationIsm), bytes20(destinationRegistry)
        );
    }
}
