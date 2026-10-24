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
    address internal constant RECOVERY_ADMIN = address(0xA11CE);
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
        managed = new XITAExecutionGateway(address(registry), payable(relayer), RECOVERY_ADMIN);
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
            dispatchHook: address(0x2222),
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
            finalDestinationDomain: TARGET,
            finalRecipient: RECIPIENT,
            onwardRouteId: bytes32(0),
            amount: AMOUNT,
            bridgeValueWei: bridgeValue,
            interchainFeeWei: FEE,
            nonce: nonce,
            issuedAt: uint64(block.timestamp)
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
        return managed.execute{value: q.bridgeValueWei + q.interchainFeeWei}(q, signature);
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

    /// @dev ILN validator fees are mandatory, but the XITA GmbH service is not.
    ///      A wallet can call the PUBLIC route gateway without our UI,
    ///      service signature, fee adapter, sponsor or private relayer.
    function testDirectPermissionlessILNBridgeNeverPaysXITAServiceFee() public {
        (uint256 validatorFee,,uint256 bridgeValue,) = gateway.quoteILN(TARGET, RECIPIENT, AMOUNT);
        assertGt(validatorFee, 0);
        vm.prank(USER);
        tokenRouter.approve(address(gateway), AMOUNT);
        vm.prank(USER);
        bytes32 messageId = gateway.bridge{value:bridgeValue}(TARGET, RECIPIENT, AMOUNT);
        assertTrue(messageId != bytes32(0));
        assertTrue(gateway.feeVault().allocatedOperation(messageId));
        assertEq(address(gateway.feeVault()).balance, validatorFee);
        assertEq(tokenRouter.balanceOf(USER), 9 ether);
        assertEq(managed.pendingInterchainFeesWei(), 0);
        assertEq(address(managed).balance, 0);
        (,,,bool platformReceiptExists) = managed.feeReceipt(messageId);
        assertFalse(platformReceiptExists);
    }

    function testDirectILNBridgeWithoutMandatoryValidatorFeeReverts() public {
        (uint256 validatorFee,,uint256 bridgeValue,) = gateway.quoteILN(TARGET, RECIPIENT, AMOUNT);
        assertGt(validatorFee, 0);
        vm.prank(USER);
        tokenRouter.approve(address(gateway), AMOUNT);
        vm.expectRevert(abi.encodeWithSelector(ILNGateway.InvalidValue.selector, bridgeValue, bridgeValue - validatorFee));
        vm.prank(USER);
        gateway.bridge{value:bridgeValue - validatorFee}(TARGET, RECIPIENT, AMOUNT);
        assertEq(tokenRouter.balanceOf(USER), 10 ether);
        assertEq(address(gateway.feeVault()).balance, 0);
        assertEq(managed.pendingInterchainFeesWei(), 0);
    }

    function testAtomicERC20DispatchNativeFeeVaultAndOwnerPayout() public {
        XITAExecutionGateway.Quote memory q = _quote(5);
        bytes32 message = _execute(q);
        assertTrue(message != bytes32(0));
        assertEq(tokenRouter.balanceOf(USER), 9 ether);
        assertEq(address(gateway.feeVault()).balance, 1);
        assertEq(address(gateway).balance, 0);
        assertEq(address(managed).balance, FEE);
        assertEq(managed.pendingInterchainFeesWei(), FEE);
        assertTrue(managed.nonceUsed(USER, q.nonce));
        (address payer, address targetGateway, uint256 amount, bool exists) =
            managed.feeReceipt(message);
        assertEq(payer, USER);
        assertEq(targetGateway, address(gateway));
        assertEq(amount, FEE);
        assertTrue(exists);
        assertEq(tokenRouter.allowance(address(managed), address(gateway)), 0);

        uint256 beforeBalance = relayer.balance;
        vm.prank(USER); // Claim is permissionless; beneficiary is immutable.
        managed.claimFees();
        assertEq(relayer.balance - beforeBalance, FEE);
        assertEq(address(managed).balance, 0);
        assertEq(managed.pendingInterchainFeesWei(), 0);
        vm.expectRevert(XITAExecutionGateway.NoClaimableFee.selector);
        vm.prank(relayer);
        managed.claimFees();
    }

    function testUnauthorizedUserCannotTakeManagedServiceFees() public {
        bytes32 message = _execute(_quote(8));
        vm.prank(USER);
        managed.claimFees();
        assertEq(relayer.balance, FEE);
        assertEq(address(managed).balance, 0);
    }

    function testDifferentSignerOrTamperedFeeCannotStartBridge() public {
        XITAExecutionGateway.Quote memory q = _quote(21);
        bytes memory signature = _signature(q, RELAYER_KEY);
        q.interchainFeeWei += 1;
        _mustRevert(q,signature,q.bridgeValueWei + q.interchainFeeWei,
            XITAExecutionGateway.InvalidSignature.selector);
        q = _quote(22);
        _mustRevert(q,_signature(q,UNAUTHORIZED_KEY),
            q.bridgeValueWei + q.interchainFeeWei,
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
            q.bridgeValueWei + q.interchainFeeWei);
        assertFalse(managed.nonceUsed(USER, q.nonce));
        assertEq(managed.pendingInterchainFeesWei(), 0);
        assertEq(tokenRouter.balanceOf(USER), 10 ether);
    }

    function testSignedIssueTimeBoundariesAndFutureTimestampsFailClosed() public {
        XITAExecutionGateway.Quote memory atBoundary = _quote(12);
        bytes memory signature = _signature(atBoundary, RELAYER_KEY);
        vm.warp(uint256(atBoundary.issuedAt) + 90);
        _mustRevertAny(atBoundary,bytes(""),atBoundary.bridgeValueWei + atBoundary.interchainFeeWei);
        _execute(atBoundary); // Expiry is inclusive; 90 seconds is still within policy.
        XITAExecutionGateway.Quote memory expired = _quote(13);
        bytes memory expiredSignature = _signature(expired, RELAYER_KEY);
        vm.warp(uint256(expired.issuedAt) + 91);
        _mustRevert(expired,expiredSignature,expired.bridgeValueWei + expired.interchainFeeWei,
            XITAExecutionGateway.QuoteExpired.selector);
        XITAExecutionGateway.Quote memory future = _quote(14);
        future.issuedAt = uint64(block.timestamp + 1);
        _mustRevert(future,_signature(future,RELAYER_KEY),
            future.bridgeValueWei + future.interchainFeeWei,
            XITAExecutionGateway.QuoteExpired.selector);
        future.issuedAt = 0;
        _mustRevert(future,_signature(future,RELAYER_KEY),
            future.bridgeValueWei + future.interchainFeeWei,
            XITAExecutionGateway.QuoteExpired.selector);
    }

    function testOwnerCanAdjustLifetimeButNeverExceedNinetySeconds() public {
        assertEq(managed.quoteLifetimeSeconds(),90);
        assertEq(managed.MAX_QUOTE_LIFETIME(),90);
        vm.expectRevert(XITAExecutionGateway.UnauthorizedRelayer.selector);
        vm.prank(USER);
        managed.setQuoteLifetimeSeconds(30);
        vm.startPrank(RECOVERY_ADMIN);
        vm.expectRevert(XITAExecutionGateway.InvalidQuoteLifetime.selector);
        managed.setQuoteLifetimeSeconds(0);
        vm.expectRevert(XITAExecutionGateway.InvalidQuoteLifetime.selector);
        managed.setQuoteLifetimeSeconds(91);
        managed.setQuoteLifetimeSeconds(30);
        vm.stopPrank();
        assertEq(managed.quoteLifetimeSeconds(),30);
        XITAExecutionGateway.Quote memory q = _quote(31);
        bytes memory signed = _signature(q,RELAYER_KEY);
        vm.warp(uint256(q.issuedAt) + 31);
        _mustRevert(q,signed,q.bridgeValueWei + q.interchainFeeWei,
            XITAExecutionGateway.QuoteExpired.selector);
        vm.prank(RECOVERY_ADMIN);
        managed.setQuoteLifetimeSeconds(90);
        assertEq(managed.quoteLifetimeSeconds(),90);
        _execute(q); // Within the hard 90s bound under the restored policy.
    }

    function testTamperedIssuedAtDoesNotAuthorizeTransfer() public {
        XITAExecutionGateway.Quote memory q = _quote(77);
        bytes memory signed = _signature(q, RELAYER_KEY);
        q.issuedAt += 1; // Future times are always invalid, before signature checks.
        _mustRevert(q,signed,q.bridgeValueWei + q.interchainFeeWei,
            XITAExecutionGateway.QuoteExpired.selector);
        vm.warp(uint256(q.issuedAt) + 1);
        _mustRevert(q,signed,q.bridgeValueWei + q.interchainFeeWei,
            XITAExecutionGateway.InvalidSignature.selector);
    }

    function testNonceReplayAndCrossAdapterSignatureAreRejected() public {
        XITAExecutionGateway.Quote memory q = _quote(14);
        _execute(q);
        _mustRevert(q,_signature(q,RELAYER_KEY),
            q.bridgeValueWei + q.interchainFeeWei,
            XITAExecutionGateway.QuoteNonceUsed.selector);
        XITAExecutionGateway other = new XITAExecutionGateway(address(registry), payable(relayer), RECOVERY_ADMIN);
        bytes memory crossSignature = _signature(q, RELAYER_KEY);
        vm.expectRevert(XITAExecutionGateway.InvalidSignature.selector);
        vm.prank(USER);
        other.execute{value:q.bridgeValueWei + q.interchainFeeWei}(q,crossSignature);
    }

    function testFakeOrDisabledGatewayFailsWithoutAcceptingServiceFee() public {
        XITAExecutionGateway.Quote memory q = _quote(16);
        registry.setRoute(TARGET,ROUTE,_route(address(0x9999),address(tokenRouter)));
        _mustRevert(q,_signature(q,RELAYER_KEY),
            q.bridgeValueWei + q.interchainFeeWei,
            XITAExecutionGateway.InvalidRegisteredRoute.selector);
        assertEq(managed.pendingInterchainFeesWei(), 0);
    }

    function testSignedTwoHopJourneyIdentityCannotBeRetargeted() public {
        XITAExecutionGateway.Quote memory q = _quote(88);
        q.destinationDomain = 1643;
        q.finalDestinationDomain = TARGET;
        q.onwardRouteId = bytes32(uint256(12));
        q.finalRecipient = RECIPIENT;
        bytes memory sig = _signature(q, RELAYER_KEY);
        q.onwardRouteId = bytes32(uint256(13));
        _mustRevert(q,sig,q.bridgeValueWei+q.interchainFeeWei,
            XITAExecutionGateway.InvalidSignature.selector);
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
            destinationDomain: TARGET, recipient:RECIPIENT,
            finalDestinationDomain:TARGET, finalRecipient:RECIPIENT, onwardRouteId:bytes32(0), amount:AMOUNT,
            bridgeValueWei:bridgeValue, interchainFeeWei:FEE, nonce:99,
            issuedAt:uint64(block.timestamp)
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
        assertEq(q.interchainFeeWei, FEE);
        assertEq(address(managed).balance, 0);
        bytes32 message = _execute(q);
        (,, uint256 escrowed,) = managed.feeReceipt(message);
        assertEq(escrowed, FEE);
        assertEq(tokenRouter.balanceOf(USER), 9 ether);
        assertEq(address(managed).balance, FEE);
    }

    function testOneClaimWithdrawsEveryAccruedTransferFee() public {
        bytes32 first = _execute(_quote(920));
        bytes32 second = _execute(_quote(921));
        assertTrue(first != second);
        assertEq(managed.pendingInterchainFeesWei(), 2 * FEE);
        uint256 before = relayer.balance;
        vm.prank(USER); // Permissionless trigger; payout address cannot vary.
        managed.claimFees();
        assertEq(relayer.balance - before, 2 * FEE);
        assertEq(managed.pendingInterchainFeesWei(), 0);
        assertEq(address(managed).balance, 0);
        vm.expectRevert(XITAExecutionGateway.NoClaimableFee.selector);
        managed.claimFees();
    }

    function testServiceWalletSharesQuoteFeeAndSponsorshipAddress() public view {
        assertEq(managed.serviceWallet(), relayer);
        assertEq(managed.relayerOwner(), relayer);
        assertEq(managed.interchainFeeRecipient(), relayer);
        assertEq(managed.owner(), RECOVERY_ADMIN);
    }

    function testOldQuotesRevokedAndOldFeesPaidToNewWallet() public {
        XITAExecutionGateway.Quote memory previous = _quote(700);
        _execute(previous);
        assertEq(managed.pendingInterchainFeesWei(), FEE);
        address nextWallet = vm.addr(0xD00D);
        vm.prank(RECOVERY_ADMIN);
        managed.setServiceWallet(payable(nextWallet));
        assertEq(managed.pendingInterchainFeesWei(), FEE);
        XITAExecutionGateway.Quote memory fresh = _quote(701);
        _mustRevert(fresh, _signature(fresh, RELAYER_KEY),
            fresh.bridgeValueWei + fresh.interchainFeeWei,
            XITAExecutionGateway.InvalidSignature.selector);
        bytes memory freshSignature = _signature(fresh, 0xD00D);
        vm.prank(USER);
        managed.execute{value:fresh.bridgeValueWei + fresh.interchainFeeWei}(
            fresh, freshSignature);
        uint256 beforeWallet = nextWallet.balance;
        vm.prank(USER);
        managed.claimFees();
        assertEq(nextWallet.balance-beforeWallet,2*FEE);
        assertEq(managed.pendingInterchainFeesWei(),0);
    }

    function testOnlyRecoveryAdminCanChangeServiceWallet() public {
        address nextWallet = vm.addr(0xD00D);
        vm.prank(USER);
        vm.expectRevert();
        managed.setServiceWallet(payable(nextWallet));
        vm.prank(relayer);
        vm.expectRevert();
        managed.setServiceWallet(payable(nextWallet));
        vm.prank(RECOVERY_ADMIN);
        managed.setServiceWallet(payable(nextWallet));
        assertEq(managed.serviceWallet(), nextWallet);
        assertEq(managed.relayerOwner(), nextWallet);
        assertEq(managed.interchainFeeRecipient(), nextWallet);
        assertEq(managed.owner(), RECOVERY_ADMIN);
    }

    function testHubOnwardHopEmitsParentAndPreservesSingleFeeReceipt() public {
        vm.chainId(1643);
        registry.setRoute(TARGET,ROUTE,_route(address(gateway),address(tokenRouter)));
        bytes32 parent = bytes32(uint256(0x777));
        uint256 beforeFees = managed.pendingInterchainFeesWei();
        (,,uint256 bridgeWei,) = gateway.quoteILN(TARGET,RECIPIENT,AMOUNT);
        vm.prank(USER);
        bytes32 next = managed.continueJourney{value:bridgeWei}(
            parent,address(gateway),ROUTE,TARGET,RECIPIENT,AMOUNT);
        assertTrue(next != bytes32(0));
        assertTrue(managed.onwardParentUsed(USER,parent));
        assertEq(managed.pendingInterchainFeesWei(),beforeFees);
        assertEq(address(gateway.feeVault()).balance,1);
        assertEq(tokenRouter.balanceOf(USER),9 ether);
        (,,,bool exists) = managed.feeReceipt(next);
        assertFalse(exists); // No second GmbH Interchain Fee.
        vm.expectRevert(XITAExecutionGateway.InvalidQuote.selector);
        vm.prank(USER);
        managed.continueJourney{value:bridgeWei}(
            parent,address(gateway),ROUTE,TARGET,RECIPIENT,AMOUNT);
    }

    function testHubOnwardRejectsWrongRouteAndNeverConsumesParent() public {
        vm.chainId(1643);
        registry.setRoute(TARGET,ROUTE,_route(address(gateway),address(tokenRouter)));
        bytes32 parent = bytes32(uint256(0x778));
        (,,uint256 bridgeWei,) = gateway.quoteILN(TARGET,RECIPIENT,AMOUNT);
        vm.expectRevert(XITAExecutionGateway.InvalidRegisteredRoute.selector);
        vm.prank(USER);
        managed.continueJourney{value:bridgeWei}(
            parent,address(gateway),bytes32(uint256(999)),TARGET,RECIPIENT,AMOUNT);
        assertFalse(managed.onwardParentUsed(USER,parent));
        vm.expectRevert(XITAExecutionGateway.InvalidBridgeValue.selector);
        vm.prank(USER);
        managed.continueJourney{value:bridgeWei-1}(
            parent,address(gateway),ROUTE,TARGET,RECIPIENT,AMOUNT);
        assertFalse(managed.onwardParentUsed(USER,parent));
    }

    function testHubOnwardUnavailableOnAnyOtherSourceChain() public {
        bytes32 parent = bytes32(uint256(0x779));
        vm.expectRevert(XITAExecutionGateway.InvalidQuote.selector);
        vm.prank(USER);
        managed.continueJourney(
            parent,address(gateway),ROUTE,TARGET,RECIPIENT,AMOUNT);
        assertFalse(managed.onwardParentUsed(USER,parent));
    }

    function testNewFeesCanBeClaimedAsTheNextAggregateBalance() public {
        _execute(_quote(700));
        managed.claimFees();
        assertEq(managed.pendingInterchainFeesWei(), 0);
        _execute(_quote(701));
        assertEq(managed.pendingInterchainFeesWei(), FEE);
        managed.claimFees();
        assertEq(managed.pendingInterchainFeesWei(), 0);
        assertEq(relayer.balance, 2 * FEE);
    }
}
