import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,writeFileSync,unlinkSync} from "node:fs";
import {Wallet,Transaction} from "ethers";
// The production symbol is intentionally private. Export it ONLY in an
// ephemeral test copy of the identical module, with the same real scheduler,
// signer validation, durable reservation and broadcast call graph.
test("F-08: stalled Base effect does not block Arbitrum's authorized payout",async()=>{
 const source=new URL("./gas-sponsor.mjs",import.meta.url);
 const probe=new URL("./.f08-probe-"+process.pid+".mjs",import.meta.url);
 writeFileSync(probe,readFileSync(source,"utf8")+
  "\nexport {SPONSOR_PREFLIGHT as auditKind,sendFreshSponsorCandidate as auditSend};\n");
 try{
  const {processFreshSponsorQueue,auditKind,auditSend,sponsorGrantKey}=await import(probe.href);
  const walletSigner=new Wallet("0x"+"11".repeat(32));
  const account="0x"+"b".repeat(40),tx="0x"+"f".repeat(64);
  const row=(chain,id)=>({account,source_chain:"xgrchain",destination_chain:chain,
   final_destination_chain:chain,message_id:"0x"+id.repeat(64),
   source_tx_hash:tx,execution_adapter:"0x"+"c".repeat(40),
   interchain_fee_wei:"100",amount_raw:"1000",delivered:false,
   grant_stage:"first-delivery",grant_chain:chain});
  const rows=[row("base","1"),row("arbitrum","2")];
  const chains={base:{chainId:8453},arbitrum:{chainId:42161}};
  const cfg={maxGrantWei:"100000",dailyMaxWei:"1000000",minReserveWei:"1000",gasUnits:"21000"};
  const catalog={chains},effects=[],counts={base:0,arbitrum:0};
  let release,entered;
  const blocked=new Promise(resolve=>{release=resolve});
  const firstEntered=new Promise(resolve=>{entered=resolve});
  const wallet={address:walletSigner.address,
   signTransaction:async unsigned=>walletSigner.signTransaction(unsigned)};
  const db={reserveGrant:async row=>{effects.push("reserve-"+row.chain);return true},
   recordSubmitted:async()=>{},recordBroadcastError:async()=>{},
   recordConfirmed:async()=>{},recordSpendable:async()=>{},recordFailed:async()=>{}};
  const preflight=(row)=>({kind:auditKind,chain:row.grant_chain,stage:row.grant_stage,
   cfg,key:sponsorGrantKey(row,row.grant_stage),value:5000n,gasLimit:21000n,noncePending:7,
   recipient:account,beneficiary:walletSigner.address,
   unsigned:{to:account,value:5000n,nonce:7,gasLimit:21000n,
    chainId:chains[row.grant_chain].chainId,gasPrice:1000000000n},
   provider:{broadcastTransaction:async raw=>{
    const t=Transaction.from(raw);
    effects.push("broadcast-"+row.grant_chain);
    counts[row.grant_chain]++;
    if(row.grant_chain==="base"){entered();await blocked;}
    return {hash:t.hash,wait:async()=>null};
   }}});
  const running=processFreshSponsorQueue({
   rows,policy:{base:cfg,arbitrum:cfg},
   read:async row=>preflight(row),
   send:(row,g,p)=>auditSend({catalog,row,db,wallet,stage:g.stage,chain:g.chain},p),
   readTimeoutMs:1000
  });
  await firstEntered;
  const deadline=Date.now()+1500;
  while(counts.arbitrum===0&&Date.now()<deadline)
   await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(counts.arbitrum,1,
   "Arbitrum must broadcast even while Base broadcast is unresolved");
  assert.deepEqual(effects.filter(x=>x.startsWith("reserve-")).sort(),
   ["reserve-arbitrum","reserve-base"]);
  release();
  const done=await running;
  assert.equal(done.length,2);
  assert.equal(done.filter(x=>x.status==="submitted").length,2);
  assert.equal(counts.base,1);
  assert.equal(counts.arbitrum,1);
 }finally{unlinkSync(probe)}
});
