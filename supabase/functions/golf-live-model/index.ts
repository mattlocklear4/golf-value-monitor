// Isolated read-only live feed. Same authentication model as datagolf-history.
const origin="https://mattlocklear4.github.io";
const cors={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{...cors,"Cache-Control":"no-store"}});
const cache=new Map<string,{at:number,result:unknown}>();
const inflight=new Map<string,Promise<unknown>>();
const ttl=300000;
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST"||req.headers.get("origin")!==origin)return reply({error:"Forbidden"},403);
 const token=req.headers.get("authorization"),url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_ANON_KEY"),dg=Deno.env.get("DATAGOLF_API_KEY");
 if(!token?.startsWith("Bearer ")||!url||!key)return reply({error:"Not authorized"},401);
 try{
  const headers={Authorization:token,apikey:key};
  const u=await fetch(url+"/auth/v1/user",{headers,signal:AbortSignal.timeout(8000)});
  if(!u.ok)return reply({error:"Not authorized"},401);
  const user=await u.json();
  const a=await fetch(url+"/rest/v1/golf_approved_users?select=user_id&user_id=eq."+encodeURIComponent(user.id),{headers,signal:AbortSignal.timeout(8000)});
  if(!a.ok||!(await a.json()).length)return reply({error:"Not approved"},403);
  if(!dg)return reply({error:"DataGolf secret unavailable"},503);
  const body=await req.json();const tour=body.tour;
  if(tour!=="pga"&&tour!=="euro")return reply({error:"Invalid tour"},400);
  const hit=cache.get(tour);if(hit&&Date.now()-hit.at<ttl)return reply(hit.result);
  let task=inflight.get(tour);
  if(!task){
   task=(async()=>{
    const get=async(path:string,params:Record<string,string>)=>{
     const query=new URLSearchParams({...params,file_format:"json",key:dg});
     try{
      const r=await fetch("https://feeds.datagolf.com/preds/"+path+"?"+query,{signal:AbortSignal.timeout(15000),redirect:"error"});
      if(!r.ok)return {ok:false,status:r.status};
      const data=await r.json();return {ok:true,data};
     }catch{return {ok:false,status:502};}
    };
    const [holes,predictions]=await Promise.all([get("live-hole-stats",{tour}),get("in-play",{tour,dead_heat:"no",odds_format:"percent"})]);
    const result={tour,fetched_at:new Date().toISOString(),holes,predictions};
    cache.set(tour,{at:Date.now(),result});return result;
   })().finally(()=>inflight.delete(tour));
   inflight.set(tour,task);
  }
  return reply(await task);
 }catch{return reply({error:"Live feed unavailable"},502);}
});
