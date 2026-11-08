//! Destination-side immutable replay, historical Direct-BLS and
//! guarded SPL synthetic mint/collateral unlock. No company operator.
//! All source claims are attested by the correct historical XGR validator
//! snapshot; the calldata cannot substitute any validator list.
//!
//! Only one canonical Solana router, its reverse XGR route identity and
//! the program-derived synthetic-mint authority can be used.
//! This DOES NOT replace the node's independent verification of XGR-chain
//! finality, XGR escrow/burn, source fee and event evidence.
use crate::{
    codec::{self,Authorization},collateral,direct_bls_ism,factory,registry,state,
    trusted_validators,
    state::{InboundReceipt,Router,Route,INBOUND_RECEIPT_TAG,VERSION},
};
use borsh::BorshSerialize;
use solana_program::{
    account_info::{next_account_info,AccountInfo},
    entrypoint::ProgramResult,
    program::{invoke_signed},
    program_error::ProgramError,
    program_option::COption,
    program_pack::Pack,
    pubkey::Pubkey,
    rent::Rent,
    sysvar::{self,Sysvar},
};
use spl_token::state::{Mint,Account as SplAccount,AccountState};
pub const INBOUND_SEED:&[u8]=b"xita-inbound-receipt";
pub fn receipt_pda(program:&Pubkey,message_id:&[u8;32])->(Pubkey,u8){
    Pubkey::find_program_address(&[INBOUND_SEED,message_id],program)
}

/// Checked input for the destination, independent of cryptography. Remote
/// EVM source is always the immutable XGR hub/router paired at registration.
/// The signed destination ISM and registry are native program and PDA
/// identities, never chosen by the caller. Amount conversion is exact.
pub fn preflight(
    program:&Pubkey,
    router_id:&Pubkey,
    router:&Router,
    route:&Route,
    auth:&Authorization,
)->Result<u64,ProgramError>{
    let bad=||ProgramError::InvalidInstructionData;
    let source=route.remote_router;
    let dest=router_id.to_bytes();
    if router.tag!=state::ROUTER_TAG ||router.version!=VERSION||
       route.tag!=state::ROUTE_TAG||route.version!=VERSION||
       route.router!=dest||route.asset_id!=router.asset_id||
       route.destination_domain!=codec::XGR_DOMAIN||
       !codec::is_evm_address_32(&source) ||
       auth.source_domain!=codec::XGR_DOMAIN||
       auth.destination_domain!=codec::SOLANA_DOMAIN||
       auth.asset_id!=router.asset_id ||
       auth.source_router!=source ||
       auth.gateway!=source ||
       auth.source_mailbox!=source ||
       auth.destination_router!=dest ||
       auth.destination_ism!=program.to_bytes() ||
       auth.destination_registry!=trusted_validators::trusted_pda(program).0.to_bytes() ||
       auth.source_registry==[0;32] ||
       !codec::is_evm_address_32(&auth.source_registry) ||
       auth.source_height==0||auth.message_id==[0;32] ||
       auth.validator_fee==[0;32]||auth.recipient==[0;32]||
       auth.set_id==0 ||
       auth.route_id!=codec::route_id(
           auth.asset_id,codec::XGR_DOMAIN,codec::SOLANA_DOMAIN,
           source,dest
       ).ok_or_else(bad)? ||
       codec::route_id(
           route.asset_id,codec::SOLANA_DOMAIN,codec::XGR_DOMAIN,
           dest,source
       )!=Some(route.route_id){
        return Err(bad())
    }
    // The original XGR asset arrives in EVM-native 18 decimal units.
    // Solana-origin SPL collateral returns in its native mint units.
    let origin_decimals=if router.kind==2 {
        if router.asset_id!=codec::evm_origin_asset_id(
            1643,[0u8;20],0
        ).ok_or_else(bad)? {
            return Err(bad())
        }
        18u8
    }else if router.kind==1{
        if codec::asset_id(router.mint,1)!=Some(router.asset_id) {
            return Err(bad())
        }
        router.decimals
    }else {return Err(bad())};
    if auth.amount[..16]!=[0u8;16] {return Err(bad())}
    let mut encoded=[0u8;16];
    encoded.copy_from_slice(&auth.amount[16..]);
    let quantity=u128::from_be_bytes(encoded);
    let local=codec::exact_scale_amount(
        quantity,origin_decimals,router.decimals,true
    ).ok_or_else(bad)?;
    u64::try_from(local).map_err(|_|bad())
}
/// Accounts: rent payer(signer,w), router PDA, outbound Route PDA,
/// immutable historical XGR validator epoch PDA, inbound replay receipt(w),
/// SPL mint, destination token account(w), destination wallet,
/// collateral vault(w)/router PDA for synthetic, SPL token program,
/// System Program, Rent sysvar.
///
/// Recipient in the signed authorization is a Solana *wallet*, never a
/// user-selected token-account address. Destination account must be owned
/// by the authorized wallet, match mint and have no delegated authority.
pub fn execute(
    program_id:&Pubkey,accounts:&[AccountInfo],auth:Authorization,
    bitmap:Vec<u8>,compressed_signature:Vec<u8>,hash_witness:Vec<u8>,
)->ProgramResult{
    let bad=||ProgramError::InvalidInstructionData;
    let mut it=accounts.iter();
    let payer=next_account_info(&mut it)?;
    let router_account=next_account_info(&mut it)?;
    let route_account=next_account_info(&mut it)?;
    let historical=next_account_info(&mut it)?;
    let receipt=next_account_info(&mut it)?;
    let mint=next_account_info(&mut it)?;
    let destination=next_account_info(&mut it)?;
    let recipient_wallet=next_account_info(&mut it)?;
    let collateral_vault=next_account_info(&mut it)?;
    let token_program=next_account_info(&mut it)?;
    let system=next_account_info(&mut it)?;
    let rent_account=next_account_info(&mut it)?;
    if !payer.is_signer||!payer.is_writable||
       !receipt.is_writable||!destination.is_writable||
       *token_program.key!=spl_token::id()||!token_program.executable||
       *system.key!=solana_program::system_program::id()||
       !system.executable||*rent_account.key!=sysvar::rent::id(){
        return Err(bad())
    }
    let router:Router=state::load(router_account,program_id)?;
    let route:Route=state::load(route_account,program_id)?;
    if !registry::validates_record(
        program_id,&route,router_account.key,route_account.key
    ) {return Err(ProgramError::InvalidAccountData);}
    let creator=Pubkey::new_from_array(router.creator);
    let (router_address,bump)=if router.kind==1 {
        Pubkey::find_program_address(
            &[factory::ROUTER_SEED,creator.as_ref(),&router.salt,mint.key.as_ref()],
            program_id
        )
    }else if router.kind==2 {
        Pubkey::find_program_address(
            &[factory::SYNTH_ROUTER_SEED,creator.as_ref(),&router.asset_id,&router.salt],
            program_id
        )
    }else {return Err(bad())};
    if router_address!=*router_account.key||router.bump!=bump||
       router.mint!=mint.key.to_bytes(){return Err(ProgramError::InvalidSeeds);}
    let local_amount=preflight(
        program_id,router_account.key,&router,&route,&auth
    )?;
    if auth.recipient!=recipient_wallet.key.to_bytes() {
        return Err(bad())
    }
    if *receipt.key!=receipt_pda(program_id,&auth.message_id).0 ||
       receipt.owner!=&solana_program::system_program::id()||
       !receipt.data_is_empty(){
        return Err(ProgramError::AccountAlreadyInitialized)
    }
    if *mint.owner!=spl_token::id()||
       *destination.owner!=spl_token::id(){
        return Err(ProgramError::IncorrectProgramId)
    }
    let mint_state=Mint::unpack(&mint.try_borrow_data()?)?;
    let dest_state=SplAccount::unpack(&destination.try_borrow_data()?)?;
    if !mint_state.is_initialized||mint_state.decimals!=router.decimals||
       dest_state.owner!=*recipient_wallet.key ||
       dest_state.mint!=*mint.key ||
       dest_state.state!=AccountState::Initialized||
       dest_state.delegate!=COption::None ||
       dest_state.delegated_amount!=0 ||
       dest_state.amount.checked_add(local_amount).is_none(){
        return Err(ProgramError::InvalidAccountData)
    }
    // Historical snapshot is an *immutable program-owned* account keyed by
    // setId and cryptographically anchored to the genuine XGR bootstrap.
    // The validator signatures authenticate the exact message and route.
    let valid=direct_bls_ism::verify_native_with_history_pda(
        program_id,historical,&auth,&bitmap,
        &compressed_signature,&hash_witness
    )?;
    if !valid{return Err(bad());}

    if router.kind==1 {
        collateral::unlock_when_inbound_verified(
            program_id,&router,router_account.key,collateral_vault,
            mint,destination,router_account,token_program,local_amount
        )?;
    }else {
        if *collateral_vault.key!=*router_account.key ||
           mint_state.freeze_authority!=COption::None||
           mint_state.mint_authority!=COption::Some(*router_account.key)||
           *mint.key!=Pubkey::find_program_address(
               &[factory::SYNTH_MINT_SEED,router_account.key.as_ref()],
               program_id
           ).0 {return Err(ProgramError::InvalidAccountData);}
        let ix=spl_token::instruction::mint_to_checked(
            &spl_token::id(),mint.key,destination.key,
            router_account.key,&[],local_amount,router.decimals
        )?;
        let seeds=&[
            factory::SYNTH_ROUTER_SEED,creator.as_ref(),
            router.asset_id.as_ref(),router.salt.as_ref(),
            &[router.bump],
        ];
        invoke_signed(&ix,&[
            mint.clone(),destination.clone(),router_account.clone(),
            token_program.clone()
        ],&[seeds])?;
    }

    let proof_receipt=InboundReceipt{
        tag:INBOUND_RECEIPT_TAG,version:VERSION,
        message_id:auth.message_id,route_id:auth.route_id,
        recipient:auth.recipient,amount_local:local_amount,
        verified_set_id:auth.set_id,source_height:auth.source_height,
        router:router_account.key.to_bytes(),
    };
    let bytes=borsh::to_vec(&proof_receipt)
        .map_err(|_|ProgramError::InvalidAccountData)?;
    let rent=Rent::from_account_info(rent_account)?;
    factory::create_pda(
        program_id,payer,receipt,system,&rent,
        &[INBOUND_SEED,&auth.message_id],bytes.len(),program_id
    )?;
    state::save(receipt,program_id,&proof_receipt)
}
#[cfg(test)]
mod tests{
    use super::*;
    fn fixture()->(Pubkey,Pubkey,Router,Route,Authorization){
        let program=Pubkey::new_unique();
        let creator=Pubkey::new_unique();
        let asset=codec::evm_origin_asset_id(1643,[0;20],0).unwrap();
        let salt=[4u8;32];
        let (router_key,bump)=Pubkey::find_program_address(
            &[factory::SYNTH_ROUTER_SEED,creator.as_ref(),&asset,&salt],
            &program
        );
        let (mint,_)=Pubkey::find_program_address(
            &[factory::SYNTH_MINT_SEED,router_key.as_ref()],&program
        );
        let mut xgr_router=[0u8;32];xgr_router[31]=29;
        let outbound=codec::route_id(
            asset,codec::SOLANA_DOMAIN,codec::XGR_DOMAIN,
            router_key.to_bytes(),xgr_router
        ).unwrap();
        let inbound=codec::route_id(
            asset,codec::XGR_DOMAIN,codec::SOLANA_DOMAIN,
            xgr_router,router_key.to_bytes()
        ).unwrap();
        let router=Router{
            tag:state::ROUTER_TAG,version:VERSION,bump,kind:2,
            creator:creator.to_bytes(),mint:mint.to_bytes(),
            asset_id:asset,salt,decimals:9
        };
        let route=Route{
            tag:state::ROUTE_TAG,version:VERSION,bump:5,
            router:router_key.to_bytes(),creator:creator.to_bytes(),
            asset_id:asset,remote_router:xgr_router,route_id:outbound,
            destination_domain:codec::XGR_DOMAIN,
            fee_vault:[7u8;32],
        };
        let auth=Authorization{
            source_domain:codec::XGR_DOMAIN,
            destination_domain:codec::SOLANA_DOMAIN,
            asset_id:asset,route_id:inbound,
            set_id:7,source_height:210,
            source_registry:xgr_router,gateway:xgr_router,
            source_router:xgr_router,source_mailbox:xgr_router,
            destination_router:router_key.to_bytes(),
            validator_fee:[7u8;32],message_id:[12u8;32],
            recipient:[9u8;32],
            amount:{
                let mut b=[0u8;32];
                b[16..].copy_from_slice(&1_000_000_000_000_000_000u128.to_be_bytes());
                b
            },
            destination_ism:program.to_bytes(),
            destination_registry:trusted_validators::trusted_pda(&program).0.to_bytes(),
        };
        (program,router_key,router,route,auth)
    }
    #[test]fn inbound_genuine_xgr_wxgr_is_exactly_scaled(){
        let (pid,rid,router,route,a)=fixture();
        assert_eq!(preflight(&pid,&rid,&router,&route,&a).unwrap(),1_000_000_000);
        assert!(codec::signing_preimage(&a).is_some());
    }
    #[test]fn inbound_rejects_retargeted_recipient_route_isms_epoch_and_dust(){
        let (pid,rid,router,route,a)=fixture();
        let mut wrong=a.clone();wrong.destination_router=[42;32];
        assert!(preflight(&pid,&rid,&router,&route,&wrong).is_err());
        wrong=a.clone();wrong.source_router=[12;32];
        assert!(preflight(&pid,&rid,&router,&route,&wrong).is_err());
        wrong=a.clone();wrong.gateway=[12;32];
        assert!(preflight(&pid,&rid,&router,&route,&wrong).is_err());
        wrong=a.clone();wrong.source_registry=[12;32];
        assert!(preflight(&pid,&rid,&router,&route,&wrong).is_err());
        wrong=a.clone();wrong.destination_ism=Pubkey::new_unique().to_bytes();
        assert!(preflight(&pid,&rid,&router,&route,&wrong).is_err());
        wrong=a.clone();wrong.destination_registry=[12;32];
        assert!(preflight(&pid,&rid,&router,&route,&wrong).is_err());
        wrong=a.clone();wrong.amount=[0;32];wrong.amount[31]=1;
        assert!(preflight(&pid,&rid,&router,&route,&wrong).is_err());
        let mut wrong_route=route;wrong_route.remote_router=[8;32];
        assert!(preflight(&pid,&rid,&router,&wrong_route,&a).is_err());
        assert_ne!(receipt_pda(&pid,&a.message_id).0,
            receipt_pda(&pid,&[11;32]).0);
    }
}
