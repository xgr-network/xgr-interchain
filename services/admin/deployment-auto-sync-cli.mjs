// Invoked ONLY by the dedicated xita-deployment-sync.service, never by HTTP.
import {resolve,join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {consumeDeploymentSync,pollVerifiedDeploymentSync,publishLiveCatalog,LIVE_CATALOG} from "./deployment-auto-sync.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../..");
const stateDir=process.env.XGR_ADMIN_STATE_DIR||join(root,"runtime-state/admin");
try{
 const result=process.argv[2]==="--publish-catalog"
  ?publishLiveCatalog(root,process.env.XITA_LIVE_CATALOG||LIVE_CATALOG)
  :process.argv[2]==="--poll"
   ?pollVerifiedDeploymentSync(stateDir,root)
   :consumeDeploymentSync(stateDir,root);
 console.log("XITA deployment checkout sync: "+JSON.stringify(result));
}catch(error){
 console.error("XITA deployment checkout NOT synchronized: "+String(error.message||error));
 process.exitCode=1;
}
