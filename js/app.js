/* Outbound OS core (product build, BYO leads) */
let LEADS=[];                       /* BYO leads: imported by the user */
const LKEY="outbound_os_leads_v1";
const DHASH="byo-v1";
const KEY="outbound_os_v1";
function loadLeads(){try{LEADS=JSON.parse(localStorage.getItem(LKEY))||[]}catch(e){LEADS=[]}indexLeads()}
let _storageWarned=false;
function storageWarn(){if(_storageWarned)return;_storageWarned=true;
  try{toast("<b>Storage full.</b> Export a backup from the ⋯ menu to be safe.")}catch(e){}}
function saveLeads(){try{localStorage.setItem(LKEY,JSON.stringify(LEADS))}catch(e){storageWarn()}}
let S;
try{S=JSON.parse(localStorage.getItem(KEY))||{}}catch(e){S={}}
S.leads=S.leads||{}; S.events=S.events||[];
S.segs=S.segs||{};
let SEG=S.segs;
const SEGPAL=["#007AFF","#34C759","#AF52DE","#FF2D55","#5856D6","#30B0C7","#64D2FF","#8E8E93"];
function renderSegCss(){let el=document.getElementById("segcss");
  if(!el){el=document.createElement("style");el.id="segcss";document.head.append(el)}
  el.textContent=Object.keys(SEG).map(k=>
    `.seg-${k}{background:${SEG[k].color}22;color:${SEG[k].color}}`).join("\n")}
function TGT(){S.targets=S.targets||{req:20,reach:15,post:1};return S.targets}
const TPLOF=p=>(typeof TPL!=="undefined"&&(TPL[p]||TPL.default))||{conn:"",m1:"",f1:"",f2:""};
const $=q=>document.querySelector(q);
let byId={};
function indexLeads(){byId={};LEADS.forEach(l=>{byId[l.id]=l;
  l._s=(l.name+" "+l.co+" "+l.title).toLowerCase()})}
const DAY=86400000;
const daysAgo=t=>t?Math.floor((Date.now()-t)/DAY):null;
const STAGES=["Replied","Call booked","Meeting done","Proposal sent","Agreement sent","Won","Lost"];
const STATUSES=["Connection pending","In sequence","Replied","Meeting booked",
                "Client won","Not interested","No response"];
const stClass=s=>({"Connection pending":"st-conn","In sequence":"st-seq","Replied":"st-rep",
  "Meeting booked":"st-meet","Client won":"st-won","Not interested":"st-no",
  "No response":"st-none"}[s]||"");
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
/* only ever treat http(s) links as clickable — blocks javascript:/data: URLs from imported lists */
const safeUrl=u=>{u=String(u==null?"":u).trim();return /^https?:\/\//i.test(u)?u:""};
const L=id=>S.leads[id]||(S.leads[id]={});
const money=n=>"$"+(+n).toLocaleString();
let saveT;
function save(){_dirty=true;clearTimeout(saveT);saveT=setTimeout(()=>{
  for(const k in S.leads)if(Object.keys(S.leads[k]).length===0)delete S.leads[k];
  try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){storageWarn();return}
  const sd=$("#saved");sd.classList.add("ok");
  clearTimeout(sd._t);sd._t=setTimeout(()=>sd.classList.remove("ok"),1500);
},120)}
function ev(id,txt,kind,a){S.eseq=(S.eseq||0)+1;
  const e={i:S.eseq,t:Date.now(),id,txt,k:kind||"",a:a||""};
  S.events.unshift(e);
  if(S.events.length>2000)S.events.length=2000;
  return e}
function toast(html,undoFn){const t=document.createElement("div");
  t.className="toast"+(undoFn?" hasundo":"");
  t.innerHTML=html+(undoFn?' <button class="undob">UNDO</button>':"");
  const box=$("#toasts");
  while(box.children.length>=3)box.firstChild.remove();   /* cap the pile */
  box.append(t);
  if(undoFn){const b=t.querySelector(".undob");
    b.onclick=()=>{undoFn();t.remove()}}
  setTimeout(()=>t.remove(),undoFn?5000:2800)}
function flashRow(id){const tr=$("#tbody").querySelector(`tr[data-id="${id}"]`);
  if(tr){tr.classList.remove("flash");void tr.offsetWidth;tr.classList.add("flash")}}

/* ---------- single source of truth for actions ---------- */
const FL={conn:"Connection",msg1:"Message 1",fu1:"Follow-up 1",fu2:"Follow-up 2",
          st:"Status",stage:"Pipeline",rtype:"Reply type"};
const SIDE_KEYS=["st","stage","st_evi","ans_t","stage_t","won_t","rtype","withdrawn_t"];
function applyAction(id,f,o,toggle){
  const st=L(id);
  /* diff snapshot: ONLY the keys this action can touch — later actions survive undo */
  const touched=[f,f+"_t",f+"_evi",...SIDE_KEYS];
  const before={};touched.forEach(k=>before[k]=st[k]);
  const prevSt=st.st||"";
  const prev=st[f]||"";
  st[f]=(toggle&&prev===o)?"":o;
  const val=st[f]||"";
  if(prev===val)return;
  /* withdraw a stale request: keep the original send in the ledger, drop it from pending */
  if(f==="conn"&&val==="Withdrawn"){st.withdrawn_t=Date.now();st.st="";}
  /* re-send after a withdrawal: fresh request, the old send stays as history */
  if(f==="conn"&&prev==="Withdrawn"&&val==="Sent"){delete st.conn_evi;delete st.conn_t;delete st.withdrawn_t;}
  /* ball-in-court: first action on a replied lead answers the reply */
  if(prevSt==="Replied"&&!st.ans_t)st.ans_t=Date.now();
  if(f==="rtype"){
    ev(id,val?("reply tagged: "+(REPLY[val]?REPLY[val].label:val)):"reply tag cleared","","");
    save();toast(`<b>${esc(byId[id].co)}</b> — ${val?"reply tagged":"tag cleared"}`,
      ()=>{const cur=L(id);touched.forEach(k=>{if(before[k]===undefined)delete cur[k];else cur[k]=before[k]});save();refresh(id)});
    refresh(id);return}
  const isStep=["conn","msg1","fu1","fu2"].includes(f);
  if(isStep){if(val){if(!st[f+"_t"])st[f+"_t"]=Date.now()}else delete st[f+"_t"]}
  /* ---- side effects, symmetric both ways ---- */
  if(f==="conn"&&val==="Sent"&&!st.st)st.st="Connection pending";
  if(f==="conn"&&val==="Accepted"&&(!st.st||st.st==="Connection pending"||st.st==="No response"))st.st="In sequence";
  if(f==="msg1"&&val==="Sent"&&(!st.st||st.st==="Connection pending"))st.st="In sequence";
  if(f==="st"&&val==="Replied"&&!st.stage)st.stage="Replied";
  if(f==="st"&&prev==="Replied"&&!val&&st.stage==="Replied"&&!st.val&&!st.nstep)delete st.stage;
  if(f==="stage"){
    if(val)st.stage_t=Date.now(); else delete st.stage_t;
    if(val==="Won"&&!st.won_t)st.won_t=Date.now();
    if(prev==="Won"&&val!=="Won")delete st.won_t;
    if(val==="Won")st.st="Client won";
    if(prev==="Won"&&val&&val!=="Won"&&st.st==="Client won")st.st="Meeting booked";
    if((val==="Call booked"||val==="Meeting done")&&st.st!=="Client won")st.st="Meeting booked";
    if(val==="Lost"&&st.st!=="Client won")st.st="Not interested";
  }
  /* ---- truthful event ledger: a counted event exists iff the action is real ---- */
  const erased=[];
  const erase=k=>{if(st[k]){const gone=S.events.filter(x=>x.i===st[k]&&x.id===id);
    S.events=S.events.filter(x=>!(x.i===st[k]&&x.id===id));erased.push(...gone);delete st[k]}};
  let minted=null;
  if(isStep){
    if(val==="Sent"&&!st[f+"_evi"]){
      minted=ev(id,FL[f]+" → Sent","out",f==="conn"?"req":"reach");st[f+"_evi"]=minted.i}
    if(f==="conn"?(val===""||val==="Skipped"):(val!=="Sent"))erase(f+"_evi");
  }
  if(f==="st"){
    if(val==="Replied"&&!st.st_evi){minted=ev(id,"status → Replied","reply","");st.st_evi=minted.i}
    if(prev==="Replied"&&val===""){erase("st_evi");delete st.ans_t;delete st.rtype}
  }
  if(!minted)ev(id,(f==="st"?"status → ":FL[f]+" → ")+(val||"cleared"),"","");
  if(erased.length)resealCheck(erased);
  if(f==="stage"&&val==="Won")
    toast(`<span style="color:#AF52DE">${I("trophy")}</span> <b>CLIENT WON</b> — ${esc(byId[id].co)}${st.val?" · "+money(st.val):""}. That's the whole point of all this.`);
  save();
  toast(`<b>${esc(byId[id].co)}</b> — ${FL[f]||f} → ${val||"cleared"}`,
    ()=>{const cur=L(id);
      touched.forEach(k=>{if(before[k]===undefined)delete cur[k];else cur[k]=before[k]});
      if(minted)S.events=S.events.filter(x=>x!==minted);
      if(erased.length){S.events.push(...erased);S.events.sort((a,b)=>b.t-a.t)}
      if(minted)resealCheck([minted]);
      if(focusActive){focusDone=Math.max(0,focusDone-1);
        const qi=focusQueue.indexOf(id);if(qi>-1)focusIdx=Math.min(focusIdx,qi)}
      save();refresh(id)});
  refresh(id);
}
/* B14/B17: a sealed day may never claim counts its ledger no longer backs */
function countsOnDay(dk){let req=0,reach=0;
  S.events.forEach(e=>{if(dayKey(new Date(e.t))!==dk)return;
    if(e.a==="req")req++;if(e.a==="reach")reach++});
  return {req,reach}}
function resealCheck(evts){
  S.days=S.days||{};
  const dks=[...new Set(evts.map(e=>dayKey(new Date(e.t))))];
  dks.forEach(dk=>{const rec=S.days[dk];if(!rec)return;
    const t=countsOnDay(dk);
    /* a sealed day must stay backed by its ledger on BOTH counted dimensions */
    const reqOk=t.req>=Math.min(rec.req,TGT().req);
    const reachOk=t.reach>=Math.min(rec.reach||0,TGT().reach>0?1:0);
    if(!reqOk||!reachOk){delete S.days[dk];
      toast(`<b>Day ${dk} unsealed</b> — its counts changed. Streak recalculated.`);}
    else if(t.req!==rec.req||t.reach!==rec.reach)
      S.days[dk]={req:t.req,reach:t.reach,t:rec.t};});
}
function refresh(id){
  if(openId!=null)openDrawer(openId);
  if(!$("#v-leads").classList.contains("hidden")){
    applyFilter(id);renderRows(false);if(id)flashRow(id)}
  if(!$("#v-pipe").classList.contains("hidden"))pipe();
  if(!$("#v-dash").classList.contains("hidden"))dash();
  if(typeof focusActive!=="undefined"&&focusActive)focusRender();
  updateTicker();
}

/* ---------- views ---------- */
const VIEWS=["dash","leads","pipe","focus","clients","help"];
const TITLES={dash:["Today","#007AFF"],leads:["Leads","#1d1d1f"],
  pipe:["Pipeline","#9741C4"],focus:["Focus","#5856D6"],
  clients:["Clients","#1E9B4A"],help:["Help","#86868b"]};
function show(v){VIEWS.forEach(x=>{$("#v-"+x).classList.toggle("hidden",x!==v);
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("on",t.dataset.v===v))});
  const ti=TITLES[v]||["",""];$("#bigtitle").textContent=ti[0];$("#bigtitle").style.color=ti[1];
  if(v!=="leads")shown=Math.min(shown,PAGE);      /* don't let paging inflate forever */
  if(v==="dash"){chartAnimated=false;missionAnimated=false;dash()}
  if(v==="leads")renderRows(true); if(v==="pipe")pipe();
  if(v==="clients")renderClients();
  focusActive=(v==="focus"); if(focusActive)focusStart();}
document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>show(t.dataset.v));

/* ---------- next-action engine ---------- */
function nextAction(s){
  if(s.st==="Replied"&&!s.rtype)return {f:"rtype",o:"",lbl:"Handle reply"};
  if(["Replied","Meeting booked","Client won","Not interested","No response"].includes(s.st))return null;
  if(s.conn==="Withdrawn")return daysAgo(s.withdrawn_t)>=21?{f:"conn",o:"Sent",lbl:"✓ Re-sent request"}:null;
  if(s.conn==="Declined"||s.conn==="Skipped")return null;
  if(!s.conn)return {f:"conn",o:"Sent",lbl:"✓ Request sent"};
  if(s.conn==="Sent")return {f:"conn",o:"Accepted",lbl:"✓ They accepted"};
  /* truth gates: only offer what is genuinely sendable/due right now */
  if(s.conn==="Accepted"&&(!s.msg1||s.msg1==="Waiting"))return {f:"msg1",o:"Sent",lbl:"✓ Msg 1 sent"};
  if(s.msg1==="Sent"&&!s.fu1&&daysAgo(s.msg1_t)>=3)return {f:"fu1",o:"Sent",lbl:"✓ FU 1 sent"};
  if(s.fu1==="Sent"&&!s.fu2&&daysAgo(s.fu1_t)>=4)return {f:"fu2",o:"Sent",lbl:"✓ FU 2 sent"};
  return null;
}
function stageLabel(s){
  if(!s.conn&&!s.st)return "Not contacted";
  if(s.conn==="Sent")return "Request sent — awaiting accept";
  if(s.conn==="Declined")return "Request declined";
  if(s.conn==="Skipped")return "Skipped";
  if(s.conn==="Withdrawn")return daysAgo(s.withdrawn_t)>=21?"Withdrawn — clear to re-invite":"Withdrawn — re-invite in "+Math.max(0,21-daysAgo(s.withdrawn_t))+"d";
  if(s.msg1==="Skipped"||s.fu1==="Skipped"||s.fu2==="Skipped")return "Skipped";
  if(s.conn==="Accepted"&&!s.msg1)return "Connected — send Msg 1";
  if(s.msg1==="Sent"&&!s.fu1)return "Msg 1 sent"+(daysAgo(s.msg1_t)>=3?" — FU 1 due":"");
  if(s.fu1==="Sent"&&!s.fu2)return "FU 1 sent"+(daysAgo(s.fu1_t)>=4?" — FU 2 due":"");
  if(s.fu2==="Sent")return "Sequence complete";
  return s.st||"—";
}
function dotsHtml(s){
  const on=[s.conn==="Sent"||s.conn==="Accepted",s.msg1==="Sent",s.fu1==="Sent",s.fu2==="Sent"];
  return `<span class="dots">${on.map(x=>`<span class="dot ${x?"on":""}"></span>`).join("")}</span>`}

/* ---------- dashboard ---------- */
function counts(f){let c={total:0,conn:0,acc:0,msg1:0,rep:0,repMsg:0,meet:0,won:0,unt:0,pipeV:0,wonV:0};
  LEADS.forEach(l=>{if(f&&!f(l))return;const s=S.leads[l.id]||{};c.total++;
    if(["Sent","Accepted","Declined","Withdrawn"].includes(s.conn))c.conn++;
    if(s.conn==="Accepted")c.acc++;
    if(s.msg1==="Sent")c.msg1++;
    const isRep=["Replied","Meeting booked","Client won"].includes(s.st);
    if(isRep)c.rep++;
    if(isRep&&s.msg1==="Sent")c.repMsg++;
    if(["Meeting booked","Client won"].includes(s.st))c.meet++;
    if(s.st==="Client won")c.won++;
    if(!s.st&&!s.conn)c.unt++;
    const v=+s.val||0;
    if(s.stage&&!["Won","Lost"].includes(s.stage))c.open=(c.open||0)+1;
    if(s.stage&&s.stage!=="Lost"&&s.stage!=="Won")c.pipeV+=v;  /* open = not closed */
    if(s.stage==="Won")c.wonV+=v;});
  return c}
let _dirty=true,_cCache=null;
function countsCached(){if(_dirty||!_cCache){_cCache=counts();_dirty=false}return _cCache}
function dash(){
  const c=countsCached();
  const pct=(a,b)=>b?(" · "+(100*a/b).toFixed(1)+"%"):"";
  $("#tiles").innerHTML=[
    ["Leads",c.total,"across "+Object.keys(SEG).length+" segments","","users","#4BA3FF","#0A6AE8"],
    ["Requests",c.conn,"of "+c.total,"","send","#8183F4","#5155D6"],
    ["Accepted",c.acc,"accept rate"+pct(c.acc,c.conn),"","check","#4FC8F0","#1FA0D6"],
    ["Replied",c.rep,c.msg1>=10?((100*c.repMsg/c.msg1).toFixed(1)+"% of "+c.msg1+" messaged"):"reply rate"+pct(c.repMsg,c.msg1),"","chat","#46D66C","#1F9D44"],
    ["Meetings",c.meet,"booked or beyond","","calendar","#C77BF5","#9945E3"],
    ["Won",c.won,"clients closed","","trophy","#FF6482","#F2334E"],
    ["Pipeline $",money(c.pipeV),"open deal value","money","dollar","#35D07A","#0E9E5C"],
    ["Won $",money(c.wonV),"closed value","money","bank","#6A6A72","#44444B"],
  ].map(t=>`<div class="tile" style="--tg1:${t[5]};--tg2:${t[6]}">
    <div class="trow"><span class="ti">${I(t[4])}</span><span class="v ${t[3]}">${t[1]}</span></div>
    <div><div class="k">${t[0]}</div><div class="s">${t[2]}</div></div></div>`).join("");
  const ramp=["#8FC4FF","#63ADFF","#3F97FF","#1F84FF","#007AFF","#0058C7"];
  const steps=[["Leads",c.total],["Requests",c.conn],["Accepted",c.acc],
               ["Replied",c.rep],["Meetings",c.meet],["Won",c.won]];
  const mx=Math.max(1,c.total);
  $("#funnel").innerHTML=steps.map((s,i)=>`<div class="frow">
     <span class="lbl">${s[0]}</span>
     <div><div class="bar" data-tip="${s[0]}: ${s[1]}" style="width:${Math.max(1,100*s[1]/mx)}%;background:${ramp[i]}"></div></div>
     <span class="num">${s[1]}</span></div>`).join("");
  const pris=Object.keys(SEG);
  $("#segtbl").innerHTML=`<tr><th>Segment</th><th>Leads</th><th>Req</th><th>Acc</th>
    <th>Rep</th><th>Won</th><th>Untouched</th></tr>`+pris.map(p=>{
    const cc=counts(l=>l.pri===p);
    return `<tr><td><span class="chip seg-${p}">${p}</span> ${SEG[p].name}</td>
      <td>${cc.total}</td><td>${cc.conn}</td><td>${cc.acc}</td><td>${cc.rep}</td>
      <td>${cc.won}</td><td>${cc.unt}</td></tr>`}).join("");
  renderDue();renderChart();renderMomentum();
}
/* Recent activity lives in the ⋯ menu, off the dashboard */
function feedHTML(n){return S.events.slice(0,n).map(e=>{
    const l=byId[e.id];
    const dc=e.k==="reply"?"#34C759":e.a==="req"?"#007AFF":e.a==="reach"?"#AF52DE":e.a==="post"?"#FF2D55":"#c7c7cc";
    return `<div class="fitem" data-id="${e.id}">
      <span class="fdot" style="background:${dc}"></span>
      <span class="fco">${esc(l?l.co:"You")}</span>
      <span class="ftxt">${esc(e.txt)}</span>
      <time>${new Date(e.t).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</time></div>`
  }).join("")||'<div class="due-empty">No activity yet. Open LEADS and start.</div>'}
function openFeed(){
  if(document.getElementById("feedov"))return;
  const ov=document.createElement("div");
  ov.id="feedov";
  ov.style.cssText="position:fixed;inset:0;background:rgba(60,60,70,.28);backdrop-filter:blur(4px);z-index:45;display:flex;justify-content:center;align-items:flex-start;padding-top:7vh";
  ov.innerHTML=`<div class="fx-card" style="max-width:560px;width:100%;max-height:80vh;display:flex;flex-direction:column">
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <h2 style="font-family:var(--serif);font-size:22px">Recent activity</h2>
      <button class="tbtn" id="feedx">CLOSE</button></div>
    <div id="feed" style="overflow-y:auto;margin-top:10px"></div></div>`;
  document.body.append(ov);
  ov.querySelector("#feed").innerHTML=feedHTML(60);
  ov.querySelectorAll(".fitem").forEach(f=>f.onclick=()=>{ov.remove();openDrawer(+f.dataset.id)});
  ov.querySelector("#feedx").onclick=()=>ov.remove();
  ov.onclick=e=>{if(e.target===ov)ov.remove()};
}
const STAGE_LIMIT={"Replied":3,"Call booked":7,"Meeting done":4,"Proposal sent":5,"Agreement sent":5};
function replyHrs(s){const e=S.events.find(x=>x.i===s.st_evi);
  return e?Math.floor((Date.now()-e.t)/3600000):null}
function dueList(){const out=[];const today=dayKey(new Date());
  /* replies waiting on YOU come before everything */
  LEADS.forEach(l=>{const s=S.leads[l.id];if(!s)return;
    if(s.st==="Replied"&&!s.ans_t){const h=replyHrs(s);
      out.push({l,tag:"REPLY WAITING",ok:h!==null&&h<24?1:0,
        d:h===null?"answer them first":"waiting "+h+"h — answer within 24h"})}});
  LEADS.forEach(l=>{const s=S.leads[l.id];if(!s)return;
    if(s.conn==="Withdrawn"){if(daysAgo(s.withdrawn_t)>=21)
        out.push({l,tag:"RE-REQUEST",ok:1,d:"withdrawn "+daysAgo(s.withdrawn_t)+"d ago — clear to send a fresh request"});return}
    if(s.ndate&&s.ndate<=today&&s.stage&&!["Won","Lost"].includes(s.stage))
      out.push({l,tag:"NEXT STEP",ok:0,d:s.nstep||"pipeline step due"});
    else if(s.stage==="Proposal sent"&&s.stage_t&&!s.ndate&&daysAgo(s.stage_t)>=7)
      out.push({l,tag:"CHASE OR CLOSE",ok:0,d:"proposal quiet "+daysAgo(s.stage_t)+"d — chase or breakup"});
    else if(s.stage==="Proposal sent"&&s.stage_t&&!s.ndate&&daysAgo(s.stage_t)>=3)
      out.push({l,tag:"CHASE PROPOSAL",ok:1,d:"sent "+daysAgo(s.stage_t)+"d ago, no reply"});
    else if(s.stage==="Agreement sent"&&s.stage_t&&!s.ndate&&daysAgo(s.stage_t)>=3)
      out.push({l,tag:"CHASE SIGNATURE",ok:0,d:"unsigned for "+daysAgo(s.stage_t)+"d"});
    else if(s.st==="In sequence"){
      if(s.msg1==="Sent"&&(!s.fu1||s.fu1==="Waiting")&&daysAgo(s.msg1_t)>=3)
        out.push({l,tag:"FU 1 DUE",ok:1,d:"Msg 1 was "+daysAgo(s.msg1_t)+"d ago"});
      else if(s.fu1==="Sent"&&(!s.fu2||s.fu2==="Waiting")&&daysAgo(s.fu1_t)>=4)
        out.push({l,tag:"FU 2 DUE",ok:1,d:"FU 1 was "+daysAgo(s.fu1_t)+"d ago"});
      else if(s.fu2==="Sent"&&daysAgo(s.fu2_t)>=7)
        out.push({l,tag:"CLOSE OUT",ok:0,d:"silent "+daysAgo(s.fu2_t)+"d after FU2 → set No response"});
      else if(s.conn==="Accepted"&&!s.msg1)
        out.push({l,tag:"SEND MSG 1",ok:1,d:"connected — message them today"});}
    else if(s.st==="Connection pending"&&daysAgo(s.conn_t)>=28)
      out.push({l,tag:"WITHDRAW",ok:0,d:"pending "+daysAgo(s.conn_t)+"d — withdraw it, you can re-invite in 3 weeks"});
    else if(s.st==="Replied"&&!s.nstep&&!["Won","Lost"].includes(s.stage||""))
      out.push({l,tag:"NEEDS PLAN",ok:0,d:"replied but no next step set"});});
  return out}
function coldCash(){let v=0,n=0;
  LEADS.forEach(l=>{const s=S.leads[l.id];if(!s||!s.stage||["Won","Lost"].includes(s.stage))return;
    const lim=STAGE_LIMIT[s.stage];
    if(lim&&s.stage_t&&daysAgo(s.stage_t)>lim&&+s.val>0){v+=+s.val;n++}});
  return {v,n}}
function renderTodos(){
  S.todos=S.todos||[];
  return `<input id="todoin" placeholder="Write a note or task, press Enter…">`+
    S.todos.map((t,i)=>`<div class="due-row todo"><span class="tcheck" data-i="${i}"></span>
      <span class="ttxt">${esc(t.txt)}</span>
      <button class="tdel" data-i="${i}" data-tip="delete task">✕</button></div>`).join("")}
function bindTodos(){
  const inp=$("#todoin");
  inp&&inp.addEventListener("keydown",e=>{
    if(e.key!=="Enter")return;
    const x=inp.value.trim();if(!x)return;
    S.todos.push({t:Date.now(),txt:x});save();renderDue();
    const ni=$("#todoin");ni&&ni.focus();});
  $("#due").querySelectorAll(".tcheck").forEach(c=>c.onclick=e=>{e.stopPropagation();
    const i=+c.dataset.i;const done=S.todos.splice(i,1)[0];save();
    toast(`<b>Done:</b> ${esc(done.txt)}`,()=>{S.todos.splice(i,0,done);save();renderDue()});
    renderDue();});
  $("#due").querySelectorAll(".tdel").forEach(b=>b.onclick=e=>{e.stopPropagation();
    const i=+b.dataset.i;const gone=S.todos.splice(i,1)[0];save();
    toast(`Task deleted`,()=>{S.todos.splice(i,0,gone);save();renderDue()});
    renderDue();});}
function renderDue(){const d=dueList();
  const cc=coldCash();
  const foot=cc.n?`<div class="due-empty" style="color:var(--warn)">${I("coins")} ${money(cc.v)} going cold across ${cc.n} deal${cc.n>1?"s":""} sitting past their stage limit</div>`:"";
  S.clients=S.clients||[];
  const today2=dayKey(new Date());
  const cliRows=S.clients.filter(c=>(c.status==="Active"||c.status==="Onboarding")&&c.ndate&&c.ndate<=today2)
    .map(c=>`<div class="due-row" data-view="clients"><span><b>${esc(c.co)}</b>
      <span style="color:var(--ink3)"> — ${esc(c.nstep||"client check-in due")}</span></span>
      <span class="tag">CLIENT</span></div>`).join("");
  $("#due").innerHTML=renderTodos()
   +(d.length?`<div class="tdiv">From the machine — due now</div>`:"")
   +cliRows
   +(d.length?d.slice(0,8).map(x=>
    `<div class="due-row" data-id="${x.l.id}"><span><b>${esc(x.l.co)}</b> · ${esc(x.l.name)}
      <span style="color:var(--ink3)"> — ${esc(x.d)}</span></span>
      <span class="tag ${x.ok?"ok":""}">${x.tag}</span></div>`).join("")+
    (d.length>8?`<div class="due-empty">…and ${d.length-8} more</div>`:"")
   :"")+foot;
  $("#due").querySelectorAll(".due-row[data-id]").forEach(r=>r.onclick=()=>openDrawer(+r.dataset.id));
  $("#due").querySelectorAll('[data-view="clients"]').forEach(r=>r.onclick=()=>show("clients"));
  bindTodos();}
function renderChart(){
  const todayKey=new Date().toDateString();
  const days=[...Array(14)].map((_,i)=>{const d=new Date(Date.now()-(13-i)*DAY);
    return {key:d.toDateString(),lbl:d.toLocaleDateString([],{day:"numeric"}),out:0,rep:0,post:0}});
  const idx={};days.forEach(d=>idx[d.key]=d);
  S.events.forEach(e=>{const k=new Date(e.t).toDateString();
    if(idx[k]){if(e.k==="out")idx[k].out++;if(e.k==="reply")idx[k].rep++;if(e.a==="post")idx[k].post++}});
  const mx=Math.max(1,...days.map(d=>Math.max(d.out,d.rep)));
  const totalEv=days.reduce((a,d)=>a+d.out+d.rep,0);
  const start=h=>chartAnimated?h:2;
  $("#chart").innerHTML=days.map(d=>{
    const ho=d.out?Math.max(4,84*d.out/mx):2, hr=d.rep?Math.max(4,84*d.rep/mx):2;
    return `<div class="day ${d.key===todayKey?"today":""}"><div class="bars">
     <div class="b out" data-tip="${d.lbl}: ${d.out} outreach" data-h="${ho}" style="height:${start(ho)}px;${d.out?"":"opacity:.25"}"></div>
     <div class="b rep" data-tip="${d.lbl}: ${d.rep} replies" data-h="${hr}" style="height:${start(hr)}px;${d.rep?"":"opacity:.25"}"></div>
    </div><div class="dl">${d.lbl}</div><div class="pd ${d.post?"on":""}"></div></div>`}).join("")
    +(totalEv===0?`<div class="chart-empty">${LEADS.length===0
      ?`No leads yet.<br><span>Import your list from the ⋯ menu, then run the LinkedIn loop.</span>`
      :`Your first logged action draws the first bar.<br><span>Open Focus and send request one.</span>`}</div>`:"");
  if(!chartAnimated){chartAnimated=true;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      $("#chart").querySelectorAll(".b").forEach(b=>b.style.height=b.dataset.h+"px")}))}
  renderMission();}
let chartAnimated=false,missionAnimated=false;

function todayCounts(){const tk=new Date().toDateString();let req=0,reach=0,post=0;
  S.events.forEach(e=>{if(new Date(e.t).toDateString()!==tk)return;
    if(e.a==="req")req++;if(e.a==="reach")reach++;if(e.a==="post")post++});
  return {req,reach,post}}
function dayKey(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function streakCount(){S.days=S.days||{};let n=0;const d=new Date();
  if(!S.days[dayKey(d)])d.setDate(d.getDate()-1);  /* today not sealed yet: count from yesterday */
  while(S.days[dayKey(d)]){n++;d.setDate(d.getDate()-1)}
  return n}
function ring(val,goal,color,label){
  const R=34,C=2*Math.PI*R;
  const off=C*(1-Math.min(1,val/goal));
  const full=val>=goal&&goal>0;
  return `<div class="ringbox ${full?"rfull":""}"><div class="ringwrap">
    <svg width="86" height="86"><circle class="track" cx="43" cy="43" r="${R}"></circle>
      <circle class="prog" cx="43" cy="43" r="${R}" stroke="${color}"
        stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${missionAnimated?off.toFixed(1):C.toFixed(1)}" data-off="${off.toFixed(1)}"></circle></svg>
    <span class="rv">${val}<span style="color:var(--ink3);font-size:10px">/${goal}</span></span>
   </div><span class="rk">${label}</span></div>`}
function availReach(){let n=0;LEADS.forEach(l=>{const s=S.leads[l.id];if(!s)return;
  const na=nextAction(s);if(na&&na.f!=="conn")n++});return n}
function renderMission(){
  S.days=S.days||{};
  const {req,reach,post}=todayCounts();
  const key=dayKey(new Date());
  const sealed=!!S.days[key];
  /* early days you may not HAVE 15 possible reachouts — goal adapts to reality */
  let effReach=Math.min(TGT().reach,reach+availReach());
  S.effq=(S.effq&&S.effq.d===key)?S.effq:{d:key,v:0};
  effReach=Math.max(effReach,S.effq.v);S.effq.v=effReach;
  const hit=req>=TGT().req&&reach>=effReach;
  const stk=streakCount();
  $("#mission").innerHTML=
    ring(req,TGT().req,"#007AFF","Requests")+
    `<div class="ringbox"><div id="reachtap" data-tip="tap = one reachout done on LinkedIn">${
      ring(reach,Math.max(1,effReach),"#34C759","")}</div>
      <span class="rk">Reachouts</span>
      <div class="rctl"><button id="reachminus" data-tip="remove one tapped reachout">−</button><button id="reachplus" data-tip="log one reachout">+</button></div></div>`+
    (TGT().post>0?`<div class="ringbox"><span class="postwrap"><button id="postb" class="postt ${post?"on":""}" data-tip="${post?"posted today, click to untick":"posted on LinkedIn today? click when you have"}">
       <span class="postic" style="display:inline-flex;font-size:20px">${post?I("check"):I("pen")}</span></button></span>
       <span class="rk">Post</span></div>`:"")+
    `<div class="missionright">
       <div class="streak"><span style="color:var(--magenta);font-size:15px">${I("flame")}</span> <b>${stk}</b> day streak</div>
       <button class="endday ${sealed?"sealed":""}" id="enddayb" ${sealed?"":hit?"":"disabled"}>
         ${sealed?"DAY SEALED ✓":hit?"SEAL THE DAY":`${Math.max(0,TGT().req-req)} requests + ${Math.max(0,Math.max(TGT().reach?1:0,effReach)-reach)} reachouts to go`}
       </button>
       <div class="mhint">${sealed?"Done. Go live your life."
         :"Requests log from leads. Reachouts: tap the ring per message sent. Post: one tap. Targets are yours to change in Settings."}</div>
     </div>`;
  const setOff=()=>$("#mission").querySelectorAll(".prog").forEach(p=>p.style.strokeDashoffset=p.dataset.off);
  if(!missionAnimated){missionAnimated=true;
    requestAnimationFrame(()=>requestAnimationFrame(setOff))}
  else setOff();
  const addReach=()=>{
    if(Date.now()-(_reachT||0)<350)return;_reachT=Date.now();   /* debounce */
    ev(0,"Reachout logged (done on LinkedIn)","out","reach");
    save();renderMission();renderChart();updateTicker();};
  const subReach=()=>{
    const tk=new Date().toDateString();
    const e=S.events.find(x=>x.a==="reach"&&x.id===0&&new Date(x.t).toDateString()===tk);
    if(!e){toast("No tapped reachouts left today. Lead-logged ones are undone on the lead itself.");return}
    S.events=S.events.filter(x=>x!==e);resealCheck([e]);save();
    toast("<b>Reachout −1</b>");
    renderMission();renderChart();updateTicker();};
  const rt=$("#reachtap");rt&&(rt.onclick=addReach);
  const rp=$("#reachplus");rp&&(rp.onclick=e=>{e.stopPropagation();addReach()});
  const rm=$("#reachminus");rm&&(rm.onclick=e=>{e.stopPropagation();subReach()});
  const pb2=$("#postb");
  pb2&&(pb2.onclick=()=>{
    const tk=new Date().toDateString();
    const ex=S.events.find(e=>e.a==="post"&&new Date(e.t).toDateString()===tk);
    if(ex){S.events=S.events.filter(e=>e!==ex);toast("<b>Post untracked</b>")}
    else{ev(0,"LinkedIn post published","","post");toast("<b>Post logged.</b> Content feeds the outbound.")}
    save();renderMission();renderChart();});
  const b=$("#enddayb");
  if(b&&!sealed&&hit)b.onclick=()=>{
    /* revalidate at click time — never seal on stale render state */
    const t=todayCounts(),k2=dayKey(new Date());
    const eff2=Math.min(TGT().reach,t.reach+availReach());
    if(t.req<TGT().req||t.reach<eff2||S.days[k2]){renderMission();return}
    S.days[k2]={req:t.req,reach:t.reach,post:t.post?1:0,t:Date.now()};save();
    toast(`<b>Day sealed.</b> ${t.req} requests, ${t.reach} reachouts${t.post?", posted":""}. Streak: ${streakCount()}`);
    renderMission()};}

/* ---------- leads ---------- */
let filtered=[],shown=0,selIdx=-1;const PAGE=150;let _lastNext={id:0,t:0};let _reachT=0;
rebuildSegFilter();
[...new Set(LEADS.map(l=>l.cn))].sort().forEach(c=>{
  const o=document.createElement("option");o.textContent=c;$("#fcn").append(o)});
function applyFilter(keepId){
  const oldIdx=keepId?filtered.findIndex(l=>l.id===keepId):-1;
  const q=$("#q").value.toLowerCase(),seg=$("#fseg").value,st=$("#fst").value,cn=$("#fcn").value;
  filtered=LEADS.filter(l=>{const s=S.leads[l.id]||{};
    if(seg&&l.pri!==seg)return false;
    if(cn&&l.cn!==cn)return false;
    if(st==="_none"){if(s.st||s.conn)return false}
    else if(st&&s.st!==st)return false;
    if(q&&!(l._s||"").includes(q))return false;
    return true});
  /* skipped / dead-end leads sink to the bottom — active work stays on top */
  const parked=id=>{const s=S.leads[id]||{};
    return s.conn==="Skipped"||s.conn==="Declined"||s.msg1==="Skipped"||
      s.fu1==="Skipped"||s.fu2==="Skipped"||s.st==="Not interested"||s.st==="No response";};
  filtered.sort((a,b)=>(parked(a.id)?1:0)-(parked(b.id)?1:0));
  /* the row you just acted on stays visible — no vanishing under your cursor */
  if(keepId&&oldIdx>-1&&!filtered.some(l=>l.id===keepId))
    filtered.splice(Math.min(oldIdx,filtered.length),0,byId[keepId]);
  $("#count").textContent=filtered.length+" / "+LEADS.length;
}
const RS=id=>S.leads[id]||{};   /* read-only state: never creates entries */
function relTime(t){if(!t)return "";const d=Date.now()-t;
  if(d<3600000)return Math.max(1,Math.floor(d/60000))+"m";
  if(d<86400000)return Math.floor(d/3600000)+"h";
  return Math.floor(d/86400000)+"d"}
function lastTouch(s){if(!s)return 0;
  return Math.max(s.conn_t||0,s.msg1_t||0,s.fu1_t||0,s.fu2_t||0,s.ans_t||0,
    s.stage_t||0,(s.notes&&s.notes[0]&&s.notes[0].t)||0)}
function stageCell(s){
  /* ONE clear thing: terminal statuses show as a chip, otherwise plain words + dots */
  if(["Replied","Meeting booked","Client won","Not interested","No response"].includes(s.st))
    return `<span class="st ${stClass(s.st)}">${s.st}</span>`;
  if(!s.conn&&!s.st)return `<span class="untag">NOT CONTACTED</span>`;
  return `<span class="stage">${stageLabel(s)}</span><br>${dotsHtml(s)}`}
function rowHtml(l,i){const s=RS(l.id);const na=nextAction(s);
  return `<tr data-i="${i}" data-id="${l.id}" ${i===selIdx?'class="sel"':""}>
   <td>${l.id}</td><td><span class="chip seg-${esc(l.pri)}">${esc(l.pri)}</span></td>
   <td class="co">${esc(l.co)}<span class="sub">${esc(l.cn)}${l.loc&&l.loc!==l.cn?" · "+esc(l.loc):""}</span></td>
   <td>${esc(l.name)}<span class="sub">${esc(l.title)}</span></td>
   <td>${safeUrl(l.li)?`<a class="libtn" href="${esc(safeUrl(l.li))}" target="_blank" rel="noopener">in ↗</a>`
             :`<span class="libtn none">—</span>`}</td>
   <td>${stageCell(s)}</td>
   <td><span class="lt">${relTime(lastTouch(s))||"—"}</span></td>
   <td>${na?`<button class="nextb" data-id="${l.id}" data-f="${na.f}" data-o="${na.o}">${na.lbl}</button>`:""}</td></tr>`}
function renderRows(reset){if(reset){applyFilter();shown=0;selIdx=-1}
  if(selIdx>=filtered.length)selIdx=-1;
  shown=Math.min(filtered.length,Math.max(shown,PAGE));
  $("#tbody").innerHTML=filtered.slice(0,shown).map((l,i)=>rowHtml(l,i)).join("");
  $("#more").classList.toggle("hidden",shown>=filtered.length);
  $("#more").textContent=`SHOW MORE (${filtered.length-shown} left)`;}
["q","fseg","fst","fcn"].forEach(id=>$("#"+id).addEventListener("input",()=>renderRows(true)));
$("#more").onclick=()=>{shown+=PAGE;renderRows(false)};
$("#tbody").addEventListener("click",e=>{
  if(e.target.closest("a"))return;
  const nb=e.target.closest(".nextb");
  if(nb){const nid=+nb.dataset.id;
    if(_lastNext.id===nid&&Date.now()-_lastNext.t<600)return;  /* double-click guard */
    _lastNext={id:nid,t:Date.now()};
    if(nb.dataset.f==="rtype"){openDrawer(nid);return}
    applyAction(nid,nb.dataset.f,nb.dataset.o,false);return}
  const tr=e.target.closest("tr");
  if(tr){selIdx=+tr.dataset.i;openDrawer(+tr.dataset.id)}});

/* ---------- drawer ---------- */
let openId=null;
function segBtns(id,field,opts){const s=RS(id);
  return `<div class="seg-btns">`+opts.map(o=>
   `<button data-f="${field}" data-o="${o}" class="${s[field]===o?"on":""}">${o}</button>`).join("")+`</div>`}
function openDrawer(id){
  if(!byId[id])return;                       /* fingerprint guard: unknown id */
  const same=(openId===id);
  const keepScroll=same?$("#drawer").scrollTop:0;
  const keepNote=same?(($("#nnew")||{}).value||""):"";
  openId=id;const l=byId[id],s=RS(id);
  const inDeal=s.stage||["Replied","Meeting booked","Client won"].includes(s.st);
  const aiMode=(s.st==="Replied"||s.rtype||inDeal)?"reply":"opener";
  $("#dbody").innerHTML=`
   <h2>${esc(l.name)||"(no name)"} <span class="chip seg-${esc(l.pri)}">${esc(l.pri)}</span></h2>
   <div class="subh">${esc(l.title)} — <b>${esc(l.co)}</b> · ${esc(l.loc)||esc(l.cn)}</div>
   <div class="dsec linkrow">
     ${safeUrl(l.li)?`<a class="libtn" style="padding:6px 14px" href="${esc(safeUrl(l.li))}" target="_blank" rel="noopener">OPEN LINKEDIN ↗</a>`:""}
     ${l.em?`<button class="tbtn" id="cpEm">COPY EMAIL</button>
     <span style="color:var(--ink3);font-size:11px">${esc(l.em)} (future use)</span>`:""}
     <button class="tbtn" id="leadedit">EDIT LEAD</button>
   </div>
   ${(((SEG[l.pri]||{}).bullets||[]).length||l.info)?`<div class="dsec"><div class="k">Segment notes</div>
     ${((SEG[l.pri]||{}).bullets||[]).length?`<ul class="bullets">${SEG[l.pri].bullets.map(b=>`<li>${esc(b)}</li>`).join("")}</ul>`:""}
     ${l.info?`<div class="infobox">${I("info")} ${esc(l.info)}</div>`:""}</div>`:""}
   <div class="dsec"><div class="k">Templates — click to copy, then paste in LinkedIn</div>
     <div class="seg-btns">
       <button class="tplb" data-t="conn">CONN NOTE</button>
       <button class="tplb" data-t="m1">MSG 1</button>
       <button class="tplb" data-t="f1">FU 1</button>
       <button class="tplb" data-t="f2">FU 2</button>
     </div></div>
   <div class="dsec"><div class="k">Connection request</div>${segBtns(id,"conn",["Sent","Accepted","Declined","Skipped","Withdrawn"])}</div>
   <div class="dsec"><div class="k">Message 1</div>${segBtns(id,"msg1",["Waiting","Sent","Skipped"])}</div>
   <div class="dsec"><div class="k">Follow-up 1</div>${segBtns(id,"fu1",["Waiting","Sent","Skipped"])}</div>
   <div class="dsec"><div class="k">Follow-up 2</div>${segBtns(id,"fu2",["Waiting","Sent","Skipped"])}</div>
   <div class="dsec"><div class="k">Status</div>${segBtns(id,"st",STATUSES)}</div>
   ${["Replied","Meeting booked"].includes(s.st)||s.rtype?`
   <div class="dsec"><div class="k">They replied — what did they say?</div>
     <div class="seg-btns">${Object.keys(REPLY).map(k=>
       `<button data-f="rtype" data-o="${k}" class="${s.rtype===k?"on":""}">${REPLY[k].label}</button>`).join("")}</div>
     ${s.rtype&&REPLY[s.rtype]?`
       <div class="bullets" style="margin-top:8px;list-style:none">
         <div style="color:var(--ink3);font-size:11px;margin-bottom:6px">◆ ${esc(REPLY[s.rtype].tip)}</div>
         ${esc(REPLY[s.rtype].txt).replaceAll("{first}",esc((l.name||"").split(" ")[0]||"there")).replaceAll("{co}",esc(l.co))}
       </div>
       <button class="tbtn" id="cpReply" style="margin-top:8px">COPY RESPONSE</button>`:""}
   </div>`:""}
   ${inDeal?`
   <div class="dsec"><div class="k">Deal${s.stage_t?` · ${daysAgo(s.stage_t)}d in ${esc(s.stage||"")}`:""}</div>${segBtns(id,"stage",STAGES)}
     ${["Proposal sent","Agreement sent"].includes(s.stage)?`
     <div class="seg-btns" style="margin-top:8px">
       ${(s.stage==="Proposal sent"?["prop_chase1","prop_chase2","breakup"]:["agree_chase","breakup"]).map(k=>
         `<button class="dealtpl" data-k="${k}">${DEAL_TPL[k].label}</button>`).join("")}
     </div>`:""}
     ${["Call booked","Meeting done"].includes(s.stage)||s.ndate?`
     <button class="tbtn" id="prepb" style="margin-top:8px">PREP CALL</button>`:""}
     ${s.stage==="Won"?`
     <button class="tbtn" id="mkclient" style="margin-top:8px;background:rgba(52,199,89,.14);border-color:transparent;color:#1E9B4A;font-weight:700">MAKE CLIENT →</button>`:""}
     <div class="dealrow">
       <span class="valwrap"><b>$</b><input id="dval" type="number" min="0" placeholder="deal value" value="${esc(s.val||"")}" style="width:110px"></span>
       <input id="nstep" placeholder="next step… (e.g. send proposal)" value="${esc(s.nstep||"")}">
       <input id="ndate" type="date" value="${esc(s.ndate||"")}">
     </div></div>`:""}
   ${aiSectionHtml(id,aiMode)}
   <div class="dsec"><div class="k">Notes — meetings, outcomes, anything</div>
     <textarea id="nnew" placeholder="e.g. Meeting went well — wants proposal by Friday, budget ~$2k/mo… (Cmd/Ctrl+Enter saves)"></textarea>
     <button class="tbtn" id="naddb">ADD NOTE</button>
     <div id="notes">${(s.notes||[]).map(n=>`<div class="note"><time>${new Date(n.t).toLocaleString()}</time>${esc(n.x)}</div>`).join("")}</div>
   </div>`;
  $("#drawer").classList.add("open");
  if(keepScroll)$("#drawer").scrollTop=keepScroll;
  if(keepNote)$("#nnew").value=keepNote;
  const cp=$("#cpEm");
  cp&&(cp.onclick=()=>{navigator.clipboard.writeText(l.em);cp.textContent="COPIED ✓";
    setTimeout(()=>cp.textContent="COPY EMAIL",900)});
  const le=$("#leadedit");le&&(le.onclick=()=>openLeadForm(id));
  $("#dbody").querySelectorAll(".tplb").forEach(b=>b.onclick=()=>{
    const first=(l.name||"").split(" ")[0]||"there";
    const txt=(TPLOF(l.pri)[b.dataset.t]||"")
      .replaceAll("{first}",first).replaceAll("{co}",l.co||"your company");
    navigator.clipboard.writeText(txt);
    const old=b.textContent;b.textContent="COPIED ✓";setTimeout(()=>b.textContent=old,900)});
  $("#naddb").onclick=addNote;
  $("#nnew").addEventListener("keydown",e=>{if((e.metaKey||e.ctrlKey)&&e.key==="Enter")addNote()});
  const cpR=$("#cpReply");
  cpR&&(cpR.onclick=()=>{const first=(l.name||"").split(" ")[0]||"there";
    navigator.clipboard.writeText(REPLY[s.rtype].txt.replaceAll("{first}",first).replaceAll("{co}",l.co||"your company"));
    cpR.textContent="COPIED ✓";setTimeout(()=>cpR.textContent="COPY RESPONSE",900)});
  $("#dbody").querySelectorAll(".dealtpl").forEach(b=>b.onclick=()=>{
    const first=(l.name||"").split(" ")[0]||"there";
    navigator.clipboard.writeText(DEAL_TPL[b.dataset.k].txt.replaceAll("{first}",first).replaceAll("{co}",l.co||"your company"));
    const old=b.textContent;b.textContent="COPIED ✓";setTimeout(()=>b.textContent=old,900);
    if(!L(id).ans_t&&RS(id).st==="Replied"){L(id).ans_t=Date.now();save()}});
  const pb=$("#prepb");
  pb&&(pb.onclick=()=>openPrep(id));
  const mkc=$("#mkclient");
  mkc&&(mkc.onclick=()=>makeClient(id));
  const dv=$("#dval"),ns=$("#nstep"),nd=$("#ndate");
  dv&&dv.addEventListener("change",()=>{L(id).val=dv.value;save();
    toast(`<b>${esc(l.co)}</b> — deal value ${money(dv.value||0)}`);refreshQuiet()});
  ns&&ns.addEventListener("change",()=>{const st2=L(id);st2.nstep=ns.value;
    if(!st2.ans_t&&st2.st==="Replied")st2.ans_t=Date.now();save();refreshQuiet()});
  nd&&nd.addEventListener("change",()=>{const st2=L(id);st2.ndate=nd.value;
    if(!st2.ans_t&&st2.st==="Replied")st2.ans_t=Date.now();save();refreshQuiet()});
  bindAI(id,aiMode);
  $("#dbody").querySelectorAll(".seg-btns button:not(.tplb)").forEach(b=>{
    /* skip buttons with their own handlers: AI, AI-copy, deal templates */
    if(b.id==="aigo"||b.classList.contains("ai-cp")||b.classList.contains("dealtpl"))return;
    b.onclick=()=>applyAction(id,b.dataset.f,b.dataset.o,true)});
}
function refreshQuiet(){_dirty=true;
  if(!$("#v-dash").classList.contains("hidden"))dash();
  if(!$("#v-pipe").classList.contains("hidden"))pipe();
  updateTicker();}
function addNote(){const x=$("#nnew").value.trim();if(!x||openId==null)return;
  const s=L(openId);s.notes=s.notes||[];s.notes.unshift({t:Date.now(),x});
  if(!s.ans_t&&s.st==="Replied")s.ans_t=Date.now();
  ev(openId,"note: "+x.slice(0,60));save();openDrawer(openId);
  toast(`<b>${esc(byId[openId].co)}</b> — note saved`)}
$("#dclose").onclick=()=>{$("#drawer").classList.remove("open");openId=null};

/* ---------- pipeline ---------- */
function pipe(){
  const cols=STAGES.map(st=>({st,cards:[]}));
  LEADS.forEach(l=>{const s=S.leads[l.id]||{};
    if(s.stage){const c=cols.find(c=>c.st===s.stage);c&&c.cards.push(l)}});
  const SC={"Replied":"#34C759","Call booked":"#007AFF","Meeting done":"#32ADE6",
    "Proposal sent":"#AF52DE","Agreement sent":"#5856D6","Won":"#FF2D55","Lost":"#8e8e93"};
  $("#board").innerHTML=cols.map((c,ci)=>{
    const v=c.cards.reduce((a,l)=>a+(+((S.leads[l.id]||{}).val)||0),0);
    return `<div class="col ${c.st==="Won"?"won":""}"><h4><span><span class="sdot" style="background:${SC[c.st]}"></span>${c.st}</span>
      <span>${c.cards.length}${v?" · "+money(v):""}</span></h4>`+
    c.cards.map(l=>{const s=S.leads[l.id]||{};
      return `<div class="card" data-id="${l.id}"><div class="c">${esc(l.co)}</div>
       <div class="n">${esc(l.name)} · <span class="chip seg-${esc(l.pri)}">${esc(l.pri)}</span></div>
       ${s.val?`<div class="val">${money(s.val)}</div>`:""}
       ${s.nstep?`<div class="d">→ ${esc(s.nstep)}${s.ndate?" · "+esc(s.ndate):""}</div>`:""}
       <div class="mv">
         <button data-mv="-1" data-id="${l.id}" ${ci===0?"disabled":""}>◀</button>
         <button data-mv="1" data-id="${l.id}" ${ci===STAGES.length-1?"disabled":""}>▶</button>
       </div></div>`}).join("")+`</div>`}).join("");
  $("#board").querySelectorAll(".card").forEach(c=>c.addEventListener("click",e=>{
    if(e.target.dataset.mv)return;openDrawer(+c.dataset.id)}));
  $("#board").querySelectorAll("[data-mv]").forEach(b=>b.onclick=()=>{
    const id=+b.dataset.id,s=L(id),i=STAGES.indexOf(s.stage)+ +b.dataset.mv;
    if(i>=0&&i<STAGES.length)applyAction(id,"stage",STAGES[i],false)});
}

/* ---------- export / import ---------- */
function dl(name,text,type){const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click()}
/* Backup/Restore (JSON) removed — cloud sync is the recovery path. CSV export stays. */
$("#bcsv").onclick=()=>{
  const q=v=>'"'+String(v==null?"":v).replace(/"/g,'""')+'"';
  const head=["#","Segment","Name","Title","Company","Country","Location","LinkedIn",
    "Email","Connection","Message1","FollowUp1","FollowUp2","Status","Stage","DealValue",
    "NextStep","NextDate","Notes"];
  const rows=LEADS.map(l=>{const s=S.leads[l.id]||{};
    return [l.id,l.pri+" "+l.seg,l.name,l.title,l.co,l.cn,l.loc,l.li,l.em,
      s.conn||"",s.msg1||"",s.fu1||"",s.fu2||"",s.st||"",s.stage||"",s.val||"",
      s.nstep||"",s.ndate||"",(s.notes||[]).map(n=>new Date(n.t).toLocaleDateString()+" "+n.x).join(" | ")]
      .map(q).join(",")});
  dl("ascent_outbound_export.csv",head.map(q).join(",")+"\n"+rows.join("\n"),"text/csv")};

/* ---------- FOCUS MODE: one lead at a time, real actions only ---------- */
let focusActive=false,focusQueue=[],focusIdx=0,focusDone=0,focusWhy={},smartOn=false;
const SMART_MIN=30;           /* ranking earns its claim at 30 logged requests */
function titleBucket(t){t=(t||"").toLowerCase();
  if(/founder|chief executive|\bceo\b/.test(t))return "Founder/CEO";
  if(/managing director/.test(t))return "MD";
  if(/owner|principal/.test(t))return "Owner";
  if(/partner/.test(t))return "Partner";
  if(/director|head of|\bvp\b|vice president/.test(t))return "Director";
  return "Other"}
function cohortStats(){
  const seg={},ttl={};let gReq=0,gAcc=0;
  LEADS.forEach(l=>{const s=S.leads[l.id];if(!s)return;
    const sent=["Sent","Accepted","Declined"].includes(s.conn);
    if(!sent)return;
    const acc=s.conn==="Accepted"?1:0;
    gReq++;gAcc+=acc;
    (seg[l.pri]=seg[l.pri]||{req:0,acc:0}).req++;seg[l.pri].acc+=acc;
    const b=titleBucket(l.title);
    (ttl[b]=ttl[b]||{req:0,acc:0}).req++;ttl[b].acc+=acc;});
  return {seg,ttl,gReq,gAcc,gRate:gReq?gAcc/gReq:0}}
function smartRank(untouchedIds){
  const st=cohortStats();
  focusWhy={};
  if(st.gReq<SMART_MIN){smartOn=false;return {ids:untouchedIds,progress:st.gReq}}
  smartOn=true;
  const K=5;                   /* smoothing: cohorts earn trust with volume */
  const rate=(c)=>c?((c.acc+K*st.gRate)/(c.req+K)):st.gRate;
  const scored=untouchedIds.map(id=>{
    const l=byId[id];if(!l)return null;
    const sc=st.seg[l.pri],tb=titleBucket(l.title),tc=st.ttl[tb];
    const score=rate(sc)*0.6+rate(tc)*0.4;
    const bits=[];
    if(sc&&sc.req>=10)bits.push(`${(SEG[l.pri]||{}).name||l.pri} accepts ${Math.round(100*sc.acc/sc.req)}% (n=${sc.req})`);
    if(tc&&tc.req>=10&&tb!=="Other")bits.push(`${tb} titles ${Math.round(100*tc.acc/tc.req)}% (n=${tc.req})`);
    focusWhy[id]=bits.join(" · ");
    return {id,score};
  }).filter(Boolean);
  scored.sort((a,b)=>b.score-a.score||a.id-b.id);
  return {ids:scored.map(x=>x.id),progress:st.gReq}}
let _smartProgress=0;
function focusStart(){
  focusDone=0;focusIdx=0;
  let segF=S.focusSeg||"";
  if(segF&&!SEG[segF]){segF="";S.focusSeg="";}          /* list was deleted — fall back to all */
  const inSeg=l=>!segF||l.pri===segF;
  const isUnt=l=>{const st2=S.leads[l.id];return !st2||(!st2.st&&!st2.conn)};
  const due=dueList().filter(x=>inSeg(x.l)).map(x=>x.l.id);
  const untouched=LEADS.filter(l=>inSeg(l)&&isUnt(l)).slice(0,600).map(l=>l.id);
  const r=smartRank(untouched);_smartProgress=r.progress;
  let rankedIds=r.ids;
  if(!segF){
    /* All lists: serve in the user's list-priority order, smart order kept within each list */
    const rank={};orderedSegs().forEach((k,i)=>rank[k]=i);
    const rankOf=id=>{const l=byId[id];const i=l?rank[l.pri]:undefined;return i==null?999:i};
    rankedIds=r.ids.slice().sort((a,b)=>rankOf(a)-rankOf(b));
  }
  focusQueue=[...new Set([...due,...rankedIds])];
  focusRender();}
function focusSegOptions(){const cur=S.focusSeg||"";
  return `<select id="focusseg" class="focusseg"><option value="">All lists</option>`+
    orderedSegs().map(k=>`<option value="${esc(k)}" ${k===cur?"selected":""}>${esc(SEG[k].name)}</option>`).join("")
    +`</select>`}
function bindFocusSeg(){const fs=$("#focusseg");
  fs&&(fs.onchange=()=>{S.focusSeg=fs.value;save();focusStart();});}
function focusCurrent(){
  while(focusIdx<focusQueue.length){
    const id=focusQueue[focusIdx];
    const na=nextAction(RS(id));
    if(na&&!(na.f==="conn"&&na.o==="Accepted"))return {id,na};
    focusIdx++;}
  return null}
function focusRender(){
  const cur=focusCurrent();
  const {req,reach}=todayCounts();
  const effReach=Math.min(TGT().reach,reach+availReach());
  const pick=`<div class="fx-pick"><span>Working list</span>${focusSegOptions()}</div>`;
  if(!cur){$("#focuswrap").innerHTML=pick+`<div class="fx-empty">Queue clear${S.focusSeg?" for this list":""}. ${focusDone} actions this session.<br><br>
    <button class="tbtn" onclick="show('dash')">BACK TO DASHBOARD</button></div>`;bindFocusSeg();return}
  const l=byId[cur.id],s=RS(cur.id),na=cur.na;
  const tplKey=na.f==="conn"?"conn":na.f==="msg1"?"m1":na.f==="fu1"?"f1":"f2";
  const stepName=na.f==="conn"?(na.o==="Accepted"?"Mark their accept":"Connection request")
    :FL[na.f];
  $("#focuswrap").innerHTML=pick+`
   <div class="fx-head"><span>FOCUS · ${focusDone} done this session · ${smartOn
      ?`<span style="color:var(--indigo)">SMART QUEUE ON</span>`
      :`<span data-tip="ranks your untouched leads by your own accept rates once 30 requests are logged">SMART QUEUE ${_smartProgress}/${SMART_MIN}</span>`}</span>
     <span>REQ ${req}/${TGT().req} · REACH ${reach}/${Math.max(1,effReach)} · <button class="tbtn" onclick="show('dash')">EXIT (ESC)</button></span></div>
   <div class="fx-card" id="fxcard">
     <span class="fx-stage">${stepName.toUpperCase()}</span>
     ${smartOn&&focusWhy[cur.id]?`<div class="fx-why">${I("trend")} Ranked here because: ${esc(focusWhy[cur.id])}</div>`
       :smartOn&&focusWhy[cur.id]===""?`<div class="fx-why">${I("trend")} No strong cohort signal yet for this lead, serving by baseline</div>`:""}
     <h2>${esc(l.name)||"(no name)"} <span class="chip seg-${esc(l.pri)}">${esc(l.pri)}</span></h2>
     <div class="fx-sub">${esc(l.title)} — <b>${esc(l.co)}</b> · ${esc(l.loc)||esc(l.cn)}</div>
     ${((SEG[l.pri]||{}).bullets||[]).length?`<ul class="bullets">${SEG[l.pri].bullets.slice(0,3).map(b=>`<li>${esc(b)}</li>`).join("")}</ul>`:""}
     ${l.info?`<div class="infobox">${I("info")} ${esc(l.info)}</div>`:""}
     <div class="fx-actions">
       ${safeUrl(l.li)?`<a class="big libig" href="${esc(safeUrl(l.li))}" target="_blank" rel="noopener">OPEN LINKEDIN<kbd>O</kbd></a>`:""}
       ${na.o!=="Accepted"?`<button class="big" id="fxcopy">COPY MESSAGE<kbd>C</kbd></button>`:""}
       <button class="big primary" id="fxdone">${na.lbl.toUpperCase()}<kbd>↵</kbd></button>
       <button class="big" id="fxskip">SKIP<kbd>S</kbd></button>
     </div>
   </div>`;
  const upnext=focusQueue.slice(focusIdx+1,focusIdx+4)
    .map(i=>byId[i]).filter(Boolean).map(l=>esc(l.co)).join("  ·  ");
  if(upnext)$("#focuswrap").insertAdjacentHTML("beforeend",
    `<div class="fx-upnext">Up next:&nbsp; ${upnext}</div>`);
  const cpb=$("#fxcopy");
  cpb&&(cpb.onclick=()=>{const first=(l.name||"").split(" ")[0]||"there";
    navigator.clipboard.writeText((TPLOF(l.pri)[tplKey]||"")
      .replaceAll("{first}",first).replaceAll("{co}",l.co||"your company"));
    cpb.innerHTML="COPIED ✓";setTimeout(()=>{cpb.innerHTML='COPY MESSAGE<kbd>C</kbd>'},900)});
  $("#fxdone").onclick=()=>{
    if(na.f==="rtype"){openDrawer(cur.id);return}
    focusDone++;focusIdx++;applyAction(cur.id,na.f,na.o,false)};
  $("#fxskip").onclick=()=>{applyAction(cur.id,na.f,"Skipped",false)};
  bindFocusSeg();}

/* ---------- COMMAND PALETTE (Cmd/Ctrl+K) ---------- */
LEADS.forEach(l=>l._s=(l.name+" "+l.co+" "+l.title).toLowerCase());
const COMMANDS=[
  ["focus","Start Focus session",()=>show("focus")],
  ["dashboard","Go to Dashboard",()=>show("dash")],
  ["leads","Go to Leads",()=>show("leads")],
  ["pipeline","Go to Pipeline",()=>show("pipe")],
  ["untouched","Leads: show Untouched",()=>{show("leads");$("#fst").value="_none";renderRows(true)}],
  ["due","Open Dashboard due list",()=>show("dash")],
  ["csv","Export CSV",()=>$("#bcsv").click()],
  ["help","Open Help & playbook",()=>show("help")],
  ["goal","Set revenue goal: >goal 10000 2000",()=>{}],
  ["coach","Claude coach — read my real numbers",()=>openCoach()],
  ["add","Add a lead manually",()=>openLeadForm()],
  ["prep","Prep next scheduled call",()=>{
    const today=dayKey(new Date());
    const cand=LEADS.filter(l=>{const s=S.leads[l.id];return s&&s.ndate&&s.stage&&!["Won","Lost"].includes(s.stage)})
      .sort((a,b)=>(S.leads[a.id].ndate||"9").localeCompare(S.leads[b.id].ndate||"9"))[0];
    if(cand){palClose();openPrep(cand.id)}else toast("No scheduled calls — set a next-step date on a deal first")}],
];
let palSel=0,palItems=[];
function palOpen(){$("#palette").classList.remove("hidden");$("#palq").value="";palQuery("");$("#palq").focus()}
function palClose(){$("#palette").classList.add("hidden")}
function palQuery(q){
  q=q.toLowerCase();palSel=0;
  if(q.startsWith(">")){
    const c=q.slice(1).trim();
    const gm=c.match(/^goal\s+(\d+)(?:\s+(\d+))?$/);
    if(gm){palItems=[{t:`› Set goal: $${(+gm[1]).toLocaleString()}/mo`+(gm[2]?` · $${(+gm[2]).toLocaleString()} avg deal`:""),pr:"command",
      run:()=>{S.goal={rev:+gm[1],deal:+gm[2]||((S.goal||{}).deal||2000)};save();_dirty=true;
        toast(`<b>Goal set:</b> ${money(S.goal.rev)}/mo at ${money(S.goal.deal)} avg`);refreshQuiet()}}];}
    else palItems=COMMANDS.filter(x=>x[0].includes(c)).map(x=>({t:"› "+x[1],pr:"command",run:x[2]}));
  }else{
    palItems=(q?LEADS.filter(l=>l._s.includes(q)||
      ((S.leads[l.id]||{}).notes||[]).some(n=>n.x.toLowerCase().includes(q))):LEADS.slice(0,0)).slice(0,12)
      .map(l=>({t:l.co,sub:l.name,pr:l.pri,run:()=>{palClose();openDrawer(l.id)}}));
    if(!q)palItems=COMMANDS.map(x=>({t:"› "+x[1],pr:"command",run:x[2]}));
  }
  $("#palres").innerHTML=palItems.map((it,i)=>
    `<div class="palrow ${i===palSel?"sel":""}" data-i="${i}">
      <span><b>${esc(it.t)}</b>${it.sub?" · "+esc(it.sub):""}</span><span class="pr">${it.pr}</span></div>`).join("")
    ||'<div class="palrow"><span class="pr">no matches</span></div>';
  $("#palres").querySelectorAll(".palrow").forEach(r=>r.onclick=()=>{
    const it=palItems[+r.dataset.i];it&&(palClose(),it.run())});}
$("#palq").addEventListener("input",e=>palQuery(e.target.value));
$("#palq").addEventListener("keydown",e=>{
  if(e.key==="ArrowDown"){e.preventDefault();palSel=Math.min(palItems.length-1,palSel+1)}
  else if(e.key==="ArrowUp"){e.preventDefault();palSel=Math.max(0,palSel-1)}
  else if(e.key==="Enter"){const it=palItems[palSel];it&&(palClose(),it.run());return}
  else if(e.key==="Escape"){e.stopPropagation();palClose();return}
  else return;
  $("#palres").querySelectorAll(".palrow").forEach((r,i)=>r.classList.toggle("sel",i===palSel))});
$("#palette").addEventListener("click",e=>{if(e.target.id==="palette")palClose()});

/* ---------- MOMENTUM: pure folds over real history, dashes under n=10 ---------- */
function renderMomentum(){
  const c=countsCached();
  const sod7=Date.now()-7*DAY;
  let req7=0,reach7=0;const activeDays=new Set();
  S.events.forEach(e=>{if(e.t>=sod7){
    if(e.a==="req"){req7++;activeDays.add(new Date(e.t).toDateString())}
    if(e.a==="reach")reach7++}});
  const rate=(n,d)=>d>=10?((100*n/d).toFixed(1)+"%"):"—";
  const pace=activeDays.size?Math.round(req7/activeDays.size):0;
  const runway=(pace>0&&c.unt>0)?Math.ceil(c.unt/pace)+" days":"—";
  $("#momtbl").innerHTML=`
   <tr><th>Metric</th><th>Value</th><th>Basis</th></tr>
   <tr><td>Accept rate</td><td>${rate(c.acc,c.conn)}</td><td>${c.acc}/${c.conn} requests</td></tr>
   <tr><td>Reply rate</td><td>${rate(c.repMsg,c.msg1)}</td><td>${c.repMsg}/${c.msg1} messaged leads</td></tr>
   <tr><td>Requests, last 7d</td><td>${req7}</td><td>${activeDays.size} active day${activeDays.size===1?"":"s"}</td></tr>
   <tr><td>Reachouts, last 7d</td><td>${reach7}</td><td>real logged sends</td></tr>
   <tr><td>Untouched runway</td><td>${runway}</td><td>${c.unt} left at ${pace||"—"}/day</td></tr>
   <tr><td>Median reply→answer</td><td>${medAns()}</td><td>answered replies</td></tr>
   <tr><td>Active MRR</td><td>${money(clientStats().mrr)}</td><td>${clientStats().n} active client${clientStats().n===1?"":"s"}</td></tr>
   <tr><td>Won this month</td><td>${wonMonth(c)}</td><td>goal ${money((S.goal||{}).rev||10000)}/mo · ${money((S.goal||{}).deal||2000)} avg — ⌘K "&gt;goal"</td></tr>`;
}
function medAns(){const ds=[];
  LEADS.forEach(l=>{const s=S.leads[l.id];if(!s||!s.ans_t||!s.st_evi)return;
    const e=S.events.find(x=>x.i===s.st_evi);if(e)ds.push(s.ans_t-e.t)});
  if(ds.length<5)return "— (n="+ds.length+")";
  ds.sort((a,b)=>a-b);const m=ds[Math.floor(ds.length/2)];
  return Math.round(m/3600000)+"h (n="+ds.length+")"}
function wonMonth(){const now=new Date();let v=0,n=0;
  LEADS.forEach(l=>{const s=S.leads[l.id];if(!s||s.stage!=="Won"||!s.won_t)return;
    const d=new Date(s.won_t);
    if(d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()){v+=+s.val||0;n++}});
  const goal=(S.goal||{}).rev||10000;
  return `${money(v)} / ${money(goal)} (${n} deal${n===1?"":"s"})`}

/* ---------- CSV IMPORT: bring your own leads ---------- */
function parseCSV(text){
  const rows=[];let row=[],cell="",inQ=false;
  for(let i=0;i<text.length;i++){const ch=text[i];
    if(inQ){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++}else inQ=false}else cell+=ch}
    else if(ch==='"')inQ=true;
    else if(ch===","){row.push(cell);cell=""}
    else if(ch==="\n"||ch==="\r"){if(ch==="\r"&&text[i+1]==="\n")i++;
      row.push(cell);cell="";if(row.some(c=>c.trim()!==""))rows.push(row);row=[]}
    else cell+=ch}
  if(cell!==""||row.length){row.push(cell);if(row.some(c=>c.trim()!==""))rows.push(row)}
  return rows}
const HMAP={name:["name","full name","person","contact"],
  title:["title","position","job title","role"],
  co:["company","organisation","organization","firm","account"],
  cn:["country"],loc:["location","city","region"],
  li:["linkedin","linkedin url","profile","url"],
  em:["email","e-mail","mail"]};
function mapHeaders(head){
  const idx={};head.forEach((h,i)=>{const hl=h.trim().toLowerCase();
    for(const k in HMAP)if(HMAP[k].some(v=>hl===v||hl.includes(v)))if(!(k in idx))idx[k]=i});
  return idx}
function addSegmentLeads(segName,rows){
  const keys=Object.keys(SEG);
  const k="P"+(keys.length?Math.max(...keys.map(x=>+x.slice(1)||0))+1:1);
  SEG[k]={name:segName,color:SEGPAL[keys.length%SEGPAL.length],bullets:[]};
  let next=LEADS.reduce((a,l)=>Math.max(a,l.id),0);
  const added=[];
  rows.forEach(r=>{if(!r.name&&!r.co)return;
    next++;const l={id:next,pri:k,seg:segName,name:r.name||"",title:r.title||"",
      co:r.co||"",cn:r.cn||"",loc:r.loc||"",li:r.li||"",em:r.em||""};
    LEADS.push(l);added.push(l)});
  saveLeads();indexLeads();renderSegCss();buildSeglist();save();
  /* ship a copy to the backend when deployed; harmless locally */
  try{fetch("/api/ingest",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({segment:segName,count:added.length,leads:added})}).catch(()=>{})}catch(e){}
  return {key:k,count:added.length}}
let _staged=null;
const SAMPLE_CSV="Name,Title,Company,Country,Location,LinkedIn,Email\n"+
 "Jane Doe,Founder,Example Studio,UK,London,https://www.linkedin.com/in/example-jane,jane@example.com\n"+
 "John Smith,Managing Director,Sample Recruitment,UK,Manchester,https://www.linkedin.com/in/example-john,john@example.com\n"+
 "Ana Silva,CEO,Demo Labs,Ireland,Dublin,https://www.linkedin.com/in/example-ana,ana@example.com";
function stageCSVText(text){
  const rows=parseCSV(text);
  if(rows.length<2)return {err:"No data rows found in that file."};
  const idx=mapHeaders(rows[0]);
  if(!("name" in idx)&&!("co" in idx))
    return {err:"Need at least a Name or a Company column. Check the sample file."};
  const data=rows.slice(1).map(r=>{const o={};
    for(const k in idx)o[k]=(r[idx[k]]||"").trim();return o});
  const cols=Object.keys(idx).map(k=>({name:"Name",title:"Title",co:"Company",
    cn:"Country",loc:"Location",li:"LinkedIn",em:"Email"}[k])).join(", ");
  return {data,cols,count:data.length}}
function segNameFromFile(fn){
  return (fn||"").replace(/\.[^.]+$/,"").replace(/[_-]+/g," ").replace(/\s+/g," ").trim();}
function openImportModal(){
  if(document.getElementById("impov"))return;
  _staged=null;
  const ov=document.createElement("div");
  ov.id="impov";
  ov.style.cssText="position:fixed;inset:0;background:rgba(60,60,70,.28);backdrop-filter:blur(4px);z-index:45;display:flex;justify-content:center;align-items:flex-start;padding-top:8vh";
  ov.innerHTML=`<div class="fx-card" style="max-width:560px;width:100%">
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <h2 style="font-family:var(--serif);font-size:22px">Import your leads</h2>
      <button class="tbtn" id="impx">CLOSE</button></div>
    <div class="fx-sub">One CSV file. These columns are understood, in any order, extras are ignored:</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
      ${["Name","Title","Company","Country","Location","LinkedIn","Email"].map(c=>
        `<span class="chip" style="background:rgba(0,122,255,.1);color:#0068DF">${c}</span>`).join("")}
    </div>
    <div class="dsec"><div class="k">Step 1 · Name this list (leave blank to use the file name)</div>
      <input id="impseg" placeholder="e.g. UK Recruiters" value="" style="width:100%"></div>
    <div class="dsec"><div class="k">Step 2 · Your file</div>
      <div id="dropz">Drag your CSV here, or click to choose a file
        <div id="dropinfo"></div></div>
      <button class="tbtn" id="impsample" style="margin-top:10px">DOWNLOAD SAMPLE CSV</button></div>
    <div class="fx-actions">
      <button class="big goimp" id="impgo" disabled style="opacity:.5">IMPORT</button>
    </div></div>`;
  document.body.append(ov);
  const close=()=>ov.remove();
  ov.addEventListener("click",e=>{if(e.target===ov)close()});
  ov.querySelector("#impx").onclick=close;
  ov.querySelector("#impsample").onclick=()=>dl("sample_leads.csv",SAMPLE_CSV,"text/csv");
  const dz=ov.querySelector("#dropz"),info=ov.querySelector("#dropinfo"),
        go=ov.querySelector("#impgo");
  const handleText=t=>{
    const st=stageCSVText(t);
    if(st.err){info.innerHTML=`<span style="color:var(--red)">${esc(st.err)}</span>`;
      _staged=null;go.disabled=true;go.style.opacity=.5;return}
    _staged=st;
    info.innerHTML=`<b style="color:var(--good)">Found ${st.count} leads</b> · columns: ${esc(st.cols)}`;
    go.disabled=false;go.style.opacity=1};
  const handleFile=f=>{if(!f)return;
    ov._fname=f.name;
    const segIn=ov.querySelector("#impseg");
    if(segIn&&!segIn.value.trim()){const guess=segNameFromFile(f.name);if(guess)segIn.value=guess;}
    const r=new FileReader();r.onload=()=>handleText(r.result);r.readAsText(f)};
  dz.onclick=()=>$("#csvfile").click();
  dz.addEventListener("dragover",e=>{e.preventDefault();dz.classList.add("drag")});
  dz.addEventListener("dragleave",()=>dz.classList.remove("drag"));
  dz.addEventListener("drop",e=>{e.preventDefault();dz.classList.remove("drag");
    handleFile(e.dataTransfer.files[0])});
  ov._handleFile=handleFile;
  go.onclick=()=>{
    if(!_staged)return;
    const name=(ov.querySelector("#impseg").value.trim())||segNameFromFile(ov._fname)||"My leads";
    const res=addSegmentLeads(name,_staged.data);
    close();
    toast(`<b>${res.count} leads imported</b> into "${esc(name)}". Go get them.`);
    applyFilter();refresh();if(!$("#v-dash").classList.contains("hidden"))dash();};}
function bindImport(){
  const fi=$("#csvfile");
  document.querySelectorAll(".importbtn").forEach(b=>b.onclick=openImportModal);
  fi.addEventListener("change",e=>{const f=e.target.files[0];if(!f)return;
    const ov=document.getElementById("impov");
    if(ov&&ov._handleFile)ov._handleFile(f);
    fi.value=""});}

/* ---------- LEAD CRUD: add one person, fix one, remove one ---------- */
function ensureSegment(name){
  const hit=Object.keys(SEG).find(k=>(SEG[k].name||"").toLowerCase()===name.toLowerCase());
  if(hit)return hit;
  const keys=Object.keys(SEG);
  const k="P"+(keys.length?Math.max(...keys.map(x=>+x.slice(1)||0))+1:1);
  SEG[k]={name,color:SEGPAL[keys.length%SEGPAL.length],bullets:[]};
  renderSegCss();return k}
function upsertLead(d,id){
  if(id){const l=byId[id];if(!l)return null;
    Object.assign(l,d);saveLeads();indexLeads();save();_dirty=true;return l}
  const nid=LEADS.reduce((a,l)=>Math.max(a,l.id),0)+1;
  const l={id:nid,...d};
  LEADS.push(l);saveLeads();indexLeads();save();_dirty=true;
  /* same backend copy as CSV imports; harmless locally */
  try{fetch("/api/ingest",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({segment:"manual: "+((SEG[l.pri]||{}).name||""),count:1,leads:[l]})}).catch(()=>{})}catch(e){}
  return l}
function findDup(d){
  return LEADS.find(x=>
    (d.li&&x.li&&x.li.replace(/\/+$/,"")===d.li.replace(/\/+$/,""))||
    (d.em&&x.em&&x.em.toLowerCase()===d.em.toLowerCase())||
    (d.co&&x.co&&x.co.trim().toLowerCase()===d.co.trim().toLowerCase()))}
function deleteLead(id){
  const li=LEADS.findIndex(l=>l.id===id);if(li<0)return;
  const lead=LEADS[li],st=S.leads[id],evs=S.events.filter(e=>e.id===id);
  LEADS.splice(li,1);delete S.leads[id];
  S.events=S.events.filter(e=>e.id!==id);
  if(evs.length)resealCheck(evs);
  saveLeads();indexLeads();save();_dirty=true;
  $("#drawer").classList.remove("open");openId=null;
  buildSeglist();applyFilter();renderRows(false);refresh();
  toast(`<b>${esc(lead.co||lead.name)}</b> deleted, history erased`,()=>{
    LEADS.splice(Math.min(li,LEADS.length),0,lead);
    if(st)S.leads[id]=st;
    if(evs.length){S.events.push(...evs);S.events.sort((a,b)=>b.t-a.t);resealCheck(evs)}
    saveLeads();indexLeads();save();_dirty=true;
    buildSeglist();applyFilter();renderRows(false);refresh()});}
function openLeadForm(id){
  if(document.getElementById("leadov"))return;
  const l=id?byId[id]:null;if(id&&!l)return;
  const keys=Object.keys(SEG);
  const segOpts=keys.map(k=>`<option value="${k}" ${l&&l.pri===k?"selected":""}>${esc(SEG[k].name)}</option>`).join("")
    +`<option value="__new" ${keys.length?"":"selected"}>+ New segment…</option>`;
  const F=(idn,ph,val)=>`<input id="${idn}" placeholder="${ph}" value="${esc(val||"")}" style="width:100%">`;
  const ov=document.createElement("div");
  ov.id="leadov";
  ov.style.cssText="position:fixed;inset:0;background:rgba(60,60,70,.28);backdrop-filter:blur(4px);z-index:45;display:flex;justify-content:center;align-items:flex-start;padding:7vh 16px;overflow-y:auto";
  ov.innerHTML=`<div class="fx-card" style="max-width:520px;width:100%">
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <h2 style="font-family:var(--serif);font-size:22px">${id?"Edit lead":"Add a lead"}</h2>
      <button class="tbtn" id="lfx">CLOSE</button></div>
    <div class="fx-sub">${id?"Fix details, move segments, or remove them.":"Met someone worth chasing? Thirty seconds and they're in the machine."}</div>
    <div class="dsec"><div class="k">Who</div>
      <div class="dealrow">${F("lf_name","Full name",l&&l.name)}${F("lf_title","Title, e.g. Founder",l&&l.title)}</div></div>
    <div class="dsec"><div class="k">Company</div>
      <div class="dealrow">${F("lf_co","Company",l&&l.co)}${F("lf_cn","Country",l&&l.cn)}${F("lf_loc","City / location",l&&l.loc)}</div></div>
    <div class="dsec"><div class="k">Reach them</div>
      ${F("lf_li","LinkedIn URL",l&&l.li)}
      <div style="height:8px"></div>${F("lf_em","Email (stored for later, we work LinkedIn)",l&&l.em)}</div>
    <div class="dsec"><div class="k">Segment</div>
      <select id="lf_seg" style="width:100%">${segOpts}</select>
      <input id="lf_segname" placeholder="Name the new segment, e.g. Event leads" style="width:100%;margin-top:8px;display:${keys.length?"none":"block"}"></div>
    <div id="lf_warn" class="ai-note" style="display:none;color:var(--red)"></div>
    <div class="fx-actions">
      <button class="big primary" id="lf_save">${id?"SAVE CHANGES":"ADD LEAD"}</button>
      ${id?`<button class="big" id="lf_del" style="color:var(--red)">DELETE LEAD</button>`:""}
    </div></div>`;
  document.body.append(ov);
  const close=()=>ov.remove();
  ov.addEventListener("click",e=>{if(e.target===ov)close()});
  ov.querySelector("#lfx").onclick=close;
  const segSel=ov.querySelector("#lf_seg"),segName=ov.querySelector("#lf_segname");
  segSel.onchange=()=>{segName.style.display=segSel.value==="__new"?"block":"none"};
  let dupOk=false,delArmed=false;
  ov.querySelector("#lf_save").onclick=()=>{
    const v=x=>ov.querySelector("#lf_"+x).value.trim();
    const d={name:v("name"),title:v("title"),co:v("co"),cn:v("cn"),loc:v("loc"),
      li:v("li"),em:v("em")};
    const warn=ov.querySelector("#lf_warn");
    if(!d.name&&!d.co){warn.textContent="Give me at least a name or a company.";warn.style.display="block";return}
    if(d.li&&!/linkedin\.com\//i.test(d.li)){warn.textContent="That LinkedIn URL doesn't look right, it should contain linkedin.com/";warn.style.display="block";return}
    let pri=segSel.value;
    if(pri==="__new"){pri=ensureSegment(v("segname")||"My leads")}
    d.pri=pri;d.seg=(SEG[pri]||{}).name||"";
    if(!id){const dup=findDup(d);
      if(dup&&!dupOk){dupOk=true;
        warn.innerHTML=`Heads up: looks like <b>${esc(dup.co||dup.name)}</b> is already in your list (#${dup.id}). Click again to add anyway.`;
        warn.style.display="block";return}}
    const saved=upsertLead(d,id);
    close();buildSeglist();applyFilter();renderRows(false);refresh();
    toast(id?`<b>${esc(saved.co||saved.name)}</b> updated`
            :`<b>${esc(saved.co||saved.name)}</b> added to ${esc(d.seg)}. Go get them.`);
    if(!id)openDrawer(saved.id); else if(openId===id)openDrawer(id);};
  const del=ov.querySelector("#lf_del");
  del&&(del.onclick=()=>{
    if(!delArmed){delArmed=true;del.textContent="CLICK AGAIN TO CONFIRM";return}
    close();deleteLead(id)});}

/* ---------- SETTINGS: your system, your numbers ---------- */
function openSettings(){
  const t=TGT(),g=S.goal||{rev:10000,deal:2000};
  const ov=document.createElement("div");
  ov.id="setov";
  ov.style.cssText="position:fixed;inset:0;background:rgba(60,60,70,.28);backdrop-filter:blur(4px);z-index:45;display:flex;justify-content:center;align-items:flex-start;padding-top:10vh";
  ov.innerHTML=`<div class="fx-card" style="max-width:480px;width:100%">
    <h2 style="font-family:var(--serif);font-size:22px;margin-bottom:4px">Settings</h2>
    <div class="fx-sub">Your targets, your call. Zero turns a ring off.</div>
    <div class="dsec"><div class="k">Daily targets</div>
      <div class="dealrow">
        <label style="flex:1;font-size:12px;color:var(--ink3)">Requests<input id="s_req" type="number" min="0" value="${t.req}"></label>
        <label style="flex:1;font-size:12px;color:var(--ink3)">Reachouts<input id="s_reach" type="number" min="0" value="${t.reach}"></label>
        <label style="flex:1;font-size:12px;color:var(--ink3)">Posts<input id="s_post" type="number" min="0" max="1" value="${t.post}"></label>
      </div></div>
    <div class="dsec"><div class="k">Money</div>
      <div class="dealrow">
        <label style="flex:1;font-size:12px;color:var(--ink3)">Monthly revenue goal $<input id="s_rev" type="number" min="0" value="${g.rev}"></label>
        <label style="flex:1;font-size:12px;color:var(--ink3)">Average deal $<input id="s_deal" type="number" min="0" value="${g.deal}"></label>
      </div></div>
    <div class="dsec"><div class="k" style="color:var(--indigo)">${I("spark")} Claude</div>
      <input id="s_key" type="password" placeholder="Claude API key (sk-ant-…) — powers drafting and the coach" value="${esc(S.aiKey||"")}" style="width:100%" autocomplete="off">
      <textarea id="s_pitch" placeholder="What you sell, in your words — Claude only ever claims what you write here…" style="width:100%;min-height:64px;margin-top:8px;resize:vertical">${esc(S.aiPitch||"")}</textarea>
      <div class="ai-note">The key lives in this browser only and is sent to Anthropic, nowhere else. Get one at console.anthropic.com.</div></div>
    <div class="dsec"><div class="k" style="color:#0A6AE8">${I("bolt")} Apollo</div>
      <input id="s_apollo" type="password" placeholder="Apollo API key — powers Find leads (your account, your credits)" value="${esc(S.apolloKey||"")}" style="width:100%" autocomplete="off">
      <div class="ai-note">Stored in this browser only. With Claude, it pulls leads straight into a list. Get it in Apollo → Settings → API.</div></div>
    <div class="fx-actions">
      <button class="big primary" id="s_save">SAVE</button>
      <button class="big" id="s_cancel">CANCEL</button>
    </div></div>`;
  document.body.append(ov);
  ov.addEventListener("click",e=>{if(e.target===ov)ov.remove()});
  ov.querySelector("#s_cancel").onclick=()=>ov.remove();
  ov.querySelector("#s_save").onclick=()=>{
    S.targets={req:Math.max(0,+ov.querySelector("#s_req").value||0),
      reach:Math.max(0,+ov.querySelector("#s_reach").value||0),
      post:Math.max(0,Math.min(1,+ov.querySelector("#s_post").value||0))};
    S.goal={rev:Math.max(0,+ov.querySelector("#s_rev").value||0)||10000,
      deal:Math.max(0,+ov.querySelector("#s_deal").value||0)||2000};
    S.aiKey=ov.querySelector("#s_key").value.trim();
    S.apolloKey=ov.querySelector("#s_apollo").value.trim();
    S.aiPitch=ov.querySelector("#s_pitch").value.trim();
    save();_dirty=true;ov.remove();
    toast("<b>Settings saved.</b> Your targets, your rules.");
    refreshQuiet();if(!$("#v-dash").classList.contains("hidden"))dash();updateTicker()};}

/* ---------- FIND LEADS WITH APOLLO: type a line, Claude + Apollo fill a list ---------- */
const APOLLO_SYS=`You turn a natural-language lead request into Apollo People Search parameters. Reply with ONLY a JSON object — no prose, no code fences. Keys (all optional, include only what the request implies):
- person_titles: array of job titles, e.g. ["Founder","CEO","Managing Director"]
- person_seniorities: array from ["owner","founder","c_suite","partner","vp","head","director","manager"]
- person_locations: array of the PERSON's location, e.g. ["London, United Kingdom"] (prefer this for "in London" style)
- organization_locations: array of the COMPANY hq location, only if that's clearly what's meant
- organization_num_employees_ranges: array of ranges like ["1,10"],["11,50"],["51,200"]
- q_keywords: extra free-text keywords like industry or niche, e.g. "recruitment agency"
- count: integer 1-1000, how many leads to fetch (default 25; if they name a number use it, capped at 1000)
- segment_name: short clean label for this list, e.g. "London Recruitment Founders"
Infer sensibly and return strictly valid JSON.`;
function apolloSummary(q){
  const p=[];
  if(q.person_titles&&q.person_titles.length)p.push(q.person_titles.slice(0,3).join(" / "));
  if(q.person_locations&&q.person_locations.length)p.push("in "+q.person_locations.slice(0,2).join(" / "));
  else if(q.organization_locations&&q.organization_locations.length)p.push("in "+q.organization_locations.slice(0,2).join(" / "));
  if(q.q_keywords)p.push('"'+q.q_keywords+'"');
  return p.join(" · ")||"your request";
}
function apolloFilters(q){
  const b={};
  ["person_titles","person_seniorities","person_locations","organization_locations","organization_num_employees_ranges"]
    .forEach(k=>{if(Array.isArray(q[k])&&q[k].length)b[k]=q[k];});
  if(q.q_keywords)b.q_keywords=String(q.q_keywords);
  return b;
}
function apolloLinkedIn(p){
  let u=p&&p.linkedin_url?String(p.linkedin_url):"";
  if(!u&&p){for(const k in p){const v=p[k];
    if(typeof v==="string"&&/linkedin\.com\/(in|company|pub)\//i.test(v)){u=v;break;}}}
  u=(u||"").trim();
  if(u&&!/^https?:\/\//i.test(u))u="https://"+u.replace(/^\/+/,"");
  return /linkedin\.com\//i.test(u)?u:"";
}
function apolloMap(p,wantEmail){
  const org=(p.organization&&p.organization.name)||p.organization_name||"";
  const loc=[p.city,p.state,p.country].filter(Boolean).join(", ");
  let em="";
  if(wantEmail&&p.email&&!/email_not_unlocked|notunlocked|domain\.com/i.test(p.email))em=p.email;
  return {name:p.name||[p.first_name,p.last_name].filter(Boolean).join(" ").trim(),
    title:p.title||"",co:org,cn:p.country||"",loc:loc,li:apolloLinkedIn(p),em:em};
}
function apolloKey(l){const li=(l.li||"").toLowerCase().replace(/\/+$/,"").replace(/^https?:\/\//,"").replace(/^www\./,"");
  return li||((l.name||"").toLowerCase()+"|"+(l.co||"").toLowerCase());}
function apolloLog(box,html,cls){const d=document.createElement("div");
  d.className="aterm-line"+(cls?" "+cls:"");d.innerHTML=html;box.append(d);box.scrollTop=box.scrollHeight;return d;}
async function runApolloSearch(box,line,wantEmail){
  apolloLog(box,`<span class="aterm-you">›</span> ${esc(line)}`,"you");
  const status=apolloLog(box,`<span class="aterm-dim">reading your request…</span>`);
  let q;
  try{const raw=await aiCall(APOLLO_SYS,line,500);
    q=JSON.parse(String(raw).replace(/```json|```/g,"").trim());}
  catch(e){status.innerHTML=`<span class="aterm-err">Couldn't read that — ${esc((e&&e.message)||e)}</span>`;return;}
  const want=Math.max(1,Math.min(1000,+q.count||+q.per_page||25));
  const filters=apolloFilters(q),head=apolloSummary(q);
  status.innerHTML=`<span class="aterm-dim">understood → ${esc(head)} · up to ${want}. searching Apollo…</span>`;
  let people=[],page=1,total=null;
  try{
    while(people.length<want){
      if(!document.getElementById("apov"))break;
      const body=Object.assign({},filters,{per_page:Math.min(100,want),page:page});
      const r=await fetch("/api/apollo",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({apiKey:S.apolloKey,query:body})});
      const data=await r.json().catch(()=>({}));
      if(!r.ok||data.error)throw new Error(data.error||("Apollo error "+r.status));
      const batch=data.people||[];
      people=people.concat(batch);
      total=(data.pagination&&data.pagination.total_entries)||total;
      status.innerHTML=`<span class="aterm-dim">understood → ${esc(head)}. fetched ${people.length}${total?(" of ~"+total):""}…</span>`;
      if(batch.length<Math.min(100,want))break;
      if(total&&people.length>=total)break;
      if(page>=10)break;
      page++;
    }
  }catch(e){
    if(!people.length){status.innerHTML=`<span class="aterm-err">Apollo — ${esc((e&&e.message)||e)}</span>`;return;}
    apolloLog(box,`<span class="aterm-dim">stopped early (${esc((e&&e.message)||e)}) — keeping ${people.length}.</span>`);
  }
  people=people.slice(0,want);
  if(!people.length){apolloLog(box,`<span class="aterm-dim">No matches. Try broader titles or a wider location.</span>`);return;}
  // Apollo search returns teaser data only (first name, title, company). Enrich to
  // unlock the LinkedIn URL + full name (+ email when chosen). ~1 credit per lead.
  status.innerHTML=`<span class="aterm-dim">${esc(head)}. unlocking LinkedIn${wantEmail?" + email":""} for ${people.length} (~${people.length} credits)…</span>`;
  let done=0;
  for(let i=0;i<people.length;i+=10){
    if(!document.getElementById("apov"))break;
    const batch=people.slice(i,i+10);
    try{
      const r=await fetch("/api/apollo",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({apiKey:S.apolloKey,action:"enrich",reveal:wantEmail,people:batch.map(p=>({
          id:p.id,name:p.name,first_name:p.first_name,last_name:p.last_name,
          organization_name:(p.organization&&p.organization.name)||p.organization_name||"",
          linkedin_url:p.linkedin_url,title:p.title}))})});
      const data=await r.json().catch(()=>({}));
      if(r.ok&&Array.isArray(data.matches)){
        const byId={};data.matches.forEach(m=>{if(m&&m.id)byId[m.id]=m;});
        batch.forEach((p,j)=>{const m=(p.id&&byId[p.id])||data.matches[j];if(!m)return;
          ["linkedin_url","name","first_name","last_name","title","email","city","state","country"].forEach(k=>{if(m[k])p[k]=m[k];});
          const on=(m.organization&&m.organization.name)||m.organization_name;if(on)p.organization={name:on};});
      }
    }catch(e){/* skip a bad batch, keep going */}
    done+=batch.length;
    status.innerHTML=`<span class="aterm-dim">${esc(head)}. unlocked ${done}/${people.length}…</span>`;
  }
  const mapped=people.map(p=>apolloMap(p,wantEmail)).filter(x=>x.name||x.co);
  const seen=new Set(LEADS.map(apolloKey));
  const fresh=mapped.filter(m=>{const k=apolloKey(m);if(seen.has(k))return false;seen.add(k);return true;});
  const dup=mapped.length-fresh.length;
  if(!fresh.length){apolloLog(box,`<span class="aterm-dim">All ${mapped.length} are already in your lists.</span>`);return;}
  const name=String(q.segment_name||line).slice(0,44);
  const res=addSegmentLeads(name,fresh);
  const withLi=fresh.filter(f=>f.li).length, withEmail=fresh.filter(f=>f.em).length;
  apolloLog(box,`<span class="aterm-ok">✓ Added ${res.count} leads to “${esc(name)}”${dup?` (${dup} you already had)`:""} · ${withLi} with LinkedIn${wantEmail?` · ${withEmail} with email`:""}.</span> <span class="aterm-dim">Open Leads to work them.</span>`,"ok");
  buildSeglist();updateNav();if(!$("#v-dash").classList.contains("hidden"))dash();
}
function openApolloFinder(forceSetup){
  if(document.getElementById("apov"))return;
  const ov=document.createElement("div");ov.id="apov";
  ov.style.cssText="position:fixed;inset:0;background:rgba(60,60,70,.28);backdrop-filter:blur(4px);z-index:46;display:flex;justify-content:center;align-items:flex-start;padding:5vh 16px;overflow-y:auto";
  const hasKeys=!!(S.aiKey&&S.apolloKey);
  const setup=forceSetup||!hasKeys;
  ov.innerHTML=`<div class="fx-card" style="max-width:720px;width:100%">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
      <h2 style="font-family:var(--serif);font-size:22px">Find leads with Apollo</h2>
      <div style="display:flex;gap:6px">${setup?"":`<button class="tbtn" id="apkeys" data-tip="change your Claude / Apollo keys">⚙ Keys</button>`}<button class="tbtn" id="apx">CLOSE</button></div></div>`+
    (setup?`
    <div class="fx-sub">Add both keys — they stay in this browser. Apollo runs on your own account and credits.</div>
    <div class="dsec"><div class="k">Claude API key</div>
      <input id="ap_ck" type="password" placeholder="sk-ant-…" value="${esc(S.aiKey||"")}" style="width:100%" autocomplete="off"></div>
    <div class="dsec"><div class="k">Apollo API key</div>
      <input id="ap_ak" type="password" placeholder="Apollo → Settings → Integrations → API" value="${esc(S.apolloKey||"")}" style="width:100%" autocomplete="off"></div>
    <div class="fx-actions"><button class="big primary" id="ap_save">SAVE KEYS</button>${hasKeys?`<button class="big" id="ap_back">BACK</button>`:""}</div>`
    :`
    <div class="fx-sub">Type what you want, like you'd tell a person. Claude reads your line, pulls matching people from Apollo, and drops them into a new list.</div>
    <div class="apctl"><span class="apctl-lbl">Pull</span>
      <div class="seg-toggle" id="ap_mode">
        <button data-m="li" class="on">LinkedIn only</button>
        <button data-m="em">LinkedIn + email</button>
      </div>
      <span class="apctl-hint">Apollo unlocks the LinkedIn URL + full name via enrichment — about 1 credit per lead. “+ email” also reveals their email.</span></div>
    <div id="aterm" class="aterm"><div class="aterm-line aterm-dim">try:  “500 recruitment agency founders in London”   ·   “20 SaaS CEOs in the US”   ·   “1 founder at Monzo”</div></div>
    <div class="aterm-input"><span>›</span><input id="ap_in" placeholder="describe the leads you want — any number, 1 to 1000…" autocomplete="off"><button id="ap_go" class="tbtn">RUN</button></div>
    <div class="ai-note">About 1 Apollo credit per lead (that's how Apollo unlocks LinkedIn). De-duped against leads you already have. Start small to test.</div>`)+
    `</div>`;
  document.body.append(ov);
  const close=()=>ov.remove();
  ov.addEventListener("click",e=>{if(e.target===ov)close()});
  ov.querySelector("#apx").onclick=close;
  if(setup){
    ov.querySelector("#ap_save").onclick=()=>{
      const ck=ov.querySelector("#ap_ck").value.trim(),ak=ov.querySelector("#ap_ak").value.trim();
      if(!ck||!ak){toast("Both keys are needed to run this.");return;}
      S.aiKey=ck;S.apolloKey=ak;save();close();openApolloFinder();};
    const back=ov.querySelector("#ap_back");back&&(back.onclick=()=>{close();openApolloFinder();});
    return;
  }
  ov.querySelector("#apkeys").onclick=()=>{close();openApolloFinder(true);};
  let emailMode=false;
  const modeWrap=ov.querySelector("#ap_mode");
  modeWrap.querySelectorAll("button").forEach(b=>b.onclick=()=>{
    modeWrap.querySelectorAll("button").forEach(x=>x.classList.remove("on"));
    b.classList.add("on");emailMode=b.dataset.m==="em";});
  const box=ov.querySelector("#aterm"),inp=ov.querySelector("#ap_in"),go=ov.querySelector("#ap_go");
  inp.focus();let busy=false;
  const run=async()=>{const line=inp.value.trim();if(!line||busy)return;
    inp.value="";busy=true;go.disabled=true;go.textContent="…";
    try{await runApolloSearch(box,line,emailMode);}catch(e){apolloLog(box,`<span class="aterm-err">${esc((e&&e.message)||e)}</span>`);}
    busy=false;go.disabled=false;go.textContent="RUN";inp.focus();};
  go.onclick=run;
  inp.addEventListener("keydown",e=>{if(e.key==="Enter")run();});
}
/* ---------- CLIENTS: the retention half of the agency ---------- */
const CSTATUS=["Onboarding","Active","Paused","Churned"];
function clientStats(){
  S.clients=S.clients||[];
  const act=S.clients.filter(c=>c.status==="Active"||c.status==="Onboarding");
  const mrr=act.reduce((a,c)=>a+(+c.mrr||0),0);
  return {n:act.length,mrr,churned:S.clients.filter(c=>c.status==="Churned").length}}
function renderClients(){
  S.clients=S.clients||[];
  const st=clientStats();
  const goal=(S.goal||{}).rev||10000;
  $("#ctiles").innerHTML=[
    ["Active clients",st.n,"onboarding counts too","users","#46D66C","#1F9D44"],
    ["MRR",money(st.mrr),"monthly recurring","dollar","#35D07A","#0E9E5C"],
    ["MRR vs goal",Math.min(999,Math.round(100*st.mrr/goal))+"%","of "+money(goal)+"/mo","trend","#4BA3FF","#0A6AE8"],
    ["Churned",st.churned,"keep this at zero","clock","#6A6A72","#44444B"],
  ].map(t=>`<div class="tile" style="--tg1:${t[4]};--tg2:${t[5]}">
    <div class="trow"><span class="ti">${I(t[3])}</span><span class="v">${t[1]}</span></div>
    <div><div class="k">${t[0]}</div><div class="s">${t[2]}</div></div></div>`).join("");
  $("#clist").innerHTML=S.clients.length?
    `<div class="chead"><span>Client</span><span>Status</span><span>$/mo</span>
      <span>Started</span><span>Check-in</span><span>Next step</span><span></span></div>`+
    S.clients.map((c,i)=>`<div class="crow">
      <span class="cname" data-i="${i}" data-tip="edit name, email, LinkedIn"><b>${esc(c.co||"(company)")}</b><span>${esc(c.name||"")}${c.li&&safeUrl(c.li)?` · <a href="${esc(safeUrl(c.li))}" target="_blank" rel="noopener" onclick="event.stopPropagation()">in ↗</a>`:""}</span></span>
      <select data-i="${i}" data-f="status" class="cst-${c.status}">${CSTATUS.map(x=>
        `<option ${x===c.status?"selected":""}>${x}</option>`).join("")}</select>
      <input data-i="${i}" data-f="mrr" type="number" min="0" value="${esc(c.mrr||"")}" placeholder="2000">
      <input data-i="${i}" data-f="start" type="date" value="${esc(c.start||"")}">
      <input data-i="${i}" data-f="ndate" type="date" value="${esc(c.ndate||"")}">
      <input data-i="${i}" data-f="nstep" value="${esc(c.nstep||"")}" placeholder="weekly report, review call…">
      <button class="cdel" data-i="${i}" data-tip="remove">✕</button></div>`).join("")
    :`<div class="cempty">No clients yet. Win a deal on the Pipeline, then hit MAKE CLIENT in its drawer. This page is where the $10k/mo actually lives.</div>`;
  $("#clist").querySelectorAll("input,select").forEach(el=>el.onchange=()=>{
    const c=S.clients[+el.dataset.i];if(!c)return;
    c[el.dataset.f]=el.dataset.f==="mrr"?+el.value||0:el.value;
    save();_dirty=true;renderClients();updateTicker();});
  $("#clist").querySelectorAll(".cdel").forEach(b=>b.onclick=()=>{
    const i=+b.dataset.i;const gone=S.clients.splice(i,1)[0];save();
    toast(`Client removed`,()=>{S.clients.splice(i,0,gone);save();renderClients()});
    renderClients();});
  const ac=$("#addclient");
  ac&&(ac.onclick=()=>openClientForm(null));
  $("#clist").querySelectorAll(".cname").forEach(el=>el.onclick=()=>openClientForm(+el.dataset.i));}
function clientIngest(c){
  try{fetch("/api/ingest",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({segment:"client: "+(c.co||c.name||""),count:1,
      leads:[{name:c.name||"",co:c.co||"",title:"Client",li:c.li||"",em:c.em||"",mrr:+c.mrr||0,status:c.status||""}]})}).catch(()=>{})}catch(e){}}
function openClientForm(i){
  if(document.getElementById("cliov"))return;
  S.clients=S.clients||[];
  const c=(i!=null)?S.clients[i]:null;
  const F=(idn,ph,val,type)=>`<input id="${idn}" placeholder="${ph}" value="${esc(val||"")}"${type?` type="${type}"`:""} style="width:100%">`;
  const ov=document.createElement("div");ov.id="cliov";
  ov.style.cssText="position:fixed;inset:0;background:rgba(60,60,70,.28);backdrop-filter:blur(4px);z-index:46;display:flex;justify-content:center;align-items:flex-start;padding:7vh 16px;overflow-y:auto";
  ov.innerHTML=`<div class="fx-card" style="max-width:520px;width:100%">
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <h2 style="font-family:var(--serif);font-size:22px">${c?"Edit client":"Add a client"}</h2>
      <button class="tbtn" id="clix">CLOSE</button></div>
    <div class="fx-sub">${c?"Update their details.":"Add someone you already work with — name, company, and how to reach them."}</div>
    <div class="dsec"><div class="k">Who</div>
      <div class="dealrow">${F("cl_co","Company",c&&c.co)}${F("cl_name","Contact name",c&&c.name)}</div></div>
    <div class="dsec"><div class="k">Reach them</div>
      ${F("cl_li","LinkedIn URL",c&&c.li)}
      <div style="height:8px"></div>${F("cl_em","Email",c&&c.em,"email")}</div>
    <div class="dsec"><div class="k">Retainer · status · start date</div>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:8px">${F("cl_mrr","$/mo e.g. 2000",c&&c.mrr,"number")}
      <select id="cl_status" style="width:100%">${CSTATUS.map(x=>`<option ${c&&c.status===x?"selected":""}>${x}</option>`).join("")}</select>
      ${F("cl_start","",c?c.start:dayKey(new Date()),"date")}</div></div>
    <div id="cl_warn" class="ai-note" style="display:none;color:var(--red)"></div>
    <div class="fx-actions">
      <button class="big primary" id="cl_save">${c?"SAVE CHANGES":"ADD CLIENT"}</button>
      ${c?`<button class="big" id="cl_del" style="color:var(--red)">DELETE CLIENT</button>`:""}
    </div></div>`;
  document.body.append(ov);
  const close=()=>ov.remove();
  ov.addEventListener("click",e=>{if(e.target===ov)close()});
  ov.querySelector("#clix").onclick=close;
  ov.querySelector("#cl_save").onclick=()=>{
    const v=x=>{const el=ov.querySelector("#cl_"+x);return el?el.value.trim():"";};
    const d={co:v("co"),name:v("name"),li:v("li"),em:v("em"),mrr:+v("mrr")||0,
      status:ov.querySelector("#cl_status").value,start:v("start")};
    const warn=ov.querySelector("#cl_warn");
    if(!d.co&&!d.name){warn.textContent="Give me at least a company or a name.";warn.style.display="block";return}
    if(d.li&&!/linkedin\.com\//i.test(d.li)){warn.textContent="That LinkedIn URL should contain linkedin.com/";warn.style.display="block";return}
    if(c){Object.assign(c,d);}
    else{const nc={cid:S.eseq=(S.eseq||0)+1,ndate:"",nstep:"kickoff call",...d};S.clients.push(nc);clientIngest(nc);}
    save();_dirty=true;close();renderClients();updateTicker();
    toast(`<b>${esc(d.co||d.name)}</b> ${c?"updated":"added as a client"}`);};
  const del=ov.querySelector("#cl_del");let armed=false;
  del&&(del.onclick=()=>{if(!armed){armed=true;del.textContent="CLICK AGAIN TO CONFIRM";return}
    S.clients.splice(i,1);save();close();renderClients();updateTicker();toast("Client removed");});}
function makeClient(id){
  S.clients=S.clients||[];
  const l=byId[id],st=RS(id);
  if(S.clients.some(c=>c.leadId===id)){toast("Already a client");show("clients");return}
  const nc={cid:S.eseq=(S.eseq||0)+1,leadId:id,name:l.name,co:l.co,li:l.li||"",em:l.em||"",
    mrr:+st.val||((S.goal||{}).deal||2000),start:dayKey(new Date()),
    status:"Onboarding",ndate:"",nstep:"kickoff call"};
  S.clients.push(nc);clientIngest(nc);
  save();_dirty=true;
  toast(`<span style="color:#1E9B4A">${I("bank")}</span> <b>${esc(l.co)}</b> is now a client. Set the retainer.`);
  show("clients");}

/* ---------- MEETING PREP: everything you know, one screen ---------- */
function openPrep(id){
  const l=byId[id],s=RS(id);if(!l)return;
  const first=(l.name||"").split(" ")[0]||"there";
  const hist=S.events.filter(e=>e.id===id).slice().reverse()
    .map(e=>`<div style="color:var(--ink3);font-size:12px">· ${new Date(e.t).toLocaleDateString([],{month:"short",day:"numeric"})} — ${esc(e.txt)}</div>`).join("")||'<div style="color:var(--ink3)">no logged history</div>';
  const notes=(s.notes||[]).slice().reverse()
    .map(n=>`<div style="font-size:12px;margin:3px 0"><span style="color:var(--ink3)">${new Date(n.t).toLocaleDateString([],{month:"short",day:"numeric"})}:</span> ${esc(n.x)}</div>`).join("")||'<div style="color:var(--ink3)">no notes yet</div>';
  const m1=(TPLOF(l.pri).m1||"").replaceAll("{first}",first).replaceAll("{co}",l.co||"");
  const overlay=document.createElement("div");
  overlay.id="prepov";
  overlay.style.cssText="position:fixed;inset:0;background:rgba(60,60,70,.28);backdrop-filter:blur(4px);z-index:45;display:flex;justify-content:center;align-items:flex-start;padding:6vh 16px;overflow-y:auto";
  overlay.innerHTML=`<div class="fx-card" style="max-width:640px;width:100%">
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <h2 style="font-family:var(--serif);font-size:20px">${esc(l.name)} <span class="chip seg-${esc(l.pri)}">${esc(l.pri)}</span></h2>
      <button class="tbtn" id="prepx">CLOSE</button></div>
    <div class="fx-sub">${esc(l.title)} — <b>${esc(l.co)}</b> · ${esc(l.loc)||esc(l.cn)}</div>
    ${s.val?`<div style="color:var(--money);font-weight:700;margin-bottom:8px">Deal: ${money(s.val)}${s.stage?" · "+esc(s.stage):""}${s.nstep?" · next: "+esc(s.nstep):""}</div>`:""}
    ${s.rtype&&REPLY[s.rtype]?`<div class="fx-stage">THEY SAID: ${esc(REPLY[s.rtype].label).toUpperCase()}</div>`:""}
    <div class="dsec"><div class="k">What they received from us</div>
      <div class="infobox">${esc(m1)}</div></div>
    <div class="dsec"><div class="k">History</div>${hist}</div>
    <div class="dsec"><div class="k">Notes</div>${notes}</div>
    ${((SEG[l.pri]||{}).bullets||[]).length?`<div class="dsec"><div class="k">The offer menu</div>
      <ul class="bullets">${SEG[l.pri].bullets.map(b=>`<li>${esc(b)}</li>`).join("")}</ul></div>`:""}
    <div class="dsec"><div class="k">Ask these (coaching, not data)</div>
      <ul class="bullets">${PREP_QS.map(q=>`<li>${esc(q)}</li>`).join("")}</ul></div>
    <button class="tbtn" id="prepcp">COPY PREP TO PHONE</button></div>`;
  document.body.append(overlay);
  overlay.addEventListener("click",e=>{if(e.target===overlay)overlay.remove()});
  overlay.querySelector("#prepx").onclick=()=>overlay.remove();
  overlay.querySelector("#prepcp").onclick=()=>{
    const txt=[l.name+" — "+l.title+" @ "+l.co,l.loc||l.cn,
      s.val?("Deal: $"+s.val+(s.stage?" · "+s.stage:"")):"",
      s.rtype&&REPLY[s.rtype]?("They said: "+REPLY[s.rtype].label):"",
      "","HISTORY",...S.events.filter(e=>e.id===id).slice().reverse().map(e=>new Date(e.t).toLocaleDateString()+" "+e.txt),
      "","NOTES",...(s.notes||[]).slice().reverse().map(n=>new Date(n.t).toLocaleDateString()+" "+n.x),
      "","OFFER",...SEG[l.pri].bullets.map(b=>"- "+b),
      "","ASK",...PREP_QS.map(q=>"- "+q)].filter(x=>x!==null).join("\n");
    navigator.clipboard.writeText(txt);
    overlay.querySelector("#prepcp").textContent="COPIED ✓"};
}

/* ---------- CLAUDE BRAIN: drafts in your voice, coaching from your real ledger ----------
   Two ways in, zero setup lies:
   1. Settings → Claude API key: calls Anthropic straight from this browser.
   2. Deployed on Vercel with ANTHROPIC_API_KEY set: /api/ai proxies it.
   Everything it writes is grounded in YOUR templates and YOUR logged numbers. */
const AIMODEL="claude-opus-4-8";
let _ai={};                                   /* per-lead scratch: {inp,out} */
async function aiCall(system,user,max){
  max=max||700;
  if(S.aiKey){
    let r;
    try{r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",
      headers:{"content-type":"application/json","x-api-key":S.aiKey,
        "anthropic-version":"2023-06-01",
        "anthropic-dangerous-direct-browser-access":"true"},
      body:JSON.stringify({model:AIMODEL,max_tokens:max,thinking:{type:"adaptive"},
        system,messages:[{role:"user",content:user}]})});}
    catch(e){throw new Error("Couldn't reach Anthropic. Check your connection.")}
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error((j.error&&j.error.message)||("Claude error "+r.status));
    return (j.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("").trim();
  }
  let r,j=null;
  try{r=await fetch("/api/ai",{method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({system,user,max_tokens:max})});
    j=await r.json();}
  catch(e){throw new Error("Claude isn't set up yet. Open Settings and paste a Claude API key, takes 30 seconds.")}
  if(!r.ok||!j||!j.text)throw new Error((j&&j.error)||"Claude request failed.");
  return j.text.trim();
}
function aiPitch(){return (S.aiPitch||"").trim()||AI_PITCH_DEFAULT}
function aiVoice(pri){
  const t=TPLOF(pri||"default");
  const ex=["conn","m1","f1","f2"].map(k=>t[k]).filter(Boolean).map(x=>"- "+x).join("\n");
  const rep=Object.values(REPLY).slice(0,5).map(r=>"- "+r.txt).join("\n");
  return `You ghostwrite LinkedIn messages as one specific person. Match their voice exactly: sentence rhythm, warmth, how casual they get, contractions, whether they drop apostrophes or capitals. You are them typing, not an assistant writing for them.

THEIR REAL MESSAGES (this is the voice — copy how it feels, never reuse whole lines):
${ex||"- (no templates set, write plainly and briefly)"}

THEIR REAL REPLY STYLE:
${rep}

WHAT THEY SELL (only claim what is stated here, nothing more):
${aiPitch()}

HARD RULES, NEVER BREAK THEM:
- no dash characters of any kind, no exclamation marks, no emoji
- banned phrases and patterns: "Hope you're well", "I hope this finds you", "just checking in", "quick question", "I'd love to", "I help X do Y", "most founders tell me", "leverage", "synergy", "streamline", "circle back", "touch base", anything that smells like a sales guru or an AI
- connection notes stay under 200 characters, messages stay between 30 and 90 words
- never invent facts, numbers, clients, results or services; if you don't know, stay general
- use only the first name and company given, no placeholders
- output the message text alone: no preamble, no quotes around it, no options, no explanation`}
function aiLeadCtx(id){
  const l=byId[id],s=RS(id);
  const seg=SEG[l.pri]||{};
  const hist=S.events.filter(e=>e.id===id).slice(0,5).reverse()
    .map(e=>new Date(e.t).toLocaleDateString()+" "+e.txt).join("\n")||"none";
  const notes=(s.notes||[]).slice(0,3).map(n=>n.x).join("\n")||"none";
  return `LEAD: ${l.name||"unknown"}, ${l.title||""} at ${l.co||""}. ${l.loc||l.cn||""}
SEGMENT: ${seg.name||l.pri}${(seg.bullets||[]).length?"\nSEGMENT NOTES:\n"+seg.bullets.map(b=>"- "+b).join("\n"):""}${l.info?"\nEXTRA INFO: "+l.info:""}
STATE: status ${s.st||"none"}, stage ${s.stage||"none"}${s.val?", deal value $"+s.val:""}${s.nstep?", next step: "+s.nstep:""}${s.rtype&&REPLY[s.rtype]?", their reply was tagged: "+REPLY[s.rtype].label:""}
HISTORY:
${hist}
MY NOTES:
${notes}`}
async function aiDraftReply(id,theirText){
  return aiCall(aiVoice(byId[id].pri),
    aiLeadCtx(id)+`

WHAT THEY JUST SAID:
"""${theirText}"""

TASK: write the one LinkedIn reply I should send back right now. Move the deal forward without being pushy. If they asked something, answer it straight. Output only the message.`,500)}
async function aiTailorOpener(id,aboutText){
  return aiCall(aiVoice(byId[id].pri),
    aiLeadCtx(id)+`

FROM THEIR PROFILE (headline, about, or a recent post):
"""${(aboutText||"").trim()||"nothing extra provided, personalise from the lead line and segment only"}"""

TASK: write two messages for this exact person.
1. The connection request note, under 200 characters.
2. The first message after they accept.
Personalise from the profile info if given: reference at most one specific detail, naturally, never creepy. Separate the two messages with a line containing only ---
Output only the two messages.`,600)}
function aiOutHtml(out,mode){
  if(mode!=="opener")return `<div class="ai-out">${esc(out)}</div>
    <div class="seg-btns" style="margin-top:8px"><button class="tbtn ai-cp" data-p="0">COPY</button></div>`;
  const parts=out.split(/\n-{3,}\n/).map(x=>x.trim()).filter(Boolean).slice(0,2);
  const lbl=["CONN NOTE","MSG 1"];
  return parts.map((p,i)=>`<div class="ai-lbl">${lbl[i]||"MESSAGE"}</div>
    <div class="ai-out">${esc(p)}</div>
    <div class="seg-btns" style="margin-top:6px"><button class="tbtn ai-cp" data-p="${i}">COPY</button></div>`).join("")}
function aiParts(id,mode){
  const out=(_ai[id]&&_ai[id].out)||"";
  return mode==="opener"?out.split(/\n-{3,}\n/).map(x=>x.trim()).filter(Boolean):[out]}
function bindAiCopy(id,mode){
  document.querySelectorAll(".ai-cp").forEach(b=>b.onclick=()=>{
    const p=aiParts(id,mode)[+b.dataset.p]||"";
    navigator.clipboard.writeText(p);
    b.textContent="COPIED ✓";setTimeout(()=>b.textContent="COPY",900)});}
function aiSectionHtml(id,mode){
  const a=_ai[id]||{};
  return `<div class="dsec ai-sec"><div class="k">${I("spark")} Claude — ${
    mode==="reply"?"draft the reply":"tailor the opener"}</div>
   <textarea id="aiin" placeholder="${mode==="reply"
     ?"paste exactly what they said…"
     :"paste their headline, about section or a recent post… (or leave empty)"}">${esc(a.inp||"")}</textarea>
   <div class="seg-btns" style="margin-top:8px">
     <button class="aib" id="aigo">${I("spark")} ${mode==="reply"?"DRAFT REPLY":"WRITE CONN + MSG 1"}</button>
   </div>
   <div id="aiwrap">${a.out?aiOutHtml(a.out,mode):""}</div>
   ${(S.aiKey||a.out)?"":`<div class="ai-note">Wants a Claude API key in Settings, or the hosted version. Writes from your own templates, in your voice.</div>`}</div>`}
function bindAI(id,mode){
  const ta=$("#aiin"),go=$("#aigo");if(!go)return;
  ta.addEventListener("input",()=>{(_ai[id]=_ai[id]||{}).inp=ta.value});
  bindAiCopy(id,mode);
  go.onclick=async()=>{
    const inp=ta.value.trim();
    if(mode==="reply"&&!inp){toast("Paste what they said first — Claude drafts from their exact words.");return}
    (_ai[id]=_ai[id]||{}).inp=inp;
    $("#aiwrap").innerHTML=`<div class="ai-think">Claude is writing in your voice…</div>`;
    go.disabled=true;
    try{
      const out=mode==="reply"?await aiDraftReply(id,inp):await aiTailorOpener(id,inp);
      _ai[id].out=out;
      if(openId===id){const w=$("#aiwrap");
        if(w){w.innerHTML=aiOutHtml(out,mode);bindAiCopy(id,mode)}}
    }catch(e){_ai[id].out="";
      if(openId===id){const w=$("#aiwrap");
        w&&(w.innerHTML=`<div class="ai-out err">${esc(e.message||"Claude request failed")}</div>`)}}
    const g2=$("#aigo");g2&&(g2.disabled=false);};}

/* ---- Claude coach: reads the real ledger, nothing else ---- */
function aiCoachData(){
  const c=countsCached(),st=cohortStats(),cs=clientStats(),cc=coldCash();
  const {req,reach,post}=todayCounts();
  let req7=0,reach7=0,rep7=0;const activeDays=new Set();
  const sod7=Date.now()-7*DAY;
  S.events.forEach(e=>{if(e.t<sod7)return;
    if(e.a==="req"){req7++;activeDays.add(new Date(e.t).toDateString())}
    if(e.a==="reach")reach7++;
    if(e.k==="reply")rep7++});
  const now=new Date();let wonV=0,wonN=0;
  LEADS.forEach(l=>{const s=S.leads[l.id];if(!s||s.stage!=="Won"||!s.won_t)return;
    const d=new Date(s.won_t);
    if(d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()){wonV+=+s.val||0;wonN++}});
  const aging=LEADS.map(l=>{const s=S.leads[l.id];
    if(!s||!s.stage||["Won","Lost"].includes(s.stage)||!s.stage_t)return null;
    return {co:l.co,stage:s.stage,days:daysAgo(s.stage_t),val:+s.val||0}})
    .filter(Boolean).sort((a,b)=>b.days-a.days).slice(0,5);
  const segs={};Object.keys(st.seg).forEach(p=>{const x=st.seg[p];
    segs[(SEG[p]||{}).name||p]={requests:x.req,accepted:x.acc}});
  return {
    today:{requests:req,reachouts:reach,posted:!!post,targets:TGT()},
    totals:{leads:c.total,requests:c.conn,accepted:c.acc,replied:c.rep,
      meetings:c.meet,won:c.won,untouched:c.unt},
    last7days:{requests:req7,reachouts:reach7,replies:rep7,activeDays:activeDays.size},
    streakDays:streakCount(),
    perSegmentAccepts:segs,
    pipeline:{openValue:c.pipeV,oldestOpenDeals:aging,
      goingCold:{value:cc.v,deals:cc.n}},
    repliesWaitingOnMe:LEADS.filter(l=>{const s=S.leads[l.id];
      return s&&s.st==="Replied"&&!s.ans_t}).length,
    clients:{active:cs.n,mrr:cs.mrr,churned:cs.churned},
    goal:{monthlyRevenue:(S.goal||{}).rev||10000,avgDeal:(S.goal||{}).deal||2000,
      wonThisMonth:wonV,dealsWonThisMonth:wonN}}}
async function aiCoach(){
  return aiCall(`You are a blunt, experienced outbound operator coaching the owner of this pipeline. Every number you get is real, logged by them, nothing is estimated. Rules: plain text only, no markdown symbols, no emoji, no exclamation marks. Where a sample is under 30, say the sample is too small to trust instead of drawing conclusions from it. Never invent or extrapolate numbers. Talk like a sharp friend who wants them to make money, not a consultant.

Structure your answer exactly as:
WHAT THE NUMBERS SAY
(3 short lines max)
FIX THIS WEEK
(numbered moves, 3 max, each tied to a specific number they gave you)
TODAY
(one single concrete action)

Stay under 220 words total.`,
  "My pipeline data, all real logged actions:\n"+JSON.stringify(aiCoachData(),null,1),600)}
function openCoach(){
  if(document.getElementById("coachov"))return;
  if(!LEADS.length){toast("Import leads and log some work first — the coach only reads real numbers.");return}
  const ov=document.createElement("div");
  ov.id="coachov";
  ov.style.cssText="position:fixed;inset:0;background:rgba(60,60,70,.28);backdrop-filter:blur(4px);z-index:45;display:flex;justify-content:center;align-items:flex-start;padding:8vh 16px;overflow-y:auto";
  ov.innerHTML=`<div class="fx-card" style="max-width:560px;width:100%">
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <h2 style="font-family:var(--serif);font-size:22px"><span style="color:var(--indigo)">${I("spark")}</span> Claude coach</h2>
      <button class="tbtn" id="coachx">CLOSE</button></div>
    <div class="fx-sub">Reads your real ledger, tells you what to fix. Straight talk from your own numbers.</div>
    <div id="coachbody"><div class="ai-think">Reading your numbers…</div></div>
    <div class="seg-btns" style="margin-top:12px">
      <button class="aib" id="coachagain" style="display:none">${I("spark")} RUN AGAIN</button>
    </div></div>`;
  document.body.append(ov);
  ov.addEventListener("click",e=>{if(e.target===ov)ov.remove()});
  ov.querySelector("#coachx").onclick=()=>ov.remove();
  const run=async()=>{
    const body=ov.querySelector("#coachbody"),again=ov.querySelector("#coachagain");
    body.innerHTML=`<div class="ai-think">Reading your numbers…</div>`;
    again.style.display="none";
    try{const out=await aiCoach();
      body.innerHTML=`<div class="ai-out">${esc(out)}</div>`}
    catch(e){body.innerHTML=`<div class="ai-out err">${esc(e.message||"Claude request failed")}</div>`}
    again.style.display="";};
  ov.querySelector("#coachagain").onclick=run;
  run();}
$("#bcoach").onclick=()=>openCoach();
$("#bapollo")&&($("#bapollo").onclick=()=>openApolloFinder());
$("#bfeed").onclick=()=>openFeed();

/* ---------- founder card: the quiet door to Ascent ---------- */
const FOUNDER_LI="https://www.linkedin.com/in/getascent/";
function openFounder(){
  if(document.getElementById("fdrov"))return;
  const ov=document.createElement("div");
  ov.id="fdrov";
  ov.style.cssText="position:fixed;inset:0;background:rgba(60,60,70,.28);backdrop-filter:blur(4px);z-index:45;display:flex;justify-content:center;align-items:flex-start;padding:10vh 16px;overflow-y:auto";
  ov.innerHTML=`<div class="fx-card" style="max-width:460px;width:100%">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <img class="fdr-photo" src="assets/founder.png" alt="Jamil Ahmed">
      <button class="tbtn" id="fdrx">CLOSE</button></div>
    <h2 style="font-family:var(--serif);font-size:22px">Jamil Ahmed</h2>
    <div class="fdr-role">Founder, Ascent · B2B GTM &amp; Outbound · getascent.co</div>
    <div class="fdr-p">Bloody good at turning meh businesses into hell yeah. I build
      outbound engines for B2B companies. GTM, pipeline, messaging, execution, the
      whole machine, running everywhere from the USA to the UK to the UAE to
      Australia, and across Europe. The calendar fills, you close, everyone eats.</div>
    <div class="fdr-p">Started two agencies, shipped an app solo that landed
      in the Microsoft for Startups program, now all in on Ascent. This OS is the
      exact machine we win our own clients with every day. Take it and run it
      yourself, or hand us the keys and we drive the whole thing for you.</div>
    <div style="margin-top:6px">
      <a class="fdr-li" href="${FOUNDER_LI}" target="_blank" rel="noopener">${I("linkedin")} CONNECT ON LINKEDIN</a>
      <a class="fdr-site" href="https://getascent.co" target="_blank" rel="noopener">getascent.co</a>
    </div></div>`;
  document.body.append(ov);
  ov.addEventListener("click",e=>{if(e.target===ov)ov.remove()});
  ov.querySelector("#fdrx").onclick=()=>ov.remove();}
const fc=$("#fcard");fc&&(fc.onclick=()=>openFounder());

/* ---------- multi-tab guard: last write wins, both tabs converge ---------- */
window.addEventListener("storage",e=>{
  if(e.key!==KEY||!e.newValue)return;
  try{S=JSON.parse(e.newValue);S.leads=S.leads||{};S.events=S.events||[];S.segs=S.segs||{};
    SEG=S.segs;loadLeads();renderSegCss();buildSeglist();_dirty=true;
    toast("<b>Synced</b> from another tab");refresh()}catch(_){}});

/* ---------- overflow menu ---------- */
$("#menub").onclick=e=>{e.stopPropagation();$("#menu").classList.toggle("hidden")};
document.addEventListener("click",e=>{
  if(!e.target.closest("#menuwrap"))$("#menu").classList.add("hidden")});
$("#menu").addEventListener("click",()=>$("#menu").classList.add("hidden"));
$("#bhelp").onclick=()=>show("help");

/* ---------- tooltip ---------- */
/* hover tooltips disabled — no pre-click text pops up on nav/menu/buttons */
document.addEventListener("mouseover",()=>{const tip=$("#tip");if(tip)tip.style.display="none"});
document.addEventListener("mousemove",e=>{const tip=$("#tip");
  if(tip.style.display!=="block")return;
  tip.style.left=(e.clientX+12)+"px";tip.style.top=(e.clientY+12)+"px"});

/* ---------- keyboard ---------- */
let gPending=false;
document.addEventListener("keydown",e=>{
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();
    $("#palette").classList.contains("hidden")?palOpen():palClose();return}
  const typing=["INPUT","TEXTAREA","SELECT"].includes(document.activeElement.tagName);
  if(e.key==="Escape"){
    if(!$("#palette").classList.contains("hidden")){palClose();return}
    if(focusActive){show("dash");return}
    $("#drawer").classList.remove("open");openId=null;
    document.activeElement.blur();return}
  if(typing)return;
  if(focusActive){
    const cur=focusCurrent();
    if(cur){
      if(e.key==="Enter"){$("#fxdone")&&$("#fxdone").click();return}
      if(e.key.toLowerCase()==="s"){$("#fxskip")&&$("#fxskip").click();return}
      if(e.key.toLowerCase()==="c"){$("#fxcopy")&&$("#fxcopy").click();return}
      if(e.key.toLowerCase()==="o"){const l=byId[cur.id];const u=safeUrl(l&&l.li);u&&window.open(u,"_blank");return}}
    return}
  if(e.key==="/"){e.preventDefault();show("leads");$("#q").focus();return}
  if(e.key==="g"){gPending=true;setTimeout(()=>gPending=false,600);return}
  if(gPending){if(e.key==="d")show("dash");if(e.key==="l")show("leads");
    if(e.key==="p")show("pipe");if(e.key==="f")show("focus");gPending=false;return}
  if(!$("#v-leads").classList.contains("hidden")){
    if(!filtered.length)return;
    if(e.key==="j"||e.key==="k"){
      const old=$("#tbody").querySelector("tr.sel");old&&old.classList.remove("sel");
      selIdx=Math.max(0,Math.min(shown-1,selIdx+(e.key==="j"?1:-1)));
      const nw=$("#tbody").querySelector(`tr[data-i="${selIdx}"]`);
      if(nw){nw.classList.add("sel");nw.scrollIntoView({block:"nearest"})}}
    if(e.key==="Enter"&&selIdx>=0&&selIdx<filtered.length)openDrawer(filtered[selIdx].id);}
});

/* ---------- boot ---------- */
let lastDay=new Date().toDateString(),lastTicker="";
function tick(){
  const now=new Date();
  $("#clock").textContent=now.toLocaleDateString([],{weekday:"short",day:"numeric",month:"short"}).toUpperCase();
  if(now.toDateString()!==lastDay){lastDay=now.toDateString();_dirty=true;
    if(!$("#v-dash").classList.contains("hidden"))dash();updateTicker()}
}
/* the user's list priority order (falls back to natural order, appends any new lists) */
function orderedSegs(){
  const ord=(S.segOrder||[]).filter(k=>SEG[k]);
  Object.keys(SEG).forEach(k=>{if(!ord.includes(k))ord.push(k)});
  return ord;}
function moveSeg(p,dir){
  const ord=orderedSegs(),i=ord.indexOf(p),j=i+(dir==="up"?-1:1);
  if(i<0||j<0||j>=ord.length)return;
  [ord[i],ord[j]]=[ord[j],ord[i]];S.segOrder=ord;save();buildSeglist();}
function buildSeglist(){
  const per={};LEADS.forEach(l=>per[l.pri]=(per[l.pri]||0)+1);
  const ord=orderedSegs();
  $("#seglist").innerHTML=ord.map((p,i)=>
    `<div class="segrow" data-p="${esc(p)}"><span class="sdot2" style="background:${(SEG[p]||{}).color||"#8E8E93"}"></span>
     <span class="segnm">${esc(SEG[p].name)}</span><span class="sc">${per[p]||0}</span>
     <span class="segmv"><button class="segkebab" data-p="${esc(p)}" aria-label="list options" data-tip="rename, reorder or delete">⋮</button></span></div>`).join("");
  $("#seglist").querySelectorAll(".segrow").forEach(r=>r.onclick=()=>{
    show("leads");$("#fseg").value=r.dataset.p;renderRows(true)});
  $("#seglist").querySelectorAll(".segkebab").forEach(b=>b.onclick=e=>{
    e.stopPropagation();openSegMenu(b.dataset.p,b);});
  rebuildSegFilter();}
function rebuildSegFilter(){
  const sel=$("#fseg");if(!sel)return;
  const cur=sel.value;
  sel.innerHTML='<option value="">All segments</option>'+
    orderedSegs().map(p=>`<option value="${esc(p)}">${esc((SEG[p]||{}).name||p)}</option>`).join("");
  sel.value=(cur&&SEG[cur])?cur:"";}
function closeSegMenu(){const m=document.getElementById("segmenu");if(m)m.remove();}
function openSegMenu(p,btn){
  if(document.getElementById("segmenu")){closeSegMenu();return;}
  const ord=orderedSegs(),i=ord.indexOf(p);
  const m=document.createElement("div");m.id="segmenu";m.className="segmenu";
  m.innerHTML=`<button data-a="ren">Rename</button>`+
    `<button data-a="up" ${i<=0?"disabled":""}>Move up</button>`+
    `<button data-a="down" ${i>=ord.length-1?"disabled":""}>Move down</button>`+
    `<button data-a="del" class="danger">Delete list</button>`;
  document.body.append(m);
  const r=btn.getBoundingClientRect();
  m.style.top=(r.bottom+6)+"px";
  m.style.left=Math.max(8,Math.min(r.right-m.offsetWidth,window.innerWidth-m.offsetWidth-8))+"px";
  m.querySelectorAll("button").forEach(b=>b.onclick=e=>{e.stopPropagation();
    if(b.disabled)return;const a=b.dataset.a;closeSegMenu();
    if(a==="ren")renameSegment(p);else if(a==="up")moveSeg(p,"up");
    else if(a==="down")moveSeg(p,"down");else if(a==="del")deleteSegment(p);});
  setTimeout(()=>document.addEventListener("click",closeSegMenu,{once:true}),0);}
function renameSegment(p){
  if(!SEG[p]||document.getElementById("segrenov"))return;
  const ov=document.createElement("div");ov.id="segrenov";
  ov.style.cssText="position:fixed;inset:0;background:rgba(60,60,70,.28);backdrop-filter:blur(4px);z-index:46;display:flex;justify-content:center;align-items:flex-start;padding-top:12vh";
  ov.innerHTML=`<div class="fx-card" style="max-width:420px;width:100%">
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <h2 style="font-family:var(--serif);font-size:20px">Rename list</h2>
      <button class="tbtn" id="srx">CLOSE</button></div>
    <div class="fx-sub">Give this segment a clear name.</div>
    <input id="srin" value="${esc(SEG[p].name||"")}" placeholder="e.g. Agencies" style="width:100%">
    <div class="fx-actions"><button class="big primary" id="srsave">SAVE</button></div></div>`;
  document.body.append(ov);
  const close=()=>ov.remove();
  ov.addEventListener("click",e=>{if(e.target===ov)close()});
  ov.querySelector("#srx").onclick=close;
  const inp=ov.querySelector("#srin");inp.focus();inp.select();
  const commit=()=>{const nm=inp.value.trim();if(!nm){inp.focus();return}
    SEG[p].name=nm;LEADS.forEach(l=>{if(l.pri===p)l.seg=nm;});
    saveLeads();save();renderSegCss();buildSeglist();refresh();
    close();toast(`List renamed to <b>${esc(nm)}</b>`);};
  ov.querySelector("#srsave").onclick=commit;
  inp.addEventListener("keydown",e=>{if(e.key==="Enter")commit();});}
function deleteSegment(p){
  if(!SEG[p]||document.getElementById("segdelov"))return;
  const name=SEG[p].name||"this list";
  const n=LEADS.filter(l=>l.pri===p).length;
  const ov=document.createElement("div");ov.id="segdelov";
  ov.style.cssText="position:fixed;inset:0;background:rgba(60,60,70,.28);backdrop-filter:blur(4px);z-index:46;display:flex;justify-content:center;align-items:flex-start;padding-top:12vh";
  ov.innerHTML=`<div class="fx-card" style="max-width:440px;width:100%">
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <h2 style="font-family:var(--serif);font-size:20px">Delete list</h2>
      <button class="tbtn" id="sdx">CLOSE</button></div>
    <div class="fx-sub">Remove <b>${esc(name)}</b> and its <b>${n}</b> lead${n===1?"":"s"} from the app. This can't be undone here.</div>
    <div class="fx-actions"><button class="big" id="sddel" style="color:var(--red)">DELETE ${n} LEAD${n===1?"":"S"}</button></div></div>`;
  document.body.append(ov);
  const close=()=>ov.remove();
  ov.addEventListener("click",e=>{if(e.target===ov)close()});
  ov.querySelector("#sdx").onclick=close;
  let armed=false;const btn=ov.querySelector("#sddel");
  btn.onclick=()=>{
    if(!armed){armed=true;btn.textContent="CLICK AGAIN TO CONFIRM";return}
    for(let i=LEADS.length-1;i>=0;i--)if(LEADS[i].pri===p){delete S.leads[LEADS[i].id];LEADS.splice(i,1);}
    delete SEG[p];
    if(S.segOrder)S.segOrder=S.segOrder.filter(k=>k!==p);
    if(S.focusSeg===p)S.focusSeg="";
    saveLeads();indexLeads();save();renderSegCss();buildSeglist();applyFilter();refresh();
    close();toast(`<b>${esc(name)}</b> deleted (${n} lead${n===1?"":"s"}).`);};}
function updateNav(){
  const c=countsCached();
  const due=dueList().length+(S.todos||[]).length;
  $("#nc-dash").textContent=due||"";
  $("#nc-leads").textContent=c.unt;
  $("#nc-pipe").textContent=c.open||"";
  $("#nc-focus").textContent="";
  const cs=clientStats();
  $("#nc-clients").textContent=cs.n?cs.n+" · "+money(cs.mrr):"";
  /* monthly goal progress from real Won deals only */
  const now=new Date();let wv=0,wn=0;
  LEADS.forEach(l=>{const st=S.leads[l.id];if(!st||st.stage!=="Won"||!st.won_t)return;
    const d=new Date(st.won_t);
    if(d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()){wv+=+st.val||0;wn++}});
  const goal=(S.goal||{}).rev||10000;
  $("#sfval").textContent=money(wv);
  $("#sffill").style.width=Math.min(100,100*wv/goal)+"%";
  $("#sfsub").textContent=wn?`${wn} deal${wn===1?"":"s"} closed · goal ${money(goal)}`
    :`goal ${money(goal)} · ${money((S.goal||{}).deal||2000)} avg deal`;}
function updateTicker(){
  const c=countsCached(),t=todayCounts();
  let alarm="";let mx=0;
  LEADS.forEach(l=>{const s=S.leads[l.id];if(s&&s.st==="Replied"&&!s.ans_t){
    const h=replyHrs(s);if(h!==null&&h>mx)mx=h;else if(h===null)mx=Math.max(mx,0)}});
  const anyWait=LEADS.some(l=>{const s=S.leads[l.id];return s&&s.st==="Replied"&&!s.ans_t});
  if(anyWait)alarm=`<b style="color:var(--crit)">● REPLY${mx?" "+mx+"h":""}</b> · `;
  const cs2=clientStats();
  const html=alarm+`<b>${t.req+t.reach}</b> TODAY · <b>${money(c.pipeV)}</b> PIPE`
    +(cs2.mrr?` · <b style="color:var(--money)">${money(cs2.mrr)}</b> MRR`:"");
  if(html!==lastTicker){lastTicker=html;$("#ticker").innerHTML=html}
  updateNav();
}
document.querySelectorAll("[data-ic]").forEach(el=>el.innerHTML=I(el.dataset.ic));
loadLeads();
/* private seed (js/mydata.js, gitignored): adopts once, only into an empty app */
if(LEADS.length===0&&window.SEED_LEADS&&window.SEED_LEADS.length){
  LEADS=window.SEED_LEADS;saveLeads();indexLeads();
  Object.assign(S.segs,window.SEED_SEGS||{});save();}
if(window.SEED_TPL&&typeof TPL!=="undefined")Object.assign(TPL,window.SEED_TPL);
if(window.SEED_REPLY&&typeof REPLY!=="undefined")Object.assign(REPLY,window.SEED_REPLY);
if(window.SEED_DEAL&&typeof DEAL_TPL!=="undefined")Object.assign(DEAL_TPL,window.SEED_DEAL);
if(window.SEED_AI&&window.SEED_AI.pitch&&!S.aiPitch)S.aiPitch=window.SEED_AI.pitch;
renderSegCss();buildSeglist();bindImport();
$("#bsettings").onclick=()=>openSettings();
const alb=$("#addleadb");alb&&(alb.onclick=()=>openLeadForm());
S.goal=S.goal||{rev:10000,deal:2000};   /* editable via ⌘K ">goal 10000 2000" */
setInterval(tick,15000);tick();updateTicker();
applyFilter();dash();
(function(){const h=location.hash.slice(1);
  if(h.startsWith("lead=")){show("leads");openDrawer(+h.slice(5))}
  else if(VIEWS.includes(h))show(h)})();

