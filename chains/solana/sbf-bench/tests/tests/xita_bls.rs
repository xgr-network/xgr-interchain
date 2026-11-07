//! Actual SBFv3 execution under Mollusk / Agave runtime, NOT host-only BLS.
//! No SOL and no mainnet transfer. Abort on any invalid witness/signature.
use bls12_381::{
    hash_to_curve::{ExpandMsgXmd, HashToCurve},
    G1Affine,G1Projective,G2Affine,G2Projective,Scalar
};
use mollusk_svm::{program::loader_keys::LOADER_V3,Mollusk};
use sha2::Sha256;
use solana_instruction::Instruction;
use solana_pubkey::Pubkey;

const PROGRAM_ID:Pubkey=Pubkey::new_from_array([7u8;32]);
const DST:&[u8]=b"BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_POP_";
const CU_BUDGET:u64=1_400_000;
const WITNESS_LEN:usize=96;
const MESSAGE_LEN:usize=501;
const PAYLOAD_LEN:usize=839;

fn parse_hex(s:&str)->Vec<u8>{
    hex::decode(s.strip_prefix("0x").unwrap_or(s)).unwrap()
}
fn message()->Vec<u8>{
    let json:serde_json::Value=serde_json::from_str(include_str!("../../../test-vectors.json")).unwrap();
    let bytes=parse_hex(json["authPreimageHex"].as_str().unwrap());
    assert_eq!(bytes.len(),MESSAGE_LEN);
    bytes
}
fn to_pk(p:G1Affine)->[u8;48]{p.to_compressed()}
fn to_sig(p:G2Affine)->[u8;96]{p.to_compressed()}

fn signed_fixture()->Vec<u8>{
    let msg=message();
    let scalar=[Scalar::from(17u64),Scalar::from(23u64),Scalar::from(41u64)];
    let mut keys=[[0u8;48];3];
    for i in 0..3{keys[i]=to_pk(G1Affine::from(G1Projective::generator()*scalar[i]));}
    let hashed=<G2Projective as HashToCurve<ExpandMsgXmd<Sha256>>>::hash_to_curve(
        &msg,DST
    );
    let sig=to_sig(G2Affine::from(hashed*(scalar[0]+scalar[2])));
    let witness=bls381_hash::witness::g2::generate_compact_parity(&msg);
    assert_eq!(witness.len(),WITNESS_LEN);
    let mut payload=Vec::with_capacity(PAYLOAD_LEN);
    payload.push(1u8); // opcode
    payload.push(0b101); // signers 0 and 2 of three
    for k in keys {payload.extend_from_slice(&k);}
    payload.extend_from_slice(&sig);
    payload.extend_from_slice(&witness);
    payload.extend_from_slice(&msg);
    assert_eq!(payload.len(),PAYLOAD_LEN);
    payload
}
fn runtime()->Mollusk {
    let elf=std::fs::read(concat!(
        env!("CARGO_MANIFEST_DIR"),"/../target/deploy/xita_bls_sbf_probe.so"
    )).expect("The SBF ELF must be built with cargo build-sbf first");
    let mut m=Mollusk::default();
    m.add_program_with_loader_and_elf(&PROGRAM_ID,&LOADER_V3,&elf);
    m.compute_budget.compute_unit_limit=CU_BUDGET;
    m
}
fn execute(m:&Mollusk,payload:&[u8])->mollusk_svm::result::InstructionResult {
    m.process_instruction(&Instruction::new_with_bytes(PROGRAM_ID,payload,vec![]),&[])
}

#[test]
fn xgr_direct_bls_positive_and_adversarial_mollusk_cases(){
    let m=runtime();
    let fixture=signed_fixture();
    let result=execute(&m,&fixture);
    println!("XITA SBF BLS verified CU: {}",result.compute_units_consumed);
    assert!(!result.program_result.is_err(),"valid direct XGR signature was rejected: {:?}",result.program_result);
    assert_eq!(result.return_data,[1u8]);

    let cases=[
        ("insufficient 1-of-3 quorum",1,0),
        ("bitmap for wrong signers",1,0b011),
        ("invalid bitmap high bits",1,0b10000101),
        ("tampered signature",2+3*48+10,1),
        ("tampered compressed key",2+12,1),
        ("tampered witness",2+3*48+96+17,1),
        ("wrong destination",2+3*48+96+96+29+4,1),
        ("tampered signed amount",PAYLOAD_LEN-70,1),
        ("tampered message ID",PAYLOAD_LEN-140,1),
        ("tampered route",PAYLOAD_LEN-397,1),
    ];
    for (label,index,mask) in cases {
        let mut bad=fixture.clone();
        bad[index]^=mask;
        let failed=execute(&m,&bad);
        assert!(failed.program_result.is_err(),
            "{label}: invalid signature/proof accepted at {} CU",failed.compute_units_consumed);
    }
    let trunc=execute(&m,&fixture[..fixture.len()-1]);
    assert!(trunc.program_result.is_err(),"truncated signing payload accepted");
}
