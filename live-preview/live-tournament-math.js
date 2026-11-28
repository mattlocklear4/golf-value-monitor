// Pure live-scoring adapter. Missing or ambiguous measurements remain null.
(function(root){
"use strict";
const number=v=>v===null||v===undefined||v===""||typeof v==="boolean"||!Number.isFinite(Number(v))?null:Number(v);
const pick=(o,keys)=>{for(const k of keys)if(o[k]!==undefined&&o[k]!==null&&o[k]!=="")return o[k];return null;};
const waveOf=s=>({am:"AM",pm:"PM",overall:"Overall",all:"Overall",total:"Overall",morning:"AM",afternoon:"PM",morning_wave:"AM",afternoon_wave:"PM",am_wave:"AM",pm_wave:"PM"})[String(s??"").toLowerCase()]||null;
const roundOf=s=>{const m=String(s??"").match(/^(?:r(?:ound)?[_ -]?)?([1-4])$/i);return m?Number(m[1]):null;};
const label=s=>String(s??"").trim();
const positiveInt=v=>{let n=number(v);return n!==null&&n>=0&&Number.isInteger(n)?n:null;};
const sum=a=>a.every(x=>x!==null)?a.reduce((a,b)=>a+b,0):null;
function parseHoleFeed(payload){
 const rows=[],issues=[];const event=label(pick(payload||{},["event_name","event","tournament_name"]));const eventId=label(pick(payload||{},["event_id","tournament_id"]));const updated=label(pick(payload||{},["last_updated","updated_at","last_update"]));
 function walk(o,ctx={},depth=0){
  if(!o||typeof o!=="object"||depth>12)return;
  if(Array.isArray(o)){for(const x of o)walk(x,ctx,depth+1);return;}
  const round=roundOf(pick(o,["round","round_num","round_number"]))??ctx.round;
  const wave=waveOf(pick(o,["wave","tee_time_wave","tee_wave"]))??ctx.wave;
  const course=label(pick(o,["course_name","course","course_key","course_code","course_id","course_num"]))||ctx.course||"";
  const hole=positiveInt(pick(o,["hole","hole_num","hole_number"]))??ctx.hole;const par=positiveInt(pick(o,["par","hole_par"]))??ctx.par;const effectiveWave=wave||(hole>=1&&hole<=18?"Overall":null);
  if(hole>=1&&hole<=18&&round&&effectiveWave){
   let delta=number(pick(o,["score_to_par","avg_to_par","scoring_avg_to_par","average_to_par","scoring_average_to_par"]));
   const absolute=number(pick(o,["avg_score","average_score","scoring_average","scoring_avg"]));
   // Never infer whether a generic average is absolute or relative when it is ambiguous.
   if(delta===null&&par!==null&&absolute!==null&&absolute>=1.5&&absolute<=10)delta=absolute-par;
   if(delta!==null&&Math.abs(delta)>5)delta=null;
   const n=positiveInt(pick(o,["n","count","num_scores","num_players","holes_played","sample_size","num_rounds"]));
   let bob=number(pick(o,["birdie_or_better_pct","bob_pct","birdie_plus_pct"])),pars=number(pick(o,["par_pct","pars_pct"])),bogey=number(pick(o,["bogey_or_worse_pct","bogey_plus_pct"]));
   const b=positiveInt(pick(o,["birdie_or_better_count","bob_count"])),p=positiveInt(pick(o,["par_count","pars_count"])),g=positiveInt(pick(o,["bogey_or_worse_count","bogey_plus_count"]));
   const eagle=positiveInt(pick(o,["eagle_or_better_count","eagles_count"])),birdie=positiveInt(pick(o,["birdie_count","birdies_count"])),bogeys=positiveInt(pick(o,["bogey_count","bogeys_count"])),double=positiveInt(pick(o,["double_or_worse_count","doubles_count"]));
   if(n>0){if(bob===null){const t=b??sum([eagle,birdie]);if(t!==null)bob=100*t/n;}if(pars===null&&p!==null)pars=100*p/n;if(bogey===null){const t=g??sum([bogeys,double]);if(t!==null)bogey=100*t/n;}}
   if([bob,pars,bogey].some(x=>x!==null&&(x<0||x>100))||([bob,pars,bogey].every(x=>x!==null)&&Math.abs(bob+pars+bogey-100)>1)){bob=pars=bogey=null;issues.push("Unrecognized distribution units.");}
   if(n!==0&&(delta!==null||bob!==null||pars!==null||bogey!==null))rows.push({round,wave:effectiveWave,course,hole,par,n,delta,bob,pars,bogey});
  }
  for(const [k,v] of Object.entries(o))if(v&&typeof v==="object"){
   const child={round:roundOf(k)??round,wave:waveOf(k)??wave,course,hole,par};
   walk(v,child,depth+1);
  }
 }
 walk(payload);
 const unique=new Map();for(const r of rows){const k=[r.round,r.wave,r.course,r.hole].join("|");if(unique.has(k)){issues.push("Duplicate hole rows; ambiguous groups excluded.");unique.set(k,null);}else unique.set(k,r);}
 return {event,eventId,updated,rows:[...unique.values()].filter(Boolean),issues:[...new Set(issues)],keys:Object.keys(payload||{})};
}
function mergeWaves(rows){
 const groups=new Map();for(const r of rows){const k=[r.round,r.course,r.hole].join("|");if(!groups.has(k))groups.set(k,{});groups.get(k)[r.wave]=r;}
 const out=[...rows];for(const x of groups.values()){if(x.Overall||!x.AM||!x.PM)continue;const a=x.AM,b=x.PM;if(!(a.n>0&&b.n>0)||a.par!==b.par)continue;const n=a.n+b.n,avg=k=>a[k]===null||b[k]===null?null:(a[k]*a.n+b[k]*b.n)/n;out.push({...a,wave:"Overall",n,delta:avg("delta"),bob:avg("bob"),pars:avg("pars"),bogey:avg("bogey")});}return out;
}
function metrics(rows,first=1,last=18){
 const selected=rows.filter(x=>x.hole>=first&&x.hole<=last);
 const holes=new Set(selected.map(x=>x.hole));const complete=holes.size===last-first+1&&selected.length===holes.size;
 const total=k=>complete&&selected.every(x=>x[k]!==null)?selected.reduce((a,x)=>a+x[k],0):null;
 const rate=k=>{const t=total(k);return t===null?null:t/100;};
 return {coverage:holes.size,expectedHoles:last-first+1,delta:total("delta"),bob:rate("bob"),pars:rate("pars"),bogey:rate("bogey"),observations:complete&&selected.every(x=>x.n!==null)?selected.reduce((a,x)=>a+x.n,0):null};
}
function history(rows,course,round){const a=rows.filter(r=>String(r.L??"").trim().toLowerCase()===course.trim().toLowerCase()&&Number(r.K)===round);const avg=k=>{const values=a.map(x=>number(x[k])).filter(x=>x!==null);return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;};return {n:a.length,delta:avg("R"),bob:avg("AK"),pars:avg("AL"),bogey:avg("AO")};}
function parseLeaderboard(payload){const a=Array.isArray(payload)?payload:payload?.data??payload?.players??payload?.predictions;return Array.isArray(a)?a.filter(p=>p&&typeof p.player_name==="string").map(p=>({name:p.player_name,pos:p.current_pos??p.pos??p.position??null,score:p.current_score??p.score??null,today:p.today??null,thru:p.thru??null,rounds:[p.R1??null,p.R2??null,p.R3??null,p.R4??null],win:p.win??null,top5:p.top_5??null,top10:p.top_10??null,top20:p.top_20??null,cut:p.make_cut??p.mc??null})):[];}
const api={parseHoleFeed,mergeWaves,metrics,history,parseLeaderboard};if(typeof module!=="undefined")module.exports=api;else root.GolfLiveMath=api;
})(globalThis);
