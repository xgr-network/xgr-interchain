# XITA standalone wallet interface

The SPA provides dashboard `/`, `/universe`, `/markets`, `/token/<slug>`, `/transfer?token=<asset>` and `/join`. It loads the generated deployment catalog, public read services and an explicitly connected EIP-1193 wallet. No user seed/private key belongs in the browser application or backend configuration.

Configured prospects, receipt-backed representations, reciprocal route readiness, proof readiness and confirmed delivery are separate states. Do not infer live bridge readiness from a catalog entry, planet, ticker or deployed contract alone. Source receipts and destination state are the transfer authority.

The transfer UI validates Gateway quotes, amount/decimals, balances, native gas, original source identity and current destination recovery. User wallet approval is explicit. A confirmed source operation is recovered at destination; it is not repeated merely because a tab or optional indexer restarted. There is no browser transfer journal with authority to mint/unlock. Original source hashes remain necessary for older pending operations outside bounded scans.

The recovery endpoint and public helper use Direct-BLS. The website is optional: independently quote/call the public Gateway and submit validated unsigned Mailbox calldata using the linked runbook. The commercial quote/sponsor path is also optional and does not give its signer spending authority over the user wallet.

Join prepares listing proposals, with optional private email confirmation and a draft GitHub PR. It does not approve or deploy a token route. Public Factory access is separate from the application's CoinGecko/listing policy.

Build/check from root: `node tools/build-xeta-web-catalog.mjs --check`, `node --test apps/web/*.test.mjs`, `node --check apps/web/app.js`. Publish with the reviewed `manage.sh` workflow and SPA fallback. Real browser wallet behavior and chain execution require separate testing; no production activation is implied here.

## Complete references

- [Service/API/configuration reference](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_Services.md)
- [Independent transfer and unsigned recovery](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_v3.4.0_Operations.md)
- [Protocol and permissionless route registration](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_Asset_Bridge.md)
- [Source map, validation and evidence limits](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_Source_Map.md)
