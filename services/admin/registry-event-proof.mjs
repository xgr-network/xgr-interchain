import {keccak256} from "../../apps/web/keccak.mjs";

// The authoritative origin of the one-time Registry is a Factory-emitted
// RegistryDeployed event, not the top-level destination of a wallet batch.
const ADDR=/^0x[0-9a-f]{40}$/i;
const HASH=/^0x[0-9a-f]{64}$/i;
const same=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const topicAddress=a=>"0x"+"0".repeat(24)+a.slice(2).toLowerCase();
export function verifyFactoryRegistryReceipt({factory,registry,txHash,event,receipt}){
 if(!ADDR.test(factory||"")||!ADDR.test(registry||"")||
    !HASH.test(txHash||"")||!event||!receipt)
  throw Error("Missing source Registry creation provenance");
 if(!same(event.transactionHash,txHash)||!same(receipt.transactionHash,txHash)||
    !ADDR.test(receipt.from||""))
  throw Error("Source Registry creation transaction identity mismatch");
 if(BigInt(receipt.status??"0x0")!==1n)
  throw Error("Source Registry creation transaction was not successful");
 if(!HASH.test(receipt.blockHash||"")||
    !same(event.blockHash,receipt.blockHash)||
    receipt.blockNumber==null||event.blockNumber==null||
    BigInt(event.blockNumber)!==BigInt(receipt.blockNumber))
  throw Error("Source Registry creation not in canonical receipt block");
 const signature=keccak256("RegistryDeployed(address)");
 const expected=topicAddress(registry);
 const eventMatch=log=>log?.removed!==true&&
  same(log.address,factory)&&same(log.transactionHash,txHash)&&
  same(log.blockHash,receipt.blockHash)&&
  Array.isArray(log.topics)&&log.topics.length===2&&
  same(log.topics[0],signature)&&same(log.topics[1],expected);
 if(!eventMatch(event)||!Array.isArray(receipt.logs)||
    !receipt.logs.some(eventMatch))
  throw Error("Source Registry creation event not emitted by documented Factory");
 // A canonical successful receipt contains the actual Factory event and
 // deployer; an archived full transaction is not necessary. Smart-account
 // executors may forward the factory call using an outer
 // transaction addressed to a different contract. The authenticated
 // Factory event and receipt prove execution without guessing envelope ABI.
 return {deployer:receipt.from,txHash:txHash.toLowerCase()};
}
