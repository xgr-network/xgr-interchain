// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {XITASolanaNativeXGRHub,XITASolanaNativeXGRHubFactory}
    from "../contracts/solana/XITASolanaNativeXGRHub.sol";
import {XITASolanaCodec} from "../contracts/solana/XITASolanaCodec.sol";
import {XGRILNFeeVault} from "../contracts/XGRILNFeeVault.sol";
import {XGRILNProtocol} from "../contracts/XGRILNProtocol.sol";

contract SolanaMockRegistry {
    bool public accept = true;
    uint64 public setId = 7;
    uint64 public originChainId = 1643;
    uint32 public destinationDomain = 1643;
    address public verifier = address(0xb1a5);
    bytes public lastPayload;

    function getFeeRecipientCountAndSetId()
        external view returns(uint256,uint64) {return(3,setId);}
    function verifyQuorum(uint64 setId_,bytes calldata,
        bytes calldata,bytes calldata)
        external view returns(bool) {return accept&&setId_==setId;}
    function setAcceptance(bool ok) external {accept=ok;}
    function rotate(uint64 next) external {setId=next;}
}

contract XITASolanaNativeXGRHubTest is Test {
    XITASolanaNativeXGRHub hub;
    SolanaMockRegistry registry;
    XITASolanaNativeXGRHubFactory factory;
    uint256 constant FEE=1e9;
    uint256 constant PRINCIPAL=1e18;
    bytes32 constant PROGRAM=bytes32(uint256(0x1111));
    bytes32 constant SOL_ROUTER=bytes32(uint256(0x2222));
    bytes32 constant SOL_REGISTRY=bytes32(uint256(0x3333));
    bytes32 constant SOL_ISM=bytes32(uint256(0x4444));
    bytes32 constant SOL_DEST_REGISTRY=bytes32(uint256(0x5555));

    function setUp() public {
        vm.chainId(1643);
        registry=new SolanaMockRegistry();
        factory=new XITASolanaNativeXGRHubFactory();
        hub=new XITASolanaNativeXGRHub(
            address(registry),PROGRAM,SOL_ROUTER,SOL_REGISTRY,
            SOL_ISM,SOL_DEST_REGISTRY,FEE
        );
        vm.deal(address(this),100 ether);
    }
    function _lock() internal returns(bytes32) {
        return hub.lockToSolana{value:PRINCIPAL+FEE}(
            bytes32(uint256(0xabcdef)),PRINCIPAL
        );
    }
    function _auth(bytes32 message) internal view
        returns(XITASolanaCodec.Authorization memory a) {
        a.sourceDomain=1399811149;
        a.destinationDomain=1643;
        a.assetId=hub.assetId();
        a.routeId=hub.inboundRouteId();
        a.setId=registry.setId();
        a.sourceHeight=12345;
        a.sourceRegistry=SOL_REGISTRY;
        a.gateway=PROGRAM;
        a.sourceRouter=SOL_ROUTER;
        a.sourceMailbox=PROGRAM;
        a.destinationRouter=XITASolanaCodec.evmAddress32(address(hub));
        a.validatorFeeAtomic=1000000;
        a.messageId=message;
        a.recipient=XITASolanaCodec.evmAddress32(address(this));
        a.amountCanonical=PRINCIPAL;
        a.destinationIsm=XITASolanaCodec.evmAddress32(address(hub));
        a.destinationRegistry=XITASolanaCodec.evmAddress32(address(registry));
    }
    function testPermissionlessFactoryDeploymentHasNoOperator() public {
        address newHub=factory.deploy(
            address(registry),PROGRAM,SOL_ROUTER,SOL_REGISTRY,
            SOL_ISM,SOL_DEST_REGISTRY,FEE
        );
        XITASolanaNativeXGRHub h=XITASolanaNativeXGRHub(payable(newHub));
        assertEq(h.validatorRegistry().setId(),7);
        assertEq(h.sourceFeeWei(),FEE);
        assertEq(h.assetId(),hub.assetId());
        assertEq(h.outboundRouteId(),hub.outboundRouteId()==bytes32(0)?
            bytes32(0):XITASolanaCodec.solanaRouteId(
                hub.assetId(),1643,1399811149,
                XITASolanaCodec.evmAddress32(newHub),SOL_ROUTER
            ));
        assertTrue(h.inboundRouteId()!=hub.inboundRouteId());
    }
    function testLockFeeAndNativeCollateralAreAtomic() public {
        bytes32 id=_lock();
        assertTrue(id!=bytes32(0));
        assertEq(hub.lockedPrincipalWei(),PRINCIPAL);
        assertEq(address(hub).balance,PRINCIPAL);
        assertEq(address(hub.feeVault()).balance,FEE);
        assertEq(hub.feeVault().totalAllocatedWei(),FEE);
        assertTrue(hub.feeVault().allocatedOperation(id));
        assertEq(hub.feeVault().allocatedSetId(id),7);
        bytes32 other=_lock();
        assertTrue(other!=id);
        assertEq(hub.lockedPrincipalWei(),2*PRINCIPAL);
    }
    function testCannotLockDustOrUnderpayFee() public {
        vm.expectRevert();
        hub.lockToSolana{value:1+FEE}(bytes32(uint256(1)),1);
        vm.expectRevert(XITASolanaNativeXGRHub.InvalidFee.selector);
        hub.lockToSolana{value:PRINCIPAL}(bytes32(uint256(1)),PRINCIPAL);
        vm.expectRevert(XITASolanaNativeXGRHub.InvalidTransfer.selector);
        hub.lockToSolana{value:PRINCIPAL+FEE}(bytes32(0),PRINCIPAL);
        assertEq(hub.lockedPrincipalWei(),0);
        assertEq(address(hub.feeVault()).balance,0);
    }
    function testReleaseIsQuorumGatedReplayedAndBackingBound() public {
        _lock();
        bytes32 message=bytes32(uint256(1001));
        XITASolanaCodec.Authorization memory a=_auth(message);
        uint256 before=address(this).balance;
        hub.releaseFromSolana(a,hex"03",hex"0102");
        assertEq(address(this).balance,before+PRINCIPAL);
        assertEq(hub.lockedPrincipalWei(),0);
        assertTrue(hub.consumedInbound(message));
        vm.expectRevert(XITASolanaNativeXGRHub.Replay.selector);
        hub.releaseFromSolana(a,hex"03",hex"0102");
    }
    function testQuorumFailuresAndForeignRoutesCannotRelease() public {
        _lock();
        XITASolanaCodec.Authorization memory a=_auth(bytes32(uint256(13)));
        registry.setAcceptance(false);
        vm.expectRevert(XITASolanaNativeXGRHub.BLSQuorumFailed.selector);
        hub.releaseFromSolana(a,hex"03",hex"0102");
        assertEq(hub.lockedPrincipalWei(),PRINCIPAL);
        registry.setAcceptance(true);
        a.sourceRouter=bytes32(uint256(0x9999));
        vm.expectRevert(XITASolanaNativeXGRHub.InvalidTransfer.selector);
        hub.releaseFromSolana(a,hex"03",hex"0102");
        a=_auth(bytes32(uint256(13)));
        a.destinationRegistry=bytes32(uint256(0x9999));
        vm.expectRevert(XITASolanaNativeXGRHub.InvalidTransfer.selector);
        hub.releaseFromSolana(a,hex"03",hex"0102");
        a=_auth(bytes32(uint256(13)));
        registry.rotate(8);
        vm.expectRevert(XITASolanaNativeXGRHub.InvalidTransfer.selector);
        hub.releaseFromSolana(a,hex"03",hex"0102");
    }
    function testNoReleaseWithoutBacking() public {
        XITASolanaCodec.Authorization memory a=_auth(bytes32(uint256(13)));
        vm.expectRevert(XITASolanaNativeXGRHub.InsufficientBacking.selector);
        hub.releaseFromSolana(a,hex"03",hex"0102");
    }
    function testFeeChangeRequiresCurrentBlsQuorumAndExactNonce() public {
        XGRILNProtocol.SourceFeeProposalV315 memory p=
            XGRILNProtocol.SourceFeeProposalV315({
                sourceChainId:1643,sourceDomain:1643,
                registry:address(hub),setId:7,nonce:1,
                validUntil:uint64(block.timestamp+120),
                validatorFeeWei:2*FEE
            });
        registry.setAcceptance(false);
        vm.expectRevert(XITASolanaNativeXGRHub.BLSQuorumFailed.selector);
        hub.applySourceFee(p,hex"03",hex"12");
        registry.setAcceptance(true);
        hub.applySourceFee(p,hex"03",hex"12");
        assertEq(hub.sourceFeeWei(),2*FEE);
        assertEq(hub.feeNonce(),1);
        vm.expectRevert(XITASolanaNativeXGRHub.InvalidFee.selector);
        hub.applySourceFee(p,hex"03",hex"12");
    }
    receive() external payable {}
}
