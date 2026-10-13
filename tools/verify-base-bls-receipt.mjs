#!/usr/bin/env node
// Read-only, fail-closed mainnet verification of the first XITA Base contract.
// Usage: node tools/verify-base-bls-receipt.mjs
// Never signs, funds, broadcasts or guesses a contract code hash.
import {readFileSync} from "node:fs";
import {keccak256} from "../apps/web/keccak.mjs";
import {normalizeSolc0824IpfsDigest} from "../services/admin/solidity-metadata.mjs";
const TX="0x47e984a9c05ceb6a16964b32d61f54c2132f85e81b6c43dbe1c1de6994794cfb";
const ADDRESS="0x1a6610cc7dd0d0f42e22c3608e025d891065814c";
const SOURCE_COMMIT="b65f045bba92ead56c7bc98626cd472af4f0d5a5";
const RPC_URLS=[
 "https://mainnet.base.org",
 "https://base.drpc.org",
 "https://base.gateway.tenderly.co",
 "https://base.llamarpc.com",
 "https://base-rpc.publicnode.com"
];
const lower=x=>String(x??"").toLowerCase();
const hex=x=>/^0x(?:[a-f0-9]{2})+$/i.test(x||"");
const bytes=x=>Uint8Array.from(Buffer.from(x.slice(2),"hex"));
const hashBytes=x=>keccak256(bytes(x));
async function call(url,method,params=[]){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),11000);
 try{
  const response=await fetch(url,{
   method:"POST",headers:{"content-type":"application/json"},cache:"no-store",
   body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:controller.signal
  });
  if(!response.ok)throw Error("HTTP "+response.status);
  const body=await response.json();
  if(body.error||body.result===undefined)
   throw Error(body.error?.message||"Malformed JSON-RPC response");
  return body.result;
 }finally{clearTimeout(timer)}
}
async function verifiedFrom(url,runtime){
 const chain=await call(url,"eth_chainId");
 if(BigInt(chain)!==8453n)throw Error("Wrong chain: "+chain);
 const receipt=await call(url,"eth_getTransactionReceipt",[TX]);
 if(!receipt)throw Error("Receipt not yet available");
 if(receipt.status!=="0x1"||lower(receipt.transactionHash)!==lower(TX)||
    lower(receipt.contractAddress)!==lower(ADDRESS)||
    receipt.to!==null||!/^0x[0-9a-f]{64}$/i.test(receipt.blockHash||"")||
    !/^0x[0-9a-f]{40}$/i.test(receipt.from||""))
  throw Error("On-chain receipt does not prove successful creation of the expected BLS verifier");
 const tx=await call(url,"eth_getTransactionByHash",[TX]);
 if(!tx||lower(tx.hash)!==lower(TX)||tx.to!==null||lower(tx.from)!==lower(receipt.from)||
    BigInt(tx.value)!==0n)
  throw Error("Signed creation transaction does not match mined receipt");
 const block=await call(url,"eth_getBlockByNumber",[receipt.blockNumber,false]);
 if(!block||lower(block.hash)!==lower(receipt.blockHash)||
    BigInt(block.number)!==BigInt(receipt.blockNumber))
  throw Error("Receipt not in canonical Base block");
 const current=await call(url,"eth_blockNumber");
 const confirmations=BigInt(current)-BigInt(receipt.blockNumber)+1n;
 if(confirmations<12n)throw Error("Only "+confirmations+" confirmations (need >=12)");
 let code,codeBlock=receipt.blockNumber;
 try{code=await call(url,"eth_getCode",[ADDRESS,receipt.blockNumber])}
 catch(e){
  code=await call(url,"eth_getCode",[ADDRESS,"latest"]);
  codeBlock="latest";
 }
 // Require identical executable instructions, wrapper, Solidity compiler
 // version and CBOR structure. The ONLY allowed difference is the 32-byte
 // IPFS digest inside the exact Solidity 0.8.24 metadata footer. Verify
 // both on-chain RUNTIME and originally signed CREATION transaction.
 if(!hex(code)||code.length!==runtime.length||
    normalizeSolc0824IpfsDigest(code)!==normalizeSolc0824IpfsDigest(runtime)||
    !hex(tx.input)||tx.input.length!==creation.length||
    normalizeSolc0824IpfsDigest(tx.input)!==normalizeSolc0824IpfsDigest(creation))
  throw Error("Base BLS on-chain executable/creation code differs from trusted build outside Solidity IPFS metadata");

 const observed=hashBytes(code);
 return {
  schemaVersion:1,kind:"xita-v315-deployment-receipt",network:"mainnet",
  approval:{ref:"main",sourceCommit:SOURCE_COMMIT},chain:"base",
  chainId:8453,domainId:8453,component:"blsVerifier",asset:null,assetId:null,
  routeName:null,address:lower(ADDRESS),runtimeCodeKeccak256:observed,
  transactionHash:lower(TX),blockNumber:Number(BigInt(receipt.blockNumber)),
  blockHash:lower(receipt.blockHash),confirmations:Number(confirmations),
  deployer:lower(receipt.from),provenance:{kind:"create"},
  status:"onchain-deployment-verified",recordedAt:new Date().toISOString(),
  _diagnostic:{rpc:url,codeBlock}
 };
}
const artifact=JSON.parse(readFileSync("out/XGRInterchainBLSVerifier.sol/XGRInterchainBLSVerifier.json","utf8"));
const creation=artifact.bytecode?.object,runtime=artifact.deployedBytecode?.object;
if(!hex(creation)||!hex(runtime)||runtime.length<100||
 Object.values(artifact.deployedBytecode?.immutableReferences||{}).flat().length)
 throw Error("Invalid or immutable-bearing pinned Foundry BLS verifier artifact");
const failures=[];
let verified=null;
for(const url of RPC_URLS){
 try{verified=await verifiedFrom(url,runtime);break}
 catch(error){failures.push(url+": "+String(error?.message||error).slice(0,180))}
}
if(!verified){
 console.error("No valid Base receipt and runtime evidence could be established:");
 for(const item of failures)console.error(" - "+item);
 process.exit(1);
}
const diagnostic=verified._diagnostic;
delete verified._diagnostic;
console.log("VERIFIED Base BLS contract creation tx and deployed runtime");
console.log("RPC endpoint: "+diagnostic.rpc+" (code block "+diagnostic.codeBlock+")");
console.log("Compiled runtime keccak256: "+hashBytes(runtime));
console.log("XITA_BASE_BLS_VERIFIED_RECEIPT="+JSON.stringify(verified));
