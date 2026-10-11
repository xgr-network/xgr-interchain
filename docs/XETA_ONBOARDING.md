# XETA: free partner onboarding
## Entry paths
Developers may open a GitHub PR with config/assets/<shard>/<SYMBOL>/asset.json, metadata.json and routes.json. Non-developers may complete a public website form that generates the same declarative proposal / review record. A GitHub account is not mandatory to apply.

## Application requirements
Collect token contract address and canonical network, domain, decimals, symbol, verified source code/proxy identity, supported target networks, contact, and chain-bound cryptographic proof of authorization by the project's wallet/multisig. Never request private keys. Validate ERC20 transfer amount invariants, blacklist/pausability, mint authority, approvals, and supply accounting. Exclude fee-on-transfer and rebasing assets until special adapters are audited. Review all changes before deploying. Routes are registered by the permissionless on-chain Factory; BLS validator quorum authenticates messages, not route admission.

## Economic and inactivity policy
Application, first review, integration and partner listing are free. On-chain source-native ILN validator fees remain positive, with optional separately funded UI-led refund. Regular transaction gas is payable by users/operators; sponsorship is optional and capped. Inactivity does NOT disable an on-chain route. Remove unused assets from featured website placements/default discovery if warranted, while keeping deep links and redemption available.

## Deployment
Onboard canonical token plus routes XGRChain <-> each supported spoke. Route identities and fee governance on each source chain remain separate. Maintain sparse verified deployment evidence and independent cryptographic route proofs; a PR merge is not proof of deployment. Never offer external-to-external direct routes or imply a sponsor already exists.

## Derived directory eligibility
Merged Join configuration creates a prospect, no status file. Complete
verified contracts permit its direct token page. Only a fully deployed
asset with sufficient independently verified net locked USD-equivalent
collateral can appear in public discovery; unlocking below the threshold
hides it without disabling its deployed route. The threshold stays null
(unconfigured) until agreed. See
[XITA_PUBLICATION_POLICY.md](./XITA_PUBLICATION_POLICY.md).
