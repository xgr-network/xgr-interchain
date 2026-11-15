import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {keccak256} from 'ethers';
const output={observedAt:new Date().toISOString(),nodes:[],receipts:[],health:[],release:{}};
async function rpc(url,method,params=[]){
  if(!['web3_clientVersion','eth_chainId','eth_blockNumber','eth_getTransactionReceipt','eth_getCode','eth_getBlockByNumber'].includes(method))throw Error('Non-read RPC forbidden');
  const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(10000),body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
  if(!r.ok)throw Error('HTTP '+r.status);
  const x=await r.json();if(x.error||x.result===undefined||x.result===null)throw Error(JSON.stringify(x.error||'missing result'));return x.result;
}
for(const url of ['https://rpc1.xgr.network','https://rpc2.xgr.network']){
  const row={url};
  for(const method of ['web3_clientVersion','eth_chainId','eth_blockNumber']){try{row[method]=await rpc(url,method)}catch(e){row[method]={unavailable:String(e.message).slice(0,150)}}}
  output.nodes.push(row);
}
const jobs=[];
for(const chain of readdirSync('deployments/receipts')){
  let cfg;try{cfg=JSON.parse(readFileSync('config/chains/'+chain+'/chain.json','utf8'))}catch{continue}
  for(const name of readdirSync('deployments/receipts/'+chain).filter(x=>x.endsWith('.json'))){
    const path=join('deployments/receipts',chain,name),v=JSON.parse(readFileSync(path,'utf8'));
    if(!v.address||!v.transactionHash||!v.runtimeCodeKeccak256)continue;
    for(const url of cfg.rpcUrls.slice(0,2))jobs.push({v,url,path});
  }
}
let cursor=0;
await Promise.all(Array.from({length:4},async()=>{while(cursor<jobs.length){const {v,url,path}=jobs[cursor++];const row={chain:v.chain,component:v.component,address:v.address,url,path,expectedRuntimeHash:v.runtimeCodeKeccak256};try{
  const [chain,code,receipt,block]=await Promise.all([rpc(url,'eth_chainId'),rpc(url,'eth_getCode',[v.address,'latest']),rpc(url,'eth_getTransactionReceipt',[v.transactionHash]),rpc(url,'eth_getBlockByNumber',['0x'+BigInt(v.blockNumber).toString(16),false])]);
  row.runtimeHash=keccak256(code);row.chainId=Number(BigInt(chain));row.receiptStatus=receipt.status;row.blockHash=block.hash;row.receiptBlockHash=receipt.blockHash;
  row.status=row.chainId===v.chainId&&row.runtimeHash.toLowerCase()===v.runtimeCodeKeccak256.toLowerCase()&&BigInt(receipt.status)===1n&&receipt.transactionHash.toLowerCase()===v.transactionHash.toLowerCase()&&receipt.blockHash.toLowerCase()===v.blockHash.toLowerCase()&&block.hash.toLowerCase()===v.blockHash.toLowerCase()?'verified':'mismatch';
}catch(e){row.status='unavailable';row.error=String(e.message).slice(0,180)}output.receipts.push(row)}}));
for(const path of ['/api/xita/v1/managed/health','/api/xita/join/status','/api/xeta/v1/transfer/health']){const row={path};try{const r=await fetch('https://xita.xgr.network'+path,{signal:AbortSignal.timeout(10000)});row.httpStatus=r.status;row.body=(await r.text()).slice(0,12000)}catch(e){row.error=String(e.message)}output.health.push(row)}
try{
  const base='https://github.com/xgr-network/xgr-node/releases/download/v3.5.1/';
  for(const n of ['commit.txt','version.txt','toolchain.txt','sha256sums.txt']){const r=await fetch(base+n,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(n+' HTTP '+r.status);output.release[n]=await r.text()}
  const r=await fetch(base+'xgrchain-v3.5.1-linux-amd64',{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('binary HTTP '+r.status);
  const hash=createHash('sha256');let bytes=0;for await(const b of r.body){hash.update(b);bytes+=b.length}output.release.binarySha256=hash.digest('hex');output.release.binaryBytes=bytes;output.release.matchesManifest=output.release['sha256sums.txt'].includes(output.release.binarySha256+'  xgrchain-v3.5.1-linux-amd64');
}catch(e){output.release.error=String(e.message)}
output.completedAt=new Date().toISOString();
writeFileSync('audit-evidence/read-only-production.json',JSON.stringify(output,null,2));
console.log(JSON.stringify({nodes:output.nodes,receipts:output.receipts.reduce((a,x)=>(a[x.status]=(a[x.status]||0)+1,a),{}),health:output.health.map(x=>({path:x.path,status:x.httpStatus,error:x.error})),release:output.release},null,2));
