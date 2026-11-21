//! Runtime-compatible XGR min-pk Direct-BLS verifier.
 //! Runs the same on-chain curve syscalls and checked hash-to-G2 algorithm
 //! as our standalone 419690-CU SBF feasibility test.
 //! This routine is NOT a transfer instruction; it must receive the immutable
 //! XGR source validator PDA through the higher-level trust guard.
use crate::{
    codec,
    trusted_validators::{ValidatorSnapshot,MAX_VALIDATORS},
    validator_registry,
    direct_bls_ism::BLS_DST,
};
use solana_program::program_error::ProgramError;
const G1_BE:u64=5|0x80;
const G2_BE:u64=6|0x80;
const PAIRING_BE:u64=4|0x80;
const GROUP_ADD:u64=0;
const G1_LEN:usize=96;
const G2_LEN:usize=192;
const GT_LEN:usize=576;
const NEG_G1_GENERATOR:[u8;96]=[
    0x17,0xf1,0xd3,0xa7,0x31,0x97,0xd7,0x94,0x26,0x95,0x63,0x8c,
    0x4f,0xa9,0xac,0x0f,0xc3,0x68,0x8c,0x4f,0x97,0x74,0xb9,0x05,
    0xa1,0x4e,0x3a,0x3f,0x17,0x1b,0xac,0x58,0x6c,0x55,0xe8,0x3f,
    0xf9,0x7a,0x1a,0xef,0xfb,0x3a,0xf0,0x0a,0xdb,0x22,0xc6,0xbb,
    0x11,0x4d,0x1d,0x68,0x55,0xd5,0x45,0xa8,0xaa,0x7d,0x76,0xc8,
    0xcf,0x2e,0x21,0xf2,0x67,0x81,0x6a,0xef,0x1d,0xb5,0x07,0xc9,
    0x66,0x55,0xb9,0xd5,0xca,0xac,0x42,0x36,0x4e,0x6f,0x38,0xba,
    0x0e,0xcb,0x75,0x1b,0xad,0x54,0xdc,0xd6,0xb9,0x39,0xc2,0xca,
];
#[cfg(target_os="solana")]
mod sys {
    use solana_define_syscall::define_syscall;
    define_syscall!(fn sol_curve_decompress(curve_id:u64,point:*const u8,output:*mut u8)->u64);
    define_syscall!(fn sol_curve_group_op(curve_id:u64,op:u64,left:*const u8,right:*const u8,output:*mut u8)->u64);
    define_syscall!(fn sol_curve_pairing_map(curve_id:u64,pairs:u64,g1s:*const u8,g2s:*const u8,output:*mut u8)->u64);
}
#[cfg(not(target_os="solana"))]
mod sys {
    pub unsafe fn sol_curve_decompress(_:u64,_:*const u8,_:*mut u8)->u64{1}
    pub unsafe fn sol_curve_group_op(_:u64,_:u64,_:*const u8,_:*const u8,_:*mut u8)->u64{1}
    pub unsafe fn sol_curve_pairing_map(_:u64,_:u64,_:*const u8,_:*const u8,_:*mut u8)->u64{1}
}
/// Native signature format is Solana compressed G2 (96 bytes), not the
/// 256-byte EIP-2537 wire format used on XGRChain. Witness is exactly 96
/// bytes of untrusted advice, checked on-chain against ORIGINAL payload.
pub fn verify_direct(
    auth:&codec::Authorization,
    snapshot:&ValidatorSnapshot,
    bitmap:&[u8],
    signature:&[u8],
    witness:&[u8],
)->Result<bool,ProgramError>{
    if auth.destination_domain!=codec::SOLANA_DOMAIN ||
       auth.set_id!=snapshot.set_id{
        return Err(ProgramError::InvalidInstructionData)
    }
    let payload=codec::signing_preimage(auth)
        .ok_or(ProgramError::InvalidInstructionData)?;
    verify_payload(&payload,snapshot,bitmap,signature,witness)
}

/// The same native verifier, but for XGR V3 membership and PoP payloads.
/// These payloads use the exact Solidity byte codec, not the 501-byte
/// XITA Direct message. Caller must separately authenticate the current-set
/// account and enforce the expected action, set ID and 10-minute deadline.
/// Signatures and witness are *compressed* G2 / hash-to-curve witness.
pub fn verify_payload(
    message:&[u8],
    snapshot:&ValidatorSnapshot,
    bitmap:&[u8],
    signature:&[u8],
    witness:&[u8],
)->Result<bool,ProgramError>{
    let bad=||ProgramError::InvalidInstructionData;
    if message.is_empty()||signature.len()!=96||witness.len()!=96||
        bitmap.is_empty()||snapshot.members.is_empty()||
        snapshot.members.len()>MAX_VALIDATORS||snapshot.set_id==0||
        snapshot.xgr_registry==[0;20]||
        !validator_registry::bitmap_has_quorum(bitmap,snapshot.members.len())||
        !signature.iter().any(|&x|x!=0)||signature[0]&0x40!=0||
        crate::trusted_validators::commitment_for(&snapshot.members)!=Some(snapshot.commitment){
        return Err(bad())
    }
    let mut aggregate=[0u8;G1_LEN];
    let mut populated=false;
    for (i,v) in snapshot.members.iter().enumerate(){
        if !crate::trusted_validators::valid_member(v) ||
            snapshot.members[..i].iter().any(|prev|
                prev.compressed_key==v.compressed_key ||
                prev.address==v.address) {
            return Err(bad())
        }
        let key=&v.compressed_key;
        if key[0]&0x40!=0 {return Err(bad());}
        let mut point=[0u8;G1_LEN];
        if unsafe{sys::sol_curve_decompress(
            G1_BE,key.as_ptr(),point.as_mut_ptr()
        )}!=0{return Err(bad());}
        if !validator_registry::bitmap_member(bitmap,i){continue;}
        if !populated {aggregate=point;populated=true;}else{
            let mut out=[0u8;G1_LEN];
            if unsafe{sys::sol_curve_group_op(
                G1_BE,GROUP_ADD,aggregate.as_ptr(),point.as_ptr(),out.as_mut_ptr()
            )}!=0 {return Err(bad());}
            aggregate=out;
        }
    }
    if !populated || aggregate.iter().all(|&x|x==0){return Err(bad());}
    let mut payload=Vec::with_capacity(96+message.len());
    payload.extend_from_slice(witness);
    payload.extend_from_slice(message);
    let hashed=bls381_hash::hash_to_g2_compact_parity(BLS_DST,&payload)
        .map_err(|_|bad())?;
    if hashed.len()!=G2_LEN{return Err(bad());}
    let mut sig=[0u8;G2_LEN];
    if unsafe{sys::sol_curve_decompress(
        G2_BE,signature.as_ptr(),sig.as_mut_ptr()
    )}!=0{return Err(bad());}
    let mut g1=[0u8;G1_LEN*2];
    g1[..G1_LEN].copy_from_slice(&aggregate);
    g1[G1_LEN..].copy_from_slice(&NEG_G1_GENERATOR);
    let mut g2=[0u8;G2_LEN*2];
    g2[..G2_LEN].copy_from_slice(&hashed);
    g2[G2_LEN..].copy_from_slice(&sig);
    let mut gt=[0u8;GT_LEN];
    if unsafe{sys::sol_curve_pairing_map(
        PAIRING_BE,2,g1.as_ptr(),g2.as_ptr(),gt.as_mut_ptr()
    )}!=0{return Err(bad());}
    Ok(gt[..GT_LEN-1].iter().all(|&x|x==0) && gt[GT_LEN-1]==1)
}
#[cfg(test)]
mod tests{
    use super::*;
    #[test]fn missing_current_set_and_foreign_domain_fail_before_syscalls(){
        let a=codec::Authorization{
            source_domain:1643,destination_domain:codec::SOLANA_DOMAIN,
            asset_id:[0;32],route_id:[0;32],set_id:7,source_height:10,
            source_registry:[0;32],gateway:[0;32],source_router:[0;32],
            source_mailbox:[0;32],destination_router:[0;32],
            validator_fee:[0;32],message_id:[0;32],recipient:[0;32],
            amount:[0;32],destination_ism:[0;32],
            destination_registry:[0;32],
        };
        let snapshot=ValidatorSnapshot{
            set_id:7,commitment:[0;32],xgr_registry:[0;20],members:vec![],
        };
        assert!(verify_direct(&a,&snapshot,&[1],&[2;96],&[3;96]).is_err());
    }
}
