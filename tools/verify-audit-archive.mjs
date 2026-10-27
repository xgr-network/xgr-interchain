#!/usr/bin/env node
// Fail-closed validation of a completed, public-safe, versioned audit archive.
// Usage: node tools/verify-audit-archive.mjs audits/YYYY-MM-DD-xita-direct-bls-final-v3.0.0
import {readFileSync,statSync} from "node:fs";
import {resolve,relative,basename,join} from "node:path";
import {createHash} from "node:crypto";
const required=[
 "report.md","report.pdf","phase-a-findings.md","findings.csv",
 "prior-findings-matrix.md","verification.md","remediation.md",
 "evidence/README.md","evidence-public.zip"
];
const fail=m=>{throw Error("Audit archive incomplete: "+m)};
export function verifyAuditArchive(dir,{fsRead=readFileSync,fsStat=statSync}={}){
 const root=resolve(dir);
 if(!/^\d{4}-\d{2}-\d{2}-xita-direct-bls-final-v\d+\.\d+\.\d+$/.test(basename(root)))
  fail("unversioned audit directory");
 const manifestPath=join(root,"archive-manifest.json");
 const manifest=JSON.parse(fsRead(manifestPath,"utf8"));
 if(manifest.status!=="complete"||!manifest.source?.interchain?.commit||
    !manifest.source?.node?.commit||!Array.isArray(manifest.artifacts))
  fail("missing complete status, audited SHAs or artifact records");
 if(!/^[0-9a-f]{40}$/i.test(manifest.source.interchain.commit)||
    !/^[0-9a-f]{40}$/i.test(manifest.source.node.commit))fail("invalid audit source SHA");
 const byPath=new Map;
 for(const entry of manifest.artifacts){
  if(!entry||typeof entry.path!=="string"||
     entry.path.startsWith("/")||entry.path.split("/").some(x=>x===".."||x==="."||x==="")||
     !/^[a-f0-9]{64}$/i.test(entry.sha256)||!Number.isSafeInteger(entry.bytes)||
     entry.bytes<1||byPath.has(entry.path))fail("invalid artifact manifest entry");
  byPath.set(entry.path,entry);
 }
 for(const name of required){
  const entry=byPath.get(name);
  if(!entry)fail("missing manifest entry "+name);
  const file=resolve(root,name);
  if(relative(root,file).startsWith(".."))fail("unsafe artifact path");
  if(!fsStat(file).isFile())fail("not a file: "+name);
  const bytes=fsRead(file);
  if(bytes.length!==entry.bytes||
     createHash("sha256").update(bytes).digest("hex")!==entry.sha256.toLowerCase())
   fail("digest or length mismatch: "+name);
  if(name==="report.pdf"&&(!bytes.subarray(0,5).equals(Buffer.from("%PDF-"))||
      bytes.length<1024||!bytes.includes(Buffer.from("%%EOF"))))
   fail("invalid or trivial PDF");
  if(name==="evidence-public.zip"&&
    (bytes.length<64||bytes[0]!==0x50||bytes[1]!==0x4b||
     !bytes.includes(Buffer.from([0x50,0x4b,0x05,0x06]))))
   fail("invalid or empty ZIP");
 }
 return {ok:true,artifactCount:required.length,dir:root};
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){
 try{const d=process.argv[2];if(!d)fail("directory argument required");
  console.log(JSON.stringify(verifyAuditArchive(d)));
 }catch(e){console.error(e.message);process.exitCode=1}
}
