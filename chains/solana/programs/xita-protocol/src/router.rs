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
