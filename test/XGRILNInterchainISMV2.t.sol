// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {XGRInterchainValidatorRegistryV2} from "../contracts/XGRInterchainValidatorRegistryV2.sol";
import {XGRILNInterchainISMV2} from "../contracts/XGRILNInterchainISMV2.sol";
import {XGRILNProtocol} from "../contracts/XGRILNProtocol.sol";
import {MockXGRInterchainBLSVerifier} from "../contracts/test/MockXGRInterchainBLSVerifier.sol";

contract XGRILNInterchainISMV2Test is Test {
    XGRILNInterchainISMV2 internal ism;

    uint64 internal constant SOURCE_CHAIN_ID = 8453;
    uint32 internal constant SOURCE_DOMAIN = 8453;
    uint32 internal constant DESTINATION_DOMAIN = 1643;
    bytes32 internal constant ROUTE_ID =
        0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa;

    address internal constant SOURCE_REGISTRY =
        0x1010101010101010101010101010101010101010;
    address internal constant SOURCE_GATEWAY =
        0x1111111111111111111111111111111111111111;
    address internal constant SOURCE_ROUTER =
        0x2222222222222222222222222222222222222222;
    address internal constant SOURCE_MAILBOX =
        0x3333333333333333333333333333333333333333;
    address internal constant SOURCE_HOOK =
        0x4444444444444444444444444444444444444444;
    address internal constant DEST_ROUTER =
        0x5555555555555555555555555555555555555555;

    function setUp() public {
        vm.deal(address(this), 10 ether);
        MockXGRInterchainBLSVerifier verifier =
            new MockXGRInterchainBLSVerifier();

        address[] memory validators = new address[](3);
        bytes[] memory compressed = new bytes[](3);
        bytes[] memory eip = new bytes[](3);
        bytes[] memory proofs = new bytes[](3);

        for (uint256 i = 0; i < 3; i++) {
            validators[i] = address(uint160(0xA1 + i));
            compressed[i] = _bytes(48, uint8(i + 1));
            eip[i] = _bytes(128, uint8(i + 11));
            proofs[i] = _bytes(96, uint8(i + 21));
        }

        XGRInterchainValidatorRegistryV2 registry =
            new XGRInterchainValidatorRegistryV2{value: 3 ether}(
                1643,
                DESTINATION_DOMAIN,
                address(verifier),
                1,
                1 ether,
                0.1 ether,
                validators,
                compressed,
                eip,
                proofs
            );

        ism = new XGRILNInterchainISMV2(address(registry));
    }

    function testCheckpointPayloadMatchesGoCanonicalVector() public pure {
        XGRILNProtocol.CheckpointPayload memory payload =
            XGRILNProtocol.CheckpointPayload({
                sourceChainId: 8453,
                sourceDomain: 8453,
                destinationDomain: 1643,
                routeId: ROUTE_ID,
                setId: 9,
                sourceBlockNumber: 123456,
                registry: 0x5555555555555555555555555555555555555555,
                gateway: 0x1111111111111111111111111111111111111111,
                sourceRouter: 0x6666666666666666666666666666666666666666,
                mailbox: 0x2222222222222222222222222222222222222222,
                merkleTreeHook: 0x3333333333333333333333333333333333333333,
                destinationRouter: 0x4444444444444444444444444444444444444444,
                validatorFeeWei: 12345,
                authorizedMessageId:
                    0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
                root:
                    0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
                index: 17
            });

        bytes memory expected =
            hex"5847525f494c4e5f434845434b504f494e545f56320000000000002105000021050000066baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000000009000000000001e2405555555555555555555555555555555555555555111111111111111111111111111111111111111166666666666666666666666666666666666666662222222222222222222222222222222222222222333333333333333333333333333333333333333344444444444444444444444444444444444444440000000000000000000000000000000000000000000000000000000000003039bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00000011";

        assertEq(XGRILNProtocol.encodeCheckpointPayload(payload), expected);
    }

    function testMessageSpecificRouteAuthorizationVerifies() public view {
        bytes memory message = _message();
        bytes32 messageId = keccak256(message);
        bytes32[32] memory proof = _singleLeafProof();
        bytes32 root = _branchRoot(messageId, proof, 0);

        bytes memory metadata = abi.encode(
            uint32(0),
            proof,
            SOURCE_CHAIN_ID,
            SOURCE_DOMAIN,
            DESTINATION_DOMAIN,
            ROUTE_ID,
            uint64(1),
            uint64(123456),
            SOURCE_REGISTRY,
            SOURCE_GATEWAY,
            SOURCE_ROUTER,
            SOURCE_MAILBOX,
            SOURCE_HOOK,
            DEST_ROUTER,
            uint256(1000),
            messageId,
            root,
            uint32(0),
            hex"03",
            _bytes(96, 0x77)
        );

        assertTrue(ism.verify(metadata, message));
    }

    function testRetiredSetCannotAuthorizeDeliveryAfterRotation() public {
        bytes memory message = _message();
        bytes32 messageId = keccak256(message);
        bytes32[32] memory proof = _singleLeafProof();
        bytes32 root = _branchRoot(messageId, proof, 0);

        bytes memory metadata = abi.encode(
            uint32(0), proof,
            SOURCE_CHAIN_ID, SOURCE_DOMAIN, DESTINATION_DOMAIN, ROUTE_ID,
            uint64(1), uint64(123456),
            SOURCE_REGISTRY, SOURCE_GATEWAY, SOURCE_ROUTER, SOURCE_MAILBOX,
            SOURCE_HOOK, DEST_ROUTER, uint256(1000), messageId, root,
            uint32(0), hex"03", _bytes(96, 0x77)
        );
        assertTrue(ism.verify(metadata, message));

        // The same valid signed checkpoint must not retain authority
        // once the destination RegistryV2 membership advances.
        XGRInterchainValidatorRegistryV2 registry =
            XGRInterchainValidatorRegistryV2(payable(address(ism.registry())));
        registry.applyMembership{value: 1 ether}(
            XGRInterchainValidatorRegistryV2.MembershipTransition({
                expectedSetId: 1,
                validUntil: uint64(block.timestamp + 5 minutes),
                action: 1,
                validator: address(0xD4),
                blsPublicKey: _bytes(48, 0x44),
                blsPublicKeyEIP2537: _bytes(128, 0x54)
            }),
            hex"03",
            _bytes(96, 0x66)
        );
        assertEq(registry.setId(), 2);
        assertFalse(ism.verify(metadata, message));
    }

    function testDifferentAuthorizedMessageIdRejected() public view {
        bytes memory message = _message();
        bytes32[32] memory proof = _singleLeafProof();
        bytes32 root = _branchRoot(keccak256(message), proof, 0);

        bytes memory metadata = abi.encode(
            uint32(0),
            proof,
            SOURCE_CHAIN_ID,
            SOURCE_DOMAIN,
            DESTINATION_DOMAIN,
            ROUTE_ID,
            uint64(1),
            uint64(123456),
            SOURCE_REGISTRY,
            SOURCE_GATEWAY,
            SOURCE_ROUTER,
            SOURCE_MAILBOX,
            SOURCE_HOOK,
            DEST_ROUTER,
            uint256(1000),
            bytes32(uint256(0xDEAD)),
            root,
            uint32(0),
            hex"03",
            _bytes(96, 0x77)
        );

        assertFalse(ism.verify(metadata, message));
    }

    function testWrongRouteRouterBindingRejected() public view {
        bytes memory message = _message();
        bytes32 messageId = keccak256(message);
        bytes32[32] memory proof = _singleLeafProof();
        bytes32 root = _branchRoot(messageId, proof, 0);

        bytes memory metadata = abi.encode(
            uint32(0),
            proof,
            SOURCE_CHAIN_ID,
            SOURCE_DOMAIN,
            DESTINATION_DOMAIN,
            ROUTE_ID,
            uint64(1),
            uint64(123456),
            SOURCE_REGISTRY,
            SOURCE_GATEWAY,
            address(0x9999),
            SOURCE_MAILBOX,
            SOURCE_HOOK,
            DEST_ROUTER,
            uint256(1000),
            messageId,
            root,
            uint32(0),
            hex"03",
            _bytes(96, 0x77)
        );

        assertFalse(ism.verify(metadata, message));
    }

    function testWrongDestinationRejected() public view {
        bytes memory message = _message();
        bytes32 messageId = keccak256(message);
        bytes32[32] memory proof = _singleLeafProof();
        bytes32 root = _branchRoot(messageId, proof, 0);

        bytes memory metadata = abi.encode(
            uint32(0),
            proof,
            SOURCE_CHAIN_ID,
            SOURCE_DOMAIN,
            uint32(42161),
            ROUTE_ID,
            uint64(1),
            uint64(123456),
            SOURCE_REGISTRY,
            SOURCE_GATEWAY,
            SOURCE_ROUTER,
            SOURCE_MAILBOX,
            SOURCE_HOOK,
            DEST_ROUTER,
            uint256(1000),
            messageId,
            root,
            uint32(0),
            hex"03",
            _bytes(96, 0x77)
        );

        assertFalse(ism.verify(metadata, message));
    }

    function _message() internal pure returns (bytes memory) {
        return abi.encodePacked(
            uint8(3),
            uint32(7),
            SOURCE_DOMAIN,
            bytes32(uint256(uint160(SOURCE_ROUTER))),
            DESTINATION_DOMAIN,
            bytes32(uint256(uint160(DEST_ROUTER))),
            bytes("iln-v3.1.3")
        );
    }

    function _singleLeafProof()
        internal
        pure
        returns (bytes32[32] memory proof)
    {
        bytes32 zero;
        for (uint256 i = 0; i < 32; i++) {
            proof[i] = zero;
            zero = keccak256(abi.encodePacked(zero, zero));
        }
    }

    function _branchRoot(
        bytes32 item,
        bytes32[32] memory branch,
        uint256 index
    ) internal pure returns (bytes32 current) {
        current = item;
        for (uint256 i = 0; i < 32; i++) {
            bytes32 sibling = branch[i];
            if (((index >> i) & 1) == 1) {
                current = keccak256(abi.encodePacked(sibling, current));
            } else {
                current = keccak256(abi.encodePacked(current, sibling));
            }
        }
    }

    function _bytes(uint256 length, uint8 value)
        internal
        pure
        returns (bytes memory out)
    {
        out = new bytes(length);
        for (uint256 i = 0; i < length; i++) {
            out[i] = bytes1(value);
        }
    }
}
