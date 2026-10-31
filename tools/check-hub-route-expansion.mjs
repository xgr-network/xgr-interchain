#!/usr/bin/env node
// CI must never accept a fully documented spoke without the corresponding
// desired hub asset graph in GitHub main. This is a read-only check.
import {loadCatalog} from "./validate-manifests.mjs";
import {deriveMissingHubRoutes} from "./auto-hub-routes.mjs";
const gaps=deriveMissingHubRoutes(loadCatalog());
if(gaps.size){
 for(const [asset,result] of gaps){
  const pending=result.routes.routes.filter(x=>!loadCatalog().assets[asset].routes.routes.some(r=>
   r.sourceChain===x.sourceChain&&r.destinationChain===x.destinationChain));
  console.error("Missing automatic hub route configuration: "+asset+" "+pending.map(x=>x.name).join(", "));
 }
 process.exitCode=1;
}else console.log("PASS: every receipt-deployed spoke has canonical asset representations and reciprocal routes");
