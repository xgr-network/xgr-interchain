// Presentation-only elapsed time for the current token action.
// First observation is stored locally so a modal refresh/reopen doesn't reset
// the clock. This is NOT a chain timestamp, a deadline, or finality evidence.
// No RPC, wallet operation, or signing decision uses this timer.
const ADDR=/^0x[0-9a-f]{40}$/i,HASH=/^0x[0-9a-f]{64}$/i;
const MAX_AGE=72*60*60*1000;
const memory=new Map();
export function formatTransferStepElapsed(elapsedMs){
 const seconds=Math.floor(Math.max(0,Number(elapsedMs)||0)/1000);
 const pad=value=>String(value).padStart(2,"0");
 const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;
 return h?String(h)+":"+pad(m)+":"+pad(s):pad(m)+":"+pad(s);
}
export function transferStepStartedAt({account,sourceTxHash,step,now=Date.now(),storage=null}={}){
 if(!ADDR.test(account||"")||!HASH.test(sourceTxHash||"")||
   !Number.isSafeInteger(step)||step<0||step>3||!Number.isFinite(now))return null;
 const key="xita-transfer-step-timer-v1:"+account.toLowerCase()+":"+sourceTxHash.toLowerCase();
 let cached=memory.get(key)||null;
 if(!cached){
  try{cached=JSON.parse(storage?.getItem(key)||"null")}catch{cached=null}
 }
 const valid=cached?.step===step&&Number.isFinite(cached.startedAt)&&
  cached.startedAt<=now+30000&&now-cached.startedAt>=0&&now-cached.startedAt<MAX_AGE;
 const state=valid?cached:{step,startedAt:now};
 memory.set(key,state);
 if(!valid){try{storage?.setItem(key,JSON.stringify(state))}catch{/* Optional storage denied. */}}
 return state.startedAt;
}
