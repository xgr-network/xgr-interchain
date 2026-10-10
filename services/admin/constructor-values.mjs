// Ephemeral, operator-approved constructor arguments. They are pinned only to
// the durable wallet intent and independently checked against on-chain getters.
const POS=/^[1-9][0-9]*$/;
export function validateDeploymentValues(values){
 if(!values||typeof values!=="object")throw Error("Missing constructor parameters");
 const out={};
 for(const key of ["minimumWei","maxExecutorReimbursementWei","perValidatorWei","sourceFeeWei"]){
  if(typeof values[key]!=="string"||!POS.test(values[key])||
    BigInt(values[key])>=(1n<<256n))throw Error("Invalid constructor value: "+key);
  out[key]=values[key];
 }
 if(!Number.isSafeInteger(values.defaultDestinationGasLimit)||
    values.defaultDestinationGasLimit<21000||values.defaultDestinationGasLimit>10000000)
  throw Error("Invalid destination gas limit");
 out.defaultDestinationGasLimit=values.defaultDestinationGasLimit;
 if(BigInt(out.maxExecutorReimbursementWei)>BigInt(out.minimumWei)||
   BigInt(out.minimumWei)>BigInt(out.perValidatorWei))
  throw Error("Reserve relationships invalid");
 return out;
}
export function effectiveConstructorPlan(plan,chain,values){
 const v=validateDeploymentValues(values);
 if(!plan||plan.chain!==chain.name||plan.chainId!==chain.chainId)
  throw Error("Constructor plan chain mismatch");
 return {plan:{...plan,ready:plan.validatorCount===plan.expectedValidatorCount,
   reserveWei:(BigInt(v.perValidatorWei)*BigInt(plan.expectedValidatorCount)).toString(),
   reserve:{minimumWei:v.minimumWei,maxExecutorReimbursementWei:v.maxExecutorReimbursementWei,perValidatorWei:v.perValidatorWei},
   proposedFeeWei:v.sourceFeeWei},
   chain:{...chain,defaultDestinationGasLimit:v.defaultDestinationGasLimit},values:v};
}
