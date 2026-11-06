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

#[derive(Debug, PartialEq, Eq, BorshSerialize, BorshDeserialize, Clone)]
pub struct Router {
    pub tag: u8,
    pub version: u8,
    pub bump: u8,
    pub kind: u8, // 1 = SPL collateral. Synthetic/native execution is gated.
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
