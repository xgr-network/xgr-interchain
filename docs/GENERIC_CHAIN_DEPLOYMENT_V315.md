# XITA v3.1.5 — generic, config-driven chain deployment

## Contract

Adding a valid EVM-chain definition under `config/chains/<slug>.json`, its
`config/bootstrap/<slug>.json` and its canonical
`deployments/mainnet/infrastructure/<slug>.json` makes it appear in the
Deployment Center automatically. No Base, Polygon, or other per-chain UI
implementation is permitted. The single XGRChain hub (1643/1643) remains
mandatory for all directed routes.

Each chain provides `chainId`, `domainId`, `rpcUrls`,
`blsVerifierFormat` (compressed or eip2537), confirmations, gas currency
and an infrastructure manifest. On-chain chain ID, Hyperlane core,
verifier behavior, chain-bound BLS proofs, live validator set and source
fee must be checked before approval.

## State transitions

1. **Configured**: approved main includes all three canonical manifests.
2. **Evidence validated**: finalized XGR PoS snapshot, domain-bound
   bootstrap proofs, reserve and fee parameters. No repeated proof
   generation for an already verified destination.
3. **Preflight passed**: RPC, chain ID/domain, deployed Hyperlane core,
   working native/EIP-2537 BLS verifier, positive/negative vectors.
4. **Artifacts pinned**: reproducible Foundry build with constructor,
   immutables, library references, expected runtime/codehashes and gas
   estimation tied to the exact main source SHA.
5. **Wallet deployment**: chain selection and wallet confirmation on the
   actual chain; no backend private keys. Verifier (if required),
   ValidatorRegistryV2, ISM, Factory and factory-owned SourceRegistry.
   Durable write-ahead transaction journal and recovery prevent replay.
6. **Receipts**: finalized canonical receipt, constructor parameter and
   bytecode verification. Atomic append-only main commit for receipts
   and per-chain infrastructure index; never resend mined transactions
   after a GitHub failure.
7. **Asset routes**: public Factory creates routers and two separate
   prepared directed routes. Validators independently attest factual
   reciprocal counterpart security. On-chain BLS quorum activates
   each direction; prepared alone is not enabled.
8. **E2E**: both directions, retry/replay and interrupted relayer tests
   before users can bridge.

The same sequence must execute on any supported EVM chain. A complete
config makes deployment **selectable**, not automatically safe to broadcast.

## Current implementation boundary

Main-driven inventory, chain selection, per-chain wallet switching,
preflight and read-only readiness are implemented. The actual
commit-pinned artifact planner, validated EIP-1193 transaction executor,
crash reconciliation, source-chain historical fee evidence, per-route
counterpart BLS safety execution and relayer v3.1.5 E2E are unfinished.
Deployment buttons must stay disabled until ALL prerequisite gates are
implemented and tested. No chain-specific quick path is acceptable.

`./manage.sh deploy` publishes the WEBSITE only; it never deploys contracts.
