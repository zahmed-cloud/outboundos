/* Accounts + cloud sync. Live site with AUTH_CFG filled = login required and
   the pipeline follows the user between devices. Local file:// = open, no gate.
   Storage stays localStorage-first; the cloud holds a synced snapshot per user
   (table user_state, row-level security, last write wins). */
(function(){
const K_APP="outbound_os_v1", K_LEADS="outbound_os_leads_v1",
      K_PUSH="outbound_os_push_t", K_LOOP="outbound_os_reloaded",
      K_OWNER="outbound_os_owner";
const jparse=(s,f)=>{try{return JSON.parse(s)}catch(_){return f}};
const REQUIRED=location.protocol.startsWith("http")
  && window.AUTH_CFG && AUTH_CFG.url && AUTH_CFG.anon
  && typeof supabase!=="undefined";
if(!REQUIRED)return;                          /* local mode: no gate, no sync */
const sb=supabase.createClient(AUTH_CFG.url,AUTH_CFG.anon);

/* ---- gate ---- */
const ov=document.createElement("div");
ov.id="authov";
ov.innerHTML=`<div class="auth-card">
  <a class="auth-x" href="index.html" aria-label="Back to the homepage" data-tip="back to home">✕</a>
  <a class="auth-brand" href="index.html">Ascent<i>.</i> <small>OUTBOUND OS</small></a>
  <h2 id="auth-h">Welcome back.</h2>
  <p class="auth-sub" id="auth-sub">Log in to pick up your pipeline where you left off.</p>

  <div id="view-login">
    <input class="auth-in" id="li-email" type="email" placeholder="you@company.com" autocomplete="email">
    <input class="auth-in" id="li-pass" type="password" placeholder="your password" autocomplete="current-password">
    <button id="auth-go">LOG IN</button>
    <div class="auth-note">Forgot it, or hate passwords?
    <a href="#" id="auth-otp">Email me a login link.</a></div>
    <div class="auth-note auth-switch">Don't have an account?
    <a href="#" id="to-signup">Create a free account.</a></div>
  </div>

  <div id="view-signup" class="hidden">
    <input class="auth-in" id="su-name" type="text" placeholder="Your name" autocomplete="name">
    <input class="auth-in" id="su-email" type="email" placeholder="you@company.com" autocomplete="email">
    <input class="auth-in" id="su-pass" type="password" placeholder="password, 8 or more characters" autocomplete="new-password">
    <input class="auth-in" id="su-biz" type="text" placeholder="Business name" autocomplete="organization">
    <input class="auth-in" id="su-loc" type="text" placeholder="Location — city, country">
    <select class="auth-in" id="su-type">
      <option value="">What kind of business?</option>
      <option>Agency</option>
      <option>Recruitment</option>
      <option>SaaS / Software</option>
      <option>Consulting</option>
      <option>Freelancer / Solo</option>
      <option>Other</option>
    </select>
    <div class="auth-note auth-savage">Make up a fresh password, don't reuse your
    bank one. We're a lean free tool — we don't exactly have the budget for Z+ data security.</div>
    <button id="auth-new">CREATE FREE ACCOUNT</button>
    <div class="auth-note">Creating an account means you're good with the
    <a href="/terms" target="_blank" rel="noopener">terms</a>
    and <a href="/privacy" target="_blank" rel="noopener">privacy policy</a>.</div>
    <div class="auth-note auth-switch">Already have an account?
    <a href="#" id="to-login">Log in.</a></div>
  </div>

  <div id="auth-sent" class="hidden">
    <div class="auth-sent-t">Check your inbox.</div>
    <p class="auth-sub" id="auth-sent-p">Click the link we sent and you're in.
    Not there in a minute? Check spam or <a href="#" id="auth-again">go back</a>.</p>
  </div>
  <div id="auth-err" class="auth-err hidden"></div>
</div>`;
document.body.append(ov);
document.documentElement.classList.add("auth-locked");

const $a=q=>ov.querySelector(q);
const err=m=>{const e=$a("#auth-err");e.textContent=m;e.classList.remove("hidden")};
const emailOK=v=>/^\S+@\S+\.\S+$/.test((v||"").trim());
const busy=(id,on,lbl)=>{const b=$a(id);b.disabled=on;b.textContent=on?"ONE SEC…":lbl};
const showSent=t=>{if(t)$a("#auth-sent-p").firstChild.textContent=t;
  $a("#view-login").classList.add("hidden");$a("#view-signup").classList.add("hidden");
  $a("#auth-sent").classList.remove("hidden")};
function showView(which){
  const s=which==="signup";
  $a("#view-login").classList.toggle("hidden",s);
  $a("#view-signup").classList.toggle("hidden",!s);
  $a("#auth-h").textContent=s?"Your OS is ready.":"Welcome back.";
  $a("#auth-sub").textContent=s
    ?"Free account, two minutes. Tell us a bit about you and your pipeline follows you between devices."
    :"Log in to pick up your pipeline where you left off.";
  $a("#auth-err").classList.add("hidden");}
/* which form opens first: the landing 'Sign up free' link carries #signup, 'Log in' carries #login */
showView(/signup/i.test(location.hash)?"signup":"login");
$a("#to-signup").onclick=e=>{e.preventDefault();showView("signup")};
$a("#to-login").onclick=e=>{e.preventDefault();showView("login")};

async function login(){
  const em=($a("#li-email").value||"").trim();
  if(!emailOK(em)){err("That email doesn't look right, check it once more.");return}
  const pw=$a("#li-pass").value;
  if(pw.length<8){err("Password needs 8 or more characters.");return}
  $a("#auth-err").classList.add("hidden");busy("#auth-go",true,"LOG IN");
  const {error}=await sb.auth.signInWithPassword({email:em,password:pw});
  busy("#auth-go",false,"LOG IN");
  if(error)err(/invalid/i.test(error.message)
    ?"No luck — wrong password, or no account yet. Try 'Create a free account'."
    :error.message);}
async function signup(){
  const name=($a("#su-name").value||"").trim();
  const em=($a("#su-email").value||"").trim();
  const pw=$a("#su-pass").value;
  const biz=($a("#su-biz").value||"").trim();
  const loc=($a("#su-loc").value||"").trim();
  const type=$a("#su-type").value;
  if(!name){err("Add your name so we know who you are.");return}
  if(!emailOK(em)){err("That email doesn't look right, check it once more.");return}
  if(pw.length<8){err("Password needs 8 or more characters. Not your bank one, remember.");return}
  if(!biz){err("Add your business name.");return}
  if(!loc){err("Add your location.");return}
  if(!type){err("Pick what kind of business you run.");return}
  $a("#auth-err").classList.add("hidden");busy("#auth-new",true,"CREATE FREE ACCOUNT");
  const {data,error}=await sb.auth.signUp({email:em,password:pw,
    options:{data:{full_name:name,business_name:biz,business_location:loc,business_type:type},
      emailRedirectTo:location.origin+location.pathname}});
  busy("#auth-new",false,"CREATE FREE ACCOUNT");
  if(error){err(/already registered/i.test(error.message)
    ?"That email already has an account — log in instead.":error.message);return}
  if(!data.session)showSent("Confirm your email to finish. ");}
async function sendLink(){
  const em=($a("#li-email").value||"").trim();
  if(!emailOK(em)){err("Enter your email first, then I'll send the link.");return}
  $a("#auth-err").classList.add("hidden");
  const {error}=await sb.auth.signInWithOtp({email:em,
    options:{emailRedirectTo:location.origin+location.pathname}});
  if(error){err(error.message);return}
  showSent();}
$a("#auth-go").onclick=login;
$a("#auth-new").onclick=signup;
$a("#li-pass").addEventListener("keydown",e=>{if(e.key==="Enter")login()});
$a("#su-loc").addEventListener("keydown",e=>{if(e.key==="Enter")signup()});
$a("#auth-otp").onclick=e=>{e.preventDefault();sendLink()};
const ag=$a("#auth-again");ag&&(ag.onclick=e=>{e.preventDefault();
  $a("#auth-sent").classList.add("hidden");showView(/signup/i.test(location.hash)?"signup":"login")});

/* ---- sync ---- */
let user=null,pushT=null,lastHash="";
const snap=()=>((localStorage.getItem(K_APP)||"")+"§"+(localStorage.getItem(K_LEADS)||""));
async function push(){
  if(!user)return;
  const h=snap();if(h===lastHash)return;lastHash=h;
  const now=new Date().toISOString();
  const {error}=await sb.from("user_state").upsert({user_id:user.id,
    app:jparse(localStorage.getItem(K_APP),{}),
    leads:jparse(localStorage.getItem(K_LEADS),[]),
    updated_at:now});
  if(!error){pushT=now;localStorage.setItem(K_PUSH,now);localStorage.setItem(K_OWNER,user.id)}}
async function firstSync(){
  const {data}=await sb.from("user_state").select("app,leads,updated_at")
    .eq("user_id",user.id).maybeSingle();
  /* SECURITY: if this browser's local snapshot belongs to a DIFFERENT account (shared
     machine), never push it into this account — boot clean from remote (or empty). */
  const owner=localStorage.getItem(K_OWNER)||"";
  if(owner&&owner!==user.id&&!sessionStorage.getItem(K_LOOP)){
    localStorage.setItem(K_APP,JSON.stringify((data&&data.app)||{}));
    localStorage.setItem(K_LEADS,JSON.stringify((data&&data.leads)||[]));
    localStorage.setItem(K_PUSH,(data&&data.updated_at)||"");
    localStorage.setItem(K_OWNER,user.id);
    sessionStorage.setItem(K_LOOP,"1");
    location.reload();return}
  const localPush=localStorage.getItem(K_PUSH)||"";
  const hasLocal=!!localStorage.getItem(K_LEADS)&&(jparse(localStorage.getItem(K_LEADS),[])||[]).length>0;
  if(data&&(!hasLocal||(data.updated_at&&data.updated_at>localPush))){
    /* remote wins: apply and reload once so the app boots from it */
    if(sessionStorage.getItem(K_LOOP))return;      /* never loop */
    localStorage.setItem(K_APP,JSON.stringify(data.app||{}));
    localStorage.setItem(K_LEADS,JSON.stringify(data.leads||[]));
    localStorage.setItem(K_PUSH,data.updated_at||new Date().toISOString());
    localStorage.setItem(K_OWNER,user.id);
    sessionStorage.setItem(K_LOOP,"1");
    location.reload();return}
  sessionStorage.removeItem(K_LOOP);
  localStorage.setItem(K_OWNER,user.id);
  lastHash="";await push();                         /* local wins: seed the cloud */
  setInterval(push,10000);                          /* debounced background sync */
  window.addEventListener("beforeunload",push);}
function unlock(){
  document.documentElement.classList.remove("auth-locked");
  ov.remove();
  const so=document.getElementById("bsignout");
  if(so){so.classList.remove("hidden");
    so.innerHTML=so.innerHTML.replace("Sign out","Sign out · "+(user.email||""));
    so.onclick=async()=>{await push();await sb.auth.signOut();
      [K_APP,K_LEADS,K_PUSH,K_OWNER].forEach(k=>localStorage.removeItem(k));
      sessionStorage.removeItem(K_LOOP);location.reload()}}}
sb.auth.onAuthStateChange((_e,session)=>{
  if(session&&session.user&&!user){user=session.user;unlock();firstSync()}});
sb.auth.getSession().then(({data})=>{
  if(data&&data.session&&data.session.user&&!user){
    user=data.session.user;unlock();firstSync()}});
})();
