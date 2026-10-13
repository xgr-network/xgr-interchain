// Only the source-native validator fee is a user-confirmed Factory input.
// Destination Mailbox.process gas is independently estimated by MetaMask.
const fee=x=>typeof x==="string"&&/^[1-9][0-9]*$/.test(x)&&BigInt(x)<(1n<<256n);
export function factoryDeploymentDefaults({chainName,readiness,proposal}={}){
 const configured=readiness?.values?.sourceFeeWei,quoted=proposal?.values?.sourceFeeWei;
 return {sourceFeeWei:chainName==="xgrchain"?"100000000000000000":
  [configured,quoted].find(fee)??""};
}
