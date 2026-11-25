// Deploy only after owner approval. Explicit user JWT and approved-user checks.
const origin="https://mattlocklear4.github.io";
const cors={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{...cors,"Cache-Control":"no-store"}});
const cache=new Map<string,{at:number,data:unknown}>();
let last=0;let active=false;

const courseNorm=(v:unknown)=>String(v??"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").replace(/\b(golf club|golf course|gc|g c)\b/g,"").replace(/\s+/g," ").trim();
function csvFields(line:string){const out:string[]=[];let s="",quoted=false;for(let i=0;i<line.length;i++){const x=line[i];if(x==='"'){if(quoted&&line[i+1]==='"'){s+='"';i++;}else quoted=!quoted;}else if(x===","&&!quoted){out.push(s);s="";}else s+=x;}out.push(s);return out;}
function courseEditions(csv:string,query:string,tour:string,year:number,eventId='',eventName=''){
const lines=csv.split(/\r?\n/);const keys=csvFields(lines.shift()??"").map(k=>k.replace(/^\uFEFF/,"").trim().toLowerCase());
const course=keys.indexOf("course_name"),round=keys.findIndex(k=>["round_num","round","round_number"].includes(k));
if((course<0&&query)||round<0||!keys.includes("player_name")||(!eventId&&!keys.includes("event_id"))||!keys.includes("round_score"))throw Error("Unrecognized annual archive CSV fields: "+keys.slice(0,15).join(", "));
const groups=new Map<string,any>();let scanned=0;
for(const line of lines){if(!line.trim())continue;const a=csvFields(line);scanned++;if(query&&!courseNorm(a[course]).includes(query))continue;const r=Object.fromEntries(keys.map((k,i)=>[k,a[i]??""]));r.event_id=r.event_id||eventId;r.event_name=r.event_name||eventName;const k=Number(a[round]);if(!Number.isInteger(k)||k<1||k>4||!r.event_id||!r.player_name||!Number(r.round_score))continue;const id=r.event_id;let g=groups.get(id);if(!g){g={meta:{year,tour,event_id:id,event_name:r.event_name,season:r.season},payload:{year,season:r.season,event_name:r.event_name,scores:[]}};groups.set(id,g);}g.payload.scores.push({player_name:r.player_name,dg_id:r.dg_id,fin_text:r.fin_text,["round_"+k]:r});}
return {editions:[...groups.values()],scanned,course_count:groups.size};}


function roundPayload(csv:string,tour:string,year:number,eventId:string){const found=courseEditions(csv,"",tour,year,eventId);const match=found.editions.filter(x=>String(x.meta.event_id)===eventId);const scores=match.flatMap(x=>x.payload.scores);if(!scores.length)throw Error("No completed rounds in archive for "+tour+" "+year+" event "+eventId);return {year,season:match[0].payload.season,event_name:match[0].payload.event_name||undefined,scores};}
function eventCatalog(csv:string,tour:string){
 const lines=csv.split(/\r?\n/);const keys=csvFields(lines.shift()??"").map(k=>k.replace(/^\uFEFF/,"").trim().toLowerCase().replace(/[\s-]+/g,"_"));
 const events:any[]=[];const seen=new Set<string>();
 for(const line of lines){if(!line.trim())continue;const a=csvFields(line);const r=Object.fromEntries(keys.map((k,i)=>[k,a[i]??""]));const year=Number(r.calendar_year||r.year||r.event_year||String(r.event_date||r.date||r.start_date||"").slice(0,4));const id=String(r.event_id||r.id||"");const name=r.event_name||r.name||r.tournament_name;if(!id||!name||!Number.isInteger(year)||year<1983||year>new Date().getUTCFullYear())continue;const k=id+"|"+year;if(seen.has(k))continue;seen.add(k);events.push({...r,event_id:id,event_name:name,year,tour});}
 if(!events.length)throw Error("No usable historical catalog entries; CSV headers: "+keys.slice(0,20).join(", "));
 return events;
}

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
const routes:Record<string,string>={events:"historical-raw-data/event-list",schedule:"get-schedule",rounds:"historical-raw-data/rounds",course_year:"historical-raw-data/rounds"};
if(!Object.hasOwn(routes,b.action))return reply({error:"Invalid action"},400);
const p=new URLSearchParams({tour:b.action==="schedule"&&tour==="liv"?"alt":tour,file_format:"json"});
if(b.action==="schedule"&&tour==="anz")return reply({error:"Schedule unavailable for this tour"},400);
if(b.action==="schedule"&&b.season!=null){if(!Number.isInteger(b.season)||b.season<2024||b.season>new Date().getUTCFullYear()+1)return reply({error:"Invalid season"},400);p.set("season",String(b.season));}
if(b.action==="rounds"){if(!/^\d{1,12}$/.test(String(b.event_id))||!Number.isInteger(b.year)||b.year<1983||b.year>new Date().getUTCFullYear())return reply({error:"Invalid event or year"},400);p.set("event_id",String(b.event_id));p.set("year",String(b.year));}
if(b.action==="events"||b.action==="rounds")p.set("file_format","csv");
let query="";if(b.action==="course_year"){query=courseNorm(b.course);if(query.length<3||query.length>160||!Number.isInteger(b.year)||b.year<2017||b.year>new Date().getUTCFullYear())return reply({error:"Invalid course or year"},400);p.set("event_id","all");p.set("year",String(b.year));p.set("file_format","csv");}
const cacheKey=b.action+":"+routes[b.action]+"?"+p.toString()+":"+query,hit=cache.get(cacheKey);
if(hit&&Date.now()-hit.at<3600000)return reply(hit.data);
if(active||Date.now()-last<1600)return reply({error:"Please retry in a few seconds"},429);
active=true;last=Date.now();
try{p.set("key",dg);const res=await fetch("https://feeds.datagolf.com/"+routes[b.action]+"?"+p,{signal:AbortSignal.timeout(25000),redirect:"error"});
if(!res.ok)return reply({error:"DataGolf upstream HTTP "+res.status},502);
const data=b.action==="course_year"?courseEditions(await res.text(),query,tour,b.year):b.action==="events"?eventCatalog(await res.text(),tour):b.action==="rounds"?roundPayload(await res.text(),tour,b.year,String(b.event_id)):await res.json();if(cache.size>=32)cache.delete(cache.keys().next().value!);cache.set(cacheKey,{at:Date.now(),data});return reply(data);
}finally{active=false;}
}catch(e){const msg=e instanceof Error?e.message:"";return reply({error:msg.startsWith("No usable historical catalog entries")||msg.startsWith("Unrecognized annual archive CSV fields")||msg.startsWith("No completed rounds in archive")?msg:"History request failed"},502);}
});
