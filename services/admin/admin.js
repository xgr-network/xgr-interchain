const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function get(p){const r=await fetch(p,{cache:"no-store"});if(!r.ok)throw Error("HTTP "+r.status);return r.json()}
async function loadPlan(){const box=document.getElementById("steps");try{const data=await get("/admin/api/plan");box.innerHTML=data.steps.map(s=>'<article><strong>'+s.order+' · '+esc(s.id)+'</strong><p>'+esc(s.description)+'</p><small>'+esc(s.chain)+' / '+esc(s.kind)+' · prerequisites: '+esc(s.dependsOn.join(", ")||"none")+'</small>'+(s.command?'<pre>'+esc(s.command)+'</pre>':"")+(s.mandatoryProof?'<p>Independent verification required</p>':"")+'</article>').join("")}catch(e){box.textContent="Cannot load plan: "+e.message}}
async function check(){const box=document.getElementById("preflight");box.textContent="Checking…";try{const data=await get("/admin/api/preflight");box.innerHTML=data.results.map(r=>'<article><strong>'+esc(r.name)+'</strong><p>Chain ID: '+(r.chainIdOk?"OK":"Not verified")+' · Mailbox: '+(r.mailboxCode?"OK":"Not verified")+' · Hook: '+(r.hookCode?"OK":"Not verified")+'</p>'+(r.error?'<small>'+esc(r.error)+'</small>':"")+'</article>').join("")+'<p>'+esc(data.note)+'</p>'}catch(e){box.textContent="RPC checks unavailable: "+e.message}}
document.getElementById("refresh").addEventListener("click",check);loadPlan();
async function loadJobs(){
 const node=document.getElementById("jobs");node.textContent="Loading GitHub issues…";
 try{
  const data=await get("/admin/api/jobs");
  if(!data.jobs.length){node.textContent="No open work items in GitHub.";return}
  node.innerHTML=data.jobs.map(j=>'<article><a target="_blank" rel="noopener noreferrer" href="'+esc(j.url)+'">#'+j.number+' · '+esc(j.title)+'</a><p>Status: '+esc(j.status)+'</p>'+
   '<select data-status="'+j.number+'"><option value="">Choose verified update</option>'+
   ['preflight','deployment','verification','validator-approval-required','blocked'].map(x=>'<option value="'+x+'">'+x+'</option>').join('')+'</select>'+
   '<input data-evidence="'+j.number+'" placeholder="Audit evidence / transaction ID or link" minlength="12" maxlength="1000">'+
   '<button data-update="'+j.number+'" type="button">Record in GitHub</button></article>').join("");
  node.querySelectorAll("button[data-update]").forEach(b=>b.addEventListener("click",async()=>{
   const id=b.dataset.update,status=node.querySelector('[data-status="'+id+'"]').value;
   const evidence=node.querySelector('[data-evidence="'+id+'"]').value.trim();
   if(!status||evidence.length<12){alert("Select a status and provide supporting evidence.");return}
   b.disabled=true;
   try{const response=await fetch("/admin/api/jobs/status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({number:Number(id),status,evidence})});
    const payload=await response.json();if(!response.ok)throw Error(payload.error||"GitHub update failed");
    await loadJobs();
   }catch(e){alert(e.message)}finally{b.disabled=false}
  }));
 }catch(e){node.textContent="GitHub queue unavailable: "+e.message}
}
document.getElementById("load-jobs").addEventListener("click",loadJobs);
document.getElementById("connect-wallet").addEventListener("click",async()=>{
 try{const addr=await connectDeploymentWallet();document.getElementById("wallet-status").textContent=" Connected: "+addr.slice(0,8)+"…"+addr.slice(-4)}
 catch(e){document.getElementById("wallet-status").textContent=e.message}
});
loadJobs();
