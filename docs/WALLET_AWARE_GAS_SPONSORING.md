# Wallet-aware quoted native-gas funding

## Invariant
This pricing model is NOT live until signer, durable quote commitments, payment
indexer, sponsor worker and wallet display share one versioned commitment.
A sponsor worker must NEVER derive a new payout from a later wallet balance or
assume that a successful wallet transaction means sponsorship happened.

## Signer
Before the customer pays the first fee, fetch the account's independently
verified native balances on ALL destination chains, using allowlisted RPCs.
The quote cost contains a positive base service fee plus ONLY the downstream
gas/validator-fee shortfall with a 30% buffer applied to gas (not principal).
Do not double-count an XGR balance across mailbox+onward steps.
The direct user-paid source TX gas and approval are excluded.
If balance, gas price, chain ID or reserve capacity cannot be verified, refuse
a personalized quote; never silently return a higher or fictitiously subsidized fee.

## Commitment
Persist immutable, atomic (payer, source chain, gateway adapter,
EIP-712 nonce, fee amount, quoted route, token amount, recipient,
grant-chain, grant-stage, promised native amount, quote expiry).
The signed quote remains unchanged on chain; the same exact quote nonce
appears in InterchainFeeCharged. Only a finalized fee event with matching
payer, source chain, adapter, nonce, amount and route activates a commitment.
A quote that expires without source payment cannot receive a grant.
The initial source fee is never refunded and must not be charged twice.

## Worker
The worker reads ONLY activated immutable promises.
For every one-shot grant after finalized TX1 and before TX2, check the original
verified fee receipt, immutable quote stage, wallet identity, native principal exclusion, beneficiary,
per-chain reserve and daily cap, and exact signed commitment.
Reserve a unique grant key BEFORE broadcasting. Never recompute the promised
amount from current wallet balances. Reconcile against native chain receipts.
If prices rise beyond the committed 30% buffer or wallet sends funds elsewhere,
halt safely and show the remaining wallet shortfall rather than paying an
unquoted unlimited amount or automatically charging again.

## UI and operational readiness
The public preview must display the same wallet-specific quote as the signer,
including clear distinction between already-held native currency and sponsored
funding. Do not show zero downstream gas unless the quote and grant capacity
are backed by a real commitment. No modal transfer buttons. Wallet TX requires
a deliberate open-modal gesture; backend monitoring continues independently.
Preserve the original EIP-712 schema and XITAExecutionGateway contracts.

## Rollout criteria
1. Database migration and least-privilege role grants verified.
2. Exact quote-commitment / on-chain nonce integration tests.
3. Quote-service / worker accounting parity and 30%-buffer tests.
4. Multi-hop XGRChain balance shared between delivery, onward gas and fee.
5. Both transfer directions live tested, including zero-gas wallet, partial
   gas wallet, sufficient gas wallet, gas-price spike, cancel and restart.
6. Flag disabled by default until validation and administrative opt-in.

## Runtime implementation

- `XITA_INTERCHAIN_SPONSOR_ENABLED` is the sole existing sponsor switch. When enabled, wallet-aware quote pricing and immutable grants apply. No secondary flag is supported.
- The positive platform base cost is derived from the original full-journey cost using the existing 10% margin policy; the signed fee adds only the wallet gas shortfall. No additional fee ENV is required.
- Only the allowlisted signer-side chain RPC supplies payer gas balances;
  client-provided balances are rejected. The signer binds payer to recipient.
- `./manage.sh install-wallet-aware-sponsor-db` installs an additive SQL
  schema. `./manage.sh install-interchain-fee` installs the same schema and
  the persistent event listener. Neither enables grants by itself.
- `xita_sponsor_quote_intents` and `xita_sponsor_quote_commitments` are
  INSERT-only for the quote writer. The quote event and evidence are committed
  in one PostgreSQL transaction *before* the signed quote is returned.
- The worker joins commitments only to an indexed paid source transaction and
  separately rechecks the canonical receipt, caller, route, EIP-712 nonce, fee,
  amount and beneficiary before a wallet grant. Recipient and grant amounts
  cannot be supplied through the public API.
- Per-chain lock names are shared across the quote writer and grant reserve.
  Both apply strict 24-hour exposure caps; accepted reservations also consume
  sponsor nonce and daily budget before any transaction is broadcast.
- The indexer's INSERT/delivery UPDATE causes a coalesced post-commit
  PostgreSQL notification. Listener starts the **existing** one-shot sponsor
  under the same `/run/lock/xita-fee-wallet.lock`; the five-minute timer is
  still a safety fallback.

## Deployment checklist

1. Run all three GitHub workflows successfully (Validate, Direct BLS Security,
   Native Interchain Contracts). Confirm the real browser smoke test.
2. Run the additive DB migration as the operator, then verify tables,
   exact role permissions and notification trigger.
3. Verify sufficient XGR/ETH/POL native gas reserves
   in the GmbH sponsor wallet on **each** relevant chain.
4. Verify that a zero-gas, partial-gas and fully-funded wallet receive
   different signed service fees **without** any client-supplied gas amount.
5. Prove quote nonce, source-chain fee event, parent message ID and grant
   commitment join one-to-one. Reject altered nonce, amount, route, chain,
   recipient, fee, sponsor address, or already-used grant key.
6. Confirm each native grant receipt before labeling the stage green;
   UI must never show overall Verified when just one of several grants lands.
7. Execute both directions on a limited mainnet test amount, including a
   deliberately delayed proof, an interrupted browser session, and changed
   wallet balance after quoting.
8. The existing `XITA_INTERCHAIN_SPONSOR_ENABLED=true` enables new quotes with immutable grants after the database migration. If disabled, no new grants are issued; previously paid transfer commitments require operator reconciliation before disabling the worker.

## Critical limitations

EIP-712 authorizes the initial fee quote; a native gas grant is a separate
irreversible wallet payment. A 30% gas buffer cannot mathematically guarantee
completion when gas spikes beyond 30%, when native token principal is missing,
or when the customer spends native funds after quote time. Never auto-pay an
unquoted top-up or take custody of locked tokens. Exceeding a risk budget
blocks new quotes or creates a visible held-for-review transfer.

## Upfront sponsorship barrier (2026-10-25)

TX1 is the source-chain XITAExecutionGateway.execute transaction (atomic
Gateway lock/burn plus service fee). Once the independently verified TX1 fee
receipt is indexed, the worker pays **all** positive, immutable quote-locked
native gas grants on the respective chains, whether or not the second-hop
Gateway or final Mailbox has executed. Each grant retains the unique original
parent + stage key, wallet nonce reservation, and final receipt reconciliation.
No second sponsorship computation or grant is initiated after TX2 or TX3.
The wallet modal waits for the complete grant set to be journal-confirmed
before allowing any destination Mailbox wallet TX. If sponsorship is absent
from the original quote, no grant is required. Missing/unknown status fails
closed and can be resumed from the original source transaction.
