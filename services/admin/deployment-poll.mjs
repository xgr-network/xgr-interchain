// Browser-only bounded polling for the SAME already-broadcast wallet tx.
// Pending is never an error, and never initiates a new EIP-1193 request.
export async function awaitDeploymentReceipt(check,{
 attempts=18,intervalMs=2500,onPending=()=>{},
 sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
}={}){
 if(typeof check!=="function"||!Number.isSafeInteger(attempts)||attempts<1||attempts>60)
  throw Error("Invalid pending receipt polling configuration");
 for(let attempt=0;attempt<attempts;attempt++){
  const reply=await check();
  const result=reply?.result;
  if(!result||typeof result.stage!=="string")throw Error("Invalid reconcile API response");
  if(result.stage!=="pending")return reply;
  onPending(result,attempt+1);
  if(attempt<attempts-1)await sleep(intervalMs);
 }
 return {result:{stage:"pending",reason:"wait-timeout"}};
}
