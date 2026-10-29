#!/usr/bin/env node
// Explicit, idempotent operator tool for *proposing* reciprocal hub routes.
// Only receipt-documented, fully deployed infrastructure is eligible.
// Never deploys, signs, or edits the catalog by itself.
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {loadCatalog,ROOT} from "./validate-manifests.mjs";
import {isDeployedChain} from "../apps/web/route-availability.js";
const argv=process.argv.slice(2);
const named=flag=>{const i=argv.indexOf(flag);return i<0?null:argv[i+1]||null};
const chain=named("--chain"),asset=named("--asset");
if(!chain||!asset||!/^[-a-z0-9]+$/.test(chain)||!/^[A-Z0-9]+$/.test(asset))
 throw Error("Usage: node tools/suggest-hub-routes.mjs --chain bsc --asset XGR");
const catalog=loadCatalog(ROOT);
if(chain==="xgrchain"||!isDeployedChain(catalog,chain))
 throw Error("Target spoke is not fully receipt-deployed");
const meta=catalog.assets[asset]?.metadata,routes=catalog.assets[asset]?.routes;
if(!meta||!routes)throw Error("Asset has no approved canonical manifest");
if(!meta.representations.some(r=>r.chain==="xgrchain"))
 throw Error("Asset has no XGR hub representation");
const existing=meta.representations.find(r=>r.chain===chain);
const synthetic={chain,representation:"synthetic",symbol:"w"+meta.symbol,assetAddress:null};
const canonical=meta.canonical?.chain===chain;
if(!existing&&canonical)throw Error("Cannot infer original collateral address");
const proposals=[];
if(!existing)proposals.push({kind:"representation",asset,chain,value:synthetic});
for(const [source,destination,name] of [["xgrchain",chain,"xgr_to_"+chain],[chain,"xgrchain",chain+"_to_xgr"]]){
 if(!routes.routes.some(r=>r.sourceChain===source&&r.destinationChain===destination))
  proposals.push({kind:"route",asset,source,destination,name});
}
console.log(JSON.stringify({chain,asset,ready:true,proposals,note:"Review these changes and commit asset.json/routes.json via a PR before Admin deployment. No wallet transaction or live activation."},null,2));
