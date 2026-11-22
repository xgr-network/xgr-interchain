import test from "node:test";
import assert from "node:assert/strict";
import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {approvedWorkInventory} from "./main-gate.mjs";
import {createAssetOperator} from "./asset-operator.mjs";
import {deploymentIntents} from "./deployment-intents.mjs";
import {selector,keccak256} from "../../apps/web/keccak.mjs";

test("background checks the journaled asset hash and keeps the published step visible until checkout sync",async()=>{
 const root=mkdtempSync(join(tmpdir(),"xita-asset-progress-"));
 try{
  const source=new URL("../..",import.meta.url).pathname;
  for(const dir of ["config","deployments"])cpSync(join(source,dir),join(root,dir),{recursive:true});
  const indexPath=join(root,"deployments/assets/a7/XGR/representations.json");
  const index=JSON.parse(readFileSync(indexPath,"utf8"));
  const original=JSON.stringify(index);
  const documented=index.representations.find(r=>r.chain==="xdc");
  assert.ok(documented);
  index.representations=index.representations.filter(r=>r!==documented);
  writeFileSync(indexPath,JSON.stringify(index));
  const inventory=approvedWorkInventory(root);
  const stateDir=join(root,"state");
  const journal=deploymentIntents({directory:join(stateDir,"wallet-intents"),chains:inventory.chains});
  const id="xdc:XGR:syntheticRouter:none",task="XGR:xdc:representation";
  const wallet="0x"+"1".repeat(40),factory="0x"+"2".repeat(40),router="0x"+"3".repeat(40);
  const txHash="0x"+"4".repeat(64),sourceCommit="5".repeat(40),commit="6".repeat(40);
  const assetId=inventory.assets.XGR.assetId,artifactHash="7".repeat(64),buildHash="8".repeat(64);
  const transaction={from:wallet,to:factory,data:"0x12345678",nonce:"0x1",value:"0x0",gas:"0x5208"};
  journal.prepare({id,sourceCommit,chainId:50,asset:"XGR",assetId,factory,wallet,transaction,
   parameters:{},artifactHash,buildHash});
  journal.attachHash(id,txHash);
  const runtime="0x6001";
  let mined=false,published=0;
  const checkMethods=[];
  const deps={root,stateDir,mainCheck:async()=>sourceCommit,
   build:async()=>({artifacts:{syntheticRouter:{artifactHash,buildHash,runtime,immutableSpans:[]}}}),
   publish:async(_root,rows)=>{
    assert.equal(rows[0].txHash,txHash);
    assert.equal(rows[0].contractAddress,router);
    published++;
    return {commit};
   },
   rpc:async(_url,method,params)=>{
    checkMethods.push(method);
    if(method==="eth_getTransactionByHash"){
     assert.equal(params[0],txHash);
     return {...transaction,hash:txHash,chainId:"0x32"};
    }
    if(method==="eth_getTransactionReceipt")return mined?{
     status:"0x1",blockNumber:"0x1",logs:[{address:factory,topics:[
      keccak256("RouterDeployed(bytes32,address,address)"),assetId,
      "0x"+"0".repeat(24)+router.slice(2)]}]
    }:null;
    if(method==="eth_blockNumber")return "0xff";
    if(method==="eth_getCode")return runtime;
    if(method==="eth_call")return params[0].data.startsWith(selector("routerCreator(address)"))
     ?"0x"+"0".repeat(24)+wallet.slice(2):assetId;
    throw Error("Unexpected RPC "+method);
   }};
  let operator=createAssetOperator(deps);
  await operator.poll();
  assert.deepEqual(operator.progress(inventory)[task],{
   stage:"submitted",txHash,reason:"receipt",detail:undefined,commit:undefined});
  assert.equal(published,0);
  mined=true;
  await Promise.all([operator.poll(),operator.poll(),operator.reconcile({id})]);
  assert.equal(published,1);
  operator=createAssetOperator(deps);
  assert.equal(operator.progress(inventory)[task].stage,"awaiting-sync");
  assert.equal((await operator.resume({asset:"XGR"})).commit,commit);
  await operator.poll();
  assert.equal(published,1);
  assert.ok(checkMethods.every(method=>method!=="eth_sendRawTransaction"));
  writeFileSync(indexPath,original);
  assert.equal(operator.progress(approvedWorkInventory(root))[task],undefined);
  assert.equal(journal.read().entries[id],undefined);
 }finally{rmSync(root,{force:true,recursive:true});}
});
