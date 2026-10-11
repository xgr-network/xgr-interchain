// Read-only recovery of an already published, confirmed wallet deployment.
// No git pull/fetch/write: the Admin service runs with a read-only repository.
import {currentMainCommit} from "./main-gate.mjs";
import {deploymentReceiptPath} from "./deployment-ledger.mjs";
import {rpcCall} from "./inspector.mjs";
import {keccak256} from "../../apps/web/keccak.mjs";

const H32=/^0x[0-9a-f]{64}$/i, SHA=/^[0-9a-f]{40}$/i, ADDR=/^0x[0-9a-f]{40}$/i;
const equal=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
function amount(x){
 if(typeof x!=="string"||!/^0x[0-9a-f]+$/i.test(x))throw Error("Invalid chain recovery quantity");
 return BigInt(x);
}
async function readDocument(base,path,commit,fetcher,headers){
 const response=await fetcher(base+"/contents/"+path+"?ref="+commit,{
  headers,cache:"no-store",signal:AbortSignal.timeout(8000)
 });
 if(response.status===404)return null;
 if(!response.ok)throw Error("GitHub deployment recovery HTTP "+response.status);
 const result=await response.json();
 if(result?.type!=="file"||result.encoding!=="base64"||typeof result.content!=="string")
  throw Error("Invalid remote GitHub deployment document");
 try{return JSON.parse(Buffer.from(result.content.replace(/\s/g,""),"base64").toString("utf8"))}
 catch{throw Error("Invalid GitHub deployment JSON")}
}
export async function recoverPublishedReceipt({
 entry,chain,component,asset=null,fetcher=fetch,
 token=process.env.XITA_GITHUB_TOKEN,repo="xgr-network/xgr-interchain",rpc=rpcCall
}){
 if(entry?.stage!=="confirmed")return null;
 const proof=entry.verifiedProof;
 if(!H32.test(entry.txHash||"")||!ADDR.test(proof?.contractAddress||"")||
    !H32.test(proof?.runtimeKeccak||"")||!SHA.test(entry.sourceCommit||"")||
    !ADDR.test(entry.wallet||"")||!chain||entry.chainId!==chain.chainId)
  throw Error("Confirmed wallet intent lacks deployment proof");
 const address=proof.contractAddress.toLowerCase();
 const receiptPath=deploymentReceiptPath({
  kind:"xita-v315-deployment-receipt",chain:chain.name,
  transactionHash:entry.txHash.toLowerCase(),address
 });
 const commit=await currentMainCommit({fetcher,token,repo});
 const api="https://api.github.com/repos/"+repo;
 const headers={"Accept":"application/vnd.github+json",
  "X-GitHub-Api-Version":"2022-11-28"};
 if(token)headers.Authorization="Bearer "+token;
 const receipt=await readDocument(api,receiptPath,commit,fetcher,headers);
 if(!receipt)return null;
 if(receipt.kind!=="xita-v315-deployment-receipt"||
    receipt.status!=="onchain-deployment-verified"||receipt.network!=="mainnet"||
    receipt.approval?.ref!=="main"||
    !equal(receipt.approval.sourceCommit,entry.sourceCommit)||
    !equal(receipt.transactionHash,entry.txHash)||
    !equal(receipt.address,address)||
    !equal(receipt.runtimeCodeKeccak256,proof.runtimeKeccak)||
    !equal(receipt.deployer,entry.wallet)||
    receipt.chain!==chain.name||receipt.chainId!==chain.chainId||
    receipt.domainId!==chain.domainId||receipt.component!==component||
    receipt.asset!==(asset||null))
  throw Error("GitHub receipt does not match confirmed wallet transaction");
 const indexPath=asset?
  "deployments/mainnet/assets/"+asset+".json":
  "deployments/mainnet/infrastructure/"+chain.name+".json";
 const index=await readDocument(api,indexPath,commit,fetcher,headers);
 if(!index)throw Error("Published receipt lacks canonical deployment index");
 if(asset){
  if(index.asset!==asset||!Array.isArray(index.receiptPaths)||
     !index.receiptPaths.includes(receiptPath))
   throw Error("Published receipt missing from asset deployment index");
 }else{
  const part=index.xitaV315?.components?.[component];
  if(index.chain!==chain.name||!Array.isArray(index.xitaV315?.receiptPaths)||
     !index.xitaV315.receiptPaths.includes(receiptPath)||
     part?.receiptPath!==receiptPath||!equal(part?.address,address)||
     !equal(part?.runtimeCodeKeccak256,receipt.runtimeCodeKeccak256))
   throw Error("Published receipt missing from chain deployment index");
 }
 const rpcUrl=chain.rpcUrls?.[0];
 if(typeof rpcUrl!=="string"||!rpcUrl.startsWith("https://"))
  throw Error("Missing authorized chain RPC");
 const [remoteChain,txReceipt,head]=await Promise.all([
  rpc(rpcUrl,"eth_chainId",[]),
  rpc(rpcUrl,"eth_getTransactionReceipt",[entry.txHash]),
  rpc(rpcUrl,"eth_blockNumber",[])
 ]);
 if(amount(remoteChain)!==BigInt(chain.chainId)||!txReceipt||
    amount(txReceipt.status)!==1n||
    !equal(txReceipt.transactionHash,entry.txHash)||
    !equal(txReceipt.from,entry.wallet)||
    !equal(txReceipt.blockHash,receipt.blockHash)||
    amount(txReceipt.blockNumber)!==BigInt(receipt.blockNumber))
  throw Error("Published deployment is not canonical on chain");
 if(amount(head)-amount(txReceipt.blockNumber)+1n<BigInt(chain.confirmations||1))
  throw Error("Deployment lost required confirmations");
 const blockTag="0x"+BigInt(receipt.blockNumber).toString(16);
 const [block,code]=await Promise.all([
  rpc(rpcUrl,"eth_getBlockByNumber",[blockTag,false]),
  rpc(rpcUrl,"eth_getCode",[address,blockTag])
 ]);
 if(!block||!equal(block.hash,receipt.blockHash)||
    amount(block.number)!==BigInt(receipt.blockNumber)||
    typeof code!=="string"||!/^0x(?:[0-9a-f]{2})+$/i.test(code)||
    !equal(keccak256(Uint8Array.from(Buffer.from(code.slice(2),"hex"))),receipt.runtimeCodeKeccak256))
  throw Error("Published deployment bytecode does not match canonical block");
 if(receipt.provenance?.kind==="create"&&
    (!equal(txReceipt.contractAddress,address)||txReceipt.to!==null))
  throw Error("Original contract creation provenance mismatch");
 if(receipt.provenance?.factory&&!equal(txReceipt.to,receipt.provenance.factory))
  throw Error("Original factory receipt provenance mismatch");
 return {commit,receiptPath,address,txHash:entry.txHash};
}
