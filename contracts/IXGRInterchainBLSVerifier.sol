// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Chain-neutral BLS verifier interface used by XGR Interchain security contracts.
interface IXGRInterchainBLSVerifier {
    function verify(
        bytes calldata message,
        bytes[] calldata publicKeys,
        bytes calldata signerBitmap,
        bytes calldata aggregateSignature
    ) external view returns (bool);
}
