//! Solidity parity: XETATokenFactoryV315 / deployCollateralRouter and
//! registerRoute. Permissionless, creator-bound, no operator/governance keys.
//! A registered route is a non-executable intent pending Direct-BLS support.
use crate::{
    codec,
    instruction::XitaInstruction,
    state::{self, FeeVault, Route, Router, FEE_TAG, ROUTE_TAG, ROUTER_TAG, VERSION},
};
use borsh::BorshDeserialize;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult, program::invoke_signed, program_error::ProgramError,
    pubkey::Pubkey, rent::Rent, system_instruction, system_program,
    sysvar::{self, Sysvar}, program_pack::Pack,
};
use spl_token::state::Mint;

pub const ROUTER_SEED: &[u8] = b"xita-router";
pub const ROUTE_SEED: &[u8] = b"xita-route";
pub const FEE_SEED: &[u8] = b"xita-fee-vault";

fn create_pda<'a>(
    program_id:&Pubkey, payer:&AccountInfo<'a>, new_account:&AccountInfo<'a>,
    system:&AccountInfo<'a>, rent:&Rent, seeds:&[&[u8]], space:usize
) -> ProgramResult {
    if !payer.is_signer || !payer.is_writable || !new_account.is_writable ||
       *system.key!=system_program::id() || !system.executable {
        return Err(ProgramError::MissingRequiredSignature)
    }
    if new_account.lamports()!=0 || new_account.data_len()!=0 {
        return Err(ProgramError::AccountAlreadyInitialized)
    }
    let (expected,bump)=Pubkey::find_program_address(seeds,program_id);
    if expected!=*new_account.key {
        return Err(ProgramError::InvalidSeeds)
    }
    let bump_seed=[bump];
    let mut signer_seeds=seeds.to_vec();
    signer_seeds.push(&bump_seed);
    let amount=rent.minimum_balance(space).max(1);
    let ix=system_instruction::create_account(
        payer.key,new_account.key,amount,space as u64,program_id
    );
    invoke_signed(&ix,&[payer.clone(),new_account.clone(),system.clone()],&[&signer_seeds])
}

pub fn deploy_collateral_router(
    program_id:&Pubkey, accounts:&[AccountInfo],salt:[u8;32]
) -> ProgramResult {
    let mut i=accounts.iter();
    let creator=next_account_info(&mut i)?;
    let router_account=next_account_info(&mut i)?;
    let mint_account=next_account_info(&mut i)?;
    let system=next_account_info(&mut i)?;
    let rent_sysvar=next_account_info(&mut i)?;
    if !creator.is_signer || !creator.is_writable || !router_account.is_writable ||
       *rent_sysvar.key!=sysvar::rent::id() {
        return Err(ProgramError::InvalidAccountData)
    }
    if *mint_account.owner!=spl_token::id() || mint_account.data_len()!=Mint::LEN {
        return Err(ProgramError::IllegalOwner)
    }
    let mint=Mint::unpack(&mint_account.try_borrow_data()?)
        .map_err(|_|ProgramError::InvalidAccountData)?;
    if !mint.is_initialized || mint.decimals>18 {
        return Err(ProgramError::InvalidAccountData)
    }
    let (expected,bump)=Pubkey::find_program_address(
        &[ROUTER_SEED,creator.key.as_ref(),&salt,mint_account.key.as_ref()],program_id
    );
    if expected!=*router_account.key {
        return Err(ProgramError::InvalidSeeds)
    }
    let asset_id=codec::asset_id(mint_account.key.to_bytes(),1)
        .ok_or(ProgramError::InvalidInstructionData)?;
    let state=Router {
        tag:ROUTER_TAG,version:VERSION,bump,kind:1,
        creator:creator.key.to_bytes(),mint:mint_account.key.to_bytes(),
        asset_id,salt,decimals:mint.decimals,
    };
    let encoded=borsh::to_vec(&state).map_err(|_|ProgramError::InvalidAccountData)?;
    let rent=Rent::from_account_info(rent_sysvar)?;
    create_pda(program_id,creator,router_account,system,&rent,
        &[ROUTER_SEED,creator.key.as_ref(),&salt,mint_account.key.as_ref()],encoded.len())?;
    state::save(router_account,program_id,&state)?;
    Ok(())
}

pub fn register_route(
    program_id:&Pubkey,accounts:&[AccountInfo],
    destination_domain:u32,remote_router:[u8;32]
) -> ProgramResult {
    let mut i=accounts.iter();
    let creator=next_account_info(&mut i)?;
    let router_account=next_account_info(&mut i)?;
    let route_account=next_account_info(&mut i)?;
    let fee_account=next_account_info(&mut i)?;
    let system=next_account_info(&mut i)?;
    let rent_sysvar=next_account_info(&mut i)?;
    if !creator.is_signer||!creator.is_writable||
       !route_account.is_writable||!fee_account.is_writable||
       *rent_sysvar.key!=sysvar::rent::id() {
        return Err(ProgramError::MissingRequiredSignature)
    }
    let router:Router=state::load(router_account,program_id)?;
    if router.tag!=ROUTER_TAG||router.version!=VERSION||router.kind!=1 ||
       router.creator!=creator.key.to_bytes() {
        return Err(ProgramError::InvalidAccountData)
    }
    let mint=Pubkey::new_from_array(router.mint);
    let (router_pda,router_bump)=Pubkey::find_program_address(
        &[ROUTER_SEED,creator.key.as_ref(),&router.salt,mint.as_ref()],program_id);
    if *router_account.key!=router_pda||router.bump!=router_bump {
        return Err(ProgramError::InvalidSeeds)
    }
    // EVM RouterCore permits only one outbound domain for each router.
    if destination_domain!=codec::XGR_DOMAIN||!codec::is_evm_address_32(&remote_router) {
        return Err(ProgramError::InvalidInstructionData)
    }
    let (route_pda,route_bump)=Pubkey::find_program_address(
        &[ROUTE_SEED,router_account.key.as_ref(),&destination_domain.to_be_bytes()],program_id);
    let (fee_pda,fee_bump)=Pubkey::find_program_address(
        &[FEE_SEED,route_account.key.as_ref()],program_id);
    if *route_account.key!=route_pda||*fee_account.key!=fee_pda {
        return Err(ProgramError::InvalidSeeds)
    }
    let route_id=codec::route_id(router.asset_id,codec::SOLANA_DOMAIN,
        destination_domain,router_account.key.to_bytes(),remote_router)
        .ok_or(ProgramError::InvalidInstructionData)?;
    let route=Route{
        tag:ROUTE_TAG,version:VERSION,bump:route_bump,
        router:router_account.key.to_bytes(),creator:creator.key.to_bytes(),
        asset_id:router.asset_id,remote_router,route_id,destination_domain,
        fee_vault:fee_account.key.to_bytes(),
    };
    let fee=FeeVault{
        tag:FEE_TAG,version:VERSION,bump:fee_bump,route_id,
        allocated_lamports:0,validator_set_id:0,
    };
    let route_len=borsh::to_vec(&route)
        .map_err(|_|ProgramError::InvalidAccountData)?.len();
    let fee_len=borsh::to_vec(&fee)
        .map_err(|_|ProgramError::InvalidAccountData)?.len();
    let rent=Rent::from_account_info(rent_sysvar)?;
    create_pda(program_id,creator,route_account,system,&rent,
        &[ROUTE_SEED,router_account.key.as_ref(),&destination_domain.to_be_bytes()],route_len)?;
    create_pda(program_id,creator,fee_account,system,&rent,
        &[FEE_SEED,route_account.key.as_ref()],fee_len)?;
    state::save(route_account,program_id,&route)?;
    state::save(fee_account,program_id,&fee)?;
    // Never claim this provisional record is an active bridge route. It must
    // be reconciled against the remote XGR router and full source evidence.
    Ok(())
}

pub fn process(program_id:&Pubkey,accounts:&[AccountInfo],data:&[u8])->ProgramResult {
    let ix=XitaInstruction::try_from_slice(data)
        .map_err(|_|ProgramError::InvalidInstructionData)?;
    match ix {
        XitaInstruction::DeployCollateralRouter{salt} =>
            deploy_collateral_router(program_id,accounts,salt),
        XitaInstruction::RegisterRoute{destination_domain,remote_router} =>
            register_route(program_id,accounts,destination_domain,remote_router),
        _ => Err(crate::disabled()),
    }
}
