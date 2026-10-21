import test from "node:test";
import assert from "node:assert/strict";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  mkdtempSync, readFileSync, rmSync, existsSync, readdirSync,
} from "node:fs";
import {
  AbiCoder, Interface, id, keccak256, toUtf8Bytes,
} from "ethers";
import {
  ILNAccumulator, parseInsertedIntoTree, loadChainEvidence,
  buildVerifiedReplica, fetchCompleteInsertionRange, parseBootstrapArgs,
  writeReplicaAtomic,
} from "./init-iln-merkle.mjs";

const hook = "0xa831991450e2a150951da8c2f3344f940603c714";
const mailbox = "0xd3389684b69f80f7a281569b64a2e47872f74add";
const ZERO = "0x" + "00".repeat(32);
const hash = value => keccak256(toUtf8Bytes(value));
const leaves = [hash("first-mainnet-test-message"),hash("second-mainnet-test-message")];
const tree = new ILNAccumulator();
for (let i = 0; i < leaves.length; i++) tree.insert(i, leaves[i]);
const root = tree.root();
const hookAbi = new Interface([
  "function mailbox() view returns (address)",
  "function count() view returns (uint256)",
  "function root() view returns (bytes32)",
]);
const addressWord = "0x" + "00".repeat(12) + mailbox.slice(2).toLowerCase();
const entry = (messageId, index, blockNumber, logIndex) => ({
  address: hook,
  topics: [id("InsertedIntoTree(bytes32,uint32)")],
  data: AbiCoder.defaultAbiCoder().encode(
    ["bytes32","uint32"],[messageId,index]),
  blockNumber,index:logIndex,removed:false,
});
function fakeProvider({logs=[entry(leaves[0],0,101,0),entry(leaves[1],1,117,0)],
  chainId=8453, actualRoot=root, actualCount=2n, runtime="0x6001600055",
  sourceMailbox=mailbox, failedBatch=false, reorg=false}={}) {
  const trace=[];
  const provider={
    trace,
    send:async(method)=> {
      trace.push({method});
      assert.equal(method,"eth_chainId");
      return "0x"+chainId.toString(16);
    },
    getBlockNumber:async()=>157, // 157 - 12 -> confirmed 145; epoch 128
    getBlock:async(number)=> {
      assert.equal(number,128);
      return {hash: reorg && trace.some(x=>x.method==="eth_getLogs")?
        hash("different-final-anchor") : hash("same-final-anchor")};
    },
    call:async({to,data,blockTag}) => {
      assert.equal(to.toLowerCase(),hook.toLowerCase());
      assert.equal(blockTag,"latest");
      if (data === hookAbi.getFunction("mailbox").selector)
        return hookAbi.encodeFunctionResult("mailbox",[sourceMailbox]);
      if (data === hookAbi.getFunction("count").selector)
        return hookAbi.encodeFunctionResult("count",[actualCount]);
      if (data === hookAbi.getFunction("root").selector)
        return hookAbi.encodeFunctionResult("root",[actualRoot]);
      throw Error("unexpected Hook getter");
    },
    getCode:async(to,blockTag)=>{
      assert.equal(to.toLowerCase(),hook.toLowerCase());
      assert.equal(blockTag,"latest");
      return runtime;
    },
    getLogs:async(filter)=>{
      trace.push({method:"eth_getLogs",...filter});
      assert.equal(filter.address.toLowerCase(),hook.toLowerCase());
      assert.deepEqual(filter.topics,[id("InsertedIntoTree(bytes32,uint32)")]);
      if (failedBatch && filter.toBlock-filter.fromBlock > 2)
        throw Error("provider range exceeded");
      return logs.filter(x=>x.blockNumber>=filter.fromBlock &&
        x.blockNumber<=filter.toBlock);
    },
  };
  return provider;
}
function evidence() {
  return {
    chain:"base",chainId:8453,hook,mailbox,fromBlock:100,
    confirmations:12,rpc:"http://127.0.0.1:8545",
    runtimeCodeHash:keccak256("0x6001600055"),
  };
}
const expectFailure = async(p,pattern) =>
  assert.rejects(()=>buildVerifiedReplica({
    provider:p,evidence:evidence(),chunkSize:10,
  }),pattern);

test("initializer reads actual documented Base/XGR/Arbitrum Hook provenance",()=>{
  const base = loadChainEvidence("base");
  const xgr = loadChainEvidence("xgrchain");
  const arb = loadChainEvidence("arbitrum");
  assert.equal(base.chainId,8453);
  assert.equal(base.hook.toLowerCase(),hook.toLowerCase());
  assert.equal(base.fromBlock,52602508);
  assert.equal(xgr.chainId,1643);
  assert.equal(xgr.hook.toLowerCase(),"0x44a8374cf1ff674a92a6876832af245b805e2161");
  assert.ok(xgr.fromBlock > 0);
  assert.equal(arb.chainId,42161);
  assert.equal(arb.hook.toLowerCase(),"0x1b9df66feafaf7f4d49b39abbeccc7146cd27f70");
  assert.ok(arb.fromBlock > 0);
  assert.throws(()=>loadChainEvidence("polygon"),/unsupported chain/);
});
test("two ordered source insertions produce the exact canonical Hyperlane root",async()=>{
  const provider=fakeProvider();
  const c=await buildVerifiedReplica({provider,evidence:evidence(),
    chunkSize:10,expectMessageId:leaves[1]});
  assert.equal(c.chainId,8453);
  assert.equal(c.checkpointBlock,128);
  assert.deepEqual(c.leaves,leaves);
  assert.equal(c.root,root);
  assert.equal(c.hook,hook);
  assert.ok(provider.trace.some(x=>x.method==="eth_getLogs"));
  const file=join(mkdtempSync(join(tmpdir(),"xita-iln-bootstrap-")),"snapshot.json");
  try{
    assert.equal(writeReplicaAtomic(file,c),"initialized");
    assert.deepEqual(JSON.parse(readFileSync(file,"utf8")),c);
    assert.equal(writeReplicaAtomic(file,c),"already-current");
    assert.throws(()=>writeReplicaAtomic(file,{...c,root:ZERO},{replace:true}),
      /unverified Merkle root/);
  }finally{rmSync(join(file,".."),{recursive:true,force:true});}
});
test("event parser accepts all three Hyperlane indexed ABI variants",()=>{
  const base=entry(leaves[0],0,101,0);
  assert.deepEqual(parseInsertedIntoTree(base,hook),{leaf:leaves[0],index:0});
  assert.deepEqual(parseInsertedIntoTree({...base,
    topics:[base.topics[0],leaves[0]],data:AbiCoder.defaultAbiCoder().encode(["uint32"],[0])},hook),
    {leaf:leaves[0],index:0});
  assert.deepEqual(parseInsertedIntoTree({...base,
    topics:[base.topics[0],leaves[0],"0x"+"00".repeat(32)],data:"0x"},hook),
    {leaf:leaves[0],index:0});
  assert.throws(()=>parseInsertedIntoTree({...base,address:mailbox},hook),/not a canonical/);
});
test("never accepts an incomplete, duplicate, wrong-root or wrong-ABI prefix",async()=>{
  await expectFailure(fakeProvider({logs:[entry(leaves[1],1,117,0)]}),/noncanonical Merkle insertion/);
  await expectFailure(fakeProvider({logs:[
    entry(leaves[0],0,101,0),entry(leaves[0],0,101,1),entry(leaves[1],1,117,0),
  ]}),/noncanonical Merkle insertion/);
  await expectFailure(fakeProvider({actualRoot:hash("forged-root")}),/does not match source Hook root/);
  await expectFailure(fakeProvider({actualCount:3n}),/incomplete Hook history/);
  await expectFailure(fakeProvider({runtime:"0x6000"}),/runtime code differs/);
  await expectFailure(fakeProvider({sourceMailbox:hook}),/mailbox differs/);
  await expectFailure(fakeProvider({chainId:1643}),/chainId mismatch/);
  await expectFailure(fakeProvider({reorg:true}),/reorganized during bootstrap/);
});
test("new Arbitrum Hook with zero insertions is identified without creating a fake Merkle replica",async()=>{
  const result=await buildVerifiedReplica({
    provider:fakeProvider({logs:[],actualCount:0n,actualRoot:ZERO}),
    evidence:evidence(),chunkSize:10,
  });
  assert.equal(result.empty,true);
  assert.deepEqual(result.leaves,[]);
  assert.equal(result.checkpointBlock,128);
  assert.equal(result.root,ZERO);
  const file=join(mkdtempSync(join(tmpdir(),"xita-empty-hook-")),"snapshot.json");
  try{
    assert.throws(()=>writeReplicaAtomic(file,result),/invalid Merkle replica format/);
    assert.equal(existsSync(file),false);
  }finally{rmSync(join(file,".."),{recursive:true,force:true});}
});
test("source RPC range limits may split, but every block remains verified",async()=>{
  const provider=fakeProvider({failedBatch:true});
  const c=await buildVerifiedReplica({provider,evidence:evidence(),chunkSize:10});
  assert.equal(c.root,root);
  assert.ok(provider.trace.filter(x=>x.method==="eth_getLogs").length>4);
  const logs=await fetchCompleteInsertionRange(provider,hook,100,128);
  assert.equal(logs.length,2);
  await assert.rejects(
    ()=>fetchCompleteInsertionRange({
      getLogs:async()=>{throw Error("history unavailable")}
    },hook,100,101),
    /canonical Hook logs at block 100/);
});
test("bootstrapping fails on missing expected pending 0.5-wXGR leaf",async()=>{
  await assert.rejects(()=>buildVerifiedReplica({
    provider:fakeProvider(),evidence:evidence(),
    expectMessageId:hash("unknown-pending-transfer"),
  }),/absent from verified Hook history/);
});
test("absolute explicit data-dir, invalid chain and options handled without writes",()=>{
  const dir=mkdtempSync(join(tmpdir(),"xita-iln-dir-"));
  try{
    assert.equal(parseBootstrapArgs(["--chain","base","--data-dir",dir]).chainId,undefined);
    assert.equal(parseBootstrapArgs(["--chain","base","--data-dir",dir]).dataDir,dir);
    assert.throws(()=>parseBootstrapArgs(["--chain","base","--data-dir","relative"]),/absolute/);
    assert.throws(()=>parseBootstrapArgs(["--chain","polygon","--data-dir",dir]),/documented mainnet deployment/);
    assert.throws(()=>parseBootstrapArgs(["--chain","base","--data-dir",dir,"--rpc","https://user:pass@remote.example"]),/RPC endpoint/);
    assert.throws(()=>parseBootstrapArgs(["--chain","base","--data-dir",dir,"--chunk-size","0"]),/chunk-size/);
    assert.throws(()=>parseBootstrapArgs(["--chain","base","--data-dir",dir,"--bad"]),/unknown initializer option/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test("atomic verified bootstrap never overwrites a different snapshot without --replace",()=>{
  const dir=mkdtempSync(join(tmpdir(),"xita-iln-snapshot-"));
  const path=join(dir,"replica.json");
  const one={chainId:8453,hook,checkpointBlock:128,
    root:(()=>{const t=new ILNAccumulator();t.insert(0,leaves[0]);return t.root();})(),
    leaves:[leaves[0]]};
  const two={chainId:8453,hook,checkpointBlock:128,root,leaves};
  try{
    assert.equal(writeReplicaAtomic(path,one,{dryRun:true}),"verified-dry-run");
    assert.equal(existsSync(path),false);
    assert.equal(writeReplicaAtomic(path,one),"initialized");
    assert.throws(()=>writeReplicaAtomic(path,two),/existing replica differs/);
    assert.deepEqual(JSON.parse(readFileSync(path,"utf8")),one);
    assert.equal(writeReplicaAtomic(path,two,{replace:true}),"initialized");
    assert.deepEqual(JSON.parse(readFileSync(path,"utf8")),two);
    assert.equal(
      readdirSync(dir).filter(name=>name.includes(".backup-")).length,
      1);
    assert.throws(()=>writeReplicaAtomic(path,{...two,leaves:[leaves[1],leaves[0]]},{replace:true}),/unverified Merkle root/);
    assert.deepEqual(JSON.parse(readFileSync(path,"utf8")),two);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
