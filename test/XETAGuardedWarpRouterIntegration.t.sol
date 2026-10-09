// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IXGRILNRegistry} from "../contracts/IXGRILNRegistry.sol";
import {MockXGRILNRegistry} from "../contracts/test/MockXGRILNRegistry.sol";
import {XETARouterCore} from "../contracts/XETARouterCore.sol";
import {XETAGuardedNativeWarpRouter} from "../contracts/XETAGuardedNativeWarpRouter.sol";
import {XETAGuardedSyntheticWarpRouter} from "../contracts/XETAGuardedSyntheticWarpRouter.sol";

contract XETAMockMailbox {
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

contract XETAMockGatewayBinding {
    IXGRILNRegistry public immutable ilnRegistry;
    bytes32 public immutable routeId;
    uint32 public immutable destinationDomain;
    address public immutable warpRouter;
    constructor(address reg, bytes32 id, uint32 dest, address router) {
        ilnRegistry=IXGRILNRegistry(reg);
        routeId=id;
        destinationDomain=dest;
        warpRouter=router;
    }
    function outbound(address router,uint32 dest,bytes32 receiver,uint256 amount)
        external payable returns(bytes32) {
        return XETAGuardedNativeWarpRouter(payable(router)).transferRemote{value:msg.value}(dest,receiver,amount);
    }
    function outboundSynthetic(address router,uint32 dest,bytes32 receiver,uint256 amount)
        external payable returns(bytes32) {
        return XETAGuardedSyntheticWarpRouter(router).transferRemote{value:msg.value}(dest,receiver,amount);
    }
}

contract XETARouterIntegrationTest is Test {
    uint32 constant BASE=8453;
    uint32 constant POLYGON=137;
    uint32 constant HUB=1643;
    address constant RECIPIENT=address(0xCAFE);
    MockXGRILNRegistry reg;
    XETAMockMailbox mailbox;
    XETAGuardedNativeWarpRouter nativeRouter;

    function setUp() public {
        vm.chainId(HUB);
        reg=new MockXGRILNRegistry();
        mailbox=new XETAMockMailbox(HUB);
        nativeRouter=new XETAGuardedNativeWarpRouter(address(reg),address(mailbox),
            address(mailbox),address(mailbox),100000);
    }

    function route(address router,uint32 dest,bytes32 id,address remote)
        internal returns(XETAMockGatewayBinding gateway)
    {
        gateway=new XETAMockGatewayBinding(address(reg),id,dest,router);
        reg.setRoute(dest,id,IXGRILNRegistry.RouteRecord({
            sourceChainId:uint64(block.chainid),sourceDomain:mailbox.localDomain(),
            gateway:address(gateway),sourceRouter:router,mailbox:address(mailbox),
            merkleTreeHook:address(mailbox),destinationRouter:remote,
            validatorFeeWei:7,enabled:true
        }));
    }

    function testMultiSpokeNativeSameRouterAndInbound() public {
        XETAMockGatewayBinding baseGateway=route(address(nativeRouter),BASE,bytes32(uint256(1)),address(0x1111));
        XETAMockGatewayBinding polygonGateway=route(address(nativeRouter),POLYGON,bytes32(uint256(2)),address(0x2222));
        nativeRouter.bootstrapXETARoute(BASE,bytes32(uint256(1)));
        nativeRouter.bootstrapXETARoute(POLYGON,bytes32(uint256(2)));
        assertEq(nativeRouter.xetaRouteIdForDomain(BASE),bytes32(uint256(1)));
        assertEq(nativeRouter.xetaRouteIdForDomain(POLYGON),bytes32(uint256(2)));
        vm.deal(address(this),1 ether);
        vm.expectRevert(XETARouterCore.XETAUnauthorizedGateway.selector);
        nativeRouter.transferRemote{value:0.1 ether}(BASE,bytes32(uint256(uint160(RECIPIENT))),0.1 ether);
        vm.deal(address(baseGateway),1 ether);
        vm.deal(address(polygonGateway),1 ether);
        baseGateway.outbound{value:0.1 ether}(address(nativeRouter),BASE,
            bytes32(uint256(uint160(RECIPIENT))),0.1 ether);
        polygonGateway.outbound{value:0.2 ether}(address(nativeRouter),POLYGON,
            bytes32(uint256(uint160(RECIPIENT))),0.2 ether);
        assertEq(mailbox.dispatchCount(),2);
        assertEq(address(nativeRouter).balance,0.3 ether);
        vm.prank(address(mailbox));
        nativeRouter.handle(BASE,bytes32(uint256(uint160(address(0x1111)))),
            abi.encodePacked(bytes32(uint256(uint160(RECIPIENT))),uint256(0.04 ether)));
        assertEq(RECIPIENT.balance,0.04 ether);
    }

    function testWrongBindingAndDisabledRoute() public {
        XETAMockGatewayBinding gateway=route(address(nativeRouter),BASE,bytes32(uint256(1)),address(0x1111));
        vm.expectRevert(XETARouterCore.XETAInvalidRoute.selector);
        nativeRouter.transferRemote(BASE,bytes32(uint256(1)),1);
        // Replace canonical gateway with a non-contract; bootstrap must reject it.
        reg.setRoute(BASE,bytes32(uint256(1)),IXGRILNRegistry.RouteRecord({
            sourceChainId:uint64(block.chainid),sourceDomain:HUB,
            gateway:address(0xBEEF),sourceRouter:address(nativeRouter),
            mailbox:address(mailbox),merkleTreeHook:address(mailbox),
            destinationRouter:address(0x1111),validatorFeeWei:7,enabled:true
        }));
        vm.expectRevert(XETARouterCore.XETAInvalidGatewayBinding.selector);
        nativeRouter.bootstrapXETARoute(BASE,bytes32(uint256(1)));
        // Silence unused warning while keeping the original authentic gateway alive.
        assertTrue(address(gateway)!=address(0));
    }

    function testSyntheticSpokeMustRouteOnlyToHub() public {
        vm.chainId(BASE);
        XETAMockMailbox spokeMailbox=new XETAMockMailbox(BASE);
        XETAGuardedSyntheticWarpRouter token=new XETAGuardedSyntheticWarpRouter(
            address(reg),address(spokeMailbox),address(spokeMailbox),address(spokeMailbox),
            100000,18,"XETA Wrapped XGR","wXGR"
        );
        XETAMockGatewayBinding gateway=new XETAMockGatewayBinding(address(reg),bytes32(uint256(3)),HUB,address(token));
        reg.setRoute(HUB,bytes32(uint256(3)),IXGRILNRegistry.RouteRecord({
            sourceChainId:uint64(block.chainid),sourceDomain:BASE,
            gateway:address(gateway),sourceRouter:address(token),mailbox:address(spokeMailbox),
            merkleTreeHook:address(spokeMailbox),destinationRouter:address(0x1236),
            validatorFeeWei:7,enabled:true
        }));
        token.bootstrapXETARoute(HUB,bytes32(uint256(3)));
        assertEq(token.totalSupply(),0);
        vm.prank(address(spokeMailbox));
        token.handle(HUB,bytes32(uint256(uint160(address(0x1236)))),
            abi.encodePacked(bytes32(uint256(uint160(address(gateway)))),uint256(1 ether)));
        assertEq(token.balanceOf(address(gateway)),1 ether);
        vm.expectRevert(XETARouterCore.XETAUnauthorizedGateway.selector);
        token.transferRemote(HUB,bytes32(uint256(uint160(RECIPIENT))),0.25 ether);
        gateway.outboundSynthetic(address(token),HUB,bytes32(uint256(uint160(RECIPIENT))),0.25 ether);
        assertEq(token.totalSupply(),0.75 ether);
        assertEq(spokeMailbox.dispatchCount(),1);
    }

    receive() external payable {}
}
