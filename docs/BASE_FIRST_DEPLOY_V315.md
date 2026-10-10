# Base first-deployment preflight (XITA v3.1.5)

The approved initial interchain validator identities live **only** in
`config/validators/initial.json` (three addresses, fixed order).
`config/bootstrap/base.json` references that manifest, rather than
copying its membership. This selection is not a claim that their BLS
proofs have been checked or that the current PoS set is finalized.

## Before pressing Deploy

1. `./manage.sh update` to fetch the current approved GitHub main.
2. Open Admin > Chains & Onboarding > Base; connect your EVM wallet,
   switch to chain ID **8453** and check its native **ETH** gas balance.
3. Resolve the first three identities against a **finalized** XGR PoS
   validator snapshot; record the snapshot block.
4. Collect *public* destination-8453 BLS bootstrap proofs and keys for
   those same three validators, in exactly the committed address order.
   Never import any private validator keys into the admin.
5. Configure minimum reserve, maximum reimbursement, and per-validator
   reserve amounts in wei. The initial Base source validator fee is
   **0.0000001 ETH = 100000000000 wei**, already approved in
   `config/bootstrap/base.json`; it is additional to gas.
6. Verify on Base that the documented Hyperlane mailbox and Merkle hook
   addresses contain the expected code, that EIP-2537 operations work,
   and that the verifier/registry construction arguments and runtime
   build hashes come from the exact GitHub main commit.
7. Deploy verifier and initial ValidatorRegistry, then ISM, Factory,
   and Factory-owned source Registry; confirm receipts and bind addresses
   to `deployments/mainnet/infrastructure/base.json`.
8. Repeat chain prerequisites on XGRChain before preparing the
   **XGRChain <-> Base** pair for native XGR/wXGR. Both route directions
   must have independent safety attestations; all routes involve XGRChain.

## Explicit blockers (as of this change)

The initial source-native fee is now a **positive, immutable Factory constructor parameter** forwarded once to the newly created Registry. The source fee starts at nonce **0**, while later fee changes require a validator quorum, starting at nonce **1**. The approved Base fee is `100000000000` wei in GitHub main. Verify the deployed Factory constructor binds exactly that amount before proceeding.

The web Admin deployment button is also still disabled: no
commit-pinned wallet deployment transaction compiler, durable transaction
journal or proven BLS safety executor is connected yet. Recording
addresses back to GitHub is implemented as an isolated trusted backend
module, not yet as a complete automated one-click cycle.

**Do not fund a new validator registry or send bridged XGR until these
blockers are closed and the bidirectional end-to-end suite succeeds.**
