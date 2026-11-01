// All creator deployment evidence is read-only and rechecked from canonical
// XGRChain Mainnet; browser submissions and private worker claims are not proof.
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {Interface,keccak256} from "ethers";
import {creatorSettings} from "../../apps/web/creator-token-config.js";
const root=resolve(fileURLToPath(new URL("../../",import.meta.url)));
const ADDRESS=/^0x[0-9a-f]{40}$/i,HASH=/^0x[0-9a-f]{64}$/i;
const FACTORY_ABI=[
 "function createTokenConfigured(string name_,string symbol_,uint256 initialSupplyBaseUnits,address owner_,uint8 type_,uint8 decimals_,uint256 lifetimeCapBaseUnits,bool permitEnabled_,address minter_) returns(address)",
 "event TokenCreated(address indexed deployer,address indexed token,address indexed owner,string name,string symbol,uint256 initialSupply)",
 "event TokenConfigured(address indexed token,uint8 indexed tokenType,uint8 decimals,uint256 lifetimeCap,bool permitEnabled,address minter,bytes32 runtimeCodeHash)"
];
const TOKEN_ABI=["function owner() view returns(address)","function totalSupply() view returns(uint256)",
 "function balanceOf(address) view returns(uint256)","function name() view returns(string)",
 "function symbol() view returns(string)","function decimals() view returns(uint8)",
 "function tokenType() view returns(uint8)","function lifetimeCap() view returns(uint256)",
 "function lifetimeMinted() view returns(uint256)",
 "function permitEnabled() view returns(bool)","function minter() view returns(address)"];
export const creatorFactoryInterface=new Interface(FACTORY_ABI);
export const creatorTokenInterface=new Interface(TOKEN_ABI);
const same=(a,b)=>typeof a==="string"&&typeof b==="string"&&a.toLowerCase()===b.toLowerCase();
export function loadReviewedCreatorFactory(repo=root){
 const path=resolve(repo,"config/creator/factory.json");
 const f=JSON.parse(readFileSync(path,"utf8"));
 if(f.schemaVersion!==1||f.kind!=="xita-creator-factory-v1"||f.chainId!==1643||
  !ADDRESS.test(f.address||"")||!HASH.test(f.runtimeCodeKeccak256||"")||
  !HASH.test(f.deploymentTxHash||"")||
  f.status!=="receipt-verified")throw Error("Unapproved or missing creator factory receipt");
 return f;
}
export async function creatorRPC(url,method,params){
 if(!/^https:\/\/[^\s/@]+/.test(url||""))throw Error("Invalid XGR RPC address");
 const response=await fetch(url,{method:"POST",
  headers:{"Content-Type":"application/json"},
  signal:AbortSignal.timeout(12000),body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});
 if(!response.ok)throw Error("XGR Mainnet RPC unavailable");
 const data=await response.json();
 if(data.error||data.result===undefined||data.result===null)
  throw Error("XGR RPC method returned no verified result: "+method);
 return data.result;
}
function eqBytes(actual,expected){return same(actual,expected)}
async function checkToken(rpc,address,signature,args,expected,blockTag){
 const data=creatorTokenInterface.encodeFunctionData(signature,args);
 const result=await rpc("eth_call",[{to:address,data},blockTag]);
 const parsed=creatorTokenInterface.decodeFunctionResult(signature,result)[0];
 if(typeof parsed==="boolean"||typeof expected==="boolean"){
  if(parsed!==expected)throw Error("Created token permit mismatch");
 }else if(typeof parsed==="bigint"||typeof expected==="bigint"){
  if(BigInt(parsed)!==BigInt(expected))throw Error("Created token supply/decimals mismatch: "+signature);
 }else if(typeof parsed!=="string"||!eqBytes(parsed,expected))
  throw Error("Created token identity/owner mismatch: "+signature);
}
export async function verifyCreatorReceiptOnRPC({rpc,input,txHash,factory,confirmations=1}){
 if(typeof rpc!=="function"||!HASH.test(txHash||"")||!factory||!input)
  throw Error("Creator proof input missing");
 if(BigInt(await rpc("eth_chainId",[]))!==1643n)throw Error("Creator RPC chain mismatch");
 const [factoryCode,receipt,tx,head]=await Promise.all([
  rpc("eth_getCode",[factory.address,"latest"]),
  rpc("eth_getTransactionReceipt",[txHash]),
  rpc("eth_getTransactionByHash",[txHash]),
  rpc("eth_blockNumber",[])
 ]);
 if(factoryCode==="0x"||!same(keccak256(factoryCode),factory.runtimeCodeKeccak256))
  throw Error("Unreviewed creator factory code");
 if(!receipt||BigInt(receipt.status||0)!==1n||!same(receipt.to,factory.address)||
    !same(tx?.to,factory.address)||!same(tx?.hash,txHash)||
    !same(receipt.transactionHash,txHash)||!same(tx?.from,receipt.from)||
    !receipt.blockHash||!same(tx?.blockHash,receipt.blockHash))
  throw Error("Creator transaction receipt not verified");
 const block=Number(BigInt(receipt.blockNumber||0));
 if(!Number.isSafeInteger(block)||block<=0||BigInt(head)<BigInt(block)+BigInt(confirmations))
  throw Error("Creator transaction still awaiting XGR confirmation");
 const cfg=creatorSettings(input);
 const invoked=creatorFactoryInterface.parseTransaction({data:tx.input||tx.data,value:tx.value});
 if(invoked?.name!=="createTokenConfigured"||invoked.args.length!==9||
    invoked.args[0]!==input.name||invoked.args[1]!==input.symbol||
    invoked.args[2]!==BigInt(cfg.initialSupplyBaseUnits)||
    !same(invoked.args[3],cfg.ownerAddress)||
    Number(invoked.args[4])!==cfg.tokenTypeId||
    Number(invoked.args[5])!==cfg.decimals||
    invoked.args[6]!==BigInt(cfg.maxSupplyBaseUnits)||
    invoked.args[7]!==cfg.permit||!same(invoked.args[8],cfg.minterAddress))
  throw Error("Creator transaction parameters differ from verified application");
 const matches=[],configured=[];
 for(const log of receipt.logs||[]){
  if(!same(log.address,factory.address))continue;
  try{
   const item=creatorFactoryInterface.parseLog(log);
   if(item?.name==="TokenCreated")matches.push(item);
   if(item?.name==="TokenConfigured")configured.push(item);
  }catch{/* other factory events cannot prove creation */}
 }
 if(matches.length!==1||configured.length!==1)throw Error("Expected one canonical TokenCreated and TokenConfigured event");
 const e=matches[0],token=String(e.args.token||"");
 if(!ADDRESS.test(token)||/^0x0{40}$/i.test(token)||
    !same(e.args.deployer,receipt.from)||!same(e.args.owner,input.ownerAddress)||
    e.args.name!==input.name||e.args.symbol!==input.symbol||
    e.args.initialSupply!==BigInt(cfg.initialSupplyBaseUnits))
  throw Error("Creator event does not match signed request");
 const setup=configured[0];
 if(!same(setup.args.token,token)||Number(setup.args.tokenType)!==cfg.tokenTypeId||
    Number(setup.args.decimals)!==cfg.decimals||
    setup.args.lifetimeCap!==BigInt(cfg.maxSupplyBaseUnits)||
    setup.args.permitEnabled!==cfg.permit||
    !same(setup.args.minter,cfg.minterAddress))
  throw Error("Created token configuration event mismatch");
 const code=await rpc("eth_getCode",[token,"latest"]);
 // EIP712 includes token-specific immutable data; one globally pinned
 // token codehash cannot represent all names and deployed addresses.
 // Factory code itself is pinned; each TokenConfigured event pins its child.
 if(code==="0x"||!same(keccak256(code),setup.args.runtimeCodeHash))
  throw Error("Created ERC20 runtime differs from audited token template");
 const deployedAt="0x"+block.toString(16);
 // Snapshot at creation: project owners may legitimately transfer tokens later.
 await Promise.all([
  checkToken(rpc,token,"owner",[],cfg.ownerAddress,deployedAt),
  checkToken(rpc,token,"name",[],input.name,deployedAt),
  checkToken(rpc,token,"symbol",[],input.symbol,deployedAt),
  checkToken(rpc,token,"decimals",[],BigInt(cfg.decimals),deployedAt),
  checkToken(rpc,token,"tokenType",[],BigInt(cfg.tokenTypeId),deployedAt),
  checkToken(rpc,token,"lifetimeCap",[],BigInt(cfg.maxSupplyBaseUnits),deployedAt),
  checkToken(rpc,token,"lifetimeMinted",[],BigInt(cfg.initialSupplyBaseUnits),deployedAt),
  checkToken(rpc,token,"permitEnabled",[],cfg.permit,deployedAt),
  checkToken(rpc,token,"minter",[],cfg.minterAddress,deployedAt),
  checkToken(rpc,token,"totalSupply",[],BigInt(cfg.initialSupplyBaseUnits),deployedAt),
  checkToken(rpc,token,"balanceOf",[cfg.ownerAddress],BigInt(cfg.initialSupplyBaseUnits),deployedAt),
  checkToken(rpc,token,"balanceOf",[factory.address],0n,deployedAt)
 ]);
 return {chainId:1643,txHash:txHash.toLowerCase(),factory:factory.address.toLowerCase(),
   operator:String(receipt.from).toLowerCase(),ownerAddress:String(input.ownerAddress).toLowerCase(),
   tokenAddress:token.toLowerCase(),name:input.name,symbol:input.symbol,
   initialSupplyBaseUnits:cfg.initialSupplyBaseUnits,tokenType:cfg.tokenTypeId,
   decimals:cfg.decimals,maxSupplyBaseUnits:cfg.maxSupplyBaseUnits,
   permit:cfg.permit,minterAddress:cfg.minterAddress,blockNumber:block,
   factoryCodeHash:factory.runtimeCodeKeccak256,tokenCodeHash:keccak256(code)};
}
export async function verifyCreatorAcrossRPCs({input,txHash,factory,urls,call=creatorRPC}){
 if(!Array.isArray(urls)||urls.length<2||new Set(urls).size!==urls.length)
  throw Error("Two distinct XGR RPC views required");
 const verified=await Promise.all(urls.slice(0,2).map(url=>
  verifyCreatorReceiptOnRPC({input,txHash,factory,rpc:(method,params)=>call(url,method,params)})));
 if(JSON.stringify(verified[0])!==JSON.stringify(verified[1]))
  throw Error("Conflicting XGR RPC views on creator deployment");
 return verified[0];
}
export const CREATOR_VERIFY_RPC_URLS=["https://rpc1.xgr.network","https://rpc2.xgr.network"];
