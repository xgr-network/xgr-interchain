// Read-only XGR node receipt-backed TVL evidence adapter. All FOREIGN-chain
// calls are answered from the already persisted Node index, never by a
// provider request in xgr-interchain. Native XGR reads use the SAME XGR node
// locally committed chain; the reconciliation logic is not duplicated here.
import {escrowDescriptor} from "./tvl-verifier.mjs";
import {selector} from "../../apps/web/keccak.js";

const ADDRESS=/^0x[0-9a-f]{40}$/i;
const WORD=/^0x[0-9a-f]{64}$/i;
const TKN=selector("token()");
const DEC=selector("decimals()");
const BAL=selector("balanceOf(address)");
const PENDING=selector("totalPendingNativeXGR()");
const lower=x=>String(x||"").toLowerCase();
const hex=n=>"0x"+BigInt(n).toString(16);
const balSlot=router=>BAL+router.slice(2).toLowerCase().padStart(64,"0");

export async function createNodeIndexedEscrowReader({catalog,rpc,now=Date.now()}={}){
 if(typeof rpc!=="function"||!Number.isFinite(now))
  throw Error("Missing XGR node index reader");
 const index=new Map(),native=new Set();
 for(const [asset] of Object.entries(catalog?.assets||{})){
  const d=escrowDescriptor(catalog,asset);
  if(d.status!=="ready"||!d.coingeckoId)continue;
  if(d.chainConfig.chainId===1643){native.add(d.chainConfig.chainId);continue;}
  if(d.kind!=="erc20"||!ADDRESS.test(d.router)||!ADDRESS.test(d.token||""))
   throw Error("Unsupported foreign escrow "+asset);
  const snap=await rpc("xgr_getILNIndexedEscrow",[asset]);
  if(snap?.version!==1||snap.asset!==asset||snap.chain!==d.chain||
    Number(snap.chainId)!==d.chainConfig.chainId||
    lower(snap.router)!==d.router||lower(snap.token)!==d.token||
    snap.kind!=="erc20"||!WORD.test(snap.routerToken||"")||
    !WORD.test(snap.tokenDecimals||"")||!WORD.test(snap.tokenBalance||"")||
    typeof snap.routerCode!=="string"||!/^0x(?:[a-f0-9]{2})+$/i.test(snap.routerCode)||
    typeof snap.tokenCode!=="string"||!/^0x(?:[a-f0-9]{2})+$/i.test(snap.tokenCode)||
    snap.evidenceStatus!=="FINALIZED_ESCROW_READ_MODEL_NOT_BLS_EVIDENCE"||
    !Number.isSafeInteger(snap.finalizedHeadBlock)||snap.finalizedHeadBlock<1||
    !/^0x[0-9a-f]{64}$/i.test(snap.finalizedHeadHash||"")||
    !Number.isFinite(Date.parse(snap.observedAt))||
    Math.abs(now-Date.parse(snap.observedAt))>120000)
   throw Error("Node escrow evidence incomplete or stale for "+asset);
  const chain=String(d.chainConfig.chainId);
  if(!index.has(chain))index.set(chain,[]);
  index.get(chain).push({d,snap});
 }
 return async(chainConfig,method,params=[])=>{
  const chain=Number(chainConfig?.chainId);
  if(!Number.isSafeInteger(chain))throw Error("Invalid indexed read chain");
  if(native.has(chain)){
   // Only XGR's own native committed chain is allowed to use direct eth_*.
   if(!["eth_chainId","eth_blockNumber","eth_getCode","eth_getBalance","eth_call"].includes(method))
    throw Error("Unsupported local XGR state read");
   return rpc(method,params);
  }
  const watches=index.get(String(chain));
  if(!watches?.length)throw Error("No finalized Node escrow evidence for chain");
  if(method==="eth_chainId")return hex(chain);
  if(method==="eth_blockNumber")
   return hex(Math.min(...watches.map(w=>w.snap.finalizedHeadBlock)));
  const address=method==="eth_getCode"?params[0]:
   method==="eth_call"?params[0]?.to:null;
  if(!ADDRESS.test(address||""))throw Error("Escrow index address invalid");
  for(const {d,snap} of watches){
   const to=lower(address);
   if(method==="eth_getCode"){
    if(to===d.router)return snap.routerCode;
    if(to===d.token)return snap.tokenCode;
   }
   if(method==="eth_call"){
    const data=lower(params[0]?.data);
    if(to===d.router&&data===lower(TKN))return snap.routerToken;
    if(to===d.token&&data===lower(DEC))return snap.tokenDecimals;
    if(to===d.token&&data===lower(balSlot(d.router)))return snap.tokenBalance;
   }
  }
  throw Error("No indexed foreign escrow evidence for requested read");
 };
}
