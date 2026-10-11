# XITA canonical repository layout — v3.1.5

GitHub main provides the single reviewed, versioned input for the Admin UI,
website catalog and onboarding. Deployment files record only finalized,
independently verified on-chain receipts. The chain remains authoritative for
live code, registry state, fees and transfer results.

## Config (reviewed intent and identity, no manual listing)

- config/chains/<chain>/chain.json — EVM chain identity, RPC and capabilities.
- config/chains/<chain>/bootstrap.json — initial validator and verifier configuration.
- config/validators/initial.json — initial validator identities.
- config/assets/<assetId[2..4]>/<SYMBOL>/asset.json — canonical asset identity.
- Same asset folder: metadata.json and routes.json (three files total).
- config/publication.json — optional global USD-equivalent publication threshold, currently null.
- No per-asset mainnet.json and no token deployment addresses in config.

The two-character lowercase shard comes from the first byte of the 32-byte
canonical assetId (e.g. XGR 0xa758... -> a7). Names/symbols are NOT globally
unique cryptographic identifiers; the full assetId and origin contract remain
authoritative. Future duplicate symbols require a separate display alias
strategy; never overwrite an existing symbol's asset.

## Deployments (verified evidence only)

- deployments/chains/<chain>.json — verified, once-per-chain XITA contracts.
- deployments/assets/<shard>/<SYMBOL>/representations.json — verified routers.
- deployments/assets/<shard>/<SYMBOL>/routes/<64-hex-routeId>.json —
  immutable, directed permissionless route instances, identified by actual
  router-pair-derived routeId. Each references its Gateway/FeeVault proofs.
- deployments/receipts/<chain>/<txHash>-<address>.json — immutable
  per-contract receipt evidence, tied to a finalized block and runtime hash.

Missing deployment files mean NOT DEPLOYED, not missing required config.
Do not create empty deployment indexes for configured Chains or Tokens.
A native BLS precompile is a chain capability in bootstrap, not a deployed
contract, and must not be written under deployments/chains.

The initial repository holds exactly ONE infrastructure file,
deployments/chains/xgrchain.json, documenting one deployed ValidatorRegistry.
Other contracts/chains/assets have no deployment indexes.

## Consumers

- tools/manifest-layout.mjs — shared paths, inventories and sparse loaders.
- tools/validate-manifests.mjs — cross-reference + schema validation.
- tools/build-xeta-web-catalog.mjs — deterministic generated catalog.json,
  never an editable second source of truth.
- services/admin/main-gate.mjs and asset-state.mjs — same canonical inventory.
- services/admin/deployment-ledger.mjs — atomic Git commit with verified receipt,
  its proper chain/asset/route index and regenerated catalog.
- services/indexer/publication.mjs — read-only database-backed derived visibility.
- services/onboarding/manifests.mjs — configuration-only proposals. Onboarding
  NEVER creates deployment records or grants route permission.

Assets may have many route instances between the same two chains. Planned
direction pairs are NOT routeIds; an actual routeId is defined only with
real local and remote routers. The public directory is curated but on-chain
registration is permissionless and cannot be vetoed by the indexer.

Legacy Hyperlane on-chain addresses are deliberately excluded from this new
deployment inventory. Solidity transport dependencies are not automatically
removed by deleting obsolete address manifests; they require their own
reviewed build/deployment evidence before use.

See [XITA_PUBLICATION_POLICY.md](./XITA_PUBLICATION_POLICY.md) for prospect,
deployed and reversible public visibility rules. No status lives in GitHub.
