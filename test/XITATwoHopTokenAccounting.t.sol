// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {XETATokenFactoryV315} from "../contracts/XETATokenFactoryV315.sol";
import {XGRILNRegistryV315} from "../contracts/XGRILNRegistryV315.sol";
import {XETANativeRouterDeployer} from "../contracts/XETANativeRouterDeployer.sol";
import {XETASyntheticRouterDeployer} from "../contracts/XETASyntheticRouterDeployer.sol";
import {XETACollateralRouterDeployer} from "../contracts/XETACollateralRouterDeployer.sol";
import {XETAGuardedSyntheticWarpRouter} from "../contracts/XETAGuardedSyntheticWarpRouter.sol";
import {XETAGuardedCollateralWarpRouterV315} from "../contracts/XETAGuardedCollateralWarpRouterV315.sol";
import {XETAGuardedNativeWarpRouter} from "../contracts/XETAGuardedNativeWarpRouter.sol";
import {XETARouterCore} from "../contracts/XETARouterCore.sol";
import {XITAExecutionGateway} from "../contracts/XITAExecutionGateway.sol";
import {ILNGateway} from "../contracts/ILNGateway.sol";
import {MockLocalGovernanceRegistry} from "../contracts/test/MockLocalGovernanceRegistry.sol";

/// @dev The TEST ONLY Mailbox records the exact TokenRouter dispatch body.
 /// It models successful authenticated destination delivery by calling the
 /// recipient from its own Mailbox address. BLS/ISM proof verification is
 /// deliberately outside this test and must be tested independently.
contract XITATwoHopMailboxStub {
    uint32 public immutable localDomain;
    address public registry;
    uint256 public dispatchCount;
    uint32 public lastDomain;
    bytes32 public lastRecipient;
    address public lastSender;
    bytes public lastBody;

    constructor(uint32 domain_) { localDomain = domain_; }
    function setRegistry(address value) external { registry = value; }
    function mailbox() external view returns (address) { return address(this); }
    function destinationDomain() external view returns (uint32) { return localDomain; }
    function quoteDispatch(uint32, bytes32, bytes calldata, bytes calldata, address)
        external pure returns (uint256) { return 0; }

    function dispatch(uint32 destination, bytes32 recipient, bytes calldata body,
        bytes calldata, address) external payable returns (bytes32 messageId) {
        require(msg.value == 0, "mock dispatch gas must be zero");
        require(recipient != bytes32(0), "zero router");
        dispatchCount++;
        lastDomain = destination;
        lastRecipient = recipient;
        lastSender = msg.sender;
        lastBody = body;
        messageId = keccak256(abi.encode(localDomain, destination, msg.sender,
            recipient, body, dispatchCount));
        require(messageId != bytes32(0), "zero message ID");
    }
}

interface IXITATwoHopRecipient {
    function handle(uint32 origin, bytes32 sender, bytes calldata body) external payable;
}

/// @dev A genuine external ERC20 with non-18-decimal accounting, to exercise
/// actual collateral locks and subsequent synthetic mint/burn on both spokes.
contract XITATwoHopOriginal6 is ERC20 {
    constructor() ERC20("Original Asset Six", "ORIG6") {
        _mint(msg.sender, 1_000_000 * 1e6);
    }
    function decimals() public pure override returns (uint8) { return 6; }
}

/// @notice THREE-chain, full-token-accounting test using the REAL deployed
/// factory, Native/Collateral/Synthetic routers, ILN Gateway, FeeVault and
/// fee adapters. No funds, keys, or deployments on public chains are touched.
/// Test mailbox delivery does not establish real BLS validator readiness.
contract XITATwoHopTokenAccountingTest is Test {
    uint64 internal constant HUB = 1643;
    uint64 internal constant BASE = 8453;
    uint64 internal constant ARBITRUM = 42161;
    uint256 internal constant RELAYER_KEY = 0xB0B;
    uint256 internal constant SERVICE_FEE = 0.002 ether;
    uint256 internal constant VALIDATOR_FEE = 100;
    address internal constant USER = address(0xCAFE);
    address internal constant RECOVERY_ADMIN = address(0xA11CE);
    address internal serviceWallet;

    struct Network {
        uint64 chainId;
        XETATokenFactoryV315 factory;
        XGRILNRegistryV315 registry;
        XITATwoHopMailboxStub mailbox;
    }

    Network internal hub;
    Network internal base;
    Network internal arb;
    Network internal polygon;

    function setUp() public {
        vm.warp(1_800_000_000);
        serviceWallet = vm.addr(RELAYER_KEY);
        hub = _network(HUB);
        base = _network(BASE);
        arb = _network(ARBITRUM);
        vm.deal(USER, 100 ether);
    }

    function _network(uint64 chainId) internal returns (Network memory net) {
        vm.chainId(chainId);
        MockLocalGovernanceRegistry validators =
            new MockLocalGovernanceRegistry(uint32(chainId));
        XITATwoHopMailboxStub mailbox = new XITATwoHopMailboxStub(uint32(chainId));
        mailbox.setRegistry(address(validators));
        XETATokenFactoryV315 factory = new XETATokenFactoryV315(
            chainId, uint32(chainId), address(validators), address(mailbox),
            address(mailbox), address(mailbox), VALIDATOR_FEE,
            address(new XETANativeRouterDeployer()),
            address(new XETASyntheticRouterDeployer()),
            address(new XETACollateralRouterDeployer())
        );
        XGRILNRegistryV315 registry =
            XGRILNRegistryV315(factory.deployRegistry());
        return Network(chainId, factory, registry, mailbox);
    }

    function _register(Network storage network, address sourceRouter,
        Network storage destination, address destinationRouter, address destinationToken)
        internal returns (bytes32 routeId, ILNGateway gateway)
    {
        vm.chainId(network.chainId);
        address gatewayAddress;
        (routeId,gatewayAddress) = network.factory.registerRoute(
            sourceRouter, destination.chainId, uint32(destination.chainId),
            destinationRouter, destinationToken
        );
        gateway = ILNGateway(gatewayAddress);
        assertEq(gateway.warpRouter(), sourceRouter);
        assertEq(gateway.destinationDomain(),uint32(destination.chainId));
        assertEq(gateway.routeId(),routeId);
        assertEq(address(gateway.ilnRegistry()),address(network.registry));
    }

    function _recipient() internal pure returns (bytes32) {
        return bytes32(uint256(uint160(USER)));
    }

    function _bridge(Network storage source, Network storage target,
        address originRouter, address targetRouter, bytes32 routeId,
        ILNGateway gateway, uint256 amount) internal returns (bytes32 id)
    {
        vm.chainId(source.chainId);
        (uint256 fee,,uint256 bridgeWei,uint256 tokens) =
            gateway.quoteILN(uint32(target.chainId),_recipient(),amount);
        assertEq(fee,VALIDATOR_FEE);
        if(gateway.warpToken() == address(0)) {
            assertEq(tokens,0);
            assertGe(bridgeWei,amount+VALIDATOR_FEE);
        } else {
            assertEq(tokens,amount);
        }
        vm.prank(USER);
        id = gateway.bridge{value:bridgeWei}(
            uint32(target.chainId),_recipient(),amount
        );
        assertTrue(id != bytes32(0));
        assertTrue(gateway.feeVault().allocatedOperation(id));
        _assertMessage(source,target,originRouter,targetRouter);
    }

    function _assertMessage(Network storage source,Network storage target,
        address originRouter,address targetRouter) internal view {
        assertEq(source.mailbox.lastDomain(),uint32(target.chainId));
        assertEq(source.mailbox.lastRecipient(),
            bytes32(uint256(uint160(targetRouter))));
        assertEq(source.mailbox.lastSender(),originRouter);
        assertEq(source.mailbox.lastBody().length,64);
    }

    function _deliver(Network storage source,Network storage target,
        address sourceRouter,address targetRouter, bytes32 routeId) internal {
        _assertMessage(source,target,sourceRouter,targetRouter);
        vm.chainId(target.chainId);
        // The real destination ISM calls this method to prevent a foreign
        // asset from consuming legitimate target collateral.
        assertTrue(XETARouterCore(targetRouter).verifyInboundRoute(
            source.chainId,uint32(source.chainId),sourceRouter,routeId),
            "actual inbound source RouteID rejected"
        );
        assertFalse(XETARouterCore(targetRouter).verifyInboundRoute(
            source.chainId,uint32(source.chainId),sourceRouter,
            bytes32(uint256(0xDEADBEEF))),"wrong source RouteID accepted");
        // Evaluate any external getter BEFORE setting vm.prank; an
        // intervening lastBody() getter would consume the one-shot prank
        // and wrongly call the target as the test contract.
        bytes memory body=source.mailbox.lastBody();
        vm.prank(address(target.mailbox));
        IXITATwoHopRecipient(targetRouter).handle(
            uint32(source.chainId),
            bytes32(uint256(uint160(sourceRouter))),
            body
        );
    }

    function _adapter(Network storage net) internal returns (XITAExecutionGateway adapter) {
        vm.chainId(net.chainId);
        adapter = new XITAExecutionGateway(
            address(net.registry),payable(serviceWallet),RECOVERY_ADMIN);
    }

    /// @dev Source quote commits both route identities, both destinations,
    /// recipient, amount and a service fee signed with the actual EIP-712 key.
    /// This source fee is paid ONCE for the complete two-hop user journey.
    function _paidBaseFirstHop(ILNGateway gateway,bytes32 onwardRouteId,
        uint256 amount, XITAExecutionGateway adapter)
        internal returns (bytes32 messageId)
    {
        vm.chainId(BASE);
        (, ,uint256 bridgeNativeWei,) = gateway.quoteILN(
            uint32(HUB), _recipient(), amount);
        XITAExecutionGateway.Quote memory q = XITAExecutionGateway.Quote({
            payer:USER,
            gateway:address(gateway),
            routeId:gateway.routeId(),
            destinationDomain:uint32(HUB),
            recipient:_recipient(),
            finalDestinationDomain:uint32(ARBITRUM),
            finalRecipient:_recipient(),
            onwardRouteId:onwardRouteId,
            amount:amount,
            bridgeValueWei:bridgeNativeWei,
            interchainFeeWei:SERVICE_FEE,
            nonce:101,
            issuedAt:uint64(block.timestamp)
        });
        (uint8 v,bytes32 r,bytes32 s) =
            vm.sign(RELAYER_KEY,adapter.quoteDigest(q));
        address sourceToken = gateway.warpToken();
        assertTrue(sourceToken != address(0));
        vm.prank(USER);
        ERC20(sourceToken).approve(address(adapter),amount);
        vm.prank(USER);
        messageId = adapter.execute{value:bridgeNativeWei+SERVICE_FEE}(
            q,abi.encodePacked(r,s,v));
        assertTrue(messageId != bytes32(0));
        assertEq(adapter.pendingInterchainFeesWei(),SERVICE_FEE);
        assertTrue(gateway.feeVault().allocatedOperation(messageId));
    }

    function _onwardHop(ILNGateway gateway,bytes32 parentId,uint256 amount,
        XITAExecutionGateway adapter) internal returns (bytes32 messageId)
    {
        vm.chainId(HUB);
        (, ,uint256 bridgeNativeWei,) = gateway.quoteILN(
            uint32(ARBITRUM),_recipient(),amount);
        address sourceToken = gateway.warpToken();
        if(sourceToken != address(0)) {
            vm.prank(USER);
            ERC20(sourceToken).approve(address(adapter),amount);
        }
        // Read external getters before vm.prank: a routeId() call inside
        // the Solidity argument list would consume the one-shot prank.
        bytes32 routeId=gateway.routeId();
        vm.prank(USER);
        messageId = adapter.continueJourney{value:bridgeNativeWei}(
            parentId,address(gateway),routeId,
            uint32(ARBITRUM),_recipient(),amount
        );
        assertTrue(messageId != bytes32(0));
        assertTrue(gateway.feeVault().allocatedOperation(messageId));
        assertTrue(adapter.onwardParentUsed(USER,parentId));
        assertEq(adapter.pendingInterchainFeesWei(),0,
            "second hop must not charge a second XITA service fee");
        vm.expectRevert(XITAExecutionGateway.InvalidQuote.selector);
        vm.prank(USER);
        adapter.continueJourney{value:bridgeNativeWei}(
            parentId,address(gateway),routeId,
            uint32(ARBITRUM),_recipient(),amount
        );
    }

    /// @notice Spoke-to-spoke transport of native hub XGR:
    /// Hub->Base pre-existing LOCK/MINT, then actual requested
    /// Base BURN -> Hub UNLOCK -> Hub LOCK -> Arbitrum MINT.
    function testBaseToArbitrumNativeXGRBurnUnlockLockMint() public {
        vm.chainId(HUB);
        address nativeRouter = hub.factory.deployNativeXGRRouter(bytes32(uint256(1)));
        vm.chainId(BASE);
        address baseWrapped = base.factory.deployWrappedXGRRouter(bytes32(uint256(2)));
        vm.chainId(ARBITRUM);
        address arbWrapped = arb.factory.deployWrappedXGRRouter(bytes32(uint256(3)));

        (bytes32 seedId,ILNGateway hubToBase) =
            _register(hub,nativeRouter,base,baseWrapped,baseWrapped);
        (bytes32 baseId,ILNGateway baseToHub) =
            _register(base,baseWrapped,hub,nativeRouter,address(0));
        (bytes32 onwardId,ILNGateway hubToArb) =
            _register(hub,nativeRouter,arb,arbWrapped,arbWrapped);
        _register(arb,arbWrapped,hub,nativeRouter,address(0));
        uint256 amount=1 ether;

        // Establish the REAL pre-existing hub native collateral; no direct
        // funding or arbitrary mint of Base wXGR is used in the test.
        vm.chainId(HUB);
        bytes32 seedMessage=_bridge(hub,base,nativeRouter,baseWrapped,seedId,
            hubToBase,amount);
        assertTrue(seedMessage!=bytes32(0));
        assertEq(address(nativeRouter).balance,amount);
        _deliver(hub,base,nativeRouter,baseWrapped,seedId);
        assertEq(XETAGuardedSyntheticWarpRouter(baseWrapped).balanceOf(USER),amount);
        assertEq(XETAGuardedSyntheticWarpRouter(baseWrapped).totalSupply(),amount);

        XITAExecutionGateway baseAdapter=_adapter(base);
        XITAExecutionGateway hubAdapter=_adapter(hub);
        bytes32 parent=_paidBaseFirstHop(baseToHub,onwardId,amount,baseAdapter);
        _assertMessage(base,hub,baseWrapped,nativeRouter);
        assertEq(XETAGuardedSyntheticWarpRouter(baseWrapped).balanceOf(USER),0);
        assertEq(XETAGuardedSyntheticWarpRouter(baseWrapped).totalSupply(),0);
        _deliver(base,hub,baseWrapped,nativeRouter,baseId);
        assertEq(address(nativeRouter).balance,0,
            "native hub escrow must unlock, not mint additional XGR");
        bytes32 onward=_onwardHop(hubToArb,parent,amount,hubAdapter);
        assertTrue(onward!=parent);
        _assertMessage(hub,arb,nativeRouter,arbWrapped);
        assertEq(address(nativeRouter).balance,amount,
            "the hub must re-lock existing XGR for Arbitrum");
        _deliver(hub,arb,nativeRouter,arbWrapped,onwardId);
        assertEq(XETAGuardedSyntheticWarpRouter(arbWrapped).balanceOf(USER),amount);
        assertEq(XETAGuardedSyntheticWarpRouter(arbWrapped).totalSupply(),amount);
        assertEq(XETAGuardedSyntheticWarpRouter(baseWrapped).totalSupply(),0);
        assertEq(address(nativeRouter).balance,amount,
            "cross-spoke XGR supply is backed by real hub escrow");
        assertEq(baseAdapter.pendingInterchainFeesWei(),SERVICE_FEE);
    }

    /// @notice External original ERC20 originates on BASE, not XGRChain:
    /// Base LOCK -> hub MINT -> hub BURN -> Arbitrum MINT.
    /// The hub holds synthetic liquidity, NOT the original token collateral.
    function testBaseOriginalERC20LockMintBurnMintSixDecimals() public {
        vm.chainId(BASE);
        XITATwoHopOriginal6 token=new XITATwoHopOriginal6();
        uint256 amount=1234*1e6;
        token.transfer(USER,amount);
        (bytes32 assetId,address baseCollateral)=base.factory.deployCollateralRouter(
            address(token),bytes32(uint256(10)));
        vm.chainId(HUB);
        (bytes32 hubId,address hubWrapped)=hub.factory.deploySyntheticRouter(
            BASE,address(token),6,"Hub wrapped external","hwORIG6",bytes32(uint256(11)));
        vm.chainId(ARBITRUM);
        (bytes32 arbId,address arbWrapped)=arb.factory.deploySyntheticRouter(
            BASE,address(token),6,"Arbitrum wrapped external","awORIG6",bytes32(uint256(12)));
        assertEq(assetId,hubId);
        assertEq(assetId,arbId);
        (bytes32 firstId,ILNGateway baseToHub)=_register(
            base,baseCollateral,hub,hubWrapped,hubWrapped);
        _register(hub,hubWrapped,base,baseCollateral,address(token));
        (bytes32 onwardId,ILNGateway hubToArb)=_register(
            hub,hubWrapped,arb,arbWrapped,arbWrapped);
        _register(arb,arbWrapped,hub,hubWrapped,hubWrapped);

        XITAExecutionGateway baseAdapter=_adapter(base);
        XITAExecutionGateway hubAdapter=_adapter(hub);

        bytes32 parent=_paidBaseFirstHop(baseToHub,onwardId,amount,baseAdapter);
        _assertMessage(base,hub,baseCollateral,hubWrapped);
        assertEq(token.balanceOf(baseCollateral),amount,
            "original Base ERC20 must be locked in genuine collateral router");
        assertEq(token.balanceOf(USER),0);
        _deliver(base,hub,baseCollateral,hubWrapped,firstId);
        assertEq(XETAGuardedSyntheticWarpRouter(hubWrapped).balanceOf(USER),amount);
        assertEq(XETAGuardedSyntheticWarpRouter(hubWrapped).totalSupply(),amount);
        assertEq(token.balanceOf(baseCollateral),amount);
        bytes32 onward=_onwardHop(hubToArb,parent,amount,hubAdapter);
        assertTrue(onward!=parent);
        assertEq(XETAGuardedSyntheticWarpRouter(hubWrapped).totalSupply(),0,
            "hub synthetic must be burned before issuing Arbitrum synthetic");
        _deliver(hub,arb,hubWrapped,arbWrapped,onwardId);
        assertEq(XETAGuardedSyntheticWarpRouter(arbWrapped).balanceOf(USER),amount);
        assertEq(XETAGuardedSyntheticWarpRouter(arbWrapped).totalSupply(),amount);
        assertEq(XETAGuardedSyntheticWarpRouter(hubWrapped).totalSupply(),0);
        assertEq(token.balanceOf(baseCollateral),amount,
            "Arbitrum supply must be fully backed by the original Base escrow");
        assertEq(baseAdapter.pendingInterchainFeesWei(),SERVICE_FEE);
    }

    /// @notice Original collateral sits on ARBITRUM. Its synthetic copies
    /// circulate on Base and the hub. A Base->Arbitrum transfer must
    /// BURN Base -> MINT hub -> BURN hub -> UNLOCK original Arbitrum ERC20.
    function testArbitrumOriginalBurnMintBurnUnlock() public {
        uint256 amount=77*1e6;
        vm.chainId(ARBITRUM);
        XITATwoHopOriginal6 token=new XITATwoHopOriginal6();
        token.transfer(USER,amount);
        (bytes32 assetId,address arbCollateral)=arb.factory.deployCollateralRouter(
            address(token),bytes32(uint256(20)));
        vm.chainId(HUB);
        (bytes32 hubId,address hubSynthetic)=hub.factory.deploySyntheticRouter(
            ARBITRUM,address(token),6,"Hub claim","hwARB",bytes32(uint256(21)));
        vm.chainId(BASE);
        (bytes32 baseId,address baseSynthetic)=base.factory.deploySyntheticRouter(
            ARBITRUM,address(token),6,"Base claim","bwARB",bytes32(uint256(22)));
        assertEq(assetId,hubId);
        assertEq(assetId,baseId);

        (bytes32 seedId,ILNGateway arbToHub)=
            _register(arb,arbCollateral,hub,hubSynthetic,hubSynthetic);
        (bytes32 onwardId,ILNGateway hubToArb)=
            _register(hub,hubSynthetic,arb,arbCollateral,address(token));
        (bytes32 transferId,ILNGateway hubToBase)=
            _register(hub,hubSynthetic,base,baseSynthetic,baseSynthetic);
        (bytes32 baseRouteId,ILNGateway baseToHub)=
            _register(base,baseSynthetic,hub,hubSynthetic,hubSynthetic);

        // Pre-existing Base balance is created through legitimate locks
        // of the origin ERC20; never mint a synthetic token in test setup.
        vm.chainId(ARBITRUM);
        vm.prank(USER);
        token.approve(address(arbToHub),amount);
        _bridge(arb,hub,arbCollateral,hubSynthetic,seedId,arbToHub,amount);
        assertEq(token.balanceOf(arbCollateral),amount);
        _deliver(arb,hub,arbCollateral,hubSynthetic,seedId);
        assertEq(XETAGuardedSyntheticWarpRouter(hubSynthetic).totalSupply(),amount);
        vm.chainId(HUB);
        vm.prank(USER);
        ERC20(hubSynthetic).approve(address(hubToBase),amount);
        _bridge(hub,base,hubSynthetic,baseSynthetic,transferId,hubToBase,amount);
        assertEq(XETAGuardedSyntheticWarpRouter(hubSynthetic).totalSupply(),0);
        _deliver(hub,base,hubSynthetic,baseSynthetic,transferId);
        assertEq(XETAGuardedSyntheticWarpRouter(baseSynthetic).totalSupply(),amount);

        XITAExecutionGateway baseAdapter=_adapter(base);
        XITAExecutionGateway hubAdapter=_adapter(hub);
        bytes32 parent=_paidBaseFirstHop(baseToHub,onwardId,amount,baseAdapter);
        assertEq(XETAGuardedSyntheticWarpRouter(baseSynthetic).totalSupply(),0);
        _deliver(base,hub,baseSynthetic,hubSynthetic,baseRouteId);
        assertEq(XETAGuardedSyntheticWarpRouter(hubSynthetic).totalSupply(),amount);
        bytes32 onward=_onwardHop(hubToArb,parent,amount,hubAdapter);
        assertTrue(onward!=parent);
        assertEq(XETAGuardedSyntheticWarpRouter(hubSynthetic).totalSupply(),0);
        _deliver(hub,arb,hubSynthetic,arbCollateral,onwardId);
        assertEq(token.balanceOf(USER),amount,
            "the exact original Arbitrum ERC20 must be unlocked");
        assertEq(token.balanceOf(arbCollateral),0);
        assertEq(XETAGuardedSyntheticWarpRouter(hubSynthetic).totalSupply(),0);
        assertEq(XETAGuardedSyntheticWarpRouter(baseSynthetic).totalSupply(),0);
        assertEq(baseAdapter.pendingInterchainFeesWei(),SERVICE_FEE);
    }

    /// @notice Origin token resides on a DIFFERENT spoke (Polygon). Both Base
    /// and Arbitrum hold synthetic claims, so even the intermediate hub token
    /// is synthetic: BURN -> MINT -> BURN -> MINT.
    function testThirdChainOriginalBurnMintBurnMint() public {
        uint64 originId=137;
        Network memory origin=_network(originId);
        // Store in a named storage slot; _register/_bridge keep storage context.
        polygon=origin;
        uint256 amount=345*1e6;
        vm.chainId(originId);
        XITATwoHopOriginal6 original=new XITATwoHopOriginal6();
        original.transfer(USER,amount);
        (bytes32 assetId,address collateral)=polygon.factory.deployCollateralRouter(
            address(original),bytes32(uint256(30)));
        vm.chainId(HUB);
        (bytes32 hubId,address hubSynthetic)=hub.factory.deploySyntheticRouter(
            originId,address(original),6,"Hub claim","hwPOL",bytes32(uint256(31)));
        vm.chainId(BASE);
        (bytes32 baseId,address baseSynthetic)=base.factory.deploySyntheticRouter(
            originId,address(original),6,"Base claim","bwPOL",bytes32(uint256(32)));
        vm.chainId(ARBITRUM);
        (bytes32 arbId,address arbSynthetic)=arb.factory.deploySyntheticRouter(
            originId,address(original),6,"Arbitrum claim","awPOL",bytes32(uint256(33)));
        assertEq(assetId,hubId);
        assertEq(assetId,baseId);
        assertEq(assetId,arbId);

        (bytes32 seedId,ILNGateway origToHub)=
            _register(polygon,collateral,hub,hubSynthetic,hubSynthetic);
        _register(hub,hubSynthetic,polygon,collateral,address(original));
        (bytes32 toBaseId,ILNGateway hubToBase)=
            _register(hub,hubSynthetic,base,baseSynthetic,baseSynthetic);
        (bytes32 baseIdBack,ILNGateway baseToHub)=
            _register(base,baseSynthetic,hub,hubSynthetic,hubSynthetic);
        (bytes32 onwardId,ILNGateway hubToArb)=
            _register(hub,hubSynthetic,arb,arbSynthetic,arbSynthetic);
        _register(arb,arbSynthetic,hub,hubSynthetic,hubSynthetic);

        // Establish a fully backed Base synthetic starting from Polygon.
        vm.chainId(originId);
        vm.prank(USER);
        original.approve(address(origToHub),amount);
        _bridge(polygon,hub,collateral,hubSynthetic,seedId,origToHub,amount);
        _deliver(polygon,hub,collateral,hubSynthetic,seedId);
        vm.chainId(HUB);
        vm.prank(USER);
        ERC20(hubSynthetic).approve(address(hubToBase),amount);
        _bridge(hub,base,hubSynthetic,baseSynthetic,toBaseId,hubToBase,amount);
        _deliver(hub,base,hubSynthetic,baseSynthetic,toBaseId);
        assertEq(original.balanceOf(collateral),amount);
        assertEq(XETAGuardedSyntheticWarpRouter(baseSynthetic).totalSupply(),amount);
        assertEq(XETAGuardedSyntheticWarpRouter(hubSynthetic).totalSupply(),0);

        XITAExecutionGateway baseAdapter=_adapter(base);
        XITAExecutionGateway hubAdapter=_adapter(hub);
        bytes32 parent=_paidBaseFirstHop(baseToHub,onwardId,amount,baseAdapter);
        _deliver(base,hub,baseSynthetic,hubSynthetic,baseIdBack);
        assertEq(XETAGuardedSyntheticWarpRouter(baseSynthetic).totalSupply(),0);
        assertEq(XETAGuardedSyntheticWarpRouter(hubSynthetic).totalSupply(),amount);
        bytes32 onward=_onwardHop(hubToArb,parent,amount,hubAdapter);
        assertTrue(onward!=parent);
        assertEq(XETAGuardedSyntheticWarpRouter(hubSynthetic).totalSupply(),0);
        _deliver(hub,arb,hubSynthetic,arbSynthetic,onwardId);
        assertEq(XETAGuardedSyntheticWarpRouter(arbSynthetic).balanceOf(USER),amount);
        assertEq(XETAGuardedSyntheticWarpRouter(arbSynthetic).totalSupply(),amount);
        assertEq(original.balanceOf(collateral),amount,
            "final synthetic amount must stay backed by original Polygon collateral");
        assertEq(original.balanceOf(USER),0);
        assertEq(baseAdapter.pendingInterchainFeesWei(),SERVICE_FEE);
    }

    /// @notice The hub may also secure an original ERC20 instead of native
    /// XGR. Source and target spokes are still synthetic, so the sequence
    /// remains BURN -> UNLOCK -> LOCK -> MINT, with actual ERC20 allowances.
    function testHubOriginalERC20BurnUnlockLockMint() public {
        uint256 amount=19*1e6;
        vm.chainId(HUB);
        XITATwoHopOriginal6 original=new XITATwoHopOriginal6();
        original.transfer(USER,amount);
        (bytes32 assetId,address hubCollateral)=hub.factory.deployCollateralRouter(
            address(original),bytes32(uint256(40)));
        vm.chainId(BASE);
        (bytes32 baseId,address baseSynthetic)=base.factory.deploySyntheticRouter(
            HUB,address(original),6,"Base claim","bwHUB",bytes32(uint256(41)));
        vm.chainId(ARBITRUM);
        (bytes32 arbId,address arbSynthetic)=arb.factory.deploySyntheticRouter(
            HUB,address(original),6,"Arbitrum claim","awHUB",bytes32(uint256(42)));
        assertEq(assetId,baseId);
        assertEq(assetId,arbId);

        (bytes32 seedId,ILNGateway hubToBase)=_register(
            hub,hubCollateral,base,baseSynthetic,baseSynthetic);
        (bytes32 baseToHubId,ILNGateway baseToHub)=_register(
            base,baseSynthetic,hub,hubCollateral,address(original));
        (bytes32 onwardId,ILNGateway hubToArb)=_register(
            hub,hubCollateral,arb,arbSynthetic,arbSynthetic);
        _register(arb,arbSynthetic,hub,hubCollateral,address(original));

        vm.chainId(HUB);
        vm.prank(USER);
        original.approve(address(hubToBase),amount);
        _bridge(hub,base,hubCollateral,baseSynthetic,seedId,hubToBase,amount);
        assertEq(original.balanceOf(hubCollateral),amount);
        _deliver(hub,base,hubCollateral,baseSynthetic,seedId);
        assertEq(XETAGuardedSyntheticWarpRouter(baseSynthetic).balanceOf(USER),amount);

        XITAExecutionGateway baseAdapter=_adapter(base);
        XITAExecutionGateway hubAdapter=_adapter(hub);
        bytes32 parent=_paidBaseFirstHop(baseToHub,onwardId,amount,baseAdapter);
        assertEq(XETAGuardedSyntheticWarpRouter(baseSynthetic).totalSupply(),0);
        _deliver(base,hub,baseSynthetic,hubCollateral,baseToHubId);
        assertEq(original.balanceOf(hubCollateral),0,
            "original hub ERC20 must be unlocked before next hop");
        assertEq(original.balanceOf(USER),amount);
        bytes32 onward=_onwardHop(hubToArb,parent,amount,hubAdapter);
        assertTrue(onward!=parent);
        assertEq(original.balanceOf(hubCollateral),amount,
            "same original hub ERC20 must be re-locked for Arbitrum");
        assertEq(original.balanceOf(USER),0);
        _deliver(hub,arb,hubCollateral,arbSynthetic,onwardId);
        assertEq(XETAGuardedSyntheticWarpRouter(arbSynthetic).balanceOf(USER),amount);
        assertEq(XETAGuardedSyntheticWarpRouter(arbSynthetic).totalSupply(),amount);
        assertEq(original.balanceOf(hubCollateral),amount);
        assertEq(XETAGuardedSyntheticWarpRouter(baseSynthetic).totalSupply(),0);
        assertEq(baseAdapter.pendingInterchainFeesWei(),SERVICE_FEE);
    }
}
