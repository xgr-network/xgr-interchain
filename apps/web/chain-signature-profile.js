// Contract evidence required by each declared chain signature format.
const SIGNATURE_PROFILES=new Map([
 ["compressed",Object.freeze({scheme:"bls",format:"compressed",verifierComponent:null})],
 ["eip2537",Object.freeze({scheme:"bls",format:"eip2537",verifierComponent:"blsVerifier"})],
 ["ecdsa",Object.freeze({scheme:"ecdsa",format:"ecdsa",verifierComponent:"ecdsaVerifier"})]
]);

export function chainSignatureProfile(chain){
 const profile=SIGNATURE_PROFILES.get(chain?.blsVerifierFormat);
 if(!profile||!Number.isSafeInteger(chain.chainId)||chain.chainId<1||chain.domainId!==chain.chainId)
  throw Error("Unsupported or inconsistent destination chain contract profile");
 // Existing BLS manifests may omit signatureScheme. ECDSA is explicit.
 if((chain.signatureScheme??(profile.scheme==="bls"?"bls":null))!==profile.scheme)
  throw Error("Destination signature scheme and verifier format disagree");
 return profile;
}
