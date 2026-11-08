//! Actual SVM entrypoint for XGR V3 membership changes. Fully
//! permissionless: any fee payer can submit an independently signed
//! transition. No GmbH owner, pause, signer allowlist or shortcut exists.
//!
//! All mutations are written atomically with an immutable historical epoch
//! PDA. No transfer or mint instruction is enabled here.
use crate::{
    bls_sbf,
    factory::create_pda,
    trusted_validators::{
        self,ValidatorSnapshot,MembershipProposal,MembershipProposalWire,
        CURRENT_SEED,HISTORY_SEED,
    },
};
use solana_program::{
    account_info::{next_account_info,AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    sysvar::{self,Sysvar},
};
use borsh::BorshSerialize;

/// Native Agave 4.4 BLS quorum and hash-to-G2-witness-protected PoP proofs.
/// The first signer set is ALWAYS read from the pinned program-owned PDA.
/// Requires an immutable Solana-destination XGR V3 checkpoint at bootstrap.
pub fn apply_membership(
    program_id:&Pubkey,accounts:&[AccountInfo],
    wire:MembershipProposalWire,
    bitmap:Vec<u8>,
    compressed_signature:Vec<u8>,
    quorum_witness:Vec<u8>,
    compressed_pop:Vec<u8>,
    pop_witness:Vec<u8>,
)->ProgramResult{
    let bad=||ProgramError::InvalidInstructionData;
    let mut it=accounts.iter();
    let payer=next_account_info(&mut it)?;
    let current_account=next_account_info(&mut it)?;
    let history_account=next_account_info(&mut it)?;
    let system=next_account_info(&mut it)?;
    let rent_account=next_account_info(&mut it)?;
    if !payer.is_signer||!payer.is_writable||
       !current_account.is_writable||!history_account.is_writable||
       *rent_account.key!=sysvar::rent::id(){
        return Err(bad());
    }
    let anchor=trusted_validators::ImmutableAnchor::compiled()?;
    let old=trusted_validators::load_current_set(
        current_account,program_id,&anchor
    )?;
    let proposal=MembershipProposal::from(wire);
    let now_i64=Clock::get()?.unix_timestamp;
    let now=u64::try_from(now_i64).map_err(|_|bad())?;
    // All EVM V3 guards: deadline, old setId, membership identity, maximum
    // capacity, no duplicate key, matching key encoding and swap-and-pop.
    let next=trusted_validators::plan_membership(&old,&proposal,now)?;
    if compressed_signature.len()!=96||quorum_witness.len()!=96||
       (proposal.action==1 &&
         (compressed_pop.len()!=96||pop_witness.len()!=96)) ||
       (proposal.action==2 &&
         (!compressed_pop.is_empty()||!pop_witness.is_empty())) {
        return Err(bad());
    }
    // Verify the ACTUAL native BLS signature over the *Solidity V3*
    // encodeMembershipPayload bytes. No supplied alternate validator keys.
    let approved=bls_sbf::verify_payload(
        &trusted_validators::membership_payload(&proposal),
        &old,&bitmap,&compressed_signature,&quorum_witness
    )?;
    if !approved{return Err(bad());}

    if proposal.action==1 {
        // Fresh candidate proves possession of its own private BLS key,
        // on the destination-scoped XGR V3 bootstrap payload.
        let candidate=ValidatorSnapshot{
            set_id:old.set_id,
            commitment:trusted_validators::commitment_for(
                &[proposal.validator.clone()]
            ).ok_or_else(bad)?,
            xgr_registry:old.xgr_registry,
            members:vec![proposal.validator.clone()],
        };
        let owned=bls_sbf::verify_payload(
            &trusted_validators::possession_payload(&proposal.validator),
            &candidate,&[1u8],&compressed_pop,&pop_witness
        )?;
        if !owned{return Err(bad());}
    }

    // This immutable PDA is never overwritten. It preserves the same
    // epoch-specific order and keys as EVM V3 verificationSetSnapshots.
    let next_id_bytes=next.set_id.to_be_bytes();
    let expected=trusted_validators::history_pda(program_id,next.set_id).0;
    if *history_account.key!=expected{return Err(ProgramError::InvalidSeeds);}
    let encoded=borsh::to_vec(&next)
        .map_err(|_|ProgramError::InvalidAccountData)?;
    let rent=Rent::from_account_info(rent_account)?;
    create_pda(program_id,payer,history_account,system,&rent,
        &[HISTORY_SEED,&next_id_bytes],encoded.len(),program_id)?;
    crate::state::save(history_account,program_id,&next)?;
    // Write current-set state only AFTER verified old BLS quorum, PoP and
    // new history PDA. A failed CPI/instruction rolls back all state.
    trusted_validators::store_current_set(
        current_account,program_id,&next
    )?;
    Ok(())
}
