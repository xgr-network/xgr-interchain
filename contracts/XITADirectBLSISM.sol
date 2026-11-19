// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {XITADirectISMCore} from "./XITADirectISMCore.sol";
import {XITADirectProtocol} from "./XITADirectProtocol.sol";

/// @notice BLS wire adapter for the common direct-message authorization policy.
contract XITADirectBLSISM is XITADirectISMCore {
    // Preserve the public Solidity metadata type and its deployed ABI encoding.
    struct Metadata {
        XITADirectProtocol.Authorization authorization;
        bytes signerBitmap;
        bytes aggregateSignature;
    }

    constructor(address registry_) XITADirectISMCore(registry_) {}

    function _encodeAuthorization(XITADirectProtocol.Authorization memory a)
        internal view override returns (bytes memory)
    {
        return XITADirectProtocol.encode(a, address(this), address(registry));
    }
}
