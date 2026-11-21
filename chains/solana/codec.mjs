// Solana endpoint adapter for XITA Direct-BLS V315. This does not alter any
// V315 EVM-only wire, route, asset or signature. No signing/attestation here.
import {keccak256} from "../../apps/web/keccak.mjs";

export const XGR_DOMAIN=1643, SOLANA_DOMAIN=1399811149;
export const SOLANA_GENESIS_HEX="0x45296998a6f8e2a784db5d9f95e18fc23f70441a1039446801089879b08c7ef0";
export const ASSET_SCOPE="XITA_SOLANA_ASSET_V1";
export const ROUTE_SCOPE="XITA_SOLANA_ROUTE_V1";
export const DIRECT_SCOPE="XITA_SOLANA_DIRECT_MESSAGE_V1";
const MAX_U256=(1n<<256n)-1n,MAX_U64=(1n<<64n)-1n;
const B58="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function uint(value,bits,{allowZero=false}={}){
 let v;
 try{v=BigInt(value)}catch{throw Error("Invalid unsigned integer")}
 if(v<0n||v>=(1n<<BigInt(bits))||(!allowZero&&v===0n))
  throw Error("Unsigned integer outside permitted range");
 return v;
}
export function hex32(value,{allowZero=false}={}){
 if(typeof value!=="string"||!/^0x[0-9a-fA-F]{64}$/.test(value))
  throw Error("Expected exact 32-byte hex value");
 const h=value.toLowerCase();
 if(!allowZero&&/^0x0{64}$/.test(h))throw Error("Zero account/identity is not allowed");
 return h;
}
export function evmAddress32(value){
 if(typeof value!=="string"||!/^0x[0-9a-fA-F]{40}$/.test(value)||
    /^0x0{40}$/i.test(value))throw Error("Invalid EVM address");
 return "0x"+"0".repeat(24)+value.slice(2).toLowerCase();
}
function evmPadded(value){
 const h=hex32(value);
 if(h.slice(2,26)!=="0".repeat(24))throw Error("EVM endpoint must have zero high 12 bytes");
}
export function solanaBase58Pubkey(value){
 if(typeof value!=="string"||value.length<32||value.length>44)throw Error("Invalid Solana pubkey");
 let n=0n;
 for(const c of value){
  const p=B58.indexOf(c);
  if(p<0)throw Error("Invalid Base58 character");
  n=n*58n+BigInt(p);
 }
 let h=n===0n?"":n.toString(16);
 if(h.length%2)h="0"+h;
 const prefix=(value.match(/^1+/)?.[0].length||0)*2;
 h="00".repeat(prefix/2)+h;
 if(h.length!==64)throw Error("Solana pubkey is not 32 bytes");
 return "0x"+h;
}
export function bytes(value){return Uint8Array.from(hex32(value,{allowZero:true}).slice(2).match(/../g),x=>parseInt(x,16))}
const cat=(...values)=>Uint8Array.from(values.flatMap(x=>Array.from(x)));
const packedUint=(value,bits,opts)=>{const v=uint(value,bits,opts);const out=new Uint8Array(bits/8);let n=v;for(let i=out.length-1;i>=0;i--){out[i]=Number(n&255n);n>>=8n}return out};
const abiUint=(value,bits,opts)=>cat(new Uint8Array(32-bits/8),packedUint(value,bits,opts));
const digest=x=>bytes(keccak256(x));
function assertDomains(sourceDomain,destinationDomain){
 if(!Number.isSafeInteger(sourceDomain)||!Number.isSafeInteger(destinationDomain)||
   !((sourceDomain===XGR_DOMAIN&&destinationDomain===SOLANA_DOMAIN)||
     (sourceDomain===SOLANA_DOMAIN&&destinationDomain===XGR_DOMAIN)))
  throw Error("A directed Solana route must have exactly one XGRChain endpoint");
}
function assertRouter(domain,address){
 hex32(address);
 if(domain===XGR_DOMAIN)evmPadded(address);
}
// For Solana-origin assets. Existing EVM-origin assets retain their V315 ID.
// kind 0=Solana native SOL, mint=zero. kind 1=SPL, mint=nonzero.
export function solanaAssetId(mint,kind=1){
 if(kind!==0&&kind!==1)throw Error("Invalid Solana asset kind");
 const h=hex32(mint,{allowZero:true});
 if((kind===0)!==/^0x0{64}$/.test(h))throw Error("Invalid Solana native/SPL mint");
 return keccak256(cat(digest(ASSET_SCOPE),abiUint(SOLANA_DOMAIN,32),
  bytes(SOLANA_GENESIS_HEX),bytes(h),abiUint(kind,8,{allowZero:true})));
}
export function solanaRouteId({assetId,sourceDomain,destinationDomain,sourceRouter,destinationRouter}){
 assertDomains(sourceDomain,destinationDomain);
 assertRouter(sourceDomain,sourceRouter);assertRouter(destinationDomain,destinationRouter);
 return keccak256(cat(digest(ROUTE_SCOPE),bytes(hex32(assetId)),
  abiUint(sourceDomain,32),abiUint(destinationDomain,32),
  bytes(sourceRouter),bytes(destinationRouter),bytes(SOLANA_GENESIS_HEX)));
}
// Candidate direct signing preimage. Validators MUST NOT use it for signing
// until source custody/fees, full route state, on-chain verification and audit
// are independently complete. All fields are fixed-size and big-endian.
// amountCanonical uses the ORIGINAL asset's atomic units; source fees use
// source-native atomic units (XGR wei or Solana lamports).
export function solanaDirectSigningBytes(a){
 assertDomains(a.sourceDomain,a.destinationDomain);
 for(const k of ["assetId","routeId","sourceRegistry","gateway","sourceRouter",
  "sourceMailbox","destinationRouter","messageId","recipient","destinationIsm",
  "destinationRegistry"])hex32(a[k]);
 assertRouter(a.sourceDomain,a.sourceRouter);
 assertRouter(a.destinationDomain,a.destinationRouter);
 if(a.sourceDomain===XGR_DOMAIN){
  for(const k of ["sourceRegistry","gateway","sourceMailbox"])evmPadded(a[k]);
 }else{
  for(const k of ["destinationIsm","destinationRegistry","recipient"])evmPadded(a[k]);
 }
 const expected=solanaRouteId(a);
 if(expected!==a.routeId.toLowerCase())throw Error("Authorization route identity mismatch");
 const setId=packedUint(a.setId,64),height=packedUint(a.sourceHeight,64),
  fee=abiUint(a.validatorFeeAtomic,256),amount=abiUint(a.amountCanonical,256);
 return cat(new TextEncoder().encode(DIRECT_SCOPE),
  packedUint(a.sourceDomain,32),packedUint(a.destinationDomain,32),bytes(SOLANA_GENESIS_HEX),
  bytes(a.assetId),bytes(a.routeId),setId,height,bytes(a.sourceRegistry),bytes(a.gateway),
  bytes(a.sourceRouter),bytes(a.sourceMailbox),bytes(a.destinationRouter),fee,
  bytes(a.messageId),bytes(a.recipient),amount,bytes(a.destinationIsm),bytes(a.destinationRegistry));
}
export function solanaDirectSigningHash(a){return keccak256(solanaDirectSigningBytes(a))}
export function exactScaleAmount(value,sourceDecimals,targetDecimals,{destinationSvm=false}={}){
 const n=uint(value,256);
 if(!Number.isInteger(sourceDecimals)||!Number.isInteger(targetDecimals)||
  sourceDecimals<0||sourceDecimals>18||targetDecimals<0||targetDecimals>18)
  throw Error("Unsupported token decimals");
 const delta=targetDecimals-sourceDecimals, factor=10n**BigInt(Math.abs(delta));
 if(delta<0&&n%factor!==0n)throw Error("Transfer amount would lose precision");
 const scaled=delta>=0?n*factor:n/factor;
 if(!scaled||scaled>MAX_U256||(destinationSvm&&scaled>MAX_U64))
  throw Error("Destination amount overflow or zero");
 return scaled;
}
