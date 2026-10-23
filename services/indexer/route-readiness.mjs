// READ-ONLY, asset/chain-agnostic operational route audit. No keys or TXs.
// A passing audit verifies current on-chain route configuration, but DOES NOT
// claim that an as-yet-unsent Hyperlane message has obtained validator quorum.
import {Interface,keccak256,zeroPadValue} from "ethers";
import {deployedRoutes,executableTransferRoutes} from "../../apps/web/route-availability.js";
import {publicRead} from "../../apps/web/wallet-transfers.js";

const ADDRESS=/^0x[0-9a-f]{40}$/i,HASH=/^0x[0-9a-f]{64}$/i;
const eq=(a,b)=>String(a??"").toLowerCase()===String(b??"").toLowerCase();
const requireTrue=(yes,detail)=>{if(!yes)throw Error(detail)};
const GATEWAY=new Interface([
 "function ilnRegistry() view returns (address)",
 "function warpRouter() view returns (address)",
 "function warpToken() view returns (address)",
 "function routeId() view returns (bytes32)",
 "function destinationDomain() view returns (uint32)",
 "function feeVault() view returns (address)",
 "function mailbox() view returns (address)",
 "function dispatchHook() view returns (address)",
 "function destinationRouter() view returns (address)",
 "function quoteILN(uint32,bytes32,uint256) view returns (uint256,uint256,uint256,uint256)"
]);
const REGISTRY=new Interface([
 "function getRoute(uint32,bytes32) view returns (uint64,uint32,address,address,address,address,address,uint256,bool)",
 "function assetRoute(uint32,bytes32) view returns (bytes32,uint64,address,address)",
 "function sourceChainId() view returns (uint64)",
 "function sourceDomain() view returns (uint32)"
]);
const ROUTER=new Interface([
 "function token() view returns (address)",
 "function xetaRouteIdForDomain(uint32) view returns (bytes32)",
 "function verifyInboundRoute(uint64,uint32,address,bytes32) view returns (bool)"
]);
const VAULT=new Interface([
 "function gateway() view returns (address)",
 "function routeId() view returns (bytes32)",
 "function destinationDomain() view returns (uint32)",
 "function validatorRegistry() view returns (address)",
 "function recipientCount() view returns (uint256)",
 "function recipientSetId() view returns (uint64)"
]);
const ISM=new Interface([
 "function registry() view returns (address)",
 "function destinationDomain() view returns (uint32)"
]);
const VALIDATOR=new Interface(["function setId() view returns (uint64)"]);
const ADAPTER=new Interface(["function sourceRegistry() view returns (address)",
 "function serviceWallet() view returns (address)"]);
const ERC20=new Interface(["function decimals() view returns (uint8)"]);
const ZERO="0x"+"0".repeat(40);

export function createRouteReadClient(catalog,{fetcher=globalThis.fetch}={}){
 const preferred=new Map(),verified=new Set();
 return async function rpc(chain,method,params){
  const config=catalog?.chains?.[chain];
  if(!Number.isSafeInteger(config?.chainId)||!Array.isArray(config.rpcUrls)||
     config.rpcUrls.length<1||config.rpcUrls.length>8)
   throw Error("Invalid catalog chain configuration: "+chain);
  const urls=[preferred.get(chain),...config.rpcUrls].filter((u,i,a)=>u&&a.indexOf(u)===i);
  let last;
  for(const url of urls){
   try{
    if(!verified.has(chain+"|"+url)){
     const id=await publicRead(url,"eth_chainId",[],fetcher,{viaProxy:false});
     requireTrue(/^0x[0-9a-f]+$/i.test(id||"")&&
      BigInt(id)===BigInt(config.chainId),"RPC chain ID mismatch: "+chain);
     verified.add(chain+"|"+url);
    }
    const result=method==="eth_chainId"?
      "0x"+BigInt(config.chainId).toString(16):
      await publicRead(url,method,params,fetcher,{viaProxy:false});
    preferred.set(chain,url);
    return result;
   }catch(e){last=e;verified.delete(chain+"|"+url)}
  }
  throw Error("All approved latest-state RPCs failed for "+chain+": "+
   String(last?.message||"unavailable").slice(0,100));
 };
}

export function resolveRouteAudit(catalog,{asset,source,destination}){
 const candidates=deployedRoutes(catalog).filter(r=>r.asset===asset&&
  r.source===source&&r.destination===destination);
 const reverse=deployedRoutes(catalog).filter(r=>r.asset===asset&&
  r.source===destination&&r.destination===source);
 requireTrue(candidates.length===1&&reverse.length===1,
  "No unique bidirectional receipt-backed asset route");
 const route=candidates[0],back=reverse[0];
 const paid=executableTransferRoutes(catalog).some(r=>r.asset===asset&&
  r.source===source&&r.destination===destination&&eq(r.routeId,route.routeId));
 requireTrue(paid,"Source and destination ExecutionGateway receipts are incomplete");
 const entry=catalog.assets[asset],src=catalog.chains[source],dst=catalog.chains[destination];
 const srcCore=catalog.infrastructure[source].xitaV315.components,
  dstCore=catalog.infrastructure[destination].xitaV315.components;
 const representations=entry.deployment.representations;
 const sourceRecord=representations.filter(r=>r.chain===source);
 const destinationRecord=representations.filter(r=>r.chain===destination);
 const srcDep=entry.deployment.routeDeployments.filter(r=>
  r.sourceChain===source&&r.destinationChain===destination&&r.routeName===route.name);
 const dstDep=entry.deployment.routeDeployments.filter(r=>
  r.sourceChain===destination&&r.destinationChain===source&&r.routeName===back.name);
 requireTrue(sourceRecord.length===1&&destinationRecord.length===1&&
  srcDep.length===1&&dstDep.length===1,"Conflicting route representations");
 const decimals=entry.metadata?.decimals;
 requireTrue(Number.isSafeInteger(decimals)&&decimals>=0&&decimals<=36,
  "Invalid original token decimals");
 return {route,reverse:back,src,dst,srcCore,dstCore,
  sourceRecord:sourceRecord[0],destinationRecord:destinationRecord[0],
  sourceGatewayRecord:srcDep[0].components.gateway,
  sourceVaultRecord:srcDep[0].components.feeVault,
  reverseGatewayRecord:dstDep[0].components.gateway,
  reverseVaultRecord:dstDep[0].components.feeVault,
  decimals};
}

// Safe latest-state checks are intentionally independent of any wallet balance,
// allowance or existing transfer history. There are no historical-state reads.
export async function inspectRouteReadiness({catalog,asset,source,destination,
 rpc=createRouteReadClient(catalog)}){
 const report={schemaVersion:1,asset,source,destination,
  kind:"xita-route-readiness-read-only-v1",status:"blocked",stage:"catalog",
  checks:[],limitations:[
   "No token balance, approval, or real source-lock transaction was tested",
   "No BLS quorum proof or destination Mailbox.process delivery was produced",
   "Non-standard ERC20 transfer behavior requires a separate fork/live holder test"
  ]};
 const checked=(stage,condition,message)=>{
  report.stage=stage;requireTrue(condition,message);report.checks.push(stage);
 };
 try{
  const a=resolveRouteAudit(catalog,{asset,source,destination});
  const {route,reverse,src,dst,srcCore,dstCore,sourceRecord,destinationRecord,
   sourceGatewayRecord,sourceVaultRecord,reverseGatewayRecord,reverseVaultRecord,
   decimals}=a;
  checked("catalog-bidirectional",true,"");
  for(const [name,chain] of [[source,src],[destination,dst]]){
   const actual=await rpc(name,"eth_chainId",[]);
   checked("chain-identity-"+name,/^0x[0-9a-f]+$/i.test(actual||"")&&
    BigInt(actual)===BigInt(chain.chainId),"Wrong chain ID for "+name);
  }
  async function codeHash(chain,item,label){
   checked("receipt-"+label,ADDRESS.test(item?.address||"")&&
    HASH.test(item?.runtimeCodeKeccak256||""),"Missing receipt-backed "+label);
   const code=await rpc(chain,"eth_getCode",[item.address,"latest"]);
   checked("runtime-"+label,/^0x(?:[0-9a-f]{2})+$/i.test(code||"")&&
    eq(keccak256(code),item.runtimeCodeKeccak256),
    "Contract runtime does not match receipt: "+label);
  }
  for(const [chain,contract,label] of [
   [source,srcCore.sourceRegistry,"source-registry"],
   [source,srcCore.mailbox,"source-mailbox"],
   [source,srcCore.dispatchHook,"source-hook"],
   [source,srcCore.executionGateway,"source-execution-gateway"],
   [source,sourceGatewayRecord,"source-gateway"],
   [source,sourceVaultRecord,"source-vault"],
   [source,sourceRecord,"source-router"],
   [destination,dstCore.sourceRegistry,"destination-registry"],
   [destination,dstCore.validatorRegistry,"destination-validator-registry"],
   [destination,dstCore.mailbox,"destination-mailbox"],
   [destination,dstCore.ism,"destination-ism"],
   [destination,dstCore.executionGateway,"destination-execution-gateway"],
   [destination,reverseGatewayRecord,"reverse-gateway"],
   [destination,reverseVaultRecord,"reverse-vault"],
   [destination,destinationRecord,"destination-router"]
  ])await codeHash(chain,contract,label);
  const call=async(chain,address,abi,method,args=[])=>{
   const input=abi.encodeFunctionData(method,args);
   const raw=await rpc(chain,"eth_call",[{to:address,data:input},"latest"]);
   requireTrue(/^0x(?:[0-9a-f]{2})*$/i.test(raw||""),
    "Malformed view result "+chain+" "+method);
   return abi.decodeFunctionResult(method,raw);
  };
  const sg=sourceGatewayRecord.address,sr=srcCore.sourceRegistry.address,
   fv=sourceVaultRecord.address,dr=destinationRecord.address,
   srouter=sourceRecord.address,ds=dstCore.sourceRegistry.address;
  const property=async(chain,address,abi,fn,expected,stage)=>{
   const value=(await call(chain,address,abi,fn))[0];
   checked(stage,eq(value,expected),
    "Live "+stage+" differs from documented deployment");
  };
  await property(source,sg,GATEWAY,"ilnRegistry",sr,"gateway-registry");
  await property(source,sg,GATEWAY,"warpRouter",srouter,"gateway-router");
  await property(source,sg,GATEWAY,"warpToken",route.sourceToken||ZERO,"gateway-token");
  await property(source,srouter,ROUTER,"token",route.sourceToken||ZERO,"router-underlying-token");
  await property(source,sg,GATEWAY,"routeId",route.routeId,"gateway-route-id");
  await property(source,sg,GATEWAY,"destinationDomain",dst.domainId,"gateway-domain");
  await property(source,sg,GATEWAY,"feeVault",fv,"gateway-fee-vault");
  await property(source,sg,GATEWAY,"mailbox",srcCore.mailbox.address,"gateway-mailbox");
  await property(source,sg,GATEWAY,"dispatchHook",srcCore.dispatchHook.address,"gateway-merkle-hook");
  await property(source,sg,GATEWAY,"destinationRouter",dr,"gateway-destination-router");
  await property(source,fv,VAULT,"gateway",sg,"vault-gateway");
  await property(source,fv,VAULT,"routeId",route.routeId,"vault-route-id");
  await property(source,fv,VAULT,"destinationDomain",dst.domainId,"vault-domain");
  await property(source,fv,VAULT,"validatorRegistry",srcCore.validatorRegistry.address,"vault-validator-registry");
  const recipients=(await call(source,fv,VAULT,"recipientCount"))[0],
   epoch=(await call(source,fv,VAULT,"recipientSetId"))[0];
  checked("fee-recipient-quorum",recipients>0n&&epoch>0n,
   "Source validator fee recipients or set ID unavailable");
  const sourceEnrollment=(await call(source,srouter,ROUTER,
   "xetaRouteIdForDomain",[dst.domainId]))[0];
  checked("source-router-enrollment",eq(sourceEnrollment,route.routeId),
   "Source router not enrolled on route");
  const enrolled=(await call(destination,dr,ROUTER,"xetaRouteIdForDomain",[src.domainId]))[0];
  checked("destination-router-enrollment",eq(enrolled,reverse.routeId),
   "Destination router reverse enrollment missing");
  const forwardAccepted=(await call(destination,dr,ROUTER,
   "verifyInboundRoute",[src.chainId,src.domainId,srouter,route.routeId]))[0];
  checked("destination-inbound-route",forwardAccepted===true,
   "Destination router rejects signed inbound route identity");
  const reverseAccepted=(await call(source,srouter,ROUTER,
   "verifyInboundRoute",[dst.chainId,dst.domainId,dr,reverse.routeId]))[0];
  checked("source-inbound-route",reverseAccepted===true,
   "Source router rejects reverse-route identity");
  const reg=(await call(source,sr,REGISTRY,"getRoute",[dst.domainId,route.routeId]));
  checked("canonical-source-route",BigInt(reg[0])===BigInt(src.chainId)&&
   BigInt(reg[1])===BigInt(src.domainId)&&eq(reg[2],sg)&&eq(reg[3],srouter)&&
   eq(reg[4],srcCore.mailbox.address)&&eq(reg[5],srcCore.dispatchHook.address)&&
   eq(reg[6],dr)&&reg[7]>0n&&reg[8]===true,
   "SourceRegistry route inactive or misbound");
  const provenance=(await call(source,sr,REGISTRY,"assetRoute",[dst.domainId,route.routeId]));
  checked("canonical-asset-identity",eq(provenance[0],route.assetId)&&
   BigInt(provenance[1])===BigInt(dst.chainId)&&
   eq(provenance[2],route.sourceToken||ZERO),
   "SourceRegistry asset identity or original token mismatch");
  await property(destination,dstCore.ism.address,ISM,"registry",
   dstCore.validatorRegistry.address,"destination-ism-validator-registry");
  await property(destination,dstCore.ism.address,ISM,"destinationDomain",dst.domainId,
   "destination-ism-domain");
  const destSet=(await call(destination,dstCore.validatorRegistry.address,
   VALIDATOR,"setId"))[0];
  checked("destination-validator-set",destSet>0n,
   "Destination validator set not installed");
  await property(source,srcCore.executionGateway.address,ADAPTER,"sourceRegistry",
   sr,"fee-adapter-source-registry");
  const wallet=(await call(source,srcCore.executionGateway.address,ADAPTER,"serviceWallet"))[0];
  checked("fee-adapter-service-wallet",ADDRESS.test(wallet)&&!eq(wallet,ZERO),
   "Source fee adapter service wallet unavailable");
  const unit=10n**BigInt(decimals);
  const quote=await call(source,sg,GATEWAY,"quoteILN",
   [dst.domainId,zeroPadValue(srouter,32),unit]);
  checked("source-gateway-quote",quote[0]>0n&&quote[2]===quote[0]+quote[1]&&
   quote[3]===(route.sourceToken?unit:0n)&&quote[0]===reg[7],
   "Live fee or amount quote inconsistent with canonical route");
  if(route.sourceToken){
   const actualCode=await rpc(source,"eth_getCode",[route.sourceToken,"latest"]);
   checked("underlying-token-code",/^0x(?:[0-9a-f]{2})+$/i.test(actualCode||""),
    "Missing source ERC20 token runtime");
   const actualDecimals=(await call(source,route.sourceToken,ERC20,"decimals"))[0];
   checked("original-token-decimals",BigInt(actualDecimals)===BigInt(decimals),
    "ERC20 decimals differ from declared token amount precision");
  }
  report.status="ready-read-only";report.stage="finished";
  report.validatorFeeWei=quote[0].toString();
  report.sampleAmountRaw=unit.toString();
 }catch(e){
  report.error=String(e?.message||e).slice(0,230);
 }
 return report;
}
