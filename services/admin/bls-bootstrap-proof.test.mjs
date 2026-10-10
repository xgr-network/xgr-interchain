import test from "node:test";
import assert from "node:assert/strict";
import {validatePublicBootstrapProof,verifyPublicBootstrapOnChain,compressSignatureG2} from "./bls-bootstrap-proof.mjs";
const proof={
 validator:"0x7913fDAe82C678F42B98Ca8076Fe7D13b3EdFF15",originChainId:1643,destinationDomain:1643,
 blsPublicKey:"0xb56b72d028aa6d063d36917f9f18a3ee4b216e22694a701814af4fd55e6cbbe99209fc1359012e4733987ebdd0123e88",
 blsPublicKeyEIP2537:"0x00000000000000000000000000000000156b72d028aa6d063d36917f9f18a3ee4b216e22694a701814af4fd55e6cbbe99209fc1359012e4733987ebdd0123e88000000000000000000000000000000000ff4b97c544a6915099d22d4b5abb6b35a3290cba39def4a1a8b902df5d94d9bc6bd98fe2f183e24fa16e41072de97fc",
 possessionProof:"0x0000000000000000000000000000000005d003fe47b48dccf83bc59f25542456da92eefc6ae1f12e4485a39459d5c20d14fb75b97dacdf5ac6101017c1db138600000000000000000000000000000000037fcc2668f5613990bbded924f361d423d70b4d7bf3504bcf1e9c2159cd2d99e3cb87f794beae5c5cf53b6b92fd82a9000000000000000000000000000000000cda671bc875a5c1770c59ef24fc9bacc7576cdc9e7ef56161bd833d465549ae863efa531d6335b52b5fb9f361564b77000000000000000000000000000000000f1e96e2779be053289ed31114364c6df1c6e08c8be92bb7c0e1b7dd470b8e86ff15163a75d902cc998bbc5211cdc58e"
};
const chain={name:"xgrchain",chainId:1643,domainId:1643,rpcUrls:["https://rpc.xgr.network"],blsVerifierFormat:"compressed"};
const validators=[proof.validator];
proof.payload="0x"+Buffer.from("XGR_INTERCHAIN_BOOTSTRAP_V1").toString("hex")+"000000000000066b"+"0000066b"+
 proof.validator.slice(2).toLowerCase()+"0030"+proof.blsPublicKey.slice(2)+"0080"+proof.blsPublicKeyEIP2537.slice(2);
test("real public proof fixture binds address, compressed and EIP keys and exact payload",()=>{
 const r=validatePublicBootstrapProof(proof,{chain,approvedValidators:validators});
 assert.equal(r.compressedSignature.length,194);
 assert.equal(r.payload,proof.payload);
});
test("wrong domain, changed pubkey, unknown validator or damaged signature is blocked",()=>{
 assert.throws(()=>validatePublicBootstrapProof({...proof,destinationDomain:8453},{chain,approvedValidators:validators}),/domain/);
 assert.throws(()=>validatePublicBootstrapProof({...proof,blsPublicKey:"0x"+"00".repeat(48)},{chain,approvedValidators:validators}),/keys differ/);
 assert.throws(()=>validatePublicBootstrapProof(proof,{chain,approvedValidators:[]}),/not in approved/);
 assert.throws(()=>compressSignatureG2("0x"+"ff".repeat(256)),/padding/);
});
test("on-chain verifier return MUST be true, not just syntactically good",async()=>{
 const config={verifierAddress:"0x0000000000000000000000000000000000002040"};
 const rpc=async(_url,method)=>method==="eth_chainId"?"0x66b":"0x"+"0".repeat(63)+"1";
 const r=await verifyPublicBootstrapOnChain(proof,{chain,bootstrap:config,approvedValidators:validators,rpc});
 assert.equal(r.verified,true);
 const bad=await verifyPublicBootstrapOnChain(proof,{chain,bootstrap:config,approvedValidators:validators,
  rpc:async(_url,method)=>method==="eth_chainId"?"0x66b":"0x"+"0".repeat(64)});
 assert.equal(bad.verified,false);
});
