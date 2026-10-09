# Per-token asset manifests

Each real configured token has one directory: <TOKEN>/asset.json, routes.json,
mainnet.json and metadata.json. These contain the canonical asset identity and decimals,
representation types, desired one-hop routes and references to the mainnet
inventory. metadata.json provides public project description, categories, official logo,
social links and optional market-provider IDs. None of these fields controls
validator governance or deployment. They do NOT contain deployed contract
addresses or fee custody.

Separate observation records live in deployments/mainnet/assets/<TOKEN>.json.
Per-chain shared infrastructure is in deployments/mainnet/infrastructure/.

Solidity remains shared in contracts/. A new XDC or other token directory
must not imply that chain infrastructure, a token adapter or a v3.1.4 route
has been deployed or governance-approved.

Read docs/MULTI_ASSET_LAYOUT.md and run the manifest validation before changes.
