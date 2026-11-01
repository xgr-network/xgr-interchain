# XITA Token Creator — XGR-funded deployment and Join

## Sequence

1. Applicant supplies verified project metadata, nonzero project wallet (Owner) and a PNG logo. Email verification is an application identity check, **not wallet possession proof**.
2. Confirmation queues an immutable, private project application. Neither the public web service nor its email confirmation handler can access the separate operator signing key.
3. The opt-in creator-operator timer verifies the audited, receipt-pinned XGRChain factory and its bytecode from two distinct XGR RPC endpoints; checks the explicit daily gas and deployment-count budgets, candidate symbol, existing XITA sponsor/fee wallet and chain ID 1643.
4. The operator signs exactly one factory `createTokenConfigured(name,symbol,supply,owner,type,decimals,lifetimeCap,permit,minter)` transaction. It persists the signed raw transaction/hash **before broadcast**. A failed RPC, reboot or unknown transaction status can only rebroadcast the same bytes, never silently submit a second mint. A revert requires manual incident review.
5. After an independently verified receipt, the worker checks the factory event, token runtime hash, token `owner()`, exact initial supply and balance, decimals, token type, lifetime minted/cap, minter and optional Permit flag at the creation block from both RPCs.
6. Only now does it create a normal **Draft** XITA Join PR from the real XGRChain token address, including every available XGR hub↔spoke route. No CoinGecko ID is required for this XGRChain-native original. Standard operator review/merge and optional asset-route deployments remain separate from creation.
7. Once the reviewed proposal is **merged**, and the verified XGR original token profile is **actually published on xita.xgr.network/token/<slug>**, the low-privilege status notifier sends a **single second email** with the direct public profile URL. GitHub merge alone, token deployment alone or an unapproved routing draft must **not** trigger this profile URL mail. Failed mail delivery is retried idempotently without creating another ERC-20.

## Production activation — explicit manual review gate

The factory and deployment worker are **not** automatically live after a code merge.
- Audit token/factory contracts and bytecode, then deploy the factory once with a reviewed operator transaction. Independently verify deployment Tx, runtime code and token-specific runtime code on XGR Mainnet.
- Add `config/creator/factory.json` via reviewed GitHub PR (never supplied by applicants), with fields below. It must be in `main` before the creator worker can sign.
- Reuse the existing XITA **gas sponsorship / fee claim wallet** from root-controlled `/etc/xita/interchain-fee.env`, with `XITA_INTERCHAIN_FEE_PRIVATE_KEY` and `XITA_INTERCHAIN_FEE_ADDRESS`. No second Creator private key or wallet exists. The Join HTTP service must never inherit that file. The Creator `/etc/xita/creator.env` contains only opt-in budget/cost switches.
- Creator timer, fee claimant and sponsor all acquire `/run/lock/xita-fee-wallet.lock` prior to using the common wallet. Sponsor/claim services install a read-only private Creator journal gate and reject any unresolved Creator signed transaction even when RPC `pending` returns the same nonce as `latest`. Creator checks the durable sponsor SQL journal before signing. These barriers prevent irreversible same-nonce replacement on a disappearing mempool tx.
- In case of an unresolved signed Creator TX, sponsor payouts are safely paused until exact-tx reconciliation. Do not delete private journal evidence to force sponsorship.
- Set `XITA_CREATOR_ENABLED=true`, `XITA_CREATOR_DAILY_LIMIT`, `XITA_CREATOR_DAILY_BUDGET_WEI`, `XITA_CREATOR_GAS_LIMIT_CAP`, `XITA_CREATOR_GAS_PRICE_CAP_WEI`, `XITA_CREATOR_BROADCAST_RPC` as reviewed hard caps. Also provide `XITA_JOIN_PRIVATE_DIR` and GitHub writer credentials in worker service environment. The Join HTTP service must **not** use creator.env.
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
