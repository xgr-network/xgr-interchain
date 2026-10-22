import {representationFor} from "./token-representation.js";
import {systemTokenPlanets} from "./universe-token-layout.js";
// XITA Universe 3D v2 — mouse-first, hierarchical exploration using native WebGL.
// All chain systems, tokens and configured hub/spoke paths come from catalog.json.
// Rendering does not make a claim about route activation or chain health.
const HUB="xgrchain";
const TWO_PI=Math.PI*2;
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mul=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>mul(a,1/(Math.hypot(...a)||1));
// The light direction is inertial in world coordinates; moving the camera,
// rotating a body or orbiting a system never moves this light source.
export const WORLD_LIGHT_DIRECTION=Object.freeze(norm([-.72,.74,1.12]));
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const mix=(a,b,t)=>a+(b-a)*t;
const near=(a,b,eps=.001)=>Math.abs(a-b)<=eps;
const IDENTITY=new Float32Array([1,0,0,0,1,0,0,0,1]);
const fixedColors={
 xgrchain:[1.0,.78,.43],base:[.32,.58,1.0],
 polygon:[.64,.35,1.0],arbitrum:[.51,.75,.96],
 xdc:[.47,.75,.74],ethereum:[.70,.76,.90]
};
function chainColor(key,index){
 return fixedColors[key]||([[.46,.69,.87],[.60,.72,.86],[.53,.74,.76],[.72,.70,.81]][index%4]);
}
function random(seed){
 let value=seed>>>0;
 return ()=>{
  value+=0x6d2b79f5;
  let t=value;
  t=Math.imul(t^(t>>>15),t|1);
  t^=t+Math.imul(t^(t>>>7),t|61);
  return ((t^(t>>>14))>>>0)/4294967296;
 };
}
function perspective(fov,aspect,nearPlane,farPlane){
 const f=1/Math.tan(fov/2),d=1/(nearPlane-farPlane);
 return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(farPlane+nearPlane)*d,-1,0,0,2*farPlane*nearPlane*d,0]);
}
function lookAt(eye,target){
 const z=norm(sub(eye,target)),x=norm(cross([0,1,0],z)),y=cross(z,x);
 return new Float32Array([
  x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,
  -dot(x,eye),-dot(y,eye),-dot(z,eye),1
 ]);
}
function matrixMultiply(a,b){
 const out=new Float32Array(16);
 for(let c=0;c<4;c++)for(let r=0;r<4;r++)
  for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];
 return out;
}
function rotate(v,x,y,z){
 let a=v[0],b=v[1],c=v[2];
 let t=b*Math.cos(x)-c*Math.sin(x);c=b*Math.sin(x)+c*Math.cos(x);b=t;
 t=a*Math.cos(y)+c*Math.sin(y);c=-a*Math.sin(y)+c*Math.cos(y);a=t;
 t=a*Math.cos(z)-b*Math.sin(z);b=a*Math.sin(z)+b*Math.cos(z);a=t;
 return [a,b,c];
}
function rotation(x=0,y=0,z=0){
 return new Float32Array([...rotate([1,0,0],x,y,z),...rotate([0,1,0],x,y,z),...rotate([0,0,1],x,y,z)]);
}
function cameraEye(cam){
 const ct=Math.cos(cam.pitch);
 return add(cam.target,[Math.sin(cam.yaw)*ct*cam.distance,Math.sin(cam.pitch)*cam.distance,Math.cos(cam.yaw)*ct*cam.distance]);
}
function projectionOf(position,viewProjection,width,height){
 const p=position;
 const x=viewProjection[0]*p[0]+viewProjection[4]*p[1]+viewProjection[8]*p[2]+viewProjection[12];
 const y=viewProjection[1]*p[0]+viewProjection[5]*p[1]+viewProjection[9]*p[2]+viewProjection[13];
 const z=viewProjection[2]*p[0]+viewProjection[6]*p[1]+viewProjection[10]*p[2]+viewProjection[14];
 const w=viewProjection[3]*p[0]+viewProjection[7]*p[1]+viewProjection[11]*p[2]+viewProjection[15];
 if(w<=.2)return null;
 return {x:(x/w+1)*width/2,y:(1-y/w)*height/2,z:z/w,depth:w,
  visible:Math.abs(x/w)<1.3&&Math.abs(y/w)<1.3&&z/w>-1.2&&z/w<1.2};
}
function makeSphere(stacks=24,slices=36){
 const vertices=[],normals=[],indices=[];
 for(let y=0;y<=stacks;y++){
  const phi=y*Math.PI/stacks;
  for(let x=0;x<=slices;x++){
   const a=TWO_PI*x/slices,xx=Math.sin(phi)*Math.cos(a),yy=Math.cos(phi),zz=Math.sin(phi)*Math.sin(a);
   vertices.push(xx,yy,zz);
   normals.push(xx,yy,zz);
  }
 }
 for(let y=0;y<stacks;y++)for(let x=0;x<slices;x++){
  const i=y*(slices+1)+x;
  indices.push(i,i+slices+1,i+1,i+1,i+slices+1,i+slices+2);
 }
 return {vertices,normals,indices};
}
function makeTorus(radius=1,tube=.006,around=96,across=6){
 const vertices=[],normals=[],indices=[];
 for(let i=0;i<=around;i++){
  const a=i*TWO_PI/around,ca=Math.cos(a),sa=Math.sin(a);
  for(let j=0;j<=across;j++){
   const b=j*TWO_PI/across,cb=Math.cos(b),sb=Math.sin(b);
   vertices.push((radius+tube*cb)*ca,(radius+tube*cb)*sa,tube*sb);
   normals.push(cb*ca,cb*sa,sb);
  }
 }
 for(let i=0;i<around;i++)for(let j=0;j<across;j++){
  const n=i*(across+1)+j;
  indices.push(n,n+across+1,n+1,n+1,n+across+1,n+across+2);
 }
 return {vertices,normals,indices};
}
function shader(gl,type,source){
 const handle=gl.createShader(type);
 gl.shaderSource(handle,source);gl.compileShader(handle);
 if(!gl.getShaderParameter(handle,gl.COMPILE_STATUS)){
  const message=gl.getShaderInfoLog(handle)||"WebGL shader compilation failed";
  gl.deleteShader(handle);throw Error(message);
 }
 return handle;
}
function program(gl,vs,fs){
 const p=gl.createProgram(),vert=shader(gl,gl.VERTEX_SHADER,vs),frag=shader(gl,gl.FRAGMENT_SHADER,fs);
 gl.attachShader(p,vert);gl.attachShader(p,frag);gl.linkProgram(p);
 gl.deleteShader(vert);gl.deleteShader(frag);
 if(!gl.getProgramParameter(p,gl.LINK_STATUS)){
  const message=gl.getProgramInfoLog(p)||"WebGL shader linking failed";
  gl.deleteProgram(p);throw Error(message);
 }
 return p;
}
const sphereVS=[
 'attribute vec3 aPos; attribute vec3 aNormal;',
 'uniform mat4 uViewProjection; uniform mat3 uRotation;',
 'uniform vec3 uCenter; uniform float uScale;',
 'varying vec3 vNormal; varying vec3 vWorld; varying vec3 vLocal;',
 'void main(){',
 'vec3 world=uCenter+uRotation*(aPos*uScale);',
 'vWorld=world;vNormal=normalize(uRotation*aNormal);vLocal=aPos;',
 'gl_Position=uViewProjection*vec4(world,1.0);',
 '}'
].join('\n');
// Restrained procedural surface materials: volumetric-looking suns, layered token planets,
// terminator shading, faint atmospheric rim and fine topographic/cloud detail.
// No downloaded textures, per-token requests or external shaders.
const sphereFS=[
 'precision mediump float;',
 'uniform vec3 uColor;uniform vec3 uEye;uniform vec3 uLightDir;uniform float uTime;uniform float uKind;',
 'varying vec3 vNormal;varying vec3 vWorld;varying vec3 vLocal;',
 'float hash(vec3 p){p=fract(p*0.3183099+vec3(.19,.31,.43));p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}',
 'float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);',
 'return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),',
 'mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}',
 'float fbm(vec3 p){float v=0.0,a=.5;for(int i=0;i<4;i++){v+=noise(p)*a;p*=2.04;a*=.5;}return v;}',
 'void main(){',
 'vec3 n=normalize(vNormal),viewDir=normalize(uEye-vWorld);',
 'vec3 litDir=normalize(uLightDir);',
 'float ndl=max(0.0,dot(n,litDir));',
 'float facing=max(0.0,dot(n,viewDir));',
 'float rim=pow(1.0-facing,3.4);',
 'float surf=fbm(vLocal*4.8+vec3(0.,0.,.8));',
 'float details=fbm(vLocal*14.0+surf*1.9);',
 'vec3 color;',
 'if(uKind>1.5){',
 ' color=uColor*(1.45+.20*sin(vLocal.x*28.+uTime*.18))+vec3(.20,.24,.31)*rim;',
 '}else if(uKind>.5){',
 ' float plasma=fbm(vLocal*9.0+surf*2.2+vec3(0.,uTime*.025,0.));',
 ' float veins=pow(max(0.0,sin(plasma*16.0+vLocal.y*8.0)),3.0);',
 ' vec3 warm=mix(uColor*.66,uColor*1.26+.12,clamp(plasma*.94+veins*.27,0.,1.));',
 ' float sunDay=smoothstep(-.20,.20,dot(n,litDir));',
 ' float sunLight=.23+.77*sunDay*(.22+.78*ndl);',
 ' color=warm*(1.02+.21*details)*sunLight+vec3(1.0,.83,.51)*rim*(.08+.22*sunDay);',
 '}else{',
 ' float land=smoothstep(.36,.67,surf+.16*(details-.5));',
 ' float bands=.5+.5*sin(vLocal.y*21.0+surf*7.0);',
 ' vec3 ocean=uColor*.33+vec3(.019,.041,.080);',
 ' vec3 high=uColor*(.86+.30*bands)+vec3(.14,.14,.15)*pow(details,2.0);',
 ' vec3 material=mix(ocean,high,land);',
 ' float daylight=smoothstep(-.13,.24,dot(n,litDir));',
' float light=.085+daylight*(.17+.83*ndl);',
 ' float clouds=smoothstep(.57,.83,details+.15*surf);',
 ' float spec=pow(max(0.0,dot(reflect(-litDir,n),viewDir)),24.0);',
 ' color=material*light+vec3(.38,.46,.57)*spec*.25*daylight+vec3(.66,.76,.92)*clouds*.13*daylight;',
 ' color+=mix(uColor,vec3(.65,.82,1.0),.36)*rim*(.035+.32*daylight);',
 '}',
 'gl_FragColor=vec4(max(color,vec3(0.0)),1.0);',
 '}'
].join('\n');
const lineVS=[
 'attribute vec3 aPos;uniform mat4 uViewProjection;',
 'void main(){gl_Position=uViewProjection*vec4(aPos,1.0);}'
].join('\n');
const lineFS=[
 'precision mediump float;uniform vec4 uColor;',
 'void main(){gl_FragColor=uColor;}'
].join('\n');
const spriteVS=[
 'attribute vec3 aPos;uniform mat4 uViewProjection;',
 'uniform float uSize;uniform float uFixed;',
 'void main(){gl_Position=uViewProjection*vec4(aPos,1.0);',
 'gl_PointSize=uFixed>0.5?uSize:min(512.0,max(1.0,uSize/max(gl_Position.w,1.0)));}'
].join('\n');
const spriteFS=[
 'precision mediump float;uniform vec4 uColor;uniform float uBackground;',
 'void main(){vec2 p=gl_PointCoord-vec2(0.5);float r=length(p)*2.0;',
 'float a=uBackground>0.5?1.0-smoothstep(0.25,0.85,r):pow(max(0.0,1.0-r),2.6);',
 'gl_FragColor=vec4(uColor.rgb,uColor.a*a);}'
].join('\n');
// Diffuse stellar glow: perspective-scaled camera-facing quads, not capped GL point sprites.
// Projected glow radii use ONLY the perspective matrix, never camera-rotation columns.
const coronaVS=[
 'attribute vec2 aCorner;uniform vec3 uCenter;uniform mat4 uViewProjection;',
 'uniform float uWorldRadius;uniform vec2 uProjectionScale;',
 'varying vec2 vCorner;',
 'void main(){vec4 clip=uViewProjection*vec4(uCenter,1.0);',
 'gl_Position=vec4(clip.xy+aCorner*uWorldRadius*uProjectionScale,clip.z,clip.w);',
 'vCorner=aCorner;}'
].join('\n');
const coronaFS=[
 'precision mediump float;uniform vec4 uColor;varying vec2 vCorner;',
 'void main(){float r=length(vCorner);',
 'float a=exp(-16.0*r*r);',
 'gl_FragColor=vec4(uColor.rgb,uColor.a*a);}'
].join('\n');
function createGPU(gl){
 const meshP=program(gl,sphereVS,sphereFS),lineP=program(gl,lineVS,lineFS),spriteP=program(gl,spriteVS,spriteFS),coronaP=program(gl,coronaVS,coronaFS);
 const attrib=(p,key)=>gl.getAttribLocation(p,key);
 const uniform=(p,key)=>gl.getUniformLocation(p,key);
 const mesh={p:meshP,pos:attrib(meshP,"aPos"),normal:attrib(meshP,"aNormal"),
  vp:uniform(meshP,"uViewProjection"),rot:uniform(meshP,"uRotation"),
  center:uniform(meshP,"uCenter"),scale:uniform(meshP,"uScale"),
  color:uniform(meshP,"uColor"),eye:uniform(meshP,"uEye"),light:uniform(meshP,"uLightDir"),kind:uniform(meshP,"uKind"),time:uniform(meshP,"uTime")};
 const lines={p:lineP,pos:attrib(lineP,"aPos"),vp:uniform(lineP,"uViewProjection"),color:uniform(lineP,"uColor")};
 const sprites={p:spriteP,pos:attrib(spriteP,"aPos"),vp:uniform(spriteP,"uViewProjection"),
  color:uniform(spriteP,"uColor"),size:uniform(spriteP,"uSize"),
  fixed:uniform(spriteP,"uFixed"),background:uniform(spriteP,"uBackground")};
 const corona={p:coronaP,corner:attrib(coronaP,"aCorner"),vp:uniform(coronaP,"uViewProjection"),
 center:uniform(coronaP,"uCenter"),radius:uniform(coronaP,"uWorldRadius"),
 projection:uniform(coronaP,"uProjectionScale"),color:uniform(coronaP,"uColor")};
 const buffers=[];
 function makeBuffer(type,data){
  const b=gl.createBuffer();gl.bindBuffer(type,b);gl.bufferData(type,data,gl.STATIC_DRAW);buffers.push(b);return b;
 }
 function createGeometry(info){
  return {v:makeBuffer(gl.ARRAY_BUFFER,new Float32Array(info.vertices)),
   n:makeBuffer(gl.ARRAY_BUFFER,new Float32Array(info.normals)),
   i:makeBuffer(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(info.indices)),count:info.indices.length};
 }
 const sphere=createGeometry(makeSphere()),moon=createGeometry(makeSphere(10,16)),torus=createGeometry(makeTorus());
 const point=makeBuffer(gl.ARRAY_BUFFER,new Float32Array([0,0,0]));
 const coronaQuad=makeBuffer(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]));
 function dispose(){
  buffers.forEach(b=>gl.deleteBuffer(b));
  [meshP,lineP,spriteP,coronaP].forEach(p=>gl.deleteProgram(p));
 }
 return {mesh,lines,sprites,corona,coronaQuad,sphere,moon,torus,point,makeBuffer,dispose};
}
// Only visual companions: deterministic and wholly independent of token data.
function makeDecorations(item){
 const seed=[...item.system.key].reduce((h,c)=>(Math.imul(h,33)+c.charCodeAt(0))>>>0,1643);
 const rand=random(seed),count=item.portal?2:1+(seed%2);
 return Array.from({length:count},(_,index)=>({
  phase:rand()*TWO_PI,
  orbit:item.radius*(2.0+rand()*.55),
  inclination:.15+rand()*.46,
  node:rand()*TWO_PI,
  speed:(.14+rand()*.09)*(index%2===0?1:-1),
  radius:item.radius*(index===0?.135:.075),
  color:item.portal?[.67,.64,.55]:item.color.map(c=>clamp(c*.43+.28,0,1)),
  solid:index===0
 }));
}
const orbitSeed=key=>[...key].reduce((h,c)=>(Math.imul(h,33)+c.charCodeAt(0))>>>0,1643);
// Kepler-like ellipses have their focus at the fixed XGR hub. Independent
// ascending nodes/inclinations add real depth instead of parallel flat rings.
function orbitPoint(o,angle){
 const e=o.eccentricity;
 const r=o.radius*(1-e*e)/(1+e*Math.cos(angle));
 return rotate([r*Math.cos(angle),r*Math.sin(angle),0],o.inclination,0,o.node);
}
function makeChainOrbit(key,index,total){
 const rnd=random(orbitSeed(key)^0x9e3779b9);
 const band=Math.floor(index/7),slot=index%7,inBand=Math.min(7,total-band*7);
 const targetAngle=-Math.PI/3+slot*TWO_PI/inBand+band*.37+
  (rnd()-.5)*Math.min(.18,.3/inBand);
 const node=rnd()*TWO_PI,inclination=.23+rnd()*.70;
 const o={
  radius:17.8+band*10.7+(index%4)*1.95+rnd()*2.5,
  eccentricity:.045+rnd()*.15,
  phase:targetAngle-node,
  inclination,node,
  // Independent clockwise/counterclockwise phase motion and observable
  // variation in angular velocity. Values remain deterministic per chain.
  speed:(index%2===0?1:-1)*(.0055+rnd()*.0105)/(1+band*.28)
 };
 o.origin=orbitPoint(o,o.phase);
 o.axis=norm(rotate([0,0,1],inclination,0,node));
 return o;
}
export function overviewHubLinks(model,byKey){
 const hub=byKey.get(HUB);
 if(!hub)return [];
 const links=new Map();
 for(const route of model.routes||[]){
  const source=route.source,destination=route.destination;
  if((source===HUB)===(destination===HUB))continue;
  const spokeKey=source===HUB?destination:source,spoke=byKey.get(spokeKey);
  if(!spoke||spoke.portal)continue;
  const current=links.get(spokeKey);
  if(current)current.active=current.active||route.active===true;
  else links.set(spokeKey,{from:hub,to:spoke,active:route.active===true});
 }
 return [...links.values()].sort((a,b)=>a.to.system.key.localeCompare(b.to.system.key));
}
// Complete continuous hub-to-spoke lines. Every two consecutive line segments
// share one vertex; exact endpoints touch the corresponding systems.
export function hubSpokeSegments(a,b,count=48){
 const n=Math.max(2,Math.min(128,Math.floor(count)));
 const delta=sub(b,a);
 let bend=norm(cross(delta,[0,0,1]));
 if(Math.hypot(...bend)<.0001)bend=norm(cross(delta,[0,1,0]));
 const rise=Math.min(2.1,Math.hypot(...delta)*.075);
 const at=t=>t<=0?[...a]:t>=1?[...b]:
  add(add(mul(a,1-t),mul(b,t)),mul(bend,Math.sin(Math.PI*t)*rise));
 const out=new Float32Array(n*6);
 for(let i=0;i<n;i++){
  out.set(at(i/n),i*6);out.set(at((i+1)/n),i*6+3);
 }
 return out;
}
function createTopology(model){
 const spokes=model.chains.filter(c=>c.key!==HUB).sort((a,b)=>a.label.localeCompare(b.label));
 const systems=[];
 if(model.hub)systems.push({system:model.hub,position:[0,0,0],color:chainColor(HUB,0),radius:3.60,portal:true});
 const count=spokes.length;
 for(let i=0;i<count;i++){
  const key=spokes[i].key,orbital=makeChainOrbit(key,i,count);
  systems.push({system:spokes[i],orbital,position:[...orbital.origin],
   color:chainColor(key,i+1),radius:2.85,portal:false});
 }
 for(const item of systems)item.decorations=makeDecorations(item);
 const byKey=new Map(systems.map(s=>[s.system.key,s]));
 const links=overviewHubLinks(model,byKey);
 // Orbit planets are populated on demand from indexed, eligible top-ranked assets.
 // Never materialize every catalog token as a WebGL body.
 const planets=[];
 return {systems,planets,links,byKey};
}
// Exported for deterministic topology/asset tests, not for authorizing bridge operations.
export const createUniverseTopology=createTopology;
// A slow heliocentric sweep keeps the configured spokes anchored to XGR.
// Each system follows a distinct inclined 3D orbit around the XGR gateway.
// Stable orbital elements prevent the former shared flat-plane rotation.
export function orbitPosition(elements,time,reduced=false){
 if(elements.portal)return [0,0,0];
 const o=elements.orbital;
 return orbitPoint(o,o.phase+(reduced?0:time*o.speed));
}
function systemPosition(item,time,reduced=false){return orbitPosition(item,time,reduced)}
// The satellite follows its parent chain in a separate inclined local orbit.
export function decorativePosition(item,decoration,time,reduced=false){
 const angle=decoration.phase+(reduced?0:time*decoration.speed);
 const local=rotate([Math.cos(angle)*decoration.orbit,0,
  Math.sin(angle)*decoration.orbit*.82],decoration.inclination,decoration.node,0);
 return add(systemPosition(item,time,reduced),local);
}
function tokenOrbitPoint(p,angle,center){
 return add(center,rotate([Math.cos(angle)*p.orbit,0,Math.sin(angle)*p.orbit*.82],
  p.inclination,p.node,p.twist));
}
function planetPosition(p,time,reduced=false){
 return tokenOrbitPoint(p,p.phase+(reduced?0:time*p.speed),
  systemPosition(p.system,time,reduced));
}
function setText(node,text){if(node)node.textContent=text;}
function fallback(stage,topology,reason,select){
 stage.dataset.renderer="fallback";
 const canvas=stage.querySelector("canvas");
 if(canvas)canvas.style.display="none";
 const labels=stage.querySelector(".ux-3d-labels");
 if(labels)labels.textContent="";
 const old=stage.querySelector(".ux-3d-fallback");
 if(old)old.remove();
 const panel=document.createElement("div");panel.className="ux-3d-fallback";
 const intro=document.createElement("p");
 intro.textContent="3D graphics unavailable. Explore chain systems below.";
 panel.appendChild(intro);
 for(const item of topology.systems){
  const button=document.createElement("button");
  button.type="button";button.textContent=item.system.label;
  button.addEventListener("click",()=>select(item.system.key));
  panel.appendChild(button);
 }
 stage.appendChild(panel);
 const status=stage.querySelector(".ux-3d-status");
 setText(status,reason||"3D graphics unavailable");
}
export function mountUniverse3D({root,model,selected=HUB,compact=false,onFocus=()=>{},onToken=()=>{}}){
 if(!root)return {focus(){},orbit(){},zoom(){},pan(){},dispose(){}};
 const canvas=root.querySelector("canvas"),labelRoot=root.querySelector(".ux-3d-labels");
 const topology=createTopology(model),available=topology.byKey;
 const control=new AbortController(),signal=control.signal;
 let selectedKey=available.has(selected)?selected:HUB;
 let gl=null,gpu=null,frame=0,viewProjection=null,last=0,raf=0,disposed=false,visible=true;
 const reducedMotion=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches||false;
 const farthest=Math.max(0,...topology.systems.map(x=>Math.hypot(...x.position)));
 const initialDistance=Math.max(compact?47:45,farthest*(compact?1.85:1.95));
 const camera={target:[0,0,0],distance:initialDistance,yaw:.07,pitch:.18};
 const wanted={target:[0,0,0],distance:initialDistance,yaw:.07,pitch:.18};
 let focused=false,focusBlend=0;
 const allPick=[];
 const status=root.querySelector(".ux-3d-status");
 const focusCaption=root.querySelector(".ux-3d-focus");
 const focusTitle=root.querySelector(".ux-3d-focus-title");
 const focusCount=root.querySelector(".ux-3d-focus-count");
 const tokensRoot=root.querySelector(".ux-3d-asset-links");
 const tokenLabels=[];
 const countTokens=key=>available.get(key)?.system.tokens||[];
 function setFocusUI(){
  root.dataset.selected=selectedKey;
  root.dataset.mode=focused?"system":"overview";
  if(!compact&&focusCaption&&focusTitle&&tokensRoot){
   const system=available.get(selectedKey)?.system;
   focusTitle.textContent=focused?(system?.label||selectedKey):"";
   if(focusCount)focusCount.textContent=focused?(countTokens(selectedKey).length+" token asset(s) · click a planet or token"): "";
   tokensRoot.replaceChildren();
   if(focused)for(const token of countTokens(selectedKey)){
    const chip=document.createElement("button");
    chip.type="button";
    chip.className="ux-3d-asset-link";
    const rep=representationFor(token,selectedKey);
    chip.textContent=rep.symbol+" · "+rep.label;
    chip.dataset.representation=rep.kind;
    chip.title="Open "+token.name+" token page";
    chip.addEventListener("click",()=>onToken(token,selectedKey),{signal});
    tokensRoot.appendChild(chip);
   }
  }
  if(status)status.textContent=focused?
   "Exploring "+(available.get(selectedKey)?.system.label||selectedKey)+" · configured inventory":
   "XGR gateway · configured routes only";
 }
 const focusKey=(key,close=false)=>{
  if(!available.has(key))return;
  selectedKey=key;focused=!compact;
  wanted.target=[...systemPosition(available.get(key),frame,reducedMotion)];
  rebuildPlanets();
  const n=topology.planets.length;
  wanted.distance=close?17.5:clamp(20+n*.85,20,29);
  setFocusUI();
  onFocus(key);
 };
 function home(){
  focused=false;selectedKey=HUB;
  wanted.target=[0,0,0];wanted.distance=initialDistance;wanted.yaw=.07;wanted.pitch=.18;
  rebuildPlanets();
  setFocusUI();
  onFocus(HUB);
 }
 const orbit=(dx,dy)=>{
  wanted.yaw-=dx*.006;
  wanted.pitch=clamp(wanted.pitch-dy*.006,-1.23,1.23);
 };
 const zoom=direction=>{wanted.distance=clamp(wanted.distance*Math.exp(direction*.13),5.8,Math.max(220,initialDistance*2.5))};
 const pan=(dx,dy)=>{
  const r=[Math.cos(wanted.yaw),0,-Math.sin(wanted.yaw)];
  const u=[-Math.sin(wanted.yaw)*Math.sin(wanted.pitch),Math.cos(wanted.pitch),-Math.cos(wanted.yaw)*Math.sin(wanted.pitch)];
  const speed=wanted.distance*.0023;
  wanted.target=add(wanted.target,add(mul(r,-dx*speed),mul(u,dy*speed)));
 };
 const labels=topology.systems.map(item=>{
  const node=document.createElement(compact?"span":"button");
  node.className="ux-3d-label"+(item.portal?" is-hub":"");
  node.textContent=item.system.label;
  if(!compact){
   node.type="button";
   node.dataset.cosmosSystem=item.system.key;
   node.setAttribute("aria-label","Explore "+item.system.label+" stellar system");
   node.addEventListener("click",()=>focusKey(item.system.key),{signal});
   node.addEventListener("dblclick",e=>{e.preventDefault();focusKey(item.system.key,true);},{signal});
  }
  labelRoot?.appendChild(node);
  return [item,node];
 });
 setFocusUI();
 // Token labels are clickable DOM targets as well as WebGL picking targets.
 if(!compact&&labelRoot)for(const p of topology.planets){
  const node=document.createElement("button");
  node.type="button";node.className="ux-3d-token";node.hidden=true;
  node.textContent=p.token.id;
  node.title="Open "+p.token.name+" token page";
  node.setAttribute("aria-label","Open "+p.token.name+" on "+p.system.system.label);
  node.addEventListener("click",()=>onToken(p.token,p.system.system.key),{signal});
  labelRoot.appendChild(node);
  tokenLabels.push([p,node]);
 }
 function resize(){
  if(!gl)return;
  const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);
  const dpr=Math.min(window.devicePixelRatio||1,1.3);
  const px=Math.round(w*dpr),py=Math.round(h*dpr);
  if(canvas.width!==px||canvas.height!==py){canvas.width=px;canvas.height=py;gl.viewport(0,0,px,py);}
 }
 function bufferLine(values){
  return {buffer:gpu.makeBuffer(gl.ARRAY_BUFFER,new Float32Array(values)),count:values.length/3};
 }
 let paths=[],orbitPaths=[],stars=null,pointBuffer=null;
 function initialize(){
  try{
   gl=canvas.getContext("webgl",{alpha:true,antialias:true,depth:true,preserveDrawingBuffer:false,powerPreference:"low-power"});
   if(!gl)throw Error("WebGL is unavailable");
   gpu=createGPU(gl);
   resize();
   const rnd=random(1643),arr=[];
   for(let i=0;i<(compact?650:950);i++){
    const y=rnd()*2-1,a=rnd()*TWO_PI,r=90+rnd()*330;
    const length=Math.sqrt(1-y*y);
    arr.push(Math.cos(a)*length*r,y*r,Math.sin(a)*length*r);
   }
   stars=bufferLine(arr);
   pointBuffer=gpu.makeBuffer(gl.ARRAY_BUFFER,new Float32Array([0,0,0]));
   paths=topology.links.map(link=>({...link,geometry:bufferLine(new Float32Array(48*6))}));
   // Reuse six GPU orbit buffers across sort/filter changes; do not leak buffers.
   orbitPaths=Array.from({length:6},()=>({planet:null,geometry:bufferLine(new Float32Array(80*2*3))}));
   gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
   gl.enable(gl.BLEND);
   root.dataset.renderer="webgl";
  }catch(error){
   if(gpu)gpu.dispose();
   gl=null;gpu=null;
   fallback(root,topology,"3D fallback · "+(error.message||"WebGL unavailable"),key=>focusKey(key));
  }
 }
 function line(geometry,color,alpha,vp){
  const shader=gpu.lines;
  gl.useProgram(shader.p);
  gl.bindBuffer(gl.ARRAY_BUFFER,geometry.buffer);
  gl.enableVertexAttribArray(shader.pos);
  gl.vertexAttribPointer(shader.pos,3,gl.FLOAT,false,0,0);
  gl.uniformMatrix4fv(shader.vp,false,vp);
  gl.uniform4f(shader.color,color[0],color[1],color[2],alpha);
  gl.drawArrays(gl.LINES,0,geometry.count);
 }
  function point(position,size,color,opacity,vp,background=false){
  const shader=gpu.sprites;
  gl.useProgram(shader.p);
  gl.bindBuffer(gl.ARRAY_BUFFER,pointBuffer);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(position),gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(shader.pos);
  gl.vertexAttribPointer(shader.pos,3,gl.FLOAT,false,0,0);
  gl.uniformMatrix4fv(shader.vp,false,vp);
  gl.uniform4f(shader.color,color[0],color[1],color[2],opacity);
  gl.uniform1f(shader.size,size);
  gl.uniform1f(shader.fixed,background?1:0);
  gl.uniform1f(shader.background,background?1:0);
  gl.drawArrays(gl.POINTS,0,1);
 }
 function diffuseCorona(position,radius,color,opacity,vp,projection){
  const c=gpu.corona;
  gl.useProgram(c.p);
  gl.bindBuffer(gl.ARRAY_BUFFER,gpu.coronaQuad);
  gl.enableVertexAttribArray(c.corner);
  gl.vertexAttribPointer(c.corner,2,gl.FLOAT,false,0,0);
  gl.uniformMatrix4fv(c.vp,false,vp);
  gl.uniform3fv(c.center,position);
  gl.uniform1f(c.radius,radius);
  gl.uniform2f(c.projection,projection[0],projection[5]);
  gl.uniform4f(c.color,color[0],color[1],color[2],opacity);
  gl.drawArrays(gl.TRIANGLES,0,6);
 }
 function body(geometry,pos,scale,color,kind,time,rot=IDENTITY,eye,vp){
  const shader=gpu.mesh;
  gl.useProgram(shader.p);
  gl.bindBuffer(gl.ARRAY_BUFFER,geometry.v);
  gl.enableVertexAttribArray(shader.pos);
  gl.vertexAttribPointer(shader.pos,3,gl.FLOAT,false,0,0);
  gl.bindBuffer(gl.ARRAY_BUFFER,geometry.n);
  gl.enableVertexAttribArray(shader.normal);
  gl.vertexAttribPointer(shader.normal,3,gl.FLOAT,false,0,0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,geometry.i);
  gl.uniformMatrix4fv(shader.vp,false,vp);
  gl.uniformMatrix3fv(shader.rot,false,rot);
  gl.uniform3fv(shader.center,pos);
  gl.uniform1f(shader.scale,scale);
  gl.uniform3fv(shader.color,color);
  gl.uniform3fv(shader.eye,eye);
  // Eye-relative key light: a stable upper-left terminator when the viewer orbits.
  const forward=norm(sub(camera.target,eye));
  const right=norm([forward[2],0,-forward[0]]);
  const up=norm([right[1]*forward[2]-right[2]*forward[1],right[2]*forward[0]-right[0]*forward[2],right[0]*forward[1]-right[1]*forward[0]]);
  const light=norm(add(add(mul(right,-.76),mul(up,.71)),mul(forward,-.93)));
  gl.uniform3fv(shader.light,light);
  gl.uniform1f(shader.kind,kind);
  gl.uniform1f(shader.time,time);
  gl.drawElements(gl.TRIANGLES,geometry.count,gl.UNSIGNED_SHORT,0);
 }
 function updateLabels(vp,w,h,t){
  allPick.length=0;
  for(const [system,label] of labels){
   const pos=projectionOf(systemPosition(system,t,reducedMotion),vp,w,h);
   const showSystem=(!focused||system.system.key===selectedKey||focusBlend<.35);
   const visible=showSystem&&pos&&pos.visible&&pos.x>45&&pos.x<w-45&&pos.y>30&&pos.y<h-48;
   label.hidden=!visible;
   if(!visible)continue;
   const px=pos.x,py=pos.y;
   label.style.transform="translate3d("+Math.round(px)+"px,"+Math.round(py+clamp(system.radius*520/pos.depth,20,55))+"px,0) translate(-50%,0)";
   label.classList.toggle("is-focused",selectedKey===system.system.key);
   allPick.push({x:px,y:py,depth:pos.depth,kind:"system",key:system.system.key,
    radius:clamp(system.radius*600/pos.depth,21,56)});
  }
  for(const [planet,node] of tokenLabels){
   node.hidden=true;
   if(!focused||planet.system.system.key!==selectedKey||focusBlend<.7)continue;
   const pos=projectionOf(planetPosition(planet,t,reducedMotion),vp,w,h);
   if(!pos||!pos.visible||pos.x<45||pos.x>w-45||pos.y<50||pos.y>h-64)continue;
   node.hidden=false;
   node.style.transform="translate3d("+Math.round(pos.x)+"px,"+Math.round(pos.y+26)+"px,0) translate(-50%,0)";
   allPick.push({x:pos.x,y:pos.y,depth:pos.depth,kind:"token",token:planet.token,
    chain:planet.system.system.key,radius:clamp(planet.radius*850/pos.depth,18,42)});
  }
 }
 function draw(now){
  if(disposed||!visible||!gl)return;
  const dt=last?Math.min((now-last)/1000,.07):0;last=now;frame+=dt;
  if(focused&&selectedKey!==HUB)wanted.target=systemPosition(available.get(selectedKey),frame,reducedMotion);
   const ease=reducedMotion?1:1-Math.exp(-dt*4.7);
  focusBlend=mix(focusBlend,focused?1:0,reducedMotion?1:1-Math.exp(-dt*4.5));
  camera.distance=mix(camera.distance,wanted.distance,ease);
  camera.yaw=mix(camera.yaw,wanted.yaw,ease);
  camera.pitch=mix(camera.pitch,wanted.pitch,ease);
  camera.target=camera.target.map((v,i)=>mix(v,wanted.target[i],ease));
  resize();
  const w=canvas.clientWidth||1,h=canvas.clientHeight||1;
  const eye=cameraEye(camera);
  const projection=perspective(Math.PI/3,canvas.width/canvas.height,.1,750);
  const vp=matrixMultiply(projection,lookAt(eye,camera.target));
  viewProjection=vp;
  gl.viewport(0,0,canvas.width,canvas.height);
  gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  // Background stars stay subtly visible; their positions are true 3D points.
  gl.disable(gl.DEPTH_TEST);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
  const sp=gpu.sprites;
  gl.useProgram(sp.p);
  gl.bindBuffer(gl.ARRAY_BUFFER,stars.buffer);
  gl.enableVertexAttribArray(sp.pos);gl.vertexAttribPointer(sp.pos,3,gl.FLOAT,false,0,0);
  gl.uniformMatrix4fv(sp.vp,false,vp);gl.uniform4f(sp.color,.80,.87,1.0,.82);
  gl.uniform1f(sp.size,2.0);gl.uniform1f(sp.fixed,1);gl.uniform1f(sp.background,1);
  gl.drawArrays(gl.POINTS,0,stars.count);
  // Wide additive nebula glow from EVERY visible star; distant colors can mix.
  // Gaussian alpha is ~0 at the quad edge (exp(-16)), eliminating cut-off rings.
  for(const item of topology.systems){
   if(focused&&item.system.key!==selectedKey&&focusBlend>.85)continue;
   const intensity=(item.portal?.42:.33)*(focused&&item.system.key===selectedKey?1-focusBlend*.65:1);
   const center=systemPosition(item,frame,reducedMotion);
   const mist=item.color.map(channel=>Math.min(1,channel*.78+.22));
   // Outer light extends past neighbouring stars and blends with their colours.
   // Radius is WORLD space and scales naturally with camera distance / zoom.
   diffuseCorona(center,item.radius*11,mist,intensity*.30,vp,projection);
   diffuseCorona(center,item.radius*6.5,item.color,intensity*.44,vp,projection);
   diffuseCorona(center,item.radius*3.5,item.color,intensity*.24,vp,projection);
  }
  gl.enable(gl.DEPTH_TEST);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  // Northstar: one fine ring per spoke, two warm rings around the hub.
   for(const item of topology.systems){
    if(focused&&item.system.key!==selectedKey&&focusBlend>.86)continue;
    if(focused&&item.system.key===selectedKey&&focusBlend>.96)continue;
    const center=systemPosition(item,frame,reducedMotion);
    const t=0; // fixed orbital ornaments around XGR
    if(item.portal){
     body(gpu.torus,center,item.radius*1.66,[.93,.76,.49],2,frame,
       rotation(.42,.33+t,-.47),eye,vp);
     body(gpu.torus,center,item.radius*2.10,[.72,.56,.36],2,frame,
       rotation(1.00,-.28,.54),eye,vp);
     body(gpu.torus,center,item.radius*2.48,[.53,.40,.27],2,frame,
       rotation(.69,.63,-.12),eye,vp);
    }else{
     body(gpu.torus,center,item.radius*1.63,
       item.color.map(c=>c*.46+.07),2,frame,
       rotation(.72+item.orbital.inclination*.42,item.orbital.node*.42,.12),eye,vp);
    }
   }
   // Overview paths are exclusively XGR-to-spoke, never detached orbit arcs.
   if(focusBlend<.96)for(const link of paths){
    const a=systemPosition(link.from,frame,reducedMotion);
    const b=systemPosition(link.to,frame,reducedMotion);
    const vertices=hubSpokeSegments(a,b);
    gl.bindBuffer(gl.ARRAY_BUFFER,link.geometry.buffer);
    gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.DYNAMIC_DRAW);
    link.geometry.count=vertices.length/3;
    line(link.geometry,link.active?[.58,.85,1.0]:[.60,.72,.91],
      (link.active?.48:.18)*(1-focusBlend*.93),vp);
   }
  if(focusBlend>.72)for(const ring of orbitPaths){
   if(!ring.planet||ring.planet.system.system.key!==selectedKey)continue;
   const verts=[],N=80,c=systemPosition(ring.planet.system,frame,reducedMotion);
   for(let i=0;i<N;i++)verts.push(...tokenOrbitPoint(ring.planet,TWO_PI*i/N,c),...tokenOrbitPoint(ring.planet,TWO_PI*(i+1)/N,c));
   gl.bindBuffer(gl.ARRAY_BUFFER,ring.geometry.buffer);
   gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(verts),gl.DYNAMIC_DRAW);
   line(ring.geometry,[.48,.63,.79],.19*focusBlend,vp);
  }
  const entries=[];
  for(const item of topology.systems)entries.push({type:"star",item,depth:Math.hypot(...sub(systemPosition(item,frame,reducedMotion),eye))});
  if(focusBlend>.15)for(const planet of topology.planets)
   if(planet.system.system.key===selectedKey)
    entries.push({type:"planet",planet,position:planetPosition(planet,frame,reducedMotion),depth:0});
  for(const entry of entries)if(entry.type==="planet")entry.depth=Math.hypot(...sub(entry.position,eye));
  entries.sort((a,b)=>b.depth-a.depth);
  for(const entry of entries){
   if(entry.type==="star"){
    const item=entry.item;
    if(focused&&item.system.key!==selectedKey&&focusBlend>.9)continue;
    const center=systemPosition(item,frame,reducedMotion);
    const bodyRotation=item.portal?IDENTITY:rotation(
      .10+item.orbital.inclination*.30,frame*.075+item.orbital.node,.08);
     body(gpu.sphere,center,item.radius,item.color,item.portal?1:0,frame,bodyRotation,eye,vp);
    // Small pseudo-random satellites are decorative, never token planets.
    // Hierarchy: orbiting chain -> companion; XGR remains at world origin.
    if(!focused||item.system.key===selectedKey){
     for(const decoration of item.decorations){
      const satellite=decorativePosition(item,decoration,frame,reducedMotion);
      if(decoration.solid){
       body(gpu.moon,satellite,decoration.radius,decoration.color,0,frame,
        rotation(0,frame*.05,0),eye,vp);
      }else{
       point(satellite,item.radius*420,decoration.color,.60,vp);
      }
     }
    }
   }else{
    const p=entry.planet;
    const col=p.system.color.map(v=>clamp(v*.64+.18,0,1));
     const presence=focused?focusBlend:1;
    if(presence>.45)point(entry.position,p.radius*2700,col,.27*presence,vp);
    body(gpu.sphere,entry.position,p.radius*(focused?presence:1.5),col,0,frame,rotation(.08,frame*.09+p.phase,0),eye,vp);
    if(p.index%3===1&&presence>.82)body(gpu.torus,entry.position,p.radius*1.72,
     col.map(x=>x*.9),2,frame,rotation(.5,.2,.3),eye,vp);
   }
  }
  updateLabels(vp,w,h,frame);
  raf=requestAnimationFrame(draw);
 }
 function stop(){if(raf){cancelAnimationFrame(raf);raf=0;}}
 function start(){if(!disposed&&visible&&gl&&!raf){last=0;raf=requestAnimationFrame(draw);}}
 function pick(x,y){
  return allPick.filter(p=>Math.hypot(p.x-x,p.y-y)<=p.radius)
   .sort((a,b)=>{
    if(a.kind!==b.kind)return a.kind==="token"?-1:1;
    return Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x,b.y);
   })[0]||null;
 }
 let pointer=null;
 if(!compact){
  canvas.addEventListener("pointerdown",e=>{
   if(e.button!==0&&e.button!==2)return;
   e.preventDefault();
   pointer={id:e.pointerId,lastX:e.clientX,lastY:e.clientY,x:e.clientX,y:e.clientY,moved:0,
    pan:e.button===2||e.shiftKey};
   canvas.setPointerCapture?.(e.pointerId);
  },{signal});
  canvas.addEventListener("pointermove",e=>{
   const rect=canvas.getBoundingClientRect();
   if(pointer&&pointer.id===e.pointerId){
    const dx=e.clientX-pointer.lastX,dy=e.clientY-pointer.lastY;
    pointer.moved+=Math.hypot(dx,dy);
    if(pointer.pan)pan(dx,dy);else orbit(dx,dy);
    pointer.lastX=e.clientX;pointer.lastY=e.clientY;
   }else canvas.style.cursor=pick(e.clientX-rect.left,e.clientY-rect.top)?"pointer":"grab";
  },{signal});
  canvas.addEventListener("pointerup",e=>{
   if(!pointer||pointer.id!==e.pointerId)return;
   const was=pointer;pointer=null;
   if(was.moved>6||was.pan)return;
   const rect=canvas.getBoundingClientRect(),hit=pick(e.clientX-rect.left,e.clientY-rect.top);
   if(hit?.kind==="system")focusKey(hit.key);
   else if(hit?.kind==="token")onToken(hit.token,hit.chain);
  },{signal});
  canvas.addEventListener("pointercancel",()=>{pointer=null},{signal});
  canvas.addEventListener("dblclick",e=>{
   const rect=canvas.getBoundingClientRect(),hit=pick(e.clientX-rect.left,e.clientY-rect.top);
   if(hit?.kind==="system")focusKey(hit.key,true);
   else if(hit?.kind==="token")onToken(hit.token,hit.chain);
   else if(focused)home();
  },{signal});
  canvas.addEventListener("contextmenu",e=>e.preventDefault(),{signal});
  canvas.addEventListener("wheel",e=>{
   e.preventDefault();
   const unit=e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight:1;
   zoom(clamp(e.deltaY*unit/105,-4,4));
  },{passive:false,signal});
  const keys=e=>{
   if(!root.isConnected||/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName||""))return;
   const step=e.shiftKey?30:16;
   if(e.key==="ArrowLeft")orbit(step,0);
   else if(e.key==="ArrowRight")orbit(-step,0);
   else if(e.key==="ArrowUp")orbit(0,step);
   else if(e.key==="ArrowDown")orbit(0,-step);
   else if(e.key==="+"||e.key==="=")zoom(-1);
   else if(e.key==="-")zoom(1);
   else if(e.key.toLowerCase()==="w")pan(0,step);
   else if(e.key.toLowerCase()==="s")pan(0,-step);
   else if(e.key.toLowerCase()==="a")pan(step,0);
   else if(e.key.toLowerCase()==="d")pan(-step,0);
   else if(e.key.toLowerCase()==="h"||e.key==="Home"||e.key==="Escape")home();
   else return;
   e.preventDefault();
  };
  document.addEventListener("keydown",keys,{signal});
 }
 root.querySelectorAll("[data-cosmos-action]").forEach(button=>button.addEventListener("click",()=>{
  const action=button.dataset.cosmosAction;
  if(action==="home")home();
  if(action==="home")canvas.focus({preventScroll:true});
 },{signal}));
 initialize();
 if(gl)start();
 const observer=typeof ResizeObserver==="function"?new ResizeObserver(resize):null;
 observer?.observe(canvas);
 const visibility=()=>{
  visible=document.visibilityState!=="hidden";
  if(!visible)stop();else start();
 };
 document.addEventListener("visibilitychange",visibility,{signal});
 const intersection=typeof IntersectionObserver==="function"?new IntersectionObserver(entries=>{
  visible=entries.some(entry=>entry.isIntersecting)&&document.visibilityState!=="hidden";
  if(!visible)stop();else start();
 },{threshold:0}):null;
 intersection?.observe(root);
 let rankedTokens=[], tokenQuery="";
 function rebuildPlanets(){
  topology.planets.length=0;
  for(const slot of orbitPaths)slot.planet=null;
  for(const [,node] of tokenLabels.splice(0))node.remove();
  const system=available.get(selectedKey);
  if(!focused||!system||compact){
   root.dataset.orbitTokenCount="0";
   return;
  }
  const items=systemTokenPlanets(system.system,rankedTokens,tokenQuery);
  for(const item of items){
   const p={...item,system};
   topology.planets.push(p);
   orbitPaths[item.index].planet=p;
   const node=document.createElement("button");
   node.type="button";node.className="ux-3d-token";node.hidden=true;
   node.textContent=item.representation.symbol+" · "+item.representation.label;
   node.title="Open "+item.token.name+" token page (configured representation; activation unverified)";
   node.setAttribute("aria-label","Open "+item.token.name+" on "+system.system.label);
   node.addEventListener("click",()=>onToken(item.token,selectedKey),{signal});
   labelRoot?.appendChild(node);tokenLabels.push([p,node]);
  }
  root.dataset.orbitTokenCount=String(topology.planets.length);
 }
 function showRankedTokens(items=[]){
  rankedTokens=Array.isArray(items)?items:[];
  rebuildPlanets();
 }
 function searchTokens(query=""){
  tokenQuery=String(query||"");
  rebuildPlanets();
 }
 const controller={
  showRankedTokens,searchTokens,
  focus(key){if(key===HUB)home();else focusKey(key);},
  home,orbit,zoom,pan,
  dispose(){
   disposed=true;stop();control.abort();
   observer?.disconnect();intersection?.disconnect();
   labels.forEach(([,node])=>node.remove());
   tokenLabels.forEach(([,node])=>node.remove());
   if(gpu)gpu.dispose();
   gpu=null;gl=null;
  }
 };
 setFocusUI();
 return controller;
}
