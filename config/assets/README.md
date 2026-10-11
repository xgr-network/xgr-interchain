# Sharded per-asset XITA manifests

Directory: config/assets/<first-byte-of-assetId>/<SYMBOL>/

Required per configured asset: asset.json (canonical origin identity, assetId,
representations), metadata.json (website/catalog), listing.json (publication),
routes.json (desired hub-directed chain pairs).

The prefix is the first two hex digits after 0x in the canonical keccak assetId.
For XGR, 0xa758... maps to config/assets/a7/XGR/.

No mainnet.json, no deployment receipts and no contract addresses for future
wrapped representations are stored here. Actual verified routers and distinct
route instances are stored only under deployments/assets/<shard>/<SYMBOL>/.

Directory status/listing is not permission to deploy or register a route:
registration is permissionless on-chain. Review docs/REPOSITORY_LAYOUT.md and
run node tools/validate-manifests.mjs before submission.
