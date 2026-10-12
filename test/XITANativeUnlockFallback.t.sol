// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {XETAGuardedNativeWarpRouter} from "../contracts/XETAGuardedNativeWarpRouter.sol";
import {XETAMockMailbox, XETAMockGatewayBinding} from "./XETAGuardedWarpRouterIntegration.t.sol";
import {MockXGRILNRegistry} from "../contracts/test/MockXGRILNRegistry.sol";
import {IXGRILNRegistry} from "../contracts/IXGRILNRegistry.sol";

contract XITARejectingReceiver {
    address public immutable owner = msg.sender;
    bool public accept;
    uint256 public received;
    receive() external payable {
        require(accept, "reject native XGR");
        received += msg.value;
    }
    function setAccept(bool enabled) external { accept = enabled; }
    function redeem(XETAGuardedNativeWarpRouter router, address payable dest) external {
        require(msg.sender == owner, "not owner");
        router.withdrawPendingNativeXGR(dest);
    }
}
contract XITANativeUnlockFallbackTest is Test {
    uint32 constant HUB=1643;
    uint32 constant BASE=8453;
    bytes32 constant REMOTE=bytes32(uint256(uint160(address(0x1234))));
    XETAGuardedNativeWarpRouter router;
    XETAMockMailbox mailbox;
    MockXGRILNRegistry reg;
    XITARejectingReceiver receiver;
    function setUp() public {
        vm.chainId(HUB);
        reg=new MockXGRILNRegistry();
        mailbox=new XETAMockMailbox(HUB);
        router=new XETAGuardedNativeWarpRouter(address(reg),address(mailbox),
            address(mailbox),address(mailbox),100000);
        XETAMockGatewayBinding gw=new XETAMockGatewayBinding(address(reg),bytes32(uint256(1)),BASE,address(router));
        reg.setRoute(BASE,bytes32(uint256(1)),IXGRILNRegistry.RouteRecord({
            sourceChainId:HUB,sourceDomain:HUB,gateway:address(gw),sourceRouter:address(router),
            mailbox:address(mailbox),merkleTreeHook:address(mailbox),destinationRouter:address(0x1234),
            validatorFeeWei:7,enabled:true
        }));
        router.bootstrapXETARoute(BASE,bytes32(uint256(1)));
        receiver=new XITARejectingReceiver();
        vm.deal(address(router),3 ether);
    }
    function deliver(address to,uint256 amount) internal {
        vm.prank(address(mailbox));
        router.handle(BASE,REMOTE,abi.encodePacked(bytes32(uint256(uint160(to))),amount));
    }
    function testFailedNativeDeliveryDefersWithoutRevertingAndCanBeClaimed() public {
        deliver(address(receiver),1 ether);
        assertEq(router.pendingNativeXGR(address(receiver)),1 ether);
        assertEq(router.totalPendingNativeXGR(),1 ether);
        assertEq(address(router).balance,3 ether);
        receiver.setAccept(true);
        receiver.redeem(router,payable(address(receiver)));
        assertEq(receiver.received(),1 ether);
        assertEq(router.pendingNativeXGR(address(receiver)),0);
        assertEq(router.totalPendingNativeXGR(),0);
        assertEq(address(router).balance,2 ether);
    }
    function testFurtherDeliveriesSucceedWhileOneReceiverRejects() public {
        deliver(address(receiver),1 ether);
        address payable other=payable(address(0xBEEF));
        deliver(other,0.5 ether);
        assertEq(other.balance,0.5 ether);
        assertEq(router.pendingNativeXGR(address(receiver)),1 ether);
    }
    function testNoThirdPartyCanClaimAnotherBeneficiary() public {
        deliver(address(receiver),1 ether);
        vm.expectRevert(XETAGuardedNativeWarpRouter.NoPendingNativeXGR.selector);
        router.withdrawPendingNativeXGR(payable(address(this)));
        assertEq(router.pendingNativeXGR(address(receiver)),1 ether);
    }
    function testFailedWithdrawalCannotEraseCredit() public {
        deliver(address(receiver),1 ether);
        vm.expectRevert(XETAGuardedNativeWarpRouter.NativePayoutFailed.selector);
        receiver.redeem(router,payable(address(receiver)));
        assertEq(router.pendingNativeXGR(address(receiver)),1 ether);
        assertEq(router.totalPendingNativeXGR(),1 ether);
    }
    function testBeneficiaryMayRedirectToDifferentWallet() public {
        deliver(address(receiver),1 ether);
        address payable destination=payable(address(0xCAFE));
        receiver.redeem(router,destination);
        assertEq(destination.balance,1 ether);
        assertEq(router.pendingNativeXGR(address(receiver)),0);
        assertEq(router.totalPendingNativeXGR(),0);
    }
    function testTwoDeferredTransfersAccumulateWithoutDoublePayment() public {
        deliver(address(receiver),0.25 ether);
        deliver(address(receiver),0.5 ether);
        assertEq(router.pendingNativeXGR(address(receiver)),0.75 ether);
        receiver.redeem(router,payable(address(0xABCD)));
        assertEq(address(0xABCD).balance,0.75 ether);
        vm.expectRevert(XETAGuardedNativeWarpRouter.NoPendingNativeXGR.selector);
        receiver.redeem(router,payable(address(0xABCD)));
    }
}
