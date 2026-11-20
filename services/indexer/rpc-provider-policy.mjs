// Strict URL policy for manually requested unsigned recovery only.
export function rpcCandidates(chain,{baseUrls=process.env.XITA_BASE_ARCHIVE_RPC_URLS||""}={}){
 const raw=chain?.chainId===8453?
  [...String(baseUrls).split(",").map(s=>s.trim()).filter(Boolean),
   ...(chain?.rpcUrls||[])]:[...(chain?.rpcUrls||[])];
 const result=[];
 for(const url of raw){
  let parsed;
  try{parsed=new URL(url);}catch{throw Error("Invalid chain RPC URL");}
  if(parsed.protocol!=="https:"||parsed.username||parsed.password||
    parsed.hash||!parsed.hostname||url.length>500)
   throw Error("Invalid chain RPC URL");
  if(!result.includes(url))result.push(url);
 }
 if(!result.length||result.length>8)throw Error("Missing or excessive chain RPC URLs");
 return result;
}
