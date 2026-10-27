import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {verifyAuditArchive} from "./verify-audit-archive.mjs";
test("audit archive is never complete without verified real PDF and ZIP",()=>{
 const base=mkdtempSync(join(tmpdir(),"xita-audit-"));
 const root=join(base,"2026-10-27-xita-direct-bls-final-v3.0.0");
 mkdirSync(join(root,"evidence"),{recursive:true});
 try{
  const files=["report.md","report.pdf","phase-a-findings.md","findings.csv",
   "prior-findings-matrix.md","verification.md","remediation.md",
   "evidence/README.md","evidence-public.zip"];
  const artifacts=files.map(name=>{
   const data=name==="report.pdf"?Buffer.from("%PDF-1.7\n%%EOF"):
    name==="evidence-public.zip"?Buffer.from("PK"):Buffer.from("test data");
   writeFileSync(join(root,name),data);
   return {path:name,bytes:data.length,
    sha256:createHash("sha256").update(data).digest("hex")};
  });
  const manifest={status:"complete",source:{
   interchain:{commit:"a".repeat(40)},node:{commit:"b".repeat(40)}},
   artifacts};
  writeFileSync(join(root,"archive-manifest.json"),JSON.stringify(manifest));
  assert.throws(()=>verifyAuditArchive(root),/invalid or trivial PDF/);
  const validPdf=Buffer.concat([Buffer.from("%PDF-1.7\n"),
   Buffer.alloc(1100,32),Buffer.from("\n%%EOF")]);
  writeFileSync(join(root,"report.pdf"),validPdf);
  artifacts[1].bytes=validPdf.length;
  artifacts[1].sha256=createHash("sha256").update(validPdf).digest("hex");
  writeFileSync(join(root,"archive-manifest.json"),JSON.stringify(manifest));
  assert.throws(()=>verifyAuditArchive(root),/invalid or empty ZIP/);
  writeFileSync(join(root,"evidence-public.zip"),Buffer.concat([
   Buffer.from("PK\x03\x04"),Buffer.alloc(80),Buffer.from("PK\x05\x06")]));
  assert.throws(()=>verifyAuditArchive(root),/digest or length mismatch/);
 }finally{rmSync(base,{recursive:true,force:true})}
});
