import test from "node:test";
import assert from "node:assert/strict";
import {Interface,keccak256,zeroPadValue} from "ethers";
import {ILN_OPERATION_EVENT} from "./xita-direct-codec.mjs";
import {verifiedSourceReceiptEvidence} from "./receipt-evidence.mjs";
const addr=n=>"0x"+n.toString(16).padStart(40,"0");
const txHash="0x"+"99".repeat(32),routeId="0x"+"11".repeat(32);
const message="0x"+"ab".repeat(80),messageId=keccak256(message),destinationDomain=8453;
const gateway=addr(1),sourceMailbox=addr(2),sourceRouter=addr(3),destinationRouter=addr(4);
const gatewayABI=new Interface([ILN_OPERATION_EVENT]);
const mailboxABI=new Interface(["event Dispatch(address indexed sender,uint32 indexed destination,bytes32 indexed recipient,bytes message)"]);
const g=()=>({...gatewayABI.encodeEventLog(gatewayABI.getEvent("ILNOperation"),
 [routeId,messageId,destinationDomain,100000000000000000n]),address:gateway});
const d=()=>({...mailboxABI.encodeEventLog(mailboxABI.getEvent("Dispatch"),
 [sourceRouter,destinationDomain,zeroPadValue(destinationRouter,32),message]),address:sourceMailbox});
const sample=()=>({receipt:{status:1,blockNumber:1200,hash:txHash,logs:[g(),d()]},
 sourceTxHash:txHash,routeId,messageId,destinationDomain,gateway,sourceRouter,sourceMailbox,destinationRouter});
test("source receipt binds Gateway fee, Mailbox Dispatch, route and recipient",()=>{
 const proof=verifiedSourceReceiptEvidence(sample());
 assert.equal(proof.blockNumber,1200);
 assert.equal(proof.validatorFeeWei,100000000000000000n);
 assert.equal(proof.message,message);
 assert.equal(proof.transactionHash,txHash);
});
test("failed, spoofed, mismatching or duplicate events fail closed",()=>{
 const b=sample();
 for(const patch of [
  {receipt:{...b.receipt,status:0}},
  {receipt:{...b.receipt,hash:"0x"+"ee".repeat(32)}},
  {receipt:{...b.receipt,logs:[g()]}},
  {receipt:{...b.receipt,logs:[d()]}},
  {receipt:{...b.receipt,logs:[g(),g(),d()]}},
  {receipt:{...b.receipt,logs:[g(),d(),d()]}},
  {routeId:"0x"+"ff".repeat(32)},
  {messageId:"0x"+"dd".repeat(32)},
  {sourceRouter:addr(52)},
  {destinationRouter:addr(53)},
  {destinationDomain:1643}
 ])assert.throws(()=>verifiedSourceReceiptEvidence({...b,...patch}));
});
test("unrelated Gateway operations do not invalidate an otherwise unique proof",()=>{
 const b=sample();const other=g();
 other.topics=[...other.topics];other.topics[1]="0x"+"aa".repeat(32);
 b.receipt.logs.unshift(other);
 assert.equal(verifiedSourceReceiptEvidence(b).validatorFeeWei,100000000000000000n);
});
