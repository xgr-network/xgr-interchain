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
| Fully deployed, threshold `null` | Yes | Yes, independent of TVL evidence |
| Fully deployed, verified collateral at or below numeric threshold | Yes | No |
| Fully deployed, verified collateral strictly greater than numeric threshold | Yes | Yes |
| Verified collateral declines below threshold | Yes | No; returns to accepted |

`accepted` and `public` can alternate without GitHub commits. Unlocks
and independent price changes can both trigger reevaluation. Deployed
contracts and direct token URL persist after delisting.

**Threshold semantics.** `minimumLockedUsd: null` publishes every sufficiently
receipt-backed deployed token, independent of TVL. `0` publishes only if
verified net locked TVL is strictly greater than $0; `1` requires strictly
more than $1, etc. The comparison is `>` in integer USD units (8 decimals).
Missing, stale or incomplete verification NEVER counts as a zero-valued
verified proof and cannot qualify for numeric thresholds.
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

No DB row, stale/future evidence, invalid digest, absent verified price or
unknown completeness yields `unknown` under a NUMERIC threshold, never an
invented zero. The `null` policy is intentionally independent of DB evidence. The browser uses its validated catalog to publish receipt-backed deployments
when the policy is `null`; for numeric thresholds it also requires the
indexer's matching fresh `public` evidence. Transfer readiness is independent
of publication and TVL thresholds. The XGRChain network hub always
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
