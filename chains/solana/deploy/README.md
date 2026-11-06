# Solana deployment contract with the XITA Admin UI

The Admin UI will be the authoritative *workflow* for deployment, while each
Solana transaction must be signed by the connected Solana wallet. The backend
must never retain or use a Solana program-authority private key.

Planned UI stages: reviewed program build and ELF hash -> wallet connection
(Phantom/Solflare or Solana Wallet Standard) -> explicit per-program deploy
and upgrade-authority choice -> retain submitted signature before retry ->
`finalized` receipt and programdata checks from independent RPC operators ->
on-chain program ID/authority/code hash reconciliation -> GitHub evidence PR
and receipt -> enable next dependent component.

There is no valid `deploy` button until the program binaries, wallet sender,
transaction recovery and receipt verifier have passed tests. Never route a
Solana deployment through the existing EIP-1193/MetaMask transaction path.

Use the existing canonical asset sharding. New Solana token mints are
representations of the SAME assetId, not a new asset just because they use a
32-byte program/mint address. Only actual signed/verified program and route
deployments populate `deployments/`; planning records stay in `config/`.
