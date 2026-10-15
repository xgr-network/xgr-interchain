// A server-side transactional mail gateway. No SMTP credentials or email address in browser.
export function mailConfigured(env=process.env){
  try{
    const u=new URL(env.XITA_JOIN_MAIL_API_URL||"");
    return u.protocol==="https:"&&u.username===""&&u.password===""&&
      Boolean(env.XITA_JOIN_MAIL_API_TOKEN)&&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.XITA_JOIN_MAIL_FROM||"");
  }catch{return false;}
}
export async function sendMail({to,subject,text,idempotencyKey},{env=process.env,fetcher=fetch}={}){
  if(!mailConfigured(env))throw Error("Transactional mail gateway is not configured");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)||String(to).length>254)throw Error("Invalid contact");
  if(typeof text!=="string"||text.length>10000)throw Error("Invalid mail body");
  const response=await fetcher(env.XITA_JOIN_MAIL_API_URL,{
    method:"POST",redirect:"error",signal:AbortSignal.timeout(12000),
    headers:{"Authorization":"Bearer "+env.XITA_JOIN_MAIL_API_TOKEN,"Content-Type":"application/json",
      "Idempotency-Key":idempotencyKey||"xita-notification","Cache-Control":"no-store"},
    body:JSON.stringify({from:env.XITA_JOIN_MAIL_FROM,to,subject,text})
  });
  if(!response.ok)throw Error("Transactional mail delivery failed ("+response.status+")");
  return true;
}
