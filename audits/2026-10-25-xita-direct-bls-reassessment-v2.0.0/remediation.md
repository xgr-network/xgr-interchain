# Re-Audit 25 October 2026 — Public remediation ledger

This is a *living* post-audit status register. Historical 24 October findings remain unchanged in [their original register](../2026-10-24-xita-direct-bls-v1.0.0/remediation.md).

| Finding | Current code disposition | Evidence |
| --- | --- | --- |
| H-01 · High | ARCHITECTURAL_RISK_REVIEW | Correlated external RPC witnesses; candidate residual Medium only after documented independent providers, fail-closed tests and explicit acceptance |
| N-01 · High | OPEN | Shared source observer can stall the grouped cursor when one operation's validation/signing errors |
| N-02 · High | FIXED_IN_CODE | Node [PR #71](https://github.com/xgr-network/xgr-node/pull/71), merged `2a001b61b710f2a058eda7e66404b58b9a6b2ac5`, Go CI passed |
| N-05 · High | FIXED_IN_CODE | Interchain [PR #309](https://github.com/xgr-network/xgr-interchain/pull/309) `ab6d98395824beb71733577b0f49b2d167ab2761`; corrected all-upfront funding in [PR #311](https://github.com/xgr-network/xgr-interchain/pull/311) `f65cdf89b55953778e2c5c6a50f341d22d3b7052` |
| New L-02 · launch P0 | FIXED_IN_CODE | Interchain [PR #308](https://github.com/xgr-network/xgr-interchain/pull/308) `4daf33ccf38e2227f9b60015ed94b2e19c9c1038` |
| N-11 · wallet route prioritization | FIXED_IN_CODE | Interchain [PR #310](https://github.com/xgr-network/xgr-interchain/pull/310) `f353d540519da2a373cd31e86b9a61e1d01cdafb` |
| N-03/N-04 and other additional findings | NOT_REASSESSED_HERE | Complete finding-specific descriptions and proofs must be taken from the confidential original, not reconstructed from labels |
| 24 October M/L/I findings | REFER_TO_ORIGINAL_REGISTER | Require finding-specific independent re-assessment before reclassification |

No source merge alone establishes release, installation or a safe live transfer.

## Next P1 fixes

Start with N-01: isolate poisoned operations via durable retry, retain full source-message, receipt and quorum authentication; advance shared scanner cursor **only** once every operation has either been fully processed or durably and recoverably enqueued. Then handle per-finding validator authorization, RPC cancellation, observer fairness and reorg negatives. Keep normal IBFT/PoS consensus unaffected.
