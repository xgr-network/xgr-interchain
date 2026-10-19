#!/usr/bin/env node
// Release gate: fresh v3.2.0 deployments only. Never silently reuse
// previous mainnet contracts/receipts from xitaV315.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dir = join(root, "deployments");
const protocolVersion = "3.2.0";
const fail = (msg) => { throw new Error("XITA fresh-deploy release gate: " + msg); };
const rel = (path) => relative(root, path).split(sep).join("/");
const files = [];
function scan(path) {
  if (!existsSync(path)) return;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const next = join(path, entry.name);
    if (/(^|[-_.])(legacy|archive|v315)([-_.]|$)/i.test(entry.name))
      fail("old deployment namespace still tracked: " + rel(next));
    if (entry.isDirectory()) scan(next);
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(next);
  }
}
scan(dir);

const names = ["base", "xgrchain"];
for (const name of names) {
  const path = join(dir, "chains", name + ".json");
  if (!existsSync(path)) fail("missing fresh chain manifest: " + rel(path));
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (value.chain !== name || value.kind !== "infrastructure-deployment")
    fail("invalid chain identity: " + rel(path));
  if (value.xitaV315 || value.legacy || value.archived)
    fail("old chain generation still present: " + rel(path));
  if (!value.xitaV320 || value.xitaV320.protocolVersion !== protocolVersion ||
      !value.xitaV320.components || typeof value.xitaV320.components !== "object" ||
      !Array.isArray(value.xitaV320.receiptPaths))
    fail("fresh v3.2.0 chain generation is absent: " + rel(path));
}
for (const path of files) {
  const raw = readFileSync(path, "utf8");
  const value = JSON.parse(raw);
  if (raw.includes('"xitaV315"') || raw.includes('"legacy"') ||
      raw.includes('"archive"'))
    fail("old deployment generation/reference: " + rel(path));
  if (path.includes(sep + "receipts" + sep) ||
      path.includes(sep + "assets" + sep)) {
    if (value.protocolVersion !== protocolVersion)
      fail("unversioned or old deployment record: " + rel(path));
  }
  function visit(node) {
    if (!node || typeof node !== "object") return;
    for (const [key, val] of Object.entries(node)) {
      if ((key === "receiptPath" || key === "receiptPaths") && val) {
        const paths = Array.isArray(val) ? val : [val];
        for (const receipt of paths) {
          if (typeof receipt !== "string" ||
              !/^deployments\/receipts\/(base|xgrchain)\/[0-9a-f]{64}-[0-9a-f]{40}\.json$/i.test(receipt) ||
              !existsSync(join(root, receipt)))
            fail("broken or stale receipt reference in " + rel(path));
        }
      }
      if (typeof val === "object") visit(val);
    }
  }
  visit(value);
}
process.stdout.write("Fresh XITA v3.2.0 deployment-only gate passed (" +
  files.length + " deployment manifests).\n");
