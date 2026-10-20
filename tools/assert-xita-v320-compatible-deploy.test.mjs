import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {verifyRetainedContracts, ROOT} from "./assert-xita-v320-compatible-deploy.mjs";

const a = "0x" + "a".repeat(40);
const b = "0x" + "b".repeat(40);
const h = "0x" + "f".repeat(64);
const tx = "0x" + "c".repeat(64);

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "xita-v320-"));
  const paths = {};
  for (const [chain, id, address] of [["base",8453,a], ["xgrchain",1643,b]]) {
    const receiptPath = `deployments/receipts/${chain}/${tx.slice(2)}-${address.slice(2)}.json`;
    mkdirSync(join(root,"deployments","receipts",chain),{recursive:true});
    mkdirSync(join(root,"deployments","chains"),{recursive:true});
    const record = {
      kind:"xita-v315-deployment-receipt", chain, chainId:id, component:"mailbox",
      address, runtimeCodeKeccak256:h, transactionHash:tx,
      blockNumber:123, status:"onchain-deployment-verified"
    };
    writeFileSync(join(root,receiptPath), JSON.stringify(record));
    const path = `deployments/chains/${chain}.json`;
    writeFileSync(join(root,path), JSON.stringify({
      kind:"infrastructure-deployment",network:"mainnet",chain,chainId:id,domainId:id,
      xitaV315:{components:{mailbox:{address,runtimeCodeKeccak256:h,receiptPath}},
        receiptPaths:[receiptPath]}
    }));
    paths[chain]={manifest:path,receipt:receiptPath};
  }
  return {root,paths,clean:()=>rmSync(root,{recursive:true,force:true})};
}
function edit(path, callback) {
 const data=JSON.parse(readFileSync(path,"utf8"));callback(data);writeFileSync(path,JSON.stringify(data));
}
test("retained Solidity deployments and receipts pass without a new deployment",()=>{
  const f=fixture();try{
    const result=verifyRetainedContracts(f.root,{checkGit:false});
    assert.deepEqual(result.errors,[]);
    assert.equal(result.checked,2);
  }finally{f.clean();}
});
test("refuses an absent verified receipt instead of inventing or wiping it",()=>{
  const f=fixture();try{
    unlinkSync(join(f.root,f.paths.base.receipt));
    const result=verifyRetainedContracts(f.root,{checkGit:false});
    assert.equal(result.ok,false);
    assert.match(result.errors.join(" "),/missing retained receipt/);
  }finally{f.clean();}
});
test("refuses hash, address or provenance mismatches",()=>{
  const f=fixture();try{
    edit(join(f.root,f.paths.xgrchain.receipt), r=>r.runtimeCodeKeccak256="0x"+"0".repeat(64));
    assert.match(verifyRetainedContracts(f.root,{checkGit:false}).errors.join(" "),/evidence mismatch/);
    edit(join(f.root,f.paths.xgrchain.manifest), r=>r.xitaV315.components.mailbox.address=a);
    assert.match(verifyRetainedContracts(f.root,{checkGit:false}).errors.join(" "),/receipt path/);
  }finally{f.clean();}
});
test("refuses missing active generation or wrong chain ID",()=>{
  const f=fixture();try{
    edit(join(f.root,f.paths.base.manifest), r=>{delete r.xitaV315; r.xitaV320={};});
    assert.match(verifyRetainedContracts(f.root,{checkGit:false}).errors.join(" "),/must be retained/);
    edit(join(f.root,f.paths.xgrchain.manifest), r=>r.chainId=8453);
    assert.match(verifyRetainedContracts(f.root,{checkGit:false}).errors.join(" "),/infrastructure identity/);
  }finally{f.clean();}
});
test("current repository retains both documented contract generations",()=>{
  const result=verifyRetainedContracts(ROOT,{checkGit:false});
  assert.deepEqual(result.errors,[]);
  assert.ok(result.checked>=10);
});
