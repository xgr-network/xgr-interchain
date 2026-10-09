// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {XGRILNProtocol} from "../contracts/XGRILNProtocol.sol";
import {XGRILNRegistryV315} from "../contracts/XGRILNRegistryV315.sol";
import {XETATokenFactoryV315} from "../contracts/XETATokenFactoryV315.sol";
import {XETAGuardedCollateralWarpRouterV315} from "../contracts/XETAGuardedCollateralWarpRouterV315.sol";
import {XETAGuardedSyntheticWarpRouter} from "../contracts/XETAGuardedSyntheticWarpRouter.sol";
import {XETARouterCore} from "../contracts/XETARouterCore.sol";
import {ILNGateway} from "../contracts/ILNGateway.sol";
import {MockLocalGovernanceRegistry} from "../contracts/test/MockLocalGovernanceRegistry.sol";

contract MockOriginERC20V315 is ERC20 {
    constructor() ERC20("Origin Asset", "OAS") {
        _mint(msg.sender, 1_000_000 ether);
    }
}

contract OpenV315MockMailbox {
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

contract XETAOpenRouteFactoryV315Test is Test {
    uint64 internal constant BASE = 8453;
    uint32 internal constant HUB = 1643;
    address internal constant REMOTE_A = address(0xAAA1);
    address internal constant REMOTE_B = address(0xAAA2);

    XETATokenFactoryV315 internal factory;
    XGRILNRegistryV315 internal registry;
    MockLocalGovernanceRegistry internal validators;
    OpenV315MockMailbox internal mailbox;
    MockOriginERC20V315 internal token;

    function setUp() public {
        vm.chainId(BASE);
        validators = new MockLocalGovernanceRegistry(uint32(BASE));
        mailbox = new OpenV315MockMailbox(uint32(BASE));
        factory = new XETATokenFactoryV315(
            BASE, uint32(BASE), address(validators),
            address(mailbox), address(mailbox), address(mailbox), 200_000,
            new uint64[](0), new uint32[](0), new address[](0)
        );
        registry = XGRILNRegistryV315(factory.deployRegistry());
        token = new MockOriginERC20V315();
        XGRILNProtocol.SourceFeeProposalV315 memory p =
            XGRILNProtocol.SourceFeeProposalV315({
                sourceChainId: BASE, sourceDomain: uint32(BASE),
                registry: address(registry), setId: validators.setId(),
                nonce: 1, validUntil: uint64(block.timestamp + 600),
                validatorFeeWei: 100
            });
        registry.applySourceFee(p, hex"03", hex"01");
    }

    function _request(address remote, bytes32 salt)
        internal pure returns (XETATokenFactoryV315.OpenRouteRequest memory)
    {
        return XETATokenFactoryV315.OpenRouteRequest({
            destinationChainId: HUB,
            destinationDomain: HUB,
            destinationRouter: remote,
            userSalt: salt
        });
    }

    function _proof(bytes32 id, address router, address remote)
        internal view returns (XGRILNRegistryV315.RouteSafetyProofV315 memory)
    {
        bytes32 assetId = XGRILNProtocol.assetIdV315(BASE,address(token),1);
        return XGRILNRegistryV315.RouteSafetyProofV315({
            destinationDomain: HUB,
            routeId: id,
            reverseRouteId: XGRILNProtocol.routeInstanceIdV315(
                assetId, HUB, HUB, BASE, uint32(BASE), remote, router
            ),
            remoteRegistry: address(0xB123),
            remoteFactory: address(0xB456),
            remoteGateway: address(0xB789),
            remoteRouterCodeHash: keccak256("verified foreign runtime code"),
            localRouterCodeHash: router.codehash,
            setId: validators.setId(),
            validUntil: uint64(block.timestamp + 5 minutes)
        });
    }

    function testParallelCollateralInstancesCannotCaptureCanonicalAsset() public {
        (bytes32 a,address routerA,address gatewayA) =
            factory.createERC20CollateralRoute(address(token),_request(REMOTE_A,bytes32(uint256(1))));
        (bytes32 b,address routerB,address gatewayB) =
            factory.createERC20CollateralRoute(address(token),_request(REMOTE_B,bytes32(uint256(2))));
        assertTrue(a != b);
        assertTrue(routerA != routerB);
        assertTrue(gatewayA != gatewayB);
        assertTrue(registry.exists(HUB,a));
        assertTrue(registry.exists(HUB,b));
        assertEq(factory.openRouterAssetId(routerA),factory.openRouterAssetId(routerB));
        assertEq(factory.openRouterAssetId(routerA),
            XGRILNProtocol.assetIdV315(BASE,address(token),1));
        (,,,,,,,,bool enabledA) = registry.getRoute(HUB,a);
        (,,,,,,,,bool enabledB) = registry.getRoute(HUB,b);
        assertFalse(enabledA);
        assertFalse(enabledB);
        assertEq(XETAGuardedCollateralWarpRouterV315(routerA).token(),address(token));
        assertEq(XETAGuardedCollateralWarpRouterV315(routerB).token(),address(token));
        vm.expectRevert(ILNGateway.InvalidRoute.selector);
        ILNGateway(gatewayA).quoteILN(HUB,bytes32(uint256(1)),1 ether);
    }

    function testInvalidPairProofCannotActivateEvenWhenRouteExists() public {
        (bytes32 id,address router,) = factory.createERC20CollateralRoute(
            address(token),_request(REMOTE_A,bytes32(uint256(3)))
        );
        XGRILNRegistryV315.RouteSafetyProofV315 memory p = _proof(id,router,REMOTE_A);
        p.localRouterCodeHash = bytes32(uint256(1));
        vm.expectRevert(XGRILNRegistryV315.InvalidRouteSafetyProof.selector);
        factory.confirmAndBootstrapOpenRoute(p,hex"03",hex"01");
        p.localRouterCodeHash = router.codehash;
        validators.setResult(false);
        vm.expectRevert(XGRILNRegistryV315.InvalidRouteSafetyProof.selector);
        factory.confirmAndBootstrapOpenRoute(p,hex"03",hex"01");
        (,,,,,,,,bool enabled) = registry.getRoute(HUB,id);
        assertFalse(enabled);
    }

    function testProofThenAtomicActivationAndIndependentCollateral() public {
        (bytes32 id,address router,address gateway) =
            factory.createERC20CollateralRoute(address(token),_request(REMOTE_A,bytes32(uint256(4))));
        (bytes32 other,address otherRouter,) =
            factory.createERC20CollateralRoute(address(token),_request(REMOTE_B,bytes32(uint256(5))));
        XGRILNRegistryV315.RouteSafetyProofV315 memory proof =
            _proof(id,router,REMOTE_A);
        factory.confirmAndBootstrapOpenRoute(proof,hex"03",hex"01");
        (,,,,,,,uint256 fee,bool active) = registry.getRoute(HUB,id);
        assertTrue(active);
        assertEq(fee,100);
        (,,,,,,,,bool otherActive) = registry.getRoute(HUB,other);
        assertFalse(otherActive);
        assertEq(XETAGuardedCollateralWarpRouterV315(router).xetaRouteIdForDomain(HUB),id);
        assertEq(XETAGuardedCollateralWarpRouterV315(router).routers(HUB),
            bytes32(uint256(uint160(REMOTE_A))));
        vm.expectRevert(XETARouterCore.XETAInvalidRoute.selector);
        XETAGuardedCollateralWarpRouterV315(otherRouter).transferRemote(
            HUB,bytes32(uint256(1)),1 ether
        );

        token.approve(gateway, 100 ether);
        (
            uint256 validatorFee,
            uint256 quotedNative,
            uint256 totalNative,
            uint256 quotedToken
        ) = ILNGateway(gateway).quoteILN(HUB,bytes32(uint256(uint160(address(0xCAFE)))),100 ether);
        assertEq(validatorFee,100);
        assertEq(quotedNative,0);
        assertEq(totalNative,100);
        assertEq(quotedToken,100 ether);
        ILNGateway(gateway).bridge{value:totalNative}(
            HUB,bytes32(uint256(uint160(address(0xCAFE)))),100 ether
        );
        assertEq(token.balanceOf(router),100 ether);
        assertEq(token.balanceOf(otherRouter),0);
        assertEq(address(ILNGateway(gateway).feeVault()).balance,100);
    }

    function testMultipleWrappedClaimsCanCoexistWithoutMinting() public {
        uint64 origin = HUB;
        address originERC20 = address(0x9999);
        (bytes32 a,address first,) = factory.createERC20SyntheticRoute(
            origin,originERC20,18,"Claim 1","C1",
            _request(REMOTE_A,bytes32(uint256(6)))
        );
        (bytes32 b,address second,) = factory.createERC20SyntheticRoute(
            origin,originERC20,18,"Claim 2","C2",
            _request(REMOTE_B,bytes32(uint256(7)))
        );
        assertTrue(a != b);
        assertTrue(first != second);
        assertEq(factory.representedAssetId(first),factory.representedAssetId(second));
        assertEq(XETAGuardedSyntheticWarpRouter(first).totalSupply(),0);
        assertEq(XETAGuardedSyntheticWarpRouter(second).totalSupply(),0);
        (,,,,,,,,bool enabledA) = registry.getRoute(HUB,a);
        assertFalse(enabledA);
    }

    function testInvalidSpokeToSpokeIsNeverDeployed() public {
        XETATokenFactoryV315.OpenRouteRequest memory bad =
            XETATokenFactoryV315.OpenRouteRequest({
                destinationChainId: 137,
                destinationDomain: 137,
                destinationRouter: REMOTE_A,
                userSalt: bytes32(uint256(9))
            });
        vm.expectRevert(XETATokenFactoryV315.InvalidOpenRoute.selector);
        factory.createERC20CollateralRoute(address(token),bad);
    }

    function testDifferentTokenSameRouterClaimsHaveDistinctAssetId() public {
        MockOriginERC20V315 second = new MockOriginERC20V315();
        (bytes32 a,,) = factory.createERC20CollateralRoute(
            address(token),_request(REMOTE_A,bytes32(uint256(10)))
        );
        (bytes32 b,,) = factory.createERC20CollateralRoute(
            address(second),_request(REMOTE_A,bytes32(uint256(10)))
        );
        assertTrue(a != b);
    }
}
