// One explicitly configured destination contract profile. This mapping is
// shared by the Admin deployment builder, wallet intent, reconciliation and
// the operator's on-chain contract identity check. It never selects from
// RPC availability, a peer signature, a key length or the UI's chain label.
const PROFILES=Object.freeze({
 compressed:Object.freeze({
  scheme:"bls",format:"compressed",keyFormat:1,registryVersion:3,
  registryArtifact:"validatorRegistry",registryContract:"XGRInterchainValidatorRegistryV3",
  ismArtifact:"ism",ismContract:"XITADirectBLSISM",verifierComponent:null
 }),
 eip2537:Object.freeze({
  scheme:"bls",format:"eip2537",keyFormat:2,registryVersion:3,
  registryArtifact:"validatorRegistry",registryContract:"XGRInterchainValidatorRegistryV3",
  ismArtifact:"ism",ismContract:"XITADirectBLSISM",verifierComponent:"blsVerifier"
 }),
 ecdsa:Object.freeze({
  scheme:"ecdsa",format:"ecdsa",keyFormat:3,registryVersion:5,
  registryArtifact:"xdcValidatorRegistry",registryContract:"XGRInterchainECDSAValidatorRegistryV5",
  ismArtifact:"xdcIsm",ismContract:"XITADirectECDSAISM",verifierComponent:"ecdsaVerifier"
 })
});
const CONTRACT_KEYS=new Set(["validatorRegistry","ism"]);

export function chainContractProfile(chain){
 const format=chain?.blsVerifierFormat;
 const profile=PROFILES[format];
 if(!profile||!Number.isSafeInteger(chain?.chainId)||chain.chainId<1||
    !Number.isSafeInteger(chain?.domainId)||chain.domainId!==chain.chainId)
  throw Error("Unsupported or inconsistent destination chain contract profile");
 // Older, already deployed BLS manifests did not have signatureScheme.
 // Only those profiles may omit it; ECDSA must be explicitly declared.
 if((chain.signatureScheme??(profile.scheme==="bls"?"bls":null))!==profile.scheme)
  throw Error("Destination signature scheme and verifier format disagree");
 return profile;
}
export function chainArtifactKey(chain,component){
 const profile=chainContractProfile(chain);
 if(component==="validatorRegistry")return profile.registryArtifact;
 if(component==="ism")return profile.ismArtifact;
 if(component==="ecdsaVerifier"&&profile.scheme!=="ecdsa")
  throw Error("ECDSA verifier cannot deploy on a BLS destination");
 if(component==="blsVerifier"&&profile.format!=="eip2537")
  throw Error("BLS verifier cannot deploy on this destination");
 if(!component||typeof component!=="string")
  throw Error("Invalid deployment component");
 return component;
}
export function assertChainArtifact(chain,component,artifact){
 const key=chainArtifactKey(chain,component);
 if(!artifact||artifact.component!==key)
  throw Error("Wrong cryptographic contract artifact for destination: "+component);
 return key;
}
