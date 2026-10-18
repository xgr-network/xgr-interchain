// Fee Treasury is an admin READ-ONLY view of publicly observable native coin
// balances. No private-key env, signer, arbitrary wallet input or payout method.
// Fee Gateway addresses come exclusively from catalog + GitHub receipts.
import {keccak256,selector} from "../../apps/web/keccak.mjs";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {rpcCall} from "./inspector.mjs";

const ADDRESS=/^0x[0-9a-f]{40}$/i;
const HASH=/^0x[0-9a-f]{64}$/i;
const WORD=/^0x[0-9a-f]{64}$/i;
const QTY=/^0x[0-9a-f]+$/i;
const eq=(a,b)=>String(a||"").toLowerCase()===String(b||"").toLowerCase();
const zeroAddress="0x"+"0".repeat(40);
const MIN_GAS_UNITS=1200000n;
const GAS_BUFFER_BPS=13000n; // Same 1.2m / 30% safety envelope as Transfer preflight.

function decodedWord(result,label){
 if(!WORD.test(result||""))throw Error("Invalid "+label+" contract getter response");
 return result.toLowerCase();
}
function checkedQuantity(result,label){
 if(!QTY.test(result||""))throw Error("Invalid "+label+" RPC quantity");
 return BigInt(result);
}
function checkedReceipt(root,chain,doc,{readReceipt}){
 const prefix="deployments/receipts/"+chain+"/";
 const filename=typeof doc?.receiptPath==="string"&&
  doc.receiptPath.startsWith(prefix)?doc.receiptPath.slice(prefix.length):"";
 if(!ADDRESS.test(doc?.address||"")||eq(doc.address,zeroAddress)||
  !HASH.test(doc.runtimeCodeKeccak256||"")||
  !/^[a-f0-9]{64}-[a-f0-9]{40}\.json$/.test(filename)||
  !filename.endsWith("-"+doc.address.toLowerCase().slice(2)+".json"))
  throw Error("Unverified Fee Gateway in catalog");
 const receipt=readReceipt?readReceipt(doc.receiptPath):JSON.parse(
  readFileSync(resolve(root,doc.receiptPath),"utf8"));
 if(receipt?.kind!=="xita-v315-deployment-receipt"||
  receipt?.status!=="onchain-deployment-verified"||
  receipt?.network!=="mainnet"||
  receipt?.component!=="executionGateway"||
  receipt?.chain!==chain||
  !HASH.test(receipt?.transactionHash||"")||
  !filename.startsWith(receipt.transactionHash.toLowerCase().slice(2)+"-")||
  !eq(receipt.address,doc.address)||
  !eq(receipt.runtimeCodeKeccak256,doc.runtimeCodeKeccak256))
  throw Error("Fee Gateway catalog and receipt differ");
 return receipt;
}
async function readGetter(url,rpc,address,method,label){
 const data=await rpc(url,"eth_call",[{to:address,data:selector(method)},"latest"]);
 return decodedWord(data,label);
}
function nativeSymbol(chain){return chain?.nativeCurrency?.symbol||"native";}
export async function inspectFeeTreasury({root,catalog,rpc=rpcCall,readReceipt}){
 if(!root||!catalog?.chains||!catalog?.infrastructure)
  throw Error("Fee treasury requires approved local catalog");
 const chains=await Promise.all(Object.entries(catalog.chains).map(async ([name,chain])=>{
  const base={chain:name,chainId:chain?.chainId,
   symbol:nativeSymbol(chain),decimals:chain?.nativeCurrency?.decimals??18};
  const doc=catalog.infrastructure[name]?.xitaV315?.components?.executionGateway;
  if(!doc)return {...base,status:"not-deployed"};
  try{
   if(chain?.chainId!==catalog.infrastructure[name]?.chainId||
    !Number.isSafeInteger(chain.chainId)||chain.chainId<=0||
    !Number.isInteger(base.decimals)||base.decimals<0||base.decimals>36)
    throw Error("Fee Gateway chain identity or currency invalid");
   const receipt=checkedReceipt(root,name,doc,{readReceipt});
   if(receipt.chainId!==chain.chainId)
    throw Error("Receipt chain ID mismatch");
   const url=chain.rpcUrls?.[0];
   if(typeof url!=="string"||!url.startsWith("https://"))
    throw Error("Approved chain RPC missing");
   const identity=await rpc(url,"eth_chainId",[]);
   if(checkedQuantity(identity,"chain ID")!==BigInt(chain.chainId))
    throw Error("Fee treasury RPC chain ID mismatch");
   const code=await rpc(url,"eth_getCode",[doc.address,"latest"]);
   if(!/^0x(?:[0-9a-f]{2})+$/i.test(code||"")||
    !eq(keccak256(Uint8Array.from(Buffer.from(code.slice(2),"hex"))),
      doc.runtimeCodeKeccak256))
    throw Error("Fee Gateway runtime does not match GitHub receipt");
   // All 3 on-chain fields must identify the CURRENT wallet, even after
   // an emergency rotation. The browser never supplies this wallet address.
   const [service,owner,beneficiary,claim,contractBalance]=await Promise.all([
    readGetter(url,rpc,doc.address,"serviceWallet()","service wallet"),
    readGetter(url,rpc,doc.address,"relayerOwner()","relayer owner"),
    readGetter(url,rpc,doc.address,"interchainFeeRecipient()","beneficiary"),
    readGetter(url,rpc,doc.address,"pendingInterchainFeesWei()","claimable fee"),
    rpc(url,"eth_getBalance",[doc.address,"latest"])
   ]);
   const wallet="0x"+service.slice(-40),ownerAddress="0x"+owner.slice(-40),
    payee="0x"+beneficiary.slice(-40);
   if(!ADDRESS.test(wallet)||eq(wallet,zeroAddress)||
    !eq(wallet,ownerAddress)||!eq(wallet,payee))
    throw Error("Live Fee Gateway service wallet and fee beneficiary differ");
   const pending=BigInt(claim);
   const balance=checkedQuantity(contractBalance,"contract balance");
   if(pending>balance)
    throw Error("Fee Gateway claimable fees exceed native contract backing");
   const serviceBalance=checkedQuantity(
    await rpc(url,"eth_getBalance",[wallet,"latest"]),"service wallet balance");
   let gasStatus="unavailable",minimumGasReserveWei=null,gasPriceWei=null;
   try{
    const price=checkedQuantity(await rpc(url,"eth_gasPrice",[]),"gas price");
    if(price>0n){
     gasPriceWei=price.toString();
     const budget=(price*MIN_GAS_UNITS*GAS_BUFFER_BPS+9999n)/10000n;
     minimumGasReserveWei=budget.toString();
     gasStatus=serviceBalance<budget?"low":"sufficient";
    }
   }catch{/* Gas rate unavailable must not hide independently verified balances. */}
   return {...base,status:"verified",gatewayAddress:doc.address,
    serviceWallet:wallet,serviceBalanceWei:serviceBalance.toString(),
    claimableWei:pending.toString(),contractBalanceWei:balance.toString(),
    minimumGasReserveWei,gasPriceWei,gasStatus,
    receiptPath:doc.receiptPath};
  }catch(error){
   return {...base,status:"unavailable",
    error:String(error?.message||error).slice(0,170)};
  }
 }));
 return {ok:true,readOnly:true,checkedAt:new Date().toISOString(),
  gasBudget:"1.2m gas units + 30% buffer (indicative, not a subsidy guarantee)",
  chains};
}
