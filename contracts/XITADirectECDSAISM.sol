// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {XITADirectISMCore} from "./XITADirectISMCore.sol";
import {XITADirectProtocol} from "./XITADirectProtocol.sol";
import {XITADirectECDSAProtocol} from "./XITADirectECDSAProtocol.sol";

/// @notice ECDSA wire adapter for the same direct-message policy as BLS V3.
contract XITADirectECDSAISM is XITADirectISMCore {
    uint8 private constant ECDSA_FORMAT = 3;

    struct Metadata {
        XITADirectProtocol.Authorization authorization;
        bytes signerBitmap;
        bytes signatures; // 65-byte r,s,v entries in canonical Registry order
    }

    constructor(address registry_) XITADirectISMCore(registry_) {
        if (destinationDomain != block.chainid || registry.verifierKeyFormat() != ECDSA_FORMAT)
            revert InvalidConfiguration();
    }

    function _isCurrentSet(uint64 requestedSetId) internal view override returns (bool) {
        return requestedSetId != 0 && super._isCurrentSet(requestedSetId);
    }

    function _encodeAuthorization(XITADirectProtocol.Authorization memory a)
        internal view override returns (bytes memory)
    {
        return XITADirectECDSAProtocol.encode(a, address(this), address(registry));
    }
}
