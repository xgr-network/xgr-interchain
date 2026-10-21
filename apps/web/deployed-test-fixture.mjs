// Test-only receipts matching the v3.1.5 canonical catalog structure.
const addr=d=>"0x"+d.repeat(40);
const hash=d=>"0x"+d.repeat(64);
const receipt=(chain,address)=>"deployments/receipts/"+chain+"/"+("a".repeat(64))+"-"+address.slice(2)+".json";
const record=(chain,d)=>{
 const address=addr(d);
 return {address,runtimeCodeKeccak256:hash("e"),receiptPath:receipt(chain,address)};
};
export function deployedFixture(symbol="ABC",canonical="base"){
 const assetId="0x"+Buffer.from(symbol).toString("hex").padEnd(64,"0").slice(0,64);
 const home=canonical,other=canonical==="xgrchain"?"base":"xgrchain";
 const homeRole=canonical==="xgrchain"?"native":"collateral";
 const reps=[{chain:home,representation:homeRole,symbol,
    assetAddress:homeRole==="collateral"?addr("9"):null},
   {chain:other,representation:"synthetic",symbol:"w"+symbol,assetAddress:null}];
 const representationRecords=[
   {chain:home,component:homeRole==="native"?"nativeRouter":"collateralRouter",...record(home,"1")},
   {chain:other,component:"syntheticRouter",...record(other,"2")}
 ];
 const directed=[
  {name:home+"_to_"+other,sourceChain:home,destinationChain:other},
  {name:other+"_to_"+home,sourceChain:other,destinationChain:home}
 ];
 const routeDeployments=directed.map((rt,i)=>{
  const gateway=record(rt.sourceChain,i===0?"3":"5");
  const feeVault=record(rt.sourceChain,i===0?"4":"6");
  return {schemaVersion:1,kind:"asset-route-deployment",asset:symbol,assetId,
    routeId:hash(i===0?"7":"8"),routeName:rt.name,
    sourceChain:rt.sourceChain,destinationChain:rt.destinationChain,
    components:{gateway,feeVault},receiptPaths:[gateway.receiptPath,feeVault.receiptPath]};
 });
 const receiptPaths=[...representationRecords.map(x=>x.receiptPath),
   ...routeDeployments.flatMap(x=>x.receiptPaths)];
 return {
  metadata:{schemaVersion:1,kind:"asset-config",asset:symbol,assetId,symbol,name:symbol,
    canonical:{chain:canonical,representation:homeRole},
    representations:reps},
  profile:{schemaVersion:1,kind:"xeta-token-profile",asset:symbol,name:symbol,slug:symbol.toLowerCase()},
  routes:{schemaVersion:1,kind:"asset-routes",asset:symbol,routingHub:"xgrchain",routes:directed},
  deployment:{schemaVersion:3,kind:"asset-deployment",asset:symbol,assetId,present:true,
    representations:representationRecords,routeDeployments,receiptPaths}
 };
}
export const visibilityFixture=(assets,minimumLockedUsd=null)=>({
 schemaVersion:1,kind:"xita-visibility-v1",minimumLockedUsd,
 assets:Object.fromEntries(Object.entries(assets).map(([key,status])=>[
  key,{status,assetId:deployedFixture(key).metadata.assetId}
 ]))
});
