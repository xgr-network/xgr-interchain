# XITA / Solana native adapter

This directory owns ALL Solana-specific code, documentation and deployment
tooling in `xgr-interchain`. It does not fork XITA or replace the XGR hub.

## Directory ownership

| Location | Purpose |
| --- | --- |
| `chains/solana/programs/` | Rust/SVM programs with dedicated Direct-BLS, registry, route, escrow and fee logic |
| `chains/solana/deploy/` | Solana-program deployment and wallet-signed transaction/recovery tooling |
| `config/chains/solana/integration.json` | Reviewed **development** proposal, cluster/genesis/domain and candidate RPC witnesses |
| `deployments/chains/solana.json` | Create ONLY after finalized, independently verified program deployments |
| `deployments/receipts/solana/` | Per-program Solana signature, slot, program ID, ELF hash and authority proof |
| `config/assets/<shard>/<SYMBOL>/` | Existing XITA canonical asset catalog, not a Solana-specific duplicate |
| `deployments/assets/<shard>/<SYMBOL>/` | Actual cross-chain representations and route receipts by canonical asset ID |

There is intentionally **no** `config/chains/solana/chain.json` yet.
That file is the existing EVM-only active-chain admission trigger. Adding
Solana there before the adapters and programs are audited would cause EVM
JSON-RPC, Ethereum wallet and EIP-2537 deployment code to handle an SVM
network incorrectly. The integration proposal is validated independently
and displayed as a read-only Chain-Infrastruktur card alongside EVM chains.

## Security and compatibility

- The XGRChain remains the mandatory settlement hub (domain 1643).
- Keep existing EVM Factory, routes, ISM, signing bytes and assets unchanged.
- Add Solana-specific XGR-side Solidity contracts for full 32-byte program/
  account identities. Never truncate Solana public keys to 20-byte addresses.
- The Solana program must independently validate the exact XGR Direct-BLS
  quorum, current destination set, route identity, signed fee and replay state.
- Validators require finalized canonical source program evidence from at least
  two independent RPC operators plus deployed/verified program identity.
- A successful RPC call alone never authorizes minting, unlocking or signing.
- Solana mainnet is identified by its genesis hash, not an EVM chain ID.
  Domain 1399811149 is the messaging domain, not `eth_chainId`.
- No Solana transfers, program deployments or wallet actions are enabled on
  this development branch yet.

## Deployment prerequisites

See [deployment plan](deploy/README.md). Transaction ownership stays with the
user/operator wallet, receipts are immutable, and no program is marked deployed
from an unsigned draft, unknown authority or unverified program hash.

## Mandatory authority policy

Public Solana programs are **immutable**: no GmbH multisig, persistent
upgrade authority or close authority. The wrapped mint and vault use
only immutable-program PDAs; freeze authority is disabled; registration
is permissionless. See `deploy/README.md` and the enforced `authorityPolicy`
in `config/chains/solana/integration.json`.
