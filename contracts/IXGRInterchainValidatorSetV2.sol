// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IXGRInterchainValidatorSetV2 {
    function originChainId() external view returns (uint64);
    function setId() external view returns (uint64);
    function destinationDomain() external view returns (uint32);
    function verifier() external view returns (address);
    function verifierKeyFormat() external view returns (uint8);

    function getValidatorStatus(address validator)
        external
        view
        returns (bool active, uint64 setId);

    /// @notice Source-chain fee distribution reads only the current V2 validator addresses.
    function getFeeRecipients()
        external
        view
        returns (address[] memory validators, uint64 currentSetId);

    function getValidatorSet()
        external
        view
        returns (address[] memory validators, bytes[] memory blsPublicKeys, uint64 setId);

    function getValidatorSetForVerification()
        external
        view
        returns (address[] memory validators, bytes[] memory verificationKeys, uint64 setId);

    function getValidatorSetForVerification(uint64 requestedSetId)
        external
        view
        returns (address[] memory validators, bytes[] memory verificationKeys, uint64 resolvedSetId);

    function quorumThreshold() external view returns (uint256);
    function validatorSetCommitment(uint64 setId) external view returns (bytes32);

    function verifyQuorum(
        uint64 requestedSetId,
        bytes calldata payload,
        bytes calldata signerBitmap,
        bytes calldata aggregateSignature
    ) external view returns (bool);
}
