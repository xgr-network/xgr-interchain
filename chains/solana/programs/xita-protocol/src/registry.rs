//! Solidity parity: XGRILNRegistryV315 append-only route registry.
//! Each Route PDA is a single creator-owned append-only binding; no company
//! admin, route removal or third-party override.
use crate::state::{Route, ROUTE_TAG, VERSION};
use crate::factory::ROUTE_SEED;
use solana_program::pubkey::Pubkey;

pub fn validates_record(program_id:&Pubkey,record:&Route,
    source_router:&Pubkey,route_account:&Pubkey)->bool {
    if record.tag!=ROUTE_TAG||record.version!=VERSION||
       record.destination_domain!=crate::codec::XGR_DOMAIN||
       record.router!=source_router.to_bytes(){return false;}
    let (expected,bump)=Pubkey::find_program_address(
        &[ROUTE_SEED,source_router.as_ref(),
            &record.destination_domain.to_be_bytes()],program_id);
    expected==*route_account&&bump==record.bump
}

#[cfg(test)]
mod tests{
 use super::*;
 use crate::state::Route;
 #[test]fn route_pda_cannot_be_changed_to_other_router(){
  let program=Pubkey::new_unique();
  let source=Pubkey::new_unique();
  let (address,bump)=Pubkey::find_program_address(
   &[ROUTE_SEED,source.as_ref(),&crate::codec::XGR_DOMAIN.to_be_bytes()],&program);
  let item=Route{tag:ROUTE_TAG,version:VERSION,bump,
   router:source.to_bytes(),creator:[1;32],asset_id:[2;32],
   remote_router:[3;32],route_id:[4;32],destination_domain:1643,
   fee_vault:[5;32]};
  assert!(validates_record(&program,&item,&source,&address));
  assert!(!validates_record(&program,&item,&Pubkey::new_unique(),&address));
 }
}
