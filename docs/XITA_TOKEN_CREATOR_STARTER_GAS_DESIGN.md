# XITA token creation, starter gas and Join — staged design

Status: **prototype only** (not deployed; no sponsorship enabled).

## Product boundary

- Private URL: `https://xita.xgr.network/createtoken`, deliberately absent from the navigation.
- Original chain XGRChain (chain ID 1643). Creation uses only the wallet's explicit MetaMask transaction. The web service does not custody tokens or private keys.
- The default v1 template is a standard OpenZeppelin ERC-20 with immutable name, uppercase symbol, 18 decimals and exactly one initial mint to the creator's wallet. No owner, mint, burn authority, freeze, pause, blacklist, upgrade, proxy, transfer tax or service fee.
- A successful TokenCreated receipt establishes *creation*, not XITA route eligibility or publication. The GmbH must never imply automatic CoinGecko listing.

## Verified factory activation gate

1. Audit `contracts/XITAStarterTokenCreator.sol` and its pinned OpenZeppelin import closure; check runtime bytecode and creation gas on XGR Mainnet (no optimistic estimation).
2. Deploy with explicit operator-signed transaction using a dedicated, separately reviewed Admin flow. Capture canonical receipt, deployed contract address, chain ID 1643, runtime code hash and deployer.
3. Check two independent XGR node views or local chain verification, as applicable, and pin receipt and code hash in a GitHub-backed creator manifest.
4. Only then set `CREATOR_STATUS.available=true` in a follow-up release. The browser must check `eth_chainId=0x66b`, `eth_getCode` against the pinned hash, wallet balance, `eth_call` simulation and `eth_estimateGas`; fail closed when ambiguous.
5. Serialize an immutable wallet intent before MetaMask prompts, persist the hash once the provider reports submission, reconcile replaced/pending/confirmed transaction receipts before showing another sign action.
6. Parse only the factory's TokenCreated event from the canonical receipt; verify `creator`, token address, factory address, immutable symbol and full supply using chain RPC. A generic transaction success is insufficient.

## Optional starter XGR — separate service, not bridge gas sponsor

- **Zero XGR up-front hurdle** is the goal, but gas is not literally free. XGR funds an opt-in microgrant strictly bounded to *one* standard token-creation transaction after a validated request.
- No bridge/XITA managed quote/sponsor commitment may be reused. The creator service has its own budget, ledger, accounting and risk limits. It cannot sign a user's create transaction.
- One normalized wallet-ownership challenge (EIP-712; chain ID 1643, creator factory, wallet, nonce, expiry) must be checked by the sponsor. The server must reserve the nonce and a wallet grant *atomically* before sending sponsor funds.
- Per-wallet one-time limit, per-contact verification, per-IP rate limiting, daily total and per-period budget, independently verified wallet and source chain, short-lived intent, explicit replay prevention and a reconciliation job are required. Email/IP alone do not prevent Sybil abuse; maintain a tightly bounded budget and abuse pause switch.
- Payout is `min(verified estimate + safety reserve, configured per-request cap)`. On recipient failure, the granted amount is not treated as unused; a reconcilable recipient transaction hash remains in durable storage.
- Sponsor never receives creator tokens, ERC-20 approvals or unlimited allowances, and receives no refund automatically. Do not request any private key or seed phrase.

## Join / post-creation lifecycle

The current Join application is for a CoinGecko-indexed *external-chain* original ERC-20, with confirmed email and a distinct audited GitHub PR workflow. A newly created XGRChain-original token cannot pass those rules automatically.

Use a separate, opt-in creator-to-Join bridge:

1. Canonical TokenCreated event and subsequent read-only `totalSupply`, `symbol` and `balanceOf` verification produce a locked creator receipt (no hidden review by the UI).
2. Prefill token name, symbol, chain 1643, exact token address and creator wallet in a **draft**; prompt user for contact details, project description and approval for email.
3. Prove wallet control and confirm email; protect private contact details outside public PRs, just like existing Join.
4. Create an `origin-xgrchain` pending-review application; no bypass of token review, and no fabricated CoinGecko ID.
5. Operator independently accepts the asset and configures routes only toward *deployed* spokes; XGRChain remains the hub. Deployment is funded subject to existing Alliance terms, verified by receipts.
6. Public discovery follows the standard indexer/TVL rules; creation or application alone never causes listing.

## Launch and test gates

- Focused Foundry tests: exact minted supply, creator isolation, nonpayability, no admin mint, negative input, event identity, cap.
- UI tests: `/createtoken` direct-only route, no navbar entry, valid Unicode/HTML escaping, integer precision and disabled wallet actions without receipt.
- Starter-gas tests (separate PR): concurrent idempotency, wallet challenge replay, daily budget exhaustion, chain mismatch, sponsor nonce contention, fund insufficiency, RPC split evidence, wallet receipt reconciliation and service pause.
- Integration tests before launch: original token deployment and gas microgrant on XGR testnet, wallet switch, rejected signature, reverted create, grant retry, receipt finality, accurate Join draft, duplicate application protection.
- No automatic production deployment, factory activation, sponsor grants or Join submission occurs in this prototype PR.

The successful Polygon-removal and Optimism configuration are independent and must not change this security gate.
