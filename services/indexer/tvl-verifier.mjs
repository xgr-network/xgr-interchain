// Receipt-backed canonical escrow TVL. The PHYSICAL escrow balance is the
// measured value; events are an independent conservation check, never another
// subtraction from the measured balance. No signing, custody, or fee adapter.
import {deployedRoutes} from "../../apps/web/route-availability.js";
import {isDeployedAsset} from "../../apps/web/listing-visibility.js";
import {routeIndexCoverage} from "./transfer-index-store.mjs";
import {keccak256} from "../../apps/web/keccak.js";

const ADDRESS=/^0x[0-9a-f]{40}$/i, HASH=/^0x[0-9a-f]{64}$/i;
const HEX=/^0x[0-9a-f]+$/i, UINT=/^(0|[1-9][0-9]*)$/;
const lower=s=>String(s??"").toLowerCase();
const fail=reason=>({status:"unavailable",reason});
const asInt=s=>UINT.test(String(s??""))?BigInt(s):null;
const asHex=s=>HEX.test(s||"")?BigInt(s):null;
const same=(a,b)=>lower(a)===lower(b);

export function escrowDescriptor(catalog,asset){
 const entry=catalog?.assets?.[asset];
 if(!isDeployedAsset(entry,catalog))return fail("asset-not-deployed");
 const meta=entry.metadata,origin=meta?.canonical?.chain,chain=catalog.chains?.[origin];
 const reps=(meta.representations||[]).filter(r=>r.chain===origin);
 if(!chain||!Number.isSafeInteger(chain.chainId)||reps.length!==1||
    !["native","collateral"].includes(reps[0].representation)||
    !Number.isInteger(meta.decimals)||meta.decimals<0||meta.decimals>36)
  return fail("invalid-canonical-asset");
 const component=reps[0].representation==="native"?"nativeRouter":"collateralRouter";
 const routers=entry.deployment.representations.filter(r=>r.chain===origin&&r.component===component&&
  ADDRESS.test(r.address||"")&&HASH.test(r.runtimeCodeKeccak256||"")&&
  entry.deployment.receiptPaths.includes(r.receiptPath));
 if(routers.length!==1)return fail("canonical-router-not-documented");
 const underlying=component==="collateralRouter"?reps[0].assetAddress:null;
 if(component==="collateralRouter"&&!ADDRESS.test(underlying||""))return fail("canonical-erc20-not-documented");
 if(component==="nativeRouter"&&underlying!==null)return fail("native-origin-address-invalid");
 const routes=deployedRoutes(catalog).filter(r=>r.asset===asset);
 const escrowRoutes=routes.filter(r=>r.source===origin||r.destination===origin);
 if(!escrowRoutes.length)return fail("canonical-routes-not-deployed");
 const router=routers[0];
 if(escrowRoutes.some(r=>!same(r.source===origin?r.sourceRouter:r.destinationRouter,router.address)))
  return fail("canonical-router-route-mismatch");
 const idSet=new Set(escrowRoutes.map(r=>r.source+":"+lower(r.routeId)));
 if(idSet.size!==escrowRoutes.length)return fail("duplicate-canonical-route");
 return {status:"ready",asset,assetId:meta.assetId,chain:origin,chainConfig:chain,
  router:lower(router.address),codeHash:lower(router.runtimeCodeKeccak256),
  kind:component==="nativeRouter"?"native":"erc20",
  token:underlying?lower(underlying):null,decimals:meta.decimals,routes,
  escrowRoutes,coingeckoId:entry.profile?.market?.priceSource==="coingecko"?
    entry.profile.market.coingeckoId:null};
}

// Grouped rows come from the immutable, finality-checked canonical transfer
// index. Each source_chain/message_id has one PK. Independent amount and
// destination-delivery evidence detects accidental balance deposits, missing
// history, withdrawals and ambiguous operation provenance.
export function reconcileEscrow({catalog,descriptor,indexedRoutes,cursors,groups,routerCode,
 routerBalance,tokenAddress=null,tokenDecimals=null,tokenCode=null,pendingBalance="0x0",
 observedHead,now=Date.now()}){
 if(descriptor?.status!=="ready")return fail("escrow-not-configured");
 const {asset,assetId,chain,chainConfig,router,codeHash,kind,token,decimals,routes,escrowRoutes}=descriptor;
 if(!Array.isArray(indexedRoutes)||!Array.isArray(cursors)||!Array.isArray(groups))
  return fail("index-evidence-missing");
 const indexed=indexedRoutes.filter(r=>r.asset===asset&&
  escrowRoutes.some(t=>t.source===r.sourceChain&&same(t.routeId,r.routeId)&&same(t.gateway,r.gateway)));
 if(indexed.length!==escrowRoutes.length)return fail("immutable-route-receipts-missing");
 const coverage=routeIndexCoverage(catalog,cursors,{now,maxAgeMs:120000,routeList:indexed});
 if(!coverage.complete)return fail("index-incomplete");
 const head=asHex(observedHead);
 if(head===null||head>BigInt(Number.MAX_SAFE_INTEGER))return fail("origin-rpc-head-invalid");
 // The finalized route-index cursor is a distinct snapshot from the live
 // balance RPC. Require recent, internally complete canonical cursor coverage
 // (above), not exact equality with the continuously advancing live head.
 // Any unindexed escrow movement still fails the independent balance-vs-event
 // conservation check below; we never fabricate or extrapolate escrow.
 const finalized=head-BigInt(Math.max(1,chainConfig.confirmations||1));
 if(finalized<0n)return fail("origin-rpc-head-invalid");
 for(const route of indexed.filter(r=>r.sourceChain===chain)){
  const cursor=cursors.find(c=>c.source_chain===route.sourceChain&&same(c.route_id,route.routeId));
  const scanned=asInt(cursor?.scanned_to),indexedHead=asInt(cursor?.finalized_head);
  if(scanned===null||indexedHead===null||scanned>finalized||
     indexedHead>finalized||scanned<indexedHead)
   return fail("origin-index-cursor-invalid");
 }
 const code=typeof routerCode==="string"&&/^0x(?:[0-9a-f]{2})+$/i.test(routerCode)?routerCode:null;
 if(!code||!same(keccak256(Uint8Array.from(code.slice(2).match(/../g).map(x=>parseInt(x,16)))),codeHash))
  return fail("canonical-router-codehash-mismatch");
 if(kind==="erc20"){
  if(!same(tokenAddress,token)||tokenDecimals!==decimals||
     typeof tokenCode!=="string"||!/^0x(?:[0-9a-f]{2})+$/i.test(tokenCode))
   return fail("underlying-erc20-identity-mismatch");
 }else if(tokenAddress!==null)return fail("unexpected-native-token");
 const actual=asHex(routerBalance),pending=asHex(pendingBalance);
 if(actual===null||pending===null||pending>actual)return fail("invalid-custody-balance");
 const routeMap=new Map(routes.map(r=>[r.source+":"+lower(r.routeId),r]));
 let locks=0n,unlocks=0n,pendingUnlocks=0n,lockCount=0n,unlockCount=0n;
 for(const g of groups){
  if(g.asset!==asset)continue;
  const route=routeMap.get(g.source_chain+":"+lower(g.route_id));
  if(!route)return fail("unrecognized-asset-operation");
  // Synthetic-only hops do not deposit or withdraw physical collateral.
  if(route.source!==chain&&route.destination!==chain)continue;
  const n=asInt(g.operation_count),bad=asInt(g.bad_count),sum=asInt(g.amount_raw);
  const maxBlock=asInt(g.max_source_block);
  const cursor=cursors.find(c=>c.source_chain===g.source_chain&&same(c.route_id,g.route_id));
  if(!same(g.asset_id,assetId)||g.destination_chain!==route.destination||
     !same(g.gateway,route.gateway)||n===null||n<=0n||bad!==0n||
     sum===null||sum<=0n||maxBlock===null||!cursor||
     asInt(cursor.scanned_to)===null||BigInt(cursor.scanned_to)<maxBlock)
   return fail("unverified-operation-group");
  if(route.source===chain){locks+=sum;lockCount+=n;}
  else if(g.delivered===true){unlocks+=sum;unlockCount+=n;}
  else if(g.delivered===false||g.delivered===null){pendingUnlocks+=sum;}
  else return fail("invalid-destination-finality");
 }
 if(unlocks>locks)return fail("escrow-underflow");
 const expected=locks-unlocks;
 // Native deferred payouts are existing beneficiary liabilities, NOT backing
 // for wrapped tokens. Do not subtract an unlock twice: read the actual router
 // balance, subtract ONLY pending liabilities, and cross-check that figure
 // against confirmed lock/unlock history.
 const backing=actual-pending;
 if((kind==="erc20"&&pending!==0n)||backing!==expected)
  return fail("escrow-balance-mismatch");
 return {status:"verified",asset,assetId,chain,kind,router,token,
  codeHash,decimals,netLockedRaw:backing.toString(),pendingUnlockRaw:pendingUnlocks.toString(),
  lockedOperations:lockCount.toString(),unlockedOperations:unlockCount.toString(),
  observedAt:new Date(now).toISOString()};
}

// The API/publication uses fixed-point cents-of-cents (1e8 USD). Token
// quantity is a BigInt in its canonical ERC20/native decimals. Never
// multiply a float by a 256-bit token amount.
export function priceEscrow(proof,record,{now=Date.now()}={}){
 if(proof?.status!=="verified")return fail("unverified-collateral");
 const price=record?.priceUsd,at=Date.parse(record?.asOf);
 if(record?.source!=="coingecko"||typeof price!=="number"||
    !Number.isFinite(price)||price<=0||price>=1e18||
    !Number.isFinite(at)||at>now+30000||now-at>300000)
  return fail("trusted-usd-price-unavailable");
 const fixed=price.toFixed(16);
 if(!/^[0-9]+\.[0-9]{16}$/.test(fixed))return fail("usd-price-precision-unavailable");
 const priceAtoms=BigInt(fixed.replace(".",""));
 if(priceAtoms===0n)return fail("usd-price-too-small");
 const usd8=BigInt(proof.netLockedRaw)*priceAtoms/
   (10n**BigInt(proof.decimals)*100000000n);
 const usdText=(usd8/100000000n).toString()+"."+(usd8%100000000n).toString().padStart(8,"0");
 const usd=Number(usdText);
 if(!Number.isFinite(usd)||usd<0)return fail("usd-value-out-of-range");
 return {...proof,priceUsd:price,priceAsOf:record.asOf,lockedUsd:usd,
  lockedUsdExact:usdText};
}

export function verifiedEvidence(catalog,proofs,now=Date.now(),flows={}){
 const assets={},positions={},statuses={};
 for(const [asset,entry] of Object.entries(catalog.assets||{})){
  if(!isDeployedAsset(entry,catalog))continue;
  const proof=proofs[asset];
  if(proof?.status!=="verified"){
   statuses[asset]=proof?.reason||"not-verified";
   continue;
  }
  if(!same(proof.assetId,entry.metadata?.assetId)||
     !Number.isFinite(Date.parse(proof.observedAt))||
     Math.abs(now-Date.parse(proof.observedAt))>120000){
   statuses[asset]="stale-or-mismatched-proof";continue;
  }
  const lockedUsd=proof.lockedUsd;
  const vault={verified:true,chain:proof.chain,router:proof.router,
   netLockedRaw:proof.netLockedRaw,valueUsd:lockedUsd};
  const f=flows[asset];
  // Gross ESCROW movement is separate from end-to-end journey turnover and
  // is only counted when canonical physical inflows/outflows were verified.
  const movement=f?.status==="verified"&&f.kind==="escrow-gross-24h"&&
   f.assetId===proof.assetId?{
    status:"verified",complete:true,movedUsd:f.movedUsd,
    windowStart:f.windowStart,windowEnd:f.windowEnd,metric:"escrow-gross-24h",
    inflowRaw:f.inflowRaw,outflowRaw:f.outflowRaw,proofDigest:f.proofDigest
   }:{status:"unavailable"};
  assets[asset]={assetId:asset,verified:true,asOf:proof.observedAt,
   market:{status:"unavailable"},
   custody:{status:"verified",complete:true,lockedUsd,vaults:[vault]},
   movement};
  const proofDigest=keccak256(JSON.stringify({assetId:proof.assetId,
   chain:proof.chain,router:proof.router,token:proof.token,raw:proof.netLockedRaw,
   lockedUsdExact:proof.lockedUsdExact,codeHash:proof.codeHash,
   priceAsOf:proof.priceAsOf,asOf:proof.observedAt}));
  positions[asset]={assetId:proof.assetId,lockedUsd:proof.lockedUsdExact,
   verified:true,complete:true,valuationVerified:true,
   proofDigest,asOf:proof.observedAt};
  statuses[asset]="verified";
 }
 return {schemaVersion:1,kind:"xita-asset-metrics-v1",
  asOf:new Date(now).toISOString(),assets,
  custodyEvidence:{kind:"xita-verified-tvl-v1",positions,statuses}};
}
