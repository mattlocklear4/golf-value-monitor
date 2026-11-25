// DataGolf history adapter; pure functions, also usable in Node tests.
(function(root){
const norm=v=>String(v??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const n=v=>v==null||String(v).trim()===''||!Number.isFinite(Number(v))?'':Number(v);
const fraction=v=>{if(typeof v==='string'&&v.endsWith('%')){const x=n(v.slice(0,-1));return x===''||x<0||x>100?'':x/100;}const x=n(v);return x===''||x<0||x>100?'':x>1?x/100:x;};
const count=v=>{const x=n(v);return Number.isInteger(x)&&x>=0&&x<=18?x:'';};
const sum=(a,b)=>a===''||b===''?'':a+b;
const name=v=>String(v??'').includes(',')?String(v).split(',').map(x=>x.trim()).reverse().join(' '):String(v??'');
function map(payload,meta,lookup=[]){
const players=Array.isArray(payload)?payload:payload?.scores;
if(!Array.isArray(players))throw Error('Unrecognized DataGolf rounds response');
const rows=[];
for(const p of players)for(let k=1;k<=4;k++){
const r=p['round_'+k];if(!r||typeof r!=='object')continue;
const q=n(r.round_score),par=n(r.course_par);if(q===''||q<=0||!p.player_name)continue;
const year=n(payload.year??meta.year),course=String(r.course_name??'');const id=String(r.course_num??'');
const matches=lookup.filter(x=>(x.course_id&&String(x.course_id)===id&&(!x.tour||x.tour===meta.tour)||!x.course_id&&norm(x.course)===norm(course))&&(!x.year||Number(x.year)===year)).sort((a,b)=>Number(!!b.year)-Number(!!a.year)||Number(!!b.course_id)-Number(!!a.course_id));
const fw=matches.length&&Number.isInteger(Number(matches[0].fairways))&&Number(matches[0].fairways)>=1&&Number(matches[0].fairways)<=18?Number(matches[0].fairways):'';
const da=fraction(r.driving_acc),gir=fraction(r.gir),e=count(r.eagles_or_better??r.eagles_plus),b=count(r.birdies),pa=count(r.pars),bo=count(r.bogies??r.bogeys),d=count(r.doubles_or_worse??r.double_bogeys_or_worse??r.doubles_plus);
const totalBob=sum(e,b),remaining=totalBob!==''&&pa!==''&&totalBob+pa<=18?18-totalBob-pa:'';const resolvedBogey=bo===''&&remaining!==''&&d!==''&&d<=remaining?remaining-d:bo;const totalBogey=sum(resolvedBogey,d);const bogeyPlus=totalBogey!==''&&remaining!==''&&totalBogey!==remaining?'':totalBogey!==''?totalBogey:remaining;
rows.push({B:year,C:n(payload.season??meta.season),D:String(payload.event_name??meta.event_name??''),H:name(p.player_name),J:p.fin_text??'',K:k,L:course,N:par,P:r.teetime??'',Q:q,R:par===''?'':q-par,Z:da,AA:da===''||fw===''?'':Math.round(da*fw),AB:gir,AC:gir===''?'':Math.round(gir*18),AI:e,AJ:b,AK:totalBob,AL:pa,AM:resolvedBogey,AN:d,AO:bogeyPlus,dg_id:p.dg_id,course_num:id,tour:meta.tour,event_id:meta.event_id});
}return rows;
}
function parseLookup(s){const lines=s.trim().split(/\r?\n/).filter(Boolean);const split=l=>[...l.matchAll(/(?:^|,)\s*(?:"((?:[^"]|"")*)"|([^,]*))/g)].map(m=>(m[1]??m[2]).replace(/""/g,'"').trim());const h=split(lines.shift()??'').map(norm);const rows=lines.map(split).map(a=>Object.fromEntries(h.map((k,i)=>[k,a[i]??'']))).map(x=>({course:x['course name']||x.course,course_id:x['course id']||x['course num'],tour:x.tour,year:x.year,fairways:Number(x.fairways)}));if(!rows.length||rows.some(x=>!(x.course||x.course_id)||!Number.isInteger(x.fairways)||x.fairways<1||x.fairways>18))throw Error('CSV needs Course Name or Course ID and Fairways (1–18).');return rows;}
const api={norm,map,parseLookup};if(typeof module!=='undefined')module.exports=api;else root.DGHistory=api;
})(globalThis);
