//! Pure-Rust BLS12-381 cryptographic verification with XGR EIP-2537 inputs.
//!
//! Correctness reference for Solana's eventual syscall-accelerated verifier.
//! This implementation is intended to be byte-identical to
//! XGRInterchainBLSVerifier.sol (MinPk, G1 public keys, G2 signatures,
//! BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_POP_).
//!
//! IMPORTANT: Not directly callable from the program's instruction dispatcher.
//! The destination-side validator set must come from an authenticated,
//! current-set PDA. The compute budget of the pure Rust BLS implementation
//! MUST be measured against a real Agave 4.x SBF runtime before enabling
//! any public mint/unlock. Success in host unit tests is NOT this proof.
use bls12_381::{
    pairing, G1Affine, G1Projective, G2Affine, G2Projective,
    hash_to_curve::{ExpandMsgXmd, HashToCurve},
};
use sha2::Sha256;

use crate::{direct_bls_ism::{BLS_DST, G1_EIP2537_LEN, G2_EIP2537_LEN},
            validator_registry};

/// Full EIP-2537 G1 (x||y, each 64-byte padded) -> RFC/zkcrypto
/// uncompressed (x||y, each 48 bytes), with strict padding validation.
/// No private keys or trusted off-chain intermediary are involved.
pub fn decode_eip2537_g1(raw: &[u8]) -> Option<G1Affine> {
    if raw.len() != G1_EIP2537_LEN
        || raw[..16].iter().any(|&x|x!=0)
        || raw[64..80].iter().any(|&x|x!=0)
        || raw.iter().all(|&x|x==0) {return None;}
    let mut repr=[0u8;96];
    repr[..48].copy_from_slice(&raw[16..64]);
    repr[48..].copy_from_slice(&raw[80..128]);
    let p=Option::<G1Affine>::from(G1Affine::from_uncompressed(&repr))?;
    if bool::from(p.is_identity()) {return None;}
    Some(p)
}

/// EIP-2537 G2: x.c0||x.c1||y.c0||y.c1, 64 padded bytes each.
/// IETF uncompressed G2 expects x.c1||x.c0||y.c1||y.c0 (48 each).
/// All inputs are range-, curve-, subgroup- and infinity-checked.
pub fn decode_eip2537_g2(raw: &[u8]) -> Option<G2Affine> {
    if raw.len() != G2_EIP2537_LEN ||
       [0,64,128,192].iter().any(|&off|
           raw[off..off+16].iter().any(|&x| x!=0)) ||
       raw.iter().all(|&x| x==0) { return None; }
    let mut repr=[0u8;192];
    repr[0..48].copy_from_slice(&raw[80..128]);  // x.c1
    repr[48..96].copy_from_slice(&raw[16..64]);  // x.c0
    repr[96..144].copy_from_slice(&raw[208..256]); // y.c1
    repr[144..192].copy_from_slice(&raw[144..192]); // y.c0
    let p=Option::<G2Affine>::from(G2Affine::from_uncompressed(&repr))?;
    if bool::from(p.is_identity()) {return None;}
    Some(p)
}

/// Host/SBF cryptographic primitive. Snapshot AUTHENTICITY must be checked
/// independently, by an immutable program-owned PDA and proof-governed set
/// transitions. Never accept keys from untrusted instruction arguments.
pub fn verify_eip2537_quorum(
    message:&[u8], public_keys:&[[u8;G1_EIP2537_LEN]],
    bitmap:&[u8], aggregate_signature:&[u8],
) -> bool {
    if message.is_empty() || public_keys.is_empty() ||
       !validator_registry::bitmap_has_quorum(bitmap,public_keys.len()) {return false;}
    let signature=match decode_eip2537_g2(aggregate_signature) {
       Some(x)=>x,None=>return false,
    };
    let mut aggregate=G1Projective::identity();
    for (index,raw) in public_keys.iter().enumerate(){
        let key=match decode_eip2537_g1(raw) {
           Some(x)=>x,None=>return false,
        };
        // Reject duplicate PoP keys even if one is an unselected validator.
        if public_keys[..index].iter().any(|other|other==raw){return false;}
        if validator_registry::bitmap_member(bitmap,index){
            aggregate+=G1Projective::from(key);
        }
    }
    if bool::from(aggregate.is_identity()){return false;}
    let hashed=<G2Projective as HashToCurve<ExpandMsgXmd<Sha256>>>::hash_to_curve(
        message,BLS_DST
    );
    pairing(&G1Affine::from(aggregate),&G2Affine::from(hashed)) ==
        pairing(&G1Affine::generator(),&signature)
}

#[cfg(test)]
mod tests {
    use super::*;
    use bls12_381::Scalar;

    fn hex_bytes(h:&str)->Vec<u8>{
        assert_eq!(h.len()%2,0);
        (0..h.len()).step_by(2).map(|i|
            u8::from_str_radix(&h[i..i+2],16).unwrap()).collect()
    }
    const KEY:&str=concat!(
       "00000000000000000000000000000000",
       "0695ad325dfc7e1191fbc9f186f58eff42a634029731b18380ff89bf42c464a42cb8ca55b200f051f57f1e1893c68759",
       "00000000000000000000000000000000",
       "10ea7912ef7a227c01298a7c7a96b1851b23021741c71938f39638b1d368aaa621452426b5d8199773a2cb5b2743a5da"
    );
    const SIG:&str=concat!(
       "00000000000000000000000000000000",
       "17088961632badc833b832b51fe006ae532b7238672ca5fc446e3b2b80fe1b2be767eb7b765698ae722b64cefc96e685",
       "00000000000000000000000000000000",
       "09db6117270d4bc0494417ec453aac0d2646dc40309c71d27babd5c0018ff829b00d1edb3dd2ae6dfa6f4e6e0d27720d",
       "00000000000000000000000000000000",
       "05dbb6817679e48421d3d97ad6af3c70ea6b5edbc449415ec42394976a62b16ccd25cf64ca7b1396bcfd24f44e49c0d8",
       "00000000000000000000000000000000",
       "050ad2bec4ae472752a1b15928e8126e3b55c1ee74d5e3e4df1e4bf803e5724af0324af0d172526813e686f69d900984"
    );
    fn padded_key(p:G1Affine)->[u8;128]{
        let b=p.to_uncompressed();
        let mut out=[0u8;128];out[16..64].copy_from_slice(&b[..48]);
        out[80..128].copy_from_slice(&b[48..96]);out
    }
    fn padded_sig(p:G2Affine)->[u8;256]{
        let b=p.to_uncompressed();
        let mut out=[0u8;256];
        out[16..64].copy_from_slice(&b[48..96]); // x.c0
        out[80..128].copy_from_slice(&b[0..48]); // x.c1
        out[144..192].copy_from_slice(&b[144..192]); // y.c0
        out[208..256].copy_from_slice(&b[96..144]); // y.c1
        out
    }
    #[test]
    fn legacy_eip2537_solidity_reference_vector_is_verifiable(){
        let pk=<[u8;128]>::try_from(hex_bytes(KEY)).unwrap();
        let signature=hex_bytes(SIG);
        assert!(decode_eip2537_g1(&pk).is_some());
        assert!(decode_eip2537_g2(&signature).is_some());
        assert!(verify_eip2537_quorum(
            b"xgr-eip2537-vector",&[pk],&[1],&signature));
        assert!(!verify_eip2537_quorum(
            b"xgr-eip2537-vector!",&[pk],&[1],&signature));
        let mut bad=signature.clone();bad[20]^=1;
        assert!(!verify_eip2537_quorum(
            b"xgr-eip2537-vector",&[pk],&[1],&bad));
        assert!(!verify_eip2537_quorum(
            b"xgr-eip2537-vector",&[pk],&[2],&signature));
    }
    #[test]
    fn genuine_2_of_3_aggregate_and_key_rotation(){
        let message=b"XITA_SOLANA_DIRECT_MESSAGE_V1 - direct BLS native test";
        let secrets=[Scalar::from(17u64),Scalar::from(23u64),Scalar::from(41u64)];
        let keys=secrets.map(|k| padded_key(G1Affine::from(G1Projective::generator()*k)));
        let hashed=<G2Projective as HashToCurve<ExpandMsgXmd<Sha256>>>::hash_to_curve(
            message,BLS_DST
        );
        let signature=padded_sig(G2Affine::from(hashed*(secrets[0]+secrets[2])));
        assert!(verify_eip2537_quorum(message,&keys,&[0b101],&signature));
        assert!(!verify_eip2537_quorum(message,&keys,&[0b011],&signature));
        assert!(!verify_eip2537_quorum(message,&keys,&[0b100],&signature));
        assert!(!verify_eip2537_quorum(b"wrong",&keys,&[0b101],&signature));
        let mut changed=keys;changed[2]=padded_key(G1Affine::from(
            G1Projective::generator()*Scalar::from(42u64)
        ));
        assert!(!verify_eip2537_quorum(message,&changed,&[0b101],&signature));
        let duplicate=[keys[0],keys[0],keys[2]];
        assert!(!verify_eip2537_quorum(message,&duplicate,&[0b101],&signature));
        let mut bad_padding=keys;bad_padding[0][0]=1;
        assert!(!verify_eip2537_quorum(message,&bad_padding,&[0b101],&signature));
        let mut zero_sig=signature;zero_sig.fill(0);
        assert!(!verify_eip2537_quorum(message,&keys,&[0b101],&zero_sig));
    }
}
