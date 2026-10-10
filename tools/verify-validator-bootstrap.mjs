#!/usr/bin/env node
// Read-only verification of PUBLIC bootstrap-proof JSON, no key-file access.
// Usage: xgrchain ... bootstrap-proof --json > /tmp/validator-public.json
//        node tools/verify-validator-bootstrap.mjs <chain> /tmp/validator-public.json
import {readFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {verifyPublicBootstrapOnChain} from "../services/admin/bls-bootstrap-proof.mjs";
const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const [name,file]=process.argv.slice(2);
if(!name||!file||!/^[a-z][a-z0-9-]*$/.test(name)){
 console.error("Usage: node tools/verify-validator-bootstrap.mjs <configured-chain> <public-proof-json>");
 process.exit(2);
}
function load(relative){return JSON.parse(readFileSync(join(root,relative),"utf8"))}
try{
 const chain=load("config/chains/"+name+".json");
 const bootstrap=load("config/bootstrap/"+name+".json");
 const validators=load("config/validators/initial.json").validators;
 const rawText=readFileSync(resolve(file),"utf8");
 let proof;
 if(rawText.trimStart().startsWith("{")){
  const raw=JSON.parse(rawText);proof=raw.result||raw;
 }else{
  const fields=Object.fromEntries(rawText.split(/\r?\n/).filter(x=>x.includes("|")).map(line=>{
   const index=line.indexOf("|");return [line.slice(0,index).trim(),line.slice(index+1).trim()];
  }));
  proof={
   validator:fields["Validator"],originChainId:Number(fields["Origin chain ID"]),
   destinationDomain:Number(fields["Destination domain"]),
   blsPublicKey:fields["BLS public key"],
   blsPublicKeyEIP2537:fields["BLS public key EIP-2537"],
   payload:fields["Payload"],possessionProof:fields["Possession proof EIP-2537"]
  };
 }
 const result=await verifyPublicBootstrapOnChain(proof,{chain,bootstrap,approvedValidators:validators});
 console.log(JSON.stringify(result,null,2));
 if(!result.verified)process.exitCode=1;
}catch(e){console.error("Bootstrap verification FAILED: "+String(e.message||e));process.exitCode=1}
