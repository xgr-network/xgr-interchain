// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IXGRInterchainBLSVerifier} from "../IXGRInterchainBLSVerifier.sol";

contract MockXGRInterchainBLSVerifier is IXGRInterchainBLSVerifier {
    bool public result = true;

    function setResult(bool value) external {
        result = value;
    }

    function verify(
        bytes calldata,
        bytes[] calldata,
        bytes calldata,
        bytes calldata
    ) external view returns (bool) {
        return result;
    }
}
