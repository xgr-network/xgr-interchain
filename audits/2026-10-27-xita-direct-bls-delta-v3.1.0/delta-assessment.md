# Correction overlay - r1

The frozen application sources remain Interchain 26d1356ce7c92eed67bfdbb91a5a0b19efc25ae3 and node 51d92f1ab9b1ba52f62e2ff903c6ff0a7c2f5671.

C-01 adds the independently read canonical Mainnet genesis from XGR 70af62db9fe9c197e2e755dae7919baf313a13ca, blob 582e5a3631655bcb68cbc87568f3c04901dfe366. It schedules securityAccounting at 12186213, chain ID 1643. This corrects the omitted configuration authority; it is not a host-file attestation.

C-02 preserves actual retained version observations at rpc.xgr.network and rpc1.xgr.network. A successful rpc2 response was not recovered; the previous conversational statement implying it had been verified is corrected. Fresh direct renewal failed DNS resolution in the audit environment, not proof of node outage.

C-03 preserves agreement at 19 sampled heights, including H-1/H/H+1. Empty/canonical-marker blocks corroborate continuity but do not distinguish every active rejection/accounting rule. New read-only MCP head 12194361 is beyond H, not a full replay.

C-04 separates verified release artifact identity from installed identity. The release has Go1.23.12; observed RPCs report Go1.23.11. Equivalent-source local builds are possible; neither exact binary identity nor absence of the fixes is inferred.

The original independent Phase A is not rewritten. No application code, production configuration, node restart, database state or on-chain transaction is changed. The scoped decision and all limitations are in report.md.
