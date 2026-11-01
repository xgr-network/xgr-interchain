// CI gate for changes to existing public XITA profile metadata.
// Safeguards against changing chain contracts, permissions, routing or supply
// disguised as a simple profile-refresh PR.
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {fetchCoinDetails,profileUpdateFromCoin} from "../services/onboarding/coingecko-profile.mjs";
const root=resolve(fileURLToPath(new URL("../",import.meta.url)));
const profilePath=/^config\/assets\/[0-9a-f]{2}\/([A-Z][A-Z0-9]{1,11})\/metadata\.json$/;
function equal(a,b){return JSON.stringify(a)===JSON.stringify(b)}
export async function verifyUpdatedProfiles({before,after,changedPaths,loadCoin=fetchCoinDetails}){
 const assetsChanged=changedPaths.filter(p=>p.startsWith("config/assets/"));
 const existing=assetsChanged.filter(p=>{
  const m=profilePath.exec(p);return m&&Boolean(before.assets?.[m[1]]);
 });
 if(!existing.length)return [];
 if(assetsChanged.some(p=>!profilePath.test(p)||!before.assets?.[profilePath.exec(p)[1]]))
  throw Error("A profile-only PR cannot modify token contracts, routes or deployment manifests");
 if(changedPaths.filter(p=>p.startsWith("apps/web/")).some(p=>p!=="apps/web/catalog.json"))
  throw Error("Profile-only proposal has unrelated web changes");
 const symbols=[...new Set(existing.map(p=>profilePath.exec(p)[1]))];
 const expected=structuredClone(before);
 for(const symbol of symbols){
  const source=before.assets[symbol].profile.market?.coingeckoId||
   after.assets?.[symbol]?.profile?.market?.coingeckoId;
  const live=await loadCoin(source);
  const candidate=profileUpdateFromCoin({symbol,coingeckoId:source},live,expected);
  const profile=JSON.parse(Object.entries(candidate.files).find(([p])=>p.endsWith("/metadata.json"))[1]);
  if(!equal(after.assets?.[symbol]?.profile,profile))
   throw Error("Profile fields differ from verified CoinGecko import: "+symbol);
  expected.assets[symbol].profile=profile;
 }
 if(!equal(after,{schemaVersion:1,...expected}))
  throw Error("Catalog has unrelated or non-profile modifications");
 return symbols;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const idx=process.argv.indexOf("--base"),base=idx>=0?process.argv[idx+1]:"";
 if(!/^[a-f0-9]{40}$/.test(base||"")){console.error("Expected --base <SHA>");process.exit(2);}
 try{
  const old=JSON.parse(execFileSync("git",["show",base+":apps/web/catalog.json"],{cwd:root,encoding:"utf8",timeout:10000}));
  const current=JSON.parse(readFileSync(resolve(root,"apps/web/catalog.json"),"utf8"));
  const changedPaths=execFileSync("git",["diff","--name-only","--diff-filter=M",base+"...HEAD"],{cwd:root,encoding:"utf8",timeout:10000}).trim().split("\n").filter(Boolean);
  const symbols=await verifyUpdatedProfiles({before:old,after:current,changedPaths});
  console.log("Verified CoinGecko profile updates: "+symbols.join(", "));
 }catch(error){console.error("XITA profile update rejected:",error.message);process.exitCode=1;}
}
