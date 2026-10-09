const endpoint="https://api.github.com/repos/xgr-network/xgr-interchain";
const labelPrefix="xita-status:";
async function request(path,method="GET",data){
 const token=process.env.XITA_GITHUB_TOKEN;
 if(!token)throw Error("XITA_GITHUB_TOKEN is not configured");
 const response=await fetch(endpoint+path,{method,headers:{
  "Accept":"application/vnd.github+json","Authorization":"Bearer "+token,
  "X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"
 },body:data?JSON.stringify(data):undefined});
 if(!response.ok)throw Error("GitHub HTTP "+response.status);
 return response.json();
}
export async function getJobs(){
 const issues=await request("/issues?state=open&per_page=100");
 return issues.filter(x=>!x.pull_request).map(x=>({
  number:x.number,title:x.title,url:x.html_url,labels:x.labels.map(y=>y.name),
  status:x.labels.find(y=>y.name.startsWith(labelPrefix))?.name.slice(labelPrefix.length)||"unclassified"
 }));
}
export async function recordJobEvent(number,status,evidence){
 if(!Number.isSafeInteger(number)||number<1)throw Error("Invalid issue");
 if(!["preflight","deployment","verification","validator-approval-required","blocked"].includes(status))
  throw Error("Status requires a different verified transition");
 if(typeof evidence!=="string"||evidence.length<12||evidence.length>1000)throw Error("Audit evidence required");
 const issue=await request("/issues/"+number);
 if(issue.pull_request)throw Error("Not a deployment issue");
 const body="XITA deployment workflow: **"+status+"**\n\n"+evidence;
 await request("/issues/"+number+"/comments","POST",{body});
 const labels=issue.labels.map(l=>l.name).filter(l=>!l.startsWith(labelPrefix));
 labels.push(labelPrefix+status);
 await request("/issues/"+number+"/labels","PUT",{labels});
 return {number,status};
}
