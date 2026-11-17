// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {XITADirectProtocol} from "./XITADirectProtocol.sol";

/// @notice ECDSA-only Direct authorization. No change to the deployed BLS wire domain.
/// @dev Identical validated message fields, DIFFERENT explicit domain separator.
library XITADirectECDSAProtocol {
    bytes internal constant DOMAIN = "XITA_DIRECT_MESSAGE_ECDSA_V1";

    function encode(
        XITADirectProtocol.Authorization memory a,
        address destinationIsm,
        address destinationRegistry
    ) internal pure returns (bytes memory) {
        require(
            a.sourceChainId != 0 && a.sourceDomain != 0 &&
            a.destinationDomain != 0 && a.sourceDomain != a.destinationDomain &&
            a.routeId != bytes32(0) && a.setId != 0 && a.sourceBlockNumber != 0 &&
            a.sourceRegistry != address(0) && a.gateway != address(0) &&
            a.sourceRouter != address(0) && a.sourceMailbox != address(0) &&
            a.destinationRouter != address(0) && a.validatorFeeWei != 0 &&
            a.messageId != bytes32(0) && destinationIsm != address(0) &&
            destinationRegistry != address(0), "invalid ECDSA authorization"
        );
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
