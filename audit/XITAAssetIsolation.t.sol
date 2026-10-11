// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
// Local EVM regression only. No live keys, RPC, or production transactions.
import {Test} from "forge-std/Test.sol";
import {AuditBLSHarness,AuditMailbox,AuditERC20} from "./XITAPredeployReview.t.sol";
import {XGRInterchainValidatorRegistryV3} from "../contracts/XGRInterchainValidatorRegistryV3.sol";
import {XGRILNInterchainISMV2} from "../contracts/XGRILNInterchainISMV2.sol";
import {XGRILNProtocol} from "../contracts/XGRILNProtocol.sol";
import {XETATokenFactoryV315} from "../contracts/XETATokenFactoryV315.sol";
import {XETAGuardedNativeWarpRouter} from "../contracts/XETAGuardedNativeWarpRouter.sol";
import {ILNGateway} from "../contracts/ILNGateway.sol";
import {MockLocalGovernanceRegistry} from "../contracts/test/MockLocalGovernanceRegistry.sol";

contract AuditMessageMailbox {
    uint32 public immutable localDomain;
    bytes public lastMessage;
    uint32 private nonce;
    event Dispatch(address indexed sender,uint32 indexed destination,bytes32 indexed recipient,bytes message);
    constructor(uint32 domain){localDomain=domain;}
    function quoteDispatch(uint32,bytes32,bytes calldata,bytes calldata,address) external pure returns(uint256){return 0;}
    function dispatch(uint32 destination,bytes32 recipient,bytes calldata body,bytes calldata,address) external payable returns(bytes32){
        bytes memory message=abi.encodePacked(uint8(3),nonce++,localDomain,bytes32(uint256(uint160(msg.sender))),destination,recipient,body);
        lastMessage=message;emit Dispatch(msg.sender,destination,recipient,message);return keccak256(message);
    }
    function process(XGRILNInterchainISMV2 ism,bytes calldata metadata,bytes calldata message) external {
        require(ism.verify(metadata,message),"ISM rejected message");
        address recipient=address(uint160(uint256(bytes32(message[45:77]))));
        XETAGuardedNativeWarpRouter(payable(recipient)).handle(uint32(bytes4(message[5:9])),bytes32(message[9:41]),message[77:]);
    }
}
contract XITAAssetIsolationAudit is Test {
    function registry(AuditBLSHarness bls,uint32 domain) internal returns(XGRInterchainValidatorRegistryV3 r){
        address[] memory validators=new address[](1);validators[0]=address(0x1001);
        bytes[] memory compressed=new bytes[](1);bytes[] memory full=new bytes[](1);bytes[] memory proofs=new bytes[](1);
        compressed[0]=hex"97f1d3a73197d7942695638c4fa9ac0fc3688c4f9774b905a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bb";
        full[0]=hex"0000000000000000000000000000000017f1d3a73197d7942695638c4fa9ac0fc3688c4f9774b905a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bb0000000000000000000000000000000008b3f481e3aaa0f1a09e30ed741d8ae4fcf5e095d5d00af600db18cb2c04b3edd03cc744a2888ae40caa232946c5e7e1";
        proofs[0]=bls.signWithScalarOne(abi.encodePacked(bytes("XGR_INTERCHAIN_BOOTSTRAP_V1"),bytes8(uint64(1643)),bytes4(domain),bytes20(validators[0]),bytes2(uint16(48)),compressed[0],bytes2(uint16(128)),full[0]));
        r=new XGRInterchainValidatorRegistryV3{value:1 ether}(1643,domain,address(bls),2,1 ether,0.1 ether,validators,compressed,full,proofs);
    }
    function testSharedHubEscrowMustRejectDifferentSourceAsset() public {
        vm.deal(address(this),20 ether);vm.chainId(1643);
        AuditBLSHarness bls=new AuditBLSHarness();XGRInterchainValidatorRegistryV3 validators=registry(bls,1643);
        XGRILNInterchainISMV2 ism=new XGRILNInterchainISMV2(address(validators));
        AuditMessageMailbox hubMailbox=new AuditMessageMailbox(1643);
        XETATokenFactoryV315 hub=new XETATokenFactoryV315(1643,1643,address(validators),address(hubMailbox),address(hubMailbox),address(ism),500000,100);
        hub.deployRegistry();address native=hub.deployNativeXGRRouter(bytes32(uint256(1)));
        // Model native collateral deposited previously on another legitimate spoke.
        vm.deal(native,5 ether);

        vm.chainId(137);AuditMessageMailbox sourceMailbox=new AuditMessageMailbox(137);
        MockLocalGovernanceRegistry sourceValidators=new MockLocalGovernanceRegistry(137);
        XETATokenFactoryV315 source=new XETATokenFactoryV315(137,137,address(sourceValidators),address(sourceMailbox),address(sourceMailbox),address(ism),500000,100);
        source.deployRegistry();AuditERC20 unrelated=new AuditERC20();
        (bytes32 wrongAsset,address wrongRouter)=source.deployCollateralRouter(address(unrelated),bytes32(uint256(2)));
        assertNotEq(wrongAsset,hub.xgrAssetId());
        (bytes32 sourceRoute,address sourceGateway)=source.registerRoute(wrongRouter,1643,1643,native,address(0));
        vm.chainId(1643);hub.registerRoute(native,137,137,wrongRouter,address(unrelated));
        vm.chainId(137);unrelated.approve(sourceGateway,1 ether);
        ILNGateway(sourceGateway).bridge{value:100}(1643,bytes32(uint256(uint160(address(this)))),1 ether);
        bytes memory message=sourceMailbox.lastMessage();bytes32 leaf=keccak256(message);
        bytes32[32] memory proof;bytes32 root=leaf;
        for(uint256 i;i<32;i++)root=keccak256(abi.encodePacked(root,proof[i]));
        XGRILNProtocol.CheckpointPayload memory p=XGRILNProtocol.CheckpointPayload({
            sourceChainId:137,sourceDomain:137,destinationDomain:1643,routeId:sourceRoute,setId:1,
            sourceBlockNumber:uint64(block.number),registry:address(source.registry()),gateway:sourceGateway,
            sourceRouter:wrongRouter,mailbox:address(sourceMailbox),merkleTreeHook:address(sourceMailbox),
            destinationRouter:native,validatorFeeWei:100,authorizedMessageId:leaf,root:root,index:0
        });
        bytes memory sig=bls.signWithScalarOne(XGRILNProtocol.encodeCheckpointPayload(p));
        bytes memory metadata=abi.encode(uint32(0),proof,p.sourceChainId,p.sourceDomain,p.destinationDomain,p.routeId,p.setId,p.sourceBlockNumber,p.registry,p.gateway,p.sourceRouter,p.mailbox,p.merkleTreeHook,p.destinationRouter,p.validatorFeeWei,p.authorizedMessageId,p.root,p.index,hex"01",sig);
        vm.chainId(1643);
        uint256 beforeBalance=native.balance;
        // Supply a genuine signature over the exact source-event checkpoint.
        // This isolates ASSET authorization, not signature forgery.
        try hubMailbox.process(ism,metadata,message) {} catch {}
        emit log_named_uint("Hub escrow before unrelated-token message",beforeBalance);
        emit log_named_uint("Hub escrow after unrelated-token message",native.balance);
        assertEq(native.balance,beforeBalance,"Unrelated source ERC20 released shared native XGR escrow");
    }
    receive() external payable {}
}
