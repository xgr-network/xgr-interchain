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
}
