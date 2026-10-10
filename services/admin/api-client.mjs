// Shared Admin HTTP boundary: never parse proxy/auth HTML as API JSON.
function reasonFor(status){
 if(status===504)return "Nginx-Zeitlimit (504): RPC/BLS-Pruefung dauert laenger als das Proxy-Limit";
 if(status===502||status===503)return "Admin-Backend nicht erreichbar oder gerade neu gestartet";
 if(status===401||status===403)return "Nginx-Anmeldung/Autorisierung abgelaufen oder verweigert";
 if(status===404)return "API-Pfad nicht ans Admin-Backend geroutet";
 return "Nginx/Proxy/API antwortet nicht mit JSON";
}
export async function apiJSON(fetcher,path,{method="GET",data}={}){
 const options={method,cache:"no-store",headers:{Accept:"application/json"}};
 if(data!==undefined){
  options.headers["Content-Type"]="application/json";
  options.body=JSON.stringify(data);
 }
 let response;
 try{response=await fetcher(path,options)}
 catch(e){throw Error("Admin-API "+path+": Netzwerkfehler: "+String(e.message||e))}
 const type=response.headers.get("content-type")||"";
 if(!/^application\/(?:[a-z0-9.-]+\+)?json\b/i.test(type)){
  throw Error("Admin-API "+path+": HTTP "+response.status+" ("+reasonFor(response.status)+"). "+
   "Erwartet JSON, erhalten "+(type||"unbekannten Content-Type")+
   ". Pruefe Nginx-Proxy und xita-admin.service; es wurde keine Wallet-Transaktion gestartet.");
 }
 let parsed;
 try{parsed=await response.json()}
 catch{throw Error("Admin-API "+path+": HTTP "+response.status+" liefert ungueltiges JSON");}
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))
  throw Error("Admin-API "+path+": unerwartetes JSON-Format");
 if(!response.ok||parsed.ok===false)
  throw Error("Admin-API "+path+": HTTP "+response.status+": "+String(parsed.error||"API-Pruefung fehlgeschlagen"));
 return parsed;
}
