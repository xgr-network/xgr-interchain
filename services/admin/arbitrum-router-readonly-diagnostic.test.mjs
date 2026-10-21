// TEMPORARY DIAGNOSTIC. Read-only calls only. Remove before merging.
import test from "node:test";
import {keccak256,selector} from "../../apps/web/keccak.mjs";
import {routeSalt} from "./route-factory-draft.mjs";
const FACTORY="0x3b83687d77170d42feddfe221629cc21e771e021";
const REGISTRY="0x14d5d33a65a39f96665ed631b04fecf357bcb576";
const DEPLOYER="0x62567be722f5ef9df0dac5eefe6965b007be155d";
const WALLET="0x6a6415Aa1c945Ee437336c136c2de9E8baB1F05E";
const ASSET="0xa7585b8fbd074c1a7fa6df8b8e2e5ce73395ccbb64bf99b631c5da8ff2ac44e0";
const SALT=routeSalt(ASSET,42161,"syntheticRouter");
const TX_DATA=selector("deployWrappedXGRRouter(bytes32)")+SALT.slice(2);
const official="https://arb1.arbitrum.io/rpc";
async function req(method,params=[]){
 const control=new AbortController(),timer=setTimeout(()=>control.abort(),8500);
 try{
  const response=await fetch(official,{method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:control.signal});
  const j=await response.json();
  return j.error?{error:{code:j.error.code,message:j.error.message,data:j.error.data??null}}:{result:j.result};
 }catch(e){return {error:String(e.message||e)}}
 finally{clearTimeout(timer)}
}
const short=v=>v?.error?{error:v.error}:{result:typeof v?.result==="string"?v.result.length>300?v.result.slice(0,300)+" [trimmed]":v.result:v?.result};
test("TEMP Arbitrum router create2 and preflight gas evidence; never broadcasts",async()=>{
 const out={factory:FACTORY,registry:REGISTRY,deployer:DEPLOYER,wallet:WALLET,salt:SALT,txData:TX_DATA};
 const basic=await Promise.all([
  req("eth_chainId"),req("eth_blockNumber"),
  req("eth_getBalance",[WALLET,"latest"]),
  req("eth_call",[{to:FACTORY,data:selector("registry()")},"latest"]),
  req("eth_call",[{to:FACTORY,data:selector("syntheticDeployer()")},"latest"]),
  req("eth_getCode",[FACTORY,"latest"]),
  req("eth_getCode",[REGISTRY,"latest"]),
  req("eth_getCode",[DEPLOYER,"latest"])
 ]);
 const k=["chainId","head","walletBalance","factoryRegistry","factorySyntheticDeployer","factoryCode","registryCode","deployerCode"];
 basic.forEach((x,i)=>{out[k[i]]=k[i].endsWith("Code")&&x.result?{length:x.result.length,codeHash:keccak256(Uint8Array.from(Buffer.from(x.result.slice(2),"hex")))}:short(x)});
 const tx={from:WALLET,to:FACTORY,data:TX_DATA,value:"0x0"};
 const tries=await Promise.all([
  req("eth_estimateGas",[tx]),
  req("eth_call",[{...tx,gas:"0x1c9c380"},"latest"]),
  req("eth_estimateGas",[{...tx,gas:"0x1c9c380"}]),
  req("eth_call",[{...tx,from:"0x1111111111111111111111111111111111111111",gas:"0x1c9c380"},"latest"])
 ]);
 ["estimateWallet","callWallet30m","estimateWallet30m","callOther30m"].forEach((x,i)=>out[x]=short(tries[i]));
 console.log("XITA_ROUTER_EVIDENCE="+JSON.stringify(out));
});
