import test from "node:test";
import assert from "node:assert/strict";
import {AbiCoder} from "ethers";
import {
 XITA_DIRECT_DOMAIN,DIRECT_METADATA_TYPE,requireDirectAuthorization,
 encodeDirectSigningPayload,encodeDirectISMMetadata
} from "./direct-codec.mjs";

const a={
 sourceChainId:42161,sourceDomain:42161,destinationDomain:1643,
 routeId:"0x"+"aa".repeat(32),setId:9,sourceBlockNumber:517578687,
 sourceRegistry:"0x"+"11".repeat(20),gateway:"0x"+"22".repeat(20),
 sourceRouter:"0x"+"33".repeat(20),sourceMailbox:"0x"+"44".repeat(20),
 destinationRouter:"0x"+"55".repeat(20),validatorFeeWei:1000,
 messageId:"0x"+"bb".repeat(32)
};
const destinationIsm="0x"+"66".repeat(20),destinationRegistry="0x"+"77".repeat(20);
const vector="0x584954415f4449524543545f4d4553534147455f5631"+
 "000000000000a4b1"+"0000a4b1"+"0000066b"+"aa".repeat(32)+
 "0000000000000009"+"000000001ed99fbf"+
 ["11","22","33","44","55"].map(n=>n.repeat(20)).join("")+
 "0".repeat(61)+"3e8"+"bb".repeat(32)+"66".repeat(20)+"77".repeat(20);

test("direct payload exactly matches the Go and Solidity canonical vector",()=>{
 assert.equal(XITA_DIRECT_DOMAIN,"XITA_DIRECT_MESSAGE_V1");
 assert.equal(encodeDirectSigningPayload(a,{destinationIsm,destinationRegistry}),vector);
});
test("BLS signature binds every sensitive field, destination ISM and registry",()=>{
 const original=encodeDirectSigningPayload(a,{destinationIsm,destinationRegistry});
 const changes={...a};
 for(const [key,v]of Object.entries({
  sourceChainId:8453,sourceDomain:8453,destinationDomain:8453,
  routeId:"0x"+"cc".repeat(32),setId:10,sourceBlockNumber:517578688,
  sourceRegistry:"0x"+"88".repeat(20),gateway:"0x"+"88".repeat(20),
  sourceRouter:"0x"+"88".repeat(20),sourceMailbox:"0x"+"88".repeat(20),
  destinationRouter:"0x"+"88".repeat(20),validatorFeeWei:1001,
  messageId:"0x"+"cc".repeat(32)
 })){
  changes[key]=v;
  const encoded=encodeDirectSigningPayload(changes,{destinationIsm,destinationRegistry});
  assert.notEqual(encoded,original,key+" not bound");
  changes[key]=a[key];
 }
 assert.notEqual(
  encodeDirectSigningPayload(a,{destinationIsm:"0x"+"88".repeat(20),destinationRegistry}),original
 );
 assert.notEqual(
  encodeDirectSigningPayload(a,{destinationIsm,destinationRegistry:"0x"+"88".repeat(20)}),original
 );
});
test("ISM metadata ABI packs exactly one nested authorization and the BLS quorum",()=>{
 const bitmap="0x03",signature="0x"+"ab".repeat(256);
 const encoded=encodeDirectISMMetadata(a,{signerBitmap:bitmap,aggregateSignature:signature});
 const decoded=AbiCoder.defaultAbiCoder().decode([DIRECT_METADATA_TYPE],encoded)[0];
 assert.equal(decoded.authorization.routeId,a.routeId);
 assert.equal(decoded.authorization.messageId,a.messageId);
 assert.equal(decoded.authorization.setId,9n);
 assert.equal(decoded.signerBitmap,bitmap);
 assert.equal(decoded.aggregateSignature,signature);
});
test("never encode an invalid fee, replay ID, zero authority or blank BLS signature",()=>{
 for(const patch of [{validatorFeeWei:0},{setId:0},{messageId:"0x"+"00".repeat(32)},
 {sourceDomain:1643},{gateway:"0x"+"00".repeat(20)}, {sourceBlockNumber:0}]){
  assert.throws(()=>requireDirectAuthorization({...a,...patch}));
 }
 assert.throws(()=>encodeDirectISMMetadata(a,{signerBitmap:"0x",aggregateSignature:"0xab"}));
 assert.throws(()=>encodeDirectSigningPayload(a,{destinationIsm:"0x"+"00".repeat(20),destinationRegistry}));
});
