//! Solidity parity: XITADirectBLSISM.verify.
//! Merely decoding a signature is NOT authorization. Only an audited native
//! BLS12-381 verifier with a current-set binding and authenticated source
//! checkpoint may return true. This module is deliberately fail-closed.
use crate::codec::{Authorization, signing_preimage};
use solana_program::program_error::ProgramError;
pub fn verify(_authorization:&Authorization,_bitmap:&[u8],_signature:&[u8])
 -> Result<bool,ProgramError> {
 Err(crate::disabled())
}
pub fn signing_bytes(authorization:&Authorization)->Option<Vec<u8>>{
 signing_preimage(authorization)
}
