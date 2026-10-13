// Estimate destination execution from the actual Mailbox.process() transaction.
// Hyperlane's immutable per-route dispatch metadata hint is NOT an execution cap.
const MIN_TX_GAS=21000n;
const MAX_UINT256=(1n<<256n)-1n;
export function planDestinationProcessGas(estimatedGas,blockGasLimit,{
 safetyBps=13000n,extraGas=30000n,blockReserveGas=50000n
}={}){
 const estimate=BigInt(estimatedGas),block=BigInt(blockGasLimit);
 if(estimate<MIN_TX_GAS||estimate>MAX_UINT256||
    block<=MIN_TX_GAS||block>MAX_UINT256||
    safetyBps<10000n||safetyBps>20000n||
    extraGas<0n||blockReserveGas<0n)
  throw Error("Invalid destination gas estimate or safety policy");
 const required=(estimate*safetyBps+9999n)/10000n+extraGas;
 if(block<=blockReserveGas || required>block-blockReserveGas)
  throw Error("Estimated Mailbox.process gas plus safety reserve exceeds destination block gas limit; retry later");
 return {estimatedGas:estimate,gasLimit:required,blockGasLimit:block,
  marginGas:required-estimate};
}
