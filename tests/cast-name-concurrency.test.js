const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {source,fixture,fakeDb,contextFor,clone,emulator}=require('./helpers/scoped-runtime.cjs');
const date='2026-09-08',castId='cast-one';
function data(){return{...fixture(),casts:[{id:castId,name:'Original',active:true,registeredAt:1,sortIndex:0}],castLifecycleLogs:{},
  sessions:{t1:{tableId:'t1',sessionId:'session-one',startTime:100,_rev:1,items:[{id:'drink',castId,castName:'Original',price:1000,qty:1}]}},
  shifts:{sh1:{id:'sh1',castId,castName:'Original',clockIn:90,status:'active',_rev:1}},
  assignments:{a1:{id:'a1',castId,castName:'Original',tableId:'t1',sessionId:100,startTime:110,type:'free',_rev:1}},history:{},
  _settingsRevisions:{castRoster:0}};}
function runtime(state=data(),hooks={},providedDatabase){
  const base=providedDatabase||fakeDb(state);let ctx;
  const db={...base,ref(key){const ref=base.ref(key),get=ref.get.bind(ref),update=ref.update?.bind(ref);
    ref.get=async()=>{const result=await get();if(hooks.afterRead)await hooks.afterRead(key,ctx,state);return result;};
    ref.once=async()=>ref.get();
    if(update)ref.update=async values=>{if(hooks.beforeWrite)await hooks.beforeWrite(values,ctx,state);const result=await update(values);if(hooks.afterWrite)await hooks.afterWrite(values,ctx,state);return result;};
    return ref;
  }};
  ctx=contextFor(db,state);
  Object.assign(ctx,{MAX_TABLE_COUNT:30,document:{getElementById:()=>null},APP_VERSION:'6.152',_verNum:()=>615200});
  for(const [from,to] of [
    ['function normalizeCasts','function allCasts'],
    ['const LIGHTWEIGHT_SETTING_PATHS','const sessionSaveQueues'],
    ['function settingConflictError','function castIdQueryValues'],
    ['async function guardedUpdate','function canonicalJsonValue'],
    ['function castNameItemValue','function hasVisibleCastName']
  ])vm.runInContext(source(from,to),ctx);
  ctx.currentCastBizDate=()=>ctx.S.activeBizDay||date;
  ctx.updateRemoteHash('casts',state.casts);ctx.updateRemoteHash('castLifecycleLogs',state.castLifecycleLogs);
  return{ctx,db:base,state};
}
function changedRecord(collection,row){
  if(collection==='sessions')return{...clone(row),_rev:2,items:[...row.items,{id:'new-order',price:5000,qty:1}]};
  if(collection==='shifts')return{...clone(row),_rev:2,clockOut:999,status:'off'};
  return{...clone(row),_rev:2,endTime:999};
}
for(const [collection,key] of [['sessions','t1'],['shifts','sh1'],['assignments','a1']])test('cast rename rejects a concurrent '+collection+' update received during roster reads',async()=>{
  const state=data();let changed=false;
  const {ctx,db}=runtime(state,{afterRead(path,local,remote){
    if(path!=='pos-dev/casts'||changed)return;changed=true;
    remote[collection][key]=changedRecord(collection,remote[collection][key]);local.S[collection][key]=clone(remote[collection][key]);
  }});
  await assert.rejects(ctx.guardedCastNameChange(castId,'Renamed'));
  assert.equal(db.writes.length,0);assert.equal(state.casts[0].name,'Original');
  assert.equal(state[collection][key]._rev,2);
  if(collection==='sessions')assert.equal(state.sessions.t1.items[1].price,5000);
});

test('cast rename preserves unrelated tables, new shifts and new history delivered during acknowledgement',async()=>{
  const state=data();
  const {ctx}=runtime(state,{afterWrite(_updates,local,remote){
    remote.sessions.t2={tableId:'t2',sessionId:'new',startTime:900,_rev:1,items:[{id:'other',price:7000}]};
    remote.shifts.sh2={id:'sh2',castId:'other',clockIn:900,_rev:1};
    remote.history.h2={id:'h2',endTime:950,total:7000,_rev:1,items:[]};
    local.S.sessions.t2=clone(remote.sessions.t2);local.S.shifts.sh2=clone(remote.shifts.sh2);local.S.history.push(clone(remote.history.h2));
  }});
  await ctx.guardedCastNameChange(castId,'Renamed');
  assert.equal(ctx.S.sessions.t2?.items[0].price,7000);assert.equal(ctx.S.shifts.sh2?.castId,'other');assert.equal(ctx.S.history[0]?.id,'h2');
  assert.equal(ctx.S.sessions.t1.items[0].castName,'Renamed');assert.equal(ctx.S.sessions.t1._rev,2);
});

for(const [collection,key] of [['sessions','t1'],['shifts','sh1'],['assignments','a1']])test('cast rename does not roll back a newer '+collection+' revision received after its write',async()=>{
  const state=data();
  const {ctx}=runtime(state,{afterWrite(_updates,local,remote){
    remote[collection][key]=changedRecord(collection,remote[collection][key]);remote[collection][key]._rev=3;
    local.S[collection][key]=clone(remote[collection][key]);
  }});
  await ctx.guardedCastNameChange(castId,'Renamed');
  assert.equal(ctx.S[collection][key]._rev,3);
  if(collection==='sessions')assert.equal(ctx.S.sessions.t1.items[1].price,5000);
});

test('cast rename rejects an explicit stale business day before touching business records',async()=>{
  const state=data(),{ctx,db}=runtime(state);
  await assert.rejects(ctx.guardedCastNameChange(castId,'Renamed',{expectedActiveBizDay:'2026-09-07'}));
  assert.equal(db.writes.length,0);assert.equal(state.casts[0].name,'Original');
});

test('roster-only rename also carries a server-side active-day proof',async()=>{
  const state=data();state.sessions={};state.shifts={};state.assignments={};
  const {ctx,db}=runtime(state);await ctx.guardedCastNameChange(castId,'Renamed',{expectedActiveBizDay:date});
  assert.equal(db.writes[0]['pos-dev/_scopedOperation']?.expectedActiveBizDay,date);
});

test('cast rename never reinstalls old-day business records after a received day switch',async()=>{
  const state=data();
  const {ctx}=runtime(state,{afterWrite(_updates,local,remote){remote.activeBizDay='2026-09-09';local.S.activeBizDay=remote.activeBizDay;local.S.sessions={};local.S.shifts={};local.S.assignments={};local.S.history=[];}});
  await ctx.guardedCastNameChange(castId,'Renamed');
  assert.equal(ctx.S.activeBizDay,'2026-09-09');assert.equal(Object.keys(ctx.S.sessions).length,0);assert.equal(Object.keys(ctx.S.shifts).length,0);assert.equal(Object.keys(ctx.S.assignments).length,0);
});

test('history indices received during roster reads do not change the rename target',async()=>{
  const state=data();state.history={h1:{id:'h1',_rev:1,items:[{id:'drink',castId,castName:'Original'}]}};let delivered=false;
  const {ctx}=runtime(state,{afterRead(path,local,remote){
    if(path!=='pos-dev/casts'||delivered)return;delivered=true;
    remote.history.h2={id:'h2',_rev:1,total:5000,items:[]};local.S.history.unshift(clone(remote.history.h2));
  }});
  await ctx.guardedCastNameChange(castId,'Renamed');
  assert.equal(state.history.h1.items[0].castName,'Renamed');assert.equal(ctx.S.history.find(row=>row.id==='h1').items[0].castName,'Renamed');
  assert.equal(ctx.S.history[0].id,'h2');assert.equal(ctx.S.history[0].total,5000);
});

test('a newer history revision delivered during acknowledgement remains visible',async()=>{
  const state=data();state.history={h1:{id:'h1',_rev:1,total:1000,items:[{id:'drink',castId,castName:'Original'}]}};
  const {ctx}=runtime(state,{afterWrite(_updates,local,remote){
    remote.history.h1={...remote.history.h1,_rev:3,total:6000,items:[...remote.history.h1.items,{id:'new',price:5000}]};local.S.history=[clone(remote.history.h1)];
  }});
  await ctx.guardedCastNameChange(castId,'Renamed');
  assert.equal(ctx.S.history[0]._rev,3);assert.equal(ctx.S.history[0].total,6000);assert.equal(ctx.S.history[0].items[1].price,5000);
});

test('cast rename concurrency guards hold under Firebase rules',{skip:process.env.POS_RULES_EMULATOR!=='1'},async t=>{
  const em=await emulator('demo-pos-cast-rename-concurrency'),saved=()=>em.request('pos-dev','GET',undefined,true);
  for(const [collection,key] of [['sessions','t1'],['shifts','sh1'],['assignments','a1']])await t.test(collection+' received during roster reads cannot become a stale write expectation',async()=>{
    const state=data();await em.reset(state);let raced=false;
    const {ctx}=runtime(state,{async afterRead(path,local,remote){
      if(path!=='pos-dev/casts'||raced)return;raced=true;
      const next=changedRecord(collection,remote[collection][key]);
      await em.request('pos-dev/'+collection+'/'+key,'PUT',next,true);local.S[collection][key]=clone(next);
    }},em.db());
    await assert.rejects(ctx.guardedCastNameChange(castId,'Renamed'));
    const current=await saved();assert.equal(current.casts[0].name,'Original');assert.equal(current[collection][key]._rev,2);
    if(collection==='sessions')assert.equal(current.sessions.t1.items[1].price,5000);
  });
  await t.test('a server-side order race after validation rejects the entire rename',async()=>{
    const state=data();await em.reset(state);let raced=false;
    const {ctx}=runtime(state,{async beforeWrite(_updates,local,remote){
      if(raced)return;raced=true;const next=changedRecord('sessions',remote.sessions.t1);
      await em.request('pos-dev/sessions/t1','PUT',next,true);local.S.sessions.t1=clone(next);
    }},em.db());
    await assert.rejects(ctx.guardedCastNameChange(castId,'Renamed'));
    const current=await saved();assert.equal(current.casts[0].name,'Original');assert.equal(current.shifts.sh1.castName,'Original');assert.equal(current.sessions.t1.items[1].price,5000);
  });
  for(const active of [date,null])await t.test('roster-only rename succeeds with '+(active?'an active day':'no active day')+' and rejects a concurrent switch',async()=>{
    const state=data();state.activeBizDay=active;state.sessions={};state.shifts={};state.assignments={};await em.reset(state);
    await runtime(state,{},em.db()).ctx.guardedCastNameChange(castId,'Renamed',{expectedActiveBizDay:active});
    let current=await saved();assert.equal(current.casts[0].name,'Renamed');assert.equal(current._scopedOperation.expectedActiveBizDay??null,active);
    await em.reset(state);let raced=false;
    const {ctx}=runtime(state,{async beforeWrite(){if(raced)return;raced=true;await em.request('pos-dev/activeBizDay','PUT','2026-09-09',true);}},em.db());
    await assert.rejects(ctx.guardedCastNameChange(castId,'Renamed',{expectedActiveBizDay:active}));
    current=await saved();assert.equal(current.casts[0].name,'Original');assert.equal(current.activeBizDay,'2026-09-09');
  });
  await t.test('successful rename keeps a later acknowledged order visible locally',async()=>{
    const state=data();await em.reset(state);
    const {ctx}=runtime(state,{async afterWrite(_updates,local){
      const current=await saved(),next={...current.sessions.t1,_rev:3,items:[...current.sessions.t1.items,{id:'later',price:5000}]};
      await em.request('pos-dev/sessions/t1','PUT',next,true);local.S.sessions.t1=clone(next);
    }},em.db());
    await ctx.guardedCastNameChange(castId,'Renamed');
    const current=await saved();assert.equal(current.casts[0].name,'Renamed');assert.equal(current.sessions.t1._rev,3);
    assert.equal(ctx.S.sessions.t1._rev,3);assert.equal(ctx.S.sessions.t1.items[1].price,5000);
  });
});

test('cast rename does not commit an unsaved local order with an unchanged server revision',async()=>{
  const state=data(),{ctx,db}=runtime(state);
  ctx.S.sessions.t1.items.push({id:'unsaved',price:5000});
  await assert.rejects(ctx.guardedCastNameChange(castId,'Renamed'));
  assert.equal(db.writes.length,0);assert.equal(state.sessions.t1.items.length,1);assert.equal(ctx.S.sessions.t1.items.length,2);
});

test('cast rename refuses an affected table with a failed order save',async()=>{
  const state=data(),{ctx,db}=runtime(state);ctx.sessionSaveStates.t1={status:'error'};
  await assert.rejects(ctx.guardedCastNameChange(castId,'Renamed'),error=>/未保存|保存エラー/.test(error.userMessage||''));
  assert.equal(db.writes.length,0);
});

test('cast rename waits for pending affected order saves before taking its snapshot',async()=>{
  const state=data(),{ctx,db}=runtime(state);let release,waited=false;
  ctx.S.sessions.t1.items.push({id:'pending',price:5000});ctx.sessionSaveStates.t1={status:'saving'};
  ctx.waitForSessionSaveQueue=async tableId=>{assert.equal(tableId,'t1');waited=true;await new Promise(resolve=>{release=resolve;});};
  const pending=ctx.guardedCastNameChange(castId,'Renamed');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(waited,true);assert.equal(db.writes.length,0);
  state.sessions.t1={...clone(ctx.S.sessions.t1),_rev:2};ctx.S.sessions.t1=clone(state.sessions.t1);ctx.sessionSaveStates.t1={status:'saved'};release();
  await pending;assert.equal(state.sessions.t1._rev,3);assert.equal(state.sessions.t1.items[1].price,5000);
  assert.equal(state.sessions.t1.items[0].castName,'Renamed');
});

test('cast rename revalidates the edited cast after waiting for order saves',async()=>{
  const state=data(),{ctx,db}=runtime(state),expectedCast=clone(state.casts[0]);
  ctx.waitForSessionSaveQueue=async()=>{state.casts[0].name='Other device';ctx.S.casts=clone(state.casts);};
  await assert.rejects(ctx.guardedCastNameChange(castId,'Renamed',{expectedActiveBizDay:date,expectedCast}),error=>error._txConflict===true);
  assert.equal(db.writes.length,0);assert.equal(state.casts[0].name,'Other device');
});

test('cast rename rechecks duplicate names introduced while waiting for orders',async()=>{
  const state=data(),{ctx,db}=runtime(state),expectedCast=clone(state.casts[0]);
  ctx.waitForSessionSaveQueue=async()=>{state.casts.push({id:'other',name:'Renamed',active:true,registeredAt:2,sortIndex:1});ctx.S.casts=clone(state.casts);};
  await assert.rejects(ctx.guardedCastNameChange(castId,'Renamed',{expectedActiveBizDay:date,expectedCast}),error=>error.code==='SETTINGS_VALIDATION'&&error.field==='name');
  assert.equal(db.writes.length,0);assert.equal(state.casts[0].name,'Original');
});

for(const other of [
  {id:'other',name:'Renamed',active:false},
  {id:'other',name:'Renamed',active:true,castType:'trial',trialBizDay:'2026-09-07'}
])test('cast rename retains the inactive and other-day-trial name reuse policy: '+(other.castType||'inactive'),async()=>{
  const state=data();state.casts.push(other);const {ctx}=runtime(state);
  await ctx.guardedCastNameChange(castId,'Renamed',{expectedActiveBizDay:date,expectedCast:clone(state.casts[0])});
  assert.equal(state.casts[0].name,'Renamed');assert.equal(state.casts[1].name,'Renamed');
});

test('same-day trial names remain reserved during cast rename',async()=>{
  const state=data();state.casts.push({id:'other',name:'Renamed',active:true,castType:'trial',trialBizDay:date});const {ctx,db}=runtime(state);
  await assert.rejects(ctx.guardedCastNameChange(castId,'Renamed'),error=>error.code==='SETTINGS_VALIDATION');
  assert.equal(db.writes.length,0);
});
