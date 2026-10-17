// Transaction-only constructor inputs, never an independent GitHub authority.
const POS=/^[1-9][0-9]*$/;
const MAX=(1n<<256n)-1n;
const KEYS={
 validatorRegistry:["minimumWei","maxExecutorReimbursementWei","perValidatorWei"],
 factory:["sourceFeeWei"],
 executionGateway:["relayerOwner","interchainFeeRecipient"]
};
export function requiredDeploymentFields(component){
 return KEYS[component]||[];
}
export function deploymentParameters(component,raw={}){
 if(raw===null||typeof raw!=="object"||Array.isArray(raw))
  throw Error("Invalid deployment parameter object");
 const keys=requiredDeploymentFields(component);
 if(Object.keys(raw).some(key=>!keys.includes(key)))
  throw Error("Parameters supplied for wrong component");
 const out={};
 for(const k of keys){
  const value=raw[k];
  if(k==="relayerOwner"||k==="interchainFeeRecipient"){
   if(typeof value!=="string"||!/^0x[0-9a-f]{40}$/i.test(value)||
      /^0x0{40}$/i.test(value))throw Error("Valid nonzero fee signer or GmbH Interchain Fee address required");
   out[k]=value.toLowerCase(); // Address is public, never a private key.
   continue;
  }
  if(typeof value!=="string"||!POS.test(value)||BigInt(value)>MAX)
   throw Error("Positive, exact Wei value required for "+k);
  out[k]=BigInt(value).toString();
 }
 if(component==="validatorRegistry"&&(
   BigInt(out.minimumWei)<BigInt(out.maxExecutorReimbursementWei)||
   BigInt(out.perValidatorWei)<BigInt(out.minimumWei)))
  throw Error("Reserve per validator >= minimum reserve >= reimbursement ceiling required");
 return out;
}
