//! Solidity parity: guarded collateral/synthetic router interfaces.
//! Collateral route registration is enabled; actual escrow/transport and
//! synthetic mint/unlock remain disabled until proof-verified CPI is audited.
use crate::{state::{Router,Route,ROUTER_TAG,ROUTE_TAG,VERSION},codec};
use solana_program::pubkey::Pubkey;

pub fn is_owner(router:&Router,creator:&Pubkey)->bool{
 router.tag==ROUTER_TAG&&router.version==VERSION&&
 router.creator==creator.to_bytes()
}
pub fn is_canonical_inbound(
 router:&Router,route:&Route,destination_domain:u32,
 remote_router:[u8;32]
)->bool{
 router.tag==ROUTER_TAG&&route.tag==ROUTE_TAG&&
 router.asset_id==route.asset_id&&route.router!=[0;32]&&
 route.destination_domain==destination_domain&&route.remote_router==remote_router&&
 codec::route_id(route.asset_id,codec::SOLANA_DOMAIN,destination_domain,
    route.router,route.remote_router)==Some(route.route_id)
}

/// Runtime guard for an SPL collateral vault: Token account must be owned by
/// router PDA, use exactly the creator's asset mint, and have no delegate.
pub fn valid_collateral_vault(
 router:&Router,router_key:&Pubkey,vault_key:&Pubkey,vault:&spl_token::state::Account,
 program_id:&Pubkey,
)->bool{
 use solana_program::program_option::COption;
 let (expected,_)=crate::factory::collateral_vault_address(program_id,router_key);
 router.tag==ROUTER_TAG&&router.version==VERSION&&router.kind==1&&
 expected==*vault_key&&vault.owner==*router_key&&
 vault.mint==Pubkey::new_from_array(router.mint)&&
 vault.delegate==COption::None&&vault.delegated_amount==0&&
 vault.state==spl_token::state::AccountState::Initialized
}
