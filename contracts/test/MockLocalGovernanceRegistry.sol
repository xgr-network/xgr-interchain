// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockLocalGovernanceRegistry {
    uint32 public immutable destinationDomain;
    address public immutable verifier;
    uint64 public setId = 7;
    address[] private members;
    mapping(uint64 => address[]) private historical;

    constructor(uint32 domain_) {
        destinationDomain = domain_;
        verifier = address(this);
        members.push(address(0x101));
        members.push(address(0x202));
        historical[setId].push(address(0x101));
        historical[setId].push(address(0x202));
    }

    function setMembers(address[] calldata values) external {
        delete members;
        for (uint256 i; i < values.length; ++i) members.push(values[i]);
        setId++;
        for (uint256 i; i < members.length; ++i) historical[setId].push(members[i]);
    }

    function getFeeRecipientCountAndSetId() external view returns (uint256 count, uint64 currentSetId) {
        return (members.length, setId);
    }
    function getFeeRecipientIndexForSet(uint64 atSetId, address validator)
        external view returns (uint256 indexPlusOne, uint256 count)
    {
        address[] storage list = historical[atSetId];
        count = list.length;
        for (uint256 i; i < count; ++i)
            if (list[i] == validator) return (i + 1, count);
        return (0, count);
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

    function setSetId(uint64 value) external {
        setId = value;
        if (historical[value].length == 0) {
            for (uint256 i; i < members.length; ++i) historical[value].push(members[i]);
        }
    }

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
