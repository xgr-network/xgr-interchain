//! SPL collateral custody counterpart of XETAGuardedCollateralWarpRouterV315.
//!
//! The transfer CPI is implemented as a gated internal building block only.
//! No public instruction calls it until source message dispatch + validator
//! fee allocation are atomic, and all remote route/proof checks exist.
use crate::{codec, factory, state::{Router, ROUTER_TAG, VERSION}};
use solana_program::{
    account_info::AccountInfo, program::{invoke, invoke_signed},
    program_error::ProgramError, program_option::COption,
    program_pack::Pack, pubkey::Pubkey,
};
use spl_token::state::{Account as SplAccount, AccountState, Mint};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EscrowIdentity {
    pub router: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub decimals: u8,
}

/// Validate the source token account, immutable Router PDA and its isolated
/// vault. Never rely on a caller-supplied mint, authority or token program.
pub fn validate_collateral_accounts(
    program_id: &Pubkey,
    router_key: &Pubkey,
    router: &Router,
    mint_info: &AccountInfo,
    vault_info: &AccountInfo,
    token_program: &AccountInfo,
) -> Result<EscrowIdentity, ProgramError> {
    if !token_program.executable || *token_program.key != spl_token::id() ||
       *mint_info.owner != spl_token::id() ||
       *vault_info.owner != spl_token::id() ||
       !vault_info.is_writable {
        return Err(ProgramError::IncorrectProgramId);
    }
    if router.tag != ROUTER_TAG || router.version != VERSION || router.kind != 1 ||
       router.mint != mint_info.key.to_bytes() ||
       router.asset_id != codec::asset_id(router.mint, 1)
            .ok_or(ProgramError::InvalidAccountData)? {
        return Err(ProgramError::InvalidAccountData);
    }
    let creator = Pubkey::new_from_array(router.creator);
    let (expected_router, bump) = Pubkey::find_program_address(
        &[factory::ROUTER_SEED, creator.as_ref(), &router.salt, mint_info.key.as_ref()],
        program_id,
    );
    let (expected_vault, _) = factory::collateral_vault_address(program_id, router_key);
    if *router_key != expected_router || router.bump != bump ||
       *vault_info.key != expected_vault {
        return Err(ProgramError::InvalidSeeds);
    }
    let mint = Mint::unpack(&mint_info.try_borrow_data()?)?;
    let vault = SplAccount::unpack(&vault_info.try_borrow_data()?)?;
    if !mint.is_initialized || mint.decimals != router.decimals ||
       mint.decimals > 18 || vault.mint != *mint_info.key ||
       vault.owner != *router_key ||
       vault.state != AccountState::Initialized ||
       vault.delegate != COption::None ||
       vault.delegated_amount != 0 ||
       vault.close_authority != COption::None {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(EscrowIdentity {
        router: *router_key,
        mint: *mint_info.key,
        vault: *vault_info.key,
        decimals: mint.decimals,
    })
}

/// Validate that a source SPL account belongs to the actual wallet signer;
/// spoofed delegated authorities are not accepted as the bridge sender.
pub fn validate_source_account(
    source: &AccountInfo,
    owner: &AccountInfo,
    identity: &EscrowIdentity,
) -> Result<SplAccount, ProgramError> {
    if !owner.is_signer || !source.is_writable ||
       *source.owner != spl_token::id() ||
       *source.key == identity.vault {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let token = SplAccount::unpack(&source.try_borrow_data()?)?;
    if token.owner != *owner.key || token.mint != identity.mint ||
       token.state != AccountState::Initialized {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(token)
}

/// Construct the same checked SPL instruction that a future atomic gateway
/// will invoke. On-chain entrypoint currently has NO dispatch to this method.
pub fn lock_instruction(
    source: &Pubkey, identity: &EscrowIdentity,
    owner: &Pubkey, amount: u64,
) -> Result<solana_program::instruction::Instruction, ProgramError> {
    if amount == 0 || *source == identity.vault {
        return Err(ProgramError::InvalidInstructionData);
    }
    spl_token::instruction::transfer_checked(
        &spl_token::id(), source, &identity.mint, &identity.vault,
        owner, &[], amount, identity.decimals,
    )
}

/// This is intentionally not invoked by the public instruction dispatcher.
/// In the final gateway, a failed message/fee commitment must rollback this CPI.
#[allow(dead_code)]
pub(crate) fn lock_when_gateway_authorized<'a>(
    source: &AccountInfo<'a>, identity: &EscrowIdentity,
    mint: &AccountInfo<'a>, vault: &AccountInfo<'a>,
    user: &AccountInfo<'a>, token_program: &AccountInfo<'a>, amount: u64,
) -> Result<(), ProgramError> {
    validate_source_account(source, user, identity)?;
    let ix = lock_instruction(source.key, identity, user.key, amount)?;
    invoke(&ix, &[
        source.clone(), mint.clone(), vault.clone(),
        user.clone(), token_program.clone()
    ])
}

/// Reverse unlock is also private; its actual caller must supply a verified
/// Direct-BLS authorization, a canonical matching route and replay check.
#[allow(dead_code)]
pub(crate) fn unlock_when_inbound_verified<'a>(
    program_id: &Pubkey, router: &Router, router_key: &Pubkey,
    vault: &AccountInfo<'a>, mint: &AccountInfo<'a>,
    destination: &AccountInfo<'a>, router_account: &AccountInfo<'a>,
    token_program: &AccountInfo<'a>, amount: u64,
) -> Result<(), ProgramError> {
    if amount == 0 || router.kind != 1 || router.mint != mint.key.to_bytes() ||
       router_account.key != router_key || *token_program.key != spl_token::id() ||
       !token_program.executable {
        return Err(ProgramError::InvalidInstructionData);
    }
    let creator = Pubkey::new_from_array(router.creator);
    let (expected, bump) = Pubkey::find_program_address(
        &[factory::ROUTER_SEED, creator.as_ref(), &router.salt, mint.key.as_ref()],
        program_id,
    );
    if expected != *router_key || bump != router.bump {
        return Err(ProgramError::InvalidSeeds);
    }
    let vault_state = SplAccount::unpack(&vault.try_borrow_data()?)?;
    let dst_state = SplAccount::unpack(&destination.try_borrow_data()?)?;
    if vault_state.owner != *router_key || vault_state.mint != *mint.key ||
       dst_state.mint != *mint.key ||
       *vault.key != factory::collateral_vault_address(program_id, router_key).0 ||
       vault_state.delegate != COption::None ||
       vault_state.close_authority != COption::None ||
       vault_state.state != AccountState::Initialized ||
       dst_state.state != AccountState::Initialized {
        return Err(ProgramError::InvalidAccountData);
    }
    let ix = spl_token::instruction::transfer_checked(
        &spl_token::id(), vault.key, mint.key, destination.key,
        router_key, &[], amount, router.decimals,
    )?;
    let bump_seed = [router.bump];
    let seeds = &[
        factory::ROUTER_SEED, creator.as_ref(),
        router.salt.as_ref(), mint.key.as_ref(), bump_seed.as_ref()
    ];
    invoke_signed(&ix, &[
        vault.clone(), mint.clone(), destination.clone(),
        router_account.clone(), token_program.clone()
    ], &[seeds])
}

#[cfg(test)]
mod tests {
    use super::*;
    use spl_token::instruction::TokenInstruction;
    #[test]
    fn lock_uses_checked_transfer_and_exact_pda_mint() {
        let router = Pubkey::new_unique();
        let mint = Pubkey::new_unique();
        let vault = Pubkey::new_unique();
        let user = Pubkey::new_unique();
        let src = Pubkey::new_unique();
        let identity = EscrowIdentity { router, mint, vault, decimals: 9 };
        let ix = lock_instruction(&src, &identity, &user, 123).unwrap();
        assert_eq!(ix.program_id, spl_token::id());
        assert_eq!(ix.accounts[0].pubkey, src);
        assert_eq!(ix.accounts[1].pubkey, mint);
        assert_eq!(ix.accounts[2].pubkey, vault);
        assert_eq!(ix.accounts[3].pubkey, user);
        assert!(ix.accounts[3].is_signer);
        match TokenInstruction::unpack(&ix.data).unwrap() {
            TokenInstruction::TransferChecked { amount, decimals } => {
                assert_eq!(amount, 123);
                assert_eq!(decimals, 9);
            },
            _ => panic!("unchecked SPL transfer"),
        }
        assert!(lock_instruction(&vault, &identity, &user, 1).is_err());
        assert!(lock_instruction(&src, &identity, &user, 0).is_err());
    }

    #[test]
    fn collateral_vault_binding_has_no_shared_global_escrow() {
        let program = Pubkey::new_unique();
        let router_a = Pubkey::new_unique();
        let router_b = Pubkey::new_unique();
        assert_ne!(
            factory::collateral_vault_address(&program, &router_a).0,
            factory::collateral_vault_address(&program, &router_b).0
        );
    }
    #[test]
    fn source_and_vault_account_invariants_reject_foreign_authorities() {
        use spl_token::state::AccountState;
        let program_id=Pubkey::new_unique();
        let creator=Pubkey::new_unique();
        let user=Pubkey::new_unique();
        let rogue=Pubkey::new_unique();
        let mint_key=Pubkey::new_unique();
        let source_key=Pubkey::new_unique();
        let salt=[4u8;32];
        let (router_key,bump)=Pubkey::find_program_address(
            &[factory::ROUTER_SEED,creator.as_ref(),&salt,mint_key.as_ref()],
            &program_id
        );
        let vault_key=factory::collateral_vault_address(&program_id,&router_key).0;
        let token_program_id=spl_token::id();
        let system_id=solana_program::system_program::id();
        let mut mint_lamports=1;
        let mut vault_lamports=1;
        let mut source_lamports=1;
        let mut token_lamports=1;
        let mut user_lamports=1;
        let mut mint_data=[0u8;Mint::LEN];
        let mut vault_data=[0u8;SplAccount::LEN];
        let mut source_data=[0u8;SplAccount::LEN];
        let mut token_data=[];
        let mut user_data=[];
        let mint=Mint{
            mint_authority:COption::None,supply:1_000,
            decimals:9,is_initialized:true,freeze_authority:COption::None
        };
        Mint::pack(mint,&mut mint_data).unwrap();
        let vault=SplAccount{
            mint:mint_key,owner:router_key,amount:100,
            delegate:COption::None,state:AccountState::Initialized,
            is_native:COption::None,delegated_amount:0,
            close_authority:COption::None,
        };
        SplAccount::pack(vault,&mut vault_data).unwrap();
        let source=SplAccount{
            mint:mint_key,owner:user,amount:500,
            delegate:COption::None,state:AccountState::Initialized,
            is_native:COption::None,delegated_amount:0,
            close_authority:COption::None,
        };
        SplAccount::pack(source,&mut source_data).unwrap();
        let mint_info=AccountInfo::new(
            &mint_key,false,false,&mut mint_lamports,
            &mut mint_data,&token_program_id,false,0
        );
        let vault_info=AccountInfo::new(
            &vault_key,false,true,&mut vault_lamports,
            &mut vault_data,&token_program_id,false,0
        );
        let source_info=AccountInfo::new(
            &source_key,false,true,&mut source_lamports,
            &mut source_data,&token_program_id,false,0
        );
        let token_info=AccountInfo::new(
            &token_program_id,false,false,&mut token_lamports,
            &mut token_data,&system_id,true,0
        );
        let user_info=AccountInfo::new(
            &user,true,false,&mut user_lamports,
            &mut user_data,&system_id,false,0
        );
        let router=Router{
            tag:ROUTER_TAG,version:VERSION,bump,kind:1,
            creator:creator.to_bytes(),mint:mint_key.to_bytes(),
            asset_id:codec::asset_id(mint_key.to_bytes(),1).unwrap(),
            salt,decimals:9
        };
        let identity=validate_collateral_accounts(
            &program_id,&router_key,&router,
            &mint_info,&vault_info,&token_info
        ).unwrap();
        assert_eq!(identity.vault,vault_key);
        assert_eq!(validate_source_account(
            &source_info,&user_info,&identity
        ).unwrap().amount,500);
        let wrong_router=Pubkey::new_unique();
        assert!(validate_collateral_accounts(
            &program_id,&wrong_router,&router,
            &mint_info,&vault_info,&token_info
        ).is_err());
        let fake_vault=SplAccount{
            delegate:COption::Some(rogue),
            delegated_amount:1,
            ..SplAccount::unpack(&vault_info.try_borrow_data().unwrap()).unwrap()
        };
        SplAccount::pack(fake_vault,&mut **vault_info.try_borrow_mut_data().unwrap()).unwrap();
        assert!(validate_collateral_accounts(
            &program_id,&router_key,&router,
            &mint_info,&vault_info,&token_info
        ).is_err());
        let honest=SplAccount{
            delegate:COption::None,delegated_amount:0,
            close_authority:COption::Some(rogue),
            ..SplAccount::unpack(&vault_info.try_borrow_data().unwrap()).unwrap()
        };
        SplAccount::pack(honest,&mut **vault_info.try_borrow_mut_data().unwrap()).unwrap();
        assert!(validate_collateral_accounts(
            &program_id,&router_key,&router,
            &mint_info,&vault_info,&token_info
        ).is_err());
    }

}
