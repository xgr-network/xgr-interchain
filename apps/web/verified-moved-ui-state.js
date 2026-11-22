// The dashboard's already-verified historical plot must not collapse to one
// point when the next periodic metrics response lacks independent index
// coverage. Pure presentation fallback: no storage, fetch or RPC calls.
// Retain only timestamps/values already verified by a previous response.
const finite=v=>typeof v==="number"&&Number.isFinite(v)&&v>=0;
const time=v=>typeof v==="string"?Date.parse(v):NaN;
function validCurve(series){
 if(!series||!["verified","partial"].includes(series.status)||
    series.pricing!=="current-reference-price"||
    !Number.isFinite(time(series.asOf))||
    !Array.isArray(series.points)||series.points.length<2||
    series.points.length>745)return false;
 return series.points.every((p,i)=>{
  if(!Number.isFinite(time(p?.asOf))||!finite(p.totalUsd))return false;
  if(!i)return true;
  const previous=series.points[i-1];
  return time(p.asOf)>time(previous.asOf)&&p.totalUsd>=previous.totalUsd;
 });
}
export function retainVerifiedMovedHistory(previous,current){
 if(!current||current.status!=="verified"||!finite(current.totalUsd)||
   !Number.isFinite(time(current.asOf)))return current;
 // Never overwrite a freshly verified current curve.
 if(validCurve(current.reconstructed)&&
   time(current.reconstructed.asOf)<=time(current.asOf)&&
   current.reconstructed.points.at(-1).totalUsd<=current.totalUsd+.000001)
  return current;
 const earlier=previous?.reconstructed;
 if(!validCurve(earlier)||!finite(previous?.totalUsd)||
    !Number.isFinite(time(previous?.asOf)))return current;
 // No cross-generation resurrection or future-point leakage.
 const age=time(current.asOf)-time(earlier.asOf);
 if(age<0||age>6*3600000||time(previous.asOf)>time(current.asOf)||
    current.totalUsd+.000001<previous.totalUsd||
    earlier.points.at(-1).totalUsd>current.totalUsd+.000001)
  return current;
 return {...current,reconstructed:earlier};
}
