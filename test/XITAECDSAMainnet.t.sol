// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {XGRInterchainECDSAVerifier} from "../contracts/XGRInterchainECDSAVerifier.sol";
import {XGRInterchainECDSAValidatorRegistry} from "../contracts/XGRInterchainECDSAValidatorRegistry.sol";
import {XITADirectECDSAISM} from "../contracts/XITADirectECDSAISM.sol";
import {XITADirectProtocol} from "../contracts/XITADirectProtocol.sol";

contract ECDSARouteRecipientMock {
    bool public enabled = true;
    function verifyInboundRoute(uint64 chainId, uint32 domain, address source, bytes32 routeId)
        external view returns (bool)
    {
        return enabled && chainId == 1643 && domain == 1643 &&
            source == address(0x2222) && routeId == bytes32(uint256(0x123));
    }
    function disable() external { enabled = false; }
}

contract XITAECDSAMainnetTest is Test {
    uint256 constant K1 = 0x101;
    uint256 constant K2 = 0x202;
    uint256 constant K3 = 0x303;
    uint256 constant K4 = 0x404;
    XGRInterchainECDSAVerifier internal engine;
    XGRInterchainECDSAValidatorRegistry internal registry;
    XITADirectECDSAISM internal ism;
    ECDSARouteRecipientMock internal recipient;
    address[] internal genesis;
    bytes[] internal keys;

    function setUp() public {
        vm.chainId(50);
        engine = new XGRInterchainECDSAVerifier();
        genesis.push(vm.addr(K1));
        genesis.push(vm.addr(K2));
        genesis.push(vm.addr(K3));
        for (uint256 i; i < 3; i++) {
            bytes memory key = new bytes(48);
            key[0] = bytes1(uint8(i + 1));
            keys.push(key);
        }
        bytes32 root = engineRoot(genesis, keys);
        registry = new XGRInterchainECDSAValidatorRegistry(1643, 50, address(engine), 7, root);
        recipient = new ECDSARouteRecipientMock();
        ism = new XITADirectECDSAISM(address(registry));
    }

    function engineRoot(address[] memory validators, bytes[] memory bls)
        internal pure returns (bytes32 result)
    {
        result = keccak256(abi.encodePacked("XGR_INTERCHAIN_SET_V2", uint256(validators.length)));
        for (uint256 i; i < validators.length; i++)
            result = keccak256(abi.encodePacked(result, validators[i], keccak256(bls[i])));
    }

    function sign(uint256 key, bytes32 digest) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function doubleSign(bytes memory payload) internal returns (bytes memory) {
        bytes32 digest = keccak256(payload);
        return bytes.concat(sign(K1, digest), sign(K2, digest));
    }

    function activate() internal {
        registry.activateBootstrap(genesis, keys, hex"03", doubleSign(registry.bootstrapPayload()));
    }

    function testGenesisRejectsUntrustedOrMissingQuorum() public {
        vm.expectRevert(XGRInterchainECDSAValidatorRegistry.InvalidBootstrap.selector);
        registry.activateBootstrap(genesis, keys, hex"01", sign(K1, keccak256(registry.bootstrapPayload())));
        bytes[] memory altered = keys;
        bytes memory modified = new bytes(48);
        modified[0] = 0xaa;
        altered[0] = modified;
        vm.expectRevert(XGRInterchainECDSAValidatorRegistry.InvalidBootstrap.selector);
        registry.activateBootstrap(genesis, altered, hex"03", doubleSign(registry.bootstrapPayload()));
    }

    function testBootstrapAndCurrentSet2Of3() public {
        activate();
        assertEq(registry.setId(), 7);
        assertEq(registry.quorumThreshold(), 2);
        bytes memory payload = abi.encodePacked("TEST_ECDSA_DOMAIN", bytes32(uint256(123)));
        assertTrue(registry.verifyQuorum(7, payload, hex"03", doubleSign(payload)));
        assertFalse(registry.verifyQuorum(7, payload, hex"01", sign(K1, keccak256(payload))));
        assertFalse(registry.verifyQuorum(7, payload, hex"83", doubleSign(payload)));
        assertFalse(registry.verifyQuorum(7, abi.encodePacked(payload, bytes1(0x01)), hex"03", doubleSign(payload)));
    }

    function testMembershipRequiresOldQuorumAndNewValidatorPossession() public {
        activate();
        address[] memory newSet = new address[](3);
        newSet[0] = vm.addr(K1);
        newSet[1] = vm.addr(K2);
        newSet[2] = vm.addr(K4);
        bytes[] memory newKeys = new bytes[](3);
        newKeys[0] = keys[0]; newKeys[1] = keys[1]; newKeys[2] = keys[2];
        bytes32 root = engineRoot(newSet, newKeys);
        bytes memory approval = registry.membershipPayload(8, root);
        vm.expectRevert(XGRInterchainECDSAValidatorRegistry.InvalidMembership.selector);
        registry.applyXGRValidatorSet(8, newSet, newKeys, hex"03", doubleSign(approval));
        vm.prank(vm.addr(K4));
        registry.provePossession(8, root, sign(K4,
            keccak256(registry.possessionPayload(8, root, vm.addr(K4)))));
        registry.applyXGRValidatorSet(8, newSet, newKeys, hex"03", doubleSign(approval));
        assertEq(registry.setId(), 8);
        (bool wasMember,) = registry.getValidatorStatus(vm.addr(K3));
        assertFalse(wasMember);
        (bool newMember,) = registry.getValidatorStatus(vm.addr(K4));
        assertTrue(newMember);
        (uint256 historicalIndex, uint256 historicalCount) =
            registry.getFeeRecipientIndexForSet(7, vm.addr(K3));
        assertEq(historicalIndex, 3);
        assertEq(historicalCount, 3);
        vm.expectRevert(XGRInterchainECDSAValidatorRegistry.InvalidMembership.selector);
        registry.applyXGRValidatorSet(8, newSet, newKeys, hex"03", doubleSign(approval));
    }

    function testDirectECDSAISMRequiresCanonicalMessageRouteAndQuorum() public {
        activate();
        bytes memory message = abi.encodePacked(
            uint8(3), uint32(9), uint32(1643),
            bytes32(uint256(uint160(address(0x2222)))),
            uint32(50), bytes32(uint256(uint160(address(recipient)))), bytes("transfer")
        );
        XITADirectProtocol.Authorization memory a = XITADirectProtocol.Authorization({
            sourceChainId:1643, sourceDomain:1643, destinationDomain:50,
            routeId:bytes32(uint256(0x123)), setId:7, sourceBlockNumber:123456,
            sourceRegistry:address(0x1111), gateway:address(0x3333),
            sourceRouter:address(0x2222), sourceMailbox:address(0x4444),
            destinationRouter:address(recipient), validatorFeeWei:1000,
            messageId:keccak256(message)
        });
        bytes memory signatures = doubleSign(ism.encodeAuthorization(a));
        assertTrue(ism.verify(abi.encode(XITADirectECDSAISM.Metadata(a, hex"03", signatures)), message));
        a.messageId = keccak256("different");
        assertFalse(ism.verify(abi.encode(XITADirectECDSAISM.Metadata(a, hex"03", signatures)), message));
        a.messageId = keccak256(message);
        recipient.disable();
        assertFalse(ism.verify(abi.encode(XITADirectECDSAISM.Metadata(a, hex"03", signatures)), message));
    }

    function testECDSADomainNeverEqualsLegacyBLS() public {
        activate();
        bytes memory message = abi.encodePacked(
            uint8(3), uint32(1), uint32(1643),
            bytes32(uint256(uint160(address(0x2222)))), uint32(50),
            bytes32(uint256(uint160(address(recipient)))), bytes("payload")
        );
        XITADirectProtocol.Authorization memory a = XITADirectProtocol.Authorization({
            sourceChainId:1643, sourceDomain:1643, destinationDomain:50,
            routeId:bytes32(uint256(0x123)), setId:7, sourceBlockNumber:1,
            sourceRegistry:address(0x1111), gateway:address(0x3333),
            sourceRouter:address(0x2222), sourceMailbox:address(0x4444),
            destinationRouter:address(recipient), validatorFeeWei:1,
            messageId:keccak256(message)
        });
        bytes memory signature = doubleSign(ism.encodeAuthorization(a));
        bytes memory blsEncoded = XITADirectProtocol.encode(a, address(ism), address(registry));
        assertFalse(registry.verifyQuorum(7, blsEncoded, hex"03", signature));
    }
}
