// Pure GPU scene geometry for XITA. Visual-only: no claim that an ILN route is active.
const TAU=Math.PI*2;
const mul=(v,k)=>[v[0]*k,v[1]*k,v[2]*k];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const normalize=v=>mul(v,1/(Math.hypot(...v)||1));
function rng(seed){
 let s=seed>>>0;return ()=>{
  s+=0x6d2b79f5;
  let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);
  return ((t^(t>>>14))>>>0)/4294967296;
 };
}
export function rotateAxis(point,axis,angle){
 const n=normalize(axis),c=Math.cos(angle),s=Math.sin(angle);
 return add(add(mul(point,c),mul(cross(n,point),s)),mul(n,dot(n,point)*(1-c)));
}
// Deterministic inclined stellar debris: diffuse elliptical arms around each
// chain core, NOT synthetic token representations. Those come only from manifests.
export function makeStellarDisc(system,count){
 const key=system.system.key;
 const seed=[...key].reduce((h,c)=>(Math.imul(h,33)+c.charCodeAt(0))>>>0,1643);
 const rand=rng(seed),hub=system.portal;
 const total=count??(hub?440:260),pts=new Float32Array(total*3);
 const tilt=hub?[.31,.12,.09]:[
  (system.orbital?.inclination||.25)*.82,
  system.orbital?.node||.1,
  (system.orbital?.node||.2)*.24];
 for(let i=0;i<total;i++){
  const t=(i+rand()*.66)/total;
  const r=system.radius*(1.35+1.42*Math.sqrt(t))+(rand()-.5)*.16;
  const arm=i%3,a=arm*TAU/3+t*TAU*2.65+(rand()-.5)*.20;
  const thick=(rand()-.5)*system.radius*(hub?.23:.17);
  let p=[Math.cos(a)*r,thick,Math.sin(a)*r*.79];
  // Rotate into distinct orbital planes; no common flat disk.
  p=rotateAxis(p,[1,0,0],tilt[0]);
  p=rotateAxis(p,[0,1,0],tilt[1]);
  p=rotateAxis(p,[0,0,1],tilt[2]);
  pts.set(p,i*3);
 }
 return pts;
}
export function placeStellarDisc(local,center,time,system,into){
 const axis=system.portal?[0,1,0]:system.orbital?.axis||[0,1,0];
 const spin=time*(system.portal?.012:.021),out=into||new Float32Array(local.length);
 for(let i=0;i<local.length;i+=3){
  const p=rotateAxis([local[i],local[i+1],local[i+2]],axis,spin);
  out[i]=p[0]+center[0];out[i+1]=p[1]+center[1];out[i+2]=p[2]+center[2];
 }
 return out;
}
// Independent, tilted, real 3D orbital tracks. Thin configured-topology guide
// marks only: never interpreted as evidence of live interchain transfers.
export function makeSystemOrbitTrack(item,segments=192){
 if(item.portal||!item.orbital)return new Float32Array();
 const out=[];
 for(let i=0;i<segments;i++){
  // Partial orbital arcs feel less mechanical than full concentric rings.
  if(i%39>=32)continue;
  const a=i/segments*TAU,b=(i+1)/segments*TAU;
  out.push(...rotateAxis(item.orbital.origin,item.orbital.axis,a),
   ...rotateAxis(item.orbital.origin,item.orbital.axis,b));
 }
 return new Float32Array(out);
}
// Additional verifiable visual structure for browser/unit tests.
export function sceneComposition(topology){
 return {hub:topology.systems.filter(s=>s.portal).length,
  inclinedOrbits:new Set(topology.systems.filter(s=>!s.portal).map(s=>s.orbital?.node)).size,
  nativeOrWrappedPlanets:topology.planets.length};
}
