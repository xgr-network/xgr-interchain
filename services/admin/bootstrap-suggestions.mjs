// Read-only estimates for an operator-owned initial chain deployment.
// These are NOT approved economic settings and never mutate main.
// No chain-specific presets: gas-price quote and protocol gas ceilings drive
// identical formulae for XGRChain, Base, Polygon and other EVM networks.
const POS=/^[1-9][0-9]*$/;
const UINT256=1n<<256n;
const MAX_GAS_PRICE_WEI=1_000_000_000_000_000n; // discard implausible RPC quotes
const POLICY=Object.freeze({
 reimbursementReferenceGas:500000n, // member-exit BLS verification + executor overhead allowance
 minimumReserveReferenceGas:750000n,
 initialReserveReferenceGas:1000000n,
 trialSourceFeeReferenceGas:100n, // nominal low launch fee, NOT relayer gas coverage
 destinationGasLimit:500000
});
const approved=x=>typeof x==="string"&&POS.test(x)&&BigInt(x)<UINT256;
export function suggestBootstrapValues({chain,bootstrap,gasPriceWei}){
 if(!chain||!bootstrap||bootstrap.chain!==chain.name||
    chain.chainId!==bootstrap.chainId||
    !Number.isSafeInteger(chain.chainId)||chain.chainId<1)
  throw Error("Bootstrap proposal requires same approved chain identity");
 if(typeof gasPriceWei!=="string"||!POS.test(gasPriceWei))
  throw Error("Cannot estimate without a positive live RPC gas price");
 const price=BigInt(gasPriceWei);
 if(price>MAX_GAS_PRICE_WEI)throw Error("Unreasonable gas price; request manual review");
 const calculated={
  minimumWei:(price*POLICY.minimumReserveReferenceGas).toString(),
  maxExecutorReimbursementWei:(price*POLICY.reimbursementReferenceGas).toString(),
  perValidatorWei:(price*POLICY.initialReserveReferenceGas).toString(),
  sourceFeeWei:(price*POLICY.trialSourceFeeReferenceGas).toString(),
  defaultDestinationGasLimit:POLICY.destinationGasLimit
 };
 const known={
  minimumWei:bootstrap.reserve?.minimumWei,
  maxExecutorReimbursementWei:bootstrap.reserve?.maxExecutorReimbursementWei,
  perValidatorWei:bootstrap.reserve?.perValidatorWei,
  sourceFeeWei:bootstrap.proposedFeeWei,
  defaultDestinationGasLimit:chain.defaultDestinationGasLimit
 };
 const values={},sources={};
 for(const [key,suggested] of Object.entries(calculated)){
  const v=known[key];
  const valid=key==="defaultDestinationGasLimit"
   ?Number.isSafeInteger(v)&&v>=21000&&v<=10000000:approved(v);
  values[key]=valid?v:suggested;
  sources[key]=valid?"main":"unapproved-estimate";
 }
 if(BigInt(values.maxExecutorReimbursementWei)>BigInt(values.minimumWei)||
    BigInt(values.minimumWei)>BigInt(values.perValidatorWei))
  throw Error("Configured reserve economics inconsistent; do not silently overwrite");
 return {
  chain:chain.name,chainId:chain.chainId,mode:"read-only-unapproved-proposal",
  gasPriceWei,values,sources,
  totalInitialReserveWei:(BigInt(values.perValidatorWei)*3n).toString(),
  policy:{
   reimbursementReferenceGas:Number(POLICY.reimbursementReferenceGas),
   minimumReserveReferenceGas:Number(POLICY.minimumReserveReferenceGas),
   initialReserveReferenceGas:Number(POLICY.initialReserveReferenceGas),
   trialSourceFeeReferenceGas:Number(POLICY.trialSourceFeeReferenceGas),
   destinationGasLimit:POLICY.destinationGasLimit
  },
  note:"Unverbindliche Startwerte aus dem aktuellen Gaspreis, keine gemessene Austrittsgasmenge und keine wirtschaftliche Freigabe. Manuell anpassen und vor dem GitHub-Commit bestaetigen."
 };
}
