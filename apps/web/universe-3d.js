// XITA Universe 3D — dependency-free native WebGL scene.
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
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const mix=(a,b,t)=>a+(b-a)*t;
const near=(a,b,eps=.001)=>Math.abs(a-b)<=eps;
const IDENTITY=new Float32Array([1,0,0,0,1,0,0,0,1]);
const fixedColors={
 xgrchain:[.94,.72,.40],base:[.42,.68,.94],
 polygon:[.62,.56,.85],arbitrum:[.47,.71,.85],
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
function makeSphere(stacks=22,slices=32){
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
function makeTorus(radius=1,tube=.025,around=76,across=9){
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
const sphereFS=[
 'precision mediump float;',
 'uniform vec3 uColor;uniform vec3 uEye;uniform float uTime;uniform float uKind;',
 'varying vec3 vNormal;varying vec3 vWorld;varying vec3 vLocal;',
 'void main(){',
 'vec3 n=normalize(vNormal);vec3 viewDir=normalize(uEye-vWorld);',
 'float facing=max(0.0,dot(n,viewDir));',
 'float rim=pow(1.0-facing,2.7);',
 'float pattern=sin(vLocal.x*18.0+sin(vLocal.y*21.0)*1.8)*sin(vLocal.z*15.0+vLocal.y*4.0);',
 'float small=sin(vLocal.x*55.0+vLocal.z*23.0)*sin(vLocal.y*48.0);',
 'float light=0.50+0.50*max(dot(n,normalize(vec3(-0.55,0.85,1.4))),0.0);',
 'vec3 color;',
 'if(uKind>1.5){color=uColor*(1.15+0.19*pattern)+vec3(0.13)*rim;}',
 'else if(uKind>0.5){color=uColor*(0.92+0.17*pattern+0.06*small)+uColor*rim*0.58;}',
 'else {color=uColor*(0.36+0.74*light+0.16*pattern+0.05*small)+uColor*rim*0.42;}',
 'gl_FragColor=vec4(color,1.0);',
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
 'gl_PointSize=uFixed>0.5?uSize:min(190.0,max(1.0,uSize/max(gl_Position.w,1.0)));}'
].join('\n');
const spriteFS=[
 'precision mediump float;uniform vec4 uColor;uniform float uBackground;',
 'void main(){vec2 p=gl_PointCoord-vec2(0.5);float r=length(p)*2.0;',
 'float a=uBackground>0.5?1.0-smoothstep(0.25,0.85,r):pow(max(0.0,1.0-r),2.6);',
 'gl_FragColor=vec4(uColor.rgb,uColor.a*a);}'
].join('\n');
function createGPU(gl){
 const meshP=program(gl,sphereVS,sphereFS),lineP=program(gl,lineVS,lineFS),spriteP=program(gl,spriteVS,spriteFS);
 const attrib=(p,key)=>gl.getAttribLocation(p,key);
 const uniform=(p,key)=>gl.getUniformLocation(p,key);
 const mesh={p:meshP,pos:attrib(meshP,"aPos"),normal:attrib(meshP,"aNormal"),
  vp:uniform(meshP,"uViewProjection"),rot:uniform(meshP,"uRotation"),
  center:uniform(meshP,"uCenter"),scale:uniform(meshP,"uScale"),
  color:uniform(meshP,"uColor"),eye:uniform(meshP,"uEye"),kind:uniform(meshP,"uKind"),time:uniform(meshP,"uTime")};
 const lines={p:lineP,pos:attrib(lineP,"aPos"),vp:uniform(lineP,"uViewProjection"),color:uniform(lineP,"uColor")};
 const sprites={p:spriteP,pos:attrib(spriteP,"aPos"),vp:uniform(spriteP,"uViewProjection"),
  color:uniform(spriteP,"uColor"),size:uniform(spriteP,"uSize"),
  fixed:uniform(spriteP,"uFixed"),background:uniform(spriteP,"uBackground")};
 const buffers=[];
 function makeBuffer(type,data){
  const b=gl.createBuffer();gl.bindBuffer(type,b);gl.bufferData(type,data,gl.STATIC_DRAW);buffers.push(b);return b;
 }
 function createGeometry(info){
  return {v:makeBuffer(gl.ARRAY_BUFFER,new Float32Array(info.vertices)),
   n:makeBuffer(gl.ARRAY_BUFFER,new Float32Array(info.normals)),
   i:makeBuffer(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(info.indices)),count:info.indices.length};
 }
 const sphere=createGeometry(makeSphere()),torus=createGeometry(makeTorus());
 const point=makeBuffer(gl.ARRAY_BUFFER,new Float32Array([0,0,0]));
 function dispose(){
  buffers.forEach(b=>gl.deleteBuffer(b));
  [meshP,lineP,spriteP].forEach(p=>gl.deleteProgram(p));
 }
 return {mesh,lines,sprites,sphere,torus,point,makeBuffer,dispose};
}
function createTopology(model){
 const spokes=model.chains.filter(c=>c.key!==HUB).sort((a,b)=>a.label.localeCompare(b.label));
 const systems=[];
 if(model.hub)systems.push({system:model.hub,position:[0,0,0],color:chainColor(HUB,0),radius:1.95,portal:true});
 const count=spokes.length;
 for(let i=0;i<count;i++){
  // Staggered 3D rings maintain sufficient separation as chains are added.
  const ring=Math.floor(i/7),within=i%7,perRing=Math.min(7,count-ring*7);
  const angle=-Math.PI*0.39+(within/perRing)*TWO_PI+ring*.25;
  const r=25+ring*15;
  const y=(i%3-1)*5+(ring%2?3:0);
  systems.push({system:spokes[i],
   position:[Math.cos(angle)*r,y+Math.sin(angle*1.6)*2,Math.sin(angle)*r*.68],
   color:chainColor(spokes[i].key,i+1),radius:1.43,portal:false});
 }
 const byKey=new Map(systems.map(s=>[s.system.key,s]));
 const links=spokes.filter(c=>model.routes.some(r=>r.source===c.key&&r.destination===HUB||r.source===HUB&&r.destination===c.key))
  .map(c=>({from:byKey.get(HUB),to:byKey.get(c.key),
   active:model.routes.some(r=>(r.source===c.key&&r.destination===HUB||r.source===HUB&&r.destination===c.key)&&r.active)}))
  .filter(v=>v.from&&v.to);
 const planets=[];
 for(const item of systems){
  const candidates=item.system.tokens.filter(token=>{
   const rep=token.representations.find(r=>r.chain===item.system.key);
   return !(rep?.representation==="native"&&token.canonical===item.system.key);
  });
  for(let i=0;i<Math.min(candidates.length,16);i++){
   planets.push({system:item,token:candidates[i],index:i,orbit:3.9+i*.77,
    radius:clamp(.42-(i*.009),.23,.42),speed:.09/(1+i*.2),phase:(i*2.399)+(item.system.chainId||7)*.13});
  }
 }
 return {systems,planets,links,byKey};
}
function planetPosition(p,time){
 const a=p.phase+time*p.speed,r=p.orbit,c=p.system.position;
 return [c[0]+Math.cos(a)*r,c[1]+Math.sin(a)*r*.56,c[2]+Math.sin(a)*r*.31];
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
 let gl=null,gpu=null,frame=0,viewProjection=null,frameId=0,last=0,raf=0,disposed=false,visible=true;
 const farthest=Math.max(0,...topology.systems.map(x=>Math.hypot(...x.position)));
 const initialDistance=clamp(48+Math.max(0,farthest-25)*1.05,48,160);
 const camera={target:[0,0,0],distance:initialDistance,yaw:.17,pitch:.20};
 const wanted={target:[0,0,0],distance:initialDistance,yaw:.17,pitch:.20};
 let focused=false;
 const labelNodes=new Map(),allPick=[];
 const status=root.querySelector(".ux-3d-status");
 const focusKey=key=>{
  if(!available.has(key))return;
  selectedKey=key;focused=true;
  wanted.target=[...available.get(key).position];
  wanted.distance=key===HUB?16.5:13.8;
  root.dataset.selected=key;
  onFocus(key);
 };
 function home(){
  focused=false;selectedKey=HUB;
  wanted.target=[0,0,0];wanted.distance=initialDistance;wanted.yaw=.17;wanted.pitch=.20;
  root.dataset.selected=HUB;
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
  const node=document.createElement("span");
  node.className="ux-3d-label"+(item.portal?" is-hub":"");
  node.textContent=item.system.label;
  labelRoot?.appendChild(node);
  labelNodes.set(item.system.key,node);
  return [item,node];
 });
 const message="Configured paths only · transfers are not active";
 if(status)setText(status,message);
 function resize(){
  if(!gl)return;
  const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);
  const dpr=Math.min(window.devicePixelRatio||1,1.65);
  const px=Math.round(w*dpr),py=Math.round(h*dpr);
  if(canvas.width!==px||canvas.height!==py){canvas.width=px;canvas.height=py;gl.viewport(0,0,px,py);}
 }
 function bufferLine(values){
  return {buffer:gpu.makeBuffer(gl.ARRAY_BUFFER,new Float32Array(values)),count:values.length/3};
 }
 function createPath(a,b,active){
  const positions=[],steps=92;
  const pointAt=t=>{
   const p=add(mul(a,1-t),mul(b,t));
   return add(p,[0,Math.sin(Math.PI*t)*3.6,Math.sin(Math.PI*t)*2.0]);
  };
  for(let i=0;i<steps;i++){
   if(!active&&i%5>1)continue;
   const from=pointAt(i/steps),to=pointAt((i+1)/steps);
   positions.push(...from,...to);
  }
  return bufferLine(positions);
 }
 function createOrbit(item,p){
  const arr=[],N=80;
  for(let i=0;i<N;i++){
   const a=TWO_PI*i/N,b=TWO_PI*(i+1)/N,c=item.position;
   arr.push(c[0]+Math.cos(a)*p.orbit,c[1]+Math.sin(a)*p.orbit*.56,c[2]+Math.sin(a)*p.orbit*.31,
    c[0]+Math.cos(b)*p.orbit,c[1]+Math.sin(b)*p.orbit*.56,c[2]+Math.sin(b)*p.orbit*.31);
  }
  return bufferLine(arr);
 }
 let paths=[],orbitPaths=[],stars=null,pointBuffer=null;
 function initialize(){
  try{
   gl=canvas.getContext("webgl",{alpha:true,antialias:true,depth:true,preserveDrawingBuffer:false,powerPreference:"low-power"});
   if(!gl)throw Error("WebGL is unavailable");
   gpu=createGPU(gl);
   resize();
   const rnd=random(1643),arr=[];
   for(let i=0;i<(compact?450:1100);i++){
    const y=rnd()*2-1,a=rnd()*TWO_PI,r=118+rnd()*260;
    const length=Math.sqrt(1-y*y);
    arr.push(Math.cos(a)*length*r,y*r,Math.sin(a)*length*r);
   }
   stars=bufferLine(arr);
   pointBuffer=gpu.makeBuffer(gl.ARRAY_BUFFER,new Float32Array([0,0,0]));
   paths=topology.links.map(link=>({...link,geometry:createPath(link.from.position,link.to.position,link.active)}));
   orbitPaths=topology.planets.map(planet=>({planet,geometry:createOrbit(planet.system,planet)}));
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
  gl.uniform1f(shader.kind,kind);
  gl.uniform1f(shader.time,time);
  gl.drawElements(gl.TRIANGLES,geometry.count,gl.UNSIGNED_SHORT,0);
 }
 function updateLabels(vp,w,h,t){
  allPick.length=0;
  for(const [system,label] of labels){
   const pos=projectionOf(system.position,vp,w,h);
   const visible=pos&&pos.visible&&pos.x>35&&pos.x<w-35&&pos.y>20&&pos.y<h-20;
   label.hidden=!visible;
   if(!visible)continue;
   const px=pos.x,py=pos.y;
   label.style.transform="translate3d("+Math.round(px)+"px,"+Math.round(py+Math.min(70,system.radius*130/pos.depth)+16)+"px,0) translate(-50%,0)";
   label.classList.toggle("is-focused",selectedKey===system.system.key);
   allPick.push({x:px,y:py,depth:pos.depth,kind:"system",key:system.system.key,
    radius:clamp(system.radius*600/pos.depth,21,56)});
  }
  if(focused&&!compact)for(const planet of topology.planets){
   if(planet.system.system.key!==selectedKey)continue;
   const pos=projectionOf(planetPosition(planet,t),vp,w,h);
   if(!pos||!pos.visible)continue;
   allPick.push({x:pos.x,y:pos.y,depth:pos.depth,kind:"token",token:planet.token,
    chain:planet.system.system.key,radius:clamp(planet.radius*700/pos.depth,16,30)});
  }
 }
 function draw(now){
  if(disposed||!visible||!gl)return;
  const dt=last?Math.min((now-last)/1000,.07):0;last=now;frame+=dt;
  const ease=1-Math.exp(-dt*7);
  camera.distance=mix(camera.distance,wanted.distance,ease);
  camera.yaw=mix(camera.yaw,wanted.yaw,ease);
  camera.pitch=mix(camera.pitch,wanted.pitch,ease);
  camera.target=camera.target.map((v,i)=>mix(v,wanted.target[i],ease));
  resize();
  const w=canvas.clientWidth||1,h=canvas.clientHeight||1;
  const eye=cameraEye(camera);
  const vp=matrixMultiply(perspective(Math.PI/3,canvas.width/canvas.height,.1,750),lookAt(eye,camera.target));
  viewProjection=vp;
  gl.viewport(0,0,canvas.width,canvas.height);
  gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  // Background stars stay subtly visible; their positions are true 3D points.
  gl.disable(gl.DEPTH_TEST);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
  const sp=gpu.sprites;
  gl.useProgram(sp.p);
  gl.bindBuffer(gl.ARRAY_BUFFER,stars.buffer);
  gl.enableVertexAttribArray(sp.pos);gl.vertexAttribPointer(sp.pos,3,gl.FLOAT,false,0,0);
  gl.uniformMatrix4fv(sp.vp,false,vp);gl.uniform4f(sp.color,.60,.73,.91,.43);
  gl.uniform1f(sp.size,1.7);gl.uniform1f(sp.fixed,1);gl.uniform1f(sp.background,1);
  gl.drawArrays(gl.POINTS,0,stars.count);
  // Soft additive stellar corona, kept restrained to the website palette.
  for(const item of topology.systems)point(item.position,item.radius*2600,item.color,item.portal?.23:.17,vp);
  gl.enable(gl.DEPTH_TEST);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  for(const link of paths)line(link.geometry,link.active?[.45,.88,.72]:[.43,.61,.84],link.active?.7:.40,vp);
  for(const ring of orbitPaths)line(ring.geometry,[.43,.55,.74],.18,vp);
  const entries=[];
  for(const item of topology.systems)entries.push({type:"star",item,depth:Math.hypot(...sub(item.position,eye))});
  for(const planet of topology.planets)entries.push({type:"planet",planet,position:planetPosition(planet,frame),depth:0});
  for(const entry of entries)if(entry.type==="planet")entry.depth=Math.hypot(...sub(entry.position,eye));
  entries.sort((a,b)=>b.depth-a.depth);
  for(const entry of entries){
   if(entry.type==="star"){
    const item=entry.item;
    body(gpu.sphere,item.position,item.radius,item.color,1,frame,IDENTITY,eye,vp);
   }else{
    const p=entry.planet;
    const col=p.system.color.map(v=>clamp(v*.64+.18,0,1));
    body(gpu.sphere,entry.position,p.radius,col,0,frame,IDENTITY,eye,vp);
   }
  }
  const hub=topology.byKey.get(HUB);
  if(hub){
   const c=hub.position;
   body(gpu.torus,c,4.0,[.68,.52,.31],2,frame,rotation(.5+frame*.028,.3,frame*.038),eye,vp);
   body(gpu.torus,c,3.27,[.57,.77,.86],2,frame,rotation(.20,-.38-frame*.022,-.25),eye,vp);
   body(gpu.torus,c,4.64,[.44,.62,.72],2,frame,rotation(.88,.56,frame*.014),eye,vp);
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
  canvas.addEventListener("contextmenu",e=>e.preventDefault(),{signal});
  canvas.addEventListener("wheel",e=>{e.preventDefault();zoom(e.deltaY>0?1:-1)},{passive:false,signal});
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
   else if(e.key.toLowerCase()==="h"||e.key==="Home")home();
   else return;
   e.preventDefault();
  };
  document.addEventListener("keydown",keys,{signal});
 }
 root.querySelectorAll("[data-cosmos-action]").forEach(button=>button.addEventListener("click",()=>{
  const action=button.dataset.cosmosAction;
  if(action==="home")home();
  if(action==="left")orbit(35,0);
  if(action==="right")orbit(-35,0);
  if(action==="up")orbit(0,35);
  if(action==="down")orbit(0,-35);
  if(action==="in")zoom(-2);
  if(action==="out")zoom(2);
  canvas.focus({preventScroll:true});
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
 const controller={
  focus(key){if(key===HUB)home();else focusKey(key);},
  orbit,zoom,pan,
  dispose(){
   disposed=true;stop();control.abort();
   observer?.disconnect();intersection?.disconnect();
   labels.forEach(([,node])=>node.remove());
   if(gpu)gpu.dispose();
   gpu=null;gl=null;
  }
 };
 root.dataset.selected=selectedKey;
 return controller;
}
