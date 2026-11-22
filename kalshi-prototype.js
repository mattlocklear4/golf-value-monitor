'use strict';
// Isolated, read-only Kalshi prototype. Nothing here writes localStorage or cloud state.
const $ = id => document.getElementById(id);
// Isolated Sites preview proxies public Kalshi data because the exchange endpoint
// omits Access-Control-Allow-Origin. Other static hosts still use direct requests.
const API = location.hostname.endsWith('.chatgpt.site') ? location.origin+'/api/kalshi/markets' : 'https://api.elections.kalshi.com/trade-api/v2/markets';
const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const aliases = {'benjamin james':'ben james','john keefer':'johnny keefer','jordan smith':'jordan l smith','hao tong li':'haotong li'};
let projections = new Map(), markets = [], fetchedAt = null, fetching = false, lastError = '';
const integrated = new URLSearchParams(location.search).get('integrated')==='1' && window.parent!==window;
let lastIntegratedSignature='';
function erf(x){const sign=x<0?-1:1;x=Math.abs(x);const t=1/(1+.3275911*x);return sign*(1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x));}
const cdf = z => .5*(1+erf(z/Math.SQRT2));
const dollars = n => Number.isFinite(n)?'$'+n.toFixed(2):'—';
const percent = n => Number.isFinite(n)?(n*100).toFixed(1)+'%':'—';
function americanOdds(probability){
 if(!Number.isFinite(probability)||probability<=0||probability>=1)return '—';
 if(probability===.5)return '+100'; // Even money is +100, never -100.
 const odds=probability<.5?100*(1-probability)/probability:-100*probability/(1-probability);
 const rounded=Math.round(Math.abs(odds));
 return (odds>0?'+':'-')+rounded;
}
const quoteDisplay = n => $('oddsformat').value==='american'?americanOdds(n):dollars(n);
const betSide = (rule,side) => !rule?null:(side==='yes'?rule.direction:(rule.direction==='under'?'over':'under'));
const betLabel = (rule,side) => !rule?'Settlement unverified':betSide(rule,side).toUpperCase()+' '+rule.line.toFixed(1);
const quoteUpdatedAt = m => Date.parse(m.updated_time||'');
const quoteAgeMs = (m,now=Date.now()) => {const t=quoteUpdatedAt(m);return Number.isFinite(t)?Math.max(0,now-t):Infinity;};
function askDepth(m,side){
 const value=m[side+'_ask_size_fp']??m[side+'_ask_size'];
 if(value===null||value===undefined||value==='')return null;
 const n=Number(value);return Number.isFinite(n)&&n>=0?n:null;
}
function quoteWarning(m,side,qty){
 const age=quoteAgeMs(m),depth=askDepth(m,side);
 if(!Number.isFinite(age))return 'Unknown update time · verify quote';
 if(age>120000)return 'Market update >2 min old · verify quote';
 if(depth===0)return 'No reported ask depth';
 if(depth!==null&&depth<qty)return 'Ask depth below order size';
 return depth===null?'Ask depth not supplied · verify quote':'Market updated recently · still verify fill';
}
const quoteTimeText=m=>Number.isFinite(quoteUpdatedAt(m))?new Date(quoteUpdatedAt(m)).toLocaleString():'Unknown';
const price = (m,side) => {const v=m[side+'_ask_dollars'];const n=v!==undefined&&v!==null&&v!==''?Number(v):Number(m[side+'_ask'])/100;return Number.isFinite(n)&&n>0&&n<1?n:NaN;};
function fee(pricePerContract, qty, multiplier){
 if(!Number.isFinite(pricePerContract)||!Number.isInteger(qty)||qty<1||qty>10000||!Number.isFinite(multiplier)||multiplier<0||multiplier>20)return NaN;
 return Math.ceil((.07*qty*pricePerContract*(1-pricePerContract)*multiplier-1e-10)*100)/100;
}
function valuation(prob,ask,qty,multiplier){
 const cost=ask*qty,charge=fee(ask,qty,multiplier);return {fee:charge,roi:Number.isFinite(prob)&&Number.isFinite(cost)&&Number.isFinite(charge)&&cost+charge>0?(prob*qty-cost-charge)/(cost+charge):NaN};
}
function parseRule(m){
 // Use authoritative settlement wording; prohibit vague title/ticker guesses and non-half-stroke lines.
 const rule=String(m.rules_primary||'').trim();
 const match=rule.match(/^If\s+(.+?)\s+records\s+(under|over)\s+(\d{2}\.5)\s+strokes\s+in\s+Round\s+([1-4])\s+of\s+(.+?),?\s+then\s+the\s+market\s+resolves\s+to\s+Yes\.?$/i);
 if(!match||!String(m.event_ticker||'').startsWith('KXPGAROUNDSCORE-'))return null;
 const name=match[1].trim(),direction=match[2].toLowerCase(),line=Number(match[3]),round=match[4],event=m.event_ticker;
 if(line<54.5||line>95.5||!new RegExp('R'+round+'$').test(event)||!['active','open'].includes(m.status))return null;
 if(m.strike_type && m.strike_type!==(direction==='under'?'less':'greater'))return null;
 if(Number.isFinite(Number(m.cap_strike))&&direction==='under'&&Number(m.cap_strike)!==line+.5)return null;
 if(Number.isFinite(Number(m.floor_strike))&&direction==='over'&&Number(m.floor_strike)!==line-.5)return null;
 // Settlement rules must agree with advertised player and threshold before modelling.
 // Conflicts remain visible as quote-only contracts, never priced by a model.
 const title=normalize(m.yes_sub_title||m.no_sub_title||'');
 if(title&&(!title.includes(normalize(name))||!title.includes(normalize(match[3]))))return null;
 return {name,direction,line,round,event,competition:match[5]};
}
function modelFor(name){
 const key=normalize(name),canonical=aliases[key]||key;
 const candidates=[projections.get(canonical),projections.get(key)].filter(Boolean);
 return candidates.length>1&&candidates[0]!==candidates[1]?null:candidates[0]||null;
}
function loadBoard(){
 try{
  const all=JSON.parse(localStorage.getItem('gvm-v3-rounds')||'null');
  const sd=JSON.parse(localStorage.getItem('gvm-v3-tournament-sd')||'null');
  const d=all?.[$('round').value];if(!Array.isArray(d?.players)||!d.players.length)throw Error('No saved DataGolf players at this origin. The production board and this test preview have separate browser storage; use the CSV/TSV import below.');
  const values=d.players.map(p=>Number(p.dg)).filter(Number.isFinite),avg=values.reduce((a,b)=>a+b,0)/values.length;
  const par=Number(d.par),field=Number(d.field);if(!Number.isFinite(avg)||!Number.isFinite(par)||!Number.isFinite(field))throw Error('Saved round model is invalid.');
  const lookupAliases={...aliases};try{Object.assign(lookupAliases,JSON.parse(localStorage.getItem('gvm-v62-aliases')||'{}'));}catch{}
  const rows=[];
  for(const p of d.players){const dg=Number(p.dg);if(!Number.isFinite(dg)||!p.name)continue;
   const key=normalize(p.name),alias=lookupAliases[key]||key,raw=sd?.lookup?.[alias]??sd?.lookup?.[key],v=raw===undefined||raw===null||raw===''?NaN:Number(raw);
   const fallback=Number(sd?.defaultSd),stdev=Number.isFinite(v)&&v>0?v:Number.isFinite(fallback)&&fallback>0?fallback:3;
   rows.push([p.name,par+field-(dg-avg)/4.1,stdev].join(','));
  }
  $('projections').value=rows.join('\n');parseProjections();$('boardstatus').textContent=`Loaded ${rows.length} Round ${$('round').value} DataGolf players from this browser. No saved data changed.`;
 }catch(e){$('boardstatus').textContent='Board load failed: '+e.message;}
}
function parseProjections(){
 const next=new Map(),errors=[];
 $('projections').value.split(/\r?\n/).forEach((line,i)=>{
  if(!line.trim())return;const parts=line.split(/[\t,]/).map(x=>x.trim());if(i===0&&normalize(parts[0])==='player')return;
  const mu=Number(parts[1]),sd=Number(parts[2]),key=normalize(parts[0]);
  if(parts.length!==3||!key||!parts[1]||!parts[2]||!Number.isFinite(mu)||mu<50||mu>100||!Number.isFinite(sd)||sd<.1||sd>20||next.has(key)){errors.push(i+1);return;}
  next.set(key,{name:parts[0],mu,sd});
 });
 projections=next;$('pcount').textContent=next.size+' projections loaded';if(errors.length)$('boardstatus').textContent='Skipped invalid or duplicate projection rows: '+errors.slice(0,12).join(', ');render();
}
function syncIntegratedModel(){
 if(!integrated)return;
 try{
  if(typeof window.parent.gvmKalshiSnapshot!=='function')throw Error('Waiting for the Golf Board model.');
  const snapshot=window.parent.gvmKalshiSnapshot();
  if(!/^[1-4]$/.test(snapshot.round)||!Array.isArray(snapshot.players))throw Error('Invalid Golf Board model snapshot.');
  const signature=JSON.stringify(snapshot);if(signature===lastIntegratedSignature)return;
  lastIntegratedSignature=signature;$('round').value=snapshot.round;
  if(snapshot.aliases&&typeof snapshot.aliases==='object')for(const [from,to] of Object.entries(snapshot.aliases)){const a=normalize(from),b=normalize(to);if(a&&b)aliases[a]=b;}
  const next=new Map();for(const p of snapshot.players){const name=normalize(p.name),mu=Number(p.mu),sd=Number(p.sd);if(!name||!Number.isFinite(mu)||!Number.isFinite(sd)||sd<=0||next.has(name))continue;next.set(name,{name:p.name,mu,sd});}
  projections=next;$('pcount').textContent=next.size+' integrated projections';
  $('boardstatus').textContent=`Using ${next.size} live player projections from Golf Board Round ${snapshot.round}. No duplicate import or cloud write.`;
  render();
 }catch(e){$('boardstatus').textContent='Integrated model unavailable: '+e.message;}
}
async function importProjectionFile(event){
 const file=event.target.files?.[0];if(!file)return;
 try{
  if(file.size>256*1024)throw Error('File exceeds 256 KB limit.');
  $('projections').value=await file.text();parseProjections();
  $('boardstatus').textContent=`Imported ${projections.size} projections from ${file.name} locally. Nothing was uploaded or saved.`;
 }catch(e){$('boardstatus').textContent='Import failed: '+e.message;}
 finally{event.target.value='';}
}
function accept(data){
 if(!data||!Array.isArray(data.markets))throw Error('JSON needs a markets array.');
 const seen=new Set(),next=[];
 for(const m of data.markets){if(!m||typeof m.ticker!=='string'||seen.has(m.ticker))continue;if(!m.ticker.startsWith('KXPGAROUNDSCORE-'))continue;seen.add(m.ticker);if(['active','open'].includes(m.status))next.push(m);}
 markets=next;fetchedAt=new Date();lastError='';
 const eventOptions=new Map();for(const m of markets){const rule=parseRule(m),event=m.event_ticker;
  if(typeof event==='string'&&!eventOptions.has(event))eventOptions.set(event,rule?rule.competition+' · Round '+rule.round:event+' · settlement unverified');}
 const old=$('event').value,select=$('event');select.replaceChildren(new Option('Choose tournament and round',''));
 for(const [ticker,label] of [...eventOptions].sort((a,b)=>a[1].localeCompare(b[1])))select.add(new Option(label+' ('+ticker+')',ticker));
 if(eventOptions.has(old))select.value=old;else if(eventOptions.size)select.value=[...eventOptions.keys()][0];
 syncRoundToEvent();
 render();
}
function syncRoundToEvent(){if(integrated)return;const event=$('event').value,match=event.match(/R([1-4])$/);if(match)$('round').value=match[1];}
function renderBestBets(candidates,qty){
 const min=Math.max(0,Number($('bestmin').value)||0)/100,sideFilter=$('bestside').value,freshOnly=$('bestfresh').checked,depthOnly=$('bestdepth').checked,sort=$('bestsort').value;
 const bets=[];
 for(const r of candidates){
  if(!r.rule||!r.p)continue;
  for(const side of ['yes','no']){
   const evaluation=r[side==='yes'?'y':'n'],ask=r[side==='yes'?'ya':'na'],prob=r[side==='yes'?'yes':'no'],mapped=betSide(r.rule,side),depth=askDepth(r.m,side);
   if(sideFilter!=='all'&&mapped!==sideFilter)continue;
   if(!Number.isFinite(ask)||!Number.isFinite(evaluation.roi)||evaluation.roi<=0||evaluation.roi<min)continue;
   if(freshOnly&&quoteAgeMs(r.m)>120000)continue;
   if(depthOnly&&(depth===null||depth<qty))continue;
   bets.push({...r,side,mapped,ask,prob,roi:evaluation.roi,depth});
  }
 }
 bets.sort((a,b)=>sort==='player'?a.rule.name.localeCompare(b.rule.name):sort==='odds'?a.ask-b.ask:sort==='fresh'?quoteAgeMs(a.m)-quoteAgeMs(b.m):b.roi-a.roi);
 const body=$('bestrows');body.replaceChildren();
 for(const r of bets){const tr=document.createElement('tr');const cells=[r.rule.name+' · '+betLabel(r.rule,r.side),r.rule.round,quoteDisplay(r.ask),americanOdds(r.prob),percent(r.prob),percent(r.roi),r.depth===null?'Not reported':String(r.depth),quoteTimeText(r.m),quoteWarning(r.m,r.side,qty)];
  cells.forEach((value,i)=>{const td=document.createElement('td');td.textContent=value;if(i===0)td.className='bet-side';if(i===5)td.className='good';if(i===8&&quoteAgeMs(r.m)>120000)td.className='warn';tr.appendChild(td);});body.appendChild(tr);
 }
 if(!bets.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=9;td.textContent='No verified positive edges match these filters. Check the active round, player projections, minimum ROI and quote/depth restrictions.';tr.appendChild(td);body.appendChild(tr);}
 $('beststatus').textContent=`${bets.length} positive model edges · ${fetchedAt?'API retrieved '+fetchedAt.toLocaleString():'API not yet retrieved'} · Quote prices are indicative; market update time is not a quote-specific timestamp.`;
}
function render(){
 const selected=$('event').value,round=$('round').value,query=normalize($('search').value),min=Number($('minroi').value),qty=Number($('qty').value),multiplier=Number($('multiplier').value);
 const positiveOnly=$('positive').checked,sort=$('sort').value;
 const asAmerican=$('oddsformat').value==='american';
 $('yesaskheader').textContent=asAmerican?'YES ask (American, before fees)':'YES ask ($, before fees)';
 $('noaskheader').textContent=asAmerican?'NO ask (American, before fees)':'NO ask ($, before fees)';
 const rows=[],allCandidates=[],stats={unrecognized:0,wrongRound:0,unmatched:0,unpriced:0,matched:0};
 for(const m of markets){if(m.event_ticker!==selected)continue;
  const rule=parseRule(m);if(!rule)stats.unrecognized++;
  const roundMatches=rule?.round===round;if(rule&&!roundMatches)stats.wrongRound++;
  const p=roundMatches?modelFor(rule.name):null;if(!p)stats.unmatched++;else stats.matched++;
  if(query&&!normalize((rule?.name||m.title||'')+' '+m.ticker).includes(query))continue;
  const yes=p?(rule.direction==='under'?cdf((rule.line-p.mu)/p.sd):1-cdf((rule.line-p.mu)/p.sd)):NaN,no=Number.isFinite(yes)?1-yes:NaN;
  const ya=price(m,'yes'),na=price(m,'no');if(!Number.isFinite(ya)&&!Number.isFinite(na))stats.unpriced++;
  const y=valuation(yes,ya,qty,multiplier),n=valuation(no,na,qty,multiplier);
  allCandidates.push({rule,p,m,yes,no,ya,na,y,n});
  if(positiveOnly&&(!p||Math.max(y.roi,n.roi)<=0))continue;
  if(p&&Number.isFinite(min)&&Math.max(y.roi,n.roi)<min)continue;
  rows.push({rule,p,m,yes,no,ya,na,y,n});
 }
 const best=r=>Math.max(...[r.y.roi,r.n.roi].filter(Number.isFinite),-Infinity);
 rows.sort((a,b)=>sort==='player'?(a.rule?.name||a.m.title||'').localeCompare(b.rule?.name||b.m.title||''):sort==='line'?(a.rule?.line??Infinity)-(b.rule?.line??Infinity):sort==='volume'?Number(b.m.volume_fp||0)-Number(a.m.volume_fp||0):best(b)-best(a));
 const body=$('rows');body.replaceChildren();
 for(const r of rows){const tr=document.createElement('tr'),quoteTime=quoteTimeText(r.m)+(quoteAgeMs(r.m)>120000?' · market stale':'')+' · '+quoteWarning(r.m,'yes',qty);const cells=[(r.rule?.name||r.m.title||'Unverified contract')+' · '+r.m.ticker,r.rule?.round||'—',r.rule?betLabel(r.rule,'yes')+' (YES) / '+betLabel(r.rule,'no')+' (NO)':'Unverified',r.p?r.p.mu.toFixed(2):'—',r.p?r.p.sd.toFixed(2):'—',percent(r.yes)+' / '+americanOdds(r.yes),quoteDisplay(r.ya),dollars(r.y.fee),percent(r.y.roi),percent(r.no)+' / '+americanOdds(r.no),quoteDisplay(r.na),dollars(r.n.fee),percent(r.n.roi),r.m.volume_fp||'—',quoteTime];
  cells.forEach((value,i)=>{const td=document.createElement('td');td.textContent=value;if(i===0)td.title=r.m.rules_primary+'\n'+(r.m.rules_secondary||'');if(i===6||i===10)td.title='Underlying Kalshi ask: '+dollars(i===6?r.ya:r.na)+' per $1 contract, before fees';if(i===8||i===12)td.className=Number.isFinite(i===8?r.y.roi:r.n.roi)?(i===8?r.y.roi:r.n.roi)>0?'good':'bad':'';tr.appendChild(td);});body.appendChild(tr);
 }
 if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=15;td.textContent=markets.length?'No contracts match the selected filters. Try the other round/event or clear search.':'No open contracts returned yet. Refresh markets or inspect the API error above.';tr.appendChild(td);body.appendChild(tr);}
 $('matchstatus').textContent=`${rows.length} visible contracts · ${stats.matched} model matches · ${stats.unmatched} without projections/rule verification · ${stats.unrecognized} settlement rules unverified · ${stats.unpriced} missing both asks. Unverified contracts show quotes only, never model ROI.`;
 $('status').textContent=(lastError?'Refresh failed: '+lastError+' · Showing previously retrieved data.\n':'')+`${markets.length} open series contracts · ${selected||'Select a tournament'} · ${fetchedAt?'API retrieved '+fetchedAt.toLocaleString():'API not yet retrieved'} · Kalshi market updated time is per-contract, not proof of a live fill.`;
 renderBestBets(allCandidates,qty);
}
async function fetchMarkets(){
 if(fetching)return;fetching=true;$('load').disabled=true;$('status').textContent='Fetching Kalshi markets…';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{
  const series=$('series').value.trim().toUpperCase();if(!/^[A-Z0-9-]{3,70}$/.test(series))throw Error('Invalid series ticker.');
  let cursor='',all=[],complete=false;
  for(let page=0;page<20;page++){
   const url=new URL(API);url.searchParams.set('series_ticker',series);url.searchParams.set('status','open');url.searchParams.set('limit','200');if(cursor)url.searchParams.set('cursor',cursor);
   const response=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);
   const data=await response.json();if(!Array.isArray(data.markets))throw Error('Invalid Kalshi response.');all.push(...data.markets);cursor=data.cursor||'';if(!cursor){complete=true;break;}
  }
  if(!complete)throw Error('Too many pages; previous market data preserved.');accept({markets:all});
 }catch(e){lastError=e.name==='AbortError'?'Timed out after 20 seconds':e.message;render();}
 finally{clearTimeout(timer);fetching=false;$('load').disabled=false;}
}
$('boardload').addEventListener('click',loadBoard);$('parse').addEventListener('click',parseProjections);
// New read-only controls are appended without changing legacy sportsbook DOM.
document.querySelectorAll('.panel')[2].querySelector('.toolbar').insertAdjacentHTML('beforeend','<label>Sort contracts<select id="sort"><option value="roi">Highest fee-adjusted ROI</option><option value="player">Player</option><option value="line">Threshold</option><option value="volume">Volume</option></select></label><label><input id="positive" type="checkbox"> Positive ROI only</label>');
const bestPanel=document.createElement('section');bestPanel.className='panel';bestPanel.id='bestKalshiPanel';
bestPanel.innerHTML='<h2>3 · Best Kalshi Bets <span class="good">Positive model edges</span></h2><div class="toolbar"><label>Minimum fee-adjusted ROI %<input id="bestmin" type="number" min="0" step="1" value="0"></label><label>Bet side<select id="bestside"><option value="all">Over and Under</option><option value="over">Over only</option><option value="under">Under only</option></select></label><label>Sort by<select id="bestsort"><option value="roi">Highest ROI</option><option value="player">Player A–Z</option><option value="odds">Highest payout</option><option value="fresh">Newest market update</option></select></label><label><input id="bestfresh" type="checkbox"> Market update within 2 min</label><label><input id="bestdepth" type="checkbox"> Reported ask depth covers order</label></div><p class="muted">Settlement-verified, round-matched positive edges only. Prices are indicative, not guaranteed fills; a recently updated market is not necessarily a recently updated quote.</p><p id="beststatus" class="muted"></p><div class="scroll"><table><thead><tr><th>Bet / Player</th><th>Round</th><th>Kalshi before fees</th><th>Fair American odds</th><th>Fair probability</th><th>Fee-adjusted ROI</th><th>Ask depth</th><th>Market updated</th><th>Quote caution</th></tr></thead><tbody id="bestrows"></tbody></table></div>';
const pricePanel=document.querySelectorAll('main > section.panel')[2];pricePanel.parentNode.insertBefore(bestPanel,pricePanel);
const extraStyles=document.createElement('style');extraStyles.textContent='#bestKalshiPanel{border-color:#357a66}#bestKalshiPanel table{min-width:1020px}#bestKalshiPanel th:first-child,#bestKalshiPanel td:first-child{position:static}#bestKalshiPanel td:first-child{font-weight:750;color:#e6f3ff}#bestKalshiPanel .toolbar label:has(input[type=checkbox]){flex-direction:row;align-items:center}';document.head.appendChild(extraStyles);
pricePanel.querySelector('h2').textContent='4 · All Kalshi contracts and model comparison';
const columnTitles=pricePanel.querySelectorAll('thead th');columnTitles[2].textContent='Verified YES / NO betting sides';columnTitles[5].textContent='Fair YES % / American odds';columnTitles[9].textContent='Fair NO % / American odds';
for(const id of ['bestmin','bestside','bestsort','bestfresh','bestdepth'])$(id).addEventListener('input',render);
const quoteHeader=document.createElement('th');quoteHeader.textContent='Kalshi market updated / quote caution';document.querySelector('#rows').closest('table').querySelector('thead tr').appendChild(quoteHeader);
$('rows').firstElementChild?.setAttribute('colspan','15');
$('projectionfile').addEventListener('change',importProjectionFile);
$('parsejson').addEventListener('click',()=>{try{accept(JSON.parse($('json').value));}catch(e){lastError=e.message;render();}});
$('load').addEventListener('click',fetchMarkets);
for(const id of ['round','search','qty','multiplier','minroi','oddsformat','positive','sort'])$(id).addEventListener('input',render);
$('event').addEventListener('change',()=>{syncRoundToEvent();render();});
setInterval(()=>{if($('autorefresh').checked&&!document.hidden)fetchMarkets();},60000);
if(integrated){document.body.classList.add('integrated');document.querySelectorAll('.panel')[0].hidden=true;document.querySelector('main>p').textContent='Using the parent Golf Board’s active round, score projections and StDev automatically. No separate import or cloud write. Markets for other rounds remain quote-only.';syncIntegratedModel();setInterval(syncIntegratedModel,1500);}else loadBoard();
fetchMarkets();
