# XITA read API, transfer index and verified metrics

This directory implements the read API, finalized transfer projection, untrusted transaction intake, durable proof observer and read-only TVL/flow evidence producer. The earlier assertion that no evidence collector exists is obsolete. Code presence and recorded contracts do not prove production workers are installed or healthy.

From this package directory install declared dependencies (`npm install --ignore-scripts` when no lockfile exists). From repository root start `node services/indexer/server.mjs`, default `127.0.0.1:4088`. The server reads a SELECT-only database role and bounded fresh local evidence. Unknown coverage/value remains unavailable/null, not zero.

API groups include `/health`, `/api/xeta/v1/transfer/health`, `/transfer/recovery`, `/transfers/wallet`, `/transfers/discovery`, `/transfers/stats`, `/metrics/toplist`, `/visibility`, `/systems/<chain>` and bounded POST `/rpc/read` under the same `/api/xeta/v1` prefix. The full service reference gives exact paths, parameters, outcomes and limits. Recovery prepares unsigned Direct-BLS calldata; it never broadcasts or holds user keys.

`transfer-intake.mjs` is a separate loopback-4089 service with restricted staging INSERT authority. Its POST `/api/xeta/v1/transfers/announce` accepts `{account,sourceChain,txHash}` and returns `REPORTED_UNVERIFIED`. Only the independent worker verifies canonical source sender, receipt, finality, Gateway and message before projection.

`transfer-index-worker.mjs` maintains rebuildable finalized source records/cursors and destination delivery state. `transfer-proof-observer.mjs` uses durable database leases for unsigned proof readiness; it does not execute transfers. `tvl-worker.mjs` reconciles actual collateral against source evidence and produces metrics/history without chain writes. Do not double count synthetic supply or label hop events unique journeys/TVL. CoinGecko values are third-party market data.

Use the separate `.env.example`, `.service.example` and explicit SQL/role installers for each component. Do not give the public read API a sponsor key, validator secret or unrestricted database role. Database migrations include two named 010 files; follow explicit installer dependencies. Unit checks: `node --test services/indexer/*.test.mjs` with this package's declared dependencies available. No installation or production activation is implied by this README.

## Complete references

- [Service/API/configuration reference](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_Services.md)
- [Independent transfer and unsigned recovery](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_v3.4.0_Operations.md)
- [Protocol and permissionless route registration](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_Asset_Bridge.md)
- [Source map, validation and evidence limits](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_Source_Map.md)
