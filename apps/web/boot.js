// Classic script deliberately survives ES module MIME or import errors.
(function(){
 function reportFailure(){
  const app=document.getElementById("app");
  if(!app||app.dataset.ready==="1"||app.dataset.failed==="1")return;
  app.dataset.failed="1";
  app.innerHTML='<section class="ux-app ux-start-error"><div class="ux-kicker">XITA · Startup error</div><h1>Dashboard could not start</h1><p>JavaScript assets could not be loaded. Please check the published release and JavaScript MIME type.</p><button id="retry-xita-start" type="button" class="ux-outline-button">Reload dashboard</button></section>';
  document.getElementById("retry-xita-start")?.addEventListener("click",()=>location.reload());
 }
 window.addEventListener("load",()=>setTimeout(reportFailure,2300),{once:true});
})();
