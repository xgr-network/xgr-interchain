const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const url=x=>{try{const u=new URL(x);return u.protocol==="https:"&&u.hostname==="xita.xgr.network"||u.protocol==="https:"&&u.hostname==="github.com"&&u.pathname.startsWith("/xgr-network/xgr-interchain/pull/")?u.href:null}catch{return null}};
export function applicationMail({title,subtitle,paragraphs=[],action=null,footer="This email concerns your XITA application, not marketing."}){
 const text=[title,subtitle,...paragraphs,action?.url?((action.label||"View details")+": "+action.url):"",footer].filter(Boolean).join("\n\n");
 const link=action&&url(action.url);
 const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'+
 '<body style="margin:0;padding:30px 12px;background:#050d1b;color:#eaf2ff;font:15px/1.7 Arial,Helvetica,sans-serif"><table role="presentation" style="width:100%;max-width:620px;margin:auto;border-collapse:collapse;background:#0d1a2c;border:1px solid #324a69;border-radius:14px"><tr><td style="padding:30px">'+
 '<div style="font-size:12px;font-weight:bold;letter-spacing:3px;color:#b9d9fa">XITA <span style="color:#ba9d69">·</span> INTERCHAIN UNIVERSE</div>'+
 '<h1 style="font-size:30px;line-height:1.2;margin:22px 0 8px;font-weight:normal;color:#fff">'+escape(title)+'</h1>'+
 '<p style="font-size:17px;color:#bed6f2;margin:0 0 22px">'+escape(subtitle)+'</p>'+
 paragraphs.map(p=>'<p style="margin:0 0 16px;color:#e0eafa">'+escape(p)+'</p>').join("")+
 (link?'<p style="margin:28px 0"><a href="'+escape(link)+'" style="background:#e5f2ff;color:#08182d;text-decoration:none;padding:13px 21px;border-radius:8px;font-weight:bold;display:inline-block">'+escape(action.label||"View details")+' &#8594;</a></p>':'')+
 '<p style="border-top:1px solid #324a69;padding-top:18px;margin:26px 0 0;color:#94afce;font-size:12px">'+escape(footer)+'</p>'+
 '</td></tr></table></body></html>';
 return {text,html};
}
