// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {XITADirectProtocol} from "./XITADirectProtocol.sol";

/// @notice ECDSA domain over the shared canonical direct authorization fields.
library XITADirectECDSAProtocol {
    bytes internal constant DOMAIN = "XITA_DIRECT_MESSAGE_ECDSA_V1";

    function encode(
        XITADirectProtocol.Authorization memory a,
        address destinationIsm,
        address destinationRegistry
    ) internal pure returns (bytes memory) {
        require(XITADirectProtocol.isValid(a, destinationIsm, destinationRegistry), "invalid ECDSA authorization");
        return XITADirectProtocol.encodeFields(DOMAIN, a, destinationIsm, destinationRegistry);
    }
}
