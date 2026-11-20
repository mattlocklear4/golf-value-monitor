// Migration-only login gate. Authorization is enforced separately by RLS and Edge Functions.
(() => {
  const url = "https://gyyasyrcrbhimeyaddga.supabase.co";
  const key = "sb_publishable_T51zY_xHCovOAsP9SxVrDQ_hSA6PFvD"; // public client key, not a secret
  const root = document.createElement("div");
  root.id = "golf-login-gate";
  root.style.cssText = "position:fixed;inset:0;z-index:999999;background:#0b1220;color:#eaf1fc;display:flex;align-items:center;justify-content:center;font:15px system-ui;padding:18px";
  root.innerHTML = '<div style="width:min(440px,100%);background:#131e30;border:1px solid #2b3b52;border-radius:18px;padding:28px"><h1 style="margin:0 0 10px">⛳ Golf Player Prop Board</h1><p>Sign in with your approved email to access the board.</p><form id="golf-login-form"><input id="golf-login-email" type="email" required autocomplete="email" placeholder="Email address" style="width:100%;box-sizing:border-box;padding:12px;margin:8px 0;background:#0e192a;color:white;border:1px solid #40536d;border-radius:8px"><button style="width:100%;padding:12px;margin:8px 0;background:#1d7d5b;color:white;border:0;border-radius:8px">Send sign-in link</button></form><p id="golf-login-status" role="status"></p><button id="golf-logout" hidden>Sign out</button></div>';
  document.body.appendChild(root);
  const status = root.querySelector("#golf-login-status");
  if (!window.supabase?.createClient) { status.textContent = "Supabase library unavailable. Refresh the page."; return; }
  const client = window.supabase.createClient(url,key,{auth:{flowType:"pkce",detectSessionInUrl:true,persistSession:true,autoRefreshToken:true,storageKey:"golf-pages-auth-v1"}});
  window.golfPagesAuth = client;
  const show = async () => {
    const {data:{session},error} = await client.auth.getSession();
    if (error || !session) { root.style.display = "flex"; return; }
    const {data:{user},error:verifyError} = await client.auth.getUser();
    if (verifyError || !user) { root.style.display = "flex"; return; }
    // Session validation is not authorization: the API and cloud tables MUST enforce it server-side.
    root.style.display = "none";
  };
  root.querySelector("#golf-login-form").addEventListener("submit",async e=>{
    e.preventDefault();
    status.textContent="Sending sign-in link…";
    const email=root.querySelector("#golf-login-email").value.trim();
    const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname,shouldCreateUser:false}});
    status.textContent=error?error.message:"Check your email for the sign-in link.";
  });
  client.auth.onAuthStateChange(()=>{setTimeout(show,0)});
  show();
})();
