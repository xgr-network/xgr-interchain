# XITA v3.1.5: derived deployment and public visibility

This document supersedes GitHub-controlled listing status. **No per-asset
`listing.json` exists.** No manual `accepted`, `deployed` or `public`
switch may control public discovery.

## Canonical sources and derived states

- **Merged GitHub config:** exactly `asset.json`, `metadata.json`,
  `routes.json` in `config/assets/<shard>/<SYMBOL>/`. The approved
  project is a **prospect**. A pending/unmerged Join PR creates no state.
- **Verified GitHub deployments:** Receipts plus router indexes for every
  configured representation and complete Gateway/FeeVault bindings for at
  least one real route instance in every configured direction mean
  **deployed**. Incomplete deployments remain `prospect`.
- **Indexer PostgreSQL:** a separately audited verifier provides **current
  net locked collateral**, independently valued in USD/USDC-equivalent.
  This excludes synthetic supply, unsolicited deposits, validator fees,
  duplicate physical escrows, nonfinalized events and unsafe token prices.

| Condition | Token page | Public directory, Tokens, search, Universe and rankings |
| --- | --- | --- |
| Only config (prospect) | No | No |
| Fully deployed, threshold unset | Yes (bridge subject to live safety) | No; visibility unknown |
| Fully deployed, collateral below threshold (accepted) | Yes | No |
| Fully deployed, collateral at or above threshold (public) | Yes | Yes |
| Verified collateral declines below threshold | Yes | No; returns to accepted |

`accepted` and `public` can alternate without GitHub commits. Unlocks
and independent price changes can both trigger reevaluation. Deployed
contracts and direct token URL persist after delisting.

**Threshold intentionally unset.** `config/publication.json` contains
`minimumLockedUsd: null` until an explicit later policy decision. Null
does not mean 0: it forbids automatic publication, regardless of collateral.
The maximum evidence age is separately configured
(`maxEvidenceAgeSeconds: 900`). No numeric USDC minimum is hardcoded.

## PostgreSQL and API contract

The read-only metrics service reads `xita_verified_asset_liquidity`,
created by `services/indexer/sql/001_verified_asset_liquidity.sql`.
Use a dedicated PostgreSQL user with **SELECT-only** privileges and set
`XITA_INDEXER_DATABASE_URL` outside the repository. No public write API
is exposed.

A separate chain finality verifier must create records proving asset ID,
complete source escrow coverage, net locks minus unlocks, receipt/codehash
and canonical finalized blocks, independently verified valuation and
immutable evidence digest. A row's Boolean verification flags alone do
**not** constitute adequate proof. Such a verifier is not yet implemented.

- `GET /api/xeta/v1/visibility`: derived per-asset visibility.
- `GET /api/xeta/v1/metrics/toplist`: existing metrics plus `visibility`.
- `GET /api/xeta/v1/systems/<chain>`: public eligible assets only.

No DB row, stale/future evidence, invalid digest, absent verified price,
unknown completeness, missing DB connection or null threshold yields
`unknown`, **not** `accepted` or a fabricated zero. The browser only
publishes a token when the indexer explicitly says public and the catalog
has a complete verified deployment. The XGRChain network hub always
remains in the Universe even if XGR token deployment is incomplete.

## Transfer readiness is a separate safety gate

Verified deployment receipts do not alone establish live BLS/Registry
activation. The bridge must independently verify both route directions,
contract identity, fee and security state and then use the v3.1.5 ABI.
The current standalone client contains a disabled bridge preview and no
production v3.1.5 send adapter. **This refactor does not enable transfers
without that adapter and real deployments.** An operational deployment
milestone must include the verified working transfer path.

## Checks and rollout

CI checks manifest consistency, Join generation, reversible visibility
transitions, token access, rankings and browser startup. The SQL migration
and real verifier are **not** applied to production by CI. Deployment
requires provisioning the database, independent verifier, read-only DB
credentials and live transfer adapter. Until then, publication is
fail-closed and the numeric threshold stays unset.
