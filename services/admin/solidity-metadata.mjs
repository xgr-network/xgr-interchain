// Normalize ONLY Solidity 0.8.24's known 53-byte trailing CBOR trailer:
// a2/ipfs/multihash(0x1220 + 32-byte digest)/solc/0.8.24/length=0x0033.
// The 32-byte IPFS digest reflects compiler input metadata, not EVM
// instructions. Everything else, including Solidity version and code body,
// remains byte-for-byte verified. Do not generalize to arbitrary metadata.
const CODE=/^0x(?:[0-9a-f]{2})+$/i;
const PREFIX="a2646970667358221220";
const SUFFIX="64736f6c63430008180033";
const BODY=PREFIX.length+64+SUFFIX.length;
export function normalizeSolc0824IpfsDigest(code){
 if(typeof code!=="string"||!CODE.test(code))throw Error("Invalid runtime/creation hex");
 const source=code.toLowerCase(),start=source.length-BODY;
 if(start<2||source.slice(start,start+PREFIX.length)!==PREFIX||
    !source.endsWith(SUFFIX))return source;
 return source.slice(0,start+PREFIX.length)+"00".repeat(32)+source.slice(start+PREFIX.length+64);
}
