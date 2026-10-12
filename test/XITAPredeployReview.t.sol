// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
// Review-only tests against unchanged production code. NOT a deploy script.
import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {XGRInterchainBLSVerifier} from "../contracts/XGRInterchainBLSVerifier.sol";
import {XGRInterchainValidatorRegistryV3} from "../contracts/XGRInterchainValidatorRegistryV3.sol";
import {XETATokenFactoryV315} from "../contracts/XETATokenFactoryV315.sol";
import {XETANativeRouterDeployer} from "../contracts/XETANativeRouterDeployer.sol";
import {XETASyntheticRouterDeployer} from "../contracts/XETASyntheticRouterDeployer.sol";
import {XETACollateralRouterDeployer} from "../contracts/XETACollateralRouterDeployer.sol";
import {XETAGuardedSyntheticWarpRouter} from "../contracts/XETAGuardedSyntheticWarpRouter.sol";
import {XETAGuardedCollateralWarpRouterV315} from "../contracts/XETAGuardedCollateralWarpRouterV315.sol";
import {XGRILNFeeVault} from "../contracts/XGRILNFeeVault.sol";
import {ILNGateway} from "../contracts/ILNGateway.sol";
import {MockLocalGovernanceRegistry} from "../contracts/test/MockLocalGovernanceRegistry.sol";

contract AuditBLSHarness is XGRInterchainBLSVerifier {
    // For test scalar SK=1, a BLS signature is exactly hashToG2(message).
    function signWithScalarOne(bytes calldata message) external view returns(bytes memory) {
        (bool ok,bytes memory sig)=_hashToG2(message);require(ok,"hash-to-curve failed");return sig;
    }
}
contract AuditMailbox {
    address public registry;
    function setRegistry(address value) external { registry = value; }
    function mailbox() external view returns (address) { return address(this); }
    function destinationDomain() external view returns (uint32) { return localDomain; }

    uint32 public immutable localDomain;uint256 private count;
    constructor(uint32 d){localDomain=d;}
    function quoteDispatch(uint32,bytes32,bytes calldata,bytes calldata,address) external pure returns(uint256){return 0;}
    function dispatch(uint32,bytes32,bytes calldata,bytes calldata,address) external payable returns(bytes32){return keccak256(abi.encode(address(this),++count));}
}
contract AuditERC20 is ERC20 {
    constructor() ERC20("Audit Token","AUD"){_mint(msg.sender,1000000 ether);}
}
contract XITAPredeployCryptoReview is Test {
    function testMustRejectInfinityPublicKeyAndSignature() public {
        XGRInterchainBLSVerifier v=new XGRInterchainBLSVerifier();
        bytes[] memory keys=new bytes[](1);keys[0]=new bytes(128);
        bool accepted=v.verify(bytes("unowned arbitrary message"),keys,hex"01",new bytes(256));
        emit log_named_uint("Infinity proof accepted (must be 0)",accepted?1:0);
        assertFalse(accepted,"BLS public key and signature at infinity must be rejected");
    }
    function testMustRejectBootstrapWithInfinityKeys() public {
        vm.deal(address(this),4 ether);
        XGRInterchainBLSVerifier v=new XGRInterchainBLSVerifier();
        address[] memory validators=new address[](3);bytes[] memory compressed=new bytes[](3);
        bytes[] memory full=new bytes[](3);bytes[] memory proofs=new bytes[](3);
        for(uint256 i;i<3;i++){
            validators[i]=address(uint160(100+i));compressed[i]=new bytes(48);compressed[i][0]=bytes1(uint8(i+1));
            full[i]=new bytes(128);proofs[i]=new bytes(256);
        }
        vm.expectRevert();
        new XGRInterchainValidatorRegistryV3{value:3 ether}(1643,8453,address(v),2,1 ether,0.1 ether,validators,compressed,full,proofs);
    }
    function testMustRejectDifferentCompressedAliasesOfSameRealKey() public {
        vm.deal(address(this),4 ether);AuditBLSHarness v=new AuditBLSHarness();
        bytes memory pk=hex"0000000000000000000000000000000017f1d3a73197d7942695638c4fa9ac0fc3688c4f9774b905a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bb0000000000000000000000000000000008b3f481e3aaa0f1a09e30ed741d8ae4fcf5e095d5d00af600db18cb2c04b3edd03cc744a2888ae40caa232946c5e7e1";
        address[] memory validators=new address[](3);bytes[] memory compressed=new bytes[](3);
        bytes[] memory full=new bytes[](3);bytes[] memory proofs=new bytes[](3);
        for(uint256 i;i<3;i++){
            validators[i]=address(uint160(101+i));compressed[i]=new bytes(48);compressed[i][0]=bytes1(uint8(i+1));full[i]=pk;
            bytes memory payload=abi.encodePacked(bytes("XGR_INTERCHAIN_BOOTSTRAP_V1"),bytes8(uint64(1643)),bytes4(uint32(8453)),bytes20(validators[i]),bytes2(uint16(48)),compressed[i],bytes2(uint16(128)),pk);
            proofs[i]=v.signWithScalarOne(payload);
        }
        vm.expectRevert();
        new XGRInterchainValidatorRegistryV3{value:3 ether}(1643,8453,address(v),2,1 ether,0.1 ether,validators,compressed,full,proofs);
    }
}
contract XITAPredeployOperationalReview is Test {
    function factory(uint32 d) internal returns(XETATokenFactoryV315 f,AuditMailbox m){
        vm.chainId(d);m=new AuditMailbox(d);m.setRegistry(address(v));MockLocalGovernanceRegistry v=new MockLocalGovernanceRegistry(d);
        v.setResult(false); // Route admission must not need a validator vote.
        f=new XETATokenFactoryV315(d,d,address(v),address(m),address(m),address(m),500000,100,
          address(new XETANativeRouterDeployer()),address(new XETASyntheticRouterDeployer()),
          address(new XETACollateralRouterDeployer()));
        f.deployRegistry();
    }
    function route(XETATokenFactoryV315 f,address source,uint32 dest,address target,address token) internal returns(ILNGateway){
        (,address gateway)=f.registerRoute(source,dest,dest,target,token);return ILNGateway(gateway);
    }
    function deliver(address m,address target,uint32 origin,address source,uint256 qty) internal {
        vm.prank(m);
        XETAGuardedSyntheticWarpRouter(target).handle(origin,bytes32(uint256(uint160(source))),abi.encodePacked(bytes32(uint256(uint160(address(this)))),qty));
    }
    function testFactoryRuntimeMustFitStandardEVM() public {
        (XETATokenFactoryV315 f,)=factory(1643);
        emit log_named_uint("Factory runtime bytes",address(f).code.length);
        assertLe(address(f).code.length,24576,"Factory exceeds EIP-170 runtime limit");
    }
    function testNativePrincipalIsQuotedExactlyOnce() public {
        (XETATokenFactoryV315 f,)=factory(1643);address r=f.deployNativeXGRRouter(bytes32(uint256(1)));
        ILNGateway g=route(f,r,8453,address(0x1234),address(0x1234));
        (uint256 fee,uint256 principal,uint256 total,)=g.quoteILN(8453,bytes32(uint256(uint160(address(this)))),1 ether);
        emit log_named_uint("Native router value",principal);
        assertEq(fee,100);assertEq(principal,1 ether,"Principal quoted twice");assertEq(total,1 ether+100);
    }
    function testTwoHopRoundTripAccountingWithoutRouteVotes() public {
        vm.deal(address(this),10 ether);
        (XETATokenFactoryV315 fa,AuditMailbox ma)=factory(8453);AuditERC20 t=new AuditERC20();
        (,address a)=fa.deployCollateralRouter(address(t),bytes32(uint256(1)));
        (XETATokenFactoryV315 fb,AuditMailbox mb)=factory(1643);
        (,address b)=fb.deploySyntheticRouter(8453,address(t),18,"Audit Hub","hAUD",bytes32(uint256(2)));
        (XETATokenFactoryV315 fc,AuditMailbox mc)=factory(137);
        (,address c)=fc.deploySyntheticRouter(8453,address(t),18,"Audit Destination","wAUD",bytes32(uint256(3)));
        vm.chainId(8453);ILNGateway ab=route(fa,a,1643,b,b);
        vm.chainId(1643);ILNGateway ba=route(fb,b,8453,a,address(t));ILNGateway bc=route(fb,b,137,c,c);
        vm.chainId(137);ILNGateway cb=route(fc,c,1643,b,b);
        uint256 amount=100 ether;bytes32 recipient=bytes32(uint256(uint160(address(this))));
        vm.chainId(8453);t.approve(address(ab),amount);ab.bridge{value:100}(1643,recipient,amount);
        vm.chainId(1643);deliver(address(mb),b,8453,a,amount);
        XETAGuardedSyntheticWarpRouter(b).approve(address(bc),amount);bc.bridge{value:100}(137,recipient,amount);
        vm.chainId(137);deliver(address(mc),c,1643,b,amount);
        assertEq(t.balanceOf(a),amount);assertEq(XETAGuardedSyntheticWarpRouter(b).totalSupply(),0);assertEq(XETAGuardedSyntheticWarpRouter(c).totalSupply(),amount);
        XETAGuardedSyntheticWarpRouter(c).approve(address(cb),amount);cb.bridge{value:100}(1643,recipient,amount);
        vm.chainId(1643);deliver(address(mb),b,137,c,amount);
        XETAGuardedSyntheticWarpRouter(b).approve(address(ba),amount);ba.bridge{value:100}(8453,recipient,amount);
        vm.chainId(8453);vm.prank(address(ma));
        XETAGuardedCollateralWarpRouterV315(a).handle(1643,bytes32(uint256(uint160(b))),abi.encodePacked(recipient,amount));
        assertEq(t.balanceOf(a),0);assertEq(t.balanceOf(address(this)),1000000 ether);
        assertEq(XETAGuardedSyntheticWarpRouter(b).totalSupply(),0);assertEq(XETAGuardedSyntheticWarpRouter(c).totalSupply(),0);
        // This is custody accounting with mock Mailboxes, not a live BLS E2E claim.
    }
    function testFeeGasWith3_32_128Validators() public {
        vm.deal(address(this),100 ether);
        for(uint256 k;k<3;k++){
            uint256 n=k==0?3:k==1?32:128;
            MockLocalGovernanceRegistry v=new MockLocalGovernanceRegistry(1643);address[] memory members=new address[](n);
            for(uint256 i;i<n;i++)members[i]=address(uint160(1000+i));v.setMembers(members);
            XGRILNFeeVault vault=new XGRILNFeeVault(address(v),address(this),bytes32(uint256(1)),8453);
            uint256 initial=gasleft();vault.allocate{value:100000000000000}(bytes32(uint256(11)));
            uint256 first=initial-gasleft();initial=gasleft();vault.allocate{value:100000000000000}(bytes32(uint256(12)));
            emit log_named_uint("Validator count",n);emit log_named_uint("Allocation gas first (same-tx benchmark)",first);emit log_named_uint("Allocation gas second (warm same-tx)",initial-gasleft());
        }
    }
}
