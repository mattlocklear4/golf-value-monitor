/* Golf Player Prop Board — GitHub Pages authentication gate.
   Client-side UI protection is not a substitute for Supabase RLS and Edge Function authorization. */
(() => {
  const URL = "https://gyyasyrcrbhimeyaddga.supabase.co";
  const KEY = "sb_publishable_T51zY_xHCovOAsP9SxVrDQ_hSA6PFvD";
  const STORAGE = "golf-pages-auth-v1";
  const css = document.createElement("style");
  css.textContent = 'body:not(.golf-auth-ready)>.wrap{display:none!important}#golf-login{position:fixed;inset:0;z-index:99999;background:#0b1220;color:#eaf1fc;display:grid;place-items:center;font:15px system-ui;padding:20px}#golf-login[hidden]{display:none}#golf-login .login-card{width:min(420px,100%);background:#131e30;border:1px solid #2b3b52;border-radius:16px;padding:28px}#golf-login input{display:block;width:100%;margin:16px 0;background:#0e192a;border:1px solid #40536d;border-radius:8px;color:white;padding:12px}#golf-login button{padding:11px 15px;border-radius:8px;border:1px solid #279c72;background:#1d7d5b;color:white;cursor:pointer}';
  document.head.append(css);
  const ready = () => new Promise(resolve => document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", resolve, {once:true}) : resolve());
  async function init(){
    await ready();
    const screen=document.createElement("div");
    screen.id="golf-login";
    screen.innerHTML='<div class="login-card"><h2>⛳ Golf Player Prop Board</h2><p>Sign in with your authorized email address.</p><form id="golf-login-form"><input id="golf-login-email" type="email" autocomplete="email" placeholder="Email address" required><button type="submit">Email me a sign-in link</button></form><p id="golf-login-message" role="status"></p></div>';
    document.body.append(screen);
    const message=screen.querySelector("#golf-login-message");
    if(!window.supabase?.createClient){message.textContent="Authentication library unavailable. Please reload.";return;}
    const client=window.supabase.createClient(URL,KEY,{auth:{flowType:"pkce",detectSessionInUrl:false,persistSession:true,autoRefreshToken:true,storageKey:STORAGE}});
    window.golfPagesAuth={client,async token(){const {data:{session}}=await client.auth.getSession();return session?.access_token||null;}};
    const params=new URLSearchParams(location.search);
    if(params.get("code") && params.get("golf_login")==="1"){
      const {error}=await client.auth.exchangeCodeForSession(params.get("code"));
      if(error) message.textContent="Sign-in failed: "+error.message;
      else {params.delete("code");params.delete("golf_login");history.replaceState(null,"",location.pathname+(params.size?"?"+params:"")+location.hash);}
    }
    const allow = async () => {
      const {data:{user}}=await client.auth.getUser();
      if(!user) return false;
      // Allowlist is enforced by protected API functions; browser access alone grants no data access.
      document.body.classList.add("golf-auth-ready");screen.hidden=true;
      const logout=document.createElement("button");logout.type="button";logout.textContent="Sign out of Golf Board";logout.style.cssText="position:fixed;bottom:10px;right:10px;z-index:2000;font-size:12px";
      logout.onclick=async()=>{await client.auth.signOut();location.reload();};document.body.append(logout);
      return true;
    };
    if(await allow())return;
    screen.querySelector("form").onsubmit=async e=>{
      e.preventDefault();message.textContent="Sending sign-in link…";
      const email=screen.querySelector("#golf-login-email").value.trim();
      const redirect=location.origin+location.pathname+"?golf_login=1";
      const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:redirect,shouldCreateUser:false}});
      message.textContent=error?"Could not send link: "+error.message:"Check your email for a sign-in link.";
    };
  }
  init().catch(e=>{const m=document.getElementById("golf-login-message");if(m)m.textContent="Authentication failed: "+e.message;});
})();
