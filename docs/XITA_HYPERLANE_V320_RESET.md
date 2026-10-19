# XITA Hyperlane/ILN rebaseline and fresh deployment plan

Status: **draft patch, NOT mainnet-ready**. Target: xgr-node v3.2.0.

## Preserve from the working XGR-hyperlane implementation
Hyperlane Mailbox, MerkleTreeHook, TokenRouter lock/mint and burn/unlock,
destination `Mailbox.process()`, permissionless relayer/proof builders,
independent validators with 2/3 BLS quorum.

## Generalize ONLY the ILN layer
Permissionless immutable route instances; XGRChain as the sole hub; source
fee quorum and immutable fee-qualified message binding; generic per-chain ISM,
registries, and router factory. Do not introduce a mandatory fifth wallet TX,
administrator-controlled routes, central custody, or new interchain finality.

## Blockers before protocol release
- Design and benchmark the minimal exact-message recovery data requirement.
  A root/count alone cannot reconstruct arbitrary earlier Hyperlane messages or
  inclusion proofs after complete data loss; indexer redundancy is NOT identical
  to zero-history disaster recovery. The result must be explicit, not assumed.
- Ensure a canonical confirmed checkpoint can be read using recent EVM state,
  no archive nodes, and no historical eth_getLogs on any required path.
- Prove old source-operation fee and route binding without trusting today's
  mutable fee, an untrusted proof service, or a single RPC backend.
- 10,000 concurrent/pending messages, worker restarts, quorum rotation,
  reorg/finality boundary, provider HTTP 429 and complete indexer loss.
- Measure source gas, destination gas, permanent state growth and RPC load.

## One atomic deployment reset once changed Contracts are ready
The **same reviewed XITA patch** must:
1. Remove ACTIVE records in deployments/chains/base.json and
   deployments/chains/xgrchain.json.
2. Remove deployments/assets/*/*/representations.json, directed routes,
   linked gateway and vault registrations.
3. Remove ALL old files under deployments/receipts/base and
   deployments/receipts/xgrchain from the active tree; no legacy or archive
   directories.
4. Clear stale address/receipt references in config assets, Admin UI,
   deploy journals, sync work queues, indexer bootstrap and publication data.
5. Rebuild the constructor-ABI seal, artifact registry, dependency graph,
   transaction intent handling and wallet-step recovery.
6. Make 'Chain fertig deployen' start cleanly with missing prerequisites
   and register the new chain contracts/receipts back to GitHub.
7. Make route deployment independently recreate representations,
   both directed gateways and fee vaults, and document their receipts.
8. Fail CI on stale deployments, stale runtime code hashes and mixed
   old/new contract generations.

No changes to production contracts or active deployments before this
coordinated patch is compiled, tested and reviewed.

## Already-issued test transfer
The Base burn associated with message ID
0xf735484813a91eda5c60e959f4038b97ea518de5a9e92de440bd5612c1f387a5
is ON-CHAIN and will not be undone by deleting GitHub receipts. Confirm its
destination delivery or explicitly account for the remaining old-route
escrow before removing active deployment references.
