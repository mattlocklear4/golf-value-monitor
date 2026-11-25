
const norm=v=>String(v??"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
const name=v=>{const s=String(v??"").trim();return s.includes(",")?s.split(",").map(x=>x.trim()).reverse().join(" "):s;};
const iso=v=>{const m=String(v??"").match(/^\d{4}-\d{2}-\d{2}/);return m?m[0]:"";};
function normalizeField(raw,tour){
 const root=raw?.data&&!Array.isArray(raw.data)?raw.data:raw;
 const field=Array.isArray(root)?root:[root?.field,root?.players,root?.field_updates,root?.data,root?.player_list].find(Array.isArray);
 if(!Array.isArray(field)){if(root==null||typeof root==="string"||root?.error||root?.message)return null;throw Error("Unrecognized field response; keys: "+Object.keys(root||{}).slice(0,15).join(", "));}
 const meta=Array.isArray(root)?(field[0]||{}):root;
 const event=String(meta.event_name??meta.tournament_name??meta.event?.name??field[0]?.event_name??"").trim();
 if(!event||!field.length)return null;
 const seen=new Set(),players=[];for(const p of field){const player=name(p.player_name??p.name),id=String(p.dg_id??p.datagolf_id??"").trim();const status=String(p.status??p.field_status??p.player_status??"").toLowerCase();if(!player||/^(wd|withdrawn|withdrawal|dns|dq|disqualified|alternate|alt)$/.test(status)||p.withdrawn===true||p.in_field===false)continue;const k=id||norm(player);if(seen.has(k))continue;seen.add(k);players.push({name:player,dg_id:id});}
 if(!players.length)return null;
 return {tour,event,event_id:String(meta.event_id??meta.tournament_num??field[0]?.event_id??""),start_date:iso(meta.start_date??meta.event_start_date??meta.tournament_start_date??field[0]?.start_date),course:String(meta.course_name??meta.course??""),players,updated:String(meta.last_updated??meta.updated_at??meta.last_update??"")};
}
function attachSchedule(field,raw){if(!field)return null;const rows=Array.isArray(raw)?raw:raw?.schedule??raw?.events??raw?.tournaments??[];if(!Array.isArray(rows))return field;
 const matches=rows.filter(x=>norm(x.event_name??x.tournament_name)===norm(field.event));const exact=matches.find(x=>String(x.event_id??x.tournament_num)===field.event_id&&field.event_id);const match=exact||matches.sort((a,b)=>String(b.start_date??"").localeCompare(String(a.start_date??"")))[0];
 if(match){field.start_date=field.start_date||iso(match.start_date??match.date_start);field.course=field.course||String(match.course??match.course_name??"");}return field;}
function pickAuto(fields,now){const today=new Date(now);const lo=new Date(today.getTime()-3*86400000).toISOString().slice(0,10),hi=new Date(today.getTime()+4*86400000).toISOString().slice(0,10);const current=fields.filter(f=>f.start_date&&f.start_date>=lo&&f.start_date<=hi);return current.length===1?current[0]:null;}


const origin="https://mattlocklear4.github.io";
const cors={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
const reply=(data,status=200)=>Response.json(data,{status,headers:{...cors,"Cache-Control":"no-store"}});
const cache=new Map();let active=false;
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST"||req.headers.get("origin")!==origin)return reply({error:"Forbidden"},403);
 const token=req.headers.get("authorization"),url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_ANON_KEY"),dg=Deno.env.get("DATAGOLF_API_KEY");
 if(!token?.startsWith("Bearer ")||!url||!key)return reply({error:"Sign in first"},401);
 if(!dg)return reply({error:"DataGolf secret not configured"},503);
 try{
 const headers={Authorization:token,apikey:key};
 const u=await fetch(url+"/auth/v1/user",{headers});if(!u.ok)return reply({error:"Sign in first"},401);
 const user=await u.json(),allow=await fetch(url+"/rest/v1/golf_approved_users?select=user_id&user_id=eq."+encodeURIComponent(user.id),{headers});if(!allow.ok||!(await allow.json()).length)return reply({error:"Not approved"},403);
 const b=await req.json(),tour=String(b.tour??"auto");if(!["auto","pga","euro","kft","alt","opp","upcoming_pga"].includes(tour))return reply({error:"Invalid field tour"},400);
 const prior=cache.get(tour);if(prior&&Date.now()-prior.at<120000&&!b.refresh)return reply(prior.data);
 if(active)return reply({error:"Field lookup busy, retry shortly"},429);active=true;
 try{
 const get=async(path,params)=>{const p=new URLSearchParams({...params,file_format:"json",key:dg});const res=await fetch("https://feeds.datagolf.com/"+path+"?"+p,{signal:AbortSignal.timeout(20000),redirect:"error"});if(!res.ok)throw Error("DataGolf HTTP "+res.status);return await res.json();};
 const fields=[],errors=[];for(const t of tour==="auto"?["pga","euro"]:[tour]){try{let f=normalizeField(await get("field-updates",{tour:t}),t);if(!f){errors.push(t+": No field published");continue;}if(!f.start_date||!f.course){try{const sched=await get("get-schedule",{tour:["upcoming_pga","opp"].includes(t)?"pga":t});f=attachSchedule(f,sched);}catch{}}
 fields.push(f);}catch(e){errors.push(t+": "+(String(e.message).startsWith("Unrecognized field response")?e.message:String(e.message).startsWith("DataGolf HTTP")?e.message:"Field request failed"));}}
 const chosen=tour==="auto"?pickAuto(fields,new Date()):fields[0]||null;const data={field:chosen,choices:fields.map(f=>({tour:f.tour,event:f.event,start_date:f.start_date,course:f.course,player_count:f.players.length})),errors,checked_at:new Date().toISOString()};cache.set(tour,{at:Date.now(),data});return reply(data);
 }finally{active=false;}
 }catch{return reply({error:"Field lookup failed"},502);}
});
