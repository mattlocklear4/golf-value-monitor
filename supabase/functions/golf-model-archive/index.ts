function csvFields(line){const out=[];let s="",quoted=false;for(let i=0;i<line.length;i++){const x=line[i];if(x==='"'){if(quoted&&line[i+1]==='"'){s+='"';i++;}else quoted=!quoted;}else if(x===","&&!quoted){out.push(s);s="";}else s+=x;}out.push(s);return out;}
const clean=v=>String(v??"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
const playerName=v=>String(v??"").includes(",")?String(v).split(",").map(x=>x.trim()).reverse().join(" "):String(v??"");
const int=v=>v==null||String(v).trim()===""||!Number.isInteger(Number(v))?null:Number(v);
const holes=v=>{const n=int(v);return n!=null&&n>=0&&n<=18?n:null;};
function parseAnnual(csv){
 const lines=csv.split(/\r?\n/),keys=csvFields(lines.shift()??"").map(k=>k.replace(/^\uFEFF/,"").trim().toLowerCase());
 const idx=(...names)=>names.map(x=>keys.indexOf(x)).find(i=>i>=0)??-1;
 const col={name:idx("player_name"),id:idx("dg_id"),course:idx("course_name"),par:idx("course_par"),score:idx("round_score"),round:idx("round_num","round","round_number"),event:idx("event_id"),eagles:idx("eagles_or_better","eagles_plus","eagles"),birdies:idx("birdies"),pars:idx("pars"),bogeys:idx("bogies","bogeys"),doubles:idx("doubles_or_worse","double_bogeys_or_worse","doubles_plus")};
 for(const k of ["name","par","score","round","event","eagles","birdies","pars"])if(col[k]<0)throw Error("Archive missing "+k+" column; received: "+keys.slice(0,32).join(", "));
 const rounds=[],courses={},seen=new Set();let scanned=0,rejected=0,duplicates=0,derived=0;
 for(const line of lines){if(!line.trim())continue;scanned++;const a=csvFields(line);const name=clean(playerName(a[col.name])),id=String(a[col.id]??"").trim(),course=String(a[col.course]??"").trim(),par=int(a[col.par]),score=int(a[col.score]),round=int(a[col.round]),event=String(a[col.event]??"").trim(),e=holes(a[col.eagles]),b=holes(a[col.birdies]),p=holes(a[col.pars]),bog=holes(a[col.bogeys]),d=holes(a[col.doubles]);
 if(!name||!event||par===null||par<65||par>75||score===null||score<45||score>120||round===null||round<1||round>4||e===null||b===null||p===null){rejected++;continue;}
 const bob=e+b,bogey=18-bob-p;
 if(bogey<0||bogey>18||(bog!==null&&d!==null&&bog+d!==bogey)||(bog!==null&&bog>bogey)||(d!==null&&d>bogey)){rejected++;continue;}
 const key=[event,id||name,round].join("|");if(seen.has(key)){duplicates++;continue;}seen.add(key);
 if(bog===null||d===null)derived++;rounds.push([name,course,par,score-par,bob,bogey,id,event,round]);if(course)(courses[par]??=new Set()).add(course);
 }
 if(!rounds.length)throw Error("No complete rounds with valid hole counts; "+scanned+" rows scanned.");
 if(rounds.length>120000)throw Error("Archive exceeds supported annual round limit.");
 return {rounds,course_names:Object.fromEntries(Object.entries(courses).map(([k,v])=>[k,[...v].sort()])),scanned,rejected,duplicates,derived,valid_count:rounds.length};
}

const origin="https://mattlocklear4.github.io";
const cors={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
const reply=(data,status=200)=>Response.json(data,{status,headers:{...cors,"Cache-Control":"no-store"}});
let busy=false;
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST"||req.headers.get("origin")!==origin)return reply({error:"Forbidden"},403);
 const token=req.headers.get("authorization"),url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_ANON_KEY"),dg=Deno.env.get("DATAGOLF_API_KEY");
 if(!token?.startsWith("Bearer ")||!url||!key)return reply({error:"Sign in first"},401);
 if(!dg)return reply({error:"DataGolf is not configured"},503);
 try{
 const headers={Authorization:token,apikey:key};
 const u=await fetch(url+"/auth/v1/user",{headers});if(!u.ok)return reply({error:"Sign in first"},401);
 const user=await u.json(),allowed=await fetch(url+"/rest/v1/golf_approved_users?select=user_id&user_id=eq."+encodeURIComponent(user.id),{headers});
 if(!allowed.ok||!(await allowed.json()).length)return reply({error:"Not approved"},403);
 const b=await req.json(),tour=String(b.tour??""),year=Number(b.year),min=tour==="pga"?2004:tour==="liv"?2022:2017;
 if(!["pga","euro","liv","kft"].includes(tour)||!Number.isInteger(year)||year<min||year>new Date().getUTCFullYear())return reply({error:"Invalid tour or calendar year"},400);
 const path=url+"/rest/v1/golf_model_archive",filters="user_id=eq."+encodeURIComponent(user.id)+"&tour=eq."+tour+"&calendar_year=eq."+year;
 const check=await fetch(path+"?select=calendar_year,tour,valid_count,scanned,updated_at&"+filters,{headers});if(!check.ok)return reply({error:"Archive access unavailable"},502);
 const existing=(await check.json())[0];if(existing&&!b.refresh)return reply({...existing,cached:true});
 if(busy)return reply({error:"Another archive import is running; retry shortly"},429);
 busy=true;
 try{
 const params=new URLSearchParams({tour,event_id:"all",year:String(year),file_format:"csv",key:dg});
 const res=await fetch("https://feeds.datagolf.com/historical-raw-data/rounds?"+params,{signal:AbortSignal.timeout(45000),redirect:"error"});
 if(!res.ok)return reply({error:"DataGolf archive HTTP "+res.status},502);
 const data=parseAnnual(await res.text());
 const body={user_id:user.id,tour,calendar_year:year,rounds:data.rounds,course_names:data.course_names,scanned:data.scanned,updated_at:new Date().toISOString()};
 const saved=await fetch(path+"?on_conflict=user_id,tour,calendar_year",{method:"POST",headers:{...headers,"Content-Type":"application/json","Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 if(!saved.ok)return reply({error:"Archive database save failed (HTTP "+saved.status+"). Previous archive retained."},502);
 return reply({tour,calendar_year:year,valid_count:data.valid_count,scanned:data.scanned,rejected:data.rejected,duplicates:data.duplicates,derived:data.derived,updated_at:body.updated_at,cached:false});
 }finally{busy=false;}
 }catch(e){const msg=e instanceof Error?e.message:"";return reply({error:/^(Archive missing|No complete rounds|Archive exceeds)/.test(msg)?msg:"Annual archive request failed. Previous archive retained."},502);}
});
