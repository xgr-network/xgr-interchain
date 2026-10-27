# XGR Interchain — current operations

**Node baseline:** v3.4.0. **Reviewed:** 2026-10-27.

## Independent transfer and recovery

Follow the [complete direct execution runbook](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_v3.4.0_Operations.md). Call the public source ILNGateway directly, retain the original source hash/message ID, and use `runtime/native-relayer/recover-iln.mjs` to validate and prepare unsigned destination `Mailbox.process` calldata. Anyone with destination gas can submit valid authorization. No XITA service quote, sponsor or managed relayer is required. Source fees, native gas, canonical chain access and current validator quorum remain required.

## Route deployment and validation

Use current Factory/Registry code and deployment receipts. Register the supported canonical identities permissionlessly, confirm reciprocal router bindings and destination ISM/validator registry, and independently verify both directions. Chain-wide source fee governance is not a route-admission vote. A website prospect/listing does not establish readiness. New physical chains require reviewed shared infrastructure, compiled node configuration and finality policy; do not invent chain support through relayer environment variables.

## Runtime and failure handling

Keep the managed relayer replaceable. For a custom executor, preserve original source receipts, verify the exact Direct-BLS payload/current set, simulate destination execution and check replay status. `PENDING` requests/retries quorum for the same message; `ALREADY_DELIVERED` requires checking existing settlement; `RECOVERY_NOT_READY` requires resolving its reported verification failure. Do not create duplicate source lock/burn transactions or disable authorization checks to recover liveness.

Monitor validator worker heartbeat and per-chain RPC/finality health separately from website/indexer/service health. Base and Arbitrum use checked `safe`; XGRChain uses its committed IBFT head. Never silently replace unavailable finality with `latest`. Restore validator quorum before expecting delivery. Review current audit evidence and residual assumptions; an operational restart does not resolve a protocol finding.

## Release and backup

For binary verification, consistent backups and the common `securityAccounting` fork, see the [v3.4.0 node runbook](https://github.com/xgr-network/XGR/blob/main/docs/chain/XGRCHAIN_v3.4.0_Release_and_Activation.md). Node deployment does not deploy contracts. Back up secrets and node state separately from optional relayer/indexer data. Dated audit artifacts remain immutable evidence of their assessed revision.
