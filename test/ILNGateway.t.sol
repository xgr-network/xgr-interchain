// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ILNGateway} from "../contracts/ILNGateway.sol";
import {XGRILNFeeVault} from "../contracts/XGRILNFeeVault.sol";
import {IXGRILNRegistry} from "../contracts/IXGRILNRegistry.sol";
import {MockILNWarpRouter} from "../contracts/test/MockILNWarpRouter.sol";
import {MockXGRILNRegistry} from "../contracts/test/MockXGRILNRegistry.sol";

contract ILNGatewayTest is Test {
    ILNGateway internal gateway;
    MockILNWarpRouter internal router;
    MockXGRILNRegistry internal registry;

    uint32 internal constant SOURCE_DOMAIN = 8453;
    uint32 internal constant DESTINATION_DOMAIN = 1643;
    bytes32 internal constant ROUTE_ID =
        0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa;
    address internal constant MAILBOX =
        0x3333333333333333333333333333333333333333;
    address internal constant HOOK =
        0x4444444444444444444444444444444444444444;
    address internal constant DEST_ROUTER =
        0x5555555555555555555555555555555555555555;
    address internal constant USER = address(0xBEEF);

    function setUp() public {
        vm.deal(USER, 10 ether);

        router = new MockILNWarpRouter();
        registry = new MockXGRILNRegistry();
        gateway = new ILNGateway(
            address(registry),
            ROUTE_ID,
            DESTINATION_DOMAIN,
            address(router),
            false
        );

        registry.setRoute(
            DESTINATION_DOMAIN,
            ROUTE_ID,
            IXGRILNRegistry.RouteRecord({
                sourceChainId: uint64(block.chainid),
                sourceDomain: SOURCE_DOMAIN,
                gateway: address(gateway),
                sourceRouter: address(router),
                mailbox: MAILBOX,
                merkleTreeHook: HOOK,
                destinationRouter: DEST_ROUTER,
                validatorFeeWei: 1,
                enabled: true
            })
        );

        router.mint(USER, 10 ether);
        vm.prank(USER);
        router.approve(address(gateway), type(uint256).max);
    }

    function testGatewayUsesSharedCanonicalRegistry() public view {
        assertEq(address(gateway.ilnRegistry()), address(registry));
        assertEq(gateway.routeId(), ROUTE_ID);
        assertEq(gateway.mailbox(), MAILBOX);
        assertEq(gateway.merkleTreeHook(), HOOK);
        assertEq(gateway.destinationRouter(), DEST_ROUTER);
        assertEq(gateway.validatorFeeWei(), 1);
    }

    function testSyntheticBridgeEscrowsCanonicalRouteFee() public {
        uint256 amount = 1 ether;
        bytes32 recipient =
            bytes32(uint256(uint160(address(0xCAFE))));

        (
            uint256 validatorFee,
            uint256 routerNativeValue,
            uint256 totalNative,
            uint256 totalToken
        ) = gateway.quoteILN(
            DESTINATION_DOMAIN,
            recipient,
            amount
        );

        assertEq(validatorFee, 1);
        assertEq(routerNativeValue, 0.01 ether);
        assertEq(totalNative, 0.01 ether + 1);
        assertEq(totalToken, amount);

        vm.prank(USER);
        bytes32 messageId =
            gateway.bridge{value: totalNative}(
                DESTINATION_DOMAIN,
                recipient,
                amount
            );

        assertTrue(messageId != bytes32(0));
        assertEq(router.balanceOf(USER), 9 ether);
        assertEq(address(gateway).balance, 0);
        assertEq(address(gateway.feeVault()).balance, validatorFee);
        assertEq(
            gateway.totalValidatorFeesEscrowedWei(),
            validatorFee
        );
    }


    function testBridgeAtomicallyCreditsVaultAndFormerValidatorCanClaim() public {
        bytes32 recipient = bytes32(uint256(uint160(address(0xCAFE))));
        (,, uint256 totalNative,) = gateway.quoteILN(DESTINATION_DOMAIN, recipient, 1 ether);
        vm.prank(USER);
        bytes32 messageId = gateway.bridge{value: totalNative}(DESTINATION_DOMAIN, recipient, 1 ether);
        assertTrue(gateway.feeVault().allocatedOperation(messageId));
        assertEq(address(gateway).balance, 0);
        assertEq(address(gateway.feeVault()).balance, 1);
        assertEq(gateway.feeVault().claimable(address(0x101)), 1);
        assertEq(gateway.feeVault().claimable(address(0x202)), 0);

        address[] memory newerSet = new address[](2);
        newerSet[0] = address(0x202);
        newerSet[1] = address(0x303);
        registry.governanceRegistry().setMembers(newerSet);
        XGRILNFeeVault vault = gateway.feeVault();
        vm.prank(address(0x101));
        vault.claim();
        assertEq(address(0x101).balance, 1);
        assertEq(gateway.feeVault().claimable(address(0x101)), 0);
    }

    function testDisabledRouteRejected() public {
        registry.setRoute(
            DESTINATION_DOMAIN,
            ROUTE_ID,
            IXGRILNRegistry.RouteRecord({
                sourceChainId: uint64(block.chainid),
                sourceDomain: SOURCE_DOMAIN,
                gateway: address(gateway),
                sourceRouter: address(router),
                mailbox: MAILBOX,
                merkleTreeHook: HOOK,
                destinationRouter: DEST_ROUTER,
                validatorFeeWei: 1,
                enabled: false
            })
        );

        vm.expectRevert(ILNGateway.InvalidRoute.selector);
        gateway.quoteILN(
            DESTINATION_DOMAIN,
            bytes32(uint256(uint160(address(0xCAFE)))),
            1 ether
        );
    }

    function testWrongGatewayBindingRejected() public {
        registry.setRoute(
            DESTINATION_DOMAIN,
            ROUTE_ID,
            IXGRILNRegistry.RouteRecord({
                sourceChainId: uint64(block.chainid),
                sourceDomain: SOURCE_DOMAIN,
                gateway: address(0x9999),
                sourceRouter: address(router),
                mailbox: MAILBOX,
                merkleTreeHook: HOOK,
                destinationRouter: DEST_ROUTER,
                validatorFeeWei: 1,
                enabled: true
            })
        );

        vm.expectRevert(ILNGateway.InvalidRoute.selector);
        gateway.validatorFeeWei();
    }
}
