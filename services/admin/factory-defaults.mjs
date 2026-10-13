// Operator-editable suggested constructor values, not network policy.
const fee=x=>typeof x==="string"&&/^[1-9][0-9]*$/.test(x)&&BigInt(x)<(1n<<256n);
const gas=x=>Number.isSafeInteger(x)&&x>=21000&&x<=10000000;
export function factoryDeploymentDefaults({chainName,chain,readiness,proposal}={}){
 const configured=readiness?.values?.sourceFeeWei,quoted=proposal?.values?.sourceFeeWei;
 // Explicit XGRChain launch decision: 0.1 XGR. Never override it with RPC
 // gas-price suggestions. Spoke fees remain in each spoke's native currency.
 const xgrLaunchFee="100000000000000000";
 return {sourceFeeWei:chainName==="xgrchain"?xgrLaunchFee:
   [configured,quoted].find(fee)??"",
 defaultDestinationGasLimit:[chain?.defaultDestinationGasLimit,
 proposal?.values?.defaultDestinationGasLimit,500000].find(gas)};
}
