// Shared browser/server token profile URL generation. The backend remains authoritative.
// Applicant-provided slug values are deliberately ignored: no URL knowledge is required.
const MAX_LENGTH=61;
const SLUG=/^[a-z0-9][a-z0-9-]{1,60}$/;
const segment=value=>String(value??"").normalize("NFKD")
 .replace(/[\u0300-\u036f]/g,"").toLowerCase()
 .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");

export function suggestedTokenSlug({name,symbol,canonicalChain,canonicalAddress}={},assets={}){
 const sym=segment(symbol);
 const namePart=segment(name);
 const base=namePart.length>=2?namePart:sym;
 if(base.length<2)return null;
 const used=new Set(Object.values(assets||{}).map(a=>a?.profile?.slug)
  .filter(s=>typeof s==="string").map(s=>s.toLowerCase()));
 const choose=suffix=>{
  const tail=suffix?"-"+suffix:"";
  const stem=base.slice(0,MAX_LENGTH-tail.length).replace(/-+$/g,"");
  const slug=stem+tail;
  return SLUG.test(slug)&&!used.has(slug)?slug:null;
 };
 const chain=segment(canonicalChain);
 for(const suffix of ["",sym,chain&&sym?sym+"-"+chain:""]){
  const found=choose(suffix);
  if(found)return found;
 }
 const addr=/^0x[0-9a-f]{40}$/i.test(canonicalAddress||"")
  ?canonicalAddress.slice(2).toLowerCase():"";
 if(addr){
  for(let size=8;size<=40;size+=4){
   const found=choose([sym,chain,addr.slice(0,size)].filter(Boolean).join("-"));
   if(found)return found;
  }
 }
 // Last-resort stable sequence for rare existing imported URL collisions.
 for(let i=2;i<=9999;i++){
  const found=choose([sym,chain,addr.slice(0,8),i].filter(Boolean).join("-"));
  if(found)return found;
 }
 throw Error("No available XITA token profile address");
}
