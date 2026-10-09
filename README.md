# XGR Interchain — XITA v3.1.5

A new, publicly accessible multichain bridge protocol with XGRChain as the
mandatory hub. The source project is a **development version**; no new
chain contracts or token routes should be deployed to production until
its complete security and interchain acceptance tests have passed.

## Fixed routing topology

Every **directed** transfer has **XGRChain chain ID 1643 AND domain 1643**
as exactly one endpoint. Base -> Polygon cannot be registered as a direct
route. It is always Base -> XGRChain -> Polygon: two independently verified
hops, two directed route IDs and two source-chain fees.

## Permissionless route registration

**One route identity scheme for every asset:** native XGR, wrapped XGR,
and all ERC20 integrations. The Asset ID derives from the original
chain and original token, not from branding or a token-list administrator.
The Route ID additionally includes source and destination chain/domain and
both Router addresses. Parallel routes for the same Asset ID are allowed.

Anybody may deploy an independently isolated native/collateral/synthetic
router and pair it with its remote router using the public Factory.
The Factory creates the Gateway and records a pending Registry entry.
That entry remains unusable until factual, reciprocal counterparty safety
verification passes the validator BLS security gate. This verification
does not grant exclusive project approval or route governance.

The source-chain native validator fee is set once for ALL routes on the
physical source chain, using fee-specific validator quorum.
Each route-specific Gateway creates a FeeVault: claims are pulled by
validators, rather than distributed in micro-transactions.

See [XITA v3.1.5 protocol specification](docs/XITA_SPEC_V315.md) for
precise IDs, registered fields, signing format and open security gates.

## Repository

- `contracts/`: Registry, Factory, Gateway, Merkle/ISM BLS verifier, native,
  collateral and synthetic token routers, FeeVault.
- `script/`: deployment of the Validator Registry, ISM and Factory.
  Token routers and new route Gateways are deployed through the Factory,
  without owner-operated approval scripts.
- `config/chains/`, `config/assets/`: public chain/asset manifests.
  Listings are not proof of origin or that a route is active.
- `runtime/`: generic Hyperlane native relayer orchestration and recovery.
- `apps/web/`: independent XITA token-first frontend with the bridge
  operation on the token's page, not a separate bridge product.
- `services/indexer/`: route and transaction-indexing scaffold.
- `services/admin/`: read-only operations and deployment planning.

The XGR.Network website remains in the separate `XGR_Web` repository.
The PoS consensus client is not changed to support the new route identity.

## Tests

```sh
forge test -vvv
node tools/validate-manifests.mjs
node --test tools/validate-manifests.test.mjs
node tools/check-xeta-clean.mjs
bash -n runtime/manage-relayers.sh
(cd runtime/native-relayer && npm test)
```

Unit tests alone do **not** prove cross-chain transfer safety. Real
validator remote-state checks, genuine BLS proof creation, Base <-> XGRChain
round trips, unexpected token behavior, outages/replays and recovery must
be verified before deployment.
