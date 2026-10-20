# XITA / XGR-Node v3.2.0 — minimum-diff Hyperlane recovery

**Status: implementation and security tests still in progress. Do not release, deploy, or merge without end-to-end proof.**

## Fixed architecture
- Hyperlane Mailbox, MerkleTreeHook and Warp TokenRouter stay the transport and token custody boundary.
- Permissionless route registration, XGRChain (domain 1643) as hub and current 2/3 BLS destination ISM remain intact.
- `ILNGateway.bridge()` is a public protocol entry point. It atomically collects the mandatory **source-native validator fee**, locks/burns and dispatches, then allocates the fee to the immutable route FeeVault. No XITA GmbH wallet, UI, relayer or service charge is needed for direct access.
- `XITAExecutionGateway` is **optional**. Service quoting, signing, charging, and any sponsored gas are controlled by the company backend and not by source checkpoint voting.
- A corrupt peer cannot authorize roots: each validator checks its own reconstructed Merkle prefix against the *canonical confirmed source MerkleTreeHook state*. The destination ISM verifies 2/3 signature, authorized message ID and supplied Hyperlane Merkle proof.
- No new compulsory wallet transactions and no extension of XGRChain IBFT consensus.
- Source FeeVault allocation is separate from 2/3 fee-governance: quorum changes the source fee rate, not accounting for each transfer.

## Deployment: preserve deployed audited contracts
The current v3.2.0 PR changes **no** production `.sol` contract. It therefore requires **no contract redeployment**. Preserve the on-chain addresses, receipts, active route records, liquidity/escrow and pending deliveries.

The previous fresh-deployment-only proposal is withdrawn. In particular **do not delete**
`deployments/chains/base.json`, `deployments/chains/xgrchain.json`, deployed representations,
directed routes, historical receipts, or admin deployment journals as a v3.2.0 prerequisite.

The compatibility CI checks unchanged Solidity code against base `main`, active
deployment identity, component addresses and existing immutable receipt evidence.
A completed green CI proves repository provenance, **not** current on-chain
bytecode; mainnet deployment/runtimeCodeKeccak256 should be independently queried
and checked before go-live.

If later review demonstrates an actual contract/ABI incompatibility, create a **separate**
explicit reviewed contract-diff migration, including the exact affected deployments,
liquidity migration and pending route escrow; never silently reset mainnet state.

## Node work and security gates before v3.2.0
1. Source checkpoint is a confirmed Hyperlane Hook root/count at its *own*
   block epoch. Do not falsely label the root as the original operation-block root.
2. A valid canonical inclusion proof for the **exact fee-allocated message ID**
   must be checked before a validator signs; the root/count alone proves no
   specific message. When reconstructing an incoming peer vote, fail closed
   on missing/inconsistent proof or source fee allocation.
3. Fee authorization should follow the registered immutable Gateway and
   per-message FeeVault state. Do not require historical `ILNOperation` logs
   or the current fee to equal an old fee at the transaction block.
4. Validator P2P transfers are authenticated, bounded and untrusted. Every
   received snapshot is verified against the source root independently before
   persistence or use for voting. Persist all replica and route data under
   `data/interchain/`; cover with normal consistent node backups.
5. Public read-only proof and message availability must not depend on XITA's
   private relayer/indexer. Clients need complete original Hyperlane bytes and
   a proven leaf index before `Mailbox.process()`.
6. Multi-validator tests must cover honest bootstrap, corrupt/disconnected peers,
   slow join, checkpoint rotation, recovery after restart, source RPC 403/429/503,
   10k-message scale, and complete direct Wallet-to-Mailbox settlement.
7. Check live destination BLS set rotation, ISM proofs, route binding and gas,
   and benchmark state/disk/RPC growth.
8. The known old-route Base burn for message
   `0xf735484813a91eda5c60e959f4038b97ea518de5a9e92de440bd5612c1f387a5`
   must be settled or explicitly tracked before any unrelated route migration.

## Data availability: explicit boundary
The Hook root is a cryptographic commitment, **not** an archive of message
bytes or hashes. If all validator data dirs and independent backups lose
the underlying insertion/message history, no protocol can reconstruct it
from the root alone. Onboard the first archival validator from intact
historical data or a verified backup; replicate redundantly thereafter.
Back up data dirs with consistent snapshots and verify against source
chain on restore. Do not silently substitute a trusted relayer.

## Release gate
Keep XGR-Node PR #38 and XITA PR #175 in Draft until the complete validator
network and direct execution tests pass. Successful Go unit tests, Foundry
tests and existing receipt checks alone do NOT meet the release gate.
