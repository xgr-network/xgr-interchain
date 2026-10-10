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

## Chain contracts: on-chain economic authority (v3.1.5)

1. GitHub `main` defines the permitted EVM chains, RPC, BLS verifier
   format and artifacts. Its infrastructure manifests hold **verified address
   references and receipt paths**, not a second copy of current economics.
2. Public XGR PoS snapshot and domain-bound initial BLS proofs are checked
   independently at the time of Registry preparation. Existing proof files
   are reused. A supported EIP-2537 spoke must first deploy a receipt-verified
   BLS Verifier, then verify all 3 public PoPs through that contract.
3. Clicking an outstanding Contract in **Chains & Onboarding** opens a
   component-specific UI dialog. The ValidatorRegistry requests only minimum
   reserve, maximum executor reimbursement, and initial per-validator reserve.
   The Factory requests only initial source-chain fee and default destination
   gas limit. Other chain contracts do not request economic inputs.
4. These values are **not written to bootstrap JSON or chain JSON**. Their
   exact validated decimal/Wei bytes are used to construct the one proposed
   transaction, then persisted with the durable EIP-1193 transaction intent.
   Gas preview and the actual Wallet transaction are rebuilt from the same
   contract artifacts and parameter values, independently checked against
   the clean current GitHub-main source commit.
5. Only a wallet may sign/broadcast. An interrupted or ambiguous transaction
   remains locked and is reconciled by the known nonce, transaction hash and
   receipt; never send a duplicate.
6. After finalized canonical receipt verification, runtime Keccak and
   immutable/getter verification, the contract address and historical receipt
   are appended to GitHub main, and the server updates its clean checkout.
7. The live ValidatorRegistry is authoritative for minimum reserve,
   reimbursement ceiling and actual per-validator reserves. The Factory is
   authoritative for destination gas and its immutable initial source fee.
   The SourceRegistry is authoritative for **current** source fee and fee
   nonce (including BLS quorum changes after initialization).
8. If a contract is missing, no live economic state is invented. An optional
   current-gas-price estimate remains visibly **unapproved**, never treated
   as a protocol rule.

The reserve and initial fee fields in legacy `config/bootstrap/*.json`
remain tolerated only as historical, read-only compatibility hints. No new
deployment writes to them or uses them as an on-chain authority.

This is not proof of a successful real mainnet deployment: software CI and
read-only proof tests must pass; the operator must authorize a small first
live transaction and inspect the actual chain receipt. Router/Gateway
creation and BLS route activation remain separate stages.

`./manage.sh deploy` publishes the WEBSITE only, never chain contracts.
