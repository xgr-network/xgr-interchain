//! Permissionless, validator-authenticated historical fee claims.
//! Solana validators are identified by 20-byte EVM identities on XGRChain.
//! A claim proves ownership of the historical BLS key AND possession of the
//! destination Solana payee key by requiring its transaction signature.
//! No GmbH recipient wallet, treasury sweep, mutable fee recipient map,
//! operator claim approval or admin drain exists.
use crate::{
    bls_sbf,factory,fee_vault,state,trusted_validators,
    state::{ValidatorFeeClaim,FeeVault,FeeEpoch,FEE_CLAIM_TAG,VERSION},
};
use borsh::BorshSerialize;
use solana_program::{
    account_info::{next_account_info,AccountInfo},
    entrypoint::ProgramResult,
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    sysvar::{self,Sysvar},
};
pub const CLAIM_SEED:&[u8]=b"xita-validator-fee-claim";
pub const CLAIM_DOMAIN:&[u8]=b"XITA_SOLANA_FEE_CLAIM_V1";
pub fn claim_pda(
    program:&Pubkey,fee_vault:&Pubkey,set_id:u64,validator:[u8;20]
)->(Pubkey,u8){
    Pubkey::find_program_address(
        &[CLAIM_SEED,fee_vault.as_ref(),&set_id.to_be_bytes(),&validator],
        program
    )
}
/// Full-domain validator self-claim; a BLS vote from an unrelated validator
/// or a signature on another route, epoch, payee or nonce is unusable.
pub fn signing_payload(
    program:&Pubkey,fee_vault:&Pubkey,route_id:[u8;32],
    set_id:u64,validator:[u8;20],recipient:&Pubkey,nonce:u64
)->Vec<u8>{
    let mut data=Vec::with_capacity(180);
    data.extend_from_slice(CLAIM_DOMAIN);
    data.extend_from_slice(program.as_ref());
    data.extend_from_slice(fee_vault.as_ref());
    data.extend_from_slice(&route_id);
    data.extend_from_slice(&set_id.to_be_bytes());
    data.extend_from_slice(&validator);
    data.extend_from_slice(recipient.as_ref());
    data.extend_from_slice(&nonce.to_be_bytes());
    data
}
pub fn claim_delta(
    epoch:&FeeEpoch,snapshot:&trusted_validators::ValidatorSnapshot,
    prior:Option<&ValidatorFeeClaim>,route_id:[u8;32],
    validator:[u8;20],nonce:u64
)->Result<(ValidatorFeeClaim,u64,usize),ProgramError>{
    let bad=||ProgramError::InvalidInstructionData;
    if epoch.tag!=state::EPOCH_TAG||epoch.version!=VERSION||
       epoch.route_id!=route_id || epoch.set_id!=snapshot.set_id ||
       epoch.recipients as usize!=snapshot.members.len()||
       snapshot.members.is_empty()||validator==[0;20]||
       nonce==0 {return Err(bad());}
    let idx=snapshot.members.iter().position(|v|v.address==validator)
        .ok_or_else(bad)?;
    let total=fee_vault::earned_for_epoch(
        epoch.total_lamports,idx+1,snapshot.members.len()
    ).ok_or_else(bad)?;
    let claimed=prior.map(|p|{
        if p.tag!=FEE_CLAIM_TAG||p.version!=VERSION||
           p.route_id!=route_id||p.set_id!=epoch.set_id||
           p.validator!=validator{return Err(bad());}
        if p.nonce==u64::MAX||nonce!=p.nonce+1{return Err(bad());}
        Ok(p.claimed_lamports)
    }).transpose()?.unwrap_or(0);
    if prior.is_none()&&nonce!=1{return Err(bad());}
    if total<=claimed{return Err(bad());}
    let delta=total-claimed;
    Ok((ValidatorFeeClaim{
        tag:FEE_CLAIM_TAG,version:VERSION,
        route_id,set_id:epoch.set_id,validator,
        nonce,claimed_lamports:total,
    },delta,idx))
}
/// Accounts: validator's chosen SOL payee(signer,w), route PDA,
/// historical route feeVault(w), historical feeEpoch, historical validator
/// set PDA, per-validator per-epoch claim ledger PDA(w), System, Rent.
///
/// Last known historical validator set is authenticated from its immutable
/// root, and the payee wallet must itself sign. Source Lamports, epoch fees
/// and claim ledger are all controlled by the XITA program; no CPI can steal
/// from another route's vault or from Solana rent reserves.
pub fn execute(
    program_id:&Pubkey,accounts:&[AccountInfo],validator:[u8;20],nonce:u64,
    bitmap:Vec<u8>,compressed_signature:Vec<u8>,hash_witness:Vec<u8>
)->ProgramResult{
    let bad=||ProgramError::InvalidInstructionData;
    let mut it=accounts.iter();
    let payee=next_account_info(&mut it)?;
    let route_account=next_account_info(&mut it)?;
    let vault_account=next_account_info(&mut it)?;
    let epoch_account=next_account_info(&mut it)?;
    let historic=next_account_info(&mut it)?;
    let claim_account=next_account_info(&mut it)?;
    let system=next_account_info(&mut it)?;
    let rent_account=next_account_info(&mut it)?;
    if !payee.is_signer||!payee.is_writable||
       !vault_account.is_writable||!claim_account.is_writable||
       *system.key!=solana_program::system_program::id()||
       !system.executable||
       *rent_account.key!=sysvar::rent::id(){
        return Err(bad())
    }
    let route:state::Route=state::load(route_account,program_id)?;
    let vault:FeeVault=state::load(vault_account,program_id)?;
    if route.tag!=state::ROUTE_TAG||route.version!=VERSION||
       *vault_account.key!=Pubkey::find_program_address(
           &[factory::FEE_SEED,route_account.key.as_ref()],program_id
       ).0||
       route.fee_vault!=vault_account.key.to_bytes()||
       vault.tag!=state::FEE_TAG||vault.version!=VERSION||
       vault.route_id!=route.route_id {
        return Err(ProgramError::InvalidAccountData)
    }
    let epoch:FeeEpoch=state::load(epoch_account,program_id)?;
    if *epoch_account.key!=fee_vault::epoch_pda(
        program_id,vault_account.key,epoch.set_id
    ).0{return Err(ProgramError::InvalidSeeds)}
    let anchor=trusted_validators::ImmutableAnchor::compiled()?;
    if epoch.set_id<anchor.set_id||epoch.set_id==0{
        return Err(ProgramError::InvalidAccountData)
    }
    let snapshot=trusted_validators::load_historical_set(
        historic,program_id,epoch.set_id
    )?;
    if snapshot.xgr_registry!=anchor.xgr_registry ||
       (snapshot.set_id==anchor.set_id&&
        snapshot.commitment!=anchor.commitment){
        return Err(ProgramError::InvalidAccountData)
    }
    let (expected,_)=claim_pda(
        program_id,vault_account.key,epoch.set_id,validator
    );
    if *claim_account.key!=expected {
        return Err(ProgramError::InvalidSeeds)
    }
    let prior=if claim_account.owner==program_id {
        Some(state::load::<ValidatorFeeClaim>(claim_account,program_id)?)
    } else if *claim_account.owner==solana_program::system_program::id()&&
        claim_account.data_is_empty(){
        None
    }else{return Err(ProgramError::InvalidAccountData)};
    let (next,amount,index)=claim_delta(
        &epoch,&snapshot,prior.as_ref(),route.route_id,validator,nonce
    )?;
    let member=&snapshot.members[index];
    let single=trusted_validators::ValidatorSnapshot{
        set_id:epoch.set_id,xgr_registry:snapshot.xgr_registry,
        commitment:trusted_validators::commitment_for(&[member.clone()])
            .ok_or_else(bad)?,
        members:vec![member.clone()],
    };
    let identity=signing_payload(
        program_id,vault_account.key,route.route_id,
        epoch.set_id,validator,payee.key,nonce
    );
    if bitmap!=[1u8] ||
       !bls_sbf::verify_payload(
           &identity,&single,&bitmap,
           &compressed_signature,&hash_witness
       )? {return Err(bad());}
    let rent=Rent::from_account_info(rent_account)?;
    let ledger_bytes=borsh::to_vec(&next)
        .map_err(|_|ProgramError::InvalidAccountData)?;
    if vault_account.lamports()<rent.minimum_balance(vault_account.data_len())
        .checked_add(amount).ok_or_else(bad)? {
        return Err(ProgramError::InsufficientFunds)
    }
    if prior.is_none(){
        let epoch_id=epoch.set_id.to_be_bytes();
        factory::create_pda(
            program_id,payee,claim_account,system,&rent,
            &[CLAIM_SEED,vault_account.key.as_ref(),&epoch_id,&validator],
            ledger_bytes.len(),program_id
        )?;
    }
    // Native program-owned lamports can be paid out directly. Rent balance
    // remains locked in the FeeVault. New fees are not double claimed:
    // the immutable historical epoch total and claimed-total ledger
    // independently determine the next delta.
    **vault_account.try_borrow_mut_lamports()?-=amount;
    **payee.try_borrow_mut_lamports()?=payee.lamports()
        .checked_add(amount).ok_or_else(bad)?;
    state::save(claim_account,program_id,&next)
}
#[cfg(test)]
mod tests {
    use super::*;
    use bls12_381::{Scalar,G1Affine,G1Projective};
    fn member(id:u8)->trusted_validators::ValidatorRecord{
        let p=G1Affine::from(G1Projective::generator()*Scalar::from(id as u64+11));
        let raw=p.to_uncompressed();
        let mut eip=[0u8;128];
        eip[16..64].copy_from_slice(&raw[..48]);
        eip[80..].copy_from_slice(&raw[48..]);
        let mut address=[0u8;20];address[19]=id;
        trusted_validators::ValidatorRecord{
            address,compressed_key:p.to_compressed(),eip2537_key:eip
        }
    }
    fn fixtures()->(FeeEpoch,trusted_validators::ValidatorSnapshot,[u8;20]){
        let one=member(1);let two=member(2);let three=member(3);
        let commitment=trusted_validators::commitment_for(&[
            one.clone(),two.clone(),three.clone()
        ]).unwrap();
        let snapshot=trusted_validators::ValidatorSnapshot{
            set_id:7,xgr_registry:[9;20],commitment,
            members:vec![one.clone(),two,three]
        };
        let ep=FeeEpoch{
            tag:state::EPOCH_TAG,version:VERSION,bump:1,
            route_id:[42;32],set_id:7,recipients:3,
            total_lamports:11,
        };
        (ep,snapshot,one.address)
    }
    #[test]fn historic_validator_self_claim_is_incremental_not_replayable(){
        let (ep,snapshot,validator)=fixtures();
        let (first,amount,idx)=claim_delta(
            &ep,&snapshot,None,ep.route_id,validator,1
        ).unwrap();
        assert_eq!(idx,0);
        assert_eq!(amount,4);
        assert_eq!(first.claimed_lamports,4);
        assert!(claim_delta(
            &ep,&snapshot,Some(&first),ep.route_id,validator,1
        ).is_err());
        assert!(claim_delta(
            &ep,&snapshot,Some(&first),ep.route_id,validator,2
        ).is_err());
        let mut updated=ep;updated.total_lamports=14;
        let (second,difference,_)=claim_delta(
            &updated,&snapshot,Some(&first),updated.route_id,validator,2
        ).unwrap();
        assert_eq!(difference,1);
        assert_eq!(second.claimed_lamports,5);
        assert_eq!(first.claimed_lamports,4);
    }
    #[test]fn payee_proof_is_bound_to_program_route_validator_and_nonce(){
        let pid=Pubkey::new_unique();
        let vault=Pubkey::new_unique();
        let a=Pubkey::new_unique();let b=Pubkey::new_unique();
        let (ep,_,validator)=fixtures();
        let payload=signing_payload(&pid,&vault,ep.route_id,
            ep.set_id,validator,&a,1);
        assert_ne!(payload,signing_payload(
            &pid,&vault,ep.route_id,ep.set_id,validator,&b,1));
        assert_ne!(payload,signing_payload(
            &pid,&vault,ep.route_id,ep.set_id,validator,&a,2));
        assert_ne!(payload,signing_payload(
            &pid,&vault,[13;32],ep.set_id,validator,&a,1));
        let mut wrong=validator;wrong[19]=33;
        assert_ne!(payload,signing_payload(
            &pid,&vault,ep.route_id,ep.set_id,wrong,&a,1));
        assert_ne!(claim_pda(&pid,&vault,7,validator).0,
                   claim_pda(&pid,&vault,8,validator).0);
    }
}
