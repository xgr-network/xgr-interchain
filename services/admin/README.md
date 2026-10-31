# XITA deployment admin

The current admin has chain/asset deployment planners, trusted artifact/constructor verification, wallet-prepared transactions, durable journals, receipt/code/binding reconciliation and append-only evidence synchronization. A particular step may remain blocked by missing prerequisites; the old blanket statement that the executor is unimplemented is obsolete.

Start with `node services/admin/server.mjs` from the repository root. It binds to `127.0.0.1:4087` by default; `XGR_ADMIN_HOST` is restricted to loopback, `XGR_ADMIN_PORT` selects port and `XGR_ADMIN_STATE_DIR` selects journals. Protect every `/admin/` API path with authenticated TLS reverse proxy access. Source Host/Origin checks do not replace authentication.

The application's approved-main gate requires current remote main and a clean local main. It governs this deployment workflow; it is not public protocol asset admission. Independent users can deploy through the public Factory. Operator transactions remain explicitly wallet-authorized; the backend does not receive the operator's private key.

The deployment receipt writer automatically extends existing XGR-hub assets to every newly fully receipt-deployed spoke (including the optional ExecutionGateway) in the same GitHub commit as its last infrastructure receipt. It records reciprocal *desired* routes and a synthetic representation, never deployed router/Gateway status. Admin then derives the pending wallet-signed route tasks from the updated main checkout; route IDs remain unknowable until both routers exist. CI rejects missing desired route expansion.\n\nUse workqueue/readiness, chain/asset preview → prepare → wallet submission → hash → reconcile, then receipt sync. If evidence reporting fails, reconcile the original transaction rather than deploying it twice. The API groups, state ownership and credential boundaries are specified in the full service reference. Current validator monitoring is Direct-BLS schema 2, not Merkle leaf/replica status.

`./manage.sh update` validates/publishes web and restarts admin; it does not restart validators, deploy contracts or control independent relayers. Review `./manage.sh help` for explicit installers. Tests: `node --test services/admin/*.test.mjs` from repo root. See the pinned source files and example units before installing optional services.

## Complete references

- [Service/API/configuration reference](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_Services.md)
- [Independent transfer and unsigned recovery](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_v3.4.0_Operations.md)
- [Protocol and permissionless route registration](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_Asset_Bridge.md)
- [Source map, validation and evidence limits](https://github.com/xgr-network/XGR/blob/main/docs/interchain/XGR_INTERCHAIN_Source_Map.md)
