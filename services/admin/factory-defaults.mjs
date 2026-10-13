// Operator-editable suggested constructor values, not network policy.
const fee=x=>typeof x==="string"&&/^[1-9][0-9]*$/.test(x)&&BigInt(x)<(1n<<256n);
const gas=x=>Number.isSafeInteger(x)&&x>=21000&&x<=10000000;
export function factoryDeploymentDefaults({chainName,chain,readiness,proposal}={}){
 const configured=readiness?.values?.sourceFeeWei,quoted=proposal?.values?.sourceFeeWei;
 const fallback=chainName==="xgrchain"?"100000000000":null;
 return {sourceFeeWei:[configured,quoted,fallback].find(fee)??"",
 defaultDestinationGasLimit:[chain?.defaultDestinationGasLimit,
 proposal?.values?.defaultDestinationGasLimit,500000].find(gas)};
}
