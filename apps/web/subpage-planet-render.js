export function mountSubpagePlanet(){
 const old=document.querySelector("#xita-subpage-planet");
 if(!document.body.classList.contains("xita-subpage-planet")){old?.remove();return}
 if(old)return;
 const canvas=document.createElement("canvas");canvas.id="xita-subpage-planet";canvas.width=720;canvas.height=720;canvas.setAttribute("aria-hidden","true");
 document.body.insertBefore(canvas,document.querySelector("#app"));
 const load=url=>new Promise((ok,fail)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=fail;im.src=url});
 Promise.all(["/planet-day.jpg","/planet-night.jpg","/planet-clouds.jpg"].map(load)).then(images=>{
  if(!canvas.isConnected)return;
  const tex=images.map(im=>{const c=document.createElement("canvas");c.width=im.width;c.height=im.height;const x=c.getContext("2d",{willReadFrequently:true});x.drawImage(im,0,0);return {data:x.getImageData(0,0,c.width,c.height).data,w:c.width,h:c.height}});
  const w=720,r=333,center=360,ctx=canvas.getContext("2d"),frame=ctx.createImageData(w,w),dst=frame.data;
  const sample=(t,u,v)=>{const x=Math.floor(Math.max(0,Math.min(1,u))*(t.w-1)),y=Math.floor(Math.max(0,Math.min(1,v))*(t.h-1)),i=4*(y*t.w+x);return [t.data[i],t.data[i+1],t.data[i+2]]};
  const yaw=-1.25,pitch=.22,cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  for(let y=0;y<w;y++)for(let x=0;x<w;x++){
   const nx=(x-center)/r,ny=(center-y)/r,d=nx*nx+ny*ny;if(d>1)continue;
   const z=Math.sqrt(1-d),py=ny*cp-z*sp,pz=ny*sp+z*cp,px=nx*cy+pz*sy,pzz=-nx*sy+pz*cy;
   const u=(Math.atan2(px,pzz)/(2*Math.PI)+1.5)%1,v=Math.acos(Math.max(-1,Math.min(1,py)))/Math.PI;
   const day=sample(tex[0],u,v),night=sample(tex[1],u,v),cloud=sample(tex[2],u,v);
   const sun=Math.pow(Math.max(0,Math.min(1,(nx*.29+ny*.83+z*.43-.12)*1.25)),1.2)*.50;
   const city=Math.min(1,Math.pow(night[0]/255,1.55)*3.7),cloudLight=Math.max(0,(cloud[0]-95)/160)*sun*.40;
   const edge=Math.pow(1-z,11)*.43,i=4*(y*w+x);
   dst[i]=Math.min(255,day[0]*sun+night[0]*city*.85+cloudLight*100+edge*135+5);
   dst[i+1]=Math.min(255,day[1]*sun+night[0]*city*.67+cloudLight*135+edge*183+12);
   dst[i+2]=Math.min(255,day[2]*sun+night[0]*city*.35+cloudLight*167+edge*230+27);
   dst[i+3]=255;
  }
  ctx.putImageData(frame,0,0);ctx.strokeStyle="rgba(135,205,255,.60)";ctx.lineWidth=2;ctx.beginPath();ctx.arc(center,center,r,0,Math.PI*2);ctx.stroke();
 }).catch(()=>canvas.remove());
}