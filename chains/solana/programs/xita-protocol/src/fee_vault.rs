//! Solidity parity: XGRILNFeeVault epoch-scoped validator fee accounting.
//! This module is pure until validator identity and BLS quorum attestation
//! are available on-chain. No claims or transfers are exposed to users.
use crate::state::{FeeVault,FEE_TAG,VERSION};

pub fn initialized(v:&FeeVault)->bool {
 v.tag==FEE_TAG&&v.version==VERSION&&v.allocated_lamports==0&&v.validator_set_id==0
}

/// Mirrors the EVM round-robin remainder accounting for a single epoch.
/// Receivers and historical indices MUST come from a BLS authenticated set.
pub fn earned_for_epoch(
 total:u64,index_plus_one:usize,recipient_count:usize
)->Option<u64>{
 if recipient_count==0||index_plus_one==0||index_plus_one>recipient_count{
  return None;
 }
 let count=recipient_count as u64;
 Some(total/count+u64::from((index_plus_one as u64)<=total%count))
}
#[cfg(test)]
mod tests{
 use super::*;
 #[test]fn epoch_fee_allocation_is_exact(){
  let shares=(1..=3).map(|x|earned_for_epoch(10,x,3).unwrap()).collect::<Vec<_>>();
  assert_eq!(shares,vec![4,3,3]);
  assert_eq!(shares.iter().sum::<u64>(),10);
  assert_eq!(earned_for_epoch(10,0,3),None);
  assert_eq!(earned_for_epoch(10,4,3),None);
 }
}
