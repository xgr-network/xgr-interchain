import test from "node:test";
import assert from "node:assert/strict";
import {AbiCoder,getBytes} from "ethers";
import {DIRECT_BLS_DOMAIN,DIRECT_BLS_AUTHORIZATION_TYPE,
  encodeDirectBLSPayload,encodeDirectISMMetadata,hashDirectBLSPayload
} from "./xita-direct-codec.mjs";

const addr=n=>"0x"+n.toString(16).padStart(40,"0");
const message=Object.freeze({
 sourceChainId:42161n,sourceDomain:42161,destinationDomain:1643,
 routeId:"0x"+"a".repeat(64),setId:1n,sourceBlockNumber:517578687n,
 sourceRegistry:addr(1),gateway:addr(2),sourceRouter:addr(3),
 sourceMailbox:addr(4),destinationRouter:addr(5),
 validatorFeeWei:12345n,messageId:"0x"+"b".repeat(64),
 destinationIsm:addr(6),destinationRegistry:addr(7)
});
test("Direct BLS bytes bind exactly one message and deployment; no Merkle metadata",()=>{
 const raw=encodeDirectBLSPayload(message);
 assert.equal(getBytes(raw).length,DIRECT_BLS_DOMAIN.length+8+4+4+32+8+8+5*20+32+32+20+20);
 assert.equal(new TextDecoder().decode(getBytes(raw).slice(0,DIRECT_BLS_DOMAIN.length)),DIRECT_BLS_DOMAIN);
 for(const [key,value]of [
  ["sourceChainId",8453n],["sourceDomain",8453],
  ["destinationDomain",8453],["routeId","0x"+"c".repeat(64)],
  ["setId",2n],["sourceBlockNumber",517578688n],
  ["sourceRegistry",addr(10)],["gateway",addr(11)],["sourceRouter",addr(12)],
  ["sourceMailbox",addr(13)],["destinationRouter",addr(14)],
  ["validatorFeeWei",12346n],["messageId","0x"+"d".repeat(64)],
  ["destinationIsm",addr(15)],["destinationRegistry",addr(16)]
 ])assert.notEqual(hashDirectBLSPayload({...message,[key]:value}),hashDirectBLSPayload(message));
});
test("ISM metadata is a direct authorization, signer bitmap and BLS signature",()=>{
 const sig="0x"+"22".repeat(256);
 const data=encodeDirectISMMetadata({authorization:message,signerBitmap:"0x03",aggregateSignature:sig});
 const parsed=AbiCoder.defaultAbiCoder().decode([DIRECT_BLS_AUTHORIZATION_TYPE,"bytes","bytes"],data);
 assert.equal(parsed[0].routeId.toLowerCase(),message.routeId.toLowerCase());
 assert.equal(parsed[0].messageId.toLowerCase(),message.messageId.toLowerCase());
 assert.equal(parsed[0].sourceBlockNumber,517578687n);
 assert.equal(parsed[1],"0x03");
 assert.equal(parsed[2],sig);
 assert.ok(getBytes(data).length<1024);
 assert.throws(()=>encodeDirectISMMetadata({authorization:message,signerBitmap:"0x03",aggregateSignature:"0x01"}),/uncompressed/);
 assert.throws(()=>encodeDirectBLSPayload({...message,messageId:"0x"+"0".repeat(64)}),/identity/);
});
