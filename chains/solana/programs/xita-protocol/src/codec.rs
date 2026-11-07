//! XITA V315 Solana endpoint codec. EVM signing and EVM-only route hashes
//! remain byte-for-byte unchanged. No BLS signer is exposed here.
use solana_program::keccak;

pub const XGR_DOMAIN: u32 = 1643;
pub const SOLANA_DOMAIN: u32 = 1399811149;
pub const GENESIS: [u8;32] = [
    0x45,0x29,0x69,0x98,0xa6,0xf8,0xe2,0xa7,
    0x84,0xdb,0x5d,0x9f,0x95,0xe1,0x8f,0xc2,
    0x3f,0x70,0x44,0x1a,0x10,0x39,0x44,0x68,
    0x01,0x08,0x98,0x79,0xb0,0x8c,0x7e,0xf0,
];
const ASSET_DOMAIN: &[u8] = b"XITA_SOLANA_ASSET_V1";
const ROUTE_DOMAIN: &[u8] = b"XITA_SOLANA_ROUTE_V1";
const MESSAGE_DOMAIN: &[u8] = b"XITA_SOLANA_DIRECT_MESSAGE_V1";

fn hashv(parts: &[&[u8]]) -> [u8;32] {
    keccak::hashv(parts).to_bytes()
}
fn word_u32(v: u32) -> [u8;32] {
    let mut out = [0u8;32];out[28..].copy_from_slice(&v.to_be_bytes());out
}
fn word_u8(v: u8) -> [u8;32] {
    let mut out = [0u8;32];out[31]=v;out
}
pub fn is_evm_address_32(a: &[u8;32]) -> bool {
    *a != [0;32] && a[..12] == [0;12]
}
/// Existing V315 EVM-origin assets never change their canonical Asset ID.
pub fn evm_origin_asset_id(chain_id:u64,token:[u8;20],kind:u8)->Option<[u8;32]>{
    if chain_id==0 || !(kind==0&&token==[0;20] || kind==1&&token!=[0;20]){
        return None;
    }
    let mut chain_word=[0u8;32];
    chain_word[24..].copy_from_slice(&chain_id.to_be_bytes());
    let mut token_word=[0u8;32];
    token_word[12..].copy_from_slice(&token);
    let scope=hashv(&[b"XITA_ASSET_V315"]);
    Some(hashv(&[&scope,&chain_word,&token_word,&word_u8(kind)]))
}
pub fn asset_id(mint: [u8;32],kind: u8) -> Option<[u8;32]> {
    if !((kind==0&&mint==[0;32])||(kind==1&&mint!=[0;32])) {
        return None;
    }
    let scope=hashv(&[ASSET_DOMAIN]);
    Some(hashv(&[&scope,&word_u32(SOLANA_DOMAIN),&GENESIS,&mint,&word_u8(kind)]))
}
pub fn route_id(
    asset_id:[u8;32],source_domain:u32,dest_domain:u32,
    src_router:[u8;32],dst_router:[u8;32],
)->Option<[u8;32]>{
    if asset_id==[0;32] || src_router==[0;32] || dst_router==[0;32] ||
        !((source_domain==XGR_DOMAIN&&dest_domain==SOLANA_DOMAIN) ||
          (source_domain==SOLANA_DOMAIN&&dest_domain==XGR_DOMAIN)) {
        return None;
    }
    if (source_domain==XGR_DOMAIN&&!is_evm_address_32(&src_router)) ||
       (dest_domain==XGR_DOMAIN&&!is_evm_address_32(&dst_router)) {
        return None;
    }
    let scope=hashv(&[ROUTE_DOMAIN]);
    Some(hashv(&[&scope,&asset_id,&word_u32(source_domain),
        &word_u32(dest_domain),&src_router,&dst_router,&GENESIS]))
}
#[derive(Clone)]
pub struct Authorization {
    pub source_domain:u32,
    pub destination_domain:u32,
    pub asset_id:[u8;32],
    pub route_id:[u8;32],
    pub set_id:u64,
    pub source_height:u64,
    pub source_registry:[u8;32],
    pub gateway:[u8;32],
    pub source_router:[u8;32],
    pub source_mailbox:[u8;32],
    pub destination_router:[u8;32],
    pub validator_fee:[u8;32],
    pub message_id:[u8;32],
    pub recipient:[u8;32],
    pub amount:[u8;32],
    pub destination_ism:[u8;32],
    pub destination_registry:[u8;32],
}
pub fn signing_preimage(a:&Authorization)->Option<Vec<u8>> {
    if route_id(a.asset_id,a.source_domain,a.destination_domain,
        a.source_router,a.destination_router)?!=a.route_id ||
        a.set_id==0 ||a.source_height==0 ||
        [a.source_registry,a.gateway,a.source_mailbox,a.message_id,a.recipient,
         a.destination_ism,a.destination_registry,a.validator_fee,a.amount]
            .iter().any(|x|*x==[0u8;32]) {
        return None;
    }
    if a.source_domain==XGR_DOMAIN &&
        ![a.source_registry,a.gateway,a.source_mailbox].iter()
         .all(is_evm_address_32) {return None;}
    if a.destination_domain==XGR_DOMAIN &&
        ![a.destination_ism,a.destination_registry,a.recipient].iter()
         .all(is_evm_address_32) {return None;}
    let mut out=Vec::with_capacity(501);
    out.extend_from_slice(MESSAGE_DOMAIN);
    out.extend_from_slice(&a.source_domain.to_be_bytes());
    out.extend_from_slice(&a.destination_domain.to_be_bytes());
    out.extend_from_slice(&GENESIS);
    out.extend_from_slice(&a.asset_id);
    out.extend_from_slice(&a.route_id);
    out.extend_from_slice(&a.set_id.to_be_bytes());
    out.extend_from_slice(&a.source_height.to_be_bytes());
    for x in [&a.source_registry,&a.gateway,&a.source_router,
        &a.source_mailbox,&a.destination_router,&a.validator_fee,
        &a.message_id,&a.recipient,&a.amount,&a.destination_ism,
        &a.destination_registry] {
        out.extend_from_slice(x);
    }
    if out.len()!=501 {return None;}
    Some(out)
}
pub fn signing_hash(a:&Authorization)->Option<[u8;32]> {
    Some(hashv(&[&signing_preimage(a)?]))
}
pub fn exact_scale_amount(
    amount:u128,src_decimals:u8,dst_decimals:u8,destination_svm:bool
)->Option<u128>{
    if amount==0||src_decimals>18||dst_decimals>18{return None;}
    let scaled=if dst_decimals>=src_decimals{
        amount.checked_mul(10u128.checked_pow((dst_decimals-src_decimals) as u32)?)?
    }else{
        let d=10u128.checked_pow((src_decimals-dst_decimals) as u32)?;
        if amount%d!=0 {return None;}
        amount/d
    };
    if scaled==0||(destination_svm&&scaled>u64::MAX as u128){return None;}
    Some(scaled)
}
#[cfg(test)]
mod tests{
 use super::*;
 fn h(s:&str)->[u8;32]{
    assert_eq!(s.len(),64);let mut b=[0u8;32];
    for i in 0..32 {b[i]=u8::from_str_radix(&s[i*2..i*2+2],16).unwrap();}b
 }
 #[test]fn evm_native_xgr_asset_keeps_v315_id(){
    assert_eq!(
        evm_origin_asset_id(1643,[0;20],0).unwrap(),
        h("a7585b8fbd074c1a7fa6df8b8e2e5ce73395ccbb64bf99b631c5da8ff2ac44e0")
    );
    assert!(evm_origin_asset_id(0,[0;20],0).is_none());
    assert!(evm_origin_asset_id(1643,[0;20],1).is_none());
 }
 #[test]fn solana_asset_and_route_golden_vectors(){
  let a=h("a7585b8fbd074c1a7fa6df8b8e2e5ce73395ccbb64bf99b631c5da8ff2ac44e0");
  let mint=h("069b8857feab8184fb687f634618c035dac439dc1aeb3b5598a0f00000000001");
  assert_eq!(asset_id(mint,1).unwrap(),
   h("d2aefcda8943cf2e0983e100de0325d0d1de575deb4f476e562c0e120db3957d"));
  let src=h("000000000000000000000000000000000000000000000000000000000000a11c");
  let dst=h("06ddf6e1d765a193d9cbe146ceeb79ac1cb485ed5f5b37913a8cf5857eff00a9");
  assert_eq!(route_id(a,XGR_DOMAIN,SOLANA_DOMAIN,src,dst).unwrap(),
   h("185ea4af59c1c6160ca69ab81f0621fe4d823eab02cfd5c5e9decbd6000dadf6"));
  assert_eq!(route_id(a,SOLANA_DOMAIN,XGR_DOMAIN,dst,src).unwrap(),
   h("f53653c35f340c4903ad09747d10d816aa59194f841822ae24114e5df6f3b263"));
  assert!(route_id(a,8453,SOLANA_DOMAIN,src,dst).is_none());
  assert_eq!(exact_scale_amount(10u128.pow(18),18,9,true),Some(1_000_000_000));
  assert_eq!(exact_scale_amount(1,18,9,true),None);
 }
}
