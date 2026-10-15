// PR-time review of newly proposed XITA token manifests against live CoinGecko.
// No GitHub token, contact email or private application files are needed.
import {execFileSync} from "node:child_process";
import {readFileSync,existsSync} from "node:fs";
import {resolve,dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {verifyCoinGecko} from "../services/onboarding/coingecko-identity.mjs";
const root=resolve(fileURLToPath(new URL("../",import.meta.url)));
const EMAIL=/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
export function proposedJoinFiles(changes){
 const folders=new Set();
 for(const line of changes.split("\n")){
  const path=line.trim();
  const match=/^config\/assets\/[0-9a-f]{2}\/[A-Z][A-Z0-9]{1,11}\/asset\.json$/.exec(path);
  if(match)folders.add(dirname(path));
 }
 return [...folders];
}
export async function validateJoinChanges(paths,{read=(p)=>JSON.parse(readFileSync(join(root,p),"utf8")),check=verifyCoinGecko}={}){
 const candidates=proposedJoinFiles(paths);
 const verified=[];
 for(const folder of candidates){
  const asset=read(folder+"/asset.json"),profile=read(folder+"/metadata.json"),routes=read(folder+"/routes.json");
  if(asset?.kind!=="asset-config"||profile?.kind!=="xeta-token-profile"||
    routes?.kind!=="asset-routes"||asset.symbol!==profile.asset||asset.symbol!==routes.asset)
    throw Error("Inconsistent XITA onboarding manifests: "+folder);
  if(!asset.canonical?.chain||!asset.canonical?.tokenAddress||profile.market?.priceSource!=="coingecko")
    throw Error("CoinGecko original-chain contract is required: "+folder);
  for(const [path,data] of [["asset.json",asset],["metadata.json",profile],["routes.json",routes]]){
    if(EMAIL.test(JSON.stringify(data))||/contactEmail|privateEmail|applicantEmail/.test(JSON.stringify(data)))
      throw Error("Applicant email or contact identifiers must not be in public manifests: "+folder+"/"+path);
  }
  const proof=await check({coingeckoId:profile.market.coingeckoId,
    canonicalChain:asset.canonical.chain,canonicalAddress:asset.canonical.tokenAddress,
    symbol:asset.symbol,decimals:asset.decimals});
  verified.push({symbol:asset.symbol,proof});
 }
 return verified;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const idx=process.argv.indexOf("--base");
 const base=idx>=0?process.argv[idx+1]:"";
 if(!/^[0-9a-f]{40}$/.test(base||"")){console.error("Pass --base <40-hex SHA>");process.exit(2);}
 try{
  const changed=execFileSync("git",["diff","--name-only",base+"...HEAD","--","config/assets"],{cwd:root,encoding:"utf8"});
  const results=await validateJoinChanges(changed);
  console.log("CoinGecko-verified new token manifests: "+results.length);
 }catch(e){console.error("XITA Join PR validation failed: "+e.message);process.exitCode=1;}
}
