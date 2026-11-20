// Operator-only export; generated from receipt-backed catalog facts.
// The node receives contract identifiers, NEVER provider URLs or signing keys.
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {escrowDescriptor} from "../services/indexer/tvl-verifier.mjs";

const ROOT=resolve(fileURLToPath(new URL("..",import.meta.url)));
export function indexedEscrowWatchlist(catalog){
 const watches=[];
 for(const asset of Object.keys(catalog?.assets||{}).sort()){
  const d=escrowDescriptor(catalog,asset);
  if(d.status!=="ready"||!d.coingeckoId||d.chainConfig.chainId===1643)continue;
  if(d.kind!=="erc20"||!/^[A-Z0-9_]{1,32}$/.test(asset)||
     !/^0x[0-9a-f]{40}$/.test(d.router)||
     !/^0x[0-9a-f]{40}$/.test(d.token||""))
   throw Error("Unsupported or ambiguous foreign escrow watch: "+asset);
  watches.push({asset,chain:d.chain,kind:d.kind,router:d.router,token:d.token});
 }
 if(watches.length>24)throw Error("Indexer escrow watch budget exceeded");
 return {version:1,watches};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const catalog=JSON.parse(readFileSync(resolve(ROOT,"apps/web/catalog.json"),"utf8"));
 process.stdout.write(JSON.stringify(indexedEscrowWatchlist(catalog),null,2)+"\n");
}
