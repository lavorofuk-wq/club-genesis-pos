const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {app,clone,source,fixture,fakeDb,contextFor,emulator}=require('./helpers/scoped-runtime.cjs');

function setup(beforeWrite){
  const state=fixture(),db=fakeDb(state,beforeWrite),ctx=contextFor(db,state),alerts=[];
  ctx.S.tables=[{id:'t1',label:'T1'},{id:'t2',label:'T2'}];
  Object.assign(ctx,{
    vw:'list',DEV:'desktop',now:1000,document:{getElementById:()=>null},sessionStorage:{getItem:()=>null},
    startLazyViewDataLoad:()=>{},alert:value=>alerts.push(value),
    rem:end=>end?end-1000:null,ts:String,isV:()=>false,itemCastName:()=>'',
    getWaitingCasts:()=>[],getBreakCasts:()=>[],getOnduty:()=>[],
    floorGridLayout:()=>({fit:false,cols:'1fr 1fr',gap:'12px'})
  });
  vm.runInContext(source('function rFloor(){','function castChip('),ctx);
  vm.runInContext(source('function sv(v,extra)','function openFloorDetail'),ctx);
  vm.runInContext(source('function gmsEscapeHtml','function exportDayCSV'),ctx);
  ctx.openCheckinWizard=()=>{ctx.checkinOpened=true;};
  return{ctx,state,db,alerts};
}
function record(state,id=123){
  return{id,tableId:'t1',startTime:100,endTime:500,total:7800,subtotal:6000,tax:1800,items:clone(state.sessions.t1.items)};
}
async function close(env){
  await env.ctx.guardedCloseSession('t1',clone(env.state.sessions.t1),record(env.state));
  return clone(env.state.tablePreparations.t1);
}

test('checkout atomically records preparation, releases casts and preserves amounts without an active session',async()=>{
  const env=setup();await close(env);
  const {ctx,state,db}=env;
  assert.equal(db.writes.length,1);
  assert.equal(state.sessions.t1,undefined);
  assert.equal(state.tablePreparations.t1.sessionId,'123');
  assert.equal(state.tablePreparations.t1.completedAt,500);
  assert.equal(state.tablePreparations.t1._rev,1);
  assert.deepEqual(clone(ctx.S.tablePreparations),state.tablePreparations);
  assert.equal(state.history[123].total,7800);
  assert.equal(state.shifts.s1.status,'waiting');
  assert.equal(state.assignments.a1.endTime,500);
  assert.ok(state._scopedOperation.records.tablePreparations.t1.write);
});

test('ordinary table deletion does not request preparation; failed checkout changes nothing',async()=>{
  const deleted=setup();
  await deleted.ctx.guardedCloseSession('t1',deleted.state.sessions.t1);
  assert.equal(deleted.state.tablePreparations,undefined);
  const failed=setup(()=>{throw new Error('offline');}),before=clone(failed.state);
  await assert.rejects(close(failed),/offline/);
  assert.deepEqual(failed.state,before);
  assert.equal(failed.ctx.tablePreparationPending('t1'),false);
});

test('floor and list show the same paid state, no guests or countdown, and keep other seats empty',async()=>{
  const env=setup();await close(env);
  for(const render of [()=>env.ctx.rFloor(),()=>env.ctx.rList()]){
    const html=render();
    assert.equal((html.match(/会計終了済/g)||[]).length,1);
    assert.ok(html.includes('table-preparation-pending'));
    assert.ok(html.includes('空席'));
    assert.ok(!html.includes('data-countdown='));
  }
  env.ctx.tc2('t1');
  assert.equal(env.ctx.md,'tablePreparation');
  assert.equal(env.ctx.checkinOpened,undefined);
  assert.ok(env.ctx.tablePreparationModalHtml().includes('テーブル準備は完了していますか？'));
  env.ctx.md=null;env.ctx.vw='list';
  env.ctx.sv('tableDetail','t1');
  assert.equal(env.ctx.md,'tablePreparation');
  assert.equal(env.ctx.vw,'list');
});

test('No preserves preparation and history, displays the message, and returns from list to floor',async()=>{
  const env=setup();await close(env);
  env.ctx.sv('tableDetail','t1');
  const before=clone(env.state),writes=env.db.writes.length;
  await env.ctx.answerTablePreparation(false);
  assert.deepEqual(env.state,before);
  assert.equal(env.db.writes.length,writes);
  assert.equal(env.ctx.vw,'floor');
  assert.equal(env.ctx.md,null);
  assert.deepEqual(env.alerts,['完了後にチェックイン可能です。']);
  assert.equal(env.ctx.tablePreparationPending('t1'),true);
});

test('Yes clears only the matching preparation after acknowledgement; both tabs return to vacant',async()=>{
  const env=setup();await close(env);
  const history=clone(env.state.history);
  env.ctx.tc2('t1');await env.ctx.answerTablePreparation(true);
  assert.equal(env.state.tablePreparations.t1,undefined);
  assert.equal(env.ctx.tablePreparationPending('t1'),false);
  assert.deepEqual(env.state.history,history);
  assert.equal(env.ctx.vw,'floor');
  assert.equal(env.ctx.checkinOpened,undefined,'Yes does not itself check in a new guest');
  for(const html of [env.ctx.rFloor(),env.ctx.rList()])assert.ok(!html.includes('会計終了済'));
  env.ctx.tc2('t1');assert.equal(env.ctx.checkinOpened,true);
});

test('failed readiness save keeps the paid state, disables repeated Yes clicks, and allows retry',async()=>{
  const env=setup();await close(env);
  env.ctx.tc2('t1');
  const actual=env.ctx.guardedCompleteTablePreparation;
  let reject;
  env.ctx.guardedCompleteTablePreparation=()=>new Promise((ok,no)=>{reject=no;});
  const pending=env.ctx.answerTablePreparation(true);
  assert.equal(env.ctx.tablePreparationBusy,true);
  assert.equal((env.ctx.tablePreparationModalHtml().match(/disabled/g)||[]).length,2);
  await env.ctx.answerTablePreparation(true);
  assert.equal(env.db.writes.length,1);
  assert.equal(env.ctx.tablePreparationPending('t1'),true);
  reject(new Error('offline'));await pending;
  assert.equal(env.ctx.md,'tablePreparation');
  assert.ok(env.ctx.tablePreparationError);
  assert.equal(env.ctx.tablePreparationBusy,false);
  env.ctx.guardedCompleteTablePreparation=actual;
  await env.ctx.answerTablePreparation(true);
  assert.equal(env.ctx.tablePreparationPending('t1'),false);
});

test('stale prompts cannot clear a later checkout or an occupied table',async()=>{
  for(const change of ['another-checkout','occupied','already-ready']){
    const env=setup(),expected=await close(env),writes=env.db.writes.length;
    if(change==='another-checkout')env.state.tablePreparations.t1.sessionId='new-checkout';
    if(change==='occupied')env.state.sessions.t1={sessionId:'new-guest',startTime:900};
    if(change==='already-ready')delete env.state.tablePreparations.t1;
    await assert.rejects(env.ctx.guardedCompleteTablePreparation('t1',expected),/changed/);
    assert.equal(env.db.writes.length,writes);
  }
});

test('stale local screens cannot check in, move, or restore history onto a pending table',async()=>{
  const env=setup();await close(env);
  env.ctx.S.tablePreparations={};
  await assert.rejects(env.ctx.guardedSessionNodeTransaction('t1',{startTime:900},{expectCreate:true}),/preparation required/);
  env.state.sessions.t2={tableId:'t2',sessionId:'other',startTime:200,_rev:1,items:[]};
  await assert.rejects(env.ctx.guardedAtomicTableChange('t2','t1',env.state.sessions.t2),/preparation required/);
  await assert.rejects(env.ctx.guardedRestoreHistoryToFloor(clone(env.state.history[123])),/preparation required/);
  assert.equal(env.db.writes.length,1);
});

test('realtime updates and a fresh page both retain readiness independently of sessions and business days',()=>{
  const env=setup(),{ctx}=env;
  Object.assign(ctx,{finishInitialPosSyncPath:()=>{},hasPendingSettingSaves:()=>false,handlePosSyncRender:()=>{}});
  vm.runInContext(source('function applyPosCoreValue','function subscribePosCoreData'),ctx);
  const value={t1:{tableId:'t1',sessionId:'receipt',completedAt:500}};
  ctx.applyPosCoreValue({},'tablePreparations',value);
  assert.equal(ctx.tablePreparationPending('t1'),true);
  ctx.S.sessions={};ctx.S.activeBizDay='next-day';
  assert.equal(ctx.tablePreparationPending('t1'),true);
  ctx.applyPosCoreValue({},'tablePreparations',null);
  assert.equal(ctx.tablePreparationPending('t1'),false);
  assert.match(app,/POS_CORE_SYNC_PATHS=\[[^\]]*"tablePreparations"/);
});

test('Firebase readiness rules reject stale writes atomically',{skip:process.env.POS_RULES_EMULATOR!=='1'},async t=>{
  const em=await emulator('demo-pos-preparation');
  for(const action of ['ready','stale-ready','recreated-ready','stale-checkin','stale-move','missing-marker']){
    await t.test(action,async()=>{
      const state=fixture();await em.reset(state);
      const ctx=contextFor(em.db(),state);
      const rec=record(state);
      await ctx.guardedCloseSession('t1',state.sessions.t1,rec);
      const current=await em.request('pos-dev','GET',undefined,true);
      const marker=current.tablePreparations.t1;
      if(action==='ready'){
        await ctx.guardedCompleteTablePreparation('t1',marker);
        const after=await em.request('pos-dev','GET',undefined,true);
        assert.equal(after.tablePreparations,undefined);
        assert.equal(after.history[123].total,7800);
        await em.request('pos-dev/sessions/t1','PUT',{
          tableId:'t1',sessionId:'new',startTime:900,_rev:1,_nodeWriteVersion:615100,_nodeWriteNonce:'new'
        });
        assert.equal((await em.request('pos-dev/sessions/t1','GET',undefined,true)).sessionId,'new');
      }else if(action==='stale-ready'||action==='recreated-ready'){
        const racing=contextFor(em.db(async()=>{
          await em.request('pos-dev/tablePreparations/t1/sessionId','PUT','another-checkout',true);
          if(action==='stale-ready')await em.request('pos-dev/tablePreparations/t1/_rev','PUT',2,true);
        }),current);
        await assert.rejects(racing.guardedCompleteTablePreparation('t1',marker),/scoped conflict/);
        assert.equal((await em.request('pos-dev/tablePreparations/t1','GET',undefined,true)).sessionId,'another-checkout');
      }else if(action==='stale-checkin'){
        await assert.rejects(em.request('pos-dev/sessions/t1','PUT',{
          tableId:'t1',sessionId:'new',startTime:900,_rev:1,_nodeWriteVersion:615100,_nodeWriteNonce:'new'
        }),/Permission denied/i);
      }else if(action==='stale-move'){
        const source={tableId:'t2',sessionId:'s2',startTime:900,_rev:1,items:[]};
        await em.request('pos-dev/sessions/t2','PUT',source,true);
        const stale={...current,sessions:{t2:source},tablePreparations:{}};
        const racing=contextFor(em.db(),stale);
        await assert.rejects(racing.guardedAtomicTableChange('t2','t1',source),/preparation required/);
      }else{
        await em.reset(state);
        const oldClient=contextFor(em.db(updates=>{
          delete updates['pos-dev/tablePreparations/t1'];
          delete updates['pos-dev/_scopedOperation'].records.tablePreparations;
        }),state);
        await assert.rejects(oldClient.guardedCloseSession('t1',state.sessions.t1,rec),/scoped conflict/);
        const after=await em.request('pos-dev','GET',undefined,true);
        assert.ok(after.sessions.t1);assert.equal(after.history,undefined);
      }
    });
  }
});
