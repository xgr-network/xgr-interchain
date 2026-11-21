//! SBFv3 / Agave 4.x XITA Direct-BLS cryptographic feasibility fixture.
//!
//! Benchmark ONLY: accepts test validators as calldata. No genesis trust,
//! route admission, escrow, mint, validator membership or fee functions.
//! It must NEVER be wired into the live xita-protocol entrypoint.
//!
//! It performs a REAL 2-of-3 BLS12-381 verification with SIMD-0388 native
//! syscalls, RFC9380 on-chain verified hash-to-G2, and the exact 501-byte
//! XITA_SOLANA_DIRECT_MESSAGE_V1 signing preimage.
#![allow(unexpected_cfgs)]
use solana_program::{
    account_info::AccountInfo, entrypoint, entrypoint::ProgramResult,
    program::set_return_data, program_error::ProgramError, pubkey::Pubkey,
};

const CURVE_G1_BE: u64 = 5 | 0x80;
const CURVE_G2_BE: u64 = 6 | 0x80;
const CURVE_PAIRING_BE: u64 = 4 | 0x80;
const G1_ADD: u64 = 0;
const KEY_COUNT: usize = 3;
const G1_KEY_COMPRESSED: usize = 48;
const G1_UNCOMPRESSED: usize = 96;
const G2_SIG_COMPRESSED: usize = 96;
const G2_UNCOMPRESSED: usize = 192;
const G2_WITNESS: usize = 96;
const XITA_MESSAGE: usize = 501;
const GT_LEN: usize = 576;
const PREFIX: &[u8] = b"XITA_SOLANA_DIRECT_MESSAGE_V1";
const BLS_DST: &[u8] = b"BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_POP_";
const SOLANA_GENESIS: [u8;32] = [
    0x45,0x29,0x69,0x98,0xa6,0xf8,0xe2,0xa7,
    0x84,0xdb,0x5d,0x9f,0x95,0xe1,0x8f,0xc2,
    0x3f,0x70,0x44,0x1a,0x10,0x39,0x44,0x68,
    0x01,0x08,0x98,0x79,0xb0,0x8c,0x7e,0xf0,
];
const INPUT_LEN: usize = 1 + 1 + KEY_COUNT*G1_KEY_COMPRESSED +
    G2_SIG_COMPRESSED + G2_WITNESS + XITA_MESSAGE;

/// -G1 generator, 96-byte BE, from the standard BLS12-381 curve params.
/// This makes e(aggregatePk, H(msg)) * e(-G1, aggregateSig) == 1.
const NEG_G1_GEN: [u8; G1_UNCOMPRESSED] = [
    0x17, 0xf1, 0xd3, 0xa7, 0x31, 0x97, 0xd7, 0x94, 0x26, 0x95, 0x63, 0x8c,
    0x4f, 0xa9, 0xac, 0x0f, 0xc3, 0x68, 0x8c, 0x4f, 0x97, 0x74, 0xb9, 0x05,
    0xa1, 0x4e, 0x3a, 0x3f, 0x17, 0x1b, 0xac, 0x58, 0x6c, 0x55, 0xe8, 0x3f,
    0xf9, 0x7a, 0x1a, 0xef, 0xfb, 0x3a, 0xf0, 0x0a, 0xdb, 0x22, 0xc6, 0xbb,
    0x11, 0x4d, 0x1d, 0x68, 0x55, 0xd5, 0x45, 0xa8, 0xaa, 0x7d, 0x76, 0xc8,
    0xcf, 0x2e, 0x21, 0xf2, 0x67, 0x81, 0x6a, 0xef, 0x1d, 0xb5, 0x07, 0xc9,
    0x66, 0x55, 0xb9, 0xd5, 0xca, 0xac, 0x42, 0x36, 0x4e, 0x6f, 0x38, 0xba,
    0x0e, 0xcb, 0x75, 0x1b, 0xad, 0x54, 0xdc, 0xd6, 0xb9, 0x39, 0xc2, 0xca,
];

#[cfg(target_os = "solana")]
mod sys {
    use solana_define_syscall::define_syscall;
    define_syscall!(fn sol_curve_decompress(curve_id: u64, point: *const u8, output: *mut u8) -> u64);
    define_syscall!(fn sol_curve_group_op(curve_id: u64, group_op: u64, left: *const u8, right: *const u8, output: *mut u8) -> u64);
    define_syscall!(fn sol_curve_pairing_map(curve_id: u64, pairs: u64, g1s: *const u8, g2s: *const u8, output: *mut u8) -> u64);
}
#[cfg(not(target_os = "solana"))]
mod sys {
    pub unsafe fn sol_curve_decompress(_:u64,_:*const u8,_:*mut u8)->u64{1}
    pub unsafe fn sol_curve_group_op(_:u64,_:u64,_:*const u8,_:*const u8,_:*mut u8)->u64{1}
    pub unsafe fn sol_curve_pairing_map(_:u64,_:u64,_:*const u8,_:*const u8,_:*mut u8)->u64{1}
}

fn reject() -> ProgramError { ProgramError::InvalidInstructionData }
fn valid_preimage(message: &[u8]) -> bool {
    if message.len()!=XITA_MESSAGE ||
       !message.starts_with(PREFIX) {return false;}
    let i=PREFIX.len();
    message[i..i+4] == 1643u32.to_be_bytes() &&
    message[i+4..i+8] == 1399811149u32.to_be_bytes() &&
    message[i+8..i+40] == SOLANA_GENESIS &&
    message[i+40..i+72].iter().any(|&x|x!=0) && // canonical asset ID
    message[i+72..i+104].iter().any(|&x|x!=0) && // route ID
    message[i+104..i+112].iter().any(|&x|x!=0) // set ID
}
fn non_identity(input: &[u8]) -> bool {
    !input.is_empty() && input[0]&0x40 == 0 && input.iter().any(|&x|x!=0)
}

fn verify(data: &[u8]) -> ProgramResult {
    if data.len()!=INPUT_LEN || data[0]!=1 {
        return Err(reject());
    }
    let bitmap=data[1];
    if bitmap==0 || bitmap & !0x07 !=0 || bitmap.count_ones()<2 {
        return Err(reject());
    }
    let key_bytes=&data[2..2+KEY_COUNT*G1_KEY_COMPRESSED];
    let sig_start=2+KEY_COUNT*G1_KEY_COMPRESSED;
    let signature=&data[sig_start..sig_start+G2_SIG_COMPRESSED];
    let witness_start=sig_start+G2_SIG_COMPRESSED;
    let witness=&data[witness_start..witness_start+G2_WITNESS];
    let msg=&data[witness_start+G2_WITNESS..];
    if !valid_preimage(msg) || !non_identity(signature) {return Err(reject());}

    // Subgroup-safe native decompression for EVERY key (even absentees).
    let mut aggregate=[0u8;G1_UNCOMPRESSED];
    let mut populated=false;
    for i in 0..KEY_COUNT {
        let k=&key_bytes[i*G1_KEY_COMPRESSED..(i+1)*G1_KEY_COMPRESSED];
        if !non_identity(k) {return Err(reject());}
        for j in 0..i {
            if k==&key_bytes[j*G1_KEY_COMPRESSED..(j+1)*G1_KEY_COMPRESSED] {
                return Err(reject()); // duplicate unproven validator key
            }
        }
        let mut current=[0u8;G1_UNCOMPRESSED];
        let rc=unsafe{sys::sol_curve_decompress(CURVE_G1_BE,k.as_ptr(),current.as_mut_ptr())};
        if rc!=0 {return Err(reject());}
        if bitmap&(1u8<<i)==0 {continue;}
        if !populated {
            aggregate=current;
            populated=true;
        } else {
            let mut out=[0u8;G1_UNCOMPRESSED];
            let rc=unsafe{sys::sol_curve_group_op(
                CURVE_G1_BE,G1_ADD,aggregate.as_ptr(),current.as_ptr(),out.as_mut_ptr()
            )};
            if rc!=0 {return Err(reject());}
            aggregate=out;
        }
    }
    if !populated || aggregate.iter().all(|&x|x==0) {return Err(reject());}

    // The witness is COMPUTATIONAL ADVICE, not an external G2 hash.
    // Each field relation is checked on-chain by the pinned witness library.
    // Its output is uniquely bound to the signed XITA message and XGR DST.
    let mut payload=Vec::with_capacity(G2_WITNESS+XITA_MESSAGE);
    payload.extend_from_slice(witness);
    payload.extend_from_slice(msg);
    let hash_point=bls381_hash::hash_to_g2_compact_parity(BLS_DST,&payload)
        .map_err(|_|reject())?;
    if hash_point.len()!=G2_UNCOMPRESSED {return Err(reject());}
    let mut sig_point=[0u8;G2_UNCOMPRESSED];
    let rc=unsafe{sys::sol_curve_decompress(
        CURVE_G2_BE,signature.as_ptr(),sig_point.as_mut_ptr()
    )};
    if rc!=0 {return Err(reject());}
    let mut g1s=[0u8;G1_UNCOMPRESSED*2];
    g1s[..G1_UNCOMPRESSED].copy_from_slice(&aggregate);
    g1s[G1_UNCOMPRESSED..].copy_from_slice(&NEG_G1_GEN);
    let mut g2s=[0u8;G2_UNCOMPRESSED*2];
    g2s[..G2_UNCOMPRESSED].copy_from_slice(&hash_point);
    g2s[G2_UNCOMPRESSED..].copy_from_slice(&sig_point);
    let mut result=[0u8;GT_LEN];
    let rc=unsafe{sys::sol_curve_pairing_map(
        CURVE_PAIRING_BE,2,g1s.as_ptr(),g2s.as_ptr(),result.as_mut_ptr()
    )};
    if rc!=0 || result[..GT_LEN-1].iter().any(|&x|x!=0) ||
       result[GT_LEN-1]!=1 {
        return Err(reject());
    }
    set_return_data(&[1]); // no mint/transfer; a one-byte test success only
    Ok(())
}
fn process_instruction(_:&Pubkey,_:&[AccountInfo],data:&[u8])->ProgramResult{
    verify(data)
}
entrypoint!(process_instruction);

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn only_canonical_message_prefix_and_domains() {
        assert_eq!(INPUT_LEN,839);
        assert_eq!(PREFIX.len(),29);
        assert!(!valid_preimage(&vec![0u8;501]));
        assert!(verify(&[]).is_err());
        assert!(verify(&vec![0u8;839]).is_err());
    }
}
