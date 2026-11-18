// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {XGRInterchainECDSAVerifier} from "../contracts/XGRInterchainECDSAVerifier.sol";
import {XGRInterchainECDSAValidatorRegistryV5} from "../contracts/XGRInterchainECDSAValidatorRegistryV5.sol";
import {XITADirectECDSAISM} from "../contracts/XITADirectECDSAISM.sol";

contract XDCValidatorRegistryV5Test is Test {
    uint256 constant K1 = 0x101;
    uint256 constant K2 = 0x202;
    uint256 constant K3 = 0x303;
    uint256 constant K4 = 0x404;
    uint256 constant RESERVE = 0.01 ether;
    uint256 constant MIN_RESERVE = 0.005 ether;
    uint256 constant MAX_REIMBURSE = 0.002 ether;

    XGRInterchainECDSAVerifier engine;
    XGRInterchainECDSAValidatorRegistryV5 registry;
    XITADirectECDSAISM ism;

    function _sig(uint256 key, bytes memory payload) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, keccak256(payload));
        return abi.encodePacked(r, s, v);
    }

    function _quorum(bytes memory payload) internal returns (bytes memory) {
        return bytes.concat(_sig(K1, payload), _sig(K2, payload));
    }

    function setUp() public {
        vm.chainId(50);
        vm.deal(address(this), 10 ether);
        engine = new XGRInterchainECDSAVerifier();
        address[] memory validators = new address[](3);
        bytes[] memory proofs = new bytes[](3);
        uint256[3] memory keys = [K1, K2, K3];
        for (uint256 i; i < 3; i++) {
            validators[i] = vm.addr(keys[i]);
            proofs[i] = _sig(
                keys[i],
                abi.encodePacked(
                    "XITA_ECDSA_BOOTSTRAP_V2", bytes8(uint64(1643)),
                    bytes4(uint32(50)), bytes20(validators[i])
                )
            );
        }
        registry = new XGRInterchainECDSAValidatorRegistryV5{value:3*RESERVE}(
            1643, 50, address(engine), MIN_RESERVE, MAX_REIMBURSE,
            validators, proofs
        );
        ism = new XITADirectECDSAISM(address(registry));
    }

    function _transition(uint8 action, address validator)
        internal view returns (XGRInterchainECDSAValidatorRegistryV5.MembershipTransition memory)
    {
        return XGRInterchainECDSAValidatorRegistryV5.MembershipTransition({
            expectedSetId: registry.setId(),
            validUntil: uint64(block.timestamp + 5 minutes),
            action: action,
            validator: validator
        });
    }

    function _prove(uint256 key) internal {
        address v = vm.addr(key);
        bytes memory proof = _sig(key, registry.encodePossessionPayload(v));
        registry.provePossession(v, proof);
    }

    function testExplicitFundedGenesisAndDestinationMembership() public {
        assertEq(registry.setId(), 1);
        assertEq(registry.quorumThreshold(), 2);
        assertEq(registry.minimumDeactivationReserveWei(), MIN_RESERVE);
        assertEq(registry.maxExecutorReimbursementWei(), MAX_REIMBURSE);
        assertEq(address(registry).balance, 3*RESERVE);
        (bool active, bytes memory publicKey, uint256 reserve) = registry.getValidator(vm.addr(K1));
        assertTrue(active);
        assertEq(publicKey, abi.encodePacked(vm.addr(K1)));
        assertEq(reserve, RESERVE);
        (address[] memory selected, uint64 epoch) = registry.getFeeRecipients();
        assertEq(selected.length, 3);
        assertEq(epoch, 1);
        assertEq(selected[0], vm.addr(K1));
        assertEq(selected[1], vm.addr(K2));
        assertEq(selected[2], vm.addr(K3));
        assertEq(registry.registryVersion(), 5);
        assertEq(registry.verifierKeyFormat(), 3);
        assertEq(ism.destinationDomain(), 50);
    }

    function testGenesisRejectsNonexistentOrDuplicateProof() public {
        address[] memory validators = new address[](3);
        bytes[] memory proofs = new bytes[](3);
        for (uint256 i; i < 3; ++i) validators[i] = vm.addr(K1);
        for (uint256 i; i < 3; ++i)
            proofs[i] = _sig(K1, registry.encodeBootstrapPayload(1643, 50, validators[i]));
        vm.expectRevert(XGRInterchainECDSAValidatorRegistryV5.InvalidBootstrap.selector);
        new XGRInterchainECDSAValidatorRegistryV5{value:3*RESERVE}(
            1643, 50, address(engine), MIN_RESERVE, MAX_REIMBURSE, validators, proofs
        );
    }

    function testAddNeedsProofQuorumAndReserve() public {
        address newcomer = vm.addr(K4);
        XGRInterchainECDSAValidatorRegistryV5.MembershipTransition memory t = _transition(1, newcomer);
        bytes memory approval = _quorum(registry.encodeMembershipPayload(t));
        vm.expectRevert(XGRInterchainECDSAValidatorRegistryV5.InvalidTransition.selector);
        registry.applyMembership{value:RESERVE}(t, hex"03", approval);
        _prove(K4);
        vm.expectRevert(
            abi.encodeWithSelector(
                XGRInterchainECDSAValidatorRegistryV5.InsufficientReserve.selector,
                MIN_RESERVE, 1
            )
        );
        registry.applyMembership{value:1}(t, hex"03", approval);
        bytes memory single = _sig(K1, registry.encodeMembershipPayload(t));
        vm.expectRevert(XGRInterchainECDSAValidatorRegistryV5.InsufficientQuorum.selector);
        registry.applyMembership{value:RESERVE}(t, hex"01", single);
        registry.applyMembership{value:RESERVE}(t, hex"03", approval);
        (bool active, uint64 epoch) = registry.getValidatorStatus(newcomer);
        assertTrue(active);
        assertEq(epoch, 2);
        assertEq(registry.quorumThreshold(), 3); // ceil(2*4/3)
        (uint256 index, uint256 count) = registry.getFeeRecipientIndexForSet(1, newcomer);
        assertEq(index, 0);
        assertEq(count, 3);
        vm.expectRevert(XGRInterchainECDSAValidatorRegistryV5.StaleSetId.selector);
        registry.applyMembership{value:RESERVE}(t, hex"03", approval);
    }

    function testRemoveReimbursesExecutorAndRefundsValidator() public {
        XGRInterchainECDSAValidatorRegistryV5.MembershipTransition memory t =
            _transition(2, vm.addr(K3));
        bytes memory approvals = _quorum(registry.encodeMembershipPayload(t));
        vm.txGasPrice(1 gwei);
        address executor = vm.addr(K4);
        vm.prank(executor);
        registry.applyMembership(t, hex"03", approvals);
        (bool active,) = registry.getValidatorStatus(vm.addr(K3));
        assertFalse(active);
        assertEq(registry.setId(), 2);
        uint256 executorCredit = registry.claimableWei(executor);
        uint256 validatorCredit = registry.claimableWei(vm.addr(K3));
        assertGt(executorCredit, 0);
        assertLe(executorCredit, MAX_REIMBURSE);
        assertEq(executorCredit + validatorCredit, RESERVE);
        uint256 executorBalance = executor.balance;
        vm.prank(executor);
        registry.claim();
        assertEq(executor.balance, executorBalance + executorCredit);
        vm.prank(vm.addr(K3));
        registry.claim();
        assertEq(registry.claimableWei(vm.addr(K3)), 0);
        (uint256 oldIndex,uint256 oldCount) = registry.getFeeRecipientIndexForSet(1, vm.addr(K3));
        assertEq(oldIndex, 3);
        assertEq(oldCount, 3);
    }

    function testReserveTopupAndHistoricalRecipientSnapshots() public {
        address v = vm.addr(K2);
        vm.deal(v, 2 ether);
        vm.prank(v);
        (bool ok,) = address(registry).call{value:RESERVE}("");
        assertTrue(ok);
        (bool active, , uint256 reserve) = registry.getValidator(v);
        assertTrue(active);
        assertEq(reserve, 2*RESERVE);
        XGRInterchainECDSAValidatorRegistryV5.MembershipTransition memory t =
            _transition(2, vm.addr(K3));
        registry.applyMembership(t, hex"03", _quorum(registry.encodeMembershipPayload(t)));
        (uint256 historicalIndex, uint256 historicalCount) =
            registry.getFeeRecipientIndexForSet(1, vm.addr(K3));
        assertEq(historicalIndex, 3);
        assertEq(historicalCount, 3);
        (uint256 currentIndex, uint256 currentCount) =
            registry.getFeeRecipientIndexForSet(2, vm.addr(K3));
        assertEq(currentIndex, 0);
        assertEq(currentCount, 2);
    }

    function testQuorumAndReplayProtectionAreChainRegistryAndEpochBound() public {
        bytes memory payload = abi.encodePacked("XITA_V5_TEST", bytes32(uint256(44)));
        bytes memory signatures = _quorum(payload);
        assertTrue(registry.verifyQuorum(1, payload, hex"03", signatures));
        assertFalse(registry.verifyQuorum(1, payload, hex"01", _sig(K1, payload)));
        assertFalse(registry.verifyQuorum(1, payload, hex"83", signatures));
        assertFalse(registry.verifyQuorum(1, abi.encodePacked(payload, bytes1(0xff)), hex"03", signatures));
        XGRInterchainECDSAValidatorRegistryV5.MembershipTransition memory t =
            _transition(2, vm.addr(K3));
        vm.expectRevert(XGRInterchainECDSAValidatorRegistryV5.InsufficientQuorum.selector);
        registry.applyMembership(t, hex"03", _quorum(abi.encodePacked("not-the-membership-payload")));
    }
}
