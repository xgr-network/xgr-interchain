//! Native XITA SVM v3.1.5 functional modules. No on-chain authority belongs
//! to the XGR.Network GmbH. Construction is permissionless. The existing EVM
//! Solidity contracts and XGR PoS consensus are not modified by this crate.
//!
//! SECURITY: Mainnet deployment is not authorized. This intentionally has no
//! callable bridge, synthetic mint, inbound unlock, fee claim, upgrade, pause
//! or admin endpoint until Direct-BLS current-set verification and end-to-end
//! independently authenticated source evidence are implemented and audited.
#![allow(unexpected_cfgs)]
pub mod codec;
pub mod collateral;
pub mod direct_bls_ism;
pub mod factory;
pub mod fee_vault;
pub mod gateway;
pub mod instruction;
pub mod registry;
pub mod router;
pub mod state;
pub mod validator_registry;

use solana_program::{
    account_info::AccountInfo,entrypoint::ProgramResult,
    program_error::ProgramError,pubkey::Pubkey,
};
pub fn disabled()->ProgramError{ProgramError::Custom(0x5849_5441)}
pub fn process_instruction(
    program_id:&Pubkey,accounts:&[AccountInfo],data:&[u8]
)->ProgramResult{
    factory::process(program_id,accounts,data)
}
#[cfg(not(feature="no-entrypoint"))]
solana_program::entrypoint!(process_instruction);

#[cfg(test)]
mod tests{
 use super::*;
  use instruction::XitaInstruction;
 #[test]fn every_monetary_or_privileged_instruction_fails_closed(){
  let program_id=Pubkey::new_unique();
  for instruction in [
   XitaInstruction::Bridge{recipient:[1;32],amount:1},
   XitaInstruction::ApplySourceFee{proposal:vec![],signer_bitmap:vec![],signature:vec![]},
   XitaInstruction::ExecuteInbound{message:vec![],proof:vec![]},
   XitaInstruction::ClaimFees{max_epochs:1},
  ]{
   let raw=borsh::to_vec(&instruction).unwrap();
   assert_eq!(process_instruction(&program_id,&[],&raw),Err(disabled()));
  }
 }
}
