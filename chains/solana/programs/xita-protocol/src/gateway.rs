//! Solidity parity: ILNGateway.quoteILN/bridge.
//! No principal may enter a vault without an atomically emitted and
//! independently verifiable source message plus validator source fee.
//! The implementation explicitly fails closed until the SPL token CPI,
//! message dispatch, validator fee allocation and replay checks are ready.
use solana_program::program_error::ProgramError;
pub fn bridge_unavailable()->Result<(),ProgramError>{
 Err(crate::disabled())
}
