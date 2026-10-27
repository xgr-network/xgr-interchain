// OPTIONAL source-funded native gas gifts. Never execute a user's Gateway or
// Mailbox transaction. Everything is rechecked against finalized on-chain
// source evidence, with a durable one-shot reservation BEFORE signing.
import {readFileSync} from "node:fs";
import {Wallet,JsonRpcProvider,Contract,Transaction,keccak256} from "ethers";
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

export const SPONSOR_STAGES=Object.freeze([
 "first-delivery","hub-onward","final-delivery"
]);
// Every stage comes from an immutable signed quote. Never choose a grant
// according to whether TX2/TX3 already happened: all are prepaid after TX1.
export function sponsorStage(row,stage,chain){
 if(!row||!ADDR.test(row.account||"")||!HASH.test(row.message_id||"")||
    !HASH.test(row.source_tx_hash||"")||!ADDR.test(row.execution_adapter||"")||
    !positive(row.interchain_fee_wei)||!positive(row.amount_raw)||
    row.delivered!==false||!SPONSOR_STAGES.includes(stage))return null;
 const twoHop=row.destination_chain==="xgrchain"&&
  HASH.test(row.onward_route_id||"")&&
  row.final_destination_chain&&row.final_destination_chain!=="xgrchain";
 const expected=stage==="first-delivery"?row.destination_chain:
  twoHop&&stage==="hub-onward"?"xgrchain":
  twoHop&&stage==="final-delivery"?row.final_destination_chain:null;
 if(!expected||chain!==expected)return null;
 return {stage,chain,keyChain:row.source_chain,
  parentMessageId:row.message_id,sourceTxHash:row.source_tx_hash};
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
 // Independently authenticate the finalized TX1 fee receipt and wallet.
 // No sponsorship is authorized once TX2 has already been delivered.
 const first=await findWalletSourceTx({catalog,account:row.account,
  sourceChain:row.source_chain,txHash:row.source_tx_hash,fetcher});
 if(!first.confirmed||first.status!=="awaiting-proof"||first.delivered!==false||
    !same(first.messageId,row.message_id)||!same(first.routeId,row.route_id)||
    !same(first.executionAdapter,row.execution_adapter)||
    !same(first.recipient,row.account)||!same(first.finalRecipient,row.account)||
    !same(first.onwardRouteId,row.onward_route_id)||
    (first.finalDestinationChain||first.destinationChain)!==
      (row.final_destination_chain||row.destination_chain)||
    first.destinationChain!==row.destination_chain||
    first.asset!==row.asset||first.amountRaw!==String(row.amount_raw)||
    !positive(first.interchainFeeWei)||
    String(first.quoteNonce||"")!==String(row.quote_nonce))
  throw Error("TX1 Gateway fee receipt or native finality not verified");
 if(stage==="first-delivery")return {first};
 if(first.destinationChain!=="xgrchain"||
    !HASH.test(row.onward_route_id||"")||
    !same(first.onwardRouteId,row.onward_route_id)||
    first.finalDestinationChain!==row.final_destination_chain)
  throw Error("Unsigned or invalid two-hop continuation");
 const routes=deployedRoutes(catalog).filter(r=>r.asset===row.asset&&
  r.source==="xgrchain"&&r.destination===row.final_destination_chain&&
  same(r.routeId,row.onward_route_id));
 if(routes.length!==1)throw Error("No unique documented second-hop route");
 const hubAdapter=catalog.infrastructure?.xgrchain?.xitaV315?.components?.executionGateway;
 if(!ADDR.test(hubAdapter?.address||""))
  throw Error("Verified XGR onward adapter unavailable");
 const hubProvider=await getProvider(catalog,"xgrchain",providers);
 if(await new Contract(hubAdapter.address,ABI_HUB,hubProvider)
  .onwardParentUsed(row.account,row.message_id))
  throw Error("Original parent already used for second hop");
 return {first,route:routes[0]};
}
// N-08: One receipt confirmation is NOT canonical finality on an L2.
// Do not mark a gas payment complete until a safe-chain head covers its
// block, and the block hash remains canonical. Unsupported safe tags fail
// closed (the worker retains the submitted reservation for reconciliation).
export async function verifiedSponsorFinality({provider,chain,receipt,txHash}){
 if(!receipt||receipt.status!==1||!HASH.test(txHash||"")||
    !same(receipt.hash,txHash)||!HASH.test(receipt.blockHash||"")||
    !Number.isSafeInteger(receipt.blockNumber)||receipt.blockNumber<1)
  return false;
 const safeTag=chain==="xgrchain"?"latest":"safe";
 try{
  const [head,block,original]=await Promise.all([
   provider.getBlock(safeTag),provider.getBlock(receipt.blockNumber),
   provider.getTransactionReceipt(txHash)]);
  if(!head||!block||!original||
     head.number<receipt.blockNumber||
     !same(block.hash,receipt.blockHash)||
     !same(original.blockHash,receipt.blockHash)||
     original.status!==1)return false;
  if(chain==="xgrchain"&&head.number-receipt.blockNumber<2)
   return false;
  return true;
 }catch{return false}
}
// The worker never accepts an unauthenticated public request, destination
// address or grant amount. Both come from verified read-only chain evidence.
export async function sponsorOneCandidate({
 catalog,row,db,wallet,providers=new Map(),fetcher=globalThis.fetch,
 nativePolicy,stage,chain,afterReserve=null
}){
 const stageInfo=sponsorStage(row,stage,chain);
 if(!stageInfo)return {status:"ineligible"};
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
 // The amount is the original atomic signed quote commitment. Never
 // recompute from a later balance or wait for an unminted hub principal.
 const quote=await db.readQuoteCommitment({row,stage,chain});
 if(!quote)return {status:"no-matching-quote-promise",chain,stage};
 const value=verifiedCommittedGrant({row,first:proof.first,quote});
 if(value<=0n)throw Error("Invalid immutable sponsor grant amount");
 if(value>BigInt(cfg.maxGrantWei))
  return {status:"over-grant-cap",chain,stage,requiredWei:value.toString()};
 // Native transfers can require more than 21,000 gas on L2s because of
 // chain-specific execution overhead. Estimate the exact signer/recipient
 // transfer before reserving a nonce, and never silently underfund it.
 const gasEstimate=BigInt(await provider.estimateGas({
  from:wallet.address,to:row.account,value
 }));
 if(gasEstimate<21000n||gasEstimate>100000n)
  return {status:"unsafe-gas-estimate",chain,stage};
 const gasLimit=(gasEstimate*12n+9n)/10n;
 if(gasLimit>120000n)
  return {status:"unsafe-gas-estimate",chain,stage};
 const payerBalance=await provider.getBalance(wallet.address);
 if(payerBalance<value+BigInt(cfg.minReserveWei)+gasPrice*gasLimit)
  return {status:"sponsor-reserve-low",chain,stage};
 const noncePending=await provider.getTransactionCount(wallet.address,"pending");
 const nonceLatest=await provider.getTransactionCount(wallet.address,"latest");
 if(noncePending!==nonceLatest)
  return {status:"sponsor-wallet-pending",chain,stage};
 const key=sponsorGrantKey(row,stage);
 const unsigned=await wallet.connect(provider).populateTransaction({
  to:row.account,value,nonce:noncePending,gasLimit
 });
 const rawTx=await wallet.signTransaction(unsigned);
 const prepared=Transaction.from(rawTx);
 if(!same(prepared.from,wallet.address)||!same(prepared.to,row.account)||
    prepared.value!==value||prepared.nonce!==noncePending||
    prepared.chainId!==BigInt(catalog.chains[chain].chainId)||
    prepared.gasLimit!==gasLimit)
  throw Error("Sponsor prepared transaction mismatch");
 const reserved=await db.reserveGrant({
  key,chain,recipient:row.account,beneficiary:wallet.address,
  amountWei:value.toString(),nonce:noncePending,
  dailyMaxWei:String(cfg.dailyMaxWei),rawTx,txHash:prepared.hash
 });
 if(!reserved)return {status:"already-reserved-or-budget",chain,stage};
 // Durable reservation COMMITTED above, before signing or broadcast.
 // If broadcast outcome is unknown, mark needs-review and NEVER retry this key.
 afterReserve?.(key);
 try{
  const tx=await provider.broadcastTransaction(rawTx);
  if(!same(tx.hash,prepared.hash))throw Error("Sponsor broadcast hash mismatch");
  await db.recordSubmitted(key,prepared.hash);
  // A single wallet may need two XGRChain grants. Confirm each grant before
  // attempting the next nonce rather than postponing it until a timer tick.
  // A timeout NEVER authorizes a duplicate transaction.
  let receipt=null;
  try{receipt=await tx.wait(1,30000)}catch{}
  if(receipt){
   if(receipt.hash?.toLowerCase()!==tx.hash.toLowerCase()||
      !same(tx.from,wallet.address)||!same(tx.to,row.account)||
      BigInt(tx.value)!==value||Number(tx.nonce)!==Number(noncePending))
    throw Error("Sponsor receipt mismatch; operator reconciliation required");
   if(await verifiedSponsorFinality({provider,chain,receipt,txHash:tx.hash})){
    await db.recordConfirmed(key,tx.hash);
    return {status:"confirmed",chain,stage,txHash:tx.hash,amountWei:value.toString()};
   }
   if(receipt.status===0){await db.recordFailed(key,tx.hash);
    return {status:"needs-review",chain,stage,txHash:tx.hash};}
   return {status:"submitted",chain,stage,txHash:tx.hash};
  }
  return {status:"submitted",chain,stage,txHash:tx.hash,amountWei:value.toString()};
 }catch(error){
  // Durable signed bytes remain recoverable. Never create a new payout.
  await db.recordBroadcastError(key,tiny(error?.message||error)).catch(()=>{});
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
  async reserveGrant({key,chain,recipient,beneficiary,amountWei,nonce,dailyMaxWei,rawTx,txHash}){
   if(!/^0x[0-9a-f]{100,12000}$/.test(rawTx||"")||
      !HASH.test(txHash||"")||!same(keccak256(rawTx),txHash))
    throw Error("Invalid prepared sponsor transaction");
   const tx=Transaction.from(rawTx);
   if(!same(tx.from,beneficiary)||!same(tx.to,recipient)||
      tx.value!==BigInt(amountWei)||tx.nonce!==Number(nonce))
    throw Error("Prepared transaction does not match reservation");
   const client=await pool.connect();
   try{
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",
     ["xita-sponsor:"+chain+":"+beneficiary.toLowerCase()]);
    // Same per-chain budget lock as the atomic signer-commitment writer.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",
     ["xita-sponsor-quote-budget:"+chain]);
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
    if(result.rows.length===1)
     await client.query({text:"INSERT INTO xita_sponsor_prepared_tx"+
      " (grant_key,tx_hash,raw_tx) VALUES($1,$2,$3)",
      values:[key,txHash.toLowerCase(),rawTx.toLowerCase()]});
    await client.query("COMMIT");
    return result.rows.length===1;
   }catch(e){await client.query("ROLLBACK").catch(()=>{});throw e}
   finally{client.release()}
  },
  async recordBroadcastError(key,message){
   await pool.query({text:"UPDATE xita_sponsor_grants SET last_error=$2"+
    " WHERE grant_key=$1 AND status IN ('reserved','submitted')",
    values:[key,tiny(message)]});
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
  async recordConfirmed(key,txHash){
   if(!HASH.test(txHash||""))throw Error("Invalid sponsor receipt hash");
   const result=await pool.query({text:
    "UPDATE xita_sponsor_grants SET status='confirmed',updated_at=NOW()"+
    " WHERE grant_key=$1 AND tx_hash=$2 AND status='submitted' RETURNING grant_key",
    values:[key,txHash.toLowerCase()]});
   if(result.rows.length!==1)throw Error("Sponsor confirmation journal changed");
  },
  async recordFailed(key,txHash){
   if(!HASH.test(txHash||""))throw Error("Invalid sponsor receipt hash");
   await pool.query({text:
    "UPDATE xita_sponsor_grants SET status='needs-review',updated_at=NOW()"+
    " WHERE grant_key=$1 AND (tx_hash=$2 OR"+
     " (tx_hash IS NULL AND status='reserved'))"+
     " AND status IN ('submitted','reserved')",
    values:[key,txHash.toLowerCase()]});
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
// F-08: These are READ-ONLY RPC observations. Bounding them prevents one
// stalled provider from blocking reconciliation on healthy chains. Late
// completions never trigger a grant send or a database state transition.
async function boundedSponsorReconcileRead(read,timeoutMs){
 let timer;
 try{
  return await Promise.race([
   Promise.resolve().then(read),
   new Promise((_,reject)=>{timer=setTimeout(()=>
    reject(Error("Sponsor reconciliation read deadline exceeded")),timeoutMs);})
  ]);
 }finally{clearTimeout(timer);}
}
async function inspectSubmittedSponsorGrant({row,catalog,wallet,providers}){
 const chain=row.chain_name,p=await getProvider(catalog,chain,providers);
 const hash=row.tx_hash||row.prepared_hash;
 if(!HASH.test(hash||""))throw Error("Missing durable payment hash");
 if(row.raw_tx){
  const signed=Transaction.from(row.raw_tx);
  if(!same(keccak256(row.raw_tx),hash)||
     !same(signed.from,wallet.address)||!same(signed.to,row.recipient)||
     signed.value!==BigInt(row.amount_wei)||
     signed.nonce!==Number(row.wallet_nonce)||
     signed.chainId!==BigInt(catalog.chains[chain]?.chainId))
   throw Error("Prepared payment contradicts durable signed intent");
 }
 let receipt=await p.getTransactionReceipt(hash);
 if(!receipt&&row.raw_tx){
  const confirmedNonce=await p.getTransactionCount(wallet.address,"latest");
  if(confirmedNonce>Number(row.wallet_nonce))return "needs-review";
  if(confirmedNonce===Number(row.wallet_nonce)){
   const pending=await p.getTransaction(hash);
   if(!pending){
    try{await p.broadcastTransaction(row.raw_tx)}
    catch(e){
     if(!/already known|known transaction|already imported/i.test(String(e?.message||e)))
      throw e;
    }
   }
  }
  receipt=await p.getTransactionReceipt(hash);
 }
 if(!receipt)return "pending";
 const tx=await p.getTransaction(hash);
 if(!tx||!same(tx.from,wallet.address)||!same(tx.to,row.recipient)||
    tx.value!==BigInt(row.amount_wei)||Number(tx.nonce)!==Number(row.wallet_nonce))
  throw Error("Sponsorship receipt does not match durable signed intent");
 if(receipt.status===1){
  if(!(await verifiedSponsorFinality({provider:p,chain,receipt,txHash:hash})))
   return "pending";
  return "confirmed";
 }
 if(receipt.status===0)return "needs-review";
 throw Error("Sponsorship receipt status not authoritative");
}
export async function reconcileSponsorGrants({
 pool,catalog,wallet,providers=new Map(),readTimeoutMs=12000
}){
 if(!Number.isSafeInteger(readTimeoutMs)||readTimeoutMs<1||readTimeoutMs>30000)
  throw Error("Invalid sponsor reconciliation deadline");
 // Bound each chain independently and rotate unresolved records durably.
 // updated_at on submitted grants is retry scheduling metadata only;
 // created_at, nonce, amount and exact tx_hash remain immutable.
 const records=await pool.query({text:
  "WITH due AS (SELECT grant_key,chain_name,sponsor_address,recipient,"+
  " amount_wei::text AS amount_wei,wallet_nonce,tx_hash,updated_at,created_at,"+
  " ROW_NUMBER() OVER (PARTITION BY chain_name"+
  " ORDER BY updated_at ASC,created_at ASC,grant_key ASC) AS chain_rank"+
  " FROM xita_sponsor_grants"+
  " WHERE status IN ('submitted','reserved')"+
  " AND (tx_hash IS NOT NULL OR grant_key IN"+
  " (SELECT grant_key FROM xita_sponsor_prepared_tx))"+
  " AND sponsor_address=$1 AND updated_at<=NOW()-INTERVAL '60 seconds')"+
  " SELECT due.grant_key,due.chain_name,due.sponsor_address,due.recipient,"+
  " due.amount_wei,due.wallet_nonce,due.tx_hash,s.raw_tx,"+
  " s.tx_hash AS prepared_hash"+
  " FROM due LEFT JOIN xita_sponsor_prepared_tx s"+
  " ON s.grant_key=due.grant_key WHERE chain_rank<=12"+
  " ORDER BY chain_rank ASC,updated_at ASC,chain_name ASC,grant_key ASC LIMIT 40",
  values:[wallet.address.toLowerCase()]});
 let checked=0,confirmed=0,held=0,chainFailures=0,journalErrors=0;
 const unavailableChains=new Set();
 for(const row of records.rows){
  // Foreign rows cannot be promoted by this worker, even under stale SQL.
  if(!same(row.sponsor_address,wallet.address)){held++;continue;}
  if(unavailableChains.has(row.chain_name)){held++;continue;}
  let lastError=null;
  try{
   const state=await boundedSponsorReconcileRead(()=>
    inspectSubmittedSponsorGrant({row,catalog,wallet,providers}),readTimeoutMs);
   if(state==="pending"){held++;continue;}
   // Never mark anything confirmed before the complete original transaction
   // identity and chain-native finality have both been verified.
   const result=await pool.query({text:
    "UPDATE xita_sponsor_grants SET status=$2,tx_hash=COALESCE(tx_hash,$3),"+
   " updated_at=NOW(),last_error=NULL"+
    " WHERE grant_key=$1 AND (tx_hash=$3 OR"+
   " (tx_hash IS NULL AND status='reserved'))"+
   " AND status IN ('submitted','reserved')",
    values:[row.grant_key,state,row.tx_hash||row.prepared_hash]});
   if(result.rowCount===1){
    checked++;if(state==="confirmed")confirmed++;
   }else held++;
  }catch(e){
   held++;lastError=tiny(e?.message||e);
   // A mismatched original transaction is a grant-specific anomaly, not
   // evidence that the entire chain's RPC provider is unavailable.
   if(!lastError.includes("durable signed intent")){
    unavailableChains.add(row.chain_name);chainFailures++;
   }
  }finally{
   // Move a retained unknown result to the back of the bounded worklist.
   // No transaction bytes are signed or rebroadcast in reconciliation.
   // Failure to write scheduling metadata leaves the original obligation.
   try{
    await pool.query({text:
     "UPDATE xita_sponsor_grants SET updated_at=NOW(),last_error=$3"+
     " WHERE grant_key=$1 AND tx_hash=$2 AND status='submitted'",
     values:[row.grant_key,row.tx_hash||row.prepared_hash,lastError]});
   }catch{journalErrors++;}
  }
 }
 return {checked,confirmed,held,chainFailures,journalErrors};
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
    BigInt(cfg.maxGrantWei)+gasPrice*120000n;
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
// Resolve quotes five minutes AFTER the on-chain EIP-712 expiry, only from a
// canonical FINALIZED source block (never by TTL alone). The 5-minute
// grace covers delayed wallet submission and source ingestion; separately
// finalized redemption evidence is still mandatory on the RPC.
// A prior execution may create gas obligations; only unequivocally UNUSED
// expired quotes can release them. Ambiguous RPCs leave promises reserved.
export async function reconcileExpiredSponsorQuotes({pool,catalog,providers=new Map(),now=Date.now()}){
 const items=await pool.query({text:
  "SELECT i.source_chain,i.execution_adapter,i.payer,i.quote_nonce::text AS quote_nonce,"+
  " i.quote_expires_at FROM xita_sponsor_quote_intents i"+
  " LEFT JOIN xita_sponsor_quote_resolutions r ON"+
  " r.source_chain=i.source_chain AND r.execution_adapter=i.execution_adapter"+
  " AND r.payer=i.payer AND r.quote_nonce=i.quote_nonce"+
  " WHERE r.quote_nonce IS NULL AND i.quote_expires_at < NOW()-INTERVAL '5 minutes'"+
  " ORDER BY i.quote_expires_at LIMIT 80"});
 let resolved=0,held=0;
 const abi=["function nonceUsed(address,uint256) view returns (bool)"];
 for(const item of items.rows){
  try{
   const p=await getProvider(catalog,item.source_chain,providers);
   const tag=item.source_chain==="xgrchain"?"latest":"finalized";
   const head=await p.getBlock(tag);
   if(!head||!HASH.test(head.hash||"")||
      !Number.isSafeInteger(head.timestamp)||head.timestamp<=0||
      head.timestamp*1000 < new Date(item.quote_expires_at).getTime()+120000||
      (item.source_chain==="xgrchain"&&
       (await p.getBlockNumber())-head.number<0))
    {held++;continue}
   const contract=new Contract(item.execution_adapter,abi,p);
   const used=await contract.nonceUsed(item.payer,item.quote_nonce,{blockTag:head.number});
   // Disagreeing or unavailable finalized evidence never releases the funds.
   const result=await pool.query({text:
    "INSERT INTO xita_sponsor_quote_resolutions"+
    " (source_chain,execution_adapter,payer,quote_nonce,resolution,"+
    " finalized_source_block,finalized_source_hash)"+
    " VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",
    values:[item.source_chain,item.execution_adapter,item.payer,item.quote_nonce,
     used?"used":"expired-unused",head.number,head.hash.toLowerCase()]});
   if(result.rowCount===1)resolved++;
  }catch{held++}
 }
 return {resolved,held};
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
   " c.grant_stage,c.grant_chain"+
   " FROM xita_transfer_operations p"+
   " JOIN xita_sponsor_quote_intents i ON"+
   " i.source_chain=p.source_chain AND i.execution_adapter=p.execution_adapter"+
   " AND i.payer=p.account AND i.quote_nonce=p.quote_nonce"+
   " AND i.quote_fee_wei=p.interchain_fee_wei"+
   " JOIN xita_sponsor_quote_commitments c ON"+
   " c.source_chain=i.source_chain AND c.execution_adapter=i.execution_adapter"+
   " AND c.payer=i.payer AND c.quote_nonce=i.quote_nonce"+
   " WHERE p.parent_message_id IS NULL AND p.delivered IS FALSE"+
   " AND p.execution_adapter IS NOT NULL AND p.interchain_fee_wei>0"+
   " AND NOT EXISTS (SELECT 1 FROM xita_sponsor_grants g WHERE"+
   " g.grant_key=p.source_chain||':'||p.message_id||':'||c.grant_stage)"+
   " ORDER BY p.source_indexed_at ASC,c.grant_stage ASC LIMIT 120");
  const providerCache=new Map(),db=sponsorDatabase(pool),outcomes=[];
  const expiredQuotes=await reconcileExpiredSponsorQuotes({pool,catalog,providers:providerCache});
  const reserves=await reportSponsorReserves({pool,catalog,wallet,policy,
   providers:providerCache});
  const reconciled=await reconcileSponsorGrants({pool,catalog,wallet,
   providers:providerCache});
  for(const row of rows.rows){
   const grant=sponsorStage(row,row.grant_stage,row.grant_chain);
   if(!grant){outcomes.push({status:"held-for-review",reason:"Invalid signed grant stage"});continue}
   if(!policy[grant.chain])continue;
   try{outcomes.push(await sponsorOneCandidate({catalog,row,db,wallet,
    providers:providerCache,fetcher,nativePolicy:policy,
    stage:grant.stage,chain:grant.chain}));}
   catch(e){outcomes.push({status:"held-for-review",reason:tiny(e?.message||e)})}
  }
  return {status:"checked",reviewed:rows.rows.length,expiredQuotes,reserves,reconciled,
   grants:outcomes.filter(x=>x.status==="submitted"),
   held:outcomes.filter(x=>x.status==="held-for-review").length};
 }finally{await pool.end()}
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
 runSponsorSweep().then(x=>console.log(JSON.stringify(x)),e=>{
  console.error("XITA sponsor:",tiny(e?.message||e));process.exitCode=1;
 });
}
