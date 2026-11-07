//! Solidity parity: XGRInterchainValidatorRegistryV3 validator membership.
//! Membership and quorum changes must be signed by the CURRENT set with
//! proven BLS key possession. This module cannot create a separate admin.
use solana_program::program_error::ProgramError;

pub fn threshold(count:usize)->Option<usize>{
 if count==0{return None;}
 count.checked_mul(2)?.checked_add(2).map(|v|v/3)
}
/// Solidity V3 uses *big-endian* bitmap bytes: the least significant
/// validator index is the rightmost byte. Leading zero bytes are invalid.
/// Historical validator membership must use this same bit-index convention.
pub fn bitmap_member(bitmap:&[u8],validator_index:usize)->bool {
 let offset=validator_index/8;
 if offset>=bitmap.len(){return false;}
 bitmap[bitmap.len()-1-offset]&(1u8<<(validator_index%8))!=0
}
pub fn bitmap_has_quorum(bitmap:&[u8],count:usize)->bool{
 let needed=match threshold(count){Some(v)=>v,None=>return false};
 if bitmap.is_empty()||bitmap.len()>(count+7)/8||bitmap[0]==0 {return false;}
 let mut included=0;
 for index in 0..count {
  if bitmap_member(bitmap,index){included+=1;}
 }
 for index in count..bitmap.len()*8 {
  if bitmap_member(bitmap,index){return false;}
 }
 included>=needed
}
/// Reference mirror of Solidity XGRInterchainValidatorRegistryV3
/// `validatorSetCommitment[setId]`. This computes a HASH ONLY: it cannot
/// establish a trusted genesis validator set or legitimate membership update.
///
/// Solidity commitment:
/// keccak256("XGR_INTERCHAIN_SET_V2" || uint256(N))
/// then for each validator in exact on-chain order:
/// keccak256(previousHash || 20-byte-validator-address ||
///           keccak256(48-byte-compressed-G1)).
pub struct XgrValidatorIdentity{
 pub validator:[u8;20],
 pub compressed_key:[u8;48],
 pub eip2537_key:[u8;128],
}
pub fn xgr_set_commitment(
 validators:&[XgrValidatorIdentity]
)->Option<[u8;32]>{
 use solana_program::keccak::hashv;
 if validators.is_empty()||validators.len()>u32::MAX as usize{return None;}
 let mut count=[0u8;32];
 count[24..].copy_from_slice(&(validators.len() as u64).to_be_bytes());
 let mut commitment=hashv(&[b"XGR_INTERCHAIN_SET_V2",&count]).to_bytes();
 for (i,identity) in validators.iter().enumerate(){
  if identity.validator==[0u8;20] ||
     validators[..i].iter().any(|p|p.validator==identity.validator ||
       p.compressed_key==identity.compressed_key){
   return None;
  }
  let point=crate::bls_crypto::decode_eip2537_g1(&identity.eip2537_key)?;
  if point.to_compressed()!=identity.compressed_key {
   return None;
  }
  let key_hash=hashv(&[&identity.compressed_key]).to_bytes();
  commitment=hashv(&[&commitment,&identity.validator,&key_hash]).to_bytes();
 }
 Some(commitment)
}
pub fn apply_membership_unavailable()->Result<(),ProgramError>{
 Err(crate::disabled())
}
#[cfg(test)]
mod tests{
 use super::*;
 #[test]fn xgr_commitment_matches_solidity_v3_packed_logic(){
  use bls12_381::{G1Affine,G1Projective,Scalar};
  use solana_program::keccak::hashv;
  fn identity(v:u8,scalar:u64)->XgrValidatorIdentity{
   let point=G1Affine::from(G1Projective::generator()*Scalar::from(scalar));
   let raw=point.to_uncompressed();
   let mut eip2537_key=[0u8;128];
   eip2537_key[16..64].copy_from_slice(&raw[..48]);
   eip2537_key[80..].copy_from_slice(&raw[48..]);
   let mut validator=[0u8;20];validator[19]=v;
   XgrValidatorIdentity{
    validator,compressed_key:point.to_compressed(),eip2537_key
   }
  }
  let a=identity(1,17);
  let b=identity(2,23);
  let mut count=[0u8;32];count[31]=2;
  let initial=hashv(&[b"XGR_INTERCHAIN_SET_V2",&count]).to_bytes();
  let a_hash=hashv(&[&a.compressed_key]).to_bytes();
  let after_a=hashv(&[&initial,&a.validator,&a_hash]).to_bytes();
  let b_hash=hashv(&[&b.compressed_key]).to_bytes();
  let expected=hashv(&[&after_a,&b.validator,&b_hash]).to_bytes();
  let computed=xgr_set_commitment(&[a,b]).unwrap();
  assert_eq!(computed,expected);
  assert!(xgr_set_commitment(&[]).is_none());
  let first=identity(1,17);
  let mut wrong=identity(1,23);
  assert!(xgr_set_commitment(&[first,wrong]).is_none());
  let a=identity(1,17);
  wrong.validator[19]=3;
  wrong.compressed_key[10]^=1;
  assert!(xgr_set_commitment(&[a,wrong]).is_none());
  let a=identity(1,17);
  let b=identity(2,23);
  assert_ne!(computed,xgr_set_commitment(&[b,a]).unwrap());
 }
 #[test]fn exact_quorum_and_no_excess_bitmap(){
  assert_eq!(threshold(1),Some(1));
  assert_eq!(threshold(3),Some(2));
  assert_eq!(threshold(4),Some(3));
  assert_eq!(threshold(0),None);
  assert!(bitmap_has_quorum(&[0b0000_0011],3));
  assert!(!bitmap_has_quorum(&[0b0000_0001],3));
  assert!(!bitmap_has_quorum(&[0b1000_0011],3));
  assert!(!bitmap_has_quorum(&[],3));
  // V3 accepts minimally encoded big-endian bytes; never leading padding.
  assert!(bitmap_has_quorum(&[0x01,0xff],9));
  assert!(bitmap_member(&[0x01,0x00],8));
  assert!(!bitmap_member(&[0x01,0x00],0));
  assert!(!bitmap_has_quorum(&[0x00,0x03],9));
  assert!(!bitmap_has_quorum(&[0x02,0xff],9));
 }
}
