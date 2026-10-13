// Base mainnet execution fees are not the entire on-chain network charge:
// additional L1 data-availability and OP-Stack operator fees are assessed.
// Query the Base system GasPriceOracle read-only before a PAID deploy.
import {selector} from "../../apps/web/keccak.mjs";
export const BASE_GAS_PRICE_ORACLE="0x420000000000000000000000000000000000000F";
export const BASE_MAX_TX_GAS=16777216n; // Base Azul 2026 / EIP-7825
const WORD=/^0x[0-9a-f]{64}$/i;
const word=value=>BigInt(value).toString(16).padStart(64,"0");
async function quoteWord(rpc,url,signature,value){
 const response=await rpc(url,"eth_call",[{
  to:BASE_GAS_PRICE_ORACLE,
  data:selector(signature)+word(value)
 },"latest"]);
 if(!WORD.test(response||""))
  throw Error("Base GasPriceOracle "+signature+" unavailable or malformed; abort paid deployment");
 return BigInt(response);
}
export async function quoteBaseDeploymentExtras({rpc,url,transactionData,gasLimit}){
 if(typeof rpc!=="function"||typeof url!=="string"||!url.startsWith("https://")||
    !/^0x(?:[0-9a-f]{2})+$/i.test(transactionData||""))
  throw Error("Invalid Base transaction fee quote inputs");
 const gas=BigInt(gasLimit);
 if(gas<21000n||gas>BASE_MAX_TX_GAS)
  throw Error("Base gas limit exceeds 16777216 per-transaction maximum (20% buffer included)");
 // The signed transaction includes a typed envelope, nonce, fee fields and
 // signature. Add ample overhead to the raw constructor calldata byte count.
 const bytes=(transactionData.length-2)/2+512;
 if(!Number.isSafeInteger(bytes)||bytes>128*1024)
  throw Error("Base unsigned deployment transaction payload is too large");
 const [l1Fee,operatorFee]=await Promise.all([
  quoteWord(rpc,url,"getL1FeeUpperBound(uint256)",bytes),
  quoteWord(rpc,url,"getOperatorFee(uint256)",gas)
 ]);
 return {l1DataFeeUpperBoundWei:l1Fee.toString(),
  operatorFeeWei:operatorFee.toString(),unsignedTxSizeEstimateBytes:bytes};
}
