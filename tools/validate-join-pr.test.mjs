import test from "node:test";
import assert from "node:assert/strict";
import {proposedJoinFiles,validateJoinChanges} from "./validate-join-pr.mjs";
const dir="config/assets/ab/EXMP",address="0x1234567890123456789012345678901234567890";
const configs={
 [dir+"/asset.json"]:{kind:"asset-config",symbol:"EXMP",decimals:18,canonical:{chain:"base",tokenAddress:address}},
 [dir+"/metadata.json"]:{kind:"xeta-token-profile",asset:"EXMP",market:{priceSource:"coingecko",coingeckoId:"example-token"}},
 [dir+"/routes.json"]:{kind:"asset-routes",asset:"EXMP"}
};
test("Join CI detects proposal paths and validates contract",async()=>{
 const paths=dir+"/asset.json\n"+dir+"/metadata.json\napps/web/catalog.json";
 assert.deepEqual(proposedJoinFiles(paths),[dir]);
 let seen=null;
 const checked=await validateJoinChanges(paths,{read:p=>configs[p],check:async input=>{seen=input;return {platform:"base"}}});
 assert.equal(checked.length,1);
 assert.equal(seen.canonicalAddress,address);
 assert.equal(seen.coingeckoId,"example-token");
});
test("Join CI refuses any public applicant email",async()=>{
 const changed=dir+"/asset.json";
 const read=p=>p.endsWith("/metadata.json")?{...configs[p],privateNote:"member@example.org"}:configs[p];
 await assert.rejects(validateJoinChanges(changed,{read,check:async()=>({})}),/email/);
});
test("Join CI rejects unlisted price sources",async()=>{
 const changed=dir+"/asset.json",read=p=>p.endsWith("/metadata.json")?
  {...configs[p],market:{priceSource:"none"}}:configs[p];
 await assert.rejects(validateJoinChanges(changed,{read,check:async()=>({})}),/CoinGecko/);
});
