# First Base/XGRChain deploy execution — gated preparation

This is a **development-stage plan and journal**, NOT permission to transmit
contracts or reserve collateral. GitHub main is still the only authority for
desired chains/assets/routes; an up-to-date checkout is required for writes.

## First pair only

- Base chain ID/domain 8453: EIP-2537 verifier -> three pinned initial
  validator keys with per-domain PoPs and reserve -> ISM -> Factory
  (initial fee **100000000000 wei**, no quorum) -> source Registry.
- XGRChain chain ID/domain 1643: validate existing **native compressed
  verifier** at 0x2040, **do not deploy EIP-2537 verifier** -> three pinned
  initial validator keys/PoPs and reserve -> ISM -> Factory (XGR source
  fee **still unspecified**) -> source Registry.
- After both sides pass, create and independently authenticate the two
  directed XGR <-> Base routes. No Base -> other external chain route.

## APIs and journal

`GET /admin/api/first-deploy` exposes the immutable on-disk main-derived
dependency graph, bootstrap blockers and the local transaction journal. No
endpoint in this stage can submit a wallet transaction or insert a caller-
supplied receipt into GitHub.

`services/admin/deployment-journal.mjs` is a tested, durable and
exclusively-locked journal with stages `submitted -> confirmed ->
documented` or `submitted -> failed`. It permanently refuses a second
transaction for the same component. Do not clear the journal to retry:
reconcile and inspect original chain transaction hashes first.

Once the trusted executor is implemented, it must persist the signed tx hash
before waiting for receipt; verify canonical block, originator, constructor
bindings and runtime code at the approved chain; then atomically append the
verified GitHub receipt and infrastructure/asset index. The existing
`deployment-ledger.mjs` is a backend-only basis but does not yet perform
this complete workflow, especially after a GitHub main commit itself
advances. Signing must stay in the user's wallet.

## Outstanding before any live deploy

1. Finalized PoS snapshot and all three real domain-bound BLS public
   proofs, both compressed and EIP-2537.
2. Minimum validator reserve, per-validator reserve, maximum reimbursement
   on each chain; initial **XGRChain source-native fee** approved in main.
3. Positive/negative BLS vectors on Base and XGRChain. Verify expected
   EIP-2537 precompile availability.
4. Commit-pinned Foundry build artifacts, immutable constructor payloads,
   wallet transaction gas estimates and runtime verification accounting for
   constructors/immutables.
5. Full validated wallet executor, crash recovery, GitHub backcommit and
   replay prevention tests. Both directed-route activation and asset E2E.

**Do not fund Registry constructors or bridge live XGR until these are done.**
