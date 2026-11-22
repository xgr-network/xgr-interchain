import {chainSignatureProfile} from "../../apps/web/chain-signature-profile.js";

// One explicitly configured destination contract profile. This mapping is
// shared by the Admin deployment builder, wallet intent, reconciliation and
// the operator's on-chain contract identity check. It never selects from
// RPC availability, a peer signature, a key length or the UI's chain label.
const PROFILES=Object.freeze({
 compressed:Object.freeze({
  keyFormat:1,registryVersion:3,
  registryArtifact:"validatorRegistry",registryContract:"XGRInterchainValidatorRegistryV3",
  ismArtifact:"ism",ismContract:"XITADirectBLSISM"
 }),
 eip2537:Object.freeze({
  keyFormat:2,registryVersion:3,
  registryArtifact:"validatorRegistry",registryContract:"XGRInterchainValidatorRegistryV3",
  ismArtifact:"ism",ismContract:"XITADirectBLSISM"
 }),
 ecdsa:Object.freeze({
  keyFormat:3,registryVersion:5,
  registryArtifact:"xdcValidatorRegistry",registryContract:"XGRInterchainECDSAValidatorRegistryV5",
  ismArtifact:"xdcIsm",ismContract:"XITADirectECDSAISM"
 })
});
export function chainContractProfile(chain){
 const profile=chainSignatureProfile(chain);
 return {...profile,...PROFILES[profile.format]};
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
