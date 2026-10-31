import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadCatalog,validateCatalog} from "./validate-manifests.mjs";
import {isDeployedChain,deployedRoutes} from "../apps/web/route-availability.js";
import {joinHomeChains} from "../apps/web/join.js";
import {COINGECKO_GAS_COIN_IDS} from "../services/managed-relay/fee-quote.mjs";

test("OP Mainnet chain 10 has operator-independent RPCs and native safe/EIP-2537 intent",()=>{
 const catalog=loadCatalog(),op=catalog.chains.optimism;
 assert.equal(op.chainId,10);assert.equal(op.domainId,10);
 assert.equal(op.nativeCurrency.symbol,"ETH");
 assert.equal(op.blsVerifierFormat,"eip2537");
 assert.equal(op.receiptFinalityTag,"safe");
 assert.equal(op.configurationStatus,"planned-unverified");
 assert.ok(op.rpcUrls.length>=3);
 assert.equal(new Set(op.rpcUrls.map(v=>new URL(v).hostname)).size,op.rpcUrls.length);
 assert.equal(COINGECKO_GAS_COIN_IDS.optimism,"ethereum");
 assert.deepEqual(validateCatalog(catalog),[]);
});
test("undeployed OP Mainnet is excluded from user routes, Join and real transfer/gas eligibility",()=>{
 const catalog=loadCatalog();
 assert.equal(catalog.infrastructure.optimism.present,false);
 assert.deepEqual(Object.keys(catalog.infrastructure.optimism.xitaV315.components),[]);
 assert.equal(isDeployedChain(catalog,"optimism"),false);
 assert.equal(joinHomeChains(catalog).includes("optimism"),false);
 assert.ok(deployedRoutes(catalog).every(route=>route.source!=="optimism"&&route.destination!=="optimism"));
 assert.equal(JSON.parse(readFileSync(new URL("../apps/web/catalog.json",import.meta.url),"utf8")).infrastructure.optimism.present,false);
});
