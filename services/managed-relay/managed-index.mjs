// Rebuildable SOURCE receipt projection for THIS operator's ExecutionGateway,
// not an ILN protocol indexer. No relayer TX hash or HTTP assertion is proof.
import {Interface,keccak256,zeroPadValue} from "ethers";
import {deployedRoutes} from "../../apps/web/route-availability.js";
const HASH=/^0x[0-9a-f]{64}$/i,ADDRESS=/^0x[0-9a-f]{40}$/i;
const eq=(a,b)=>typeof a==="string"&&typeof b==="string"&&a.toLowerCase()===b.toLowerCase();
const check=(v,msg)=>{if(!v)throw Error(msg)};
export const managedAbi=[
 "event ManagedDispatch(bytes32 indexed messageId,address indexed payer,address indexed gateway,bytes32 routeId,uint32 destinationDomain,bytes32 recipient,uint256 amount,uint256 validatorFeeWei,uint256 bridgeNativeWei,uint256 relayerFeeWei,uint256 quoteNonce)",
 "function feeReceipt(bytes32 messageId) view returns (address payer,address gateway,uint256 relayerFeeWei,bool exists,bool withdrawn)"
];
const adapter=new Interface(managedAbi);
const iln=new Interface([
 "event ILNOperation(bytes32 indexed routeId,bytes32 indexed messageId,uint32 indexed destinationDomain,uint256 validatorFeeWei)"
]);
const mailbox=new Interface([
 "event Dispatch(address indexed sender,uint32 indexed destination,bytes32 indexed recipient,bytes message)"
]);
const parse=(iface,log,name)=>{
 try{const decoded=iface.parseLog(log);return decoded?.name===name?decoded:null;}
 catch{return null}
};
export const managedDispatchTopic=adapter.getEvent("ManagedDispatch").topicHash;
export function verifiedManagedReceipt({catalog,sourceChain,executionAddress,receipt,messageId=null}){
 check(ADDRESS.test(executionAddress||"")&&receipt?.status===1&&
  Number.isSafeInteger(receipt?.blockNumber)&&receipt.blockNumber>0&&
  HASH.test(receipt?.hash||receipt?.transactionHash||"")&&
  HASH.test(receipt?.blockHash||"")&&Array.isArray(receipt?.logs),
  "Unconfirmed or malformed managed source receipt");
 const managed=[];
 for(const log of receipt.logs){
  if(eq(log.address,executionAddress)){
   const decoded=parse(adapter,log,"ManagedDispatch");
   if(decoded&&(!messageId||eq(decoded.args.messageId,messageId)))managed.push(decoded);
  }
 }
 check(managed.length===1,"Expected exactly one canonical ManagedDispatch in source tx");
 const evt=managed[0].args,receiptHash=receipt.hash||receipt.transactionHash;
 const routes=deployedRoutes(catalog).filter(r=>
  r.source===sourceChain&&eq(r.gateway,evt.gateway)&&eq(r.routeId,evt.routeId)&&
  catalog.chains[r.destination]?.domainId===Number(evt.destinationDomain));
 check(routes.length===1,"ManagedDispatch not bound to a unique canonical ILN route");
 const route=routes[0],srcMailbox=catalog.infrastructure[sourceChain]?.xitaV315?.components?.mailbox?.address;
 check(ADDRESS.test(srcMailbox||"")&&ADDRESS.test(route.sourceRouter||"")&&
  ADDRESS.test(route.destinationRouter||"")&&HASH.test(evt.messageId||""),
  "Missing canonical source route binding");
 const matchedOperation=[],matchedDispatch=[];
 for(const log of receipt.logs){
  if(eq(log.address,route.gateway)){
   const parsed=parse(iln,log,"ILNOperation");
   if(parsed&&eq(parsed.args.messageId,evt.messageId)&&
      eq(parsed.args.routeId,evt.routeId)&&
      Number(parsed.args.destinationDomain)===Number(evt.destinationDomain)&&
      BigInt(parsed.args.validatorFeeWei)===BigInt(evt.validatorFeeWei))
    matchedOperation.push(parsed);
  }
  if(eq(log.address,srcMailbox)){
   const parsed=parse(mailbox,log,"Dispatch");
   if(parsed&&eq(parsed.args.sender,route.sourceRouter)&&
    Number(parsed.args.destination)===Number(evt.destinationDomain)&&
    eq(parsed.args.recipient,zeroPadValue(route.destinationRouter,32))&&
    eq(keccak256(parsed.args.message),evt.messageId))
    matchedDispatch.push(parsed);
  }
 }
 check(matchedOperation.length===1&&matchedDispatch.length===1,
  "ManagedDispatch is not anchored in canonical Gateway+Mailbox source events");
 check(BigInt(evt.amount)>0n&&BigInt(evt.validatorFeeWei)>0n&&
  BigInt(evt.bridgeNativeWei)>=BigInt(evt.validatorFeeWei)&&
  BigInt(evt.relayerFeeWei)>=0n,"Invalid managed fees");
 return {
  sourceChain,destinationChain:route.destination,asset:route.asset,
  routeName:route.name,routeId:route.routeId,
  sourceTxHash:receiptHash.toLowerCase(),
  sourceBlockNumber:receipt.blockNumber,sourceBlockHash:receipt.blockHash.toLowerCase(),
  messageId:evt.messageId.toLowerCase(),payer:evt.payer.toLowerCase(),
  gateway:route.gateway.toLowerCase(),executionGateway:executionAddress.toLowerCase(),
  amountRaw:evt.amount.toString(),validatorFeeWei:evt.validatorFeeWei.toString(),
  bridgeNativeWei:evt.bridgeNativeWei.toString(),
  serviceFeeWei:evt.relayerFeeWei.toString(),quoteNonce:evt.quoteNonce.toString(),
  destinationTxHash:null,delivered:null
 };
}
export function mergeIndexedMessage(state,record){
 const key=record.sourceChain+":"+record.messageId.toLowerCase();
 const prev=state[key];
 if(prev){
  for(const name of ["sourceTxHash","sourceBlockHash","gateway","routeId","payer",
    "serviceFeeWei"]){
   if(String(prev[name]).toLowerCase()!==String(record[name]).toLowerCase())
    throw Error("Conflicting canonical managed dispatch, rebuild required");
  }
  return {state,key,added:false};
 }
 return {state:{...state,[key]:record},key,added:true};
}
