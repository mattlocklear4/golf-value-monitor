import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const origin = "https://mattlocklear4.github.io";
const headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "GET, OPTIONS", "Vary": "Origin" };
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), { status, headers: {...headers, "Content-Type":"application/json", "Cache-Control":"no-store"} });
Deno.serve(async req => {
 if(req.method==="OPTIONS") return new Response(null,{status:204,headers});
 if(req.method!=="GET") return json({error:"Method not allowed"},405);
 if(req.headers.get("origin")!==origin) return json({error:"Origin not allowed"},403);
 const token=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
 if(!token) return json({error:"Sign in required"},401);
 const url=Deno.env.get("SUPABASE_URL"), anon=Deno.env.get("SUPABASE_ANON_KEY"), key=Deno.env.get("DATAGOLF_API_KEY");
 const approved=(Deno.env.get("GOLF_APPROVED_USER_IDS")||"").split(",").map(s=>s.trim()).filter(Boolean);
 if(!url||!anon||!key||!approved.length) return json({error:"Function not configured"},503);
 const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error}=await client.auth.getUser(token);
 if(error||!user||!approved.includes(user.id)) return json({error:"Not authorized"},403);
 const q=new URL(req.url).searchParams;
 const tour=q.get("tour")||"pga";
 if(!["pga","euro","kft","liv"].includes(tour)) return json({error:"Invalid tour"},400);
 const upstream=new URL("https://feeds.datagolf.com/historical-raw-data/event-list");
 upstream.searchParams.set("tour",tour);
 upstream.searchParams.set("file_format","json");
 upstream.searchParams.set("key",key);
 
 try { const res=await fetch(upstream,{signal:AbortSignal.timeout(25000)});if(!res.ok)return json({error:"DataGolf request failed",upstreamStatus:res.status},502);return json(await res.json());}
 catch{return json({error:"DataGolf unavailable"},502);}
});