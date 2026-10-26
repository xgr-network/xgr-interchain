import {isIP} from "node:net";
import {readFile,stat} from "node:fs/promises";
import {Pool} from "pg";
import {TypedDataEncoder} from "ethers";
import {MANAGED_QUOTE_TYPES} from "./quote-service.mjs";
import {sponsorCapacityCovered} from "./sponsor-funding.mjs";
import {COINGECKO_GAS_COIN_IDS,usdPrice12} from "./fee-quote.mjs";

// Source headers are accepted ONLY through the loopback Nginx reverse proxy.
// Never trust public X-Forwarded-For, CF-IPCountry or user-supplied country.
export function verifiedClientIP(req){
 const peer=String(req.socket?.remoteAddress||"");
 if(!["127.0.0.1","::1","::ffff:127.0.0.1"].includes(peer))
  throw Error("Untrusted quote proxy");
 const value=req.headers?.["x-real-ip"];
 if(typeof value!=="string"||value.length>45||!isIP(value))
  throw Error("Client IP missing from trusted proxy");
 return value;
}
let cache;
export async function lookupIpCountry(ip,{path=process.env.XITA_TAX_COUNTRY_CIDR_PATH}={}){
 if(!path)return {code:null,source:"not-configured",revision:null};
 const metadata=await stat(path);
 if(!cache||cache.path!==path||cache.mtime!==metadata.mtimeMs){
  // Same locally refreshed CIDR,ISO2 model as the existing XGR_Web OTC
  // service; never make an outbound HTTP lookup for a customer request.
  const {BlockList}=await import("node:net");
  const groups=new Map();
  const lines=(await readFile(path,"utf8")).split(/\r?\n/);
  for(const line of lines){
   if(!line||line.startsWith("#"))continue;
   const [cidr,rawCountry]=line.trim().split(/[\t,]/);
   if(!/^[A-Za-z]{2}$/.test(rawCountry||"")||rawCountry.toUpperCase()==="ZZ")continue;
   const [address,prefix]=String(cidr||"").split("/");
   const type=isIP(address),n=Number(prefix);
   if(!type||!Number.isInteger(n)||n<0||n>(type===4?32:128))continue;
   const code=rawCountry.toUpperCase();
   if(!groups.has(code))groups.set(code,new BlockList());
   groups.get(code).addSubnet(address,n,type===4?"ipv4":"ipv6");
  }
  cache={path,mtime:metadata.mtimeMs,groups};
 }
 const type=isIP(ip);
 if(!type)return {code:null,source:"invalid-ip",revision:null};
 for(const [code,blocks] of cache.groups)
  if(blocks.check(ip,type===4?"ipv4":"ipv6"))
   return {code,source:"cidr-local",revision:new Date(cache.mtime).toISOString()};
 return {code:null,source:"no-match",revision:new Date(cache.mtime).toISOString()};
}
export function eurValue(wei,eurPerNative){
 const v=BigInt(wei),price=usdPrice12(eurPerNative);
 if(v<=0n||price<=0n)throw Error("Invalid EUR valuation");
 const units=(v*price+5n*10n**21n)/(10n**22n);
 return (units/100000000n).toString()+"."+(units%100000000n).toString().padStart(8,"0");
}
export function quoteEvidence(reply,prices,ip,location){
 const q=reply?.quote;
 if(reply?.status!=="SIGNED_INTERCHAIN_FEE_QUOTE"||!q||!isIP(ip))
  throw Error("Invalid paid quote evidence");
 const country=/^[A-Z]{2}$/.test(location?.code||"")?location.code:null;
 const coin=COINGECKO_GAS_COIN_IDS[reply.source],entry=prices?.[coin];
 const timestamp=Number(entry?.last_updated_at);
 const eur=Number(entry?.eur);
 const validEur=Number.isFinite(eur)&&eur>0&&Number.isSafeInteger(timestamp)&&Math.abs(Date.now()/1000-timestamp)<=900;
 return {source:reply.source,adapter:reply.executionAddress.toLowerCase(),
  payer:q.payer.toLowerCase(),nonce:String(q.nonce),fee:String(q.interchainFeeWei),
  ip,country,sourceCountry:location?.source||"unavailable",
  revision:location?.revision||null,coin,eurRate:validEur?eur.toString():null,
  euro:validEur?eurValue(q.interchainFeeWei,eur):null,
  priceAt:validEur?new Date(timestamp*1000).toISOString():null,
  issuedAt:new Date(Number(q.issuedAt)*1000).toISOString(),
  expiresAt:new Date(reply.expiresAt*1000).toISOString()};
}
export async function saveQuoteEvidence(row,{
 connectionString=process.env.XITA_TAX_QUOTE_DATABASE_URL,
 quoteReply=null,grantLimits=null,readLiveFunding=null,
 poolFactory=opts=>new Pool(opts)
}={}){
 if(!connectionString)throw Error("Tax evidence database unavailable");
 const pool=poolFactory({connectionString,max:1,connectionTimeoutMillis:2000});
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const result=await client.query(
   `INSERT INTO xita_tax_quote_evidence
   (source_chain,execution_adapter,payer,quote_nonce,quoted_fee_wei,
    client_ip,ip_country_code,ip_country_source,ip_country_db_revision,
    native_coin_id,native_eur_price,gross_fee_eur,eur_price_source,
    eur_price_at,quote_issued_at,quote_expires_at)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'coingecko', $13,$14,$15)
   ON CONFLICT DO NOTHING`,
   [row.source,row.adapter,row.payer,row.nonce,row.fee,row.ip,row.country,
    row.sourceCountry,row.revision,row.coin,row.eurRate,row.euro,row.priceAt,
    row.issuedAt,row.expiresAt]);
  if(result.rowCount!==1)throw Error("Duplicate signed quote nonce");
  if(quoteReply?.pricing?.walletAware===true){
   const q=quoteReply.quote,grants=quoteReply.pricing.sponsorCommitments;
   if(!q||!Array.isArray(grants)||grants.length>3||
      quoteReply.source!==row.source||q.payer.toLowerCase()!==row.payer||
      String(q.nonce)!==row.nonce||String(q.interchainFeeWei)!==row.fee)
    throw Error("Immutable quote commitment mismatch");
   const digest=TypedDataEncoder.hash({name:"XITA Interchain Fee",version:"1",
    chainId:quoteReply.sourceChainId,
    verifyingContract:quoteReply.executionAddress},MANAGED_QUOTE_TYPES,q).toLowerCase();
   const route=quoteReply.pricing;
   await client.query({
    text:"INSERT INTO xita_sponsor_quote_intents "+
     "(source_chain,execution_adapter,payer,quote_nonce,quote_fee_wei,quote_digest,"+
     "asset,amount_raw,gateway,route_id,first_destination_chain,"+
     "final_destination_chain,final_recipient,onward_route_id,quote_issued_at,quote_expires_at) "+
     "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)",
    values:[row.source,row.adapter,row.payer,row.nonce,row.fee,digest,
     quoteReply.asset,q.amount,q.gateway.toLowerCase(),q.routeId.toLowerCase(),
     route.firstDestinationChain,quoteReply.destination,
     "0x"+q.finalRecipient.slice(-40).toLowerCase(),q.onwardRouteId.toLowerCase(),
     row.issuedAt,row.expiresAt]
   });
   // Lock the same per-chain budget used by the actual grant worker.
   // Existing signed promises must be funded as well as the NEW quote,
   // under one serializable-by-chain critical section (N-07).
   for(const chain of [...new Set(grants.map(g=>g.chain))].sort()){
    const cap=grantLimits?.[chain];
    if(!cap||typeof readLiveFunding!=="function")
     throw Error("Atomic sponsor funding verifier unavailable");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",
     ["xita-sponsor-quote-budget:"+chain]);
    // Keep all unproven/expired quotes reserved for now: an expired quote
    // may have executed before its TTL. A separate finality-verified
    // on-chain redemption reconciliation is required before releasing it.
    const reserved=await client.query({text:
     "SELECT COALESCE(SUM(c.promised_wei),0)::text AS amount,COUNT(*)::int AS count"+
     " FROM xita_sponsor_quote_commitments c"+
     " WHERE c.grant_chain=$1"+
     " AND c.created_at >= NOW()-INTERVAL '24 hours'"+
     " AND NOT EXISTS ("+
     " SELECT 1 FROM xita_sponsor_grants g"+
     " JOIN xita_transfer_operations p ON"+
     " g.grant_key=p.source_chain||':'||p.message_id||':'||c.grant_stage"+
     " WHERE p.source_chain=c.source_chain AND p.execution_adapter=c.execution_adapter"+
     " AND p.account=c.payer AND p.quote_nonce=c.quote_nonce"+
     " AND g.status='confirmed')",
     values:[chain]});
    const issued=await client.query({text:
     "SELECT COALESCE(SUM(amount_wei),0)::text AS amount"+
     " FROM xita_sponsor_grants"+
     " WHERE chain_name=$1 AND created_at >= NOW()-INTERVAL '24 hours'",
     values:[chain]});
    const fresh=grants.filter(g=>g.chain===chain).map(g=>g.amountWei);
    const evidence=await readLiveFunding(chain);
    const allocation=sponsorCapacityCovered({
     balanceWei:evidence.balanceWei,gasPriceWei:evidence.gasPriceWei,
     minReserveWei:cap.minReserveWei,
     currentOutstandingWei:reserved.rows[0]?.amount||"0",
     currentOutstandingCount:Number(reserved.rows[0]?.count||0),
     newCommitments:fresh,
     spentTodayWei:issued.rows[0]?.amount||"0",
     dailyMaxWei:cap.dailyMaxWei
    });
    if(!allocation.funded||!allocation.withinDaily)
     throw Error("Atomic sponsor quote capacity exhausted on "+chain);
   }
   for(const g of grants){
    if(!["first-delivery","hub-onward","final-delivery"].includes(g.stage)||
       !/^[a-z][a-z0-9-]{1,39}$/.test(g.chain)||
       !/^[1-9][0-9]*$/.test(g.amountWei)||
       BigInt(g.amountWei)>BigInt(grantLimits?.[g.chain]?.maxGrantWei||"0"))
     throw Error("Invalid quote-bound sponsor grant");
    await client.query({
     text:"INSERT INTO xita_sponsor_quote_commitments "+
      "(source_chain,execution_adapter,payer,quote_nonce,grant_chain,grant_stage,promised_wei) "+
      "VALUES($1,$2,$3,$4,$5,$6,$7)",
     values:[row.source,row.adapter,row.payer,row.nonce,g.chain,g.stage,g.amountWei]
    });
   }
  }
  await client.query("COMMIT");
 }catch(e){await client.query("ROLLBACK").catch(()=>{});throw e}
 finally{client.release();await pool.end()}
}
