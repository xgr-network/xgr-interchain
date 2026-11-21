//! Solidity parity: XGRILNFeeVault epoch-scoped validator fee accounting.
//!
//! Pure state-transition planning only: NO call from the public instruction
//! dispatcher and NO live lamport transfer or claim until the current set is
//! authenticated by Direct-BLS and source dispatch is atomic.
use crate::state::{FeeVault,FeeEpoch,OperationReceipt,FEE_TAG,EPOCH_TAG,RECEIPT_TAG,VERSION};
use solana_program::pubkey::Pubkey;

pub const EPOCH_SEED:&[u8]=b"xita-fee-epoch";
pub const RECEIPT_SEED:&[u8]=b"xita-fee-receipt";

pub fn initialized(v:&FeeVault)->bool {
 v.tag==FEE_TAG&&v.version==VERSION&&v.allocated_lamports==0&&v.validator_set_id==0
}
pub fn epoch_pda(program_id:&Pubkey,fee_vault:&Pubkey,set_id:u64)->(Pubkey,u8){
 Pubkey::find_program_address(
  &[EPOCH_SEED,fee_vault.as_ref(),&set_id.to_be_bytes()],program_id)
}
pub fn receipt_pda(
 program_id:&Pubkey,fee_vault:&Pubkey,message_id:&[u8;32]
)->(Pubkey,u8){
 Pubkey::find_program_address(
  &[RECEIPT_SEED,fee_vault.as_ref(),message_id],program_id)
}

/// Pure candidate. The caller MUST verify that the old receipt PDA is absent,
/// the live validator-set snapshot and recipient order are authenticated,
/// and the route dispatch, fee payment and receipt writes occur atomically.
/// Do not treat an arbitrary caller-supplied validator snapshot as proof.
pub fn plan_allocation(
 vault:&FeeVault,current_epoch:Option<&FeeEpoch>,
 prior_receipt:Option<&OperationReceipt>,
 route_id:[u8;32],message_id:[u8;32],
 set_id:u64,recipient_count:u32,amount:u64,epoch_bump:u8,
 receipt_bump:u8
)->Option<(FeeVault,FeeEpoch,OperationReceipt)>{
 if vault.tag!=FEE_TAG||vault.version!=VERSION||
  vault.route_id!=route_id||route_id==[0;32]||
  message_id==[0;32]||set_id==0||recipient_count==0||
  amount==0||prior_receipt.is_some()||
  (vault.validator_set_id!=0&&set_id<vault.validator_set_id){
  return None;
 }
 let next_vault_total=vault.allocated_lamports.checked_add(amount)?;
 let next_epoch=match current_epoch{
  Some(epoch)=>{
   if epoch.tag!=EPOCH_TAG||epoch.version!=VERSION||
    epoch.route_id!=route_id||epoch.set_id!=set_id||
    epoch.recipients!=recipient_count||epoch.bump!=epoch_bump{
    return None;
   }
   FeeEpoch{total_lamports:epoch.total_lamports.checked_add(amount)?,
    ..epoch.clone()}
  },
  None=>FeeEpoch{tag:EPOCH_TAG,version:VERSION,bump:epoch_bump,
   route_id,set_id,recipients:recipient_count,total_lamports:amount}
 };
 let updated_vault=FeeVault{
  allocated_lamports:next_vault_total,validator_set_id:set_id,..vault.clone()
 };
 let receipt=OperationReceipt{
  tag:RECEIPT_TAG,version:VERSION,bump:receipt_bump,
  route_id,message_id,set_id,fee_lamports:amount,
 };
 Some((updated_vault,next_epoch,receipt))
}

/// Mirrors Solidity's historical validator index and round-robin wei
/// remainder. The recipient list MUST be proven from the exact epoch.
pub fn earned_for_epoch(total:u64,index_plus_one:usize,recipient_count:usize)->Option<u64>{
 if recipient_count==0||index_plus_one==0||index_plus_one>recipient_count{
  return None;
 }
 let count=u64::try_from(recipient_count).ok()?;
 Some(total/count+u64::from((index_plus_one as u64)<=total%count))
}

#[cfg(test)]
mod tests{
 use super::*;
 fn sample()->FeeVault{
  FeeVault{tag:FEE_TAG,version:VERSION,bump:7,route_id:[1;32],
   allocated_lamports:0,validator_set_id:0}
 }
 #[test]fn epoch_fee_allocation_is_exact(){
  let shares=(1..=3).map(|x|earned_for_epoch(10,x,3).unwrap()).collect::<Vec<_>>();
  assert_eq!(shares,vec![4,3,3]);
  assert_eq!(shares.iter().sum::<u64>(),10);
  assert_eq!(earned_for_epoch(10,0,3),None);
  assert_eq!(earned_for_epoch(10,4,3),None);
 }
 #[test]fn fee_receipts_are_unique_per_route_and_message(){
  let pid=Pubkey::new_unique();
  let vault_a=Pubkey::new_unique();let vault_b=Pubkey::new_unique();
  let m=[3u8;32];let n=[4u8;32];
  assert_eq!(receipt_pda(&pid,&vault_a,&m).0,receipt_pda(&pid,&vault_a,&m).0);
  assert_ne!(receipt_pda(&pid,&vault_a,&m).0,receipt_pda(&pid,&vault_a,&n).0);
  assert_ne!(receipt_pda(&pid,&vault_a,&m).0,receipt_pda(&pid,&vault_b,&m).0);
  assert_ne!(epoch_pda(&pid,&vault_a,5).0,epoch_pda(&pid,&vault_a,6).0);
 }
 #[test]fn allocation_replay_wrong_set_and_overflow_fail_closed(){
  let vault=sample();
  let (a,ep,receipt)=plan_allocation(
   &vault,None,None,[1;32],[3;32],5,3,10,9,8
  ).unwrap();
  assert_eq!(a.allocated_lamports,10);
  assert_eq!(a.validator_set_id,5);
  assert_eq!(ep.total_lamports,10);
  assert_eq!(earned_for_epoch(ep.total_lamports,1,3),Some(4));
  assert!(plan_allocation(&a,Some(&ep),Some(&receipt),
   [1;32],[3;32],5,3,1,9,8).is_none());
  assert!(plan_allocation(&a,Some(&ep),None,
   [1;32],[4;32],5,4,1,9,8).is_none());
  let (b,ep2,_)=plan_allocation(&a,None,None,
   [1;32],[5;32],6,4,8,11,12).unwrap();
  assert_eq!(ep.total_lamports,10); // old epoch is immutable history
  assert_eq!(ep2.total_lamports,8);
  assert_eq!(ep2.set_id,6);
  assert_eq!(b.allocated_lamports,18);
  assert!(plan_allocation(&b,None,None,
   [1;32],[6;32],5,3,1,9,8).is_none());
  let near_limit=FeeVault{allocated_lamports:u64::MAX,..b};
  assert!(plan_allocation(&near_limit,None,None,
   [1;32],[7;32],7,4,1,11,12).is_none());
  assert!(plan_allocation(&a,None,None,
   [1;32],[0;32],6,4,8,11,12).is_none());
 }
}
