import test from "node:test";
import assert from "node:assert/strict";
import {sponsorPoliciesForCatalog,globallySponsoredChains} from "./sponsor-policy.mjs";
const address=n=>"0x"+n.toString(16).padStart(40,"0");
const hash=x=>"0x"+x.repeat(64);
function record(chain,n){return{address:address(n),runtimeCodeKeccak256:hash("a"),
 receiptPath:"deployments/receipts/"+chain+"/"+hash("b").slice(2)+"-"+address(n).slice(2)+".json"}}
function fixture(){
 const chains={base:{chainId:8453},xgrchain:{chainId:1643}};
 const infrastructure={};
 for(const [name,chain] of Object.entries(chains)){
  const keys=["factory","sourceRegistry","mailbox","ism","validatorRegistry","executionGateway"];
  const components=Object.fromEntries(keys.map((key,i)=>[key,record(name,i+1)]));
  infrastructure[name]={present:true,chainId:chain.chainId,xitaV315:{components,
   receiptPaths:Object.values(components).map(x=>x.receiptPath)}};
 }
 const rep=[{chain:"base",component:"syntheticRouter",...record("base",40)},
  {chain:"xgrchain",component:"nativeRouter",...record("xgrchain",41)}];
 const g=record("xgrchain",50),v=record("xgrchain",51);
 return {chains,infrastructure,assets:{XGR:{metadata:{assetId:hash("d")},
  routes:{routes:[{name:"xgr_to_base",sourceChain:"xgrchain",destinationChain:"base"}]},
  deployment:{present:true,assetId:hash("d"),representations:rep,
   routeDeployments:[{routeName:"xgr_to_base",sourceChain:"xgrchain",
     destinationChain:"base",routeId:hash("f"),components:{gateway:g,feeVault:v}}],
   receiptPaths:[...rep,g,v].map(x=>x.receiptPath)}}}};
}
const prices={ethereum:{usd:2500},xgr:{usd:0.0001}};
test("global opt-in covers BOTH source and target, despite no Base env override",()=>{
 const catalog=fixture();
 assert.deepEqual(globallySponsoredChains(catalog).sort(),["base","xgrchain"]);
 const p=sponsorPoliciesForCatalog({catalog,prices,env:{XITA_INTERCHAIN_SPONSOR_ENABLED:"true"}});
 assert.equal(p.base.maxGrantWei,"80000000000000");
 assert.ok(BigInt(p.xgrchain.maxGrantWei)>0n);
 assert.equal(p.base.gasUnits,"1200000");
});
test("global disabled means no policy, explicitly missing market data fails closed",()=>{
 const catalog=fixture();
 assert.deepEqual(sponsorPoliciesForCatalog({catalog,prices,env:{XITA_INTERCHAIN_SPONSOR_ENABLED:"false"}}),{});
 assert.throws(()=>sponsorPoliciesForCatalog({catalog,prices:{xgr:prices.xgr},
  env:{XITA_INTERCHAIN_SPONSOR_ENABLED:"true"}}),/price/);
});
test("explicit chain limits override only their chain, invalid partial override denied",()=>{
 const catalog=fixture(),env={XITA_INTERCHAIN_SPONSOR_ENABLED:"true",
  XITA_SPONSOR_XGRCHAIN_MAX_GRANT_WEI:"100",
  XITA_SPONSOR_XGRCHAIN_DAILY_MAX_WEI:"300",
  XITA_SPONSOR_XGRCHAIN_MIN_RESERVE_WEI:"500",
  XITA_SPONSOR_XGRCHAIN_GAS_UNITS:"1200000"};
 const p=sponsorPoliciesForCatalog({catalog,env,prices});
 assert.equal(p.xgrchain.maxGrantWei,"100");
 assert.equal(p.base.maxGrantWei,"80000000000000");
 assert.throws(()=>sponsorPoliciesForCatalog({catalog,env:{...env,
  XITA_SPONSOR_BASE_MAX_GRANT_WEI:"1"},prices}),/Incomplete/);
});
