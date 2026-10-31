# XITA Token Creator — XGR-funded deployment and Join

## Sequence

1. Applicant supplies verified project metadata, nonzero project wallet (Owner) and a PNG logo. Email verification is an application identity check, **not wallet possession proof**.
2. Confirmation queues an immutable, private project application. Neither the public web service nor its email confirmation handler can access the separate operator signing key.
3. The opt-in creator-operator timer verifies the audited, receipt-pinned XGRChain factory and its bytecode from two distinct XGR RPC endpoints; checks the explicit daily gas and deployment-count budgets, candidate symbol, dedicated funding wallet and chain ID 1643.
4. The operator signs exactly one factory `createToken(name,symbol,supply,ownerAddress)` transaction. It persists the signed raw transaction/hash **before broadcast**. A failed RPC, reboot or unknown transaction status can only rebroadcast the same bytes, never silently submit a second mint. A revert requires manual incident review.
5. After an independently verified receipt, the worker checks the factory event, token runtime hash, token `owner()`, exact supply, owner balance and token parameters on both RPCs.
6. Only now does it create a normal **Draft** XITA Join PR from the real XGRChain token address, including every available XGR hub↔spoke route. No CoinGecko ID is required for this XGRChain-native original. Standard operator review/merge and optional asset-route deployments remain separate from creation.

## Production activation — explicit manual review gate

The factory and deployment worker are **not** automatically live after a code merge.
- Audit token/factory contracts and bytecode, then deploy the factory once with a reviewed operator transaction. Independently verify deployment Tx, runtime code and token-template runtime code on XGR Mainnet.
- Add `config/creator/factory.json` via reviewed GitHub PR (never supplied by applicants), with fields below. It must be in `main` before the creator worker can sign.
- Install a dedicated, minimally funded operator wallet (not a validator/service/treasury key); store its 32-byte private key only in root-owned `/etc/xita/creator.env` (mode 0600). NEVER put it in Join HTTP environment, Git, logs or browsers.
- Set `XITA_CREATOR_ENABLED=true`, `XITA_CREATOR_OPERATOR_KEY`, `XITA_CREATOR_OPERATOR_ADDRESS`, `XITA_CREATOR_DAILY_LIMIT`, `XITA_CREATOR_DAILY_BUDGET_WEI`, `XITA_CREATOR_GAS_LIMIT_CAP`, `XITA_CREATOR_GAS_PRICE_CAP_WEI`, `XITA_CREATOR_BROADCAST_RPC` as reviewed hard caps. Also provide `XITA_JOIN_PRIVATE_DIR` and GitHub writer credentials in worker service environment. The Join HTTP service must **not** use creator.env.
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
  "tokenRuntimeCodeKeccak256": "0x...64 hex chars...",
  "deploymentTxHash": "0x...64 hex chars..."
}
```

The builder does not guess the factory's address. The admin review and independent deployment receipts must populate it. The public XITA Creator page remains a restricted preview until activation. No paid token deployments are performed by tests or GitHub CI.
