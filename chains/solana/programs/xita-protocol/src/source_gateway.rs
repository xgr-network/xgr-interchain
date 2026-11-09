//! Atomic, self-signed Solana source SPL lock/burn and source-native fee
//! allocation. A BLS-governed source fee and trusted XGR validator PDA are
//! mandatory. No GmbH operator, sponsor, relayer or route whitelist exists.
//!
//! One instruction commits all or none:
//!   SPL lock/burn CPI + SOL validator fee + monotonic source nonce +
//!   immutable SourceDispatch + immutable OperationReceipt +
//!   historical FeeEpoch + FeeVault accounting.
//!
//! This code does NOT accept arbitrary destination BLS proof; inbound mint/
//! unlock remains disabled pending audited remote XGR source evidence.
use crate::{
    codec,collateral,factory,fee_vault,gateway,registry,source_fee,state,
    trusted_validators,
    state::{FeeEpoch,FeeVault,OperationReceipt,Router,Route,SourceNonce,
        SourceDispatch,SOURCE_NONCE_TAG,SOURCE_DISPATCH_TAG,VERSION},
};
use borsh::BorshSerialize;
use solana_program::{
    account_info::{next_account_info,AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    program::{invoke},
    program_error::ProgramError,
    program_option::COption,
    program_pack::Pack,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::{self,Sysvar},
};
use spl_token::state::{Account as SplAccount,Mint,AccountState};
pub const NONCE_SEED:&[u8]=b"xita-source-nonce";
pub const DISPATCH_SEED:&[u8]=b"xita-source-dispatch";

pub fn nonce_pda(program:&Pubkey,route:&Pubkey,sender:&Pubkey)->(Pubkey,u8){
    Pubkey::find_program_address(
        &[NONCE_SEED,route.as_ref(),sender.as_ref()],program
    )
}
pub fn dispatch_pda(program:&Pubkey,message_id:&[u8;32])->(Pubkey,u8){
    Pubkey::find_program_address(&[DISPATCH_SEED,message_id],program)
}

fn next_nonce(
    program:&Pubkey,nonce_account:&AccountInfo,
    route_account:&AccountInfo,signer:&AccountInfo,route_id:[u8;32],
)->Result<(Option<SourceNonce>,u64),ProgramError>{
    if *nonce_account.key!=nonce_pda(
        program,route_account.key,signer.key
    ).0 || !nonce_account.is_writable{
        return Err(ProgramError::InvalidSeeds)
    }
    let prior=if nonce_account.owner==program {
        let n:SourceNonce=state::load(nonce_account,program)?;
        if n.tag!=SOURCE_NONCE_TAG||n.version!=VERSION||
           n.route_id!=route_id||n.sender!=signer.key.to_bytes()||
           n.nonce==0 {return Err(ProgramError::InvalidAccountData)}
        Some(n)
    }else if *nonce_account.owner==solana_program::system_program::id()&&
        nonce_account.data_is_empty(){
        None
    }else {return Err(ProgramError::InvalidAccountData)};
    let next=match prior.as_ref(){
        Some(n)=>n.nonce.checked_add(1)
            .ok_or(ProgramError::InvalidInstructionData)?,
        None=>1,
    };
    Ok((prior,next))
}
/// Full vault and fee binding with no invented caller-provided epoch or fee.
/// Returns an independently inspectable *candidate* source intent. Only the
/// public execute() method below is allowed to create custody evidence.
pub fn plan_source(
    program:&Pubkey,router_key:&Pubkey,fee_vault_key:&Pubkey,
    router:&Router,route:&Route,vault:&FeeVault,
    signer:&Pubkey,recipient:[u8;32],amount:u64,
    nonce:u64,source_slot:u64,fee_lamports:u64,set_id:u64,
)->Result<gateway::PendingMessage,ProgramError>{
    if amount==0 ||fee_lamports==0||set_id==0 ||
       !codec::is_evm_address_32(&recipient){
        return Err(ProgramError::InvalidInstructionData)
    }
    let intent=gateway::SourceIntent{
        nonce,source_slot,signer:signer.to_bytes(),recipient,
        amount_local:amount,fee_lamports,set_id,
    };
    gateway::prepare_source_message(
        program.to_bytes(),router_key.to_bytes(),
        fee_vault_key.to_bytes(),router,route,vault,&intent,set_id,fee_lamports
    )
}

/// Accounts in order:
/// 0 fee payer/user signer(w)
/// 1 immutable router PDA
/// 2 immutable route PDA
/// 3 source-native SOL FeeVault PDA(w)
/// 4 chainwide BLS-governed source fee PDA
/// 5 currently verified XGR validator-set PDA
/// 6 per-user per-route nonce PDA(w)
/// 7 historical fee-epoch PDA(w)
/// 8 one-time validator fee receipt PDA(w)
/// 9 one-time source dispatch evidence PDA(w)
/// 10 source SPL token account(w)
/// 11 mint account
/// 12 PDA-owned collateral vault(w), or synthetic mint authority router
/// 13 SPL Token program
/// 14 System Program
/// 15 Rent sysvar
///
/// The current-set PDA is authenticated against its immutable bootstrap and
/// must already exist; no untrusted caller may choose the signing epoch.
pub fn execute(
    program_id:&Pubkey,accounts:&[AccountInfo],
    recipient:[u8;32],amount:u64,
)->ProgramResult{
    let bad=||ProgramError::InvalidInstructionData;
    let mut it=accounts.iter();
    let payer=next_account_info(&mut it)?;
    let router_account=next_account_info(&mut it)?;
    let route_account=next_account_info(&mut it)?;
    let fee_account=next_account_info(&mut it)?;
    let policy_account=next_account_info(&mut it)?;
    let validator_account=next_account_info(&mut it)?;
    let nonce_account=next_account_info(&mut it)?;
    let epoch_account=next_account_info(&mut it)?;
    let receipt_account=next_account_info(&mut it)?;
    let dispatch_account=next_account_info(&mut it)?;
    let source=next_account_info(&mut it)?;
    let mint=next_account_info(&mut it)?;
    let collateral_vault=next_account_info(&mut it)?;
    let token_program=next_account_info(&mut it)?;
    let system=next_account_info(&mut it)?;
    let rent_account=next_account_info(&mut it)?;
    if !payer.is_signer||!payer.is_writable||
       !fee_account.is_writable||!nonce_account.is_writable||
       !epoch_account.is_writable||!receipt_account.is_writable||
       !dispatch_account.is_writable||!source.is_writable ||
       *system.key!=solana_program::system_program::id()||
       !system.executable ||
       *token_program.key!=spl_token::id()||
       !token_program.executable ||
       *rent_account.key!=sysvar::rent::id(){
        return Err(bad())
    }

    // Every transfer is self-signed and routed through a persistent
    // creator-owned Router and one append-only source Route.
    let router:Router=state::load(router_account,program_id)?;
    let route:Route=state::load(route_account,program_id)?;
    let old_fee:FeeVault=state::load(fee_account,program_id)?;
    if !registry::validates_record(
        program_id,&route,router_account.key,route_account
            .key
    ) || route.asset_id!=router.asset_id ||
       route.fee_vault!=fee_account.key.to_bytes()||
       *fee_account.key!=Pubkey::find_program_address(
           &[factory::FEE_SEED,route_account.key.as_ref()],program_id
       ).0{
        return Err(ProgramError::InvalidAccountData)
    }
    let (router_expected,bump)=if router.kind==1 {
        let creator=Pubkey::new_from_array(router.creator);
        Pubkey::find_program_address(
            &[factory::ROUTER_SEED,creator.as_ref(),&router.salt,mint.key.as_ref()],
            program_id
        )
    }else if router.kind==2 {
        let creator=Pubkey::new_from_array(router.creator);
        Pubkey::find_program_address(
            &[factory::SYNTH_ROUTER_SEED,creator.as_ref(),&router.asset_id,&router.salt],
            program_id
        )
    }else {return Err(bad())};
    if router.tag!=state::ROUTER_TAG||router.version!=VERSION||
       router.mint!=mint.key.to_bytes()||router.bump!=bump ||
       *router_account.key!=router_expected{
        return Err(ProgramError::InvalidSeeds)
    }

    // Current validator root and native fee MUST originate from on-chain
    // governance, never from arbitrary caller-provided instruction data.
    let root=trusted_validators::ImmutableAnchor::compiled()?;
    let current=trusted_validators::load_current_set(
        validator_account,program_id,&root
    )?;
    let source_fee=source_fee::load_source_fee(policy_account,program_id)?;
    if source_fee.approved_set_id>current.set_id ||
       source_fee.validator_fee_lamports==0{
        return Err(ProgramError::InvalidAccountData)
    }
    let slot=Clock::get()?.slot;
    let (_prior,nonce)=next_nonce(
        program_id,nonce_account,route_account,payer,route.route_id
    )?;
    let message=plan_source(
        program_id,router_account.key,fee_account.key,
        &router,&route,&old_fee,payer.key,recipient,amount,
        nonce,slot,source_fee.validator_fee_lamports,current.set_id
    )?;
    let (expected_epoch,epoch_bump)=fee_vault::epoch_pda(
        program_id,fee_account.key,current.set_id
    );
    let (expected_receipt,receipt_bump)=fee_vault::receipt_pda(
        program_id,fee_account.key,&message.message_id
    );
    if *epoch_account.key!=expected_epoch ||
       *receipt_account.key!=expected_receipt ||
       *dispatch_account.key!=dispatch_pda(program_id,&message.message_id).0{
        return Err(ProgramError::InvalidSeeds)
    }
    // Immutable per-operation receipts prevent a second fee allocation
    // even if nonce or another account is unexpectedly substituted.
    for account in [receipt_account,dispatch_account] {
        if *account.owner!=solana_program::system_program::id() ||
           !account.data_is_empty() {
            return Err(ProgramError::AccountAlreadyInitialized)
        }
    }
    let epoch=if epoch_account.owner==program_id {
        Some(state::load::<FeeEpoch>(epoch_account,program_id)?)
    } else if *epoch_account.owner==solana_program::system_program::id()&&
        epoch_account.data_is_empty(){None}
    else {return Err(ProgramError::InvalidAccountData)};
    let count=u32::try_from(current.members.len()).map_err(|_|bad())?;
    let (updated_fee,updated_epoch,fee_receipt)=fee_vault::plan_allocation(
        &old_fee,epoch.as_ref(),None,route.route_id,message.message_id,
        current.set_id,count,source_fee.validator_fee_lamports,
        epoch_bump,receipt_bump
    ).ok_or_else(bad)?;

    // Custody CPI must use the same identified mint, signer and router;
    // wrapped XGR burns have no collateral account on Solana and instead
    // require the fixed XGR native asset ID and router-controlled mint.
    if *mint.owner!=spl_token::id()||*source.owner!=spl_token::id(){
        return Err(ProgramError::IncorrectProgramId)
    }
    let mint_state=Mint::unpack(&mint.try_borrow_data()?)?;
    if !mint_state.is_initialized||mint_state.decimals!=router.decimals {
        return Err(ProgramError::InvalidAccountData)
    }
    let source_state=SplAccount::unpack(&source.try_borrow_data()?)?;
    if source_state.mint!=*mint.key||source_state.owner!=*payer.key ||
       source_state.state!=AccountState::Initialized ||
       source_state.amount<amount||*source.key==*collateral_vault.key{
        return Err(ProgramError::InvalidAccountData)
    }
    if router.kind==1{
        collateral::lock_when_gateway_authorized(
            program_id,&router,router_account,source,mint,
            collateral_vault,payer,token_program,amount
        )?;
    }else {
        if router.decimals>9 ||
           router.asset_id!=codec::evm_origin_asset_id(
               1643,[0u8;20],0
           ).ok_or_else(bad)?||
           *mint.key!=Pubkey::find_program_address(
               &[factory::SYNTH_MINT_SEED,router_account.key.as_ref()],program_id
           ).0||
           mint_state.mint_authority!=COption::Some(*router_account.key)||
           mint_state.freeze_authority!=COption::None ||
           *collateral_vault.key!=*router_account.key{
            return Err(ProgramError::InvalidAccountData)
        }
        let burn=spl_token::instruction::burn_checked(
            &spl_token::id(),source.key,mint.key,payer.key,&[],
            amount,router.decimals
        )?;
        invoke(&burn,&[
            source.clone(),mint.clone(),payer.clone(),token_program.clone()
        ])?;
    }

    // Atomic source-native fee payment. A failure below reverts this
    // transfer *and* the SPL lock/burn as a single Solana transaction.
    invoke(&system_instruction::transfer(
        payer.key,fee_account.key,source_fee.validator_fee_lamports
    ),&[payer.clone(),fee_account.clone(),system.clone()])?;

    let rent=Rent::from_account_info(rent_account)?;
    let nonce_state=SourceNonce{
        tag:SOURCE_NONCE_TAG,version:VERSION,
        route_id:route.route_id,sender:payer.key.to_bytes(),nonce
    };
    let old_nonce_created=nonce_account.owner==program_id;
    if !old_nonce_created{
        let encoded=borsh::to_vec(&nonce_state)
            .map_err(|_|ProgramError::InvalidAccountData)?;
        factory::create_pda(
            program_id,payer,nonce_account,system,&rent,
            &[NONCE_SEED,route_account.key.as_ref(),payer.key.as_ref()],
            encoded.len(),program_id
        )?;
    }
    let epoch_id=current.set_id.to_be_bytes();
    if epoch.is_none(){
        let encoded=borsh::to_vec(&updated_epoch)
            .map_err(|_|ProgramError::InvalidAccountData)?;
        factory::create_pda(
            program_id,payer,epoch_account,system,&rent,
            &[fee_vault::EPOCH_SEED,fee_account.key.as_ref(),&epoch_id],
            encoded.len(),program_id
        )?;
    }
    let receipt_bytes=borsh::to_vec(&fee_receipt)
        .map_err(|_|ProgramError::InvalidAccountData)?;
    factory::create_pda(
        program_id,payer,receipt_account,system,&rent,
        &[fee_vault::RECEIPT_SEED,fee_account.key.as_ref(),&message.message_id],
        receipt_bytes.len(),program_id
    )?;
    let dispatch=SourceDispatch{
        tag:SOURCE_DISPATCH_TAG,version:VERSION,
        message_id:message.message_id,route_id:route.route_id,
        sender:payer.key.to_bytes(),recipient,
        source_token_account:source.key.to_bytes(),
        source_mint:mint.key.to_bytes(),
        token_vault:if router.kind==1 {collateral_vault.key.to_bytes()}else{[0;32]},
        amount_local:amount,amount_canonical:message.amount_canonical,
        fee_lamports:source_fee.validator_fee_lamports,
        nonce,source_slot:slot,validator_set_id:current.set_id,
        custody_kind:router.kind,
    };
    let dispatch_bytes=borsh::to_vec(&dispatch)
        .map_err(|_|ProgramError::InvalidAccountData)?;
    factory::create_pda(
        program_id,payer,dispatch_account,system,&rent,
        &[DISPATCH_SEED,&message.message_id],
        dispatch_bytes.len(),program_id
    )?;
    state::save(fee_account,program_id,&updated_fee)?;
    state::save(epoch_account,program_id,&updated_epoch)?;
    state::save(receipt_account,program_id,&fee_receipt)?;
    state::save(dispatch_account,program_id,&dispatch)?;
    state::save(nonce_account,program_id,&nonce_state)?;
    Ok(())
}
#[cfg(test)]
mod tests{
    use super::*;
    #[test]fn source_nonce_and_dispatch_are_route_user_and_message_scoped(){
        let pid=Pubkey::new_unique();
        let a=Pubkey::new_unique();
        let b=Pubkey::new_unique();
        let route=Pubkey::new_unique();
        let other_route=Pubkey::new_unique();
        assert_ne!(nonce_pda(&pid,&route,&a).0,nonce_pda(&pid,&route,&b).0);
        assert_ne!(nonce_pda(&pid,&route,&a).0,nonce_pda(&pid,&other_route,&a).0);
        assert_ne!(dispatch_pda(&pid,&[1;32]).0,dispatch_pda(&pid,&[2;32]).0);
    }
    #[test]fn client_cannot_choose_source_fee_or_validator_set(){
        let pid=Pubkey::new_unique();
        let rid=Pubkey::new_unique();
        let feeid=Pubkey::new_unique();
        let sender=Pubkey::new_unique();
        let asset=codec::evm_origin_asset_id(1643,[0;20],0).unwrap();
        let mut destination=[0u8;32];destination[31]=9;
        let route_hash=codec::route_id(
            asset,codec::SOLANA_DOMAIN,codec::XGR_DOMAIN,
            rid.to_bytes(),destination
        ).unwrap();
        let router=Router{
            tag:state::ROUTER_TAG,version:VERSION,bump:1,kind:2,
            creator:[7;32],mint:[5;32],asset_id:asset,salt:[2;32],decimals:9
        };
        let route=Route{
            tag:state::ROUTE_TAG,version:VERSION,bump:1,
            router:rid.to_bytes(),creator:[7;32],asset_id:asset,
            remote_router:destination,route_id:route_hash,
            destination_domain:codec::XGR_DOMAIN,fee_vault:feeid.to_bytes(),
        };
        let vault=FeeVault{
            tag:state::FEE_TAG,version:VERSION,bump:1,
            route_id:route_hash,allocated_lamports:0,validator_set_id:0
        };
        let mut dst=[0u8;32];dst[31]=23;
        let ok=plan_source(&pid,&rid,&feeid,&router,&route,&vault,
            &sender,dst,1_000_000_000,1,100,10_000,7).unwrap();
        assert_ne!(ok.message_id,[0;32]);
        assert_eq!(ok.source_fee_lamports,10_000);
        let changed=plan_source(&pid,&rid,&feeid,&router,&route,&vault,
            &sender,dst,1_000_000_000,2,100,10_000,7).unwrap();
        assert_ne!(changed.message_id,ok.message_id);
        assert!(plan_source(&pid,&rid,&feeid,&router,&route,&vault,
            &sender,dst,0,1,100,10_000,7).is_err());
        assert!(plan_source(&pid,&rid,&feeid,&router,&route,&vault,
            &sender,[3;32],1,1,100,10_000,7).is_err());
    }
}
