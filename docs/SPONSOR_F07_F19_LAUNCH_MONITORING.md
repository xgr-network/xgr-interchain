# XITA sponsorship: conservative F-07 / F-19 launch monitoring

This operator-only diagnostic reports **already indexed** paid sponsorship
obligations and suspicious grant journal states. It does not resolve them.

## Invariants

- No additional end-user wallet transaction or signature.
- No mutation of the sponsor nonce, irreversible gas payout, signer, quote format,
  routing, transfer flow, smart contracts, or Join/onboarding.
- No automatic retry or rebroadcast. Never clear a nonce reservation to
  regain budget capacity without independently verified evidence.
- This diagnostic is not an audit finding closure: **F-07 and F-19 remain OPEN**.

## Run on the operator host (no application restart)

The existing `/etc/xita/interchain-fee.env` includes the **read-only**
`XITA_SPONSOR_STATUS_DATABASE_URL` and public `XITA_INTERCHAIN_FEE_ADDRESS`.
Run the audit in a transient service so the root-owned env file is not
copied into a command line, shell history, or web logs:

```sh
sudo systemd-run --wait --pipe --collect --unit=xita-sponsor-obligation-audit \
  -p User=xgradmin \
  -p WorkingDirectory=/home/xgradmin/repos/xgr-interchain \
  -p EnvironmentFile=/etc/xita/interchain-fee.env \
  /usr/bin/node services/managed-relay/sponsor-obligation-audit.mjs
```

The code requests a PostgreSQL read-only session even if the wrong DB role
was configured. It returns aggregate issue counts only, never account
addresses, message IDs, transaction bytes, or wallet keys.
Exit `0`: no issues *older than the grace windows* were found.
Exit `2`: at least one alert group. Exit `1`: diagnostic failure.
An empty result is not proof that all grants are fulfilled.

## Interpretation and response

- `F-07:reserved-without-tx-hash`: operator review before any nonce reuse.
- `F-19:delivered-before-grant-confirmed`: source delivery progressed but
  a prior paid commitment lacks a verified grant; do **not** create a late
  automatic payout or call it 'confirmed'. Operator must reconcile.
- `F-19:paid-commitment-without-grant`: a finalized indexed fee exists,
  but the associated quote-locked grant was not journaled after 5 minutes.
- `submitted-not-yet-finalized`: could be normal RPC/finality delay;
  inspect the exact original transaction before taking any action.

## Operational stop procedure

To stop **new** promises, stop accepting new signed quotes at the signer
rather than immediately disabling the sponsor worker. Keep the existing
worker/timer and immutable paid commitments available for reconciliation.
The current `XITA_INTERCHAIN_SPONSOR_ENABLED=false` operator switch also
stops the existing worker. It must not be mistaken for settlement of
previously paid grants. An emergency security stop is different; in that
case preserve the journal and audit unresolved obligations explicitly.

F-07's complete remediation requires signing and journaling exact bytes
atomically *before* broadcasting and carefully tested same-bytes recovery.
F-19's complete remediation requires an explicit outcome/settlement policy
for externally completed deliveries. Neither complex change is activated
by this conservative diagnostic.
