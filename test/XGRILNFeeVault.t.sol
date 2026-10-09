// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {XGRILNFeeVault} from "../contracts/XGRILNFeeVault.sol";
import {MockLocalGovernanceRegistry} from "../contracts/test/MockLocalGovernanceRegistry.sol";

/// @dev Intentionally incomplete to prove new XETA vaults fail closed.
contract IncompleteValidatorRegistry {
    function getValidatorSet() external pure returns (
        address[] memory validators, bytes[] memory keys, uint64 setId
    ) {
        validators = new address[](1);
        keys = new bytes[](1);
        validators[0] = address(0x101);
        setId = 1;
    }
}

contract XGRILNFeeVaultTest is Test {
    MockLocalGovernanceRegistry internal registry;
    XGRILNFeeVault internal vault;
    address internal constant GATEWAY = address(0xABCD);
    address internal constant A = address(0x101);
    address internal constant B = address(0x202);
    address internal constant C = address(0x303);
    bytes32 internal constant ROUTE = bytes32(uint256(0x1234));
    bytes32 internal constant MESSAGE_1 = bytes32(uint256(11));
    bytes32 internal constant MESSAGE_2 = bytes32(uint256(12));

    function setUp() public {
        vm.deal(GATEWAY, 10 ether);
        registry = new MockLocalGovernanceRegistry(1643);
        vault = new XGRILNFeeVault(address(registry), GATEWAY, ROUTE, 8453);
    }

    function _snapshot(uint64 setId, uint64 nonce, address[] memory list) internal {
        registry.setMembers(list);
    }

    function _members(address x, address y) internal pure returns (address[] memory list) {
        list = new address[](2);
        list[0] = x;
        list[1] = y;
    }

    function testEqualSplitAndHistoricalWithdrawalAfterSetRotation() public {
        _snapshot(1, 1, _members(A, B));
        vm.prank(GATEWAY);
        vault.allocate{value: 11}(MESSAGE_1);
        assertEq(vault.claimable(A), 6);
        assertEq(vault.claimable(B), 5);

        _snapshot(2, 2, _members(B, C));
        vm.prank(GATEWAY);
        vault.allocate{value: 10}(MESSAGE_2);

        assertEq(vault.claimable(A), 6);
        assertEq(vault.claimable(B), 10);
        assertEq(vault.claimable(C), 5);
        vm.prank(A);
        vault.claim();
        assertEq(A.balance, 6);
        assertEq(vault.claimable(A), 0);
        assertEq(vault.totalAllocatedWei(), 21);
        assertEq(vault.totalClaimedWei(), 6);
    }

    function testCannotAllocateOperationTwiceOrFromUntrustedCaller() public {
        _snapshot(1, 1, _members(A, B));
        vm.expectRevert(XGRILNFeeVault.UnauthorizedGateway.selector);
        vault.allocate{value: 1}(MESSAGE_1);
        vm.prank(GATEWAY);
        vault.allocate{value: 2}(MESSAGE_1);
        vm.prank(GATEWAY);
        vm.expectRevert(XGRILNFeeVault.InvalidOperation.selector);
        vault.allocate{value: 2}(MESSAGE_1);
    }

    function testReadsLiveLocalRegistryWithoutSeparateGovernanceQuorum() public {
        _snapshot(1, 1, _members(A, B));
        assertEq(vault.recipientCount(), 2);
        _snapshot(2, 2, _members(B, C));
        assertEq(vault.recipientCount(), 2);
    }

    function testRejectsIncompleteValidatorRegistryWithoutV2FeeGetter() public {
        IncompleteValidatorRegistry incomplete = new IncompleteValidatorRegistry();
        XGRILNFeeVault separateVault = new XGRILNFeeVault(
            address(incomplete), GATEWAY, ROUTE, 8453
        );
        vm.expectRevert();
        separateVault.recipientCount();
        vm.prank(GATEWAY);
        vm.expectRevert();
        separateVault.allocate{value: 1}(MESSAGE_1);
    }

    function testClaimCannotBeRepeated() public {
        _snapshot(1, 1, _members(A, B));
        vm.prank(GATEWAY);
        vault.allocate{value: 4}(MESSAGE_1);
        vm.prank(A);
        vault.claim();
        vm.prank(A);
        vm.expectRevert(XGRILNFeeVault.NothingToClaim.selector);
        vault.claim();
    }
}
