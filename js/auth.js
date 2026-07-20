/* Accounts + cloud sync. Live site with AUTH_CFG filled = login required and
   the pipeline follows the user between devices. Local file:// = open, no gate.
   Storage stays localStorage-first; the cloud holds a synced snapshot per user
   (table user_state, row-level security, last write wins). */
(function(){
const K_APP="outbound_os_v1", K_LEADS="outbound_os_leads_v1",
      K_PUSH="outbound_os_push_t", K_LOOP="outbound_os_reloaded";
const REQUIRED=location.protocol.startsWith("http")
  && window.AUTH_CFG && AUTH_CFG.url && AUTH_CFG.anon
  && typeof supabase!=="undefined";
if(!REQUIRED)return;                          /* local mode: no gate, no sync */
const sb=supabase.createClient(AUTH_CFG.url,AUTH_CFG.anon);

/* ---- gate ---- */
const ov=document.createElement("div");
ov.id="authov";
ov.innerHTML=`<div class="auth-card">
  <div class="auth-brand">Ascent<i>.</i> <small>OUTBOUND OS</small></div>
  <h2>Your OS is ready.</h2>
  <p class="auth-sub">Free account, two minutes. Your pipeline saves to your
  account and follows you between devices.</p>
  <div id="auth-form">
    <input id="auth-email" type="email" placeholder="you@company.com" autocomplete="email">
    <input id="auth-pass" type="password" placeholder="password, 8 or more characters" autocomplete="current-password">
    <div class="auth-note auth-savage">Make up a fresh password, don't reuse your
    bank one. We're a lean free tool — we don't exactly have the budget for Z+ data security.</div>
    <button id="auth-new">CREATE FREE ACCOUNT</button>
    <button id="auth-go">LOG IN</button>
    ${AUTH_CFG.google?`<button id="auth-google">CONTINUE WITH GOOGLE</button>`:""}
    <div class="auth-note">Forgot it, or hate passwords?
    <a href="#" id="auth-otp">Email me a login link instead.</a></div>
    <div class="auth-note" style="margin-top:8px">Creating an account means you're
    good with the <a href="https://getascent.co/terms" target="_blank" rel="noopener">terms</a>
    and <a href="https://getascent.co/privacy" target="_blank" rel="noopener">privacy policy</a>.</div>
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
const okEmail=()=>{const em=($a("#auth-email").value||"").trim();
  if(!/^\S+@\S+\.\S+$/.test(em)){err("That email doesn't look right, check it once more.");return null}
  return em};
const showSent=t=>{if(t)$a("#auth-sent-p").firstChild.textContent=t;
  $a("#auth-form").classList.add("hidden");$a("#auth-sent").classList.remove("hidden")};
const busy=(id,on,lbl)=>{const b=$a(id);b.disabled=on;b.textContent=on?"ONE SEC…":lbl};
async function login(){
  const em=okEmail();if(!em)return;
  const pw=$a("#auth-pass").value;
  if(pw.length<8){err("Password needs 8 or more characters.");return}
  $a("#auth-err").classList.add("hidden");
  busy("#auth-go",true,"LOG IN");
  const {error}=await sb.auth.signInWithPassword({email:em,password:pw});
  busy("#auth-go",false,"LOG IN");
  if(error)err(/invalid/i.test(error.message)
    ?"No luck. Wrong password, or no account yet — hit CREATE FREE ACCOUNT."
    :error.message);}
async function signup(){
  const em=okEmail();if(!em)return;
  const pw=$a("#auth-pass").value;
  if(pw.length<8){err("Password needs 8 or more characters. Not your bank one, remember.");return}
  $a("#auth-err").classList.add("hidden");
  busy("#auth-new",true,"CREATE FREE ACCOUNT");
  const {data,error}=await sb.auth.signUp({email:em,password:pw,
    options:{emailRedirectTo:location.origin+location.pathname}});
  busy("#auth-new",false,"CREATE FREE ACCOUNT");
  if(error){err(/already registered/i.test(error.message)
    ?"That email already has an account — use LOG IN.":error.message);return}
  if(!data.session)showSent("Confirm your email to finish. ");}
async function sendLink(){
  const em=okEmail();if(!em)return;
  $a("#auth-err").classList.add("hidden");
  const {error}=await sb.auth.signInWithOtp({email:em,
    options:{emailRedirectTo:location.origin+location.pathname}});
  if(error){err(error.message);return}
  showSent();}
$a("#auth-go").onclick=login;
$a("#auth-new").onclick=signup;
$a("#auth-pass").addEventListener("keydown",e=>{if(e.key==="Enter")login()});
$a("#auth-otp").onclick=e=>{e.preventDefault();sendLink()};
const ag=$a("#auth-again");ag&&(ag.onclick=e=>{e.preventDefault();
  $a("#auth-sent").classList.add("hidden");$a("#auth-form").classList.remove("hidden")});
const gg=$a("#auth-google");gg&&(gg.onclick=()=>sb.auth.signInWithOAuth({provider:"google",
  options:{redirectTo:location.origin+location.pathname}}));

/* ---- sync ---- */
let user=null,pushT=null,lastHash="";
const snap=()=>((localStorage.getItem(K_APP)||"")+"§"+(localStorage.getItem(K_LEADS)||""));
async function push(){
  if(!user)return;
  const h=snap();if(h===lastHash)return;lastHash=h;
  const now=new Date().toISOString();
  const {error}=await sb.from("user_state").upsert({user_id:user.id,
    app:JSON.parse(localStorage.getItem(K_APP)||"{}"),
    leads:JSON.parse(localStorage.getItem(K_LEADS)||"[]"),
    updated_at:now});
  if(!error){pushT=now;localStorage.setItem(K_PUSH,now)}}
async function firstSync(){
  const {data}=await sb.from("user_state").select("app,leads,updated_at")
    .eq("user_id",user.id).maybeSingle();
  const localPush=localStorage.getItem(K_PUSH)||"";
  const hasLocal=!!localStorage.getItem(K_LEADS)&&JSON.parse(localStorage.getItem(K_LEADS)||"[]").length>0;
  if(data&&(!hasLocal||(data.updated_at&&data.updated_at>localPush))){
    /* remote wins: apply and reload once so the app boots from it */
    if(sessionStorage.getItem(K_LOOP))return;      /* never loop */
    localStorage.setItem(K_APP,JSON.stringify(data.app||{}));
    localStorage.setItem(K_LEADS,JSON.stringify(data.leads||[]));
    localStorage.setItem(K_PUSH,data.updated_at||new Date().toISOString());
    sessionStorage.setItem(K_LOOP,"1");
    location.reload();return}
  sessionStorage.removeItem(K_LOOP);
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
      sessionStorage.removeItem(K_LOOP);location.reload()}}}
sb.auth.onAuthStateChange((_e,session)=>{
  if(session&&session.user&&!user){user=session.user;unlock();firstSync()}});
sb.auth.getSession().then(({data})=>{
  if(data&&data.session&&data.session.user&&!user){
    user=data.session.user;unlock();firstSync()}});
})();
