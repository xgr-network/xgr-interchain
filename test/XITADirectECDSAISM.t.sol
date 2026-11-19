// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {XGRInterchainECDSAVerifier} from "../contracts/XGRInterchainECDSAVerifier.sol";
import {XGRInterchainECDSAValidatorRegistryV5} from "../contracts/XGRInterchainECDSAValidatorRegistryV5.sol";
import {XITADirectECDSAISM} from "../contracts/XITADirectECDSAISM.sol";
import {XITADirectProtocol} from "../contracts/XITADirectProtocol.sol";
import {XITADirectECDSAProtocol} from "../contracts/XITADirectECDSAProtocol.sol";

contract ECDSAPolicyRecipient {
    bool public allowed = true;
    function setAllowed(bool value) external { allowed = value; }
    function verifyInboundRoute(uint64 chainId,uint32 domain,address router,bytes32 routeId)
        external view returns(bool)
    {
        return allowed && chainId == 1643 && domain == 1643 &&
            router == address(0x2222) && routeId == bytes32(uint256(0x123));
    }
}

contract XITADirectECDSAISMTest is Test {
    XGRInterchainECDSAValidatorRegistryV5 registry;
    XITADirectECDSAISM ism;
    ECDSAPolicyRecipient recipient;

    function _signature(uint256 key, bytes memory payload) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key,keccak256(payload));
        return abi.encodePacked(r,s,v);
    }

    function setUp() public {
        vm.chainId(50);
        vm.deal(address(this),10 ether);
        address[] memory validators = new address[](3);
        bytes[] memory proofs = new bytes[](3);
        uint256[3] memory keys = [uint256(0x101),0x202,0x303];
        for(uint256 i;i<3;++i){
            validators[i]=vm.addr(keys[i]);
            proofs[i]=_signature(keys[i],abi.encodePacked(
                "XITA_ECDSA_BOOTSTRAP_V2",bytes8(uint64(1643)),
                bytes4(uint32(50)),bytes20(validators[i])
            ));
        }
        registry = new XGRInterchainECDSAValidatorRegistryV5{value:2.4 ether}(
            1643,50,address(new XGRInterchainECDSAVerifier()),
            0.4 ether,0.08 ether,validators,proofs
        );
        ism=new XITADirectECDSAISM(address(registry));
        recipient=new ECDSAPolicyRecipient();
    }

    function _message() internal view returns(bytes memory){
        return abi.encodePacked(uint8(3),uint32(1),uint32(1643),
            bytes32(uint256(uint160(address(0x2222)))),uint32(50),
            bytes32(uint256(uint160(address(recipient)))),bytes("bridge-payload"));
    }

    function _auth(bytes memory message) internal view returns(XITADirectProtocol.Authorization memory) {
        return XITADirectProtocol.Authorization({
            sourceChainId:1643,sourceDomain:1643,destinationDomain:50,
            routeId:bytes32(uint256(0x123)),setId:registry.setId(),sourceBlockNumber:999,
            sourceRegistry:address(0x1111),gateway:address(0x3333),
            sourceRouter:address(0x2222),sourceMailbox:address(0x4444),
            destinationRouter:address(recipient),validatorFeeWei:1000,
            messageId:keccak256(message)
        });
    }

    function _metadata(XITADirectProtocol.Authorization memory a) internal returns(bytes memory) {
        bytes memory payload=ism.encodeAuthorization(a);
        return abi.encode(XITADirectECDSAISM.Metadata(
            a,hex"03",bytes.concat(_signature(0x101,payload),_signature(0x202,payload))
        ));
    }

    function testDirectECDSAUsesSameMessageAndRouterPolicy() public {
        bytes memory message=_message();
        XITADirectProtocol.Authorization memory a=_auth(message);
        assertTrue(ism.verify(_metadata(a),message));
        recipient.setAllowed(false);
        assertFalse(ism.verify(_metadata(a),message));
    }

    function testDifferentSignatureDomainCannotReplay() public {
        bytes memory message=_message();
        XITADirectProtocol.Authorization memory a=_auth(message);
        bytes memory wrong=XITADirectProtocol.encode(a,address(ism),address(registry));
        bytes memory forged=abi.encode(XITADirectECDSAISM.Metadata(
            a,hex"03",bytes.concat(_signature(0x101,wrong),_signature(0x202,wrong))
        ));
        assertFalse(ism.verify(forged,message));
        assertTrue(ism.verify(_metadata(a),message));
    }

    function testBothDomainsCarryIdenticalFields() public view {
        XITADirectProtocol.Authorization memory a=_auth(_message());
        bytes memory b=XITADirectProtocol.encode(a,address(ism),address(registry));
        bytes memory e=XITADirectECDSAProtocol.encode(a,address(ism),address(registry));
        uint256 bPrefix=bytes("XITA_DIRECT_MESSAGE_V1").length;
        uint256 ePrefix=bytes("XITA_DIRECT_MESSAGE_ECDSA_V1").length;
        assertEq(b.length,bPrefix+268);
        assertEq(e.length,ePrefix+268);
        for(uint256 i;i<268;++i)assertEq(b[bPrefix+i],e[ePrefix+i]);
    }
}
