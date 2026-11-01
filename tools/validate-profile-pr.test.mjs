import test from "node:test";
import assert from "node:assert/strict";
import {loadCatalog} from "./validate-manifests.mjs";
import {profileUpdateFromCoin} from "../services/onboarding/coingecko-profile.mjs";
import {verifyUpdatedProfiles} from "./validate-profile-pr.mjs";
const base=loadCatalog(),arb="0x912ce59144191c1204e64559fe8253a0e49e6548";
const coin={id:"arbitrum",name:"Arbitrum",symbol:"arb",description:{en:
 "Arbitrum is an Ethereum scaling solution and transparent community governance platform with independent organizations and decentralized contributors."},
 image:{large:"https://coin-images.coingecko.com/coins/images/16547/large/arb.jpg"},
 categories:["Layer 2 (L2)"],links:{homepage:["https://arbitrum.foundation/"]},
 platforms:{"arbitrum-one":arb},detail_platforms:{"arbitrum-one":{contract_address:arb,decimal_place:18}}};
test("CI accepts an independently verified CoinGecko-only metadata update",async()=>{
 const b=profileUpdateFromCoin({symbol:"ARB"},coin,base);
 const next=JSON.parse(b.files["apps/web/catalog.json"]);
 const paths=["config/assets/"+base.assets.ARB.metadata.assetId.slice(2,4)+"/ARB/metadata.json","apps/web/catalog.json"];
 const result=await verifyUpdatedProfiles({before:base,after:next,changedPaths:paths,loadCoin:async()=>coin});
 assert.deepEqual(result,["ARB"]);
 const contaminated=structuredClone(next);contaminated.assets.ARB.metadata.decimals=6;
 await assert.rejects(()=>verifyUpdatedProfiles({before:base,after:contaminated,changedPaths:paths,loadCoin:async()=>coin}),/unrelated/);
 await assert.rejects(()=>verifyUpdatedProfiles({before:base,after:next,changedPaths:[...paths,"config/assets/aa/ARB/routes.json"],loadCoin:async()=>coin}),/cannot modify/);
});
test("unmodified existing token profiles need no CoinGecko API access",async()=>{
 let reads=0;
 const result=await verifyUpdatedProfiles({before:base,after:base,changedPaths:["services/onboarding/server.mjs"],loadCoin:async()=>{reads++;throw Error("Unexpected network")}});
 assert.deepEqual(result,[]);assert.equal(reads,0);
});
