import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {keccak256} from "../../apps/web/keccak.mjs";
import {recoverPublishedReceipt} from "./deployment-recovery.mjs";

const SHA="a".repeat(40),TX="0x"+"b".repeat(64),BLOCK="0x"+"c".repeat(64);
const DEPLOYER="0x"+"2".repeat(40),CONTRACT="0x"+"1".repeat(40);
const CODE="0x6001600055";
const CODE_HASH=keccak256(Uint8Array.from(Buffer.from(CODE.slice(2),"hex")));
const PATH="deployments/mainnet/receipts/base/"+TX.slice(2)+"-"+CONTRACT.slice(2)+".json";
const CHAIN={name:"base",chainId:8453,domainId:8453,rpcUrls:["https://rpc.invalid"],confirmations:12};
const ENTRY={stage:"confirmed",sourceCommit:SHA,txHash:TX,wallet:DEPLOYER,chainId:8453,
 verifiedProof:{contractAddress:CONTRACT,runtimeKeccak:CODE_HASH}};
const RECEIPT={kind:"xita-v315-deployment-receipt",status:"onchain-deployment-verified",
 network:"mainnet",approval:{ref:"main",sourceCommit:SHA},chain:"base",chainId:8453,
 domainId:8453,component:"validatorRegistry",asset:null,address:CONTRACT,
 runtimeCodeKeccak256:CODE_HASH,transactionHash:TX,deployer:DEPLOYER,
 blockNumber:90,blockHash:BLOCK,provenance:{kind:"create"}};
const INDEX={chain:"base",xitaV315:{components:{validatorRegistry:{
 address:CONTRACT,runtimeCodeKeccak256:CODE_HASH,receiptPath:PATH}},receiptPaths:[PATH]}};
const toContents=x=>({type:"file",encoding:"base64",
 content:Buffer.from(JSON.stringify(x)).toString("base64")});
function github({receipt=RECEIPT,index=INDEX,missing=false}={}){
 return async(url,opts)=>{
  assert.equal(opts?.method,undefined,"Recovery is read-only");
  if(url.endsWith("/git/ref/heads/main"))
   return {ok:true,json:async()=>({object:{sha:SHA}})};
  if(url.includes("/contents/"+PATH))
   return missing?{ok:false,status:404}:{ok:true,json:async()=>toContents(receipt)};
  if(url.includes("/contents/deployments/mainnet/infrastructure/base.json?ref="))
   return {ok:true,json:async()=>toContents(index)};
  throw Error("Unexpected recovery request "+url);
 };
}
function chainRPC({code=CODE,status="0x1"}={}){
 return async(_url,method)=>{
  if(method==="eth_chainId")return "0x2105";
  if(method==="eth_getTransactionReceipt")return {
   status,transactionHash:TX,from:DEPLOYER,to:null,contractAddress:CONTRACT,
   blockHash:BLOCK,blockNumber:"0x5a"};
  if(method==="eth_blockNumber")return "0x80";
  if(method==="eth_getBlockByNumber")return {hash:BLOCK,number:"0x5a"};
  if(method==="eth_getCode")return code;
  throw Error("Unapproved RPC side effect "+method);
 };
}
test("confirmed wallet is recovered by GitHub main receipt, without git pull or wallet broadcast",async()=>{
 const result=await recoverPublishedReceipt({entry:ENTRY,chain:CHAIN,
  component:"validatorRegistry",fetcher:github(),rpc:chainRPC(),token:null});
 assert.equal(result.receiptPath,PATH);
 assert.equal(result.address,CONTRACT);
 assert.equal(result.commit,SHA);
});
test("missing remote receipt returns null; original intent must stay confirmed for publication",async()=>{
 const result=await recoverPublishedReceipt({entry:ENTRY,chain:CHAIN,
  component:"validatorRegistry",fetcher:github({missing:true}),rpc:chainRPC(),token:null});
 assert.equal(result,null);
});
test("conflicting GitHub index cannot be treated as documented",async()=>{
 const index={...INDEX,xitaV315:{components:{},receiptPaths:[]}};
 await assert.rejects(()=>recoverPublishedReceipt({entry:ENTRY,chain:CHAIN,
  component:"validatorRegistry",fetcher:github({index}),rpc:chainRPC(),token:null}),/index/);
});
test("different runtime or reverted chain transaction rejects recovery",async()=>{
 for(const opts of [{code:"0x6002600055"},{status:"0x0"}]){
  await assert.rejects(()=>recoverPublishedReceipt({entry:ENTRY,chain:CHAIN,
   component:"validatorRegistry",fetcher:github(),rpc:chainRPC(opts),token:null}),/canonical|bytecode/);
 }
});
test("submitted wallet is never accepted as a confirmed GitHub deployment",async()=>{
 assert.equal(await recoverPublishedReceipt({entry:{...ENTRY,stage:"submitted"},
  chain:CHAIN,component:"validatorRegistry",fetcher:github(),rpc:chainRPC(),token:null}),null);
});
test("read-only Admin reconcile never invokes git pull",()=>{
 for(const name of ["chain-operator.mjs","asset-operator.mjs"]){
  const code=readFileSync(new URL(name,import.meta.url),"utf8");
  assert.doesNotMatch(code,/execFileSync\s*\(\s*["']git["']\s*,\s*\[\s*["']pull["']/);
 }
});
