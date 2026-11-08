//! Immutable XGR validator trust anchor and current-quorum membership transitions.
//!
//! No owner or special deployer: initialization MUST match an immutable
//! commitment pinned in the reproducible binary to an independently confirmed
//! XGR destination-scoped validator registry snapshot. Never accept a client
//! chosen "genesis" root; a blank anchor keeps the live bridge disabled.
//! Runtime storage/PDA and native SIMD verification must be audited before
//! allowing a public transition instruction to mutate this state.
use borsh::{BorshDeserialize,BorshSerialize};
use crate::{bls_crypto,validator_registry::{
    XgrValidatorIdentity,xgr_set_commitment,bitmap_has_quorum
}};
use solana_program::{keccak::hashv,program_error::ProgramError};

pub const MAX_VALIDATORS:usize=16;
pub const MAX_TRANSITION_VALIDITY_SECS:u64=600;
pub const SOURCE_CHAIN_ID:u64=1643;
pub const SOLANA_DOMAIN:u32=1399811149;
pub const MEMBERSHIP_SCOPE:&[u8]=b"XGR_INTERCHAIN_V2";
pub const POSSESSION_SCOPE:&[u8]=b"XGR_INTERCHAIN_BOOTSTRAP_V1";

/// Set these ONLY from a quorum-verified, independently reproduced XGR V3
/// snapshot BEFORE immutable program deploy. Zero is an intentional lock.
pub const PINNED_XGR_SET_ID:u64=0;
pub const PINNED_XGR_SET_COMMITMENT:[u8;32]=[0;32];
// Address is the existing XGRChain V315 registry recorded in
// deployments/chains/xgrchain.json. A NONZERO address alone is not
// enough: unverified setId+commitment remain zero and deny bootstrap.
pub const PINNED_XGR_REGISTRY:[u8;20]=[0x9b,0x6b,0x92,0xef,0x17,0x45,0x61,0x1f,0x40,0x23,0x41,0x96,0x5f,0x7f,0xc6,0x49,0xcb,0xe0,0xda,0x8c];

#[derive(Debug,Clone,PartialEq,Eq,BorshSerialize,BorshDeserialize)]
pub struct ValidatorRecord {
    pub address:[u8;20],
    pub compressed_key:[u8;48],
    pub eip2537_key:[u8;128],
}
#[derive(Debug,Clone,PartialEq,Eq,BorshSerialize,BorshDeserialize)]
pub struct ValidatorSnapshot{
    pub set_id:u64,
    pub commitment:[u8;32],
    pub xgr_registry:[u8;20],
    pub members:Vec<ValidatorRecord>,
}
#[derive(Debug,Clone,PartialEq,Eq)]
pub struct ImmutableAnchor {
    pub set_id:u64,
    pub commitment:[u8;32],
    pub xgr_registry:[u8;20],
}
impl ImmutableAnchor {
    /// Release path: fails closed until a real immutable checkpoint is pinned.
    pub fn compiled()->Result<Self,ProgramError>{
        let a=Self {
            set_id:PINNED_XGR_SET_ID,
            commitment:PINNED_XGR_SET_COMMITMENT,
            xgr_registry:PINNED_XGR_REGISTRY,
        };
        if a.set_id==0 || a.commitment==[0;32] ||
           a.xgr_registry==[0;20] {
            return Err(ProgramError::InvalidAccountData)
        }
        Ok(a)
    }
}
/// Public Borsh wire for a membership update. The quorum signature is
/// verified against the prior program-owned set, never calldata keys.
#[derive(Debug,Clone,PartialEq,Eq,BorshSerialize,BorshDeserialize)]
pub struct MembershipProposalWire {
    pub expected_set_id:u64,
    pub valid_until:u64,
    pub action:u8,
    pub validator:ValidatorRecord,
}
#[derive(Debug,Clone,PartialEq,Eq)]
pub struct MembershipProposal {
    pub expected_set_id:u64,
    pub valid_until:u64,
    pub action:u8, // Solidity 1=ADD, 2=REMOVE
    pub validator:ValidatorRecord,
}

/// XGR's exact Solidity `abi.encodePacked` encoding. Public keys are
/// EIP-2537 uncompressed 128-byte G1 + canonical compressed 48-byte G1.
/// A proposal doesn't authorize itself: signatures ALWAYS use old keys.
pub fn membership_payload(p:&MembershipProposal)->Vec<u8>{
    let mut data=Vec::with_capacity(256);
    data.extend_from_slice(MEMBERSHIP_SCOPE);
    data.extend_from_slice(&SOURCE_CHAIN_ID.to_be_bytes());
    data.extend_from_slice(&SOLANA_DOMAIN.to_be_bytes());
    data.extend_from_slice(&p.expected_set_id.to_be_bytes());
    data.extend_from_slice(&p.valid_until.to_be_bytes());
    data.push(p.action);
    data.extend_from_slice(&p.validator.address);
    data.extend_from_slice(&48u16.to_be_bytes());
    data.extend_from_slice(&p.validator.compressed_key);
    data.extend_from_slice(&128u16.to_be_bytes());
    data.extend_from_slice(&p.validator.eip2537_key);
    data
}
/// XGR V3 provePossession payload. Key ownership proof is NOT re-usable
/// across different destination domains and validator addresses.
pub fn possession_payload(v:&ValidatorRecord)->Vec<u8>{
    let mut data=Vec::with_capacity(250);
    data.extend_from_slice(POSSESSION_SCOPE);
    data.extend_from_slice(&SOURCE_CHAIN_ID.to_be_bytes());
    data.extend_from_slice(&SOLANA_DOMAIN.to_be_bytes());
    data.extend_from_slice(&v.address);
    data.extend_from_slice(&48u16.to_be_bytes());
    data.extend_from_slice(&v.compressed_key);
    data.extend_from_slice(&128u16.to_be_bytes());
    data.extend_from_slice(&v.eip2537_key);
    data
}
pub fn valid_member(v:&ValidatorRecord)->bool{
    if v.address==[0;20] {return false;}
    match bls_crypto::decode_eip2537_g1(&v.eip2537_key) {
        Some(p)=>p.to_compressed()==v.compressed_key,
        None=>false,
    }
}
pub fn commitment_for(members:&[ValidatorRecord])->Option<[u8;32]>{
    if members.is_empty()||members.len()>MAX_VALIDATORS {return None;}
    let mut identities=Vec::with_capacity(members.len());
    for m in members{
        identities.push(XgrValidatorIdentity{
            validator:m.address,compressed_key:m.compressed_key,
            eip2537_key:m.eip2537_key,
        });
    }
    xgr_set_commitment(&identities)
}

/// Pure bootstrap verification; no one can choose a validator list except
/// the audited immutable anchor. NEVER write a PDA based solely on this
/// function without also checking owner, PDA and rent/account invariants.
pub fn initialize(
    anchor:&ImmutableAnchor,members:Vec<ValidatorRecord>
)->Result<ValidatorSnapshot,ProgramError>{
    if anchor.set_id==0 || anchor.commitment==[0;32] ||
       anchor.xgr_registry==[0;20] ||
       members.iter().any(|m|!valid_member(m)) ||
       commitment_for(&members)!=Some(anchor.commitment) {
        return Err(ProgramError::InvalidAccountData)
    }
    Ok(ValidatorSnapshot{
        set_id:anchor.set_id,commitment:anchor.commitment,
        xgr_registry:anchor.xgr_registry,members,
    })
}
/// A membership transition is a 2-of-3 (or general >=2/3) BLS vote from
/// the *current* set. ADD additionally proves possession of its new BLS
/// private key on the destination-bound XGR V3 bootstrap payload.
pub fn apply_transition(
    old:&ValidatorSnapshot,p:&MembershipProposal,now:u64,
    bitmap:&[u8],quorum_signature:&[u8],pop_signature:Option<&[u8]>
)->Result<ValidatorSnapshot,ProgramError>{
    let bad=||ProgramError::InvalidInstructionData;
    if p.expected_set_id!=old.set_id || old.set_id==0 ||
       old.set_id==u64::MAX || p.valid_until<=now ||
       p.valid_until>now.saturating_add(MAX_TRANSITION_VALIDITY_SECS) ||
       !valid_member(&p.validator) ||
       (p.action!=1 && p.action!=2) ||
       commitment_for(&old.members)!=Some(old.commitment) ||
       !bitmap_has_quorum(bitmap,old.members.len()){
        return Err(bad())
    }
    let mut members=old.members.clone();
    if p.action==1 {
        if members.len()>=MAX_VALIDATORS ||
           members.iter().any(|m|
              m.address==p.validator.address ||
              m.compressed_key==p.validator.compressed_key
           ) {return Err(bad());}
        // No rogue-key: possession of the new validator's private key is
        // independently demonstrated, in addition to old-set quorum.
        let proof=pop_signature.ok_or_else(bad)?;
        if !bls_crypto::verify_eip2537_quorum(
            &possession_payload(&p.validator),
            &[p.validator.eip2537_key],&[1u8],proof
        ){return Err(bad());}
        members.push(p.validator.clone());
    }else{
        let i=members.iter().position(|m|
            m.address==p.validator.address &&
            m.compressed_key==p.validator.compressed_key &&
            m.eip2537_key==p.validator.eip2537_key
        ).ok_or_else(bad)?;
        if members.len()==1 {return Err(bad());}
        // Mirror Solidity swap-and-pop validator order on removal.
        let last=members.len()-1;members.swap(i,last);members.pop();
    }
    let old_keys:Vec<[u8;128]>=old.members.iter()
        .map(|m|m.eip2537_key).collect();
    if !bls_crypto::verify_eip2537_quorum(
        &membership_payload(p),&old_keys,bitmap,quorum_signature
    ){return Err(bad());}
    let next=commitment_for(&members).ok_or_else(bad)?;
    Ok(ValidatorSnapshot{
        set_id:old.set_id+1,commitment:next,
        xgr_registry:old.xgr_registry,members,
    })
}
pub fn trusted_pda(program:&solana_program::pubkey::Pubkey)
 ->(solana_program::pubkey::Pubkey,u8) {
    solana_program::pubkey::Pubkey::find_program_address(
        &[b"xita-trusted-xgr-validators"],program)
}
/// Pure receipt bound to the runtime's trusted-PDA root; NEVER a signature
/// verification shortcut or a substitute for on-chain current-set reads.
pub fn anchored_message_context(snapshot:&ValidatorSnapshot)
 ->Result<[u8;32],ProgramError>{
    if snapshot.set_id==0||snapshot.xgr_registry==[0;20]||
       commitment_for(&snapshot.members)!=Some(snapshot.commitment){
        return Err(ProgramError::InvalidAccountData)
    }
    Ok(hashv(&[
        b"XITA_XGR_CURRENT_SET_V1",
        &SOURCE_CHAIN_ID.to_be_bytes(),&SOLANA_DOMAIN.to_be_bytes(),
        &snapshot.xgr_registry,&snapshot.set_id.to_be_bytes(),
        &snapshot.commitment,
    ]).to_bytes())
}
/// Current production deployment must not start until we have independently
/// verified and pinned the real XGR set root and selected source registry.

/// Strict program-owned current-set PDA loader. The account must be pinned to
/// the same XGR Registry address baked into the immutable executable, and it
/// must contain a valid self-consistent commitment of every G1 key.
pub fn load_current_set(
    account:&solana_program::account_info::AccountInfo,
    program_id:&solana_program::pubkey::Pubkey,
    anchor:&ImmutableAnchor,
)->Result<ValidatorSnapshot,ProgramError>{
    if account.owner!=program_id ||
       *account.key!=trusted_pda(program_id).0 ||
       anchor.set_id==0 || anchor.commitment==[0;32] ||
       anchor.xgr_registry==[0;20] {
        return Err(ProgramError::InvalidAccountData)
    }
    let snapshot=ValidatorSnapshot::try_from_slice(&account.try_borrow_data()?)
        .map_err(|_|ProgramError::InvalidAccountData)?;
    if snapshot.set_id<anchor.set_id ||
       snapshot.xgr_registry!=anchor.xgr_registry ||
       snapshot.commitment==[0;32] ||
       commitment_for(&snapshot.members)!=Some(snapshot.commitment) {
        return Err(ProgramError::InvalidAccountData)
    }
    // At the initial epoch, it MUST be the exact verified root. Later
    // epochs are only trusted if this PDA was initialized by the pinned
    // bootstrap and updated exclusively by current-set BLS instructions.
    if snapshot.set_id==anchor.set_id &&
       snapshot.commitment!=anchor.commitment {
        return Err(ProgramError::InvalidAccountData)
    }
    Ok(snapshot)
}

pub fn bootstrap_unavailable()->Result<(),ProgramError>{
    ImmutableAnchor::compiled().map(|_|())
}
#[cfg(test)]
mod tests {
    use super::*;
    use bls12_381::{
        Scalar,G1Affine,G1Projective,G2Affine,G2Projective,
        hash_to_curve::{HashToCurve,ExpandMsgXmd},
    };
    use sha2::Sha256;
    use crate::direct_bls_ism::BLS_DST;
    fn validator(id:u8,sk:Scalar)->ValidatorRecord{
        let point=G1Affine::from(G1Projective::generator()*sk);
        let raw=point.to_uncompressed();
        let mut uncompressed=[0u8;128];
        uncompressed[16..64].copy_from_slice(&raw[..48]);
        uncompressed[80..].copy_from_slice(&raw[48..]);
        let mut addr=[0u8;20];addr[19]=id;
        ValidatorRecord{
            address:addr,compressed_key:point.to_compressed(),
            eip2537_key:uncompressed,
        }
    }
    fn sign(msg:&[u8],keys:&[Scalar])->[u8;256]{
        let h=<G2Projective as HashToCurve<ExpandMsgXmd<Sha256>>>::hash_to_curve(
            msg,BLS_DST
        );
        let total=keys.iter().copied().fold(Scalar::from(0u64),|a,b|a+b);
        let v=G2Affine::from(h*total).to_uncompressed();
        let mut out=[0u8;256];
        out[16..64].copy_from_slice(&v[48..96]);
        out[80..128].copy_from_slice(&v[..48]);
        out[144..192].copy_from_slice(&v[144..]);
        out[208..256].copy_from_slice(&v[96..144]);
        out
    }
    fn set() ->(ValidatorSnapshot,[Scalar;3]){
        let keys=[Scalar::from(11u64),Scalar::from(17u64),
                  Scalar::from(23u64)];
        let members=vec![validator(1,keys[0]),validator(2,keys[1]),
                         validator(3,keys[2])];
        let root=commitment_for(&members).unwrap();
        let anchor=ImmutableAnchor{
            set_id:7,commitment:root,xgr_registry:[0x31;20],
        };
        (initialize(&anchor,members).unwrap(),keys)
    }
    #[test]fn unpinned_mainnet_registry_must_not_initialize(){
        assert!(ImmutableAnchor::compiled().is_err());
        assert!(bootstrap_unavailable().is_err());
        let (state,_)=set();
        let fake=ImmutableAnchor{
            set_id:state.set_id,commitment:[0x11;32],
            xgr_registry:state.xgr_registry,
        };
        assert!(initialize(&fake,state.members.clone()).is_err());
        assert!(initialize(&ImmutableAnchor{
            set_id:0,commitment:state.commitment,
            xgr_registry:state.xgr_registry,
        },state.members.clone()).is_err());
    }
    #[test]fn quorum_authorized_add_requires_valid_new_key_pop(){
        let (state,keys)=set();
        let candidate=validator(4,Scalar::from(31u64));
        let p=MembershipProposal{
            expected_set_id:7,valid_until:1500,action:1,
            validator:candidate.clone(),
        };
        let vote=sign(&membership_payload(&p),&[keys[0],keys[2]]);
        let pop=sign(&possession_payload(&candidate),&[Scalar::from(31u64)]);
        let next=apply_transition(&state,&p,1000,&[0b101],&vote,
            Some(&pop)).unwrap();
        assert_eq!(next.set_id,8);
        assert_eq!(next.members.len(),4);
        assert_eq!(next.members[3],candidate);
        assert_ne!(next.commitment,state.commitment);
        assert_eq!(state.members.len(),3);
        assert!(anchored_message_context(&next).is_ok());
        assert!(apply_transition(&state,&p,1000,&[0b101],&vote,
            None).is_err());
        let badpop=sign(&possession_payload(&candidate),&[keys[0]]);
        assert!(apply_transition(&state,&p,1000,&[0b101],&vote,
            Some(&badpop)).is_err());
        assert!(apply_transition(&state,&p,1000,&[0b001],&vote,
            Some(&pop)).is_err());
        assert!(apply_transition(&state,&p,1000,&[0b011],&vote,
            Some(&pop)).is_err());
        let mut replay=p.clone();replay.expected_set_id=8;
        assert!(apply_transition(&state,&replay,1000,&[0b101],&vote,
            Some(&pop)).is_err());
        assert!(apply_transition(&state,&p,2000,&[0b101],&vote,
            Some(&pop)).is_err());
    }
    #[test]fn quorum_remove_preserves_swap_pop_order_and_replay_guard(){
        let (state,keys)=set();
        let p=MembershipProposal{
            expected_set_id:7,valid_until:1100,action:2,
            validator:state.members[1].clone(),
        };
        let vote=sign(&membership_payload(&p),&[keys[0],keys[1]]);
        let next=apply_transition(&state,&p,1000,&[0b011],&vote,
            None).unwrap();
        assert_eq!(next.members.len(),2);
        assert_eq!(next.members[1],state.members[2]);
        assert_eq!(next.set_id,8);
        assert!(apply_transition(&next,&p,1000,&[0b011],&vote,
            None).is_err());
        let mut forged=p.clone();forged.validator=state.members[2].clone();
        assert!(apply_transition(&state,&forged,1000,&[0b011],&vote,
            None).is_err());
    }
    #[test]fn duplicate_and_changed_bootstrap_commitment_are_rejected(){
        let (state,keys)=set();
        let mut dup=state.members.clone();dup[1]=dup[0].clone();
        assert!(commitment_for(&dup).is_none());
        let wrong=ImmutableAnchor{
            set_id:7,commitment:state.commitment,
            xgr_registry:[0;20],
        };
        assert!(initialize(&wrong,state.members.clone()).is_err());
        let old=state.clone();
        let p=MembershipProposal{
            expected_set_id:7,valid_until:1100,action:1,
            validator:validator(1,keys[0]),
        };
        let vote=sign(&membership_payload(&p),&[keys[0],keys[1]]);
        let pop=sign(&possession_payload(&p.validator),&[keys[0]]);
        assert!(apply_transition(&old,&p,1000,&[0b011],&vote,
            Some(&pop)).is_err());
    }
    #[test]fn canonical_current_set_pda_rejects_wrong_owner_address_root_and_trailing_bytes(){
        use solana_program::{account_info::AccountInfo,pubkey::Pubkey};
        let (snapshot,_)=set();
        let program=Pubkey::new_unique();
        let (pda,_)=trusted_pda(&program);
        let mut lamports=1;
        let mut bytes=borsh::to_vec(&snapshot).unwrap();
        let anchor=ImmutableAnchor{
            set_id:snapshot.set_id,commitment:snapshot.commitment,
            xgr_registry:snapshot.xgr_registry,
        };
        let owner=program;
        {
            let account=AccountInfo::new(&pda,false,false,&mut lamports,
                &mut bytes,&owner,false,0);
            assert_eq!(load_current_set(&account,&program,&anchor).unwrap(),snapshot);
            let mut bad_anchor=anchor.clone();
            bad_anchor.commitment[0]^=1;
            assert!(load_current_set(&account,&program,&bad_anchor).is_err());
            bad_anchor=anchor.clone();
            bad_anchor.xgr_registry[0]^=1;
            assert!(load_current_set(&account,&program,&bad_anchor).is_err());
        }
        let wrong=Pubkey::new_unique();
        {
            let fake=AccountInfo::new(&wrong,false,false,&mut lamports,
                &mut bytes,&owner,false,0);
            assert!(load_current_set(&fake,&program,&anchor).is_err());
        }
        let wrong_owner=Pubkey::new_unique();
        {
            let fake=AccountInfo::new(&pda,false,false,&mut lamports,
                &mut bytes,&wrong_owner,false,0);
            assert!(load_current_set(&fake,&program,&anchor).is_err());
        }
        bytes.push(0x99);
        let fake=AccountInfo::new(&pda,false,false,&mut lamports,
            &mut bytes,&owner,false,0);
        assert!(load_current_set(&fake,&program,&anchor).is_err());
    }

}
