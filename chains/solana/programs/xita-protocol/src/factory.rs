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
    entrypoint::ProgramResult, program::{invoke,invoke_signed}, program_error::ProgramError,
    pubkey::Pubkey, rent::Rent, system_instruction, system_program,
    sysvar::{self, Sysvar}, program_pack::Pack,
};
use spl_token::state::{Mint,Account as SplAccount};

pub const ROUTER_SEED: &[u8] = b"xita-router";
pub const ROUTE_SEED: &[u8] = b"xita-route";
pub const FEE_SEED: &[u8] = b"xita-fee-vault";
pub const SYNTH_ROUTER_SEED: &[u8] = b"xita-synthetic";
pub const SYNTH_MINT_SEED: &[u8] = b"xita-mint";
pub const COLLATERAL_VAULT_SEED: &[u8] = b"xita-collateral-vault";


pub(crate) fn create_pda<'a>(
    program_id:&Pubkey, payer:&AccountInfo<'a>, new_account:&AccountInfo<'a>,
    system:&AccountInfo<'a>, rent:&Rent, seeds:&[&[u8]], space:usize,
    owner:&Pubkey
) -> ProgramResult {
    if !payer.is_signer || !payer.is_writable || !new_account.is_writable ||
       *system.key!=system_program::id() || !system.executable {
        return Err(ProgramError::MissingRequiredSignature)
    }
    if new_account.data_len()!=0 || *new_account.owner!=system_program::id() {
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
    if new_account.lamports()==0 {
        let ix=system_instruction::create_account(
            payer.key,new_account.key,amount,space as u64,owner
        );
        return invoke_signed(
            &ix,&[payer.clone(),new_account.clone(),system.clone()],&[&signer_seeds]
        );
    }
    // A third party may pre-fund a deterministic PDA through System Program
    // before its creator initializes it. That must NOT permanently block
    // permissionless router or route creation.
    if new_account.lamports()<amount {
        let ix=system_instruction::transfer(
            payer.key,new_account.key,amount-new_account.lamports()
        );
        invoke(&ix,&[payer.clone(),new_account.clone(),system.clone()])?;
    }
    invoke_signed(
        &system_instruction::allocate(new_account.key,space as u64),
        &[new_account.clone(),system.clone()],&[&signer_seeds]
    )?;
    invoke_signed(
        &system_instruction::assign(new_account.key,owner),
        &[new_account.clone(),system.clone()],&[&signer_seeds]
    )
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
        &[ROUTER_SEED,creator.key.as_ref(),&salt,mint_account.key.as_ref()],encoded.len(),program_id)?;
    state::save(router_account,program_id,&state)?;
    Ok(())
}

/// Permissionless factory parity for `deploySyntheticRouter` and
/// `deployWrappedXGRRouter`. The minted SPL asset has ZERO initial supply;
/// only its immutable router PDA has mint authority, never the payer/operator.
/// Freeze authority is permanently unset. No mint instructions are exposed.
/// Analogous to an immutable collateral router's token escrow.
pub fn collateral_vault_address(program_id:&Pubkey,router:&Pubkey)->(Pubkey,u8){
    Pubkey::find_program_address(&[COLLATERAL_VAULT_SEED,router.as_ref()],program_id)
}

/// Permissionless, zero-balance vault initialization. This does NOT activate
/// or dispatch a transfer; Source Gateway stays fail-closed until BLS.
pub fn init_collateral_vault(
    program_id:&Pubkey,accounts:&[AccountInfo],
)->ProgramResult{
    let mut it=accounts.iter();
    let payer=next_account_info(&mut it)?;
    let router_account=next_account_info(&mut it)?;
    let mint_account=next_account_info(&mut it)?;
    let vault_account=next_account_info(&mut it)?;
    let system=next_account_info(&mut it)?;
    let rent_account=next_account_info(&mut it)?;
    let token_program=next_account_info(&mut it)?;
    if !payer.is_signer||!payer.is_writable||
       !vault_account.is_writable||!token_program.executable||
       *token_program.key!=spl_token::id()||
       *rent_account.key!=sysvar::rent::id()||
       *mint_account.owner!=spl_token::id(){
        return Err(ProgramError::InvalidInstructionData)
    }
    let router:Router=state::load(router_account,program_id)?;
    if router.tag!=ROUTER_TAG||router.version!=VERSION||router.kind!=1||
       router.mint!=mint_account.key.to_bytes()||
       router.asset_id!=codec::asset_id(router.mint,1)
           .ok_or(ProgramError::InvalidAccountData)?{
        return Err(ProgramError::InvalidAccountData)
    }
    let creator=Pubkey::new_from_array(router.creator);
    let (expected_router,bump)=Pubkey::find_program_address(
        &[ROUTER_SEED,creator.as_ref(),&router.salt,mint_account.key.as_ref()],program_id);
    if expected_router!=*router_account.key||bump!=router.bump{
        return Err(ProgramError::InvalidSeeds)
    }
    let (expected_vault,_)=collateral_vault_address(program_id,router_account.key);
    if expected_vault!=*vault_account.key{
        return Err(ProgramError::InvalidSeeds)
    }
    let rent=Rent::from_account_info(rent_account)?;
    create_pda(program_id,payer,vault_account,system,&rent,
        &[COLLATERAL_VAULT_SEED,router_account.key.as_ref()],SplAccount::LEN,
        &spl_token::id())?;
    let ix=spl_token::instruction::initialize_account3(
        &spl_token::id(),vault_account.key,mint_account.key,router_account.key)?;
    invoke(&ix,&[vault_account.clone(),mint_account.clone(),token_program.clone()])?;
    Ok(())
}

pub fn deploy_synthetic_router(
    program_id:&Pubkey,accounts:&[AccountInfo],
    salt:[u8;32],origin_chain_id:u64,origin_token:[u8;20],
    origin_kind:u8,decimals:u8,
)->ProgramResult {
    let mut it=accounts.iter();
    let creator=next_account_info(&mut it)?;
    let router_account=next_account_info(&mut it)?;
    let mint_account=next_account_info(&mut it)?;
    let system=next_account_info(&mut it)?;
    let rent_sysvar=next_account_info(&mut it)?;
    let token_program=next_account_info(&mut it)?;
    if !creator.is_signer||!creator.is_writable||
       !router_account.is_writable||!mint_account.is_writable||
       *rent_sysvar.key!=sysvar::rent::id()||
       *token_program.key!=spl_token::id()||!token_program.executable||
       decimals>9 || origin_chain_id==codec::SOLANA_DOMAIN as u64 {
        return Err(ProgramError::InvalidInstructionData)
    }
    // Native SOL is not supported as an origin through this path. Native
    // wrapped XGR is the only native representation currently admitted.
    if origin_kind==0&&origin_chain_id!=codec::XGR_DOMAIN as u64 {
        return Err(ProgramError::InvalidInstructionData)
    }
    let asset_id=codec::evm_origin_asset_id(
        origin_chain_id,origin_token,origin_kind)
        .ok_or(ProgramError::InvalidInstructionData)?;
    let (expected_router,bump)=Pubkey::find_program_address(
        &[SYNTH_ROUTER_SEED,creator.key.as_ref(),&asset_id,&salt],program_id);
    if expected_router!=*router_account.key {
        return Err(ProgramError::InvalidSeeds)
    }
    let (expected_mint,_)=Pubkey::find_program_address(
        &[SYNTH_MINT_SEED,router_account.key.as_ref()],program_id);
    if expected_mint!=*mint_account.key {
        return Err(ProgramError::InvalidSeeds)
    }
    let state=Router{tag:ROUTER_TAG,version:VERSION,bump,kind:2,
        creator:creator.key.to_bytes(),mint:mint_account.key.to_bytes(),
        asset_id,salt,decimals};
    let space=borsh::to_vec(&state)
        .map_err(|_|ProgramError::InvalidAccountData)?.len();
    let rent=Rent::from_account_info(rent_sysvar)?;
    create_pda(program_id,creator,router_account,system,&rent,
        &[SYNTH_ROUTER_SEED,creator.key.as_ref(),&asset_id,&salt],space,program_id)?;
    create_pda(program_id,creator,mint_account,system,&rent,
        &[SYNTH_MINT_SEED,router_account.key.as_ref()],Mint::LEN,&spl_token::id())?;
    let ix=spl_token::instruction::initialize_mint2(
        &spl_token::id(),mint_account.key,router_account.key,None,decimals)?;
    invoke(&ix,&[mint_account.clone(),token_program.clone()])?;
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
    if router.tag!=ROUTER_TAG||router.version!=VERSION||
       (router.kind!=1&&router.kind!=2)||
       router.creator!=creator.key.to_bytes() {
        return Err(ProgramError::InvalidAccountData)
    }
    let mint=Pubkey::new_from_array(router.mint);
    let (router_pda,router_bump)=if router.kind==1 {
       Pubkey::find_program_address(
           &[ROUTER_SEED,creator.key.as_ref(),&router.salt,mint.as_ref()],program_id)
    } else {
       let (pda,bump)=Pubkey::find_program_address(
           &[SYNTH_ROUTER_SEED,creator.key.as_ref(),&router.asset_id,&router.salt],program_id);
       let (mint_expected,_)=Pubkey::find_program_address(
           &[SYNTH_MINT_SEED,router_account.key.as_ref()],program_id);
       if mint_expected!=mint {return Err(ProgramError::InvalidSeeds)}
       (pda,bump)
    };
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
        &[ROUTE_SEED,router_account.key.as_ref(),&destination_domain.to_be_bytes()],route_len,program_id)?;
    create_pda(program_id,creator,fee_account,system,&rent,
        &[FEE_SEED,route_account.key.as_ref()],fee_len,program_id)?;
    state::save(route_account,program_id,&route)?;
    state::save(fee_account,program_id,&fee)?;
    // Never claim this provisional record is an active bridge route. It must
    // be reconciled against the remote XGR router and full source evidence.
    Ok(())
}

/// The only allowed initial validator-PDA creation path. It is intentionally
/// unavailable with the current unset genesis root, and it cannot be called
/// with arbitrary user-selected validator material after release.
pub fn bootstrap_xgr_validators(
    program_id:&Pubkey,accounts:&[AccountInfo],
    members:Vec<crate::trusted_validators::ValidatorRecord>,
)->ProgramResult{
    let mut it=accounts.iter();
    let payer=next_account_info(&mut it)?;
    let registry=next_account_info(&mut it)?;
    let system=next_account_info(&mut it)?;
    let rent_account=next_account_info(&mut it)?;
    if !payer.is_signer||!payer.is_writable||!registry.is_writable||
       *rent_account.key!=sysvar::rent::id(){
        return Err(ProgramError::MissingRequiredSignature)
    }
    let anchor=crate::trusted_validators::ImmutableAnchor::compiled()?;
    let snapshot=crate::trusted_validators::initialize(&anchor,members)?;
    if *registry.key!=crate::trusted_validators::trusted_pda(program_id).0{
        return Err(ProgramError::InvalidSeeds)
    }
    let bytes=crate::trusted_validators::serialize_current(&snapshot)?;
    let history=next_account_info(&mut it)?;
    if !history.is_writable ||
       *history.key!=crate::trusted_validators::history_pda(
           program_id,snapshot.set_id
       ).0{
        return Err(ProgramError::InvalidSeeds);
    }
    let rent=Rent::from_account_info(rent_account)?;
    create_pda(program_id,payer,registry,system,&rent,
        &[crate::trusted_validators::CURRENT_SEED],bytes.len(),program_id)?;
    let id=snapshot.set_id.to_be_bytes();
    let historic=borsh::to_vec(&snapshot)
        .map_err(|_|ProgramError::InvalidAccountData)?;
    create_pda(program_id,payer,history,system,&rent,
        &[crate::trusted_validators::HISTORY_SEED,&id],
        historic.len(),program_id)?;
    state::save(history,program_id,&snapshot)?;
    crate::trusted_validators::store_current_set(
        registry,program_id,&snapshot
    )?;
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
        XitaInstruction::InitCollateralVault =>
            init_collateral_vault(program_id,accounts),
        XitaInstruction::BootstrapXGRValidators{members} =>
            bootstrap_xgr_validators(program_id,accounts,members),
        XitaInstruction::ApplyValidatorMembership{
            proposal,bitmap,signature,quorum_witness,
            possession_proof,possession_witness
        }=>crate::membership::apply_membership(
            program_id,accounts,proposal,bitmap,signature,
            quorum_witness,possession_proof,possession_witness
        ),
        XitaInstruction::ApplySolanaSourceFee{
            proposal,bitmap,signature,witness
        }=>crate::source_fee::apply_source_fee(
            program_id,accounts,proposal,bitmap,signature,witness
        ),
        XitaInstruction::BridgeSourceV1{recipient,amount}=>
            crate::source_gateway::execute(
                program_id,accounts,recipient,amount
            ),
        XitaInstruction::DeploySyntheticRouter{
            salt,origin_chain_id,origin_token,origin_kind,decimals
        } => deploy_synthetic_router(
            program_id,accounts,salt,origin_chain_id,origin_token,origin_kind,decimals),
        _ => Err(crate::disabled()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use solana_program::program_option::COption;
    use spl_token::instruction::TokenInstruction;

    #[test]
    fn collateral_vault_is_one_per_router_and_owned_by_router_not_operator() {
        let program=Pubkey::new_unique();
        let a=Pubkey::new_unique();
        let b=Pubkey::new_unique();
        let (v,_)=collateral_vault_address(&program,&a);
        let (v2,_)=collateral_vault_address(&program,&a);
        let (other,_)=collateral_vault_address(&program,&b);
        assert_eq!(v,v2);
        assert_ne!(v,other);
        assert_ne!(v,a);
        let mint=Pubkey::new_unique();
        let ix=spl_token::instruction::initialize_account3(
            &spl_token::id(),&v,&mint,&a).unwrap();
        assert_eq!(ix.program_id,spl_token::id());
        assert_eq!(ix.accounts.len(),2);
        assert_eq!(ix.accounts[0].pubkey,v);
        assert_eq!(ix.accounts[1].pubkey,mint);
        match TokenInstruction::unpack(&ix.data).unwrap() {
            TokenInstruction::InitializeAccount3{owner}=>assert_eq!(owner,a),
            _=>panic!("non-vault token instruction"),
        }
    }
    #[test]
    fn synthetic_mint_requires_only_immutable_router_pda_authority() {
        let program=Pubkey::new_unique();
        let creator=Pubkey::new_unique();
        let salt=[7u8;32];
        let asset=codec::evm_origin_asset_id(1643,[0;20],0).unwrap();
        let (router,_)=Pubkey::find_program_address(
            &[SYNTH_ROUTER_SEED,creator.as_ref(),&asset,&salt],&program
        );
        let (mint,_)=Pubkey::find_program_address(
            &[SYNTH_MINT_SEED,router.as_ref()],&program
        );
        assert_ne!(router,mint);
        assert_ne!(creator,router);
        let ix=spl_token::instruction::initialize_mint2(
            &spl_token::id(),&mint,&router,None,9
        ).unwrap();
        match TokenInstruction::unpack(&ix.data).unwrap() {
            TokenInstruction::InitializeMint2{
                decimals,mint_authority,freeze_authority
            }=>{
                assert_eq!(decimals,9);
                assert_eq!(mint_authority,router);
                assert_eq!(freeze_authority,COption::None);
            },
            _=>panic!("wrong token initialization"),
        }
        assert_eq!(ix.accounts.len(),1);
        assert_eq!(ix.accounts[0].pubkey,mint);
    }

    #[test]
    fn synthetic_router_identity_is_creator_and_asset_scoped() {
        let program=Pubkey::new_unique();
        let creator=Pubkey::new_unique();
        let other_creator=Pubkey::new_unique();
        let asset=codec::evm_origin_asset_id(1643,[0;20],0).unwrap();
        let other_asset=codec::evm_origin_asset_id(8453,[1;20],1).unwrap();
        let salt=[7u8;32];
        let derive=|c:&Pubkey,a:&[u8;32],s:&[u8;32]|
            Pubkey::find_program_address(
                &[SYNTH_ROUTER_SEED,c.as_ref(),a,s],&program
            ).0;
        let addr=derive(&creator,&asset,&salt);
        assert_eq!(addr,derive(&creator,&asset,&salt));
        assert_ne!(addr,derive(&other_creator,&asset,&salt));
        assert_ne!(addr,derive(&creator,&other_asset,&salt));
        assert_ne!(addr,derive(&creator,&asset,&[8u8;32]));
    }
}
