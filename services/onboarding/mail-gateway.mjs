// XITA transactional email. Reuse the existing Zoho SMTP credentials on the host.
// All secrets stay in the service environment; application email never enters GitHub.
import {createHash} from "node:crypto";

const EMAIL=/^[^\s@<>\r\n]{1,64}@[^\s@<>\r\n]{1,189}\.[^\s@<>\r\n]{2,}$/;
function httpMailConfigured(env){
 try{
  const url=new URL(env.XITA_JOIN_MAIL_API_URL||"");
  return url.protocol==="https:"&&!url.username&&!url.password&&
    Boolean(env.XITA_JOIN_MAIL_API_TOKEN)&&EMAIL.test(env.XITA_JOIN_MAIL_FROM||"");
 }catch{return false;}
}
export function smtpSettings(env=process.env){
 const host=String(env.SMTP_HOST||"").trim(),port=Number(env.SMTP_PORT||465);
 const user=String(env.SMTP_USER||""),pass=String(env.SMTP_PASS||"");
 const from=String(env.SMTP_FROM||env.SMTP_USER||"");
 if(!/^[a-z0-9][a-z0-9.-]{1,252}$/i.test(host)||!EMAIL.test(user)||!EMAIL.test(from)||
   !pass||(![465,587].includes(port)))return null;
 return {
  host,port,secure:port===465,requireTLS:port===587,
  auth:{user,pass},tls:{rejectUnauthorized:true,minVersion:"TLSv1.2",servername:host},
  connectionTimeout:12000,greetingTimeout:12000,socketTimeout:18000,
  disableFileAccess:true,disableUrlAccess:true
 };
}
export function mailConfigured(env=process.env){
 return Boolean(smtpSettings(env))||httpMailConfigured(env);
}
export async function sendMail({to,subject,text,idempotencyKey},{env=process.env,fetcher=fetch,createTransport}={}){
 if(!EMAIL.test(String(to||""))||String(to).length>254)throw Error("Invalid mail recipient");
 if(typeof subject!=="string"||subject.length>180||/[\r\n\x00-\x1f]/.test(subject))throw Error("Invalid email subject");
 if(typeof text!=="string"||text.length>10000)throw Error("Invalid email body");
 const deliveryKey=String(idempotencyKey||"xita-notification");
 if(!/^[a-z0-9:-]{1,130}$/i.test(deliveryKey))throw Error("Invalid delivery identifier");
 const smtp=smtpSettings(env);
 if(smtp){
  // Deliberately load the production-only dependency only for actual SMTP sends.
  const transport=createTransport||((await import("nodemailer")).default.createTransport);
  const client=transport(smtp);
  try{
   const messageId="<"+createHash("sha256").update(deliveryKey).digest("hex")+"@xita.xgr.network>";
   const result=await client.sendMail({
    from:String(env.SMTP_FROM||env.SMTP_USER),to,subject,text,messageId,
    headers:{"X-XITA-Notification":"application-status"},attachments:[]
   });
   if(!Array.isArray(result?.accepted)||!result.accepted.some(a=>String(a).toLowerCase()===to.toLowerCase()))
    throw Error("SMTP server did not accept the recipient");
   return true;
  }finally{client.close?.();}
 }
 if(!httpMailConfigured(env))throw Error("No configured transactional email transport");
 const response=await fetcher(env.XITA_JOIN_MAIL_API_URL,{
   method:"POST",redirect:"error",signal:AbortSignal.timeout(12000),
   headers:{"Authorization":"Bearer "+env.XITA_JOIN_MAIL_API_TOKEN,"Content-Type":"application/json",
    "Idempotency-Key":deliveryKey,"Cache-Control":"no-store"},
   body:JSON.stringify({from:env.XITA_JOIN_MAIL_FROM,to,subject,text})
 });
 if(!response.ok)throw Error("Transactional mail delivery failed ("+response.status+")");
 return true;
}
