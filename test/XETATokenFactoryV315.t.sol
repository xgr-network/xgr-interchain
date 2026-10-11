// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {XETATokenFactoryV315} from "../contracts/XETATokenFactoryV315.sol";
import {XETACollateralRouterDeployer} from "../contracts/XETACollateralRouterDeployer.sol";
import {XETASyntheticRouterDeployer} from "../contracts/XETASyntheticRouterDeployer.sol";
import {XETANativeRouterDeployer} from "../contracts/XETANativeRouterDeployer.sol";
import {XGRILNRegistryV315} from "../contracts/XGRILNRegistryV315.sol";
import {XGRILNProtocol} from "../contracts/XGRILNProtocol.sol";
import {XETAGuardedSyntheticWarpRouter} from "../contracts/XETAGuardedSyntheticWarpRouter.sol";
import {ILNGateway} from "../contracts/ILNGateway.sol";
import {MockLocalGovernanceRegistry} from "../contracts/test/MockLocalGovernanceRegistry.sol";

contract XITAMailboxV315Mock {
    uint32 public immutable localDomain;
    constructor(uint32 domain) { localDomain = domain; }
    function quoteDispatch(uint32, bytes32, bytes calldata, bytes calldata, address)
        external pure returns (uint256) { return 0; }
    function dispatch(uint32, bytes32, bytes calldata, bytes calldata, address)
        external payable returns (bytes32) { return keccak256(abi.encodePacked(block.number, msg.sender)); }
}

contract XETATokenFactoryV315Test is Test {
    uint64 internal constant CHAIN = 8453;
    uint32 internal constant DOMAIN = 8453;
    uint64 internal constant HUB = 1643;
    address internal constant REMOTE_ROUTER = address(0xA11CE);

    XETATokenFactoryV315 internal factory;
    XGRILNRegistryV315 internal registry;
    MockLocalGovernanceRegistry internal validators;
    XITAMailboxV315Mock internal mailbox;

    function setUp() public {
        vm.chainId(CHAIN);
        validators = new MockLocalGovernanceRegistry(DOMAIN);
        mailbox = new XITAMailboxV315Mock(DOMAIN);
        factory = new XETATokenFactoryV315(
            CHAIN, DOMAIN, address(validators),
            address(mailbox), address(mailbox), address(mailbox), 250_000, 100,
            address(new XETANativeRouterDeployer()), address(new XETASyntheticRouterDeployer()), address(new XETACollateralRouterDeployer())
        );
        registry = XGRILNRegistryV315(factory.deployRegistry());
    }

    function _setFee(uint64 nonce, uint256 value) internal {
        XGRILNProtocol.SourceFeeProposalV315 memory p =
            XGRILNProtocol.SourceFeeProposalV315({
                sourceChainId: CHAIN, sourceDomain: DOMAIN,
                registry: address(registry), setId: validators.setId(),
                nonce: nonce, validUntil: uint64(block.timestamp + 5 minutes),
                validatorFeeWei: value
            });
        registry.applySourceFee(p, hex"03", hex"01");
    }

    function testRegistryIsFactoryBoundSingleton() public {
        assertEq(factory.deployRegistry(), address(registry));
        assertEq(registry.factory(), address(factory));
        assertEq(registry.sourceDomain(), DOMAIN);
        assertEq(factory.initialSourceFeeWei(), 100);
        assertEq(registry.validatorFeeWei(), 100);
        assertEq(registry.sourceFeeNonce(), 0);
        assertEq(address(registry.governanceRegistry()), address(validators));
    }

    function testWrappedXGRIsZeroSupplyAndEveryRouterIsIndependent() public {
        address first = factory.deployWrappedXGRRouter(bytes32(uint256(1)));
        address second = factory.deployWrappedXGRRouter(bytes32(uint256(2)));
        assertTrue(first != second);
        assertEq(factory.assetIdForRouter(first), factory.xgrAssetId());
        assertEq(factory.assetIdForRouter(second), factory.xgrAssetId());
        assertEq(XETAGuardedSyntheticWarpRouter(first).totalSupply(), 0);
        assertEq(factory.routerCreator(first), address(this));
    }

    function testCannotDeployNativeXGRRouterOnSpoke() public {
        vm.expectRevert(XETATokenFactoryV315.WrongChain.selector);
        factory.deployNativeXGRRouter(bytes32(uint256(1)));
    }

    function testRouteRegistersAndBootstrapsAtomicallyWithoutQuorum() public {
        validators.setResult(false);
        address local = factory.deployWrappedXGRRouter(bytes32(uint256(1)));
        (bytes32 id, address gateway) = factory.registerRoute(
            local, HUB, uint32(HUB), REMOTE_ROUTER, address(0)
        );
        bytes32 expected = XGRILNProtocol.routeInstanceIdV315(
            factory.xgrAssetId(), CHAIN, DOMAIN, HUB, uint32(HUB), local, REMOTE_ROUTER
        );
        assertEq(id,expected);
        assertTrue(registry.exists(uint32(HUB),id));
        assertEq(ILNGateway(gateway).routeId(),id);
        assertEq(ILNGateway(gateway).warpRouter(),local);
        (,,,,,,,uint256 fee,bool enabled)=registry.getRoute(uint32(HUB),id);
        assertTrue(enabled);
        assertEq(fee,100);
        assertEq(XETAGuardedSyntheticWarpRouter(local).xetaRouteIdForDomain(uint32(HUB)),id);
        assertEq(XETAGuardedSyntheticWarpRouter(local).routers(uint32(HUB)),
            bytes32(uint256(uint160(REMOTE_ROUTER))));
        assertTrue(factory.routeForDomainRegistered(local,uint32(HUB)));
        vm.expectRevert(XETATokenFactoryV315.RouteAlreadyRegistered.selector);
        factory.registerRoute(local,HUB,uint32(HUB),REMOTE_ROUTER,address(0));
    }

    function testCannotRegisterUnconfiguredOrForeignOwnedRouter() public {
        _setFee(1, 100);
        address local = factory.deployWrappedXGRRouter(bytes32(uint256(4)));
        vm.expectRevert(XETATokenFactoryV315.RouterUnauthorized.selector);
        vm.prank(address(0xBEEF));
        factory.registerRoute(local, HUB, uint32(HUB), REMOTE_ROUTER, address(0));
        vm.expectRevert(XETATokenFactoryV315.RouterUnauthorized.selector);
        factory.registerRoute(address(0x1234), HUB, uint32(HUB), REMOTE_ROUTER, address(0));
    }

    function testInitialFeeAllowsRegistrationWithoutQuorum() public {
        address local = factory.deployWrappedXGRRouter(bytes32(uint256(5)));
        (bytes32 id,) = factory.registerRoute(local, HUB, uint32(HUB), REMOTE_ROUTER, address(0));
        assertTrue(id != bytes32(0));
        assertTrue(factory.routeForDomainRegistered(local, uint32(HUB)));
        assertEq(registry.sourceFeeNonce(), 0);
    }
}
