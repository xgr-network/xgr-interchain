// Operator-only SMTP acceptance test. No public HTTP route and no credentials in output.
import {randomUUID} from "node:crypto";
import {sendMail,mailConfigured} from "./mail-gateway.mjs";
const recipient=process.argv[2]||"";
const EMAIL=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
if(!EMAIL.test(recipient)||recipient.length>254){
 console.error("Usage: node services/onboarding/mail-smoke.mjs recipient@example.org");
 process.exitCode=2;
}else if(!mailConfigured()){
 console.error("Join SMTP is not configured in the restricted service environment");
 process.exitCode=1;
}else{
 try{
  await sendMail({
   to:recipient,
   subject:"XITA Join - SMTP delivery acceptance test",
   text:"This is an operator-requested transactional email test for XITA Join.\n"+
    "No token application or GitHub pull request was created.\n"+
    "If you received this message, the configured XITA mail transport is working.",
   idempotencyKey:"smtp-smoke-"+randomUUID()
  });
  console.log("SMTP accepted the test message for "+recipient+
   ". Check the recipient inbox to confirm delivery.");
 }catch(error){
  console.error("XITA Join SMTP test failed: "+String(error.message||error).slice(0,160));
  process.exitCode=1;
 }
}
