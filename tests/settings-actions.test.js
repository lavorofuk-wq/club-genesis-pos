const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {source,fixture,fakeDb,contextFor,clone,emulator}=require('./helpers/scoped-runtime.cjs');
const store=require('../settings-store.js');
const actions=fs.readFileSync(path.join(__dirname,'../settings-actions.js'),'utf8');
const date='2026-09-08';
const cast={id:1789127986881,name:'A',castType:'regular',active:true,registeredAt:1789127986881,sortIndex:0};
function data(extra={}){
  return{...fixture(),sessions:{},shifts:{},assignments:{},history:{},casts:[clone(cast)],castLifecycleLogs:{},
    tables:[{id:'t1',label:'T1',vip:false}],menus:{sets:[{id:'s1',label:'Set',price:1000,minutes:60}],drinks:[{id:'d1',label:'Drink',price:500}]},
    _settingsRevisions:{menus:0,tables:0,castRoster:0},...extra};
}
function runtime(state=data(),beforeWrite,providedDatabase){
  const db=providedDatabase||fakeDb(state,beforeWrite),ctx=contextFor(db,state),warnings=[];
  Object.assign(ctx,{APP_VERSION:'6.152',MAX_TABLE_COUNT:30,HON_SHIMEI_PRICE:2000,BANAI_SHIMEI_PRICE:2000,
    _verNum:()=>615200,document:{getElementById:()=>null},GMS_JSON:require('../gms-json-core.js'),
    getBizDate:()=>date,setTimeout,clearTimeout,console:{warn:(...args)=>warnings.push(args)}});
  ctx.window.PosSettingsStore=store;
  for(const [from,to] of [
    ['function applyFixedShimeiPrices','async function saveCastsAndLifecycle'],
    ['function gmsIso(','function gmsRosterSnapshot'],
    ['async function guardedUpdate','function canonicalJsonValue'],
    ['const LIGHTWEIGHT_SETTING_PATHS','const sessionSaveQueues'],
    ['function settingConflictError','function castIdQueryValues'],
    ['function castNameItemValue','function hasVisibleCastName']
  ])vm.runInContext(source(from,to),ctx);
  ctx.S.menus=ctx.normalizeMenus(ctx.S.menus);
  for(const key of ['menus','tables','casts','castLifecycleLogs'])ctx.updateRemoteHash(key,state[key]??null);
  vm.runInContext(actions,ctx);
  return{ctx,db,state,warnings};
}
function menuDraft(state,price=2000){return{kind:'menu',action:'edit',category:'sets',id:'s1',base:clone(state.menus.sets[0]),values:{label:'New Set',price,minutes:60}};}
function tableDraft(state){return{kind:'table',action:'edit',id:'t1',base:clone(state.tables[0]),values:{label:'Renamed T1',vip:true}};}
function castDraft(state,action='add'){
  return{kind:'cast',action,id:action==='add'?'1789127986999':String(cast.id),base:action==='add'?null:clone(state.casts[0]),
    castType:'regular',businessDate:date,bizDate:date,values:{name:action==='add'?'B':'Renamed'}};
}
async function until(predicate){for(let i=0;i<100&&!predicate();i++)await new Promise(resolve=>setImmediate(resolve));assert.ok(predicate(),'operation should reach the paused write');}
const snapshot=value=>JSON.parse(JSON.stringify(value));

for(const kind of ['menu','table'])test(kind+' write failure keeps committed S unchanged, clears busy and permits retry',async()=>{
  const state=data();let failure=true;
  const {ctx,db}=runtime(state,()=>{if(failure)throw new Error('network unavailable');});
  const path=kind==='menu'?'menus':'tables',before=snapshot(ctx.S[path]);
  const draft=kind==='menu'?menuDraft(state):tableDraft(state);
  await assert.rejects(ctx.commitSettingsDraft(draft),/network unavailable/);
  assert.deepEqual(snapshot(ctx.S[path]),before);assert.equal(db.writes.length,0);assert.equal(ctx.settingsSaving(),false);
  const status=ctx.settingSaveState(path);assert.equal(status.running,false);assert.equal(status.requestedVersion,status.savedVersion);
  failure=false;await ctx.commitSettingsDraft(draft);
  assert.equal(ctx.settingSaveState(path).status,'saved');assert.equal(db.writes.length,1);
  assert.equal(kind==='menu'?ctx.S.menus.sets[0].price:ctx.S.tables[0].label,kind==='menu'?2000:'Renamed T1');
});

for(const action of ['add','depart'])test('cast '+action+' applies roster and lifecycle only after acknowledgement',async()=>{
  const state=data();let release;
  const {ctx,db}=runtime(state,()=>new Promise(resolve=>{release=resolve;}));
  const before=snapshot({casts:ctx.S.casts,logs:ctx.S.castLifecycleLogs});
  const operation=ctx.commitSettingsDraft(castDraft(state,action));
  await until(()=>release);
  assert.deepEqual(snapshot({casts:ctx.S.casts,logs:ctx.S.castLifecycleLogs}),before);
  assert.equal(ctx.settingsSaving(),true);release();await operation;
  assert.equal(ctx.S.casts.length,action==='add'?2:0);
  const lifecycle=ctx.S.castLifecycleLogs[date];
  assert.equal((action==='add'?lifecycle.enteredCasts:lifecycle.exitedCasts).length,1);
  assert.equal(db.writes.length,1);assert.equal(ctx.settingsSaving(),false);
  assert.ok(db.writes[0]['pos-dev/_scopedOperation'],'roster writes retain the active-day guard');
});

for(const action of ['add','depart'])test('failed cast '+action+' preserves committed roster and lifecycle',async()=>{
  const state=data(),{ctx,db}=runtime(state,()=>{throw new Error('network unavailable');});
  const before=snapshot({casts:ctx.S.casts,logs:ctx.S.castLifecycleLogs});
  await assert.rejects(ctx.commitSettingsDraft(castDraft(state,action)),/network unavailable/);
  assert.deepEqual(snapshot({casts:ctx.S.casts,logs:ctx.S.castLifecycleLogs}),before);
  assert.equal(db.writes.length,0);assert.equal(ctx.settingsSaving(),false);assert.equal(ctx.settingSaveState('casts').running,false);
});

test('optimistic Firebase onvalue is suppressed until menu acknowledgement',async()=>{
  const state=data();let ctx,release,applied=false;
  const runtimeResult=runtime(state,updates=>{
    const optimistic={...state.menus,sets:[clone(updates['pos-dev/menus/sets/0'])]};
    const accepted=ctx.acceptRemoteSettingValue('menus',optimistic,next=>{applied=true;ctx.S.menus=next;});
    assert.equal(accepted,false);
    return new Promise(resolve=>{release=resolve;});
  });ctx=runtimeResult.ctx;
  const pending=ctx.commitSettingsDraft(menuDraft(state));await until(()=>release);
  assert.equal(applied,false);assert.equal(ctx.S.menus.sets[0].price,1000);
  release();await pending;assert.equal(ctx.S.menus.sets[0].price,2000);
});

test('a failed modal save resumes normal confirmed remote updates while preserving its error indication',async()=>{
  const state=data(),{ctx}=runtime(state,()=>{throw new Error('network unavailable');});
  await assert.rejects(ctx.commitSettingsDraft(menuDraft(state)));
  const fresh=clone(state.menus);fresh.sets[0].price=9000;
  const accepted=ctx.acceptRemoteSettingValue('menus',fresh,value=>{ctx.S.menus=value;});
  assert.equal(accepted,true);assert.equal(ctx.S.menus.sets[0].price,9000);
  assert.equal(ctx.settingSaveState('menus').status,'error');
});

for(const fail of [false,true])test('modal '+(fail?'failure':'success')+' releases existing setting queue waiters',{timeout:2000},async()=>{
  const state=data();let release;
  const {ctx}=runtime(state,()=>new Promise((resolve,reject)=>{release=()=>fail?reject(new Error('network unavailable')):resolve();}));
  const pending=ctx.commitSettingsDraft(menuDraft(state)).then(()=>({ok:true}),error=>({error}));
  await until(()=>release);
  const waiting=ctx.waitForSettingSaveQueue('menus').then(()=>({ok:true}),error=>({error}));
  assert.equal(ctx.settingSaveState('menus').waiters.length,1);release();
  const [saved,settled]=await Promise.all([pending,waiting]);
  assert.equal(Boolean(saved.error),fail);assert.equal(Boolean(settled.error),fail);
  assert.equal(ctx.settingSaveState('menus').waiters.length,0);
});

test('cast rename keeps current-day references atomic and preserves unrelated history',async()=>{
  const id=String(cast.id),otherDate='2026-09-07';
  const state=data({
    sessions:{t1:{tableId:'t1',sessionId:'s1',startTime:100,_rev:1,items:[{id:'drink',castId:id,castName:'A'}]}},
    shifts:{sh1:{id:'sh1',castId:id,castName:'A',clockIn:90,_rev:1}},
    assignments:{a1:{id:'a1',castId:id,castName:'A',tableId:'t1',sessionId:100,startTime:110,_rev:1}},
    history:{h1:{id:'h1',_rev:1,items:[{id:'drink',castId:id,castName:'A',backTargetCastIds:[id],backTargetCastNames:['A']}]}},
    castLifecycleLogs:{[date]:{enteredCasts:[{castId:id,castName:'A'}]},[otherDate]:{enteredCasts:[{castId:id,castName:'Historical A'}]}},
    bizDays:{[otherDate]:{id:otherDate,date:otherDate,history:[{id:'old',items:[{castId:id,castName:'Historical A'}]}]}}
  });
  const {ctx,db}=runtime(state);const historical=snapshot(state.bizDays[otherDate]);
  await ctx.commitSettingsDraft(castDraft(state,'edit'));
  assert.equal(ctx.S.casts[0].name,'Renamed');assert.equal(ctx.S.sessions.t1.items[0].castName,'Renamed');
  assert.equal(ctx.S.shifts.sh1.castName,'Renamed');assert.equal(ctx.S.assignments.a1.castName,'Renamed');
  assert.equal(ctx.S.history[0].items[0].castName,'Renamed');
  assert.deepEqual(snapshot(ctx.S.history[0].items[0].backTargetCastNames),['Renamed']);
  assert.equal(ctx.S.castLifecycleLogs[otherDate].enteredCasts[0].castName,'Historical A');
  assert.deepEqual(snapshot(state.bizDays[otherDate]),historical);assert.equal(db.writes.length,1);
});

test('changed business day refuses stale cast draft without a write',async()=>{
  const state=data(),{ctx,db}=runtime(state);const draft=castDraft(state);draft.businessDate='2026-09-07';
  await assert.rejects(ctx.commitSettingsDraft(draft),error=>error.code==='SETTINGS_BUSINESS_DAY_CHANGED'&&/営業日/.test(error.userMessage));
  assert.equal(db.writes.length,0);assert.equal(ctx.S.casts.length,1);assert.equal(ctx.settingsSaving(),false);
});

test('cast validation rejects empty, duplicate names and active departures, then accepts a corrected draft',async()=>{
  const state=data(),{ctx,db}=runtime(state);
  for(const name of ['', '   ', 'A']){
    const draft=castDraft(state);draft.values.name=name;
    await assert.rejects(ctx.commitSettingsDraft(draft),error=>error.code==='SETTINGS_VALIDATION');
  }
  state.shifts={sh1:{id:'sh1',castId:String(cast.id),clockIn:10}};
  await assert.rejects(ctx.commitSettingsDraft(castDraft(state,'depart')),error=>error.code==='SETTINGS_VALIDATION'&&/出勤中/.test(error.userMessage));
  assert.equal(db.writes.length,0);assert.equal(ctx.settingSaveState('casts').running,false);
  await ctx.commitSettingsDraft(castDraft(state,'add'));assert.equal(ctx.S.casts.length,2);
});

test('zero-priced menus save and invalid amounts or empty labels do not change S',async()=>{
  const state=data(),{ctx,db}=runtime(state);
  await ctx.commitSettingsDraft(menuDraft(state,0));assert.equal(ctx.S.menus.sets[0].price,0);
  for(const price of [-1,'1.5','NaN']){
    await assert.rejects(ctx.commitSettingsDraft(menuDraft(state,price)),error=>error.code==='SETTINGS_VALIDATION');
  }
  const empty=menuDraft(state,100);empty.values.label='   ';
  await assert.rejects(ctx.commitSettingsDraft(empty),error=>error.code==='SETTINGS_VALIDATION');
  assert.equal(ctx.S.menus.sets[0].price,0);assert.equal(db.writes.length,1);
});

test('settings actions preserve data under real Firebase rules and concurrent writes',{skip:process.env.POS_RULES_EMULATOR!=='1'},async t=>{
  const em=await emulator('demo-pos-settings-actions');
  const saved=()=>em.request('pos-dev','GET',undefined,true);
  const env=(state,beforeWrite)=>runtime(state,undefined,em.db(beforeWrite));
  await t.test('menu patch, table patch and final-table deletion commit with revision proofs',async()=>{
    const state=data();await em.reset(state);
    let ctx=env(state).ctx;await ctx.commitSettingsDraft(menuDraft(state,0));
    let current=await saved();assert.equal(current.menus.sets[0].price,0);assert.equal(current._settingsRevisions.menus,1);
    ctx=env(current).ctx;await ctx.commitSettingsDraft(tableDraft(current));
    current=await saved();assert.equal(current.tables[0].label,'Renamed T1');assert.equal(current._settingsRevisions.tables,1);
    ctx=env(current).ctx;await ctx.commitSettingsDraft({kind:'table',action:'delete',id:'t1',base:clone(current.tables[0]),values:{}});
    current=await saved();assert.equal(current.tables,undefined);assert.equal(current._settingsRevisions.tables,2);
  });
  for(const kind of ['menu','table','table-delete'])await t.test(kind+' race rejects the stale item and preserves the winning edit',async()=>{
    const state=data();await em.reset(state);let raced=false;
    const competing=kind==='menu'?menuDraft(state,9000):tableDraft(state);
    if(kind!=='menu')competing.values.label='Other device';
    const {ctx}=env(state,async()=>{if(raced)return;raced=true;await env(state).ctx.commitSettingsDraft(competing);});
    const draft=kind==='menu'?menuDraft(state):kind==='table'?tableDraft(state):{kind:'table',action:'delete',id:'t1',base:clone(state.tables[0]),values:{}};
    await assert.rejects(ctx.commitSettingsDraft(draft),error=>error.code==='SETTINGS_CONFLICT');
    const current=await saved();assert.equal(current._settingsRevisions[kind==='menu'?'menus':'tables'],1);
    assert.equal(kind==='menu'?current.menus.sets[0].price:current.tables[0].label,kind==='menu'?9000:'Other device');
    assert.equal(kind==='menu'?ctx.S.menus.sets[0].price:ctx.S.tables[0].label,kind==='menu'?9000:'Other device','losing device must use the winning confirmed setting');
  });
  await t.test('table deletion racing check-in cannot remove the occupied table',async()=>{
    const state=data();await em.reset(state);let raced=false;
    const {ctx}=env(state,async()=>{if(raced)return;raced=true;await em.request('pos-dev/sessions/t1','PUT',{tableId:'t1',sessionId:'new-session',startTime:123,_rev:1},true);});
    await assert.rejects(ctx.commitSettingsDraft({kind:'table',action:'delete',id:'t1',base:clone(state.tables[0]),values:{}}));
    const current=await saved();assert.equal(current.tables[0].id,'t1');assert.equal(current.sessions.t1.sessionId,'new-session');
  });
  await t.test('scoped cast add and depart commit roster and lifecycle together',async()=>{
    const state=data();await em.reset(state);
    const add=castDraft(state,'add');let ctx=env(state).ctx;await ctx.commitSettingsDraft(add);
    let current=await saved();assert.equal(current.casts.length,2);assert.equal(current._settingsRevisions.castRoster,1);
    assert.equal(current.castLifecycleLogs[date].enteredCasts[0].castName,'B');
    ctx=env(current).ctx;const added=current.casts.find(c=>String(c.id)===add.id);
    await ctx.commitSettingsDraft({...castDraft(current,'depart'),id:add.id,base:clone(added)});
    current=await saved();assert.equal(current.casts.length,1);assert.equal(current._settingsRevisions.castRoster,2);
    assert.equal(current.castLifecycleLogs[date].exitedCasts[0].castName,'B');
  });
  await t.test('cast add racing another roster change fails without replacing the winner',async()=>{
    const state=data();await em.reset(state);let raced=false;
    const winner=castDraft(state,'add');winner.values.name='Other device';
    const {ctx}=env(state,async()=>{if(raced)return;raced=true;await env(state).ctx.commitSettingsDraft(winner);});
    await assert.rejects(ctx.commitSettingsDraft(castDraft(state,'add')));
    const current=await saved();assert.equal(current.casts.length,2);assert.equal(current.casts[1].name,'Other device');
    assert.equal(current.castLifecycleLogs[date].enteredCasts[0].castName,'Other device');assert.equal(current._settingsRevisions.castRoster,1);
  });
  await t.test('cast departure racing clock-in preserves the roster and creates no departure log',async()=>{
    const state=data();await em.reset(state);let raced=false;
    const {ctx}=env(state,async()=>{if(raced)return;raced=true;await em.request('pos-dev','PATCH',{
      ['shifts/new']:{id:'new',castId:String(cast.id),castName:'A',clockIn:123,_rev:1},
      ['_castShiftRevisions/'+cast.id]:1
    },true);});
    await assert.rejects(ctx.commitSettingsDraft(castDraft(state,'depart')));
    const current=await saved();assert.equal(current.casts[0].name,'A');assert.equal(current.shifts.new.clockIn,123);
    assert.equal(current.castLifecycleLogs?.[date]?.exitedCasts,undefined);assert.equal(current._settingsRevisions.castRoster,0);
  });
  function renameState(){
    const id=String(cast.id);return data({
      sessions:{t1:{tableId:'t1',sessionId:'s1',startTime:100,_rev:1,items:[{id:'drink',castId:id,castName:'A'}]}},
      history:{h1:{id:'h1',_rev:1,items:[{id:'drink',castId:id,castName:'A'}]}}
    });
  }
  await t.test('cast rename updates related session and history in the same scoped commit',async()=>{
    const state=renameState();await em.reset(state);await env(state).ctx.commitSettingsDraft(castDraft(state,'edit'));
    const current=await saved();assert.equal(current.casts[0].name,'Renamed');assert.equal(current.sessions.t1.items[0].castName,'Renamed');
    assert.equal(current.history.h1.items[0].castName,'Renamed');assert.equal(current.sessions.t1._rev,2);assert.equal(current.history.h1._rev,2);
  });
  await t.test('cast rename racing an order edit fails atomically and preserves new orders',async()=>{
    const state=renameState();await em.reset(state);let raced=false;
    const {ctx}=env(state,async()=>{if(raced)return;raced=true;await em.request('pos-dev/sessions/t1','PATCH',{
      _rev:2,items:[...state.sessions.t1.items,{id:'other',price:5000}]
    },true);});
    await assert.rejects(ctx.commitSettingsDraft(castDraft(state,'edit')));
    const current=await saved();assert.equal(current.casts[0].name,'A');assert.equal(current.history.h1.items[0].castName,'A');
    assert.equal(current.sessions.t1.items[1].price,5000);assert.equal(current._settingsRevisions.castRoster,0);
  });
  await t.test('cast add racing a business-day switch is rejected by the active-day guard',async()=>{
    const state=data();await em.reset(state);let raced=false;
    const {ctx}=env(state,async()=>{if(raced)return;raced=true;await em.request('pos-dev/activeBizDay','PUT','2026-09-09',true);});
    await assert.rejects(ctx.commitSettingsDraft(castDraft(state,'add')));
    const current=await saved();assert.equal(current.activeBizDay,'2026-09-09');assert.equal(current.casts.length,1);
    assert.equal(current.castLifecycleLogs,undefined);
  });
});

for(const kind of ['menu','table'])test(kind+' conflict applies a confirmed update buffered during the save without replacing the draft',async()=>{
  const state=data(),{ctx,db}=runtime(state),draft=kind==='menu'?menuDraft(state):tableDraft(state);
  const original=clone(draft),path=kind==='menu'?'menus':'tables',ref=db.ref.bind(db);let injected=false;
  db.ref=key=>{const target=ref(key);if(key==='pos-dev/_settingsRevisions/'+path){
    const get=target.get.bind(target);target.get=async()=>{
      if(!injected){injected=true;
        if(kind==='menu')state.menus.sets[0].price=3000;else state.tables[0].label='Other device';
        state._settingsRevisions[path]++;
        assert.equal(ctx.acceptRemoteSettingValue(path,clone(state[path]),value=>{ctx.S[path]=value;}),false);
      }
      return get();
    };
  }return target;};
  await assert.rejects(ctx.commitSettingsDraft(draft),error=>error.code==='SETTINGS_CONFLICT');
  assert.equal(kind==='menu'?ctx.S.menus.sets[0].price:ctx.S.tables[0].label,kind==='menu'?3000:'Other device');
  assert.deepEqual(draft,original);assert.equal(db.writes.length,0);
  assert.equal(ctx.settingSaveState(path).status,'error');assert.equal(ctx.settingSaveState(path).lastRemoteValue,undefined);
});

test('failed cast save refreshes confirmed roster and lifecycle received while the write was pending',async()=>{
  const state=data();let ctx;
  const result=runtime(state,()=>{
    state.casts[0].name='Remote name';state.castLifecycleLogs[date]={enteredCasts:[{castId:String(cast.id),castName:'Remote name'}]};
    assert.equal(ctx.acceptRemoteSettingValue('casts',clone(state.casts),value=>{ctx.S.casts=value;}),false);
    ctx.settingSaveState('casts').lastRemoteLifecycle=clone(state.castLifecycleLogs);
    throw Object.assign(new Error('Permission denied'),{code:'PERMISSION_DENIED'});
  });ctx=result.ctx;
  await assert.rejects(ctx.commitSettingsDraft(castDraft(state,'add')));
  assert.equal(ctx.S.casts.length,1);assert.equal(ctx.S.casts[0].name,'Remote name');
  assert.equal(ctx.S.castLifecycleLogs[date].enteredCasts[0].castName,'Remote name');
  assert.equal(ctx.settingSaveState('casts').lastRemoteLifecycle,undefined);assert.equal(result.db.writes.length,0);
});

test('an inactive business day rollover rejects restored regular and trial drafts without registration',async()=>{
  for(const castType of ['regular','trial']){
    const state=data({activeBizDay:null}),{ctx,db}=runtime(state);
    ctx.getBizDate=()=>date;
    const draft={...castDraft(state),castType,businessDate:null,bizDate:'2026-09-07'};
    await assert.rejects(ctx.commitSettingsDraft(draft),error=>error.code==='SETTINGS_BUSINESS_DAY_CHANGED'&&error.currentBusinessDate===null&&error.currentBizDate===date);
    assert.equal(db.writes.length,0);assert.equal(ctx.S.casts.length,1);assert.deepEqual(snapshot(ctx.S.castLifecycleLogs),{});
  }
});

test('regular and trial registration use save time while retaining a stable retry ID',async()=>{
  for(const castType of ['regular','trial']){
    const state=data(),{ctx,db}=runtime(state),draft={...castDraft(state),castType};
    const saveTime=Number(draft.id)+7200000;
    ctx.Date=class extends Date{static now(){return saveTime;}};
    await ctx.commitSettingsDraft(draft);
    const added=ctx.S.casts.find(row=>String(row.id)===draft.id);
    assert.equal(added.registeredAt,saveTime);
    assert.equal(added[castType==='trial'?'trialRegisteredAt':'enteredAt'],saveTime);
    const event=ctx.S.castLifecycleLogs[date][castType==='trial'?'trialCasts':'enteredCasts'][0];
    assert.equal(event[castType==='trial'?'trialRegisteredAt':'enteredAt'],saveTime);
    await ctx.commitSettingsDraft(draft);
    assert.equal(db.writes.length,1,'a retry must recognize the ID rather than change the registration time');
    assert.equal(ctx.S.casts.filter(row=>String(row.id)===draft.id).length,1);
  }
});

test('rename passes the draft business-day scope into the guarded operation',async()=>{
  const state=data(),{ctx}=runtime(state);let received;
  ctx.guardedCastNameChange=async(...args)=>{received=args;return true;};
  await ctx.commitSettingsDraft(castDraft(state,'edit'));
  assert.deepEqual(snapshot(received),[String(cast.id),'Renamed',{expectedActiveBizDay:date,expectedCast:clone(state.casts[0])}]);
});

test('rename confirmation refreshes roster changes received during acknowledgement',async()=>{
  const state=data(),{ctx,db}=runtime(state),ref=db.ref.bind(db);let changed=false;
  db.ref=key=>{const target=ref(key),update=target.update?.bind(target);if(update)target.update=async values=>{
    await update(values);if(changed)return;changed=true;
    state.casts.push({...clone(cast),id:1789127987000,name:'Later cast',sortIndex:1});
    state.castLifecycleLogs[date]={enteredCasts:[{castId:'1789127987000',castName:'Later cast'}]};
    state._settingsRevisions.castRoster++;
    assert.equal(ctx.acceptRemoteSettingValue('casts',clone(state.casts),value=>{ctx.S.casts=value;}),false);
    ctx.settingSaveState('casts').lastRemoteLifecycle=clone(state.castLifecycleLogs);
  };return target;};
  await ctx.commitSettingsDraft(castDraft(state,'edit'));
  assert.equal(ctx.S.casts[0].name,'Renamed');assert.equal(ctx.S.casts[1]?.name,'Later cast');
  assert.equal(ctx.S.castLifecycleLogs[date].enteredCasts[0].castName,'Later cast');
  assert.equal(ctx.settingSaveState('casts').lastRemoteValue,undefined);
  assert.equal(ctx.settingSaveState('casts').lastRemoteLifecycle,undefined);
});
