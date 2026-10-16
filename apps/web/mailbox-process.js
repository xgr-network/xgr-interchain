// Canonical ABI decoder for Mailbox.process(bytes metadata, bytes message).
// The wallet must never pay destination gas for a different source message.
import {selector,keccak256} from "./keccak.js";
const HEX=/^0x(?:[0-9a-f]{2})+$/i;
const MAX_CALLDATA_CHARS=262144;
export function sourceBoundMailboxProcess(data,expectedMessageId){
 if(typeof data!=="string"||data.length>MAX_CALLDATA_CHARS||!HEX.test(data)||
    !/^0x[0-9a-f]{64}$/i.test(expectedMessageId||"")||
    data.slice(0,10).toLowerCase()!==selector("process(bytes,bytes)"))
  throw Error("Invalid Mailbox.process calldata");
 const hex=data.slice(10).toLowerCase();
 const bytes=hex.length/2;
 function word(offset){
  if(!Number.isSafeInteger(offset)||offset<0||offset+32>bytes)
   throw Error("Malformed Mailbox.process ABI");
  return BigInt("0x"+hex.slice(offset*2,(offset+32)*2));
 }
 function number(value){
  if(value>BigInt(Number.MAX_SAFE_INTEGER))throw Error("Oversized Mailbox.process ABI offset");
  return Number(value);
 }
 function item(offset){
  if(offset%32!==0||offset<64||offset+32>bytes)
   throw Error("Malformed Mailbox.process ABI offset");
  const size=number(word(offset));
  const padded=Math.ceil(size/32)*32;
  const end=offset+32+padded;
  if(end>bytes)throw Error("Truncated Mailbox.process payload");
  const dataStart=(offset+32)*2;
  const body=hex.slice(dataStart,dataStart+size*2);
  const padding=hex.slice(dataStart+size*2,end*2);
  if(/[^0]/.test(padding))throw Error("Noncanonical Mailbox.process padding");
  return {body,end};
 }
 if(bytes<64)throw Error("Incomplete Mailbox.process ABI");
 const metaOffset=number(word(0)),msgOffset=number(word(32));
 if(metaOffset!==64)throw Error("Unexpected Mailbox.process metadata offset");
 const metadata=item(metaOffset);
 if(msgOffset!==metadata.end)throw Error("Unexpected Mailbox.process message offset");
 const message=item(msgOffset);
 if(message.end!==bytes)throw Error("Unexpected trailing Mailbox.process bytes");
 const raw=new Uint8Array(message.body.length/2);
 for(let i=0;i<raw.length;i++)raw[i]=parseInt(message.body.slice(i*2,i*2+2),16);
 const actual=keccak256(raw);
 if(actual.toLowerCase()!==expectedMessageId.toLowerCase())
  throw Error("Mailbox.process message does not match confirmed source message ID");
 return {messageId:actual,metadataLength:metadata.body.length/2,messageLength:raw.length};
}
