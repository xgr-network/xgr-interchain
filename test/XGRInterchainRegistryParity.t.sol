// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {XGRInterchainRegistryCore} from "../contracts/XGRInterchainRegistryCore.sol";
import {XGRInterchainValidatorRegistryV3} from "../contracts/XGRInterchainValidatorRegistryV3.sol";
import {XGRInterchainECDSAValidatorRegistryV5} from "../contracts/XGRInterchainECDSAValidatorRegistryV5.sol";
import {XGRInterchainECDSAVerifier} from "../contracts/XGRInterchainECDSAVerifier.sol";
import {MockXGRInterchainBLSVerifier} from "../contracts/test/MockXGRInterchainBLSVerifier.sol";

/// @notice Differential lifecycle tests: BLS V3 remains the policy reference.
contract XGRInterchainRegistryParityTest is Test {
    uint256 constant RESERVE = 0.8 ether;
    uint256 constant MINIMUM = 0.4 ether;
    uint256 constant REIMBURSEMENT = 0.08 ether;
    XGRInterchainValidatorRegistryV3 bls;
    XGRInterchainECDSAValidatorRegistryV5 ecdsa;

    function _bytes(uint256 length, uint8 value) internal pure returns (bytes memory result) {
        result = new bytes(length);
        for (uint256 i; i < length; ++i) result[i] = bytes1(value);
    }

    function _signature(uint256 key, bytes memory payload) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, keccak256(payload));
        return abi.encodePacked(r, s, v);
    }

    function setUp() public {
        vm.chainId(50);
        vm.deal(address(this), 30 ether);
        vm.warp(1000);
        address[] memory validators = new address[](3);
        bytes[] memory compressed = new bytes[](3);
        bytes[] memory uncompressed = new bytes[](3);
        bytes[] memory blsProofs = new bytes[](3);
        bytes[] memory ecdsaProofs = new bytes[](3);
        for (uint256 i; i < 3; ++i) {
            uint256 key = 0x101 + i;
            validators[i] = vm.addr(key);
            compressed[i] = _bytes(48, uint8(i + 1));
            uncompressed[i] = _bytes(128, uint8(i + 1));
            blsProofs[i] = _bytes(96, 1);
            ecdsaProofs[i] = _signature(key, abi.encodePacked(
                "XITA_ECDSA_BOOTSTRAP_V2", bytes8(uint64(1643)),
                bytes4(uint32(50)), bytes20(validators[i])
            ));
        }
        bls = new XGRInterchainValidatorRegistryV3{value:3 * RESERVE}(
            1643, 50, address(new MockXGRInterchainBLSVerifier()), 1,
            MINIMUM, REIMBURSEMENT, validators, compressed, uncompressed, blsProofs
        );
        ecdsa = new XGRInterchainECDSAValidatorRegistryV5{value:3 * RESERVE}(
            1643, 50, address(new XGRInterchainECDSAVerifier()),
            MINIMUM, REIMBURSEMENT, validators, ecdsaProofs
        );
    }

    function testGenesisLifecycleAndSnapshotsMatch() public view {
        assertEq(bls.setId(), ecdsa.setId());
        assertEq(bls.quorumThreshold(), ecdsa.quorumThreshold());
        assertEq(address(bls).balance, address(ecdsa).balance);
        (address[] memory a, uint64 aId) = bls.getFeeRecipients();
        (address[] memory b, uint64 bId) = ecdsa.getFeeRecipients();
        assertEq(a, b);
        assertEq(aId, bId);
        for (uint256 i; i < a.length; ++i) {
            (bool activeA,,uint256 reserveA) = bls.getValidator(a[i]);
            (bool activeB,,uint256 reserveB) = ecdsa.getValidator(a[i]);
            assertEq(activeA, activeB);
            assertEq(reserveA, reserveB);
        }
        (address[] memory oldA,,) = bls.getValidatorSetForVerification(1);
        (address[] memory oldB,,) = ecdsa.getValidatorSetForVerification(1);
        assertEq(oldA, oldB);
    }

    function testBLSWirePayloadIsUnchanged() public view {
        address candidate = address(0x456);
        bytes memory compressed = _bytes(48, 0x22);
        bytes memory uncompressed = _bytes(128, 0x33);
        bytes memory expected = abi.encodePacked(
            "XGR_INTERCHAIN_V2", bytes8(uint64(1643)), bytes4(uint32(50)),
            bytes8(uint64(1)), bytes8(uint64(1300)), bytes1(uint8(1)),
            bytes20(candidate), bytes2(uint16(48)), compressed,
            bytes2(uint16(128)), uncompressed
        );
        assertEq(bls.encodeMembershipPayload(1643,50,1,1300,1,candidate,compressed,uncompressed),expected);
    }

    function testBothAdaptersRejectExpiredMembership() public {
        uint64 expired = uint64(block.timestamp - 1);
        XGRInterchainValidatorRegistryV3.MembershipTransition memory b =
            XGRInterchainValidatorRegistryV3.MembershipTransition(
                1, expired, 1, address(0x456), _bytes(48,1), _bytes(128,1)
            );
        XGRInterchainECDSAValidatorRegistryV5.MembershipTransition memory e =
            XGRInterchainECDSAValidatorRegistryV5.MembershipTransition(
                1, expired, 1, address(0x456)
            );
        vm.expectRevert(XGRInterchainRegistryCore.InvalidTransition.selector);
        bls.applyMembership{value:RESERVE}(b, hex"03", _bytes(96,1));
        vm.expectRevert(XGRInterchainRegistryCore.InvalidTransition.selector);
        ecdsa.applyMembership{value:RESERVE}(e, hex"03", _bytes(130,1));
    }
}
