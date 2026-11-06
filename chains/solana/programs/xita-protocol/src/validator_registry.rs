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
pub fn apply_membership_unavailable()->Result<(),ProgramError>{
 Err(crate::disabled())
}
#[cfg(test)]
mod tests{
 use super::*;
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
