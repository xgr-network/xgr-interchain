# Verification plan and evidence ledger — XITA v3.1.5

## Baseline (audit on 2026-10-16)

- **Frozen interchain commit:** `250adc61838896c77360adad22a4952da9263766`.
- **Frozen node commit:** `99b7b915fb09adaf67c1c3527c8ad45522e0414a`.
- **Observed GitHub CI:** [Solidity workflow](https://github.com/xgr-network/xgr-interchain/actions/runs/38800675745/job/116648558082) at the audited interchain commit reported **79 passing tests across 16 suites**.
- **Local auditor observations:** isolated JS and Go integration checks, not real RPC/chain end-to-end evidence. Detailed original logs are held confidentially pending disclosure.
- **Full two-chain validator-rotation test:** NOT RUN / NOT VERIFIED.
- **Current deployed server revision and deployed-contract runtime hashes:** NOT independently verified by this review.

## Release acceptance matrix

| Gate | Acceptance evidence required | Status |
| --- | --- | --- |
| A-01 dynamic route names | Identical source/destination domains, routeId and validator-RPC identifier in both repositories; genuine quorum lookup and recovery without a per-token ENV alias | `PENDING` |
| A-02 validator admission | V3 possession proof and membership quorum both succeed for an authorized new validator; replay/invalid proof fails; removal remains governed | `PENDING` |
| A-03 token custody UI | Native, synthetic and collateral routes use the true token address; safe approval, balances, gateway bindings and source receipt are verified | `PENDING` |
| A-04 recovery intent | Decoded Mailbox.process message hash matches the original source messageId; mutated inner message fails; normal proof still passes | `PENDING` |
| Cross-chain delivery + rotation | One source lock/burn, rotate to a new destination set, old proof rejects, original message is re-attested, destination delivers exactly once, no second source fee | `PENDING` |
| Failure/restart/history | Restarted verifier/recovery works on historical confirmed operation with archived state and without signing keys at the relay service | `PENDING` |
| Release identity | Exact tested commits and release versions, receipt/codehash verification, deploy health and ownership documented | `PENDING` |

Record actual test commands, redacted logs and the verifying commit **after** execution. A CI run on a different commit does not satisfy a release gate for the current code.

**No release approval is recorded here.**
