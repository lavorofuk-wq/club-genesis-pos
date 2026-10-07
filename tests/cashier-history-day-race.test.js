const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {clone,source,fixture,fakeDb,contextFor}=require('./helpers/scoped-runtime.cjs');

const DAY='2026-10-07',NEXT='2026-10-08';
function deferred(){
  let resolve;
  const promise=new Promise(done=>{resolve=done;});
  return{promise,resolve};
}
function setup({role='cashier',activeBizDay=DAY,phase}={}){
  const state=fixture();
  Object.assign(state,{activeBizDay,sessions:{},shifts:{},assignments:{},tables:[{id:'t1',label:'T1'}],
    history:{123:{id:123,tableId:'t1',startTime:100,endTime:500,setEndTime:400,guests:2,total:6000,items:[],_rev:1}}});
  const base=fakeDb(state),entered=deferred(),resume=deferred();
  const db={ref(key){
    const ref=base.ref(key);
    if(phase==='lookup'&&key==='pos-dev/history'){
      const get=ref.get;
      ref.get=async()=>{const value=await get();entered.resolve();await resume.promise;return value;};
    }
    if(phase==='response'){
      const update=ref.update;
      ref.update=async updates=>{await update(updates);entered.resolve();await resume.promise;};
    }
    return ref;
  }};
  const ctx=contextFor(db,state),alerts=[],statuses=[],timers=[],opened=[];
  Object.assign(ctx,{
    md:null,vw:'history',at:null,editPayHid:123,dhi:123,
    markSessionGuard:session=>session,gmsUniqueStrings:values=>[...new Set(values.map(String))],
    historySetEndTime:record=>record.setEndTime||null,
    document:{querySelectorAll:()=>[{dataset:{method:'card'},querySelector:()=>({value:'6000'})}]},
    confirm:()=>true,alert:message=>alerts.push(message),
    sbs:(ok,message)=>statuses.push({ok,message}),
    withDataOperation:async(key,operation)=>operation(),
    closeM:()=>{ctx.md=null;},render:()=>{},rModal:()=>{},
    setTimeout:callback=>{timers.push(callback);},openFloorDetail:id=>opened.push(id),
    om:name=>{ctx.md=name;}
  });
  ctx.window._posRole=role;
  for(const [start,end] of [
    ['function cdh(id)','// ===== 分割払い操作 ====='],
    ['function editHistPay(id)','function epToggleMethod'],
    ['async function saveHistPay(){','// ===== 営業日（'],
    ['async function doh(){','// ===== 出勤・退勤 =====']
  ])vm.runInContext(source(start,end),ctx);
  return{ctx,state,db:base,entered,resume,alerts,statuses,timers,opened};
}
function helperAction(ctx,kind){
  const expected=clone(ctx.S.history[0]);
  return kind==='restore'?ctx.guardedRestoreHistoryToFloor(expected)
    :ctx.guardedHistoryRecordUpdate(expected,kind==='delete'?null:{...expected,payMethod:'card'});
}
function uiAction(ctx,kind){
  return kind==='restore'?ctx.restoreHistoryToFloor(123):kind==='delete'?ctx.doh():ctx.saveHistPay();
}

test('history helpers deny list accounts, closed days, and stale day arguments before database reads',async()=>{
  for(const role of ['cashier','list','op'])for(const activeBizDay of [DAY,null]){
    if(role!=='list'&&activeBizDay)continue;
    const {ctx,db}=setup({role,activeBizDay});
    for(const kind of ['pay','delete','restore'])await assert.rejects(helperAction(ctx,kind),/HISTORY_BUSINESS_ACCESS_DENIED/);
    assert.equal(db.reads.length,0);assert.equal(db.writes.length,0);
  }
  const {ctx,db}=setup(),record=clone(ctx.S.history[0]);
  await assert.rejects(ctx.guardedHistoryRecordUpdate(record,null,NEXT),/HISTORY_BUSINESS_ACCESS_DENIED/);
  await assert.rejects(ctx.guardedRestoreHistoryToFloor(record,NEXT),/HISTORY_BUSINESS_ACCESS_DENIED/);
  assert.equal(db.reads.length,0);assert.equal(db.writes.length,0);
});

test('cashier and OP live history updates, deletion and floor restore keep scoped atomic writes',async()=>{
  for(const role of ['cashier','op'])for(const kind of ['pay','delete','restore']){
    const {ctx,state,db}=setup({role});
    await helperAction(ctx,kind);
    assert.equal(db.writes.length,1,role+' '+kind);
    assert.equal(state._scopedOperation.expectedActiveBizDay,DAY);
    if(kind==='pay'){assert.equal(state.history[123].payMethod,'card');assert.equal(ctx.S.history[0].payMethod,'card');}
    else assert.equal(ctx.S.history.length,0);
    if(kind==='restore')assert.equal(state.sessions.t1.tableId,'t1');
    assert.ok(db.reads.every(read=>!read.key.includes('/bizDays')&&!read.key.includes('/backup')));
  }
});

test('history helpers retain their starting day while the indexed record lookup is pending',async()=>{
  for(const kind of ['pay','delete','restore'])for(const next of [NEXT,null]){
    const env=setup({phase:'lookup'}),saving=helperAction(env.ctx,kind);
    await env.entered.promise;
    env.ctx.S.activeBizDay=next;env.state.activeBizDay=next;
    env.resume.resolve();
    await assert.rejects(saving,/business day changed/,kind+' '+next);
    assert.equal(env.db.writes.length,0);
  }
});

test('late history helper responses cannot replace or remove a new days history record',async()=>{
  for(const kind of ['pay','delete','restore'])for(const next of [NEXT,null]){
    const env=setup({phase:'response'}),saving=helperAction(env.ctx,kind);
    await env.entered.promise;
    const fresh=[{id:123,total:9999,startTime:999,note:'new day'}];
    env.ctx.S.activeBizDay=next;env.ctx.S.history=clone(fresh);
    env.ctx.S.sessions={fresh:{tableId:'fresh',sessionId:'new-day-session'}};
    env.resume.resolve();await saving;
    assert.deepEqual(clone(env.ctx.S.history),fresh,kind+' '+next);
    assert.deepEqual(clone(env.ctx.S.sessions),{fresh:{tableId:'fresh',sessionId:'new-day-session'}});
  }
});

test('late history UI save responses leave newly opened dialogs and navigation unchanged',async()=>{
  for(const kind of ['pay','delete','restore'])for(const next of [NEXT,null]){
    const env=setup({phase:'response'}),saving=uiAction(env.ctx,kind);
    await env.entered.promise;
    env.ctx.S.activeBizDay=next;env.ctx.S.history=[{id:456,total:9000}];
    env.ctx.md='settingsEditor';env.ctx.vw='settings';env.ctx.at='new-table';
    env.ctx.editPayHid=456;env.ctx.dhi=456;
    env.ctx.window._viewHistRec={id:456};env.ctx.window._histDetailBack='new-modal';
    env.resume.resolve();await saving;
    assert.equal(env.ctx.md,'settingsEditor',kind+' '+next);
    assert.equal(env.ctx.vw,'settings');assert.equal(env.ctx.at,'new-table');
    assert.equal(env.ctx.editPayHid,456);assert.equal(env.ctx.dhi,456);
    assert.deepEqual(env.ctx.window._viewHistRec,{id:456});
    assert.equal(env.ctx.window._histDetailBack,'new-modal');
    assert.equal(env.timers.length,0);assert.equal(env.alerts.length,0);
    assert.equal(env.statuses.filter(status=>status.ok).length,0);
  }
});

test('direct history mutation entry points are unavailable to list accounts and while closed',async()=>{
  for(const role of ['cashier','list','op'])for(const activeBizDay of [DAY,null]){
    if(role!=='list'&&activeBizDay)continue;
    const env=setup({role,activeBizDay});
    env.ctx.editPayHid=null;env.ctx.dhi=null;
    env.ctx.editHistPay(123);env.ctx.cdh(123);
    assert.equal(env.ctx.editPayHid,null);assert.equal(env.ctx.dhi,null);assert.equal(env.ctx.md,null);
    for(const kind of ['pay','delete','restore'])await uiAction(env.ctx,kind);
    assert.equal(env.db.reads.length,0);assert.equal(env.db.writes.length,0);
  }
});

test('successful cashier history UI operations finish normally and restore timers stay day-bound',async()=>{
  for(const kind of ['pay','delete','restore']){
    const env=setup();env.ctx.md=kind==='pay'?'editpay':kind==='delete'?'dh':'viewHistDetail';
    await uiAction(env.ctx,kind);
    assert.equal(env.db.writes.length,1);
    assert.equal(env.ctx.md,null);
    assert.ok(env.statuses.some(status=>status.ok));
    if(kind==='restore'){
      assert.equal(env.ctx.vw,'floor');assert.equal(env.timers.length,1);
      env.ctx.S.activeBizDay=NEXT;env.timers[0]();assert.deepEqual(env.opened,[]);
    }
  }
  const env=setup();await env.ctx.restoreHistoryToFloor(123);env.timers[0]();assert.deepEqual(env.opened,['t1']);
});

test('checkout restoration matches timestamp and stable session IDs without crossing sessions',()=>{
  const {ctx}=setup();
  const record={tableId:'t1',sessionId:'ses_100000_a1b2c3',startTime:160000,endTime:300000};
  const assignment={tableId:'t1',startTime:170000,endTime:300000};
  for(const sessionId of [160000,'160000','ses_100000_a1b2c3',100000,'100000']){
    assert.equal(ctx.isCheckoutEndedAssignment({...assignment,sessionId},record),true,String(sessionId));
  }
  assert.equal(ctx.isCheckoutEndedAssignment(assignment,record),true,'legacy rows without a session link');
  assert.equal(ctx.isCheckoutEndedAssignment({...assignment,sessionId:160000},{...record,sessionId:null}),true,'legacy checkout without stable ID');
  for(const changed of [
    {sessionId:'another-session'},{sessionId:99999},{sessionId:'ses_99999_other'},
    {sessionId:160000,tableId:'t2'},{sessionId:160000,endTime:298999},
    {sessionId:160000,endTime:301001},{sessionId:160000,endTime:null},
    {startTime:99999},{startTime:300001}
  ]){
    assert.equal(ctx.isCheckoutEndedAssignment({...assignment,...changed},record),false,JSON.stringify(changed));
  }
  assert.equal(ctx.isCheckoutEndedAssignment({...assignment,sessionId:160000},{...record,endTime:null}),false);
});
