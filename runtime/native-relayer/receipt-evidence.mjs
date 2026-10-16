// Pure receipt validation: gateway fee and mailbox message must come from
// one successful canonical source transaction, never from caller-supplied data.
import {Interface,keccak256,zeroPadValue} from "ethers";
import {ILN_OPERATION_EVENT} from "./iln-codec.mjs";
const gatewayInterface=new Interface([ILN_OPERATION_EVENT]);
const mailboxInterface=new Interface([
 "event Dispatch(address indexed sender,uint32 indexed destination,bytes32 indexed recipient,bytes message)"
]);
const HASH=/^0x[0-9a-f]{64}$/i,ADDRESS=/^0x[0-9a-f]{40}$/i;
const eq=(a,b)=>typeof a==="string"&&typeof b==="string"&&a.toLowerCase()===b.toLowerCase();
const check=(valid,message)=>{if(!valid)throw Error(message)};
export function verifiedSourceReceiptEvidence({
 receipt,sourceTxHash,routeId,messageId,destinationDomain,
 gateway,sourceRouter,sourceMailbox,destinationRouter
}){
 check([sourceTxHash,routeId,messageId].every(x=>HASH.test(x||""))&&
  [gateway,sourceRouter,sourceMailbox,destinationRouter].every(x=>ADDRESS.test(x||""))&&
  Number.isSafeInteger(destinationDomain)&&destinationDomain>0,
  "invalid source receipt identity");
 check(receipt?.status===1&&Number.isSafeInteger(receipt.blockNumber)&&
  receipt.blockNumber>0&&Array.isArray(receipt.logs),
  "canonical source transaction not successful or not indexed");
 if(receipt.hash!==undefined)check(eq(receipt.hash,sourceTxHash),"source receipt hash mismatch");
 if(receipt.transactionHash!==undefined)
  check(eq(receipt.transactionHash,sourceTxHash),"source receipt transaction mismatch");
 const operations=[],dispatches=[],recipient=zeroPadValue(destinationRouter,32);
 for(const log of receipt.logs){
  if(eq(log?.address,gateway)){
   try{
    const parsed=gatewayInterface.parseLog(log);
    if(parsed?.name==="ILNOperation"&&eq(parsed.args.routeId,routeId)&&
      eq(parsed.args.messageId,messageId)&&
      Number(parsed.args.destinationDomain)===destinationDomain)
      operations.push(parsed);
   }catch{}
  }
  if(eq(log?.address,sourceMailbox)){
   try{
    const parsed=mailboxInterface.parseLog(log);
    if(parsed?.name==="Dispatch"&&eq(parsed.args.sender,sourceRouter)&&
      Number(parsed.args.destination)===destinationDomain&&
      eq(parsed.args.recipient,recipient)&&
      eq(keccak256(parsed.args.message),messageId))dispatches.push(parsed);
   }catch{}
  }
 }
 check(operations.length===1&&dispatches.length===1,
  "source transaction lacks unique canonical Gateway operation and Mailbox Dispatch");
 const validatorFeeWei=BigInt(operations[0].args.validatorFeeWei);
 check(validatorFeeWei>0n,"source Gateway validator fee is not positive");
 return {
  blockNumber:receipt.blockNumber,transactionHash:sourceTxHash.toLowerCase(),
  validatorFeeWei,message:dispatches[0].args.message
 };
}
