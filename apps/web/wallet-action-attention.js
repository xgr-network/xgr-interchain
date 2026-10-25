// A read-only, wallet-scoped view of *which* unfinished transfers could
// require a MetaMask confirmation. Never authorizes signing on its own.
// The actual transfer path revalidates chain state, route, nonce and gas.
import {walletJourneys} from "./verified-journey.js";
import {nextVerifiedWalletStep} from "./automatic-transfer-step.js";
import {sponsorAllowsContinuation} from "./transfer-sponsor-evidence.js";

const ADDR=/^0x[0-9a-f]{40}$/i;
const HASH=/^0x[0-9a-f]{64}$/i;
const PAID=/^[0-9]+$/;

export function walletSigningQueue({account,items=[],sponsorship=null,now=Date.now()}={}){
 if(!ADDR.test(account||"")||!Array.isArray(items))return [];
 const result=[];
 for(const record of walletJourneys(items)){
  if(record?.account?.toLowerCase()!==account.toLowerCase()||
     record.confirmed!==true||!HASH.test(record.txHash||""))continue;
  const step=nextVerifiedWalletStep(record,{now});
  if(!step)continue;
  // The initial paid transfer must finish all quote-locked grants before TX2.
  // TX3 and TX4 NEVER reopen the TX1 sponsorship barrier.
  if(step.kind==="first-delivery"&&record.executionAdapter&&
     PAID.test(String(record.interchainFeeWei??""))&&BigInt(record.interchainFeeWei)>0n){
   const key=record.sourceChain+":"+record.messageId.toLowerCase()+":"+account.toLowerCase();
   if(sponsorship?.key!==key||!sponsorAllowsContinuation({
      ok:true,status:sponsorship.status,upfrontRequired:sponsorship.upfrontRequired
    }))continue;
  }
  result.push({sourceTxHash:record.txHash.toLowerCase(),asset:record.asset,
   step:step.kind,destination:record.finalDestinationChain||record.destinationChain});
 }
 return result;
}

export function walletSigningNotice(queue=[]){
 if(!Array.isArray(queue)||queue.length===0)return null;
 if(queue.length>1)return {label:queue.length+" wallet confirmations needed",
  href:"/my-transfers",title:"Open My Transfers to select the wallet-owned transaction"};
 const step=queue[0];
 const number=step.step==="first-delivery"?"TX2":
  step.step==="onward-source"?"TX3":"TX4";
 return {label:number+" · Wallet confirmation needed",
  href:"/transfer?token="+encodeURIComponent(step.asset||"XGR")+
   "&resume="+encodeURIComponent(step.sourceTxHash),
  title:"Open the transfer status and keep it open for the MetaMask confirmation"};
}
