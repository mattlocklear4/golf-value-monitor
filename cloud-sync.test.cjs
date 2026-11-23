const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(require('node:path').join(__dirname, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x => x[1]).filter(Boolean);
for (const source of scripts) new vm.Script(source);
const mergeCode = html.slice(html.indexOf('const cloudSame='), html.indexOf('function cloudRemoteSnapshot'));
const context = vm.createContext({});
vm.runInContext(mergeCode + '\nthis.merge=cloudMerge;', context);
const merge = (base, local, remote) => {
  const answer = context.merge(base, local, remote);
  return JSON.parse(JSON.stringify(answer));
};
const board = () => ({rounds:{'3':{books:{DraftKings:{'A':110}}},'4':{books:{FanDuel:{'B':-120}}}},stdev:{lookup:{A:3}},aliases:{}});

test('different rounds from phone and desktop merge without loss', () => {
  const base=board(),phone=structuredClone(base),desktop=structuredClone(base);
  phone.rounds['4'].books.FanDuel.B=-105;
  desktop.rounds['3'].books.DraftKings.A=125;
  const result=merge(base,desktop,phone);
  assert.deepEqual(result.conflicts,[]);
  assert.equal(result.value.rounds['4'].books.FanDuel.B,-105);
  assert.equal(result.value.rounds['3'].books.DraftKings.A,125);
});

test('same round and sportsbook different player cells merge', () => {
  const base=board(),a=structuredClone(base),b=structuredClone(base);
  a.rounds['3'].books.DraftKings.A=115;
  b.rounds['3'].books.DraftKings.C=-125;
  const result=merge(base,a,b);
  assert.deepEqual(result.conflicts,[]);
  assert.equal(result.value.rounds['3'].books.DraftKings.A,115);
  assert.equal(result.value.rounds['3'].books.DraftKings.C,-125);
});

test('same cell concurrent changes conflict and preserve local copy', () => {
  const base=board(),a=structuredClone(base),b=structuredClone(base);
  a.rounds['3'].books.DraftKings.A=120;b.rounds['3'].books.DraftKings.A=130;
  const result=merge(base,a,b);
  assert.deepEqual(result.conflicts,['rounds.3.books.DraftKings.A']);
  assert.equal(result.value.rounds['3'].books.DraftKings.A,120);
});

test('independent StDev and aliases merge', () => {
  const base=board(),a=structuredClone(base),b=structuredClone(base);
  a.stdev.lookup.A=3.4;b.aliases['john doe']='j doe';
  const result=merge(base,a,b);
  assert.deepEqual(result.conflicts,[]);
  assert.equal(result.value.stdev.lookup.A,3.4);
  assert.equal(result.value.aliases['john doe'],'j doe');
});

test('DataGolf player arrays are atomic and conflict on concurrent replacement', () => {
  const base=board();base.rounds['4'].players=[{name:'A',score:70}];
  const a=structuredClone(base),b=structuredClone(base);
  a.rounds['4'].players=[{name:'A',score:71}];
  b.rounds['4'].players=[{name:'A',score:72}];
  assert.deepEqual(merge(base,a,b).conflicts,['rounds.4.players']);
});

test('offline phone changes safely merge after desktop writes', () => {
  const base=board(),server=structuredClone(base),phone=structuredClone(base);
  phone.rounds['4'].books.FanDuel.B=-110; // held offline
  server.rounds['3'].books.DraftKings.A=140;
  const reconnect=merge(base,phone,server);
  assert.deepEqual(reconnect.conflicts,[]);
  assert.equal(reconnect.value.rounds['4'].books.FanDuel.B,-110);
  assert.equal(reconnect.value.rounds['3'].books.DraftKings.A,140);
});

test('two devices racing version-checked writes retry without lost update', () => {
  const base=board(),phone=structuredClone(base),desktop=structuredClone(base);
  phone.rounds['4'].books.FanDuel.B=-115;
  desktop.rounds['3'].books.DraftKings.A=150;
  let version=1,server=structuredClone(base);
  const cas=(seen,value)=>{if(seen!==version)return false;server=value;version++;return true;};
  assert.equal(cas(1,phone),true);
  assert.equal(cas(1,desktop),false); // stale writer cannot clobber phone
  const retry=merge(base,desktop,server);
  assert.deepEqual(retry.conflicts,[]);
  assert.equal(cas(version,retry.value),true);
  assert.equal(server.rounds['3'].books.DraftKings.A,150);
  assert.equal(server.rounds['4'].books.FanDuel.B,-115);
});

test('production compare-and-swap timestamp advances even with a slow device clock', () => {
  assert.match(html,/Math\.max\(Date\.now\(\),Date\.parse\(remoteRow\.updated_at\)\+1\)/);
  const existing='2026-11-23T12:00:00.000Z';
  const laggingClock=Date.parse(existing)-10000;
  const next=new Date(Math.max(laggingClock,Date.parse(existing)+1)).toISOString();
  assert.ok(next>existing);
});

test('cloud refresh retains a local edit made after the request started', async () => {
  const source=html.slice(html.indexOf('async function cloudReconcile('),html.indexOf('async function cloudRestore('));
  const initial=board(),remote=structuredClone(initial),editing=structuredClone(initial);
  remote.rounds['3'].books.DraftKings.A=135;
  editing.rounds['4'].books.FanDuel.B=-105;
  let calls=0,applied=null,scheduled=false;
  const ctx=vm.createContext({
    cloudBaseline:()=>({payload:JSON.stringify(initial),updatedAt:'old'}),
    cloudRemoteSnapshot:()=>remote,
    cloudPayload:()=>JSON.stringify(calls++===0?initial:editing),
    cloudApplySnapshot:v=>{applied=v},
    cloudMarkSynced:()=>{},cloudSyncStatus:()=>{},
    cloudSchedule:()=>{scheduled=true},
    cloudPauseUI:()=>{},cloudEnabled:true,cloudLastReceived:null,
  });
  vm.runInContext(mergeCode+'\n'+source+'\nthis.reconcile=cloudReconcile',ctx);
  await ctx.reconcile({data:{board_data:{rounds:remote.rounds},updated_at:'new'}},false);
  assert.equal(applied.rounds['3'].books.DraftKings.A,135);
  assert.equal(applied.rounds['4'].books.FanDuel.B,-105);
  assert.equal(scheduled,true);
});

test('preview is isolated from production board and preferences tables', () => {
  assert.match(html,/const CLOUD_TABLE=CLOUD_READ_ONLY_PREVIEW\?CLOUD_TEST_TABLE:'user_board_state'/);
  assert.match(html,/if\(CLOUD_READ_ONLY_PREVIEW\)return \{data,preferences:\{\}\}/);
  assert.match(html,/CLOUD_READ_ONLY_PREVIEW&&url!==CLOUD_TEST_PROJECT/);
  assert.match(html,/cloudClient\.from\(CLOUD_TABLE\)\.update/);
});
