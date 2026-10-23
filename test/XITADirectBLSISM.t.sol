// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {XITADirectBLSISM} from "../contracts/XITADirectBLSISM.sol";
import {XITADirectProtocol} from "../contracts/XITADirectProtocol.sol";
import {XITADirectTransport} from "../contracts/XITADirectTransport.sol";

contract DirectRegistryMock {
    uint32 public immutable destinationDomain;
    address public verifier = address(0x1234);
    uint64 public setId = 1;
    bytes32 public authorizedPayloadHash;

    constructor(uint32 domain) { destinationDomain = domain; }
    function advanceSet() external { setId++; }
    function authorize(bytes calldata payload) external {
        authorizedPayloadHash = keccak256(payload);
    }
    function verifyQuorum(uint64 id, bytes calldata payload,
        bytes calldata bitmap, bytes calldata signature) external view returns(bool) {
        return id == setId && keccak256(payload) == authorizedPayloadHash &&
            keccak256(bitmap) == keccak256(hex"03") &&
            keccak256(signature) == keccak256(hex"abcd");
    }
}

contract DirectRouteMock {
    bool public allow = true;
    function setAllow(bool v) external { allow=v; }
    function verifyInboundRoute(uint64 chainId, uint32 domain, address router, bytes32 routeId)
        external view returns(bool)
    {
        return allow && chainId==8453 && domain==8453 &&
            router==address(0x2222) && routeId==bytes32(uint256(0x123));
    }
}

contract XITADirectBLSISMTest is Test {
    DirectRegistryMock registry;
    DirectRouteMock recipient;
    XITADirectBLSISM ism;
    uint32 constant SOURCE = 8453;
    uint32 constant DEST = 1643;

    function setUp() public {
        vm.chainId(DEST);
        registry = new DirectRegistryMock(DEST);
        recipient = new DirectRouteMock();
        ism = new XITADirectBLSISM(address(registry));
    }

    function _message() internal view returns(bytes memory) {
        return abi.encodePacked(
            uint8(3), uint32(1), SOURCE, bytes32(uint256(uint160(address(0x2222)))),
            DEST, bytes32(uint256(uint160(address(recipient)))), bytes("bridge-payload")
        );
    }

    function _authorization(bytes memory message)
        internal view returns(XITADirectProtocol.Authorization memory a)
    {
        a = XITADirectProtocol.Authorization({
            sourceChainId: SOURCE, sourceDomain: SOURCE, destinationDomain: DEST,
            routeId: bytes32(uint256(0x123)), setId: 1, sourceBlockNumber: 999,
            sourceRegistry: address(0x1111), gateway: address(0x3333),
            sourceRouter: address(0x2222), sourceMailbox: address(0x4444),
            destinationRouter: address(recipient), validatorFeeWei: 1000,
            messageId: keccak256(message)
        });
    }

    function _metadata(XITADirectProtocol.Authorization memory a)
        internal pure returns(bytes memory)
    {
        return abi.encode(XITADirectBLSISM.Metadata(a, hex"03", hex"abcd"));
    }

    function _approve(XITADirectProtocol.Authorization memory a) internal {
        registry.authorize(ism.encodeAuthorization(a));
    }

    function testDirectTransportHasSingleZeroFeeHookNoMerkleTree() public {
        XITADirectTransport transport=new XITADirectTransport(DEST,address(ism));
        assertEq(address(transport.mailbox().defaultIsm()),address(ism));
        assertEq(address(transport.mailbox().defaultHook()),address(transport.dispatchHook()));
        assertEq(address(transport.mailbox().requiredHook()),address(transport.dispatchHook()));
        assertEq(address(transport.mailbox().owner()),address(transport));
    }

    function testDirectMessageWithCurrentBLSSetPasses() public {
        bytes memory m=_message();
        XITADirectProtocol.Authorization memory a=_authorization(m);
        _approve(a);
        assertTrue(ism.verify(_metadata(a),m));
    }

    function testNeverAcceptDifferentMessageOrForgedAuthorizedID() public {
        bytes memory m=_message();
        XITADirectProtocol.Authorization memory a=_authorization(m);
        _approve(a);
        assertFalse(ism.verify(_metadata(a),abi.encodePacked(m,bytes1(0x01))));
        a.messageId=bytes32(uint256(42));
        assertFalse(ism.verify(_metadata(a),m));
    }

    function testRetiredValidatorSetFailsClosed() public {
        bytes memory m=_message();
        XITADirectProtocol.Authorization memory a=_authorization(m);
        _approve(a);
        assertTrue(ism.verify(_metadata(a),m));
        registry.advanceSet();
        assertFalse(ism.verify(_metadata(a),m));
    }

    function testWrongAssetCannotMintEvenWithMatchingBLSPayload() public {
        bytes memory m=_message();
        XITADirectProtocol.Authorization memory a=_authorization(m);
        _approve(a);
        recipient.setAllow(false);
        assertFalse(ism.verify(_metadata(a),m));
    }

    function testNoCrossDestinationOrCrossRouteReplay() public {
        bytes memory m=_message();
        XITADirectProtocol.Authorization memory a=_authorization(m);
        _approve(a);
        a.destinationDomain=42161;
        assertFalse(ism.verify(_metadata(a),m));
        a=_authorization(m);
        a.routeId=bytes32(uint256(0xdead));
        assertFalse(ism.verify(_metadata(a),m));
        a=_authorization(m);
        a.sourceMailbox=address(0x9876);
        assertFalse(ism.verify(_metadata(a),m));
    }

    function testSignatureCannotBeUsedForAnotherISMDeployment() public {
        bytes memory m=_message();
        XITADirectProtocol.Authorization memory a=_authorization(m);
        _approve(a);
        XITADirectBLSISM another = new XITADirectBLSISM(address(registry));
        // Same registry, routes and validator keys; signed domain includes
        // destination ISM contract identity.
        assertFalse(another.verify(_metadata(a),m));
    }

    function testRecipientSenderAndSignatureTamperingFailClosed() public {
        bytes memory m=_message();
        XITADirectProtocol.Authorization memory a=_authorization(m);
        _approve(a);
        a.sourceRouter=address(0x7777);
        assertFalse(ism.verify(_metadata(a),m));
        a=_authorization(m);
        assertFalse(ism.verify(abi.encode(XITADirectBLSISM.Metadata(a,hex"03",hex"beef")),m));
    }

    function testNoMessageWithoutRouteOrFee() public {
        bytes memory m=_message();
        XITADirectProtocol.Authorization memory a=_authorization(m);
        a.validatorFeeWei=0;
        vm.expectRevert();
        ism.encodeAuthorization(a);
        a=_authorization(m);
        a.routeId=bytes32(0);
        vm.expectRevert();
        ism.encodeAuthorization(a);
    }
}
