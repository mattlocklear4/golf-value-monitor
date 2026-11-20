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
 if(!url||!anon||!key)return json({error:"Function not configured"},503);
 const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:"Bearer "+token}}});
 const {data:{user},error}=await client.auth.getUser(token);
 if(error||!user)return json({error:"Not authorized"},403);
 const {data:approval,error:approvalError}=await client.from("golf_approved_users").select("user_id").eq("user_id",user.id).maybeSingle();
 if(approvalError||!approval)return json({error:"Not authorized"},403);
 const q=new URL(req.url).searchParams;
 const tour=q.get("tour")||"pga";
 if(!["pga","euro","kft","alt","liv"].includes(tour)) return json({error:"Invalid tour"},400);
 const upstream=new URL("https://feeds.datagolf.com/get-schedule");
 upstream.searchParams.set("tour",tour);
 upstream.searchParams.set("file_format","json");
 upstream.searchParams.set("key",key);
 const season=q.get("season")||"";
 if(!/^20\d{2}$/.test(season)||Number(season)<2024||Number(season)>new Date().getUTCFullYear()+1)return json({error:"Invalid season"},400);
 upstream.searchParams.set("season",season);
 upstream.searchParams.set("upcoming_only","no");
 try { const res=await fetch(upstream,{signal:AbortSignal.timeout(25000)});if(!res.ok)return json({error:"DataGolf request failed",upstreamStatus:res.status},502);return json(await res.json());}
 catch{return json({error:"DataGolf unavailable"},502);}
});