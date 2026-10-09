// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {XGRInterchainValidatorRegistryV2} from "../contracts/XGRInterchainValidatorRegistryV2.sol";
import {MockXGRInterchainBLSVerifier} from "../contracts/test/MockXGRInterchainBLSVerifier.sol";

contract XGRInterchainValidatorRegistryV2Test is Test {
    MockXGRInterchainBLSVerifier internal verifier;

    address internal constant A = address(0xA1);
    address internal constant B = address(0xB2);
    address internal constant C = address(0xC3);
    address internal constant D = address(0xD4);
    uint8 internal constant FORMAT_COMPRESSED = 1;
    uint8 internal constant FORMAT_EIP2537 = 2;

    function testCompressedVerifierUsesCompressedKeys() public {
        verifier = new MockXGRInterchainBLSVerifier();
        XGRInterchainValidatorRegistryV2 registry = _deploy(
            FORMAT_COMPRESSED
        );

        (address[] memory validators, bytes[] memory keys, uint64 setId) =
            registry.getValidatorSetForVerification();

        assertEq(validators.length, 3);
        assertEq(keys.length, 3);
        assertEq(keys[0].length, 48);
        assertEq(setId, 1);

        registry.applyMembership{value: 1 ether}(
            XGRInterchainValidatorRegistryV2.MembershipTransition({
                expectedSetId: 1,
                validUntil: uint64(block.timestamp + 5 minutes),
                action: 1,
                validator: D,
                blsPublicKey: _bytes(48, 0x44),
                blsPublicKeyEIP2537: _bytes(128, 0x54)
            }),
            hex"03",
            _bytes(96, 0x66)
        );

        (, uint64 newSetId) = registry.getValidatorStatus(D);
        assertEq(newSetId, 2);

        (address[] memory oldValidators, bytes[] memory oldKeys, uint64 oldSetId) =
            registry.getValidatorSetForVerification(1);
        assertEq(oldSetId, 1);
        assertEq(oldValidators.length, 3);
        assertEq(oldValidators[0], A);
        assertEq(oldValidators[1], B);
        assertEq(oldValidators[2], C);
        assertEq(oldKeys.length, 3);
        assertEq(oldKeys[0].length, 48);

        (address[] memory currentValidators, bytes[] memory currentKeys, uint64 currentSetId) =
            registry.getValidatorSetForVerification(2);
        assertEq(currentSetId, 2);
        assertEq(currentValidators.length, 4);
        assertEq(currentValidators[3], D);
        assertEq(currentKeys.length, 4);
    }

    function testUnknownHistoricalSetReturnsNoResolvedSet() public {
        verifier = new MockXGRInterchainBLSVerifier();
        XGRInterchainValidatorRegistryV2 registry = _deploy(FORMAT_COMPRESSED);

        (address[] memory validators, bytes[] memory keys, uint64 resolvedSetId) =
            registry.getValidatorSetForVerification(999);

        assertEq(resolvedSetId, 0);
        assertEq(validators.length, 0);
        assertEq(keys.length, 0);
    }

    function testEIP2537VerifierUsesEIP2537Keys() public {
        verifier = new MockXGRInterchainBLSVerifier();
        XGRInterchainValidatorRegistryV2 registry = _deploy(
            FORMAT_EIP2537
        );

        (, bytes[] memory keys,) = registry.getValidatorSetForVerification();
        assertEq(keys.length, 3);
        assertEq(keys[0].length, 128);
    }

    function testCanonicalMembershipPayloadUnchanged() public {
        verifier = new MockXGRInterchainBLSVerifier();
        XGRInterchainValidatorRegistryV2 registry = _deploy(FORMAT_COMPRESSED);

        bytes memory compressed = _bytes(48, 0x31);
        bytes memory eip = _bytes(128, 0x41);
        bytes memory expected = abi.encodePacked(
            bytes("XGR_INTERCHAIN_V2"),
            bytes8(uint64(1643)),
            bytes4(uint32(1643)),
            bytes8(uint64(7)),
            bytes8(uint64(1700000000)),
            bytes1(uint8(1)),
            bytes20(address(0x1111111111111111111111111111111111111111)),
            bytes2(uint16(compressed.length)),
            compressed,
            bytes2(uint16(eip.length)),
            eip
        );

        assertEq(
            registry.encodeMembershipPayload(
                1643,
                1643,
                7,
                1700000000,
                1,
                address(0x1111111111111111111111111111111111111111),
                compressed,
                eip
            ),
            expected
        );
    }

    function testRejectsUnknownVerifierFormat() public {
        verifier = new MockXGRInterchainBLSVerifier();
        address[] memory validators = _validators();
        bytes[] memory keys = _keys(48, 1);
        bytes[] memory eipKeys = _keys(128, 11);
        bytes[] memory proofs = _keys(96, 21);

        vm.expectRevert(XGRInterchainValidatorRegistryV2.InvalidBootstrap.selector);
        new XGRInterchainValidatorRegistryV2{value: 3 ether}(
            1643,
            1643,
            address(verifier),
            9,
            1 ether,
            0.1 ether,
            validators,
            keys,
            eipKeys,
            proofs
        );
    }

    function testGenericQuorumVerificationUsesHistoricalSet() public {
        verifier = new MockXGRInterchainBLSVerifier();
        XGRInterchainValidatorRegistryV2 registry = _deploy(FORMAT_COMPRESSED);

        assertTrue(
            registry.verifyQuorum(
                1,
                bytes("xgr-iln-v3.1.3-payload"),
                hex"03",
                _bytes(96, 0x66)
            )
        );

        assertFalse(
            registry.verifyQuorum(
                999,
                bytes("xgr-iln-v3.1.3-payload"),
                hex"03",
                _bytes(96, 0x66)
            )
        );
    }

    function _deploy(uint8 format)
        internal
        returns (XGRInterchainValidatorRegistryV2 registry)
    {
        vm.deal(address(this), 20 ether);
        registry = new XGRInterchainValidatorRegistryV2{value: 3 ether}(
            1643,
            1643,
            address(verifier),
            format,
            1 ether,
            0.1 ether,
            _validators(),
            _keys(48, 1),
            _keys(128, 11),
            _keys(format == FORMAT_COMPRESSED ? 96 : 256, 21)
        );
    }

    function _validators() internal pure returns (address[] memory validators) {
        validators = new address[](3);
        validators[0] = A;
        validators[1] = B;
        validators[2] = C;
    }

    function _keys(uint256 length, uint8 start)
        internal
        pure
        returns (bytes[] memory out)
    {
        out = new bytes[](3);
        for (uint256 i = 0; i < 3; i++) {
            out[i] = _bytes(length, start + uint8(i));
        }
    }

    function _bytes(uint256 length, uint8 value)
        internal
        pure
        returns (bytes memory out)
    {
        out = new bytes(length);
        for (uint256 i = 0; i < length; i++) out[i] = bytes1(value);
    }
}
