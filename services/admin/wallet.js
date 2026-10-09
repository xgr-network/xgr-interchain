export async function connectDeploymentWallet(){
 if(!window.ethereum)throw Error("Install an EVM wallet to deploy");
 const accounts=await window.ethereum.request({method:"eth_requestAccounts"});
 if(!accounts?.[0])throw Error("No wallet account connected");
 return accounts[0];
}
export async function deployVerifier(payload){
 const account=await connectDeploymentWallet();
 const chain=await window.ethereum.request({method:"eth_chainId"});
 if(BigInt(chain)!==8453n){
  await window.ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:"0x2105"}]});
 }
 if(!payload||payload.id!=="verifier_base"||payload.chainId!==8453||
   !/^0x[0-9a-f]+$/i.test(payload.bytecode))throw Error("Unverified deployment payload");
 if(!window.confirm("Deploy the new BLS verifier on Base mainnet? This spends real ETH. Confirm the contract build and EIP-2537 checks first."))return null;
 return window.ethereum.request({method:"eth_sendTransaction",params:[{from:account,data:payload.bytecode,value:"0x0"}]});
}
