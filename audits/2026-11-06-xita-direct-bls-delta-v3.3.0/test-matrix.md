# Test matrix and interpretation

### apps/web/metamask-token.test.mjs

Stale current-catalog fixture. Two assertions retain an earlier Base XGR token address rather than the current authenticated catalog representation.

### apps/web/publication-mainnet-regression.test.mjs

Stale route/profile inventory. Assertions assume two routes and no route-free Creator profile; the frozen product contains the expanded route inventory and verified XITACAN profile.

### apps/web/route-availability.test.mjs

Stale presentation expectation. The assertion expects the previous continuation label; the current status/continuation wording changed.

### apps/web/token-inventory.test.mjs

Stale current-catalog fixture. An earlier Base representation address remains hard-coded in the fixture.

### apps/web/wallet-token-balances.test.mjs

Stale inventory and fail-closed projection assumptions. The fixture assumes one asset/read where the current catalog supplies additional assets; removing a required representation now removes the unverified route rather than manufacturing the expected unavailable row.

### services/indexer/rpc-read.test.mjs

Contradictory read-only allowlist assertion. The negative fixture rejects a numbered-block eth_call that the documented pinned-read policy intentionally permits. Forbidden write-method rejection remains required.

### services/onboarding/creator-canary.test.mjs

Mail-configuration fixture dependency. The injected delivery stub bypasses one outer check but the inner registration handler still requires configured transport; the isolated unconfigured fixture returns 503. A configured production failure is not established.

### tools/assert-xita-v320-compatible-deploy.test.mjs

Historical component-alias expectation. The old gate expects a requiredHook component name where current receipt bindings use the authenticated dispatchHook alias with the same address/runtime identity. Correct alias validation narrowly; do not bypass deployment checks.

The full 173-file result matrix is evidence/xita-test-results.json. Node and Solidity execution scopes are in verification.md. No production attack or transaction was used.
