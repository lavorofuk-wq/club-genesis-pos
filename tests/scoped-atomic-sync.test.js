const {test}=require('node:test');
const assert=require('node:assert/strict');
const {app,clone,source,fixture,fakeDb,contextFor,emulator}=require('./helpers/scoped-runtime.cjs');
const vm=require('node:vm');

test('all POS-root transactions and compatibility retries are removed',()=>{
  assert.doesNotMatch(app,/guardedRootTransaction|guardedRootUpdateIfActive|shouldFallbackNodeUpdate|shouldGuardWholeValue|guardedSetIfUnchanged|sessionNodeTransactionsSupported|recordNodeTransactionsSupported/);
  assert.equal((app.match(/\.transaction\(/g)||[]).length,2);
});
test('checkout and table deletion read only the table and related casts and commit once',async()=>{
  for(const checkout of [true,false]){
    const state=fixture(),db=fakeDb(state),ctx=contextFor(db,state);
    const rec=checkout?{id:1786109627659123,endTime:500,items:state.sessions.t1.items}:null;
    await ctx.guardedCloseSession('t1',clone(state.sessions.t1),rec);
    assert.equal(db.writes.length,1);
    assert.equal(state.sessions.t1,undefined);
    assert.equal(state.shifts.s1.status,'waiting');
    assert.equal(state.assignments.a1?.endTime,checkout?500:undefined);
    assert.equal(state._tableAssignmentRevisions.t1,4);
    assert.ok(db.reads.every(r=>!['pos-dev','pos-dev/','pos-dev/bizDays','pos-dev/history'].includes(r.key)));
    assert.ok(db.reads.findIndex(r=>r.key.endsWith('/_tableAssignmentRevisions/t1'))<db.reads.findIndex(r=>r.field==='tableId'));
  }
});
test('unsupported rules fail closed before reading or writing',async()=>{
  const state=fixture(),db=fakeDb(state),ctx=contextFor(db,state);ctx.scopedAtomicValidationVersion=0;
  await assert.rejects(ctx.guardedCloseSession('t1',state.sessions.t1));
  await assert.rejects(ctx.guardedCheckedNodeUpdate({'pos-dev/shifts/new':{id:'new'}},null));
  assert.equal(db.reads.length,0);assert.equal(db.writes.length,0);
});
test('Firebase nulls, empty containers and array snapshots compare consistently',()=>{
  const ctx=contextFor(fakeDb(fixture()));
  assert.equal(ctx.sameFirebaseValue({id:'d1',history:[],endedAt:null},{id:'d1'}),true);
  assert.equal(ctx.sameFirebaseValue({history:[{id:1,splits:null}]},{history:{0:{id:1}}}),true);
  assert.equal(ctx.sameFirebaseValue({history:[{id:1,total:100}]},{history:[{id:1,total:200}]}),false);
});
test('active-day cast rename saves roster, lifecycle, work and order references in one scoped write',async()=>{
  const date='2026-09-11',id='1789127986881',state=fixture();
  state.activeBizDay=date;
  state.casts=[{id,name:'仮名',castType:'trial',trialBizDay:date}];
  state.castLifecycleLogs={[date]:{enteredCasts:[],exitedCasts:[],trialCasts:[{castId:id,castName:'仮名',castType:'trial'}]}};
  state.sessions.t1.items=[{id:'cd',castId:id,castName:'仮名',backTargetCastIds:[id],backTargetCastNames:['仮名']}];
  state.shifts.s1={...state.shifts.s1,castId:id,castName:'仮名'};
  state.assignments.a1={...state.assignments.a1,castId:id,castName:'仮名'};
  state.history={h1:{id:'h1',_rev:1,items:[{id:'bs',castId:id,castName:'仮名',isBanaiShimei:true}]}};
  state._settingsRevisions={castRoster:2};
  const db=fakeDb(state),ctx=contextFor(db,state);
  ctx.normalizeCasts=list=>(list||[]).map((cast,index)=>({...cast,active:cast.active!==false,registeredAt:cast.registeredAt||0,sortIndex:cast.sortIndex??index}));
  ctx.settingSaveStates={};
  ctx.settingSaveState=path=>ctx.settingSaveStates[path]||(ctx.settingSaveStates[path]={running:false,requestedVersion:0,savedVersion:0,waiters:[]});
  ctx.waitForSettingSaveQueue=async()=>{};
  ctx.setSettingSaveStatus=()=>{};
  ctx.settingConflictError=()=>Object.assign(new Error('setting changed'),{userMessage:'設定競合'});
  ctx.guardedLightweightCastRosterSet=async()=>{throw new Error('unexpected lightweight path');};
  vm.runInContext(source('function castNameItemValue','function hasVisibleCastName'),ctx);

  await ctx.guardedCastNameChange(id,'ルナ');

  assert.equal(db.writes.length,1);
  assert.equal(state.casts[0].id,id);assert.equal(state.casts[0].name,'ルナ');
  assert.equal(state.castLifecycleLogs[date].trialCasts[0].castName,'ルナ');
  assert.equal(state.sessions.t1.items[0].castName,'ルナ');
  assert.deepEqual(state.sessions.t1.items[0].backTargetCastNames,['ルナ']);
  assert.equal(state.shifts.s1.castName,'ルナ');assert.equal(state.assignments.a1.castName,'ルナ');
  assert.equal(state.history.h1.items[0].castName,'ルナ');
  assert.equal(state._settingsRevisions.castRoster,3);
  assert.equal(ctx.S.sessions.t1._rev,5);assert.equal(ctx.S.shifts.s1._rev,3);assert.equal(ctx.S.assignments.a1._rev,8);assert.equal(ctx.S.history[0]._rev,2);
});
test('rules generation is idempotent and capability-gated',()=>{
  const rules=require('../database.rules.json'),{applyScopedRules}=require('../scripts/scoped-rules.cjs');
  assert.deepEqual(applyScopedRules(rules),rules);
  assert.deepEqual(applyScopedRules(applyScopedRules(rules)),rules);
});

test('scoped Firebase rules preserve atomicity under races',{skip:process.env.POS_RULES_EMULATOR!=='1'},async t=>{
  const em=await emulator();
  const saved=()=>em.request('pos-dev','GET',undefined,true);
  for(const checkout of [true,false])await t.test(checkout?'checkout commits all related records':'table deletion commits all related records',async()=>{
    const state=fixture();await em.reset(state);
    const ctx=contextFor(em.db(),state);
    await ctx.guardedCloseSession('t1',state.sessions.t1,checkout?{id:1234567890,endTime:500,total:6000}:null);
    const remote=await saved();assert.equal(remote.sessions,undefined);
    assert.equal(remote.shifts.s1.status,'waiting');
    if(checkout){assert.equal(remote.history['1234567890'].total,6000);assert.equal(remote.assignments.a1.endTime,500);}
    else assert.equal(remote.assignments,undefined);
    await em.request('','PATCH',ctx.withWriteGate({'pos-dev/loMode':true}));
  });
  for(const race of ['order','assignment','new-assignment','shift','clock-out','business-day'])await t.test('checkout rejects concurrent '+race+' without partial close',async()=>{
    const state=fixture();await em.reset(state);
    const ctx=contextFor(em.db(async()=>{
      const update={};
      if(race==='order')update['pos-dev/sessions/t1/_rev']=5;
      if(race==='assignment')update['pos-dev/assignments/a1/_rev']=8;
      if(race==='new-assignment')update['pos-dev/_tableAssignmentRevisions/t1']=4;
      if(race==='shift')update['pos-dev/shifts/s1/_rev']=3;
      if(race==='clock-out')update['pos-dev/_castShiftRevisions/c1']=1;
      if(race==='business-day')update['pos-dev/activeBizDay']='different';
      await em.request('','PATCH',update,true);
    }),state);
    await assert.rejects(ctx.guardedCloseSession('t1',state.sessions.t1,{id:123,endTime:500}),/scoped conflict/);
    const remote=await saved();assert.ok(remote.sessions.t1);assert.equal(remote.history,undefined);assert.equal(remote.assignments.a1.endTime,undefined);
    assert.ok(ctx.S.sessions.t1);
  });
  await t.test('new assignment and banai add/remove require only scoped proof',async()=>{
    const state=fixture();await em.reset(state);const ctx=contextFor(em.db(),state);
    const session={...state.sessions.t1,items:[{id:'banai',isBanaiShimei:true}]};
    await ctx.guardedSessionNodeUpdate('t1',session,{'pos-dev/sessions/t1':session,'pos-dev/assignments/a1':{...state.assignments.a1,type:'banai'}},{expectedRecords:{'assignments/a1':state.assignments.a1}});
    const before=await saved(),next={...before.sessions.t1,items:[]};
    await ctx.guardedSessionNodeUpdate('t1',next,{'pos-dev/sessions/t1':next,'pos-dev/assignments/a1':{...before.assignments.a1,type:'free'}},{expectedRecords:{'assignments/a1':before.assignments.a1}});
    assert.equal((await saved()).sessions.t1._rev,6);
    await ctx.guardedCheckedNodeUpdate({'pos-dev/assignments/new':{id:'new',tableId:'t1',sessionId:100,castId:'c2',startTime:200}},null,{createRecords:['assignments/new']});
    assert.equal((await saved())._castAssignmentRevisions.c2,1);
  });
  await t.test('shift deletion rejects a new assignment after the empty query',async()=>{
    const state=fixture();state.assignments={};await em.reset(state);
    const ctx=contextFor(em.db(async()=>{
      await contextFor(em.db(),state).guardedCheckedNodeUpdate({'pos-dev/assignments/new':{id:'new',tableId:'t1',sessionId:100,castId:'c1',startTime:200}},null,{createRecords:['assignments/new']});
    }),state);
    await assert.rejects(ctx.guardedShiftDelete('s1',state.shifts.s1),/scoped conflict/);
    assert.ok((await saved()).shifts.s1);
  });
  await t.test('two simultaneous assignment reactivations cannot both commit',async()=>{
    const state=fixture();state.assignments.a1.endTime=150;state.assignments.a2={...state.assignments.a1,id:'a2'};await em.reset(state);
    let count=0,release;const ready=new Promise(r=>release=r);
    const barrier=async()=>{if(++count===2)release();await ready;};
    const results=await Promise.allSettled(['a1','a2'].map(id=>{
      const ctx=contextFor(em.db(barrier),state),before=state.assignments[id];
      return ctx.guardedCheckedNodeUpdate({['pos-dev/assignments/'+id]:{...before,endTime:null}},root=>!ctx.remoteActiveAssign(root,'c1'),{expectedRecords:{['assignments/'+id]:before},readActiveAssignCasts:['c1']});
    }));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  });
  await t.test('TC works with scoped validation and rejects an assignment change',async()=>{
    for(const race of [false,true]){
      const state=fixture();state.assignments.ended={...state.assignments.a1,id:'ended',endTime:150};await em.reset(state);
      const ctx=contextFor(em.db(race?async()=>{await em.request('pos-dev/assignments/a1/_rev','PUT',8,true);}:null),state);
      if(race)await assert.rejects(ctx.guardedAtomicTableChange('t1','t2',state.sessions.t1));
      else{await ctx.guardedAtomicTableChange('t1','t2',state.sessions.t1);assert.equal((await saved()).assignments.ended.tableId,'t2');}
    }
  });
  await t.test('independent assignments on different tables do not conflict on the operation proof',async()=>{
    const state=fixture();state.sessions.t2={sessionId:'s2',startTime:200,_rev:1};await em.reset(state);
    let count=0,release;const ready=new Promise(r=>release=r),barrier=async()=>{if(++count===2)release();await ready;};
    const results=await Promise.allSettled(['t1','t2'].map((tableId,i)=>contextFor(em.db(barrier),state).guardedCheckedNodeUpdate({['pos-dev/assignments/new'+i]:{id:'new'+i,tableId,sessionId:i?200:100,castId:'cast'+i,startTime:300}},null,{createRecords:['assignments/new'+i]})));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,2);
  });
  await t.test('assignment time edit reopens only an existing session and updates the shift atomically',async()=>{
    const state=fixture();state.assignments.a1.endTime=200;state.shifts.s1.status='waiting';await em.reset(state);
    const ctx=contextFor(em.db(),state),errors=[];
    vm.runInContext(source('async function saveAssignTimeEdit','// ===== CHECKIN ====='),ctx);
    ctx.window._editAid='a1';ctx.document={getElementById:id=>({value:id==='eat-start'?'110':''})};
    ctx.hhmm2ts=Number;ctx.getShiftByCastId=()=>ctx.S.shifts.s1;ctx.alert=message=>errors.push(message);
    await ctx.saveAssignTimeEdit();assert.deepEqual(errors,[]);
    const remote=await saved();assert.equal(remote.assignments.a1.endTime,undefined);assert.equal(remote.shifts.s1.status,'active');
  });
  await t.test('admin assignment reset uses scoped deletions and does not preapply failures',async()=>{
    for(const fail of [false,true]){
      const state=fixture();await em.reset(state);
      const ctx=contextFor(em.db(fail?async()=>{throw new Error('offline');}:null),state);
      vm.runInContext(source('async function clearAllSessions','function sst'),ctx);ctx.confirm=()=>true;
      await ctx.clearAllAssignments();
      assert.equal(!!ctx.S.assignments.a1,fail);
      assert.equal((await saved()).shifts.s1.status,fail?'active':'waiting');
    }
  });
  await t.test('legacy numeric-key history edits preserve other records and reject stale versions',async()=>{
    const state=fixture();state.history={'0':{id:100,total:6000},'1':{id:101,total:7000}};await em.reset(state);
    const ctx=contextFor(em.db(),state);
    await ctx.guardedHistoryRecordUpdate(state.history['0'],{...state.history['0'],payMethod:'card'});
    await assert.rejects(ctx.guardedHistoryRecordUpdate(state.history['0'],null));
    const remote=await saved();assert.equal(remote.history['0'].payMethod,'card');assert.equal(remote.history['1'].total,7000);
  });
  await t.test('closed day move, delete, recreate and restore keep monotonic revisions',async()=>{
    const state=fixture();state.activeBizDay=null;state.bizDays={d1:{id:'d1',date:'d1',history:[{total:1000}]},other:{id:'other'}};await em.reset(state);
    const ctx=contextFor(em.db(),state);
    await ctx.guardedMoveClosedBizDay('d1',state.bizDays.d1,'d2',{...state.bizDays.d1,id:'d2',date:'d2'});
    assert.equal(ctx.S.bizDays.other.id,'other');
    await ctx.guardedReplaceClosedBizDay('d2',clone(ctx.S.bizDays.d2),null);
    await ctx.guardedRestoreBackupDays({d2:{startedAt:100,endedAt:200,history:[{total:2000}],castLifecycleLogs:{enteredCasts:[{castId:'c1'}]}}});
    const remote=await saved();assert.equal(remote.bizDays.d2._rev,3);assert.equal(remote.bizDaySummaries.d2._dayRev,3);
    assert.equal(remote._settingsRevisions.castRoster,1);assert.equal(remote.bizDays.other.id,'other');
  });
  await t.test('day edit loses a race without updating its summary or another day',async()=>{
    const state=fixture();state.activeBizDay=null;state.bizDays={d1:{id:'d1',date:'d1'}};await em.reset(state);
    const ctx=contextFor(em.db(async()=>{await em.request('pos-dev/bizDays/d1/_rev','PUT',1,true);}),state);
    await assert.rejects(ctx.guardedReplaceClosedBizDay('d1',state.bizDays.d1,{...state.bizDays.d1,history:[]}),/scoped conflict/);
    assert.equal((await saved()).bizDaySummaries,undefined);
  });
  await t.test('backup restore rejects an intervening business start without local changes',async()=>{
    const state=fixture();state.activeBizDay=null;await em.reset(state);
    const ctx=contextFor(em.db(async()=>{await em.request('pos-dev/activeBizDay','PUT','new-day',true);}),state);
    await assert.rejects(ctx.guardedRestoreBackupDays({d1:{startedAt:100,endedAt:200,history:[{total:100}]}}));
    assert.equal(ctx.S.bizDays.d1,undefined);assert.equal((await saved()).bizDays,undefined);
  });
  await t.test('start and end include day revision and backup atomically',async()=>{
    const state=fixture();state.activeBizDay=null;state.sessions={};state.shifts={};state.assignments={};await em.reset(state);
    const ctx=contextFor(em.db(),state),day={id:'d1',date:'d1',startedAt:100};
    const values={'bizDays/d1':day,'bizDaySummaries/d1':{id:'d1'},activeBizDay:'d1',sessions:null,assignments:null,shifts:null,history:null};
    await ctx.guardedAtomicBizDayUpdate('start','d1',null,'d1',values);
    const remote=await saved();ctx.S.bizDays=remote.bizDays;
    await ctx.guardedAtomicBizDayUpdate('end','d1','d1',null,{...values,'bizDays/d1':{...remote.bizDays.d1,endedAt:200},activeBizDay:null},{'backup-dev/bizDays/d1':{date:'d1',endedAt:200}},{backupKey:'d1'});
    const ended=await saved();assert.equal(ended.activeBizDay,undefined);assert.equal(ended.bizDays.d1._rev,2);
  });
  await t.test('reopening legacy records and ending with a trial-roster update work without a root transaction',async()=>{
    const state=fixture(),day={id:'d1',date:'d1',startedAt:100,endedAt:200,history:[{id:123,total:6000}]};
    state.activeBizDay=null;state.bizDays={d1:day};state.casts=[{id:1,name:'trial',castType:'trial'}];state.castLifecycleLogs={};
    state.sessions={};await em.reset(state);
    const ctx=contextFor(em.db(),state);
    await ctx.guardedAtomicBizDayUpdate('reopen','d1',null,'d1',{'bizDays/d1':{...day,isReEdit:true,endedAt:null},'bizDaySummaries/d1':{id:'d1'},activeBizDay:'d1',history:{123:day.history[0]},shifts:state.shifts,assignments:state.assignments,sessions:null});
    const remote=await saved();ctx.S.bizDays=remote.bizDays;
    await ctx.guardedAtomicBizDayUpdate('end','d1','d1',null,{'bizDays/d1':{...remote.bizDays.d1,endedAt:300},'bizDaySummaries/d1':{id:'d1'},activeBizDay:null,history:null,shifts:null,assignments:null,sessions:null,casts:[],castLifecycleLogs:{d1:{trialCasts:[{castId:1}]}}},{'backup-dev/bizDays/d1':{date:'d1',endedAt:300}},{backupKey:'d1'});
    assert.equal((await saved())._settingsRevisions.castRoster,1);
  });
  await t.test('old client writes are denied after capability activation',async()=>{
    await em.reset(fixture());
    await assert.rejects(em.request('','PATCH',{'pos-dev/loMode':true,'pos-dev/_writeGate':{versionNum:614300,nonce:'old'}}));
  });
});
