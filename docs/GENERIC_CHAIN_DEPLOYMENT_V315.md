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

## Chain-contract execution (PR #32)

The chain infrastructure execution path is implemented through the Admin UI:

- The operator approves independently verified **public** bootstrap evidence
  and explicit reserve/fee/gas parameters to current GitHub `main` in ONE
  atomic commit, using the server-only `XITA_GITHUB_TOKEN`. Never send private
  validator keys to this service.
- The server independently checks the current clean main, the selected RPC,
  BLS format, finalized validator proofs, and the approved chain dependencies.
- `forge build --force` reconstructs compiler artifacts from the exact
  checked-out source commit. Constructor ABI, runtime-template immutables and
  deployed contract getters are verified against trusted config.
- `eth_estimateGas`, gas-price, wallet balance, selected chain and pending
  nonce are checked before storing a durable (fsync) write-ahead intent.
- The user authorizes ONLY this server-produced EIP-1193 transaction in their
  connected wallet. The browser sends no private key to the backend.
- RPC-observed hash, sender, calldata, nonce, value and recipient must
  independently match the prepared intent; unknown hashes never clear it.
- The canonical finalized receipt, actual runtime bytecode, relevant
  constructor/immutable getters and Factory events are checked.
- Receipts and per-chain deployment manifests are committed atomically to
  GitHub main. The clean server checkout fast-forwards to that new commit.
- After interrupted execution the UI offers **Wiederherstellen**. If a
  transaction is pending or the hash cannot be established, it remains locked:
  never send it again automatically.

The operator must deploy each chain component in dependency order:
`blsVerifier` only on eip2537 chains, then `validatorRegistry`, `ism`,
`factory`, `sourceRegistry`. XGRChain uses its native compressed verifier
and never deploys the Solidity EIP-2537 verifier.

Before any mainnet attempt, configure on the Admin **service account**:
a verified Foundry/Forge installation and pinned Solidity dependencies,
persistent writable `XGR_ADMIN_STATE_DIR`, external RPC access,
`XITA_GITHUB_TOKEN` restricted to this repository, TLS/Basic Auth, and a
wallet with native gas. If any preflight fails, the UI MUST NOT broadcast.

**Real-chain execution has not been demonstrated by unit CI alone.** First
use one authorized low-risk deployment and inspect receipts, then progress
through dependencies. BLS route preparation/activation and relayer v3.1.5 E2E
remain independent and are NOT authorized by successfully deploying chain
infrastructure.

`./manage.sh deploy` publishes the WEBSITE only; it never deploys contracts.
