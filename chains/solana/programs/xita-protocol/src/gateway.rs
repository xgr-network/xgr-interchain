//! Direct-BLS prerequisite for enabling any native or token-value transfer.
//! Private custody CPI helpers MUST remain unreachable until the origin
//! operation, canonical route, fee epoch and current destination validator
//! quorum are all independently verified and atomically committed.
//!
//! No optimistic / trusting bridge transfer path is exposed on mainnet.
use crate::state::{FeeVault, Route, FEE_TAG, ROUTE_TAG, VERSION};
use solana_program::program_error::ProgramError;

#[derive(Debug,Clone,PartialEq,Eq)]
pub struct PendingMessage {
    pub route_id:[u8;32],
    pub message_id:[u8;32],
    pub amount_canonical:[u8;32],
    pub recipient:[u8;32],
    pub source_fee_lamports:u64,
    pub validator_set_id:u64,
}

/// Pure preflight, not approval for a CPI. A gateway must also atomically
/// dispatch the exact message, commit its ID and allocate the fee.
pub fn preflight_source_operation(
    route:&Route,fee:&FeeVault,operation:&PendingMessage,
    expected_validator_set_id:u64,current_source_fee:u64
)->Result<(),ProgramError> {
    if route.tag!=ROUTE_TAG||route.version!=VERSION||
       fee.tag!=FEE_TAG||fee.version!=VERSION||
       route.route_id!=fee.route_id ||
       route.route_id!=operation.route_id ||
       route.destination_domain!=crate::codec::XGR_DOMAIN ||
       operation.message_id==[0;32]||
       operation.amount_canonical==[0;32]||
       operation.recipient==[0;32]||
       operation.source_fee_lamports==0||
       operation.source_fee_lamports!=current_source_fee||
       expected_validator_set_id==0||
       operation.validator_set_id!=expected_validator_set_id {
        return Err(ProgramError::InvalidInstructionData)
    }
    Ok(())
}


#[derive(Debug,Clone,PartialEq,Eq)]
pub struct SourceIntent {
    pub nonce:u64,
    pub finalized_slot:u64,
    pub signer:[u8;32],
    pub recipient:[u8;32],
    pub amount_local:u64,
    pub fee_lamports:u64,
    pub set_id:u64,
}
/// Compute a source message identity exclusively from fixed, final-state
/// inputs. This does NOT submit a Bridge transaction, transfer collateral or
/// prove that an observed source operation actually took place.
pub fn prepare_source_message(
    program_id:[u8;32],
    router_id:[u8;32],
    vault_id:[u8;32],
    router:&crate::state::Router,
    route:&Route,
    vault:&FeeVault,
    intent:&SourceIntent,
)->Result<PendingMessage,ProgramError>{
    use crate::{codec,state::{ROUTER_TAG,VERSION}};
    use solana_program::keccak::hashv;
    let bad=||ProgramError::InvalidInstructionData;
    if program_id==[0;32]||router_id==[0;32]||vault_id==[0;32]||
       router.tag!=ROUTER_TAG||router.version!=VERSION||
       route.tag!=ROUTE_TAG||route.version!=VERSION||
       route.router!=router_id||route.asset_id!=router.asset_id||
       route.fee_vault!=vault_id||
       route.destination_domain!=codec::XGR_DOMAIN||
       vault.tag!=FEE_TAG||vault.version!=VERSION||
       vault.route_id!=route.route_id||
       intent.signer==[0;32]||intent.recipient==[0;32]||
       !codec::is_evm_address_32(&intent.recipient)||
       intent.nonce==0||intent.finalized_slot==0||
       intent.amount_local==0||intent.fee_lamports==0||
       intent.set_id==0||route.remote_router==[0;32]||
       codec::route_id(route.asset_id,codec::SOLANA_DOMAIN,
         codec::XGR_DOMAIN,router_id,route.remote_router)!=Some(route.route_id){
        return Err(bad())
    }
    let target_decimals=if router.kind==1 {
        router.decimals
    } else if router.kind==2&&
        router.asset_id==codec::evm_origin_asset_id(1643,[0u8;20],0)
            .ok_or_else(bad)? {
        18 // 9-decimal wrapped XGR to original XGR 18-decimal units
    }else {return Err(bad())};
    let canonical=codec::exact_scale_amount(
        intent.amount_local as u128,router.decimals,target_decimals,false
    ).ok_or_else(bad)?;
    let mut amount32=[0u8;32];
    amount32[16..].copy_from_slice(&canonical.to_be_bytes());
    let id=hashv(&[
        b"XITA_SOLANA_SOURCE_V1",
        &codec::GENESIS,
        &program_id,
        &router_id,
        &route.route_id,
        &intent.signer,
        &intent.recipient,
        &intent.nonce.to_be_bytes(),
        &intent.finalized_slot.to_be_bytes(),
        &amount32,
        &intent.fee_lamports.to_be_bytes(),
        &intent.set_id.to_be_bytes(),
    ]).to_bytes();
    let prepared=PendingMessage {
        route_id:route.route_id,message_id:id,amount_canonical:amount32,
        recipient:intent.recipient,source_fee_lamports:intent.fee_lamports,
        validator_set_id:intent.set_id,
    };
    preflight_source_operation(route,vault,&prepared,
        intent.set_id,intent.fee_lamports)?;
    Ok(prepared)
}

#[cfg(test)]
mod tests{
 use super::*;
 fn fixture()->(Route,FeeVault,PendingMessage){
  let route=Route{
   tag:ROUTE_TAG,version:VERSION,bump:1,router:[3;32],
   creator:[4;32],asset_id:[5;32],remote_router:[6;32],
   route_id:[7;32],destination_domain:1643,fee_vault:[8;32],
  };
  let fee=FeeVault{tag:FEE_TAG,version:VERSION,bump:1,
   route_id:[7;32],allocated_lamports:0,validator_set_id:0};
  let message=PendingMessage{
   route_id:[7;32],message_id:[9;32],amount_canonical:[11;32],
   recipient:[12;32],source_fee_lamports:100,validator_set_id:5,
  };
  (route,fee,message)
 }
 #[test]fn source_fee_route_and_quorum_epoch_must_match(){
  let (route,fee,msg)=fixture();
  assert!(preflight_source_operation(&route,&fee,&msg,5,100).is_ok());
  assert!(preflight_source_operation(&route,&fee,&msg,4,100).is_err());
  assert!(preflight_source_operation(&route,&fee,&msg,5,101).is_err());
  let mut wrong=msg.clone();wrong.route_id=[0;32];
  assert!(preflight_source_operation(&route,&fee,&wrong,5,100).is_err());
  let mut wrong_fee=fee.clone();wrong_fee.route_id=[1;32];
  assert!(preflight_source_operation(&route,&wrong_fee,&msg,5,100).is_err());
 }
 #[test]fn source_intent_is_bound_to_route_slot_amount_sender_and_fee(){
    use crate::{codec,state::{Router,ROUTER_TAG}};
    let program=[9u8;32];
    let router_id=[3u8;32];
    let vault_id=[8u8;32];
    let asset=codec::evm_origin_asset_id(1643,[0;20],0).unwrap();
    let mut remote=[0u8;32];remote[31]=0x81;
    let canonical=codec::route_id(asset,codec::SOLANA_DOMAIN,1643,
        router_id,remote).unwrap();
    let router=Router{tag:ROUTER_TAG,version:VERSION,bump:1,kind:2,
        creator:[1;32],mint:[2;32],asset_id:asset,salt:[4;32],decimals:9};
    let route=Route{tag:ROUTE_TAG,version:VERSION,bump:1,
        router:router_id,creator:[1;32],asset_id:asset,remote_router:remote,
        route_id:canonical,destination_domain:1643,fee_vault:vault_id};
    let fee=FeeVault{tag:FEE_TAG,version:VERSION,bump:1,
        route_id:canonical,allocated_lamports:0,validator_set_id:0};
    let mut recipient=[0u8;32];recipient[31]=42;
    let intent=SourceIntent{
        nonce:1,finalized_slot:1000,signer:[1u8;32],
        recipient,amount_local:1_000_000_000,
        fee_lamports:20000,set_id:7,
    };
    let main=prepare_source_message(program,router_id,vault_id,
        &router,&route,&fee,&intent).unwrap();
    let mut expected=[0u8;32];
    expected[16..].copy_from_slice(&1_000_000_000_000_000_000u128.to_be_bytes());
    assert_eq!(main.amount_canonical,expected);
    let mut changed=intent.clone();changed.finalized_slot+=1;
    assert_ne!(main.message_id,prepare_source_message(program,
        router_id,vault_id,&router,&route,&fee,&changed).unwrap().message_id);
    changed=intent.clone();changed.amount_local+=1;
    assert_ne!(main.message_id,prepare_source_message(program,
        router_id,vault_id,&router,&route,&fee,&changed).unwrap().message_id);
    changed=intent.clone();changed.fee_lamports+=1;
    assert_ne!(main.message_id,prepare_source_message(program,
        router_id,vault_id,&router,&route,&fee,&changed).unwrap().message_id);
    changed=intent.clone();changed.nonce=0;
    assert!(prepare_source_message(program,router_id,vault_id,
        &router,&route,&fee,&changed).is_err());
    changed=intent.clone();changed.recipient=[1u8;32];
    assert!(prepare_source_message(program,router_id,vault_id,
        &router,&route,&fee,&changed).is_err());
    let mut wrong=route;wrong.remote_router=[1u8;32];
    assert!(prepare_source_message(program,router_id,vault_id,
        &router,&wrong,&fee,&intent).is_err());
 }

}
