// OPTIONAL source-funded native gas gifts. Never execute a user's Gateway or
// Mailbox transaction. Everything is rechecked against finalized on-chain
// source evidence, with a durable one-shot reservation BEFORE signing.
import {readFileSync} from "node:fs";
import {Wallet,JsonRpcProvider,Contract,zeroPadValue} from "ethers";
import {deployedRoutes} from "../../apps/web/route-availability.js";
import {findWalletSourceTx} from "../../apps/web/wallet-transfers.js";
import {readCachedGasPrices} from "./price-cache.mjs";
import {sponsorPoliciesForCatalog} from "./sponsor-policy.mjs";

const ADDR=/^0x[0-9a-f]{40}$/i;
const HASH=/^0x[0-9a-f]{64}$/i;
const UINT=/^(0|[1-9][0-9]*)$/;
const same=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const positive=x=>UINT.test(String(x))&&BigInt(x)>0n;
const tiny=x=>String(x||"").slice(0,190);
const ABI_FEE=["function interchainFeeRecipient() view returns (address)"];
const ABI_HUB=[
 "function onwardParentUsed(address,bytes32) view returns (bool)"
];
const ABI_GATEWAY=[
 "function quoteILN(uint32,bytes32,uint256) view returns (uint256,uint256,uint256,uint256)"
];

export const SPONSOR_STAGES=Object.freeze([
 "first-delivery","hub-onward","final-delivery"
]);
export function sponsorStage(row){
 if(!row||!ADDR.test(row.account||"")||!HASH.test(row.message_id||"")||
    !ADDR.test(row.execution_adapter||"")||!positive(row.interchain_fee_wei)||
    !positive(row.amount_raw))return null;
 if(row.delivered===false)return {stage:"first-delivery",
  chain:row.destination_chain,keyChain:row.source_chain,
  parentMessageId:row.message_id,sourceTxHash:row.source_tx_hash};
 if(row.delivered!==true||!row.onward_route_id)return null;
 if(!row.child_message_id)return {stage:"hub-onward",chain:"xgrchain",
  keyChain:row.source_chain,parentMessageId:row.message_id,
  sourceTxHash:row.source_tx_hash};
 if(row.child_delivered===false)return {stage:"final-delivery",
  chain:row.child_destination_chain,keyChain:row.source_chain,
  parentMessageId:row.message_id,sourceTxHash:row.source_tx_hash,
  childTxHash:row.child_source_tx_hash,childMessageId:row.child_message_id};
 return null;
}
export function sponsorGrantNeed({stage,balanceWei,gasUnits,gasPriceWei,
 nativeBridgeValueWei=0n,nativePrincipalWei=0n}){
 const balance=BigInt(balanceWei),units=BigInt(gasUnits),price=BigInt(gasPriceWei);
 const bridge=BigInt(nativeBridgeValueWei),principal=BigInt(nativePrincipalWei);
 if(balance<0n||units<21000n||units>5000000n||price<=0n||
    bridge<principal||principal<0n||!SPONSOR_STAGES.includes(stage))
  throw Error("Invalid native gas grant estimate");
 if(stage!=="hub-onward"&&bridge!==0n)throw Error("Only XGR onward can require bridge value");
 if(principal>0n&&balance<principal)
  return {status:"principal-unfunded",amountWei:"0"};
 const gas=(units*price*13n+9n)/10n;
 const desired=gas+bridge;
 const deficit=desired>balance?desired-balance:0n;
 if(deficit>gas+bridge-principal)
  throw Error("Gas grant cannot subsidize user-owned native principal");
 return {status:deficit>0n?"needed":"not-required",
  amountWei:deficit.toString(),estimatedGasWei:gas.toString(),
  requiredBalanceWei:desired.toString()};
}
export function verifiedCommittedGrant({row,first,quote}){
 if(!row||!first||!quote||
    !same(first.messageId,row.message_id)||
    !same(first.routeId,row.route_id)||
    !same(first.executionAdapter,row.execution_adapter)||
    String(first.quoteNonce||"")!==String(row.quote_nonce||"")||
    String(first.interchainFeeWei||"")!==String(row.interchain_fee_wei||"")||
    String(quote.quote_fee_wei)!==String(row.interchain_fee_wei)||
    !same(quote.route_id,first.routeId)||
    String(quote.amount_raw)!==String(row.amount_raw)||
    quote.asset!==row.asset||
    !same(quote.final_recipient,row.account)||
    quote.first_destination_chain!==row.destination_chain||
    quote.final_destination_chain!==(row.final_destination_chain||row.destination_chain)||
    !same(quote.onward_route_id,row.onward_route_id||"0x"+"0".repeat(64))||
    !positive(quote.promised_wei))
  throw Error("Signed quote commitment and finalized receipt mismatch");
 return BigInt(quote.promised_wei);
}
export function sponsorGrantKey(row,stage){
 if(!HASH.test(row?.message_id||"")||!SPONSOR_STAGES.includes(stage))
  throw Error("Invalid sponsor grant identity");
 if(!/^[a-z][a-z0-9-]{0,39}$/.test(row.source_chain||""))
  throw Error("Invalid first source chain");
 return row.source_chain+":"+row.message_id.toLowerCase()+":"+stage;
}
async function getProvider(catalog,name,map){
 const config=catalog.chains?.[name];
 if(!Number.isSafeInteger(config?.chainId)||!config?.rpcUrls?.[0])
  throw Error("Unsupported sponsor destination");
 if(!map.has(name)){
  const provider=new JsonRpcProvider(config.rpcUrls[0],config.chainId);
  const network=await provider.getNetwork();
  if(network.chainId!==BigInt(config.chainId))
   throw Error("Sponsor RPC chain identity mismatch");
  map.set(name,provider);
 }
 return map.get(name);
}
async function checkCandidate({catalog,row,stage,providers,fetcher}){
 // An indexed row by itself is not sufficient to send money. Recheck the
 // original source receipt and the independent destination Mailbox state.
 const first=await findWalletSourceTx({catalog,account:row.account,
  sourceChain:row.source_chain,txHash:row.source_tx_hash,fetcher});
 if(!first.confirmed||!same(first.messageId,row.message_id)||
   !same(first.executionAdapter,row.execution_adapter)||
   !same(first.recipient,row.account)||
   !same(first.finalRecipient,row.account)||
   first.asset!==row.asset||first.amountRaw!==String(row.amount_raw)||
   !positive(first.interchainFeeWei))throw Error("Unverified sponsored first-hop source");
 if(stage==="first-delivery"){
  if(first.delivered!==false||first.destinationChain!==row.destination_chain)
   throw Error("First delivery state changed");
  return {first};
 }
 if(first.status!=="awaiting-onward"||first.destinationChain!=="xgrchain"||
    !same(first.onwardRouteId,row.onward_route_id)||
    first.finalDestinationChain!==row.final_destination_chain)
  throw Error("Hub continuation does not match signed first-hop intent");
 if(stage==="hub-onward"){
  const hubRoute=deployedRoutes(catalog).filter(r=>r.asset===row.asset&&
   r.source==="xgrchain"&&r.destination===row.final_destination_chain&&
   same(r.routeId,row.onward_route_id));
  if(hubRoute.length!==1)throw Error("No unique signed XGR continuation route");
  const hubAdapter=catalog.infrastructure?.xgrchain?.xitaV315?.components?.executionGateway;
  if(!ADDR.test(hubAdapter?.address||""))throw Error("XGR continuation adapter not deployed");
  const provider=await getProvider(catalog,"xgrchain",providers);
  const seen=await new Contract(hubAdapter.address,ABI_HUB,provider)
   .onwardParentUsed(row.account,row.message_id);
  if(seen)throw Error("Onward parent already consumed on chain");
  return {first,route:hubRoute[0]};
 }
 if(stage==="final-delivery"){
  if(!HASH.test(row.child_message_id||"")||
     !HASH.test(row.child_source_tx_hash||""))
   throw Error("Unverified second-hop receipt");
  const next=await findWalletSourceTx({catalog,account:row.account,
   sourceChain:"xgrchain",txHash:row.child_source_tx_hash,fetcher});
  if(!next.confirmed||next.delivered!==false||
    !same(next.messageId,row.child_message_id)||
    !same(next.parentMessageId,row.message_id)||
    !same(next.routeId,row.onward_route_id)||
    next.destinationChain!==row.final_destination_chain||
    next.amountRaw!==first.amountRaw||
    !same(next.recipient,first.finalRecipient))
   throw Error("Second-hop parent binding or destination is invalid");
  return {first,next};
 }
 throw Error("Invalid sponsor step");
}
// The worker never accepts an unauthenticated public request, destination
// address or grant amount. Both come from verified read-only chain evidence.
export async function sponsorOneCandidate({
 catalog,row,db,wallet,providers=new Map(),fetcher=globalThis.fetch,
 nativePolicy,walletAware=false,afterReserve=null
}){
 const stageInfo=sponsorStage(row);
 if(!stageInfo)return {status:"ineligible"};
 const {stage,chain}=stageInfo;
 const cfg=nativePolicy?.[chain];
 if(!cfg||!positive(cfg.maxGrantWei)||!positive(cfg.dailyMaxWei)||
    !positive(cfg.minReserveWei)||!positive(cfg.gasUnits))
  return {status:"policy-unavailable",chain,stage};
 if(!same(wallet.address,row.fee_recipient||wallet.address))
  throw Error("Wrong GmbH sponsor beneficiary");
 const proof=await checkCandidate({catalog,row,stage,providers,fetcher});
 const sourceProvider=await getProvider(catalog,row.source_chain,providers);
 if(!same(await new Contract(row.execution_adapter,ABI_FEE,sourceProvider)
  .interchainFeeRecipient(),wallet.address))
  throw Error("First-hop fee beneficiary differs from sponsor wallet");
 const provider=await getProvider(catalog,chain,providers);
 const fee=await provider.getFeeData();
 const gasPrice=fee.maxFeePerGas||fee.gasPrice;
 if(!gasPrice||gasPrice<=0n)throw Error("Destination gas price unavailable");
 let bridge=0n,principal=0n;
 if(stage==="hub-onward"){
  const route=proof.route,sourceToken=route.sourceToken;
  const quote=await new Contract(route.gateway,ABI_GATEWAY,provider)
   .quoteILN(catalog.chains[route.destination].domainId,
    zeroPadValue(row.account,32),BigInt(row.amount_raw));
  if(BigInt(quote[0])<=0n)throw Error("Onward validator fee unavailable");
  bridge=BigInt(quote[2]);
  principal=sourceToken===null?BigInt(row.amount_raw):0n;
  if(bridge<principal+BigInt(quote[0]))
   throw Error("Invalid sponsored native bridge quote");
 }
 let value;
 if(walletAware){
  // Immutable, database-joined commitment; independently verified source
  // contract receipt is checked below. Never recompute a grant from current
  // wallet balance after its fee has been signed and paid.
  const quote=await db.readQuoteCommitment({row,stage,chain});
  if(!quote)return {status:"no-matching-quote-promise",chain,stage};
  value=verifiedCommittedGrant({row,first:proof.first,quote});
 }else{
  const accountBalance=await provider.getBalance(row.account);
  const needed=sponsorGrantNeed({stage,balanceWei:accountBalance,
   gasUnits:BigInt(cfg.gasUnits),gasPriceWei:gasPrice,
   nativeBridgeValueWei:bridge,nativePrincipalWei:principal});
  if(needed.status!=="needed")return {status:needed.status,chain,stage};
  value=BigInt(needed.amountWei);
 }
 if(value<=0n)throw Error("Invalid immutable sponsor grant amount");
 if(value>BigInt(cfg.maxGrantWei))
  return {status:"over-grant-cap",chain,stage,requiredWei:needed.amountWei};
 const payerBalance=await provider.getBalance(wallet.address);
 if(payerBalance<value+BigInt(cfg.minReserveWei)+gasPrice*42000n)
  return {status:"sponsor-reserve-low",chain,stage};
 const noncePending=await provider.getTransactionCount(wallet.address,"pending");
 const nonceLatest=await provider.getTransactionCount(wallet.address,"latest");
 if(noncePending!==nonceLatest)
  return {status:"sponsor-wallet-pending",chain,stage};
 const key=sponsorGrantKey(row,stage);
 const reserved=await db.reserveGrant({
  key,chain,recipient:row.account,beneficiary:wallet.address,
  amountWei:value.toString(),nonce:noncePending,
  dailyMaxWei:String(cfg.dailyMaxWei)
 });
 if(!reserved)return {status:"already-reserved-or-budget",chain,stage};
 // Durable reservation COMMITTED above, before signing or broadcast.
 // If broadcast outcome is unknown, mark needs-review and NEVER retry this key.
 afterReserve?.(key);
 try{
  const tx=await wallet.connect(provider).sendTransaction({
   to:row.account,value,nonce:noncePending,gasLimit:21000n
  });
  await db.recordSubmitted(key,tx.hash);
  return {status:"submitted",chain,stage,txHash:tx.hash,amountWei:value.toString()};
 }catch(error){
  await db.recordNeedsReview(key,tiny(error?.message||error));
  throw Error("Sponsorship outcome uncertain; reserved grant requires reconciliation");
 }
}
export function sponsorDatabase(pool){
 // SQL atomicity: reservation wins exactly once per source parent + stage;
 // unresolved reservations also consume the rolling native budget.
 return {
  async readQuoteCommitment({row,stage,chain}){
   if(!ADDR.test(row.account||"")||!HASH.test(row.message_id||"")||
      !positive(row.quote_nonce)||!ADDR.test(row.execution_adapter||"")||
      !SPONSOR_STAGES.includes(stage))throw Error("Invalid quote lookup");
   const data=await pool.query({text:
    "SELECT c.promised_wei::text,i.quote_fee_wei::text,i.route_id,"+
    " i.amount_raw::text,i.asset,i.final_recipient,i.first_destination_chain,"+
    " i.final_destination_chain,i.onward_route_id"+
    " FROM xita_sponsor_quote_commitments c"+
    " JOIN xita_sponsor_quote_intents i ON"+
    " i.source_chain=c.source_chain AND i.execution_adapter=c.execution_adapter"+
    " AND i.payer=c.payer AND i.quote_nonce=c.quote_nonce"+
    " JOIN xita_transfer_operations p ON"+
    " p.source_chain=i.source_chain AND p.execution_adapter=i.execution_adapter"+
    " AND p.account=i.payer AND p.quote_nonce=i.quote_nonce"+
    " AND p.interchain_fee_wei=i.quote_fee_wei AND p.message_id=$5"+
    " WHERE c.source_chain=$1 AND c.execution_adapter=$2"+
    " AND c.payer=$3 AND c.quote_nonce=$4"+
    " AND c.grant_chain=$6 AND c.grant_stage=$7 LIMIT 2",
    values:[row.source_chain,row.execution_adapter,row.account,
     row.quote_nonce,row.message_id,chain,stage]});
   if(data.rows.length>1)throw Error("Ambiguous quote commitment");
   return data.rows[0]||null;
  },
  async reserveGrant({key,chain,recipient,beneficiary,amountWei,nonce,dailyMaxWei}){
   const client=await pool.connect();
   try{
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",
     ["xita-sponsor:"+chain+":"+beneficiary.toLowerCase()]);
    const spent=await client.query({
     text:"SELECT COALESCE(SUM(amount_wei),0)::text AS amount FROM xita_sponsor_grants"+
      " WHERE chain_name=$1 AND sponsor_address=$2"+
      " AND created_at>=NOW()-INTERVAL '24 hours'",
     values:[chain,beneficiary.toLowerCase()]
    });
    const consumed=BigInt(spent.rows[0]?.amount||0);
    if(consumed+BigInt(amountWei)>BigInt(dailyMaxWei)){
     await client.query("COMMIT");return false;
    }
    const result=await client.query({
     text:"INSERT INTO xita_sponsor_grants "+
       "(grant_key,chain_name,sponsor_address,recipient,amount_wei,wallet_nonce,status)"+
       " VALUES($1,$2,$3,$4,$5,$6,'reserved') ON CONFLICT DO NOTHING RETURNING grant_key",
     values:[key,chain,beneficiary.toLowerCase(),recipient.toLowerCase(),
      amountWei,nonce]
    });
    await client.query("COMMIT");
    return result.rows.length===1;
   }catch(e){await client.query("ROLLBACK").catch(()=>{});throw e}
   finally{client.release()}
  },
  async recordSubmitted(key,txHash){
   if(!HASH.test(txHash||""))throw Error("Invalid sponsorship tx hash");
   const r=await pool.query({
    text:"UPDATE xita_sponsor_grants SET status='submitted',tx_hash=$2,updated_at=NOW()"+
     " WHERE grant_key=$1 AND status='reserved' RETURNING grant_key",
    values:[key,txHash.toLowerCase()]
   });
   if(r.rows.length!==1)throw Error("Sponsorship reservation changed after broadcast");
  },
  async recordNeedsReview(key,message){
   await pool.query({text:"UPDATE xita_sponsor_grants SET status='needs-review',"+
    " last_error=$2,updated_at=NOW() WHERE grant_key=$1 AND status='reserved'",
    values:[key,tiny(message)]});
  }
 };
}
// Confirm native gifts by their exact previously journaled transaction
// without ever rebroadcasting a grant after restart or uncertain RPC results.
export async function reconcileSponsorGrants({pool,catalog,wallet,providers}){
 const records=await pool.query("SELECT grant_key,chain_name,sponsor_address,recipient,"+
  " amount_wei::text AS amount_wei, wallet_nonce,tx_hash FROM xita_sponsor_grants"+
  " WHERE status='submitted' AND tx_hash IS NOT NULL ORDER BY created_at LIMIT 40");
 let checked=0,confirmed=0;
 for(const row of records.rows){
  const chain=row.chain_name,p=await getProvider(catalog,chain,providers);
  if(!same(row.sponsor_address,wallet.address))continue;
  const receipt=await p.getTransactionReceipt(row.tx_hash);
  if(!receipt)continue;
  const tx=await p.getTransaction(row.tx_hash);
  if(!tx||!same(tx.from,wallet.address)||!same(tx.to,row.recipient)||
     tx.value!==BigInt(row.amount_wei)||Number(tx.nonce)!==Number(row.wallet_nonce))
   throw Error("Sponsorship receipt does not match durable signed intent");
  checked++;
  const status=receipt.status===1?"confirmed":"needs-review";
  if(receipt.status===1)confirmed++;
  await pool.query({text:"UPDATE xita_sponsor_grants SET status=$2,updated_at=NOW()"+
   " WHERE grant_key=$1 AND status='submitted'",
   values:[row.grant_key,status]});
 }
 return {checked,confirmed};
}
export async function reportSponsorReserves({pool,catalog,wallet,policy,providers}){
 const states=[];
 for(const [chain,cfg] of Object.entries(policy)){
  try{
   const p=await getProvider(catalog,chain,providers);
   const gasPrice=(await p.getFeeData()).maxFeePerGas||
    (await p.getFeeData()).gasPrice||0n;
   const balance=await p.getBalance(wallet.address);
   const ready=gasPrice>0n&&balance>=BigInt(cfg.minReserveWei)+
    BigInt(cfg.maxGrantWei)+gasPrice*42000n;
   await pool.query({text:"INSERT INTO xita_sponsor_monitor_state "+
     "(chain_name,sponsor_address,gas_ready,balance_wei,checked_at)"+
     " VALUES($1,$2,$3,$4,NOW())"+
     " ON CONFLICT(chain_name) DO UPDATE SET "+
     " sponsor_address=EXCLUDED.sponsor_address,gas_ready=EXCLUDED.gas_ready,"+
     " balance_wei=EXCLUDED.balance_wei,checked_at=NOW()",
    values:[chain,wallet.address.toLowerCase(),ready,balance.toString()]});
   states.push({chain,ready});
  }catch{
   await pool.query({text:"INSERT INTO xita_sponsor_monitor_state "+
    "(chain_name,sponsor_address,gas_ready,balance_wei,checked_at)"+
    " VALUES($1,$2,FALSE,0,NOW())"+
    " ON CONFLICT(chain_name) DO UPDATE SET gas_ready=FALSE,checked_at=NOW()",
    values:[chain,wallet.address.toLowerCase()]});
   states.push({chain,ready:false});
  }
 }
 return states;
}
export async function runSponsorSweep({env=process.env,fetcher=globalThis.fetch}={}){
 if(env.XITA_INTERCHAIN_SPONSOR_ENABLED!=="true")return {status:"disabled"};
 const required=k=>{
  const v=String(env[k]||"").trim();if(!v)throw Error("Missing sponsor "+k);return v;
 };
 const wallet=new Wallet(required("XITA_INTERCHAIN_FEE_PRIVATE_KEY"));
 if(!same(wallet.address,required("XITA_INTERCHAIN_FEE_ADDRESS")))
  throw Error("Sponsor wallet key/address mismatch");
 const catalog=JSON.parse(readFileSync(
  new URL("../../apps/web/catalog.json",import.meta.url),"utf8"));
 const policy=sponsorPoliciesForCatalog({catalog,env,prices:await readCachedGasPrices()});
 const {Pool}=await import("pg");
 const pool=new Pool({connectionString:required("XITA_SPONSOR_DATABASE_URL"),
  max:2,connectionTimeoutMillis:3000,statement_timeout:15000});
 try{
  const rows=await pool.query(
   "SELECT p.account,p.asset,p.source_chain,p.destination_chain,p.message_id,"+
   " p.source_tx_hash,p.amount_raw::text AS amount_raw,p.delivered,"+
   " p.final_destination_chain,p.onward_route_id,p.execution_adapter,"+
   " p.interchain_fee_wei::text AS interchain_fee_wei,"+
   " p.quote_nonce::text AS quote_nonce,p.route_id,"+
   " c.message_id AS child_message_id,c.source_tx_hash AS child_source_tx_hash,"+
   " c.destination_chain AS child_destination_chain,c.delivered AS child_delivered"+
   " FROM xita_transfer_operations p LEFT JOIN LATERAL ("+
   " SELECT message_id,source_tx_hash,destination_chain,delivered FROM xita_transfer_operations c"+
   " WHERE c.parent_message_id=p.message_id AND c.source_chain='xgrchain'"+
   " AND c.account=p.account AND c.asset=p.asset AND c.amount_raw=p.amount_raw"+
   " AND c.route_id=p.onward_route_id LIMIT 1) c ON TRUE"+
   " WHERE p.execution_adapter IS NOT NULL AND p.interchain_fee_wei>0"+
   " AND p.parent_message_id IS NULL AND ("+
   " p.delivered IS FALSE OR (p.delivered IS TRUE AND"+
   " p.onward_route_id IS NOT NULL AND (c.message_id IS NULL OR c.delivered IS FALSE)))"+
   " AND NOT EXISTS (SELECT 1 FROM xita_sponsor_grants g WHERE"+
   " g.grant_key=p.source_chain||':'||p.message_id||':'||"+
   " CASE WHEN p.delivered IS FALSE THEN 'first-delivery'"+
   " WHEN c.message_id IS NULL THEN 'hub-onward' ELSE 'final-delivery' END)"+
   " ORDER BY p.source_indexed_at ASC LIMIT 120");
  const providerCache=new Map(),db=sponsorDatabase(pool),outcomes=[];
  const reserves=await reportSponsorReserves({pool,catalog,wallet,policy,
   providers:providerCache});
  const reconciled=await reconcileSponsorGrants({pool,catalog,wallet,
   providers:providerCache});
  const walletAware=env.XITA_WALLET_AWARE_SPONSORING==="true";
  for(const row of rows.rows){
   if(!policy[sponsorStage(row)?.chain])continue;
   try{outcomes.push(await sponsorOneCandidate({catalog,row,db,wallet,
    providers:providerCache,fetcher,nativePolicy:policy,walletAware}));}
   catch(e){outcomes.push({status:"held-for-review",reason:tiny(e?.message||e)})}
  }
  return {status:"checked",reviewed:rows.rows.length,reserves,reconciled,
   grants:outcomes.filter(x=>x.status==="submitted"),
   held:outcomes.filter(x=>x.status==="held-for-review").length};
 }finally{await pool.end()}
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
 runSponsorSweep().then(x=>console.log(JSON.stringify(x)),e=>{
  console.error("XITA sponsor:",tiny(e?.message||e));process.exitCode=1;
 });
}
