import {FetchRequest,JsonRpcProvider} from "ethers";
import {rpcCandidates} from "../indexer/transfer-index.mjs";

function providerFor(url,chainId){
 const request=new FetchRequest(url);
 request.timeout=3000;
 request.retryFunc=async()=>false;
 return new JsonRpcProvider(request,chainId);
}

function isTransportFailure(error){
 const status=Number.parseInt(error?.info?.responseStatus,10);
 const code=error?.code;
 return [401,403,404,408,429].includes(status)||status>=500||
  ["QUOTE_GAS_UNAVAILABLE","TIMEOUT","ECONNREFUSED","ECONNRESET","ETIMEDOUT","EAI_AGAIN","ENETUNREACH","ENOTFOUND","EPIPE"].includes(code)||
  (code==="NETWORK_ERROR"&&error.event!=="changed")||
  error?.error?.code===-32005;
}

export function createQuoteRpcReader({makeProvider=providerFor,now=Date.now}={}){
 const networks=new Map();
 return async function readChain(name,catalog,read){
  const chain=catalog.chains[name];
  if(!Number.isSafeInteger(chain?.chainId)||chain.chainId<1)throw Error("Unsupported chain");
  const urls=rpcCandidates(chain,{baseUrls:""});
  let network=networks.get(name);
  if(!network||network.chainId!==chain.chainId||network.urls.join(",")!==urls.join(",")){
   for(const previous of network?.providers.values()||[])previous.provider.destroy();
   network={chainId:chain.chainId,urls,providers:new Map()};
   networks.set(name,network);
  }
  for(const url of urls){
   let active=network.providers.get(url);
   if(active?.retryAt>now())continue;
   if(!active){
    active={provider:makeProvider(url,chain.chainId),retryAt:0};
    network.providers.set(url,active);
   }
   try{
    const identity=await active.provider.getNetwork();
    if(identity.chainId!==BigInt(chain.chainId))throw Error("Chain RPC identity mismatch");
    return await read(active.provider);
   }catch(error){
    if(!isTransportFailure(error))throw error;
    active.retryAt=now()+30000;
   }
  }
  throw Error("Network RPC temporarily unavailable for "+(chain.displayName||name));
 };
}
