//! Solana account storage mirrors Solidity contract storage one logical
//! record per PDA. There is NO central owner/upgrade/pause key in these records.
use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::AccountInfo, program_error::ProgramError, pubkey::Pubkey,
};

pub const VERSION: u8 = 1;
pub const ROUTER_TAG: u8 = 0x52;
pub const ROUTE_TAG: u8 = 0x54;
pub const FEE_TAG: u8 = 0x46;
pub const EPOCH_TAG: u8 = 0x45;
pub const RECEIPT_TAG: u8 = 0x4f;

#[derive(Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize, Clone)]
pub struct Router {
    pub tag: u8,
    pub version: u8,
    pub bump: u8,
    pub kind: u8, // 1 = SPL collateral, 2 = synthetic SPL mint (zero supply).
    pub creator: [u8; 32],
    pub mint: [u8; 32],
    pub asset_id: [u8; 32],
    pub salt: [u8; 32],
    pub decimals: u8,
}

#[derive(Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize, Clone)]
pub struct Route {
    pub tag: u8,
    pub version: u8,
    pub bump: u8,
    pub router: [u8; 32],
    pub creator: [u8; 32],
    pub asset_id: [u8; 32],
    pub remote_router: [u8; 32],
    pub route_id: [u8; 32],
    pub destination_domain: u32,
    pub fee_vault: [u8; 32],
}

#[derive(Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize, Clone)]
pub struct FeeVault {
    pub tag: u8,
    pub version: u8,
    pub bump: u8,
    pub route_id: [u8; 32],
    pub allocated_lamports: u64,
    pub validator_set_id: u64,
}

/// Each historical validator-set epoch has independent accounting, as in
/// XGRILNFeeVault. The recipient order is committed by a separately
/// authenticated validator-set snapshot, not a mutable operator mapping.
#[derive(Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize, Clone)]
pub struct FeeEpoch {
    pub tag: u8,
    pub version: u8,
    pub bump: u8,
    pub route_id: [u8; 32],
    pub set_id: u64,
    pub recipients: u32,
    pub total_lamports: u64,
}

/// One append-only fee receipt per source message prevents duplicate allocation.
/// The receipt PDA must be derived from fee-vault key and full message ID.
#[derive(Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize, Clone)]
pub struct OperationReceipt {
    pub tag: u8,
    pub version: u8,
    pub bump: u8,
    pub route_id: [u8; 32],
    pub message_id: [u8; 32],
    pub set_id: u64,
    pub fee_lamports: u64,
}

pub const SOURCE_NONCE_TAG:u8=0x4e;
pub const SOURCE_DISPATCH_TAG:u8=0x44;

/// Per-source-signer, per-route monotonic nonce. Source slot is runtime
/// supplied and never accepted from request calldata.
#[derive(Debug,PartialEq,Eq,BorshSerialize,BorshDeserialize,Clone)]
pub struct SourceNonce{
    pub tag:u8,
    pub version:u8,
    pub route_id:[u8;32],
    pub sender:[u8;32],
    pub nonce:u64,
}

/// Durable independent evidence that the native Solana gateway *actually*
/// performed SPL custody/burn, funded the fee vault and committed receipts in
/// one atomic transaction. Node attestors additionally verify finalized slot,
/// token account movements and program ELF identity independently.
#[derive(Debug,PartialEq,Eq,BorshSerialize,BorshDeserialize,Clone)]
pub struct SourceDispatch{
    pub tag:u8,
    pub version:u8,
    pub message_id:[u8;32],
    pub route_id:[u8;32],
    pub sender:[u8;32],
    pub recipient:[u8;32],
    pub source_token_account:[u8;32],
    pub source_mint:[u8;32],
    pub token_vault:[u8;32],
    pub amount_local:u64,
    pub amount_canonical:[u8;32],
    pub fee_lamports:u64,
    pub nonce:u64,
    pub source_slot:u64,
    pub validator_set_id:u64,
    pub custody_kind:u8, // 1=collateral lock, 2=synthetic SPL burn
}

pub fn load<T: BorshDeserialize>(
    acct: &AccountInfo, program_id: &Pubkey,
) -> Result<T, ProgramError> {
    if acct.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }
    T::try_from_slice(&acct.try_borrow_data()?)
        .map_err(|_| ProgramError::InvalidAccountData)
}

pub fn save<T: BorshSerialize>(
    acct: &AccountInfo, program_id: &Pubkey, data: &T,
) -> Result<(), ProgramError> {
    if acct.owner != program_id || !acct.is_writable {
        return Err(ProgramError::IllegalOwner);
    }
    let encoded = borsh::to_vec(data).map_err(|_| ProgramError::InvalidAccountData)?;
    let mut buf = acct.try_borrow_mut_data()?;
    if buf.len() != encoded.len() {
        return Err(ProgramError::AccountDataTooSmall);
    }
    buf.copy_from_slice(&encoded);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn borsh_records_are_fixed_size_and_do_not_contain_authority_keys() {
        let router = Router {
            tag: ROUTER_TAG, version: VERSION, bump: 255, kind: 1,
            creator: [1;32], mint: [2;32], asset_id:[3;32], salt:[4;32], decimals:9,
        };
        let out=borsh::to_vec(&router).unwrap();
        assert_eq!(out.len(), 4+32*4+1);
        assert_eq!(Router::try_from_slice(&out).unwrap(),router);
        let route = Route {tag: ROUTE_TAG,version:VERSION,bump:22,
            router:[1;32],creator:[2;32],asset_id:[3;32],
            remote_router:[4;32],route_id:[5;32],destination_domain:1643,
            fee_vault:[6;32]};
        assert_eq!(Route::try_from_slice(&borsh::to_vec(&route).unwrap()).unwrap(),route);
    }
}
