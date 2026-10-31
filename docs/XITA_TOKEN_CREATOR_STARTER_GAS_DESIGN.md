# XITA Token Creator — XGR-funded ERC-20 creation and XITA Join
Status: **code review / deployment inactive**. Supersedes the initial user-gas and starter-microgrant prototype.

## Product intent
- Private preview URL: https://xita.xgr.network/createtoken, deliberately not linked from the main navigation.
- Applicant enters fixed token name, uppercase symbol, integer initial supply (18 decimals), **separate nonzero project owner wallet**, HTTPS project URL, descriptions, categories, PNG logo, contact email, and acknowledgement.
- After email confirmation, store an immutable owner-bound pending creator request privately; a separate, explicitly enabled XGR signer deploys the standard ERC-20 on **XGRChain ID 1643**, paying gas with its own dedicated funded wallet.
- The project's specified owner receives **100% of the initial supply** and the ERC-20 Ownable `owner()` role in its constructor. Neither XGR operator nor factory obtains an ERC-20 balance or special token controls. The owner may later transfer or renounce ownership. There is **no privileged mint, tax, upgrade, freeze or blacklist**.
- Once the actual factory receipt and token runtime are verified from two XGR RPC nodes, generate a normal XITA **Draft Join PR** containing all main-approved, deployed spoke chains and both directions through the XGR hub. A creator-origin XGR token requires **no CoinGecko ID**. The PR does not bypass human Join review, route deployment or public listing rules.
- Logo publication is gated by email verification; private contacts are never sent to GitHub.

## Deployment separation
The public HTTP Join/Creator service never receives a private signing key. The separate opt-in `creator-operator.mjs` worker alone can access the deployment wallet. It requires an audited, receipt-pinned Creator Factory in `config/creator/factory.json` on GitHub main, runtime code hashes, validated chain ID and identity from two XGR RPC nodes, explicit per-transaction gas and daily funds/count caps.
The deployment request is **signed and the signed raw transaction is committed to owner-only storage before broadcast**. If a process crashes or RPC broadcasting becomes uncertain, the worker may rebroadcast ONLY the same signed transaction and nonce. A revert or identity mismatch requires operator investigation; never silently create a second token.
Once the source receipt and `owner(), totalSupply(), balanceOf(owner), name(), symbol(), decimals()` match the immutable application and pinned audited token runtime, the worker records an on-chain proof and publishes an idempotent GitHub Draft PR. Any GitHub outage is retried without redeploying the token.

## Activation / remaining gates
1. Audit the revised Ownable ERC-20 and factory creation code, its pinned OpenZeppelin 4.9.3 closure and realistic gas requirements.
2. Deploy the factory once with an explicitly reviewed transaction, verify its on-chain bytecode, transaction receipt, operator address, and emitted token implementation/runtime hash. Add reviewed `config/creator/factory.json` to main.
3. Configure the dedicated minimally funded XGR operator wallet, root-only `/etc/xita/creator.env`, hard limits and separated systemd timer. Install deliberately with `./manage.sh install-creator` after reviewed factory deployment.
4. Before making /createtoken publicly discoverable, address Sybil abuse and unauthorized third-party project submissions. Email verification is **not** cryptographic wallet-ownership verification. Confirm ownership/address consent and token-issuer disclosures.
5. Test on a non-production network and then a tightly bounded Mainnet canary; verify constructor ownership, full supply, duplicate suppression, restart recovery, and standard Join PR validation.
6. Creator ERC-20 deployed ≠ XITA routes deployed ≠ publicly listed. Keep these stages visible in UI and notifications.

Read `config/creator/README.md` for full configuration and operator constraints.
