import {keccak256} from "../../apps/web/keccak.mjs";

const ADDRESS=/^0x[0-9a-f]{40}$/i;
const PRECOMPILE="0x0000000000000000000000000000000000000001";
const HALF_ORDER=0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n;

export function validateECDSABootstrapProof(proof,{chain,approvedValidators}){
 const validator=String(proof?.validator||"").toLowerCase();
 if(chain.name!=="xdc"||chain.chainId!==50||chain.domainId!==50||
    chain.signatureScheme!=="ecdsa"||proof?.signatureScheme!=="ecdsa"||
    proof.originChainId!==1643||proof.destinationDomain!==50||
    !ADDRESS.test(validator)||!approvedValidators.some(a=>a.toLowerCase()===validator)||
    proof.ecdsaSigner?.toLowerCase()!==validator)
  throw Error("ECDSA Genesis proof identity or destination mismatch");
 const domains=Buffer.alloc(12);
 domains.writeBigUInt64BE(BigInt(proof.originChainId));
 domains.writeUInt32BE(proof.destinationDomain,8);
 const expected=Buffer.concat([
  Buffer.from("XITA_ECDSA_BOOTSTRAP_V2"),
  domains,
  Buffer.from(validator.slice(2),"hex")
 ]);
 if(proof.payload?.toLowerCase()!=="0x"+expected.toString("hex")||
    !/^0x[0-9a-f]{130}$/i.test(proof.possessionProof||""))
  throw Error("Invalid ECDSA Genesis payload or signature length");
 const signature=proof.possessionProof.slice(2).toLowerCase();
 const r=signature.slice(0,64),s=signature.slice(64,128),v=signature.slice(128);
 if(BigInt("0x"+r)===0n||BigInt("0x"+s)===0n||BigInt("0x"+s)>HALF_ORDER||!["1b","1c"].includes(v))
  throw Error("Noncanonical ECDSA Genesis signature");
 return {validator,ecdsaSigner:validator,calldata:keccak256(expected)+v.padStart(64,"0")+r+s};
}

export async function verifyECDSABootstrapProof(proof,context){
 const {validator,calldata}=validateECDSABootstrapProof(proof,context);
 const {chain,rpc}=context;
 // The native precompile can check possession before any XDC contract exists.
 const url=chain.rpcUrls[0];
 if(BigInt(await rpc(url,"eth_chainId",[]))!==BigInt(chain.chainId))
  throw Error("ECDSA proof RPC chain mismatch");
 const response=await rpc(url,"eth_call",[{to:PRECOMPILE,data:calldata},"latest"]);
 return {validator,verified:typeof response==="string"&&
  response.toLowerCase()==="0x"+"0".repeat(24)+validator.slice(2)};
}
