import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {resolve,extname,sep} from "node:path";
import {fileURLToPath} from "node:url";
import {spawn,spawnSync} from "node:child_process";
import {isDeployedAsset,isPublicAsset} from "./listing-visibility.js";

const root=fileURLToPath(new URL(".",import.meta.url));
const types={".html":"text/html; charset=utf-8",".js":"application/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8"};
const browsers=[process.env.XITA_BROWSER,"google-chrome","chromium","chromium-browser"].filter(Boolean);
const executable=browsers.find(name=>{
 const result=spawnSync(name,["--version"],{encoding:"utf8",timeout:3000});
 return result.status===0;
});
function visit(browser,url,{mobile=false}={}){
 return new Promise((ok,fail)=>{
  // This smoke test verifies boot/navigation; the separate 3D snapshot tests
  // validate WebGL. Do not drive a perpetual software-GPU render loop here.
  const args=["--headless","--no-sandbox","--disable-gpu","--disable-webgl","--disable-dev-shm-usage",
    "--disable-extensions","--no-first-run","--disable-background-networking",
    "--virtual-time-budget=5000",...(mobile?["--window-size=390,844"]:[]),"--dump-dom",url];
  const child=spawn(browser,args,{stdio:["ignore","pipe","pipe"]});
  let output="",errors="";
  const timer=setTimeout(()=>{child.kill();fail(new Error("Chromium did not render page within 18 seconds: "+errors.slice(-1000)))},18000);
  child.stdout.setEncoding("utf8");
  child.stdout.on("data",v=>{output+=v});
  child.stderr.setEncoding("utf8");
  child.stderr.on("data",v=>{errors+=v});
  child.on("error",error=>{clearTimeout(timer);fail(error)});
  child.on("close",code=>{
   clearTimeout(timer);
   if(code!==0)fail(new Error("Browser exited "+code+": "+errors.slice(-1400)));
   else ok(output);
  });
 });
}

test("real browser renders all XITA pages from local JSON, not an endless splash", {timeout:70000},async()=>{
 assert.ok(executable,"Headless Chrome or Chromium required for UI startup smoke test");
 const localCatalog=JSON.parse(await readFile(resolve(root,"catalog.json"),"utf8"));
 const xgr=localCatalog.assets?.XGR;
 // A configured token may be pending, deployed but private, or publicly listed.
 // Derive the expected page from the same receipt/publication policy as the UI.
 const tokenPage=isPublicAsset("XGR",xgr,null,localCatalog)?"Project overview":
  isDeployedAsset(xgr,localCatalog)?"Token not publicly listed":"Token deployment pending";
 const requests=[];
 const server=createServer(async(request,response)=>{
  const pathname=new URL(request.url,"http://127.0.0.1").pathname;
  requests.push(pathname);
  if(pathname==="/api/xita/join/status"){
   response.writeHead(200,{"Content-Type":"application/json"});
   response.end('{"ok":true,"available":true}');return;
  }
  // In-memory fake Join responses: exercise actual SPA navigation without
  // sending an email or writing a token/application to GitHub.
  if(pathname==="/api/xita/join/preview"||pathname==="/api/xita/join/submit"){
   response.writeHead(200,{"Content-Type":"application/json"});
   response.end(pathname.endsWith("/preview")?
    '{"ok":true,"summary":{"name":"Example Token","symbol":"EXMP"},"files":[],"choices":[{"chain":"base","label":"Base","contract":"0x1234567890123456789012345678901234567890","decimals":18}],"profile":{"name":"Example Token","symbol":"EXMP","shortDescription":"A verified sample project imported from CoinGecko.","logoUrl":"https://example.org/logo.png"}}':
    '{"ok":true,"status":"pending-email"}');
   return;
  }
  if(pathname==="/api/xita/creator/register"){
   response.writeHead(202,{"Content-Type":"application/json"});
   response.end('{"ok":true,"status":"pending-email"}');return;
  }
  if(pathname.startsWith("/api/")){
   response.writeHead(503,{"Content-Type":"application/json"});
   response.end('{"ok":false,"error":"Not deployed"}');
   return;
  }
  const isPage=pathname==="/"||pathname==="/createtoken"||pathname==="/createtoken/submitted"||pathname==="/universe"||pathname==="/plan-route"||pathname==="/transfer"||pathname==="/faq"||pathname==="/contact"||pathname==="/token/xgr"||pathname==="/markets"||pathname==="/join"||pathname==="/profile-update"||pathname==="/join/confirm"||pathname==="/my-transfers";
  const target=isPage?"index.html":pathname.slice(1);
  const full=resolve(root,target);
  if(!full.startsWith(root.endsWith(sep)?root:root+sep)){
   response.writeHead(403);response.end();return;
  }
  try{
   let data=await readFile(full);
   if(pathname==="/join"&&new URL(request.url,"http://localhost").searchParams.has("test-interaction")){
    const probe=`<script>
     (function(){
      const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      const task=setInterval(async()=>{
       const app=document.querySelector("#app"),form=app?.querySelector("#ja-application-form");
        if(app?.dataset.ready!=="1")return;
        if(!form){
         app.querySelector('[data-join-entry="integrate"]')?.click();
         return;
        }
        if(!app.querySelector('[data-join-action="submit"]:not(:disabled)'))return;
       clearInterval(task);
       form.querySelector('[data-join-action="submit"]').click();
       await sleep(70);
       document.body.dataset.joinValidation=app.querySelector("#ja-status")?.textContent.includes("CoinGecko API ID")?"pass":"fail";
       const fill=(key,value)=>{
        const field=app.querySelector('[data-join="'+key+'"]');
        if(field){field.value=value;field.dispatchEvent(new Event("input",{bubbles:true}));}
       };
       fill("coingeckoId","example-token");
       fill("contactEmail","qa@example.org");
       const check=app.querySelector('[data-join="confirmed"]');
       if(check){check.checked=true;check.dispatchEvent(new Event("input",{bubbles:true}));}
       document.body.dataset.joinAdvance=app.querySelectorAll("#ja-application-form").length===1&&
        app.querySelector('[data-join="coingeckoId"]')&&
        app.querySelector('[data-join="contactEmail"]')&&
        !app.querySelector('[data-join="canonicalAddress"]')?"pass":"fail";
       app.querySelector('[data-join-action="preview"]')?.click();
       const poll=setInterval(async()=>{
        if(!app.textContent.includes("Imported from CoinGecko"))return;
        clearInterval(poll);
        app.querySelector('[data-join-action="submit"]')?.click();
        const receipt=setInterval(()=>{
         if(location.pathname!=="/join/submitted")return;
         clearInterval(receipt);
         document.body.dataset.joinReceipt=app.textContent.includes("One more step: confirm your email")?"pass":"fail";
         document.querySelector('a[aria-label="Join XITA for free"]')?.click();
         const landing=location.pathname==="/join"&&
           app.querySelector('[data-join-entry="integrate"]')&&
           !app.querySelector("#ja-application-form");
          app.querySelector('[data-join-entry="integrate"]')?.click();
          const fresh=app.querySelector("#ja-application-form");
          const empty=app.querySelector("#ja-coingeckoId")?.value===""&&
           app.querySelector("#ja-contactEmail")?.value===""&&
           app.querySelector('[data-join="confirmed"]')?.checked===false;
          document.body.dataset.joinReturn=landing&&fresh&&empty?"pass":"fail";
        },25);
       },25);
      },25);
     })();
     </script>`;
    data=Buffer.from(data.toString("utf8").replace("</body>",probe+"</body>"));
   }
   if(pathname==="/createtoken"&&new URL(request.url,"http://localhost").searchParams.has("test-interaction")){
    const probe=`<script>
    (function(){
     const timer=setInterval(async()=>{
      const form=document.querySelector("#xita-token-creator-form");
      if(!form||document.querySelector("#app")?.dataset.ready!=="1")return;
      clearInterval(timer);
      const fill=(key,value)=>{
       const input=form.querySelector('[data-creator="'+key+'"]');
       if(!input)return;
       input.value=value;
       input.dispatchEvent(new Event("input",{bubbles:true}));
      };
      fill("name","XITA Canary");
      fill("symbol","XITACAN");
      fill("initialSupply","1000");
      fill("ownerAddress","0x1234567890123456789012345678901234567890");
      fill("shortDescription","Internal XITA Canary token for tests.");
      fill("description","An internal XGRChain token used to validate email-confirmed creation and automated onboarding.");
      fill("website","https://xgr.network");
      fill("contactEmail","canary@example.org");
      const logo=form.querySelector("[data-creator-logo]");
      const canvas=document.createElement("canvas");
      canvas.width=16;canvas.height=16;
      canvas.getContext("2d").fillRect(0,0,16,16);
      const uri=canvas.toDataURL("image/png");
      const png=Uint8Array.from(atob(uri.split(",")[1]),c=>c.charCodeAt(0));
      const file=new File([png],"test.png",{type:"image/png"});
      const files=new DataTransfer();files.items.add(file);
      logo.files=files.files;
      logo.dispatchEvent(new Event("change",{bubbles:true}));
      document.body.dataset.creatorProbe="logo-selected";
      const ready=setInterval(()=>{
       if(!form.querySelector("#tc-logo-preview")?.getAttribute("src"))return;
       clearInterval(ready);
       document.body.dataset.creatorProbe="button-clicked";
       form.querySelector("#xita-creator-register").click();
       const check=setInterval(()=>{
        if(location.pathname==="/createtoken/submitted"){
         document.body.dataset.creatorReceipt=document.querySelector("#app")?.textContent.includes("Check your email.")?"pass":"fail";
         clearInterval(check);
        }
       },30);
       setTimeout(()=>{
        if(location.pathname!=="/createtoken/submitted"){
         document.body.dataset.creatorReceipt="fail";
         document.body.dataset.creatorError=document.querySelector("#tc-registration-status")?.textContent||"no validation message";
         clearInterval(check);
        }
       },1250);
      },30);
     },25);
    })();
    </script>`;
    data=Buffer.from(data.toString("utf8").replace("</body>",probe+"</body>"));
   }
   response.writeHead(200,{"Content-Type":types[extname(full)]||"application/octet-stream","Cache-Control":"no-store"});
   response.end(data);
  }catch{
   response.writeHead(404);response.end("Missing static asset: "+target);
  }
 });
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 try{
  const origin="http://127.0.0.1:"+server.address().port;
  for(const [path,expected] of [["/","XGR Interchain"],["/universe","Explore the Universe."],["/transfer","Transfer Tokens"],["/faq","Understand XITA."],["/token/xgr",tokenPage],["/markets","Explore Tokens"],["/join","Bring your token into the Universe"],["/my-transfers","XGR Interchain"]]){
   const html=await visit(executable,origin+path);
   assert.match(html,/data-ready="1"/,path+" did not initialize from catalog.json");
   assert.ok(html.replace(/<[^>]*>/g," ").replace(/\s+/g," ").includes(expected.replace(/\s+/g," ")),path+" missing expected page "+expected);
   assert.doesNotMatch(html,/Dashboard could not start|Dashboard unavailable/,path+" failed to bootstrap");
   assert.match(html,/id="my-transfers-link"[^>]*hidden/,path+" must hide My Transfers without connected wallet");
   if(path==="/my-transfers")assert.doesNotMatch(html,/ux-my-transfers/, "Unconnected deep link must not reveal transfer view");
   if(path==="/universe"){assert.match(html,/ux-3d-canvas/,"Legacy universe should resolve to the dashboard");}
   if(path==="/")assert.doesNotMatch(html,/class="[^"]*xita-subpage-planet/, "Dashboard must not show the decorative planet");
   if(["/transfer","/faq","/markets","/join","/token/xgr"].includes(path)){
    assert.match(html,/class="[^"]*xita-subpage-planet/,path+" must show decorative background planet");
   }
   if(path==="/transfer"){assert.match(html,/id="ux-origin"/);assert.match(html,/id="ux-asset"/);assert.match(html,/id="ux-destination"/);assert.match(html,/id="xita-transfer-primary"/);assert.doesNotMatch(html,/id="ux-token-origin"/);}
   if(path==="/faq"){assert.match(html,/ux-faq-list/);assert.match(html,/configured/i);}
   if(path==="/join"){
     assert.match(html,/data-join-entry="integrate"/);
     assert.match(html,/Integrate a Token/);
     assert.match(html,/Create a Token/);
     assert.match(html,/Update Token Profile/);
     assert.doesNotMatch(html,/id="ja-application-form"|data-join-action="submit"/,
      "The integration form must not appear before choosing a path");
    }
   if(path==="/markets"){assert.match(html,/data-leader-sort="lockedUsd"/);assert.match(html,/data-leader-sort="movedUsd"/);assert.match(html,/data-leader-sort="marketCapUsd"/);assert.match(html,/Explore Tokens|Explore <span>Tokens<\/span>/); }
   if(path==="/"){
    assert.match(html,/<canvas[^>]+ux-3d-canvas/,path+" missing 3D scene");
    assert.match(html,/data-cosmos-action="home"/,path+" missing XGR home navigation");
    assert.doesNotMatch(html,/Published directed routes|View all routes/,path+" has redundant route list");
    assert.doesNotMatch(html,/data-cosmos-action="left"/,path+" should not require arrow buttons");
    assert.match(html,/ux-3d-hint/,path+" missing mouse guidance");
    assert.match(html,/ux-alliance-intro/,path+" missing Alliance explainer");
    assert.match(html,/ux-dashboard-ranking/,path+" missing sourced token ranking");
    assert.doesNotMatch(html,/id="ux-journey-planner"|id="ux-origin"/,path+" contains duplicate planner");

    assert.match(html,/data-renderer="(webgl|fallback)"/,path+" did not initialize WebGL or graceful fallback");
   }
  }
  const creatorPage=await visit(executable,origin+"/createtoken");
  assert.match(creatorPage,/id="xita-creator-register"/,"Creator form must load");
  assert.doesNotMatch(creatorPage,/data-creator="applicantRole"|data-creator="projectConfirmed"|data-creator="accepted"/,
   "Creator does not require applicant authority declarations or redundant checkboxes");
  const receipt=await visit(executable,origin+"/createtoken/submitted");
  assert.match(receipt,/Check your email/,"Creator submission receipt page must load directly");
  const creatorProbe=await visit(executable,origin+"/createtoken?test-interaction=1");
  assert.match(creatorProbe,/data-creator-receipt="pass"/,
   "Creator browser must navigate after successful form submission; probe "+(creatorProbe.match(/data-creator-probe="[^"]*"/)?.[0]||"missing")+
   " error "+(creatorProbe.match(/data-creator-error="[^"]*"/)?.[0]||"missing"));
  assert.ok(requests.includes("/api/xita/creator/register"),
   "Creator browser regression must submit the mocked email registration");
  const mobile=await visit(executable,origin+"/",{mobile:true});
  assert.match(mobile,/data-mobile-universe="static"/,
   "Phone viewport must never initialize the interactive WebGL Universe");
  assert.match(mobile,/data-renderer="static"/,
   "Mobile Universe is a static illustration, not a WebGL fallback");
  assert.match(mobile,/ux-ns-mobile-art/,
   "Mobile hero must include a decorative, noninteractive visual");
  const joinProbe=await visit(executable,origin+"/join?test-interaction=1");
  assert.match(joinProbe,/data-join-validation="pass"/,"Submit must show inline field errors for invalid inputs");
  assert.match(joinProbe,/data-join-advance="pass"/,"Single-page sections must persist after valid inputs");
  assert.match(joinProbe,/data-join-receipt="pass"/,"Mocked submission must reach the email-confirmation receipt");
  assert.match(joinProbe,/data-join-return="pass"/,"Join for Free must reset to the two-path landing, then offer a new blank form");
  assert.ok(requests.includes("/api/xita/join/preview")&&requests.includes("/api/xita/join/submit"),
   "Browser regression must actually exercise the mocked preview and submit endpoints");
  assert.ok(requests.filter(x=>x==="/catalog.json").length>=3,"Local catalog.json not requested for each direct URL");
  assert.ok(!requests.some(x=>x.endsWith(".mjs")),"Browser requested an old .mjs asset");
  for(const name of ["/app.js","/experience.js","/wallet-core.js","/wallet-gas.js","/wallet-transfers.js","/wallet-token-balances.js","/transfer-actions.js","/transfer-page.js","/ui-data.js"])assert.ok(requests.includes(name),"Missing browser module "+name);
 }finally{
  await new Promise(ok=>server.close(ok));
 }
});


test("real browser reconnects wallet and opens pending transfer without TX input", {timeout:60000},async()=>{
 assert.ok(executable,"Headless Chrome or Chromium required for reconnect smoke test");
 const wallet="0x"+"a".repeat(40),txHash="0x"+"c".repeat(64);
 const record={account:wallet,sourceChain:"base",destinationChain:"xgrchain",
  asset:"XGR",routeName:"base_to_xgr",txHash,
  routeId:"0x"+"b".repeat(64),messageId:"0x"+"d".repeat(64),
  confirmed:true,delivered:false,status:"awaiting-proof"};
 const walletResponse={ok:true,kind:"xita-wallet-transfer-index-v1",
  status:"partial",wallet,items:[record],openCount:1,unknownCount:0,
  coverage:{complete:false,indexedRoutes:0,requiredRoutes:2,routes:[]}};
 const received=[];
 const server=createServer(async(request,response)=>{
  const parsed=new URL(request.url,"http://127.0.0.1");
  const path=parsed.pathname;
  received.push(path);
  if(path==="/api/xeta/v1/transfers/wallet"){
   response.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});
   response.end(JSON.stringify(walletResponse));return;
  }
  if(path.startsWith("/api/")){
   response.writeHead(503,{"Content-Type":"application/json"});
   response.end('{"ok":false,"error":"No test-side signing service"}');return;
  }
  const page=path==="/transfer"||path==="/my-transfers"||path==="/";
  const full=resolve(root,page?"index.html":path.slice(1));
  if(!full.startsWith(root.endsWith(sep)?root:root+sep)){
   response.writeHead(403);response.end();return;
  }
  try{
   let content=await readFile(full);
   if(page){
    const walletMock='<script>'+
     'window.ethereum={on:function(){},request:async function(x){'+
     'if(x.method==="eth_accounts"){document.body.dataset.passiveWallet="yes";return ["'+wallet+'"];}'+
     'if(x.method==="eth_requestAccounts"||x.method==="eth_sendTransaction"){document.body.dataset.unwantedWalletPrompt="yes";throw Error("No permission or signing allowed");}'+
     'if(x.method==="eth_chainId")return "0x2105";'+
     'if(x.method==="eth_getBalance")return "0x0";'+
     'if(x.method==="eth_call")return "0x"+"0".repeat(64);'+
     'return "0x0";}};'+
     '</script>';
    content=Buffer.from(content.toString("utf8").replace("</head>",walletMock+"</head>"));
    if(path==="/my-transfers"){
     const layoutProbe='<script>(function(){const task=setInterval(function(){'+
      'const page=document.querySelector(".ux-my-transfers");'+
      'const intro=page?.querySelector(".ux-my-transfers-intro");'+
      'const description=intro?.querySelector(".ux-muted");'+
      'if(!page||!intro||!description)return;clearInterval(task);'+
      'const style=getComputedStyle(intro);'+
      'const wide=description.getBoundingClientRect().width>=page.getBoundingClientRect().width*.7;'+
      'document.body.dataset.myTransfersLayout=style.display==="block"&&style.position!=="sticky"&&wide?"pass":"fail";'+
      '},25);})();</script>';
     content=Buffer.from(content.toString("utf8").replace("</body>",layoutProbe+"</body>"));
    }
   }
   response.writeHead(200,{"Content-Type":types[extname(full)]||"application/octet-stream",
    "Cache-Control":"no-store"});
   response.end(content);
  }catch{
   response.writeHead(404);response.end("Missing static asset: "+path);
  }
 });
 await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
 try{
  const origin="http://127.0.0.1:"+server.address().port;
  const history=await visit(executable,origin+"/my-transfers");
  assert.match(history,/data-passive-wallet="yes"/);
  assert.doesNotMatch(history,/data-unwanted-wallet-prompt="yes"/);
  assert.match(history,/class="ux-app ux-my-transfers"/,
   "Authorized wallet must stay on My Transfers after fresh browser start");
  assert.match(history,/data-my-transfers-layout="pass"/,
   "My Transfers intro must render as a full-width normal block, not the sticky site-header flex row");
  assert.ok(history.includes(txHash),"Wallet index must rediscover pending source TX");
  assert.match(history,/&amp;resume=0x[c]{64}/,
   "Resume link must include exact verified source TX identity");
  const transfer=await visit(executable,origin+"/transfer?token=XGR&resume="+txHash);
  assert.match(transfer,/data-passive-wallet="yes"/);
  assert.doesNotMatch(transfer,/data-unwanted-wallet-prompt="yes"/);
  assert.match(transfer,/Continue transfer · view status/);
  assert.match(transfer,/id="xita-open-transfer"/);
  assert.ok(transfer.includes(txHash),"Existing transfer must be selected by exact TX");
  assert.ok(received.filter(path=>path==="/api/xeta/v1/transfers/wallet").length>=2,
   "Wallet history API must be queried after both independent browser starts");
 }finally{await new Promise(done=>server.close(done));}
});
