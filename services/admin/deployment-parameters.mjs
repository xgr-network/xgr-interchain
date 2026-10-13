// Transaction-only constructor inputs, never an independent GitHub authority.
const POS=/^[1-9][0-9]*$/;
const MAX=(1n<<256n)-1n;
const KEYS={
 validatorRegistry:["minimumWei","maxExecutorReimbursementWei"],
 factory:["sourceFeeWei"]
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
  if(typeof value!=="string"||!POS.test(value)||BigInt(value)>MAX)
   throw Error("Positive, exact Wei value required for "+k);
  out[k]=BigInt(value).toString();
 }
 if(component==="validatorRegistry"&&(
   BigInt(out.minimumWei)<BigInt(out.maxExecutorReimbursementWei)))
  throw Error("Reserve per validator >= minimum reserve >= reimbursement ceiling required");
 return out;
}
