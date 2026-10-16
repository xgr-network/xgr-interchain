# Verification plan and evidence ledger — XITA v3.1.5

## Baseline (audit on 2026-10-16)

- **Frozen interchain commit:** `250adc61838896c77360adad22a4952da9263766`.
- **Frozen node commit:** `99b7b915fb09adaf67c1c3527c8ad45522e0414a`.
- **Observed GitHub CI:** [Solidity workflow](https://github.com/xgr-network/xgr-interchain/actions/runs/38800675745/job/116648558082) at the audited interchain commit reported **79 passing tests across 16 suites**.
- **Local auditor observations:** isolated JS and Go integration checks, not real RPC/chain end-to-end evidence. Detailed original logs are held confidentially pending disclosure.
- **Full two-chain validator-rotation test:** NOT RUN / NOT VERIFIED.
- **Current deployed server revision and deployed-contract runtime hashes:** NOT independently verified by this review.

## Proposed post-audit changes (separate from the frozen audit)

- A-01: [#130](https://github.com/xgr-network/xgr-interchain/pull/130) aligned Recovery and node-discovery route names in the code. Live multi-node recovery **not** yet reproduced.
- A-02: Go code patch prepared outside GitHub; write access to `xgr-node` rejected by the connected GitHub integration. Neither Go CI nor EVM membership admission can be claimed.
- A-03: [Draft #133](https://github.com/xgr-network/xgr-interchain/pull/133), commit `8adc5ac837ef3dd68fd36fc7cf375c14f5ed0f2b`; **Validate**, **Native Interchain Contracts**, and **XITA Contract Review** completed successfully. This is code-CI evidence only.
- A-04: [Draft #134](https://github.com/xgr-network/xgr-interchain/pull/134), commit `935f5013e27dcb07874b1a607d634a167f69f1b8`; the same three workflows completed successfully. This is code-CI evidence only.

Passing standalone PR CI is insufficient for declaring an integration or production release gate complete.

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
