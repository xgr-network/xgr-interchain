# XITA v3.1.5 multi-asset layout

See [REPOSITORY_LAYOUT.md](./REPOSITORY_LAYOUT.md) for the normative tree.

Each asset has one directory under config/assets/<shard>/<SYMBOL>/ with exactly
four JSONs: asset.json, metadata.json, listing.json and routes.json. Routes
here are configured directed intentions and do not constitute deployed on-chain
registrations or validator governance approvals.

Only verified deployments appear in deployments/ as sparse per-chain,
per-representation and per-actual-routeId JSON files. Native verifier
capabilities stay in config/chains/<chain>/bootstrap.json. Receipt JSONs
are append-only and cryptographically checked.

The generated apps/web/catalog.json and the Admin API derive from the same
config and verified deployment records. An unavailable indexer or RPC may
block live bridging, but it may not fabricate missing deployment addresses.

Adding an EVM chain needs only a config/chains/<chain>/chain.json and
bootstrap.json. Adding an asset creates only its four config JSONs and an
updated generated catalog; NOT an empty deployment file.

XGRChain (1643) remains the mandatory hub. Every allowed one-hop route has
the hub as exactly one endpoint. Spoke-to-spoke journeys are two independent
hops, never an invented direct route or implicit sponsor.
