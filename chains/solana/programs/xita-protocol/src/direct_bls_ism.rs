//! Solidity parity: XITADirectBLSISM.verify.
//!
//! Two distinct security checks:
//! (1) offline/testable structural preflight (implemented here), and
//! (2) BLS12-381 pairing/hash-to-G2 over a trusted, current validator-set
//!     PDA (NOT YET IMPLEMENTED; verify() ALWAYS fails closed).
//!
//! A signer bitmap or matching hash alone must never authorize mint/unlock.
use crate::{codec::{Authorization, signing_preimage},validator_registry};
use solana_program::program_error::ProgramError;

/// EVM XGRInterchainBLSVerifier uses EIP-2537 G1=128 bytes, G2=256 bytes
/// with BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_POP_.
pub const G1_EIP2537_LEN:usize=128;
pub const G2_EIP2537_LEN:usize=256;
pub const BLS_DST:&[u8]=b"BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_POP_";

/// A validator-set view passed in for structural checks; it is NOT
/// authenticated state. Only an account loaded from an immutable program PDA
/// and updated by a verified current-set quorum may be trusted on-chain.
pub struct UntrustedSnapshot<'a> {
 pub set_id:u64,
 pub public_keys:&'a [[u8;G1_EIP2537_LEN]],
}

/// Cheap rejection path only, never a substitute for a signature pairing.
pub fn structural_preflight(
 authorization:&Authorization,
 snapshot:&UntrustedSnapshot<'_>,
 bitmap:&[u8],
 signature:&[u8],
)->Result<(),ProgramError> {
 if authorization.destination_domain!=crate::codec::SOLANA_DOMAIN ||
    authorization.set_id==0 ||
    authorization.set_id!=snapshot.set_id ||
    snapshot.public_keys.is_empty() ||
    signature.len()!=G2_EIP2537_LEN ||
    !signature.iter().any(|x|*x!=0) ||
    !validator_registry::bitmap_has_quorum(bitmap,snapshot.public_keys.len()) ||
    signing_preimage(authorization).is_none() {
  return Err(ProgramError::InvalidInstructionData)
 }
 for (i,key) in snapshot.public_keys.iter().enumerate() {
  if !key.iter().any(|x|*x!=0) {
   return Err(ProgramError::InvalidAccountData)
  }
  for prior in snapshot.public_keys[..i].iter() {
   if prior==key {return Err(ProgramError::InvalidAccountData)}
  }
 }
 Ok(())
}

/// Production verification MUST use a BLS12-381 syscall or audited SVM
/// implementation to aggregate G1 keys, hash to G2 with exact XGR DST, check
/// non-infinity/subgroup membership and verify both pairings against the
/// *authenticated current* validator set. Not an off-chain trust shortcut.
pub fn verify(_authorization:&Authorization,_bitmap:&[u8],_signature:&[u8])
 -> Result<bool,ProgramError> {
 Err(crate::disabled())
}
/// Full CRYPTOGRAPHIC verification against an explicitly untrusted in-memory
/// view. This is available for offline reference tests ONLY. Its caller must
/// first prove the snapshot is loaded from an authenticated PDA whose current
/// set transition history is checked on-chain. Without that trust anchor,
/// even a mathematically valid signature could mint unbacked assets.
///
/// The public program verify() deliberately remains disabled pending:
///  - independently verified current validator-set PDA and PoP status,
///  - trusted source escrow/fee operation and canonical route/replay binding,
///  - SBF compute-unit proof for on-chain hash-to-G2 / pairing.
pub fn verify_cryptography_against_snapshot(
 authorization:&Authorization,
 snapshot:&UntrustedSnapshot<'_>,
 bitmap:&[u8],
 signature:&[u8],
)->Result<bool,ProgramError>{
 structural_preflight(authorization,snapshot,bitmap,signature)?;
 let message=signing_preimage(authorization)
    .ok_or(ProgramError::InvalidInstructionData)?;
 Ok(crate::bls_crypto::verify_eip2537_quorum(
    &message,snapshot.public_keys,bitmap,signature
 ))
}
/// Security boundary for the eventual SVM verifier. The caller cannot
/// supply a substitute validator list: the keys must be read from the
/// immutable, program-owned XGR registry PDA and match the pinned bootstrap
/// registry address. The pure Rust BLS backend here is a reference verifier;
/// it must not be used as a live SBF transfer authorization until the native
/// syscall backend and complete gateway have been separately CU-tested.
pub fn verify_against_trusted_pda(
    program_id:&solana_program::pubkey::Pubkey,
    validator_account:&solana_program::account_info::AccountInfo,
    anchor:&crate::trusted_validators::ImmutableAnchor,
    authorization:&Authorization,
    bitmap:&[u8],signature:&[u8],
)->Result<bool,ProgramError>{
    let snapshot=crate::trusted_validators::load_current_set(
        validator_account,program_id,anchor
    )?;
    if authorization.set_id!=snapshot.set_id ||
       authorization.destination_domain!=crate::codec::SOLANA_DOMAIN{
        return Err(ProgramError::InvalidInstructionData)
    }
    let keys:Vec<[u8;G1_EIP2537_LEN]>=snapshot.members.iter()
        .map(|v|v.eip2537_key).collect();
    verify_cryptography_against_snapshot(
        authorization,&UntrustedSnapshot{
            set_id:snapshot.set_id,public_keys:&keys
        },bitmap,signature
    )
}
/// Native Agave 4 SBF verifier gate, pinned to the actual current
/// program-owned XGR validator-set PDA. Signature/witness are compressed
/// Solana BLS forms, not EIP-2537 calldata. No public transfer instruction
/// calls this until XGR bootstrap is anchored, and route/balance/replay gates
/// are integrated and tested under the complete SBF budget.
pub fn verify_native_with_trusted_pda(
    program_id:&solana_program::pubkey::Pubkey,
    validator_account:&solana_program::account_info::AccountInfo,
    authorization:&Authorization,
    bitmap:&[u8],compressed_signature:&[u8],witness:&[u8],
)->Result<bool,ProgramError>{
    let anchor=crate::trusted_validators::ImmutableAnchor::compiled()?;
    let snapshot=crate::trusted_validators::load_current_set(
        validator_account,program_id,&anchor
    )?;
    crate::bls_sbf::verify_direct(
        authorization,&snapshot,bitmap,compressed_signature,witness
    )
}
pub fn signing_bytes(authorization:&Authorization)->Option<Vec<u8>>{
 signing_preimage(authorization)
}

#[cfg(test)]
mod tests{
 use super::*;
 use crate::codec;
 fn vector()->Authorization{
  let asset=codec::evm_origin_asset_id(1643,[0;20],0).unwrap();
  let mut source=[0u8;32];source[30]=0xa1;source[31]=0x1c;
  let dest=[11u8;32];
  let route=codec::route_id(asset,1643,codec::SOLANA_DOMAIN,source,dest).unwrap();
  let mut reg=[0u8;32];reg[31]=1;
  Authorization{
   source_domain:1643,destination_domain:codec::SOLANA_DOMAIN,
   asset_id:asset,route_id:route,set_id:7,source_height:123,
   source_registry:reg,gateway:reg,source_router:source,source_mailbox:reg,
   destination_router:dest,validator_fee:[0;32],
   message_id:[12;32],recipient:[13;32],amount:[14;32],
   destination_ism:[15;32],destination_registry:[16;32],
  }
 }
 #[test]fn quorum_snapshot_and_signed_domain_bound_before_pairing(){
  let mut a=vector();a.validator_fee[31]=1;
  let keys=[[1u8;G1_EIP2537_LEN],[2u8;G1_EIP2537_LEN],[3u8;G1_EIP2537_LEN]];
  let view=UntrustedSnapshot{set_id:7,public_keys:&keys};
  let sig=[9u8;G2_EIP2537_LEN];
  assert!(structural_preflight(&a,&view,&[0b011],&sig).is_ok());
  assert!(structural_preflight(&a,&view,&[0b001],&sig).is_err());
  assert!(structural_preflight(&a,&view,&[0b1111],&sig).is_err());
  assert!(structural_preflight(&a,&view,&[0b011],&[]).is_err());
  assert!(structural_preflight(&a,&view,&[0b011],&[0u8;G2_EIP2537_LEN]).is_err());
  assert!(verify(&a,&[0b011],&sig).is_err()); // zero false authority
  let mut wrong=a;wrong.set_id+=1;
  assert!(structural_preflight(&wrong,&view,&[0b011],&sig).is_err());
  wrong.set_id=7;wrong.destination_domain=codec::XGR_DOMAIN;
  assert!(structural_preflight(&wrong,&view,&[0b011],&sig).is_err());
 }
 #[test]fn genuine_xita_direct_authorization_is_cryptographically_bound(){
  use bls12_381::{Scalar,G1Projective,G1Affine,G2Projective,G2Affine,
    hash_to_curve::{HashToCurve,ExpandMsgXmd}};
  use sha2::Sha256;
  fn eip_g1(p:G1Affine)->[u8;G1_EIP2537_LEN]{
   let b=p.to_uncompressed();
   let mut x=[0u8;G1_EIP2537_LEN];
   x[16..64].copy_from_slice(&b[..48]);x[80..128].copy_from_slice(&b[48..]);
   x
  }
  fn eip_g2(p:G2Affine)->[u8;G2_EIP2537_LEN]{
   let b=p.to_uncompressed();
   let mut x=[0u8;G2_EIP2537_LEN];
   x[16..64].copy_from_slice(&b[48..96]);
   x[80..128].copy_from_slice(&b[..48]);
   x[144..192].copy_from_slice(&b[144..]);
   x[208..256].copy_from_slice(&b[96..144]);
   x
  }
  let mut auth=vector();
  auth.validator_fee[31]=100;
  let message=signing_preimage(&auth).unwrap();
  assert_eq!(message.len(),501);
  let secret=[Scalar::from(11u64),Scalar::from(29u64),Scalar::from(47u64)];
  let keys=secret.map(|s|eip_g1(G1Affine::from(G1Projective::generator()*s)));
  let hash=<G2Projective as HashToCurve<ExpandMsgXmd<Sha256>>>::hash_to_curve(
    &message,BLS_DST
  );
  let signature=eip_g2(G2Affine::from(hash*(secret[0]+secret[2])));
  let snapshot=UntrustedSnapshot{set_id:auth.set_id,public_keys:&keys};
  assert_eq!(verify_cryptography_against_snapshot(
   &auth,&snapshot,&[0b101],&signature),Ok(true));
  assert!(verify_cryptography_against_snapshot(
   &auth,&snapshot,&[0b011],&signature)!=Ok(true));
  let mut changed=vector();changed.validator_fee[31]=101;
  assert!(verify_cryptography_against_snapshot(
   &changed,&snapshot,&[0b101],&signature)!=Ok(true));
  let mut changed=auth.clone();changed.message_id[0]^=1;
  assert!(verify_cryptography_against_snapshot(
   &changed,&snapshot,&[0b101],&signature)!=Ok(true));
  let mut changed=auth.clone();changed.recipient[0]^=1;
  assert!(verify_cryptography_against_snapshot(
   &changed,&snapshot,&[0b101],&signature)!=Ok(true));
  let mut changed=auth.clone();changed.set_id+=1;
  assert!(verify_cryptography_against_snapshot(
   &changed,&snapshot,&[0b101],&signature).is_err());
  let mut wrong=auth.clone();wrong.route_id[0]^=1;
  assert!(verify_cryptography_against_snapshot(
   &wrong,&snapshot,&[0b101],&signature).is_err());
  assert!(verify(&auth,&[0b101],&signature).is_err());
 }
 #[test]fn invalid_keys_are_rejected_before_pairing(){
  let mut a=vector();a.validator_fee[31]=1;
  let sig=[9u8;G2_EIP2537_LEN];
  let zero=[[0u8;G1_EIP2537_LEN],[2u8;G1_EIP2537_LEN]];
  assert!(structural_preflight(&a,&UntrustedSnapshot{
   set_id:7,public_keys:&zero},&[3],&sig).is_err());
  let dup=[[2u8;G1_EIP2537_LEN],[2u8;G1_EIP2537_LEN]];
  assert!(structural_preflight(&a,&UntrustedSnapshot{
   set_id:7,public_keys:&dup},&[3],&sig).is_err());
 }
}
