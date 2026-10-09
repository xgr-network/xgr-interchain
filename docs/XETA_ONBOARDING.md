# XETA: free partner onboarding
## Entry paths
Developers may open a GitHub PR with config/assets/ASSET/asset.json, routes.json and mainnet.json. Non-developers may complete a public website form that generates the same declarative proposal / review record. A GitHub account is not mandatory to apply.

## Application requirements
Collect token contract address and canonical network, domain, decimals, symbol, verified source code/proxy identity, supported target networks, contact, and chain-bound cryptographic proof of authorization by the project's wallet/multisig. Never request private keys. Validate ERC20 transfer amount invariants, blacklist/pausability, mint authority, approvals, and supply accounting. Exclude fee-on-transfer and rebasing assets until special adapters are audited. Review all changes before deploying. Only validator governance may activate routes.

## Economic and inactivity policy
Application, first review, integration and partner listing are free. On-chain source-native ILN validator fees remain positive, with optional separately funded UI-led refund. Regular transaction gas is payable by users/operators; sponsorship is optional and capped. Inactivity does NOT disable an on-chain route. Remove unused assets from featured website placements/default discovery if warranted, while keeping deep links and redemption available.

## Deployment
Onboard canonical token plus routes XGRChain <-> each supported spoke. Route identities and fee governance on each source chain remain separate. Maintain mainnet inventory and cryptographic route evidence; a PR merge is not proof of deployment. Never offer external-to-external direct routes or imply a sponsor already exists.
