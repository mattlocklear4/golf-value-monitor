// Deploy only after owner approval. Explicit user JWT and approved-user checks.
const origin="https://mattlocklear4.github.io";
const cors={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{...cors,"Cache-Control":"no-store"}});
const cache=new Map<string,{at:number,data:unknown}>();
let last=0;let active=false;
Deno.serve(async req=>{
if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
if(req.method!=="POST"||req.headers.get("origin")!==origin)return reply({error:"Forbidden"},403);
const token=req.headers.get("authorization"),url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_ANON_KEY"),dg=Deno.env.get("DATAGOLF_API_KEY");
if(!token?.startsWith("Bearer ")||!url||!key)return reply({error:"Not authorized"},401);
try{
const headers={Authorization:token,apikey:key};
const userRes=await fetch(url+"/auth/v1/user",{headers});if(!userRes.ok)return reply({error:"Not authorized"},401);
const user=await userRes.json();
const check=await fetch(url+"/rest/v1/golf_approved_users?select=user_id&user_id=eq."+encodeURIComponent(user.id),{headers});
if(!check.ok||!(await check.json()).length)return reply({error:"Not approved"},403);
if(!dg)return reply({error:"DataGolf secret not configured"},503);
const b=await req.json();const tour=String(b.tour??"");
if(!["pga","euro","liv","kft","anz"].includes(tour))return reply({error:"Invalid tour"},400);
const routes:Record<string,string>={events:"historical-raw-data/event-list",schedule:"get-schedule",rounds:"historical-raw-data/rounds"};
if(!Object.hasOwn(routes,b.action))return reply({error:"Invalid action"},400);
const p=new URLSearchParams({tour:b.action==="schedule"&&tour==="liv"?"alt":tour,file_format:"json"});
if(b.action==="schedule"&&tour==="anz")return reply({error:"Schedule unavailable for this tour"},400);
if(b.action==="rounds"){if(!/^\d{1,12}$/.test(String(b.event_id))||!Number.isInteger(b.year)||b.year<1983||b.year>new Date().getUTCFullYear())return reply({error:"Invalid event or year"},400);p.set("event_id",String(b.event_id));p.set("year",String(b.year));}
const cacheKey=routes[b.action]+"?"+p.toString(),hit=cache.get(cacheKey);
if(hit&&Date.now()-hit.at<3600000)return reply(hit.data);
if(active||Date.now()-last<1600)return reply({error:"Please retry in a few seconds"},429);
active=true;last=Date.now();
try{p.set("key",dg);const res=await fetch("https://feeds.datagolf.com/"+routes[b.action]+"?"+p,{signal:AbortSignal.timeout(25000),redirect:"error"});
if(!res.ok)return reply({error:"DataGolf upstream HTTP "+res.status},502);
const data=await res.json();if(cache.size>=32)cache.delete(cache.keys().next().value!);cache.set(cacheKey,{at:Date.now(),data});return reply(data);
}finally{active=false;}
}catch{return reply({error:"History request failed"},502);}
});
