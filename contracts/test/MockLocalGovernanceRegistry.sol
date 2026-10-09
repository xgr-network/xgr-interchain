// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockLocalGovernanceRegistry {
    uint32 public immutable destinationDomain;
    address public immutable verifier;
    uint64 public setId = 7;
    address[] private members;

    constructor(uint32 domain_) {
        destinationDomain = domain_;
        verifier = address(this);
        members.push(address(0x101));
        members.push(address(0x202));
    }

    function setMembers(address[] calldata values) external {
        delete members;
        for (uint256 i; i < values.length; ++i) members.push(values[i]);
        setId++;
    }

    function getFeeRecipients() external view returns (address[] memory validators, uint64 currentSetId) {
        return (members, setId);
    }

    function getValidatorSet() external view returns (address[] memory validators, bytes[] memory keys, uint64 currentSetId) {
        validators = members;
        keys = new bytes[](members.length);
        currentSetId = setId;
    }
    bool public result = true;

    function setSetId(uint64 value) external { setId = value; }

    function setResult(bool value) external {
        result = value;
    }

    function verifyQuorum(
        uint64 requestedSetId,
        bytes calldata,
        bytes calldata,
        bytes calldata
    ) external view returns (bool) {
        return result && requestedSetId == setId;
    }
}
