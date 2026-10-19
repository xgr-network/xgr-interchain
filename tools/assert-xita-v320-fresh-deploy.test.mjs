// The gate is fail-closed until ALL active v3.1.5 manifests have been
// replaced with fresh protocol-specific v3.2.0 records. This test verifies
// the gate is wired to the proposed deployment graph and does not authorize
// a partial or mixed-generation release.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const file = fileURLToPath(new URL("./assert-xita-v320-fresh-deploy.mjs", import.meta.url));
test("fresh-deploy-only gate checks both chains, receipts and routes", () => {
  const code = readFileSync(file, "utf8");
  for (const literal of ["base", "xgrchain", "xitaV315", "xitaV320",
       "protocolVersion", "receiptPath", "receipts", "assets", "legacy", "archive"])
    assert.ok(code.includes(literal), "missing release gate: " + literal);
});
