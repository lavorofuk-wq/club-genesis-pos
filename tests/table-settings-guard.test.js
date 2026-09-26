const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {app,clone,source,fixture,fakeDb,contextFor,emulator}=require('./helpers/scoped-runtime.cjs');

function data(){
  return {...fixture(),sessions:{},assignments:{},shifts:{},tables:[{id:'t1',label:'T1',vip:false},{id:'t2',label:'T2',vip:false}]};
}
function runtime(db,state){
  const ctx=contextFor(db,state),alerts=[];
  Object.assign(ctx,{APP_VERSION:'6.151.1',MAX_TABLE_COUNT:30,_verNum:()=>615101,tableDeleteBusy:false,
    document:{getElementById:()=>null},alert:message=>alerts.push(message),ntl:'',ntv:false});
  ctx.window._remoteValueHashes={tables:ctx.stableJson(state.tables)};
  vm.runInContext(source('async function guardedUpdate','function canonicalJsonValue'),ctx);
  vm.runInContext(source('const LIGHTWEIGHT_SETTING_PATHS','const sessionSaveQueues'),ctx);
  vm.runInContext(source('function settingConflictError','function castIdQueryValues'),ctx);
  vm.runInContext(source('function utl(id,v)','// ===== MODAL ====='),ctx);
  ctx.save=(path,value)=>ctx.queueSettingSave(path,value);
  return {ctx,alerts};
}

test('pending and occupied tables cannot be deleted locally or through the general settings save',async()=>{
  for(const collection of ['sessions','tablePreparations']){
    const state=data();state[collection]={t1:{tableId:'t1'}};
    const db=fakeDb(state),{ctx,alerts}=runtime(db,state);
    await ctx.dta('t1');
    assert.equal(db.writes.length,0);assert.equal(ctx.S.tables.length,2);assert.equal(alerts.length,1);
    await assert.rejects(ctx.guardedLightweightSettingSet('tables',[state.tables[1]]),/table removal blocked/);
    assert.equal(db.writes.length,0);
    await ctx.guardedLightweightSettingSet('tables',state.tables.map(t=>({...t,label:t.label+' renamed',vip:true})));
    assert.equal(db.writes.length,1,'renaming occupied or pending tables stays supported');
  }
});

test('deletion remains visible until save acknowledgement, rejects duplicate clicks and blocks other table edits',async()=>{
  const state=data();let release;
  const db=fakeDb(state,()=>new Promise(resolve=>{release=resolve;})),{ctx}=runtime(db,state);
  const pending=ctx.dta('t1');
  for(let i=0;i<100&&!release;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.ok(release,'write should reach the fake database');
  assert.equal(ctx.tableDeleteBusy,true);assert.equal(ctx.S.tables.length,2);
  await ctx.dta('t1');ctx.utl('t2','Changed');ctx.ttv('t2');ctx.ntl='Extra';ctx.ata();
  assert.equal(ctx.S.tables[1].label,'T2');assert.equal(ctx.S.tables[1].vip,false);assert.equal(ctx.S.tables.length,2);
  release();await pending;
  assert.equal(ctx.S.tables.length,1);assert.equal(ctx.S.tables[0].id,'t2');assert.equal(db.writes.length,1);assert.equal(ctx.tableDeleteBusy,false);
  assert.deepEqual(db.writes[0]['pos-dev/_settingsWriteMeta/tables'].previousIndices,{'0':{removed:true},'1':{index:'0'}});
});

test('failed deletion preserves tables and discards its queued intent before a later rename',async()=>{
  const state=data();let fail=true;
  const db=fakeDb(state,()=>{if(fail)throw new Error('offline');}),{ctx,alerts}=runtime(db,state);
  await ctx.dta('t1');
  assert.equal(state.tables.length,2);assert.equal(ctx.S.tables.length,2);assert.equal(alerts.length,1);
  const status=vm.runInContext('settingSaveStates.tables',ctx);
  assert.equal(status.requestedVersion,status.savedVersion);assert.equal(status.waiters.length,0);
  fail=false;ctx.utl('t2','Renamed');await ctx.waitForSettingSaveQueue('tables');
  assert.equal(state.tables.length,2);assert.equal(state.tables[0].id,'t1');assert.equal(state.tables[1].label,'Renamed');
});

test('last-table deletion normalizes Firebase null and permits a later add without a hash conflict',async()=>{
  const state=data();state.tables=[state.tables[0]];
  const db=fakeDb(state),{ctx}=runtime(db,state);
  await ctx.dta('t1');assert.equal(ctx.S.tables.length,0);assert.equal(state.tables,undefined);
  ctx.ntl='New';ctx.ata();await ctx.waitForSettingSaveQueue('tables');
  assert.equal(state.tables.length,1);assert.equal(state.tables[0].label,'New');
});

test('stale screens use remote table state and do not hide a rejected removal',async()=>{
  const state=data(),db=fakeDb(state),{ctx,alerts}=runtime(db,state);
  state.tablePreparations={t1:{tableId:'t1',sessionId:'receipt',completedAt:500}};
  await ctx.dta('t1');
  assert.equal(db.writes.length,0);assert.equal(ctx.S.tables.length,2);assert.equal(alerts.length,1);
});

test('settings lists confirmed tables and disables deletion of preparation-pending tables',()=>{
  const {ctx}=runtime(fakeDb(data()),data());
  const editor=require('../settings-editor.js').create({getState:()=>ctx.S,tableBlocked:id=>ctx.S.tablePreparations?.[id]?'会計終了済':ctx.S.sessions[id]?'使用中':'',maxTables:30});
  ctx.getSettingsEditor=()=>editor;ctx.stab='tables';
  vm.runInContext(source('function rSettings(){','function rAdmin(){'),ctx);
  ctx.S.tablePreparations={t1:{tableId:'t1'}};
  const html=ctx.rSettings();
  assert.match(html,/会計終了済/);
  assert.match(html,/<button[^>]*data-id="t1"[^>]*data-action="delete"[^>]*disabled/);
  assert.doesNotMatch(html,/<input/,'confirmed values are edited only through a modal');
  assert.match(html,/data-id="t2"[^>]*data-action="edit"/);
});

test('settings refreshes after readiness changes and empty tables stay empty after reload',()=>{
  const {ctx}=runtime(fakeDb(data()),data()),changes=[];
  Object.assign(ctx,{vw:'settings',stab:'tables',finishInitialPosSyncPath:()=>{},handlePosSyncRender:value=>changes.push(value)});
  vm.runInContext(source('function applyPosCoreValue','function subscribePosCoreData'),ctx);
  ctx.applyPosCoreValue({},'tablePreparations',{t1:{tableId:'t1'}});
  assert.equal(changes.pop(),true);
  ctx.applyPosCoreValue({},'tablePreparations',null);assert.equal(changes.pop(),true);
  ctx.applyPosCoreValue({},'tables',null);assert.equal(ctx.S.tables.length,0);
});

test('table deletion rules preserve readiness and reject racing clients',{skip:process.env.POS_RULES_EMULATOR!=='1'},async t=>{
  const em=await emulator('demo-pos-table-settings');
  for(const scenario of ['ready-delete','pending','racing-checkin','racing-checkout','racing-settings','last-table','old-client','missing-proof','retained-pending','post-save-checkout']){
    await t.test(scenario,async()=>{
      const state=data();if(scenario==='last-table')state.tables=[state.tables[0]];
      await em.reset(state);
      if(scenario==='pending'||scenario==='retained-pending'||scenario==='ready-delete'){
        await em.request('pos-dev/sessions/t1','PUT',{tableId:'t1',sessionId:'s1',startTime:100,_rev:1,_nodeWriteVersion:615101,_nodeWriteNonce:'create'});
        const current=await em.request('pos-dev','GET',undefined,true),closer=runtime(em.db(),current).ctx;
        await closer.guardedCloseSession('t1',current.sessions.t1,{id:123,tableId:'t1',startTime:100,endTime:500,total:7800});
        if(scenario==='ready-delete'){
          const pending=await em.request('pos-dev','GET',undefined,true);
          await runtime(em.db(),pending).ctx.guardedCompleteTablePreparation('t1',pending.tablePreparations.t1);
        }
      }
      const current=await em.request('pos-dev','GET',undefined,true);
      let raced=false;
      const db=em.db(async updates=>{
        if(raced)return;raced=true;
        if(scenario==='racing-checkin'||scenario==='racing-checkout'){
          await em.request('pos-dev/sessions/t1','PUT',{tableId:'t1',sessionId:'s2',startTime:200,_rev:1,_nodeWriteVersion:615101,_nodeWriteNonce:'new'});
          if(scenario==='racing-checkout'){
            const latest=await em.request('pos-dev','GET',undefined,true);
            await runtime(em.db(),latest).ctx.guardedCloseSession('t1',latest.sessions.t1,{id:124,tableId:'t1',startTime:200,endTime:600,total:8000});
          }
        }else if(scenario==='racing-settings'){
          await runtime(em.db(),current).ctx.guardedLightweightSettingSet('tables',current.tables.map(t=>({...t,label:'Other'})));
        }else if(scenario==='missing-proof'){
          delete updates['pos-dev/_settingsWriteMeta/tables'].previousIndices['0'];
        }
      });
      const {ctx}=runtime(db,current),next=current.tables.filter(t=>t.id!=='t1');
      if(scenario==='old-client'){
        await assert.rejects(ctx.guardedUpdate({'pos-dev/tables':next}),/Permission denied/);
        await assert.rejects(ctx.guardedUpdate({'pos-dev/tables':null}),/Permission denied/);
      }else if(scenario==='retained-pending'||scenario==='post-save-checkout'){
        await ctx.guardedLightweightSettingSet('tables',current.tables.map(t=>({...t,label:t.label+' renamed'})));
        if(scenario==='post-save-checkout'){
          await em.request('pos-dev/sessions/t1','PUT',{tableId:'t1',sessionId:'s3',startTime:300,_rev:1,_nodeWriteVersion:615101,_nodeWriteNonce:'new'});
          const latest=await em.request('pos-dev','GET',undefined,true);
          await runtime(em.db(),latest).ctx.guardedCloseSession('t1',latest.sessions.t1,{id:125,tableId:'t1',startTime:300,endTime:700,total:9000});
          assert.ok((await em.request('pos-dev','GET',undefined,true)).tablePreparations.t1);
        }
      }else if(['pending','racing-checkin','racing-checkout','racing-settings','missing-proof'].includes(scenario)){
        await assert.rejects(ctx.guardedLightweightSettingSet('tables',next),/table removal blocked|Permission denied/);
        const after=await em.request('pos-dev','GET',undefined,true);
        assert.equal(after.tables.length,2);
        if(scenario==='pending'||scenario==='racing-checkout')assert.ok(after.tablePreparations.t1);
      }else{
        await ctx.guardedLightweightSettingSet('tables',next.length?next:null);
        const after=await em.request('pos-dev','GET',undefined,true);
        assert.equal(Object.values(after.tables||{}).some(t=>t.id==='t1'),false);
        await assert.rejects(em.request('pos-dev/sessions/t1','PUT',{tableId:'t1',sessionId:'stale',startTime:900,_rev:1,_nodeWriteVersion:615101,_nodeWriteNonce:'stale'}),/Permission denied/);
        await ctx.guardedUpdate({'pos-dev/loMode':true});
        if(scenario==='last-table'){
          await ctx.guardedLightweightSettingSet('tables',[{id:'new-table',label:'New'}]);
          await em.request('pos-dev/sessions/new-table','PUT',{tableId:'new-table',sessionId:'new',startTime:950,_rev:1,_nodeWriteVersion:615101,_nodeWriteNonce:'new'});
        }
      }
    });
  }
  await t.test('all 30 slots are checked, including the last pending table and shifted indices',async()=>{
    assert.match(app,/const MAX_TABLE_COUNT=30;/);
    const state=data();state.tables=Array.from({length:30},(_,i)=>({id:'t'+i,label:'T'+i}));
    state.tablePreparations={t29:{tableId:'t29',sessionId:'receipt',completedAt:500,_rev:1}};
    await em.reset(state);
    const {ctx}=runtime(em.db(),state);
    await ctx.guardedLightweightSettingSet('tables',state.tables.slice(1));
    const current=await em.request('pos-dev','GET',undefined,true);
    assert.equal(current.tables[28].id,'t29');assert.ok(current.tablePreparations.t29);
    await assert.rejects(runtime(em.db(),current).ctx.guardedLightweightSettingSet('tables',current.tables.slice(0,-1)),/table removal blocked/);
    const forged=runtime(em.db(updates=>{
      updates['pos-dev/tables']=current.tables.slice(0,-1);
      updates['pos-dev/_settingsWriteMeta/tables'].previousIndices['28']={removed:true};
    }),current).ctx;
    await assert.rejects(forged.guardedLightweightSettingSet('tables',current.tables),/Permission denied/);
    assert.ok((await em.request('pos-dev','GET',undefined,true)).tablePreparations.t29);
  });
});
