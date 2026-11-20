import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const origin="https://mattlocklear4.github.io";
const cors={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"GET, OPTIONS","Vary":"Origin"};
const reply=(obj:unknown,status=200)=>new Response(JSON.stringify(obj),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="GET")return reply({error:"Method not allowed"},405);
 if(req.headers.get("origin")!==origin)return reply({error:"Origin not allowed"},403);
 const token=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return reply({authorized:false},401);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_ANON_KEY");
 const allowed=(Deno.env.get("GOLF_APPROVED_USER_IDS")||"").split(",").map(x=>x.trim()).filter(Boolean);
 if(!url||!key||!allowed.length)return reply({error:"Authorization not configured"},503);
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error}=await client.auth.getUser(token);
 if(error||!user||!allowed.includes(user.id))return reply({authorized:false},403);
 return reply({authorized:true});
});
