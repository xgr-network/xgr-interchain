// Fails deployment CI if an on-chain created contract exceeds standard EVM limits.
import {readFileSync} from "node:fs";
import {join} from "node:path";
const root=process.argv[2]||".";
const names=["XGRInterchainBLSVerifier","XGRInterchainValidatorRegistryV3","XITADirectBLSISM",
 "XETATokenFactoryV315","XETANativeRouterDeployer","XETASyntheticRouterDeployer",
 "XETACollateralRouterDeployer","XGRILNRegistryV315","XETAGuardedNativeWarpRouter",
 "XETAGuardedSyntheticWarpRouter","XETAGuardedCollateralWarpRouterV315",
 "ILNGateway","XGRILNFeeVault"];
const size=hex=>{
 if(typeof hex!=="string"||!/^[0-9a-f]+$/i.test(hex.replace(/^0x/,"")))throw Error("Invalid artifact bytecode");
 return hex.replace(/^0x/,"").length/2;
};
let failure=false;
for(const name of names){
 const artifact=JSON.parse(readFileSync(join(root,"out",name+".sol",name+".json"),"utf8"));
 const creation=size(artifact.bytecode?.object), runtime=size(artifact.deployedBytecode?.object);
 const good=runtime<=24576 && creation<=49152;
 console.log(name+": init "+creation+" B; runtime "+runtime+" B; "+(good?"PASS":"FAIL"));
 if(!good)failure=true;
}
if(failure)process.exit(1);
