import {readFileSync} from "node:fs";
import {resolve} from "node:path";
const COMPONENTS={verifier_base:"XGRInterchainBLSVerifier"};
const HEX=/^0x(?:[0-9a-f]{2})+$/i;
export function artifactFor(id,repo){
 const name=COMPONENTS[id];
 if(!name)throw Error("Only the constructor-free verifier is currently executable");
 const raw=JSON.parse(readFileSync(resolve(repo,"out",name+".sol",name+".json"),"utf8"));
 const bytecode=raw.bytecode?.object;
 if(typeof bytecode!=="string"||!HEX.test(bytecode)||bytecode.length<500)throw Error("Compiled bytecode missing; build with forge build");
 if(raw.abi?.some(x=>x.type==="constructor"&&x.inputs?.length))throw Error("Constructor needs explicit reviewed parameters");
 return {id,chainId:8453,contract:name,bytecode,gasValue:"0x0",signing:"injected-wallet",warning:"Verify independent EIP-2537 BLS test vectors before production use"};
}
