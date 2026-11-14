# F-19 – Sponsored quote admission and outstanding obligation review

This procedure applies to the **existing EVM XITA V1**, not Solana. It does
not authorize new wallet signatures, late gas gifts, nonce replacement, or
financial settlement. Paid promises remain enforceable regardless of the
current admission switch. Follow local incident policy and obtain an explicit
operator decision before attempting any remediation.

## Stop creating new sponsorship obligations, continue existing servicing

On the **managed quote signer** service, set:

```
XITA_INTERCHAIN_SPONSOR_ENABLED=true
XITA_INTERCHAIN_SPONSOR_ADMISSION_ENABLED=false
```

This prevents new wallet-aware sponsored quotes while retaining the existing
sponsor sweep and its immutable quote/grant journal. Do **not** use
`XITA_INTERCHAIN_SPONSOR_ENABLED=false` as an admission-only kill switch:
it also disables ongoing sweep servicing. Check the managed `/health`
response for `sponsorship.enabled=false` (new admission) and
`sponsorship.servicingExisting=true`.

Previously signed quotes remain valid. Disabling admission must not suppress
reporting of pending/reverted/overtaken commitments or change source/gateway
signatures.

## Operator escalation (manual, append-only)

1. Confirm that the canonical TX1, the signed quote, amount, grant stage and
   destination match. Use the existing read-only
   `sponsor-obligation-audit.mjs` against the restricted status database.
2. For each independently recorded overtaken obligation, inspect the grant
   journal and exact prepared raw transaction; determine whether the grant
   was confirmed, pending, or never broadcast. Never fabricate a success
   status from a generic RPC receipt.
3. Review the matching `grant_key` from the **private** operator database.
   Do not place user wallet addresses or sensitive transaction evidence in Git.
4. After the reviewed migration `017_sponsor_obligation_reviews.sql` is
   installed, use a separate PostgreSQL login restricted to role
   `xita_sponsor_reviewer`, and deliberately run:

```sh
XITA_SPONSOR_REVIEW_DATABASE_URL=<restricted-reviewer-db-url> \
XITA_INTERCHAIN_FEE_ADDRESS=<configured-public-sponsor-address> \
node services/managed-relay/sponsor-obligation-review.mjs \
  '<verified-grant-key>' escalated '<sha256-of-private-evidence>'
```

Supported outcomes are `acknowledged`, `escalated`,
`customer-contacted`, and `evidence-requested`. These are workflow
states **only**, never a declaration of payment, waiver, resolution or
on-chain finality. No automatic refund is provided.

The SQL uses the immutable overtaken commitment identity, sponsor address,
and verified absence of an already-confirmed matching grant. Only INSERT and
SELECT are granted to the reviewer identity; the grant and payment tables
remain outside its write permissions. Each action has a database actor and
append-only timestamp; the application refuses an invalid or now-fulfilled
obligation. The schema does not grant write permissions to public API or
ordinary status-reader roles.

## Remaining release gate

Document and approve who owns follow-up, evidence storage/retention, customer
communication, and any separately authorized compensation procedure. Record
the actual paid-obligation outcome independently of this escalation history.
The existence of a reviewer entry does **not** close F-19 or establish
unrestricted unattended sponsorship readiness. Re-run restricted PostgreSQL
and quote-admission regression tests before activation.
