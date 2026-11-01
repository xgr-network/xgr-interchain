# XITA Token Creator — XGR-funded deployment and Join

## Sequence

1. Applicant supplies verified project metadata, nonzero project wallet (Owner) and a PNG logo. Email verification is an application identity check, **not wallet possession proof**.
2. Confirmation queues an immutable, private project application. Neither the public web service nor its email confirmation handler can access the separate operator signing key.
3. The opt-in creator-operator timer verifies the audited, receipt-pinned XGRChain factory and its bytecode from two distinct XGR RPC endpoints; checks the explicit daily gas and deployment-count budgets, candidate symbol, existing XITA sponsor/fee wallet and chain ID 1643.
4. The operator signs exactly one factory `createTokenConfigured(name,symbol,supply,owner,type,decimals,lifetimeCap,permit,minter)` transaction. It persists the signed raw transaction/hash **before broadcast**. A failed RPC, reboot or unknown transaction status can only rebroadcast the same bytes, never silently submit a second mint. A revert requires manual incident review.
5. After an independently verified receipt, the worker checks the factory event, token runtime hash, token `owner()`, exact initial supply and balance, decimals, token type, lifetime minted/cap, minter and optional Permit flag at the creation block from both RPCs.
6. Only now does it generate a **profile-only Draft PR** from the verified XGRChain token address, with exactly **one original XGR representation and zero Interchain routes**. No CoinGecko ID is required. Accepting this profile must **not** deploy a router, create synthetic representations, authorize XITA transfers or approve any later Join request.
7. After the **separate profile-only PR** is merged and the site actually serves `xita.xgr.network/token/<slug>`, the low-privilege status notifier sends one second email with the profile URL, verified token contract and creation TX. A later **independent Interchain Join review** may add routes and wrapped representations, and its merge/deployment never gates initial XGRChain token catalog admission. Failed mail delivery is retried idempotently without creating another ERC-20.

## Bootstrap the isolated worker (no on-chain signing)

There are only two privileged XITA settings files for Creator onboarding:
`/etc/xita/join.env` (Join API, email, GitHub writer, and the public
`XITA_CREATOR_PUBLIC_ENABLED` switch) and the **existing**
`/etc/xita/interchain-fee.env` (the shared fee/sponsor wallet, Creator
signing enablement and hard deployment budgets). The Join HTTP service MUST
NOT inherit interchain-fee.env or its private key. The Creator oneshot
service loads both restricted files; a third `creator.env` is not used.

With `XITA_CREATOR_ENABLED` absent or set to `false`, run
`./manage.sh install-creator` from a clean, up-to-date main checkout.
It installs systemd units and durable sponsor-wallet nonce guards but
leaves the Creator timer **disabled**. No contract is deployed by installation.

The first controlled XGRChain Mainnet canary requires explicitly reviewed
limits in the **existing** root-only `/etc/xita/interchain-fee.env`.
Append them without replacing the existing wallet/DB credentials:

```ini
XITA_CREATOR_ENABLED=false
XITA_CREATOR_DAILY_LIMIT=1
XITA_CREATOR_DAILY_BUDGET_WEI=100000000000000
XITA_CREATOR_GAS_LIMIT_CAP=2000000
XITA_CREATOR_GAS_PRICE_CAP_WEI=50000000
XITA_CREATOR_BROADCAST_RPC=https://rpc.xgr.network
```

These figures are **illustrative trial ceilings**, not verified deployment
requirements. The maximum permitted price multiplied by the maximum allowed
gas limit yields 100000000000000 wei (0.0001 XGR) per transaction. The
worker fails closed if actual estimated gas or gas price is higher.

Ensure interchain-fee.env remains mode 0600 and owner root. Do not paste
the file's contents into GitHub issues, logs, chats or CI output.
Only after auditing gas estimates, signed nonce barriers, available
balance, canary ownership and deployment receipts should the operator set
`XITA_CREATOR_ENABLED=true`, rerun `./manage.sh install-creator` and
verify systemd status. Keep `XITA_CREATOR_PUBLIC_ENABLED=false` (or
unset) in join.env until the controlled canary and subsequent Draft PR
have succeeded. A previous `/etc/xita/creator.env` is ignored after the
updated service template has been installed; remove that obsolete file only
after verifying the running unit no longer references it.

## Restricted internal email canary (before enabling public registration)

Use the local canary harness for the **first** Mainnet test. The operator
prepares one private `XITA Canary` application using an **independent project
owner wallet**, an operator-controlled mailbox and an ordinary RGB/RGBA PNG.
The canary cannot create a transaction itself: it only sends the normal
verification mail and creates an application that remains `pending-email`
until the recipient follows the standard confirmation link.

**Prerequisites:** the factory is receipt-verified; the shared fee/sponsor
wallet has enough native XGR; Creator signing timer is **disabled**; and
`XITA_CREATOR_PUBLIC_ENABLED` stays unset/false in `join.env`.
The owner address must not be the fee/sponsor wallet. Never supply a private key.

From the repo root, substitute the actual PUBLIC owner address, the canary
mailbox and the local logo file path in the following command:

```sh
XITA_JOIN_PRIVATE_DIR=/var/lib/xita/join node services/onboarding/creator-canary-request.mjs \
  0xYOUR_SEPARATE_OWNER_ADDRESS canary@your-domain.example /path/to/logo.png
```

The generated `/var/lib/xita/join/canary-request.json` has mode 0600.
It contains personal contact data and must **not** be committed, pasted into
support chats or served by nginx. If the file already exists, the preparation
command refuses to overwrite it.

To preview the record (no email or signing), launch the one-shot Node
process with ONLY the existing Join service environment:

```sh
sudo systemd-run --quiet --wait --pipe --collect \
  -p User=xgradmin -p Group=xgradmin \
  -p WorkingDirectory=/home/xgradmin/repos/xgr-interchain \
  -p EnvironmentFile=/etc/xita/join.env \
  /usr/bin/node /home/xgradmin/repos/xgr-interchain/services/onboarding/creator-canary.mjs \
  /var/lib/xita/join/canary-request.json
```

After reviewing the output, repeat the same command with
`--send-confirmation` as the final argument to send **one real email**.
The harness temporarily overrides `XITA_CREATOR_PUBLIC_ENABLED` *only in
its loopback, single-request process*. It never changes the Join service,
its ENV files, the public registration switch, the signer timer or the
network. It refuses to start if the Creator timer is already active.
The recipient completes the normal `/createtoken/confirm#...` link. That
step will queue one immutable `deployment-queued` request; the token is
**not created** until the operator later explicitly enables the signer.

Before enabling signing, inspect the private queue using a **redacted**
status query (only IDs, phases and symbols), check the token owner and
daily gas caps, check the sponsor journal and pending nonce, and ensure
only the intended canary request is queued. The worker runs under the
shared wallet lock; never run `node creator-operator.mjs` manually in
parallel with sponsor services. After the confirmed canary is deployed,
verify receipt/runtime, owner and supply from both RPCs, then review the
generated Draft Join PR. Only after success is the public flag turned on.
No extra environment file or RPC credential is required.

## Production activation — explicit manual review gate

The factory and deployment worker are **not** automatically live after a code merge.
- Audit token/factory contracts and bytecode, then deploy the factory once with a reviewed operator transaction. Independently verify deployment Tx, runtime code and token-specific runtime code on XGR Mainnet.
- Add `config/creator/factory.json` via reviewed GitHub PR (never supplied by applicants), with fields below. It must be in `main` before the creator worker can sign.
- Reuse the existing XITA **gas sponsorship / fee claim wallet** from root-controlled `/etc/xita/interchain-fee.env`, with `XITA_INTERCHAIN_FEE_PRIVATE_KEY` and `XITA_INTERCHAIN_FEE_ADDRESS`. No second Creator private key or wallet exists. The Join HTTP service must never inherit that file. Creator limits and activation live in that same root-protected interchain-fee.env.
- Creator timer, fee claimant and sponsor all acquire `/run/lock/xita-fee-wallet.lock` prior to using the common wallet. Sponsor/claim services install a read-only private Creator journal gate and reject any unresolved Creator signed transaction even when RPC `pending` returns the same nonce as `latest`. Creator checks the durable sponsor SQL journal before signing. These barriers prevent irreversible same-nonce replacement on a disappearing mempool tx.
- In case of an unresolved signed Creator TX, sponsor payouts are safely paused until exact-tx reconciliation. Do not delete private journal evidence to force sponsorship.
- Set `XITA_CREATOR_ENABLED=true`, `XITA_CREATOR_DAILY_LIMIT`, `XITA_CREATOR_DAILY_BUDGET_WEI`, `XITA_CREATOR_GAS_LIMIT_CAP`, `XITA_CREATOR_GAS_PRICE_CAP_WEI`, `XITA_CREATOR_BROADCAST_RPC` as reviewed hard caps. Also provide `XITA_JOIN_PRIVATE_DIR` and GitHub writer credentials in worker service environment. The Join HTTP service must **not** read interchain-fee.env.
- Production operator must use mutually exclusive queue runner. One outstanding tx blocks any new signing. A crashed lock file or failed verification is fail-closed and requires operator diagnosis; never delete raw signed evidence as a means of retrying.
- E-mail verification and hard gas caps reduce obvious abuse but are not an anti-Sybil mechanism. Before public launch perform an abuse, funding and authorization review; consider ownership proof and per-project controls.

Example manifest schema (not an active deployed address):
```json
{
  "schemaVersion": 1,
  "kind": "xita-creator-factory-v1",
  "status": "receipt-verified",
  "chainId": 1643,
  "address": "0x...40 hex chars...",
  "runtimeCodeKeccak256": "0x...64 hex chars...",
  "deploymentTxHash": "0x...64 hex chars..."
}
```

The builder does not guess the factory's address. The admin review and independent deployment receipts must populate it. The public XITA Creator page remains a restricted preview until activation. No paid token deployments are performed by tests or GitHub CI.

## Standard token modes (immutable)

| Mode | Burning | Project minting | Lifetime cap |
| --- | --- | --- | --- |
| Fixed Supply | Disabled | Disabled | Initial Supply |
| Fixed Supply + Burnable | Holder / allowance burn | Disabled | Initial Supply |
| Controlled Mint + Burn | Holder / allowance burn | Only nominated Minter, rotatable by project Owner | Explicit lifetime issuance maximum |

- 6, 8 and 18 decimals are supported, default 18. Initial Supply and Cap are whole-token input values; the contract receives exact base units.
- Permit is optional EIP-2612; the contract's method rejects signatures if disabled.
- The configured lifetime maximum counts **all mints ever made**; burning does not restore capacity.
- Owner is the nominated project address. Only Owner can rotate the Minter. XGR operator is never Owner/Minter and receives no token balance.
- Multiple ERC20Permit token names result in different runtime hashes because EIP-712 contains token-specific immutables. Pin **the reviewed Factory bytecode** once, then verify each creator transaction's own `TokenConfigured.runtimeCodeHash` against its deployed ERC-20 runtime. There is no valid globally fixed child token codehash.
- A token's Owner or Minter may legitimately change after initial issuance. Receipt verification checks configuration at the source creation block; publishing a Join PR does not freeze the project's future token governance.


## Creator email stages

- First email: application email-verification link; no deployment or public profile is promised at this stage.
- After confirmation: the verified request is queued in private storage. **No second email is sent yet.**
- Second email: **Your XGR token profile is live**, with the canonical `https://xita.xgr.network/token/<slug>` link. The notifier requires a merged GitHub Join PR, the actual published web catalog, the original factory-verified contract address/owner/creation hash and public listing eligibility. The email is deduplicated by private application ID and safely retried if delivery fails.
- Profile-only CoinGecko refreshes similarly send one updated-profile link only after the *exact expected profile snapshot* is published. These mails never activate interchain routes.

## Token Creator Factory — Admin-UI deployment

After `./manage.sh update`, open `https://xita.xgr.network/admin/`,
choose **Chains & Onboarding**, and use the separate **Token Creator Factory**
panel below the Interchain chain infrastructure. The XITA Interchain
`factory` is a different contract and must not be used here.

The interface checks the current approved GitHub main, validates the no-argument
`XITAStarterTokenCreator` build from the sealed server artifact, verifies
XGRChain (chain ID 1643) against two independent RPCs, simulates the constructor,
quotes gas, and requests one MetaMask / EIP-1193 signature. No factory owner or
backend signer is required for this one-time deployment. Ordinary automated
ERC-20 issuance *afterwards* uses the existing XITA Sponsoring wallet.

The browser stores the returned hash in the server's durable factory journal.
If MetaMask or the browser is interrupted, use the **same original transaction
hash** in the recovery input; never press Deploy again. Receipt, canonical
block, contract address and exact runtime must match both RPCs with at least
two confirmations. Only then does the backend create a Draft PR containing
`config/creator/factory.json` (and no arbitrary browser-supplied paths).
Review and merge this PR before enabling the Creator worker.

The local journal remains authoritative over in-flight attempts; a GitHub
writer outage cannot cause a second deployment. The panel reports a pending
transaction instead of re-broadcasting. Factory activation remains a separate,
explicit systemd operation via `./manage.sh install-creator` after the
reviewed manifest appears on main.

## Public Creator entry point

The Join page exposes the **Create a token on XGRChain** choice only when
the Join HTTP service reports `creatorAvailable: true`. This requires the
reviewed Creator Factory manifest in `main` and a deliberate
`XITA_CREATOR_PUBLIC_ENABLED=true` in the **Join service** environment.
This flag does not enable the signer, grant private-key access to Join, or
replace the separate `./manage.sh install-creator` and
`XITA_CREATOR_ENABLED=true` operator activation. Set the public flag only
after checking the Creator timer, wallet nonce interlocks, funding caps,
email delivery, canary deployment and security/abuse review. Disable the
public flag immediately if the worker is paused.
