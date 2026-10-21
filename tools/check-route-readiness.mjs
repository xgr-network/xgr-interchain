#!/usr/bin/env node
// Operator's LIVE read-only route audit. Never submits source or destination TXs.
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {deployedRoutes} from "../apps/web/route-availability.js";
import {createRouteReadClient,inspectRouteReadiness} from "../services/indexer/route-readiness.mjs";
const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
export function selectRoutes(catalog,argv){
 if(argv.length%2)throw Error("Use --asset SYMBOL --source CHAIN --destination CHAIN");
 const filters={};
 for(let i=0;i<argv.length;i+=2){
  const field=argv[i];
  if(!["--asset","--source","--destination"].includes(field)||
    typeof argv[i+1]!=="string"||!/^[a-z0-9_-]{1,48}$/i.test(argv[i+1])||
    filters[field])throw Error("Invalid route readiness selector");
  filters[field]=argv[i+1];
 }
 const routes=deployedRoutes(catalog).filter(r=>
  (!filters["--asset"]||r.asset===filters["--asset"])&&
  (!filters["--source"]||r.source===filters["--source"])&&
  (!filters["--destination"]||r.destination===filters["--destination"]));
 if(!routes.length)throw Error("No deployed routes match the requested selector");
 return routes;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const catalog=JSON.parse(readFileSync(resolve(root,"apps/web/catalog.json"),"utf8"));
  const candidates=selectRoutes(catalog,process.argv.slice(2));
  const read=createRouteReadClient(catalog);
  const reports=[];
  for(const route of candidates)reports.push(await inspectRouteReadiness({
   catalog,asset:route.asset,source:route.source,destination:route.destination,rpc:read
  }));
  const ready=reports.filter(x=>x.status==="ready-read-only").length;
  console.log(JSON.stringify({kind:"xita-mainnet-route-readiness-v1",
   readOnly:true,ready,total:reports.length,reports},null,2));
  if(ready!==reports.length)process.exitCode=1;
 }catch(e){console.error("XITA_ROUTE_AUDIT_FAILED:",
  String(e?.message||e).slice(0,220));process.exitCode=1;}
}
