# Wallet-aware quoted native-gas funding (feature branch)

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
Before each one-shot grant, check original verified fee receipt, current
transfer stage, wallet identity, native principal exclusion, beneficiary,
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
