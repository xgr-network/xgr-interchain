// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {XITAExecutionGateway} from "../contracts/XITAExecutionGateway.sol";
import {ILNGateway} from "../contracts/ILNGateway.sol";
import {IXGRILNRegistry} from "../contracts/IXGRILNRegistry.sol";
import {MockILNWarpRouter} from "../contracts/test/MockILNWarpRouter.sol";
import {MockILNNativeWarpRouter} from "../contracts/test/MockILNNativeWarpRouter.sol";
import {MockXGRILNRegistry} from "../contracts/test/MockXGRILNRegistry.sol";

contract XITAExecutionGatewayTest is Test {
    uint256 internal constant RELAYER_KEY = 0xB0B;
    uint256 internal constant UNAUTHORIZED_KEY = 0xBAD;
    uint32 internal constant TARGET = 8453;
    uint256 internal constant AMOUNT = 1 ether;
    uint256 internal constant FEE = 0.002 ether;
    bytes32 internal constant ROUTE = bytes32(uint256(0xAFFE));
    bytes32 internal constant RECIPIENT = bytes32(uint256(uint160(address(0xCAFE))));
    address internal constant USER = address(0xBEEF);
    address internal relayer;
    XITAExecutionGateway internal managed;
    MockXGRILNRegistry internal registry;
    ILNGateway internal gateway;
    MockILNWarpRouter internal tokenRouter;
    MockILNNativeWarpRouter internal nativeRouter;

    function setUp() public {
        relayer = vm.addr(RELAYER_KEY);
        vm.deal(USER, 20 ether);
        registry = new MockXGRILNRegistry();
        tokenRouter = new MockILNWarpRouter();
        gateway = new ILNGateway(address(registry), ROUTE, TARGET, address(tokenRouter), false);
        registry.setRoute(TARGET, ROUTE, _route(address(gateway), address(tokenRouter)));
        managed = new XITAExecutionGateway(address(registry), relayer);
        tokenRouter.mint(USER, 10 ether);
        vm.prank(USER);
        tokenRouter.approve(address(managed), type(uint256).max);
    }

    function _route(address registeredGateway, address registeredRouter)
        internal view returns (IXGRILNRegistry.RouteRecord memory r)
    {
        r = IXGRILNRegistry.RouteRecord({
            sourceChainId: uint64(block.chainid),
            sourceDomain: 1643,
            gateway: registeredGateway,
            sourceRouter: registeredRouter,
            mailbox: address(0x1111),
            merkleTreeHook: address(0x2222),
            destinationRouter: address(0x3333),
            validatorFeeWei: 1,
            enabled: true
        });
    }

    function _quote(uint256 nonce) internal view returns (XITAExecutionGateway.Quote memory q) {
        (,,uint256 bridgeValue,) = gateway.quoteILN(TARGET, RECIPIENT, AMOUNT);
        q = XITAExecutionGateway.Quote({
            payer: USER,
            gateway: address(gateway),
            routeId: ROUTE,
            destinationDomain: TARGET,
            recipient: RECIPIENT,
            amount: AMOUNT,
            bridgeValueWei: bridgeValue,
            relayerFeeWei: FEE,
            nonce: nonce,
            deadline: uint64(block.timestamp + 120)
        });
    }

    function _signature(XITAExecutionGateway.Quote memory q, uint256 privateKey)
        internal view returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, managed.quoteDigest(q));
        return abi.encodePacked(r,s,v);
    }

    function _execute(XITAExecutionGateway.Quote memory q) internal returns (bytes32 messageId) {
        bytes memory signature = _signature(q, RELAYER_KEY);
        vm.prank(USER);
        return managed.execute{value: q.bridgeValueWei + q.relayerFeeWei}(q, signature);
    }

    function _mustRevert(
        XITAExecutionGateway.Quote memory q,
        bytes memory signature,
        uint256 value,
        bytes4 selector
    ) internal {
        vm.expectRevert(selector);
        vm.prank(USER);
        managed.execute{value:value}(q,signature);
    }

    function _mustRevertAny(
        XITAExecutionGateway.Quote memory q,
        bytes memory signature,
        uint256 value
    ) internal {
        vm.expectRevert();
        vm.prank(USER);
        managed.execute{value:value}(q,signature);
    }

    function testAtomicERC20DispatchNativeFeeVaultAndOwnerPayout() public {
        XITAExecutionGateway.Quote memory q = _quote(5);
        bytes32 message = _execute(q);
        assertTrue(message != bytes32(0));
        assertEq(tokenRouter.balanceOf(USER), 9 ether);
        assertEq(address(gateway.feeVault()).balance, 1);
        assertEq(address(gateway).balance, 0);
        assertEq(address(managed).balance, FEE);
        assertEq(managed.pendingServiceFeesWei(), FEE);
        assertTrue(managed.nonceUsed(USER, q.nonce));
        (address payer, address targetGateway, uint256 amount, bool exists, bool withdrawn) =
            managed.feeReceipt(message);
        assertEq(payer, USER);
        assertEq(targetGateway, address(gateway));
        assertEq(amount, FEE);
        assertTrue(exists);
        assertFalse(withdrawn);
        assertEq(tokenRouter.allowance(address(managed), address(gateway)), 0);

        uint256 beforeBalance = relayer.balance;
        vm.prank(relayer);
        managed.withdrawFee(message);
        assertEq(relayer.balance - beforeBalance, FEE);
        assertEq(address(managed).balance, 0);
        assertEq(managed.pendingServiceFeesWei(), 0);
        vm.expectRevert(XITAExecutionGateway.NoClaimableFee.selector);
        vm.prank(relayer);
        managed.withdrawFee(message);
    }

    function testUnauthorizedUserCannotTakeManagedServiceFees() public {
        bytes32 message = _execute(_quote(8));
        vm.expectRevert(XITAExecutionGateway.UnauthorizedRelayer.selector);
        vm.prank(USER);
        managed.withdrawFee(message);
        assertEq(address(managed).balance, FEE);
    }

    function testDifferentSignerOrTamperedFeeCannotStartBridge() public {
        XITAExecutionGateway.Quote memory q = _quote(21);
        bytes memory signature = _signature(q, RELAYER_KEY);
        q.relayerFeeWei += 1;
        _mustRevert(q,signature,q.bridgeValueWei + q.relayerFeeWei,
            XITAExecutionGateway.InvalidSignature.selector);
        q = _quote(22);
        _mustRevert(q,_signature(q,UNAUTHORIZED_KEY),
            q.bridgeValueWei + q.relayerFeeWei,
            XITAExecutionGateway.InvalidSignature.selector);
        assertEq(tokenRouter.balanceOf(USER), 10 ether);
    }

    function testWrongNativeValueCannotProduceMessageOrFeeReceipt() public {
        XITAExecutionGateway.Quote memory q = _quote(7);
        _mustRevert(q,_signature(q, RELAYER_KEY),q.bridgeValueWei,
            XITAExecutionGateway.InvalidBridgeValue.selector);
        assertFalse(managed.nonceUsed(USER, q.nonce));
        assertEq(tokenRouter.balanceOf(USER), 10 ether);
    }

    function testSourceBridgePriceChangeFailsClosedWithoutConsumingNonce() public {
        XITAExecutionGateway.Quote memory q = _quote(9);
        tokenRouter.nativeFeeWei();
        tokenRouter.setSyntheticQuoteAmount(AMOUNT + 1); // makes current quote invalid
        _mustRevertAny(q,_signature(q,RELAYER_KEY),
            q.bridgeValueWei + q.relayerFeeWei);
        assertFalse(managed.nonceUsed(USER, q.nonce));
        assertEq(managed.pendingServiceFeesWei(), 0);
        assertEq(tokenRouter.balanceOf(USER), 10 ether);
    }

    function testExpiredQuoteAndFarFutureQuoteFailClosed() public {
        XITAExecutionGateway.Quote memory q = _quote(12);
        bytes memory signed = _signature(q, RELAYER_KEY);
        vm.warp(uint256(q.deadline) + 1);
        _mustRevert(q,signed,q.bridgeValueWei + q.relayerFeeWei,
            XITAExecutionGateway.QuoteExpired.selector);
        q = _quote(13);
        q.deadline = uint64(block.timestamp + 301);
        _mustRevert(q,_signature(q,RELAYER_KEY),
            q.bridgeValueWei + q.relayerFeeWei,
            XITAExecutionGateway.QuoteExpired.selector);
    }

    function testNonceReplayAndCrossAdapterSignatureAreRejected() public {
        XITAExecutionGateway.Quote memory q = _quote(14);
        _execute(q);
        _mustRevert(q,_signature(q,RELAYER_KEY),
            q.bridgeValueWei + q.relayerFeeWei,
            XITAExecutionGateway.QuoteNonceUsed.selector);
        XITAExecutionGateway other = new XITAExecutionGateway(address(registry), relayer);
        bytes memory crossSignature = _signature(q, RELAYER_KEY);
        vm.expectRevert(XITAExecutionGateway.InvalidSignature.selector);
        vm.prank(USER);
        other.execute{value:q.bridgeValueWei + q.relayerFeeWei}(q,crossSignature);
    }

    function testFakeOrDisabledGatewayFailsWithoutAcceptingServiceFee() public {
        XITAExecutionGateway.Quote memory q = _quote(16);
        registry.setRoute(TARGET,ROUTE,_route(address(0x9999),address(tokenRouter)));
        _mustRevert(q,_signature(q,RELAYER_KEY),
            q.bridgeValueWei + q.relayerFeeWei,
            XITAExecutionGateway.InvalidRegisteredRoute.selector);
        assertEq(managed.pendingServiceFeesWei(), 0);
    }

    function testNativeSourcePrincipalAndServiceFeesRemainSeparated() public {
        nativeRouter = new MockILNNativeWarpRouter();
        bytes32 nativeRoute = bytes32(uint256(0xACDC));
        ILNGateway nativeGateway = new ILNGateway(
            address(registry), nativeRoute, TARGET, address(nativeRouter), false
        );
        registry.setRoute(TARGET,nativeRoute,_route(address(nativeGateway),address(nativeRouter)));
        (,,uint256 bridgeValue, uint256 tokenAmount) =
            nativeGateway.quoteILN(TARGET, RECIPIENT, AMOUNT);
        assertEq(tokenAmount, 0);
        XITAExecutionGateway.Quote memory q = XITAExecutionGateway.Quote({
            payer: USER, gateway: address(nativeGateway), routeId: nativeRoute,
            destinationDomain: TARGET, recipient:RECIPIENT, amount:AMOUNT,
            bridgeValueWei:bridgeValue, relayerFeeWei:FEE, nonce:99,
            deadline:uint64(block.timestamp + 120)
        });
        bytes memory nativeSignature = _signature(q,RELAYER_KEY);
        vm.prank(USER);
        bytes32 message = managed.execute{value:bridgeValue + FEE}(q,nativeSignature);
        assertTrue(message != bytes32(0));
        assertEq(nativeRouter.lockedWei(), AMOUNT);
        assertEq(address(nativeGateway.feeVault()).balance, 1);
        assertEq(address(managed).balance, FEE);
    }

    function testOnlySourceNativeCurrencyIsAcceptedForServiceFees() public {
        XITAExecutionGateway.Quote memory q = _quote(123);
        assertEq(q.relayerFeeWei, FEE);
        assertEq(address(managed).balance, 0);
        bytes32 message = _execute(q);
        (,, uint256 escrowed,,) = managed.feeReceipt(message);
        assertEq(escrowed, FEE);
        assertEq(tokenRouter.balanceOf(USER), 9 ether);
        assertEq(address(managed).balance, FEE);
    }

    function testTwoDifferentMessagesAccrueSeparatelyWithNoDoubleWithdrawal() public {
        bytes32 first = _execute(_quote(700));
        bytes32 second = _execute(_quote(701));
        assertTrue(first != second);
        assertEq(managed.pendingServiceFeesWei(), 2*FEE);
        vm.prank(relayer);
        managed.withdrawFee(first);
        assertEq(managed.pendingServiceFeesWei(), FEE);
        vm.prank(relayer);
        managed.withdrawFee(second);
        assertEq(managed.pendingServiceFeesWei(), 0);
    }
}
