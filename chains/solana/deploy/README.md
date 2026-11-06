# Solana immutable deployment contract with the XITA Admin UI

## Non-negotiable permissionless authority policy

Deployment funding or providing an optional Admin UI must confer **no lasting
upgrade, close, pause, freeze, custody, mint or fee-setting privilege** on
XGR.Network GmbH or any other single operator.

The deployed SVM program must have **upgrade authority = None** before ANY
public route can be activated. No company, founder or operator multisig may
hold a permanent upgrade or program-close key. Under Solana's upgradeable
loader, revoking upgrade authority makes the program immutable and prevents
program closure.

The deployment flow is: independently reviewed and reproducible Rust/ELF
build -> exact expected Program ID/code hash -> wallet-paid deployment ->
permanently revoke the upgrade authority (CLI may support deploy `--final`)
-> verify `Authority: none` and programdata/ELF identity from independent
RPC operators -> publish signed/finalized deployment evidence -> allow
permissionless route initialization. The UI MUST NOT enable transfer/mint
routes before revocation and independent verification. If deployment and
revocation are not atomic, the intermediate program is never treated as an
active protocol endpoint.

Solana CLI verification example:

```bash
solana program show <PROGRAM_ID>
# Must show "Authority: none" before mainnet route admission
```

**Token controls are different from program upgrade authority.** A wrapped
SPL mint must retain a mint authority owned by a program-derived address
(PDA) controlled only by immutable route logic; otherwise the bridge could
never mint upon a verified inbound message. It must never point to a GmbH,
admin wallet or developer key. Disable the wrapped mint's freeze authority.
Vault tokens are program-PDA controlled, never an operator key. The
destination program checks exact quorum, route, source custody and replay
proofs before using the PDA. Original external tokens keep their original
issuer permissions; XITA must not acquire those permissions.

Route creation remains permissionless. No company-controlled pause, forced
migration, allowlist, blacklist, manual approval or unilateral protocol
fee setter may be introduced. If a vulnerability later requires new code,
deploy a **new immutable Program ID**; existing deployments are not
silently upgraded or forcibly redirected.

## Admin workflow

The Admin UI is merely an optional transaction authoring and verification
interface: user/operator wallet signs each deployment; backend never owns
private keys. Explicit stages include unsigned program deployment, durable
transaction signature recovery, finality, code/authority verification, and
append-only GitHub receipts. No deploy button is valid until wallet signing,
ELF verification, recovery and checks above are implemented and tested.

Never route a Solana program deployment through MetaMask/EIP-1193.
Use the existing canonical XITA asset sharding for token representations;
never make a new canonical asset solely because it is on Solana.


## EVM functional equivalence for the Admin

The **user-facing chain/asset/route deployment workflow is the same** as the
existing EVM Admin. Only the SVM transaction signer, program binary upload,
program/account verification, SPL operations and receipt serialization differ.
Do not build a second product with new approval requirements. The current
standalone Solana read-only panel is solely an integration staging surface.

A commercial service, like the existing optional `XITAExecutionGateway`,
may hold a service-wallet signing key and separate recovery-admin authority
for **its own fee/quote/sponsorship operations only**. This does not contradict
the absence of core protocol owner, program upgrade authority, route veto,
bridge mint/burn controller or protocol fee setter. Source-native protocol
validator fees remain controlled by the valid destination/source validator
set quorum, exactly as on EVM.
