// Token settings shared by the XITA browser, private onboarding service,
// deployment signer, receipt verifier and Join PR manifest generator.
export const CREATOR_VARIANTS=Object.freeze({fixed:0,burnable:1,mintable:2});
export const CREATOR_DECIMALS=Object.freeze([6,8,18]);
const INTEGER=/^(0|[1-9][0-9]*)$/;
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const ZERO=/^0x0{40}$/i;
const MAX=10n**36n;
export function creatorSettings(data){
 if(!data||typeof data!=="object")throw Error("Missing creator configuration");
 const tokenType=data.tokenType??"fixed";
 const decimals=Number(data.decimals??18);
 const initialSupply=String(data.initialSupply??"");
 const ownerAddress=String(data.ownerAddress??"").trim().toLowerCase();
 if(!Object.hasOwn(CREATOR_VARIANTS,tokenType))throw Error("Invalid token type");
 if(!CREATOR_DECIMALS.includes(decimals)||!Number.isInteger(Number(data.decimals??18))||
    !["6","8","18"].includes(String(data.decimals??18)))
  throw Error("Token decimals must be 6, 8 or 18");
 if(!INTEGER.test(initialSupply)||initialSupply==="0")throw Error("Initial supply must be a positive whole number");
 if(!ADDRESS.test(ownerAddress)||ZERO.test(ownerAddress))throw Error("Valid owner address required");
 const amount=BigInt(initialSupply)*(10n**BigInt(decimals));
 const isMintable=tokenType==="mintable";
 const maxSupply=String(isMintable?(data.maxSupply??""):initialSupply);
 if(!INTEGER.test(maxSupply)||maxSupply==="0")throw Error("Maximum lifetime supply must be a positive whole number");
 const cap=BigInt(maxSupply)*(10n**BigInt(decimals));
 if(amount>MAX||cap>MAX||cap<amount)
  throw Error("Invalid initial supply or maximum lifetime minting cap");
 const minterAddress=isMintable?String(data.minterAddress||ownerAddress).trim().toLowerCase():
  "0x0000000000000000000000000000000000000000";
 if(!ADDRESS.test(minterAddress)||(isMintable&&ZERO.test(minterAddress)))
  throw Error("Valid minter wallet required");
 if(data.permit!==undefined&&typeof data.permit!=="boolean")
  throw Error("Invalid permit option");
 return Object.freeze({tokenType,tokenTypeId:CREATOR_VARIANTS[tokenType],
  decimals,initialSupply,maxSupply,ownerAddress,minterAddress,
  permit:data.permit===true,initialSupplyBaseUnits:amount.toString(),
  maxSupplyBaseUnits:cap.toString(),
  burnable:tokenType!=="fixed",mintable:isMintable});
}
