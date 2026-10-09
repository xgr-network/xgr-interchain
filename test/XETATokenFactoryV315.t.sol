// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {XETATokenFactoryV315} from "../contracts/XETATokenFactoryV315.sol";
import {XGRILNRegistryV315} from "../contracts/XGRILNRegistryV315.sol";
import {XGRILNProtocol} from "../contracts/XGRILNProtocol.sol";
import {XETAGuardedSyntheticWarpRouter} from "../contracts/XETAGuardedSyntheticWarpRouter.sol";
import {ILNGateway} from "../contracts/ILNGateway.sol";
import {MockLocalGovernanceRegistry} from "../contracts/test/MockLocalGovernanceRegistry.sol";

contract XETAV315MockMailbox {
    uint32 public immutable localDomain;
    uint256 public dispatchCount;

    constructor(uint32 domain) { localDomain = domain; }
    function quoteDispatch(uint32, bytes32, bytes calldata, bytes calldata, address)
        external pure returns (uint256) { return 0; }
    function dispatch(uint32, bytes32, bytes calldata, bytes calldata, address)
        external payable returns (bytes32) {
        dispatchCount++;
        return keccak256(abi.encodePacked(dispatchCount));
    }
}

contract XETATokenFactoryV315Test is Test {
    uint64 internal constant CHAIN = 8453;
    uint32 internal constant DOMAIN = 8453;
    uint32 internal constant HUB = 1643;
    address internal constant HUB_ROUTER = address(0xA11CE);

    XETATokenFactoryV315 internal factory;
    XGRILNRegistryV315 internal registry;
    MockLocalGovernanceRegistry internal validators;
    XETAV315MockMailbox internal mailbox;

    function _config()
        internal pure returns (
            uint64[] memory chains, uint32[] memory domains, address[] memory routers
        )
    {
        chains = new uint64[](1);
        domains = new uint32[](1);
        routers = new address[](1);
        chains[0] = HUB;
        domains[0] = HUB;
        routers[0] = HUB_ROUTER;
    }

    function setUp() public {
        vm.chainId(CHAIN);
        validators = new MockLocalGovernanceRegistry(DOMAIN);
        mailbox = new XETAV315MockMailbox(DOMAIN);
        (uint64[] memory chains,uint32[] memory domains,address[] memory routers) = _config();
        factory = new XETATokenFactoryV315(
            CHAIN, DOMAIN, address(validators),
            address(mailbox), address(mailbox), address(mailbox), 250_000,
            chains, domains, routers
        );
    }

    function _initializeFee(uint256 fee) internal {
        XGRILNProtocol.SourceFeeProposalV315 memory p =
            XGRILNProtocol.SourceFeeProposalV315({
                sourceChainId: CHAIN,
                sourceDomain: DOMAIN,
                registry: address(registry),
                setId: validators.setId(),
                nonce: registry.sourceFeeNonce() + 1,
                validUntil: uint64(block.timestamp + 5 minutes),
                validatorFeeWei: fee
            });
        registry.applySourceFee(p, hex"03", hex"01");
    }

    function _ready() internal returns (address router) {
        registry = XGRILNRegistryV315(factory.deployRegistry());
        router = factory.deployWrappedXGR();
        _initializeFee(100);
    }

    function testAnyoneCanCreateSameSingletonRegistry() public {
        vm.prank(address(0xBEEF));
        address first = factory.deployRegistry();
        assertTrue(first != address(0));
        assertEq(first, address(factory.registry()));
        vm.prank(address(0xB0B));
        address again = factory.deployRegistry();
        assertEq(first, again);
        XGRILNRegistryV315 deployed = XGRILNRegistryV315(first);
        assertEq(deployed.factory(), address(factory));
        assertEq(deployed.sourceDomain(), DOMAIN);
        assertEq(deployed.governanceRegistry().destinationDomain(), DOMAIN);
    }

    function testXGRRepresentationIdentityIsFactoryDerived() public view {
        bytes32 expected = XGRILNProtocol.assetIdV315(1643, address(0), 0);
        assertEq(factory.xgrAssetId(), expected);
        assertEq(factory.representation(expected), address(0));
        (uint64 chainId,address router) = factory.xgrPeerForDomain(HUB);
        assertEq(chainId, HUB);
        assertEq(router, HUB_ROUTER);
    }

    function testNativeXGRCannotBeDeployedOnBase() public {
        factory.deployRegistry();
        vm.expectRevert(XETATokenFactoryV315.WrongChain.selector);
        factory.deployNativeXGR();
    }

    function testConstructorRejectsWrongChain() public {
        (uint64[] memory chains,uint32[] memory domains,address[] memory routers) = _config();
        vm.expectRevert(XETATokenFactoryV315.InvalidConfiguration.selector);
        new XETATokenFactoryV315(
            1643, 1643, address(validators),
            address(mailbox), address(mailbox), address(mailbox), 250_000,
            chains, domains, routers
        );
    }

    function testConstructorRejectsInvalidOrDuplicatePeer() public {
        uint64[] memory chains = new uint64[](2);
        uint32[] memory domains = new uint32[](2);
        address[] memory routers = new address[](2);
        chains[0] = chains[1] = HUB;
        domains[0] = domains[1] = HUB;
        routers[0] = address(0x123);
        routers[1] = address(0x456);
        vm.expectRevert(XETATokenFactoryV315.InvalidPeerConfiguration.selector);
        new XETATokenFactoryV315(
            CHAIN, DOMAIN, address(validators),
            address(mailbox), address(mailbox), address(mailbox), 250_000,
            chains, domains, routers
        );
    }

    function testAnyoneCanAtomicallyCreateXGRRoute() public {
        address router = _ready();
        bytes32 assetId = factory.xgrAssetId();
        bytes32 expectedRoute = XGRILNProtocol.routeIdV315(
            assetId, CHAIN, DOMAIN, HUB, HUB
        );

        vm.prank(address(0xBEEF));
        (bytes32 routeId,address gateway) = factory.createXGRRoute(HUB);
        assertEq(routeId, expectedRoute);
        assertTrue(gateway.code.length != 0);
        assertTrue(registry.exists(HUB, routeId));
        assertEq(ILNGateway(gateway).feeVault().gateway(), gateway);
        assertEq(ILNGateway(gateway).warpRouter(), router);
        assertEq(ILNGateway(gateway).routeId(), routeId);
        assertEq(
            XETAGuardedSyntheticWarpRouter(router).xetaRouteIdForDomain(HUB),
            routeId
        );
        assertEq(
            XETAGuardedSyntheticWarpRouter(router).routers(HUB),
            bytes32(uint256(uint160(HUB_ROUTER)))
        );

        XGRILNRegistryV315.AssetRoute memory binding = registry.assetRoute(HUB, routeId);
        assertEq(binding.assetId, assetId);
        assertEq(binding.destinationChainId, HUB);
        assertEq(binding.sourceToken, router);
        assertEq(binding.destinationToken, address(0));

        (,, address registeredGateway, address sourceRouter,,,,uint256 fee,bool enabled) =
            registry.getRoute(HUB, routeId);
        assertEq(registeredGateway, gateway);
        assertEq(sourceRouter, router);
        assertEq(fee, 100);
        assertTrue(enabled);

        _initializeFee(250);
        (,,,,,,,fee,enabled) = registry.getRoute(HUB, routeId);
        assertEq(fee, 250);
        assertTrue(enabled);
        assertEq(ILNGateway(gateway).validatorFeeWei(), 250);
    }

    function testCannotCreateDuplicateOrUnconfiguredRoute() public {
        _ready();
        vm.expectRevert(XETATokenFactoryV315.PeerNotConfigured.selector);
        factory.createXGRRoute(137);
        factory.createXGRRoute(HUB);
        vm.expectRevert(XETATokenFactoryV315.RouteAlreadyExists.selector);
        factory.createXGRRoute(HUB);
    }

    function testGatewayRegistrationRollsBackWhenFeeUnset() public {
        registry = XGRILNRegistryV315(factory.deployRegistry());
        factory.deployWrappedXGR();
        bytes32 routeId = XGRILNProtocol.routeIdV315(
            factory.xgrAssetId(), CHAIN, DOMAIN, HUB, HUB
        );
        vm.expectRevert(XGRILNRegistryV315.InvalidRoute.selector);
        factory.createXGRRoute(HUB);
        assertFalse(registry.exists(HUB, routeId));
    }

    function testCannotHijackRegisteredRouterViaDirectRegistryCall() public {
        address router = _ready();
        vm.expectRevert(XGRILNRegistryV315.UnauthorizedRegistrar.selector);
        vm.prank(address(0xBEEF));
        registry.registerRoute(
            factory.xgrAssetId(), HUB, HUB,
            router, address(0), address(0x111),
            router, address(mailbox), address(mailbox), HUB_ROUTER
        );
    }
}
