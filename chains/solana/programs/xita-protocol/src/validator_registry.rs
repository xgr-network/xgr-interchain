//! Solidity parity: XGRInterchainValidatorRegistryV3 validator membership.
//! Membership and quorum changes must be signed by the CURRENT set with
//! proven BLS key possession. This module cannot create a separate admin.
use solana_program::program_error::ProgramError;

pub fn threshold(count:usize)->Option<usize>{
 if count==0{return None;}
 count.checked_mul(2)?.checked_add(2).map(|v|v/3)
}
pub fn bitmap_has_quorum(bitmap:&[u8],count:usize)->bool{
 let needed=match threshold(count){Some(v)=>v,None=>return false};
 if bitmap.len()!=(count+7)/8 {return false;}
 let mut n=0;
 for (i,b) in bitmap.iter().enumerate(){
  if i==bitmap.len()-1 && count%8!=0{
   let mask=0xffu8 << (count%8);
   if *b&mask!=0{return false;}
  }
  n+=b.count_ones() as usize;
 }
 n>=needed
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
 }
}
