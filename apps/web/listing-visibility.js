// GitHub main's versioned listing.json is the ONLY directory-publication authority.
// PR state (open / closed / merged) is an independent GitHub review lifecycle.
// Runtime indexers and APIs cannot promote an accepted asset to public.
export const listingStatus=entry=>entry?.listing?.kind==="xita-asset-listing"?
 entry.listing.status:"unregistered";
export const isPublicAsset=(id,entry)=>entry?.listing?.kind==="xita-asset-listing"&&
 entry.listing.asset===id&&entry.listing.status==="public";
export function publicDirectoryCatalog(catalog){
 return {...catalog,assets:Object.fromEntries(
  Object.entries(catalog?.assets||{}).filter(([id,entry])=>isPublicAsset(id,entry))
 )};
}
