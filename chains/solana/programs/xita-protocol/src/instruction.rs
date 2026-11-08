//! Public XITA program instructions. The two safe construction steps are
//! implemented now. Transfers, quorum transitions, fee updates and claims
//! deliberately fail closed until proof verification is complete.
use borsh::{BorshDeserialize, BorshSerialize};

#[derive(Debug, BorshSerialize, BorshDeserialize, Clone, PartialEq, Eq)]
pub enum XitaInstruction {
    /// Factory.deployCollateralRouter(mint,salt) equivalent:
    /// accounts: payer/creator (signer,writable), router PDA (writable),
    /// SPL mint (read-only), System Program, Rent sysvar.
    DeployCollateralRouter { salt: [u8;32] },
    /// Factory.registerRoute(sourceRouter, XGRChain, remoteRouter) equivalent.
    /// accounts: creator (signer,writable), router PDA (read-only),
    /// route PDA (writable), FeeVault PDA (writable), System Program, Rent sysvar.
    RegisterRoute { destination_domain:u32, remote_router: [u8;32] },
    /// Reserved for Direct-BLS verified gateway dispatch; never enabled by
    /// a frontend, operator-only signature or untrusted RPC observation.
    Bridge { recipient:[u8;32], amount:u64 },
    /// Reserved for authenticated validator-set/governance operations.
    ApplySourceFee { proposal:Vec<u8>, signer_bitmap:Vec<u8>, signature:Vec<u8> },
    /// Reserved for verified inbound messages and program-PDA mint/unlock.
    ExecuteInbound { message:Vec<u8>, proof:Vec<u8> },
    /// Reserved for claim based on a final historical validator snapshot.
    ClaimFees { max_epochs:u64 },
    /// Initialize a PDA-owned SPL collateral vault for an existing creator
    /// router. Permissionless rent payer, immutable router-PDA token authority.
    /// No escrow transfers or minting occur during initialization.
    /// Accounts: payer(signer,w), router, mint, vault(w), system, rent, SPL token.
    InitCollateralVault,
    /// Factory.deployWrappedXGRRouter / deploySyntheticRouter parity.
    /// All synthetic mint accounts start with zero supply. CPI minting remains
    /// blocked until on-chain Direct-BLS verification is independently audited.
    /// accounts: creator, router PDA, mint PDA, system, rent, SPL Token program.
    DeploySyntheticRouter {
        salt:[u8;32], origin_chain_id:u64, origin_token:[u8;20],
        origin_kind:u8, decimals:u8,
    },
    /// Permissionless bootstrap ONLY against an immutable, independently
    /// reproduced XGR validator-set root baked into the release ELF.
    /// No operator key can choose or change the initial members.
    /// Accounts: payer(signer,w), trusted-validator PDA(w), system, rent.
    BootstrapXGRValidators {
        members:Vec<crate::trusted_validators::ValidatorRecord>,
    },
    /// Callable only after an immutable Solana-specific XGR V3 trust root
    /// has been verified and pinned at binary build. Native BLS quorum and
    /// candidate PoP are mandatory; historical set PDAs are append-only.
    ApplyValidatorMembership {
        proposal:crate::trusted_validators::MembershipProposalWire,
        bitmap:Vec<u8>,
        signature:Vec<u8>,
        quorum_witness:Vec<u8>,
        possession_proof:Vec<u8>,
        possession_witness:Vec<u8>,
    },

    /// One shared native SOL source fee for all permissionless source
    /// routes. Initial fee and every change need current validator quorum.
    ApplySolanaSourceFee{
        proposal:crate::source_fee::SourceFeeProposal,
        bitmap:Vec<u8>,
        signature:Vec<u8>,
        witness:Vec<u8>,
    },

    /// One atomic, user-signed SPL source operation. Fee, custody/burn,
    /// monotonic nonce, immutable message receipt and historical fee epoch
    /// must all succeed together; otherwise the whole instruction rolls back.
    /// No relayer, sponsor or GmbH execution gateway is required.
    BridgeSourceV1{recipient:[u8;32],amount:u64},

}
