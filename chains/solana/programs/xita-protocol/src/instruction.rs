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
    /// Factory.deployWrappedXGRRouter / deploySyntheticRouter parity.
    /// All synthetic mint accounts start with zero supply. CPI minting remains
    /// blocked until on-chain Direct-BLS verification is independently audited.
    /// accounts: creator, router PDA, mint PDA, system, rent, SPL Token program.
    DeploySyntheticRouter {
        salt:[u8;32], origin_chain_id:u64, origin_token:[u8;20],
        origin_kind:u8, decimals:u8,
    },
}
