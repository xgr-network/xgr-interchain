// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {XGRInterchainValidatorRegistryV3} from "../contracts/XGRInterchainValidatorRegistryV3.sol";
import {MockXGRInterchainBLSVerifier} from "../contracts/test/MockXGRInterchainBLSVerifier.sol";

contract XGRInterchainValidatorRegistryV3Test is Test {
    XGRInterchainValidatorRegistryV3 private registry;
    MockXGRInterchainBLSVerifier private verifier;
    address constant A=address(0x101);
    address constant B=address(0x202);
    address constant C=address(0x303);
    address constant D=address(0x404);

    function _fill(uint n, uint8 b) internal pure returns(bytes memory v) {
        v=new bytes(n);
        for(uint i=0;i<n;++i) v[i]=bytes1(b);
    }
    function _initial() internal pure returns(
        address[] memory addresses,bytes[] memory keys,bytes[] memory eip,bytes[] memory proofs
    ){
        addresses=new address[](3);
        keys=new bytes[](3);
        eip=new bytes[](3);
        proofs=new bytes[](3);
        addresses[0]=A;addresses[1]=B;addresses[2]=C;
        for(uint i=0;i<3;i++){
            keys[i]=_fill(48,uint8(i+11));
            eip[i]=_fill(128,uint8(i+22));
            proofs[i]=_fill(96,uint8(i+33));
        }
    }
    function setUp() public {
        verifier=new MockXGRInterchainBLSVerifier();
        (address[] memory addrs,bytes[] memory keys,bytes[] memory eip,bytes[] memory pop)=_initial();
        vm.deal(address(this),10 ether);
        registry=new XGRInterchainValidatorRegistryV3{value:3 ether}(
            1643,1643,address(verifier),1,1 ether,0.1 ether,
            addrs,keys,eip,pop
        );
    }
    function _transition() internal view returns(XGRInterchainValidatorRegistryV3.MembershipTransition memory t){
        t=XGRInterchainValidatorRegistryV3.MembershipTransition({
            expectedSetId:1,validUntil:uint64(block.timestamp+5 minutes),
            action:1,validator:D,blsPublicKey:_fill(48,0x44),
            blsPublicKeyEIP2537:_fill(128,0x55)
        });
    }
    function testUnknownValidatorKeyCannotJoinWithValidOldQuorum() public {
        vm.expectRevert(XGRInterchainValidatorRegistryV3.InvalidTransition.selector);
        registry.applyMembership{value:1 ether}(_transition(),hex"03",_fill(96,0x66));
    }
    function testProofOfPossessionAllowsQuorumAdmittedValidator() public {
        XGRInterchainValidatorRegistryV3.MembershipTransition memory t=_transition();
        registry.provePossession(D,t.blsPublicKey,t.blsPublicKeyEIP2537,_fill(96,0x77));
        assertTrue(registry.possessionVerified(keccak256(
            abi.encode(D,t.blsPublicKey,t.blsPublicKeyEIP2537))));
        registry.applyMembership{value:1 ether}(t,hex"03",_fill(96,0x66));
        (bool active,uint64 setId)=registry.getValidatorStatus(D);
        assertTrue(active);
        assertEq(setId,2);
    }
    function testProofCannotBeReusedForDifferentValidatorAddress() public {
        XGRInterchainValidatorRegistryV3.MembershipTransition memory t=_transition();
        registry.provePossession(C,t.blsPublicKey,t.blsPublicKeyEIP2537,_fill(96,0x77));
        vm.expectRevert(XGRInterchainValidatorRegistryV3.InvalidTransition.selector);
        registry.applyMembership{value:1 ether}(t,hex"03",_fill(96,0x66));
    }
}
