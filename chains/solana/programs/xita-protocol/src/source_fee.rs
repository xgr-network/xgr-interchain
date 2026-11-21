//! Source-chain native SOL validator fee, one shared PDA for ALL routes.
//! Strictly quorum governed: no creator, deployer, UI sponsor or operator may
//! set or change the fee. The genesis fee requires a current-set BLS vote too.
//! Fees are lamports, paid by the self-signing source sender.
use borsh::{BorshDeserialize,BorshSerialize};
use crate::{bls_sbf,codec,factory,trusted_validators};
use solana_program::{
    account_info::{next_account_info,AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    sysvar::{self,Sysvar},
};
pub const SOURCE_FEE_SEED:&[u8]=b"xita-source-fee";
pub const SOURCE_FEE_TAG:u8=0x53;
pub const SOURCE_FEE_DOMAIN:&[u8]=b"XITA_SOLANA_SOURCE_FEE_V1";

#[derive(Debug,Clone,PartialEq,Eq,BorshSerialize,BorshDeserialize)]
pub struct SourceFeePolicy{
    pub tag:u8,
    pub version:u8,
    pub bump:u8,
    pub source_domain:u32,
    pub validator_fee_lamports:u64,
    pub nonce:u64,
    pub approved_set_id:u64,
}
#[derive(Debug,Clone,PartialEq,Eq,BorshSerialize,BorshDeserialize)]
pub struct SourceFeeProposal{
    pub source_domain:u32,
    pub registry_program:[u8;32],
    pub set_id:u64,
    pub nonce:u64,
    pub valid_until:u64,
    pub validator_fee_lamports:u64,
}
pub fn fee_pda(program:&Pubkey)->(Pubkey,u8){
    Pubkey::find_program_address(&[SOURCE_FEE_SEED],program)
}
pub fn signing_payload(p:&SourceFeeProposal)->Vec<u8>{
    let mut data=Vec::with_capacity(SOURCE_FEE_DOMAIN.len()+4+32+8*4);
    data.extend_from_slice(SOURCE_FEE_DOMAIN);
    data.extend_from_slice(&p.source_domain.to_be_bytes());
    data.extend_from_slice(&p.registry_program);
    data.extend_from_slice(&p.set_id.to_be_bytes());
    data.extend_from_slice(&p.nonce.to_be_bytes());
    data.extend_from_slice(&p.valid_until.to_be_bytes());
    data.extend_from_slice(&p.validator_fee_lamports.to_be_bytes());
    data
}
/// Mirrors XGRILNRegistryV315 nonce and current BLS quorum discipline,
/// with full Solana 32-byte program identity and lamport precision.
pub fn plan_fee_update(
    current:Option<&SourceFeePolicy>,
    p:&SourceFeeProposal,
    program:&Pubkey,
    validator_set_id:u64,
    now:u64,
)->Result<SourceFeePolicy,ProgramError>{
    let bad=||ProgramError::InvalidInstructionData;
    let (_,bump)=fee_pda(program);
    if p.source_domain!=codec::SOLANA_DOMAIN ||
       p.registry_program!=program.to_bytes() ||
       p.set_id==0||p.set_id!=validator_set_id ||
       p.valid_until==0||p.valid_until<now ||
       p.validator_fee_lamports==0 {return Err(bad());}
    let expected=match current {
        None=>1,
        Some(old)=>{
            if old.tag!=SOURCE_FEE_TAG||old.version!=crate::state::VERSION||
               old.bump!=bump||old.source_domain!=codec::SOLANA_DOMAIN||
               old.validator_fee_lamports==0||
               old.nonce==u64::MAX {return Err(bad());}
            old.nonce+1
        }
    };
    if p.nonce!=expected {return Err(bad());}
    Ok(SourceFeePolicy{
        tag:SOURCE_FEE_TAG,version:crate::state::VERSION,bump,
        source_domain:codec::SOLANA_DOMAIN,
        validator_fee_lamports:p.validator_fee_lamports,
        nonce:expected,approved_set_id:validator_set_id,
    })
}
pub fn load_source_fee(
    account:&AccountInfo,program_id:&Pubkey
)->Result<SourceFeePolicy,ProgramError>{
    let (key,bump)=fee_pda(program_id);
    if *account.key!=key || account.owner!=program_id{
        return Err(ProgramError::InvalidAccountData)
    }
    let s:SourceFeePolicy=crate::state::load(account,program_id)?;
    if s.tag!=SOURCE_FEE_TAG||s.version!=crate::state::VERSION||
       s.bump!=bump||s.source_domain!=codec::SOLANA_DOMAIN ||
       s.validator_fee_lamports==0||s.nonce==0||s.approved_set_id==0{
        return Err(ProgramError::InvalidAccountData)
    }
    Ok(s)
}
pub fn apply_source_fee(
    program_id:&Pubkey,accounts:&[AccountInfo],
    proposal:SourceFeeProposal,bitmap:Vec<u8>,
    compressed_signature:Vec<u8>,hash_witness:Vec<u8>,
)->ProgramResult{
    let mut it=accounts.iter();
    let payer=next_account_info(&mut it)?;
    let policy=next_account_info(&mut it)?;
    let validators=next_account_info(&mut it)?;
    let system=next_account_info(&mut it)?;
    let rent_sysvar=next_account_info(&mut it)?;
    if !payer.is_signer||!payer.is_writable||!policy.is_writable||
       *rent_sysvar.key!=sysvar::rent::id()||
       *policy.key!=fee_pda(program_id).0{
        return Err(ProgramError::InvalidInstructionData)
    }
    let anchor=trusted_validators::ImmutableAnchor::compiled()?;
    let snapshot=trusted_validators::load_current_set(
        validators,program_id,&anchor
    )?;
    let current=if policy.owner==program_id {
        Some(load_source_fee(policy,program_id)?)
    }else if *policy.owner==solana_program::system_program::id()&&
         policy.data_is_empty() {
        None
    }else {return Err(ProgramError::InvalidAccountData)};
    let now=u64::try_from(Clock::get()?.unix_timestamp)
        .map_err(|_|ProgramError::InvalidInstructionData)?;
    let updated=plan_fee_update(
        current.as_ref(),&proposal,program_id,snapshot.set_id,now
    )?;
    let approved=bls_sbf::verify_payload(
        &signing_payload(&proposal),&snapshot,
        &bitmap,&compressed_signature,&hash_witness
    )?;
    if !approved{return Err(ProgramError::InvalidInstructionData);}
    if current.is_none(){
        let bytes=borsh::to_vec(&updated)
            .map_err(|_|ProgramError::InvalidAccountData)?;
        let rent=Rent::from_account_info(rent_sysvar)?;
        factory::create_pda(
            program_id,payer,policy,system,&rent,
            &[SOURCE_FEE_SEED],bytes.len(),program_id
        )?;
    }
    crate::state::save(policy,program_id,&updated)
}
#[cfg(test)]
mod tests{
    use super::*;
    fn proposal(program:&Pubkey)->SourceFeeProposal{
        SourceFeeProposal{source_domain:codec::SOLANA_DOMAIN,
            registry_program:program.to_bytes(),set_id:7,nonce:1,
            valid_until:1500,validator_fee_lamports:100_000}
    }
    #[test]fn initial_and_updated_fee_both_require_current_set_nonce_and_deadline(){
        let id=Pubkey::new_unique();
        let p=proposal(&id);
        let initial=plan_fee_update(None,&p,&id,7,1000).unwrap();
        assert_eq!(initial.validator_fee_lamports,100_000);
        assert_eq!(initial.nonce,1);
        let mut second=p.clone();second.nonce=2;
        second.validator_fee_lamports=200_000;second.set_id=8;
        let next=plan_fee_update(Some(&initial),&second,&id,8,1200).unwrap();
        assert_eq!(next.validator_fee_lamports,200_000);
        assert_eq!(next.approved_set_id,8);
        assert!(plan_fee_update(Some(&next),&second,&id,8,1200).is_err());
        second.valid_until=1199;
        assert!(plan_fee_update(Some(&initial),&second,&id,8,1200).is_err());
        second.valid_until=1200;
        assert!(plan_fee_update(Some(&initial),&second,&id,8,1200).is_ok());
    }
    #[test]fn no_client_selected_fee_or_foreign_registry_identity(){
        let id=Pubkey::new_unique();
        let mut p=proposal(&id);
        p.source_domain=1643;
        assert!(plan_fee_update(None,&p,&id,7,1000).is_err());
        p=proposal(&id);p.registry_program=Pubkey::new_unique().to_bytes();
        assert!(plan_fee_update(None,&p,&id,7,1000).is_err());
        p=proposal(&id);p.set_id=8;
        assert!(plan_fee_update(None,&p,&id,7,1000).is_err());
        p=proposal(&id);p.validator_fee_lamports=0;
        assert!(plan_fee_update(None,&p,&id,7,1000).is_err());
        p=proposal(&id);p.nonce=2;
        assert!(plan_fee_update(None,&p,&id,7,1000).is_err());
        p=proposal(&id);p.valid_until=0;
        assert!(plan_fee_update(None,&p,&id,7,1000).is_err());
    }
    #[test]fn signing_payload_binds_full_program_domain_epoch_fee_and_nonce(){
        let id=Pubkey::new_unique();
        let p=proposal(&id);
        let base=signing_payload(&p);
        let mut next=p.clone();next.set_id=8;
        assert_ne!(base,signing_payload(&next));
        next=p.clone();next.registry_program=Pubkey::new_unique().to_bytes();
        assert_ne!(base,signing_payload(&next));
        next=p.clone();next.validator_fee_lamports+=1;
        assert_ne!(base,signing_payload(&next));
        next=p;next.nonce+=1;
        assert_ne!(base,signing_payload(&next));
    }
    #[test]fn solana_pda_cross_language_golden_vectors(){
        // Must match the independent Go node candidate verifier exactly.
        let id=Pubkey::new_from_array([17u8;32]);
        fn bytes(h:&str)->[u8;32]{
            let mut out=[0u8;32];
            assert_eq!(h.len(),64);
            for i in 0..32 {
                out[i]=u8::from_str_radix(&h[2*i..2*i+2],16).unwrap();
            }
            out
        }
        assert_eq!(fee_pda(&id).0.to_bytes(),bytes(
            "7b17712335a7150af4e04f0f57ff7436106485d7ec7dd49eff6d207988e2b7df"
        ));
        assert_eq!(
            crate::trusted_validators::trusted_pda(&id).0.to_bytes(),
            bytes("f4dbfa8c914254b2c239706fdf89cf673dddd49b6fd2305e45b1a1e64ed68a2e")
        );
    }

}
