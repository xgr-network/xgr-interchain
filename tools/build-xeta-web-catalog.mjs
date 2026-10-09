#!/usr/bin/env node
// Publish only the validated, declarative source inventories. Never infer live routes
// from a desired route alone, and never copy legacy collateral into XETA assets.
import {writeFileSync,readFileSync} from "node:fs";
import {resolve} from "node:path";
import {isDeepStrictEqual} from "node:util";
import {loadCatalog,validateCatalog,ROOT} from "./validate-manifests.mjs";

const catalog=loadCatalog(ROOT);
const errors=validateCatalog(catalog);
if(errors.length) {
  errors.forEach(error=>console.error("INVALID: "+error));
  process.exit(1);
}
const payload=JSON.stringify({schemaVersion:1,...catalog},null,2)+"\n";
const target=resolve(ROOT,"apps/web/catalog.json");
if(process.argv.includes("--check")) {
  if(!isDeepStrictEqual(JSON.parse(readFileSync(target,"utf8")),JSON.parse(payload))) {
    console.error("XETA web catalog is stale. Run node tools/build-xeta-web-catalog.mjs");
    process.exit(1);
  }
  console.log("PASS: XETA UI catalog matches validated protocol inventories");
} else {
  writeFileSync(target,payload);
  console.log("Wrote "+target);
}
