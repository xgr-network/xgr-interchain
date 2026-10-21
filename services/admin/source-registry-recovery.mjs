// Resume a factory-deployed SourceRegistry from immutable on-chain evidence.
// The Factory deployRegistry() is permissionless and idempotent. The first
// successful caller may differ from the admin's stale MetaMask journal wallet.
// Do not rebroadcast: verify Factory.registry(), its unique creation event,
// the canonical receipt, committed runtime and constructor bindings instead.
import {selector,keccak256} from "../../apps/web/keccak.mjs";
import {verifyRuntimeTemplate} from "./trusted-artifacts.mjs";
import {verifyChainBindings} from "./chain-reconcile.mjs";
import {verifyDeploymentReceipt} from "./deployment-ledger.mjs";
import {verifyFactoryRegistryReceipt} from "./registry-event-proof.mjs";

const ADDRESS=/^0x[0-9a-f]{40}$/i,TX=/^0x[0-9a-f]{64}$/i,WORD=/^0x[0-9a-f]{64}$/i;
const same=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const validAddress=x=>ADDRESS.test(x||"")&&!/^0x0{40}$/i.test(x);
function word(v){
 if(!WORD.test(v||""))throw Error("Invalid on-chain Factory.registry() response");
 return BigInt(v);
}

export async function verifyExistingSourceRegistry({
 root,chain,infrastructure,bootstrap,artifact,sourceCommit,
 factoryDeploymentBlock,rpc
}){
 if(!chain?.name||!Number.isSafeInteger(chain.chainId)||
    !Number.isSafeInteger(factoryDeploymentBlock)||factoryDeploymentBlock<1||
    typeof rpc!=="function"||artifact?.component!=="sourceRegistry"||
    !/^[a-f0-9]{40}$/i.test(sourceCommit||""))
  throw Error("Invalid approved SourceRegistry recovery context");
 const factory=infrastructure?.components?.find(c=>c.key==="factory"&&
  c.status==="documented")?.address;
 const url=chain.rpcUrls?.[0];
 if(!validAddress(factory)||!/^https:\/\//.test(url||""))
  throw Error("Approved and documented Factory required for SourceRegistry recovery");
 // A zero registry means no contract was deployed yet; caller may continue
 // with the normal MetaMask-confirmed deploy flow.
 const response=await rpc(url,"eth_call",[{to:factory,data:selector("registry()")},"latest"]);
 const registryWord=word(response);
 if(registryWord===0n)return null;
 if(registryWord>=1n<<160n)
  throw Error("Factory.registry() response contains an invalid address");
 const registry="0x"+registryWord.toString(16).padStart(40,"0");
 const topic=keccak256("RegistryDeployed(address)");
 const registryTopic="0x"+"0".repeat(24)+registry.slice(2);
 const head=BigInt(await rpc(url,"eth_blockNumber",[]));
 if(head<BigInt(factoryDeploymentBlock))
  throw Error("Factory deployment height is greater than chain head");
 const matches=[];
 // Scoped to documented Factory creation height, not a chainwide archive.
 // Keep log ranges small to support public Arbitrum RPC providers.
 for(let start=BigInt(factoryDeploymentBlock);start<=head;start+=1500n){
  const end=start+1499n>head?head:start+1499n;
  const logs=await rpc(url,"eth_getLogs",[{
   address:factory,fromBlock:"0x"+start.toString(16),toBlock:"0x"+end.toString(16),
   topics:[topic,registryTopic]
  }]);
  if(!Array.isArray(logs))throw Error("Invalid Factory registry event RPC result");
  for(const log of logs){
   if(log?.removed===true||!same(log.address,factory)||
      !Array.isArray(log.topics)||log.topics.length!==2||
      !same(log.topics[0],topic)||!same(log.topics[1],registryTopic)||
      !TX.test(log.transactionHash||"")||!TX.test(log.blockHash||""))
    continue;
   matches.push(log);
   if(matches.length>1)throw Error("More than one canonical RegistryDeployed event");
  }
 }
 if(matches.length!==1)
  throw Error("Factory.registry() is set but no unique RegistryDeployed event was found");
 const event=matches[0],txHash=event.transactionHash.toLowerCase();
 const receipt=await rpc(url,"eth_getTransactionReceipt",[txHash]);
 verifyFactoryRegistryReceipt({factory,registry,txHash,event,receipt});
 // The independent receipt verifier checks this RPC's chain ID, original
 // canonical block, Factory event and the Registry runtime fingerprint.
 // Historical eth_getTransactionByHash is not required by this proof.
 // The caller of a permissionless Factory need not be the wallet in an old
 // failed journal. Attribute the immutable receipt to its ACTUAL tx sender.
 // Creation is proved by the canonical receipt and Factory event; runtime
 // is verified at latest to avoid requiring any historical chain state.
 const runtime=await rpc(url,"eth_getCode",[registry,"latest"]);
 const runtimeKeccak=verifyRuntimeTemplate(artifact,runtime);
 await verifyChainBindings({rpc,url,component:"sourceRegistry",address:registry,
  chain,bootstrap,infra:infrastructure});
 const input={sourceCommit,chain:chain.name,component:"sourceRegistry",
  contractAddress:registry,txHash,expectedRuntimeKeccak256:runtimeKeccak,
  expectedDeployer:receipt.from,provenance:{kind:"factory-registry",factory}};
 // Independent canonical block, confirmations, receipt, Factory event and
 // bytecode checks must all pass BEFORE a GitHub deployment write.
 const verified=await verifyDeploymentReceipt(root,input,{rpc});
 return {input,verified,address:registry,txHash,deployer:receipt.from};
}
