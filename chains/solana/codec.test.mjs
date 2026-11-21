import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";
import {keccak256} from "../../apps/web/keccak.mjs";
import {XGR_DOMAIN,SOLANA_DOMAIN,SOLANA_GENESIS_HEX,solanaBase58Pubkey,
 solanaAssetId,solanaRouteId,solanaDirectSigningBytes,solanaDirectSigningHash,
 exactScaleAmount,evmAddress32} from "./codec.mjs";
const here=dirname(fileURLToPath(import.meta.url));
const v=JSON.parse(readFileSync(resolve(here,"test-vectors.json"),"utf8"));
test("Existing V315 XGR asset identity remains unchanged",()=>{
 const scope=keccak256("XITA_ASSET_V315").slice(2);
 const raw=scope+("0".repeat(60)+"066b")+"0".repeat(64)+"0".repeat(64);
 assert.equal(keccak256(Uint8Array.from(raw.match(/../g),h=>parseInt(h,16))),v.xgrCanonicalAssetId);
});
test("Canonical Solana genesis and Base58 keys are 32 bytes",()=>{
 assert.equal(SOLANA_GENESIS_HEX,v.genesisHex);
 assert.equal(solanaBase58Pubkey("5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"),v.genesisHex);
 assert.equal(solanaBase58Pubkey("So11111111111111111111111111111111111111112"),v.solanaMint);
 assert.equal(solanaBase58Pubkey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),v.destinationRouter);
 assert.throws(()=>solanaBase58Pubkey("1111111111111111111111111111111"));
 assert.throws(()=>solanaBase58Pubkey("O".repeat(44)));
});
test("Canonical Solana asset and two hub-only route ID golden vectors",()=>{
 assert.equal(solanaAssetId(v.solanaMint,1),v.solanaSplAssetId);
 assert.equal(solanaAssetId("0x"+"00".repeat(32),0).length,66);
 assert.equal(solanaRouteId({...v.auth}),v.forwardRouteId);
 assert.equal(solanaRouteId({assetId:v.xgrCanonicalAssetId,
   sourceDomain:SOLANA_DOMAIN,destinationDomain:XGR_DOMAIN,
   sourceRouter:v.destinationRouter,destinationRouter:v.sourceRouter}),v.reverseRouteId);
 assert.notEqual(v.forwardRouteId,v.reverseRouteId);
 assert.throws(()=>solanaAssetId(v.solanaMint,0));
 assert.throws(()=>solanaAssetId("0x"+"00".repeat(32),1));
});
test("Direct signing wire format matches the cross-language golden hash",()=>{
 const raw=solanaDirectSigningBytes(v.auth);
 assert.equal(raw.length,501);
 assert.equal("0x"+Buffer.from(raw).toString("hex"),v.authPreimageHex);
 assert.equal(solanaDirectSigningHash(v.auth),v.authHash);
 for(const key of ["setId","sourceHeight","validatorFeeAtomic","amountCanonical"]){
  const changed={...v.auth,[key]:String(BigInt(v.auth[key])+1n)};
  assert.notEqual(solanaDirectSigningHash(changed),v.authHash);
 }
 assert.throws(()=>solanaDirectSigningBytes({...v.auth,routeId:v.reverseRouteId}));
 assert.throws(()=>solanaDirectSigningBytes({...v.auth,sourceMailbox:v.destinationRouter}));
});
test("Reject non-hub routes, truncated Solana pubkeys and spoofed EVM addresses",()=>{
 const a={...v.auth};
 assert.throws(()=>solanaRouteId({...a,sourceDomain:8453}));
 assert.throws(()=>solanaRouteId({...a,destinationDomain:XGR_DOMAIN}));
 assert.throws(()=>solanaRouteId({...a,sourceRouter:a.destinationRouter}));
 assert.throws(()=>solanaRouteId({...a,destinationRouter:"0x"+"00".repeat(32)}));
 assert.throws(()=>evmAddress32("0x"+"00".repeat(20)));
});
test("SPL u64 balance and decimal conversion is exact, without dust or overflow",()=>{
 assert.equal(exactScaleAmount("1000000000000000000",18,9,{destinationSvm:true}),1000000000n);
 assert.equal(exactScaleAmount("1000000000",9,18),1000000000000000000n);
 assert.throws(()=>exactScaleAmount("1",18,9,{destinationSvm:true}));
 assert.throws(()=>exactScaleAmount(((1n<<64n)*10n**9n).toString(),18,9,{destinationSvm:true}));
 assert.throws(()=>exactScaleAmount("1",19,9));
});
