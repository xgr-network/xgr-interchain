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
- A-02: **Published and operator-reported deployed**, [node PR #34](https://github.com/xgr-network/xgr-node/pull/34), tested `XGR3.0` merge commit [`a26e93136fd936e654d70b784d4f57114a9068fd`](https://github.com/xgr-network/xgr-node/commit/a26e93136fd936e654d70b784d4f57114a9068fd), [v3.1.6 release](https://github.com/xgr-network/xgr-node/releases/tag/v3.1.6) published 2026-10-16 15:58 UTC. [Release workflow #38914011710](https://github.com/xgr-network/xgr-node/actions/runs/38914011710) succeeded for Meta, Integration (`unit + e2e + build`), EEST, ForkGate and Publish. Code also copied to private `xgrchain/PoS_3` in [PR #1534](https://github.com/xgr-network/xgrchain/pull/1534); private-repo workflow did not start a runner, so no independent private CI evidence. Operator reports v3.1.6 rolled out to mainnet servers on 2026-10-17; host binary digest/version and live V3 PoP + quorum ADD/REMOVE remain **NOT VERIFIED**. The E2E release gate is not proof of a real Base/XGR validator admission.
- A-03: [Draft #133](https://github.com/xgr-network/xgr-interchain/pull/133), commit `0961dd629cb8627b41037ae81346a7b7c4a0bc0f`; **Validate** ([run 38883867928](https://github.com/xgr-network/xgr-interchain/actions/runs/38883867928)), **Native Interchain Contracts** ([run 38883868037](https://github.com/xgr-network/xgr-interchain/actions/runs/38883868037)), and **XITA Contract Review** ([run 38883867927](https://github.com/xgr-network/xgr-interchain/actions/runs/38883867927)) completed successfully at the cited HEAD commit. This is code-CI evidence only.
- A-04: [Draft #134](https://github.com/xgr-network/xgr-interchain/pull/134), commit `fb8ba10d16a182007b971d409c8cb95c1ebf1281`; the same three workflows completed successfully at the cited HEAD commit: [Validate](https://github.com/xgr-network/xgr-interchain/actions/runs/38884023906), [Native Interchain Contracts](https://github.com/xgr-network/xgr-interchain/actions/runs/38884023892), [XITA Contract Review](https://github.com/xgr-network/xgr-interchain/actions/runs/38884023899). This is code-CI evidence only.

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
| Release identity | Exact tested commits and release versions, receipt/codehash verification, deploy health and ownership documented | `PARTIAL`: v3.1.6 tag and release CI verified; mainnet rollout operator-reported; deployed binary digest, registry codehash and admission E2E pending |

Record actual test commands, redacted logs and the verifying commit **after** execution. A CI run on a different commit does not satisfy a release gate for the current code.

**No release approval is recorded here.**
