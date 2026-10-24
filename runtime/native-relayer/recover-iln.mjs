// Prepare unsigned, wallet-owned Mailbox.process calldata from one canonical
// fee-qualified source receipt and one current-set Direct BLS attestation.
// No Merkle, relayer custody, source re-execution or historical eth_call.
import {JsonRpcProvider,Contract,getAddress,getBytes,keccak256} from "ethers";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {verifiedSourceReceiptEvidence} from "./receipt-evidence.mjs";
import {verifySourceFinalityReceipt} from "./source-finality.mjs";
import {encodeDirectBLSPayload,encodeDirectISMMetadata} from "./xita-direct-codec.mjs";

const hash=/^0x[0-9a-f]{64}$/i;
const name=k=>{const v=process.env[k];if(!v)throw Error("Missing "+k);return v};
const address=k=>getAddress(name(k));
const number=k=>{const n=Number(name(k));if(!Number.isSafeInteger(n)||n<1)throw Error("Invalid "+k);return n};
const equals=(label,a,b)=>{
 if(String(a).toLowerCase()!==String(b).toLowerCase())throw Error(label+" mismatch");
};
const check=(ok,msg)=>{if(!ok)throw Error(msg)};
let stage="init";
const mark=x=>{stage=x;console.error("XITA_RECOVERY_STAGE:"+x)};
const cliMessageID=String(process.argv[2]||"").toLowerCase();
let route="";
export async function prepareDirectILN(messageID,overrideSourceTxHash=null){
 const id=String(messageID||"").toLowerCase();
 check(hash.test(id)&&BigInt(id)>0n,"Invalid source Message ID");
 const srcChain=BigInt(number("ORIGIN_CHAIN_ID"));
 const srcDomain=number("ORIGIN_DOMAIN");
 const destChain=BigInt(number("DESTINATION_CHAIN_ID"));
 const destDomain=number("DESTINATION_DOMAIN");
 const sourceTxHash=String(overrideSourceTxHash||name("SOURCE_TX_HASH")).toLowerCase();
 check(hash.test(sourceTxHash),"Original Source TX hash required");
 const routeId=name("ROUTE_ID").toLowerCase();
 check(hash.test(routeId)&&BigInt(routeId)>0n,"Invalid canonical route ID");
 route=name("ATTESTATION_ROUTE").toLowerCase();
 const srcMailbox=address("ORIGIN_MAILBOX"),gatewayAddress=address("ORIGIN_ILN_GATEWAY");
 const srcRouter=address("ORIGIN_WARP_ROUTER"),srcRegistryAddress=address("ORIGIN_ILN_REGISTRY");
 const destMailboxAddress=address("DESTINATION_MAILBOX"),destRouter=address("DESTINATION_WARP_ROUTER");
 const destISMAddress=address("DESTINATION_ILN_ISM");
 const src=new JsonRpcProvider(name("ORIGIN_RPC_URL"));
 const dest=new JsonRpcProvider(name("DESTINATION_RPC_URL"));
 const xgr=new JsonRpcProvider(name("ATTESTATION_RPC_URL"));
 const mailboxABI=[
  "function delivered(bytes32) view returns(bool)",
  "function defaultIsm() view returns(address)",
  "function process(bytes,bytes)"
 ];
 const destMailbox=new Contract(destMailboxAddress,mailboxABI,dest);
 const sourceRegistry=new Contract(srcRegistryAddress,[
  "function factory() view returns(address)",
  "function getRoute(uint32,bytes32) view returns(uint64 sourceChainId,uint32 sourceDomain,address gateway,address sourceRouter,address mailbox,address dispatchHook,address destinationRouter,uint256 validatorFeeWei,bool enabled)"
 ],src);
 const gateway=new Contract(gatewayAddress,[
  "function feeVault() view returns(address)",
  "function ilnRegistry() view returns(address)",
  "function warpRouter() view returns(address)"
 ],src);
 const ism=new Contract(destISMAddress,[
  "function registry() view returns(address)",
  "function destinationDomain() view returns(uint32)"
 ],dest);

 mark("verify-chain-ids");
 const ids=await Promise.all([src.send("eth_chainId",[]),dest.send("eth_chainId",[]),xgr.send("eth_chainId",[])]);
 check(BigInt(ids[0])===srcChain&&BigInt(ids[1])===destChain&&BigInt(ids[2])===1643n,
  "Configured source/destination or quorum RPC chain ID mismatch");

 mark("destination-delivery");
 if(await destMailbox.delivered(id)){
  return {status:"ALREADY_DELIVERED",messageId:id};
 }
 equals("Current destination Mailbox ISM",await destMailbox.defaultIsm(),destISMAddress);
 const [setRegistry,ismDomain]=await Promise.all([ism.registry(),ism.destinationDomain()]);
 check(Number(ismDomain)===destDomain,"Destination ISM domain mismatch");
 const set=new Contract(setRegistry,[
  "function setId() view returns(uint64)",
  "function verifierKeyFormat() view returns(uint8)"
 ],dest);
 const [setId,signatureFormat]=await Promise.all([set.setId(),set.verifierKeyFormat()]);

 mark("source-receipt");
 const receipt=await src.getTransactionReceipt(sourceTxHash);
  check(receipt&&receipt.status===1,"Original source receipt unsuccessful");
  check(receipt.hash?.toLowerCase()===sourceTxHash,"Original source receipt identity mismatch");
  await verifySourceFinalityReceipt(src,Number(srcChain),receipt);
 const evidence=verifiedSourceReceiptEvidence({
  receipt,sourceTxHash,routeId,messageId:id,destinationDomain:destDomain,
  gateway:gatewayAddress,sourceRouter:srcRouter,sourceMailbox:srcMailbox,
  destinationRouter:destRouter
 });
 const sourceBlock=evidence.blockNumber, message=evidence.message;
 check(keccak256(message).toLowerCase()===id,"Original source Hyperlane message mismatch");

 mark("source-route");
 const [factory,reg,router,routeData]=await Promise.all([
  sourceRegistry.factory(),gateway.ilnRegistry(),gateway.warpRouter(),
  sourceRegistry.getRoute(destDomain,routeId)
 ]);
 check(factory!=="0x0000000000000000000000000000000000000000",
  "Append-only source route registry not deployed");
 equals("Gateway registry",reg,srcRegistryAddress);
 equals("Gateway source router",router,srcRouter);
 check(BigInt(routeData.sourceChainId)===srcChain&&Number(routeData.sourceDomain)===srcDomain,
  "Canonical source chain/domain mismatch");
 equals("Recorded route Gateway",routeData.gateway,gatewayAddress);
 equals("Recorded route Router",routeData.sourceRouter,srcRouter);
 equals("Recorded route Mailbox",routeData.mailbox,srcMailbox);
 equals("Recorded destination Router",routeData.destinationRouter,destRouter);
 // Route may later be disabled, but the original successful Gateway receipt
 // remains eligible for delivery. No historical contract-state call.

 mark("confirmed-fee-vault-allocation");
 const vault=new Contract(await gateway.feeVault(),[
  "function allocatedOperation(bytes32) view returns(bool)",
  "function allocatedSetId(bytes32) view returns(uint64)",
  "function gateway() view returns(address)",
  "function routeId() view returns(bytes32)",
  "function destinationDomain() view returns(uint32)"
 ],src);
 const [paid,allocatedSet,vaultGateway,vaultRoute,vaultDomain]=await Promise.all([
  vault.allocatedOperation(id),vault.allocatedSetId(id),vault.gateway(),
  vault.routeId(),vault.destinationDomain()
 ]);
 check(paid&&BigInt(allocatedSet)>0n,"Source validator fee not durably allocated");
 equals("FeeVault Gateway",vaultGateway,gatewayAddress);
 equals("FeeVault route",vaultRoute,routeId);
 check(Number(vaultDomain)===destDomain,"FeeVault destination domain mismatch");

 mark("get-validator-attestation");
 let attestation;
 try{attestation=await xgr.send("xgr_getILNQuorumAttestation",[route,id,Number(setId)])}
 catch{
  await xgr.send("xgr_requestILNQuorum",[route,id,sourceBlock]);
  return {status:"PENDING",messageId:id,route,
    sourceBlockNumber:sourceBlock,currentSetId:String(setId)};
 }

 mark("validate-attestation");
 check(attestation.version==="XITA_DIRECT_MESSAGE_V1","Unsupported/legacy Merkle attestation");
 equals("Attestation route name",attestation.chain,route);
 equals("Attested Message ID",attestation.authorizedMessageId,id);
 equals("Attested route",attestation.routeId,routeId);
 equals("Attested source registry",attestation.registry,srcRegistryAddress);
 equals("Attested source Gateway",attestation.gateway,gatewayAddress);
 equals("Attested source Router",attestation.sourceRouter,srcRouter);
 equals("Attested source Mailbox",attestation.mailbox,srcMailbox);
 equals("Attested destination Router",attestation.destinationRouter,destRouter);
 equals("Attested destination ISM",attestation.destinationIsm,destISMAddress);
 equals("Attested destination Registry",attestation.destinationRegistry,setRegistry);
 check(BigInt(attestation.originChainId)===srcChain&&Number(attestation.originDomain)===srcDomain&&
       Number(attestation.destinationDomain)===destDomain&&
       BigInt(attestation.setId)===BigInt(setId)&&
       Number(attestation.sourceBlockNumber)===sourceBlock&&
       BigInt(attestation.validatorFeeWei)===evidence.validatorFeeWei,
       "Source event/finality, fee or current BLS validator set mismatch");

 const authorization={
  sourceChainId:srcChain,sourceDomain:srcDomain,destinationDomain:destDomain,
  routeId,setId:BigInt(setId),sourceBlockNumber:BigInt(sourceBlock),
  sourceRegistry:srcRegistryAddress,gateway:gatewayAddress,
  sourceRouter:srcRouter,sourceMailbox:srcMailbox,
  destinationRouter:destRouter,validatorFeeWei:evidence.validatorFeeWei,
  messageId:id,destinationIsm:destISMAddress,destinationRegistry:setRegistry
 };
 const raw=encodeDirectBLSPayload(authorization);
 equals("Exact canonical Direct-BLS signed bytes",raw,attestation.payload);
 const format=Number(signatureFormat);
 const signature=format===1?attestation.aggregateSignatureCompressed:
                 format===2?attestation.aggregateSignature:null;
 check(signature&&[96,256].includes(getBytes(signature).length)&&
       getBytes(signature).length===(format===1?96:256),
       "Destination BLS signature format not supported");
 const metadata=encodeDirectISMMetadata({
  authorization,signerBitmap:attestation.signerBitmap,aggregateSignature:signature
 });

 mark("simulate-destination-delivery");
 await destMailbox.process.staticCall(metadata,message);
 check(BigInt(await set.setId())===BigInt(setId),"Destination validator set rotated during preparation");
 check(!(await destMailbox.delivered(id)),"Already delivered during recovery");

 return {status:"READY_UNSIGNED_CALL",route,messageId:id,
  setId:String(setId),sourceBlockNumber:sourceBlock,
  destinationChainId:String(destChain),to:destMailboxAddress,value:"0x0",
  data:destMailbox.interface.encodeFunctionData("process",[metadata,message])};
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 prepareDirectILN(cliMessageID).then(result=>{
  console.log(JSON.stringify(result));
 }).catch(error=>{
  const code=error?.info?.error?.code||error?.code||null;
  console.error("XITA_RECOVERY_DIAGNOSTIC:"+JSON.stringify({
   status:"RECOVERY_NOT_READY",messageId:cliMessageID,route,stage,
   rpcCode:Number.isInteger(code)?code:null,
   error:String(error?.shortMessage||error?.message||"Unknown direct BLS failure").slice(0,1200)
  }));
  process.exitCode=1;
 });
}
