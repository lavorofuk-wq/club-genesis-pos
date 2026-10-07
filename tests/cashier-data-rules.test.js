const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {clone,source,fixture,fakeDb,contextFor,emulator}=require('./helpers/scoped-runtime.cjs');

function dataFixture(){
  const state=fixture();
  state.tables=[{id:'t1',label:'1'},{id:'t2',label:'2'}];
  state.sessions={};
  state.shifts.s1.status='waiting';
  // Assignments identify a session by its start timestamp, unlike history.sessionId.
  state.assignments.a1={...state.assignments.a1,sessionId:100,endTime:500};
  state.history={h1:{id:1200,tableId:'t1',tableLabel:'1',sessionId:'session-1',startTime:100,endTime:500,
    guests:2,total:6000,payMethod:'cash',splits:[{method:'cash',amount:6000}],receiptIssued:true,
    items:[{id:'drink',price:2000,qty:3}],_rev:2},other:{id:1201,total:8000,_rev:1}};
  return state;
}

function dataContext(db,state,root='pos-dev',role='cashier'){
  const ctx=contextFor(db,state);
  ctx.window._posRole=role;ctx.window._posUid=role;ctx.FB_ROOT=root;
  ctx.withWriteGate=updates=>({...updates,[root+'/_writeGate']:{versionNum:614400,nonce:Math.random().toString()}});
  vm.runInContext(source('function gmsUniqueStrings','\nfunction '),ctx);
  vm.runInContext(source('function markSessionGuard','function markSessionGuards'),ctx);
  vm.runInContext(source('function historySetEndTime','function historyTimeLabel'),ctx);
  vm.runInContext(source('function remoteActiveShift','function remoteActiveAssign'),ctx);
  return ctx;
}

const desiredPayment=record=>{
  const next={...clone(record),payMethod:'card',splits:[{method:'card',amount:6000}]};
  delete next.receiptIssued;return next;
};

test('cashier data writes retain scoped history revisions and restore related live records',async()=>{
  for(const operation of ['payment','delete','restore']){
    const state=dataFixture(),db=fakeDb(state),ctx=dataContext(db,state),expected=clone(state.history.h1);
    if(operation==='restore')await ctx.guardedRestoreHistoryToFloor(expected);
    else await ctx.guardedHistoryRecordUpdate(expected,operation==='payment'?desiredPayment(expected):null);
    assert.equal(db.writes.length,1,operation+' commits once');
    assert.equal(state.history.other.total,8000);
    assert.ok(db.writes[0]['pos-dev/_scopedOperation']);
    if(operation==='payment'){
      assert.equal(state.history.h1.payMethod,'card');assert.equal(state.history.h1._rev,3);
      assert.equal(state.history.h1.receiptIssued,undefined);
    }else assert.equal(state.history.h1,undefined);
    if(operation==='restore'){
      assert.equal(state.sessions.t1.sessionId,'session-1');
      assert.equal(state.assignments.a1.endTime,null);
      assert.equal(state.shifts.s1.status,'active');
    }
    assert.ok(db.reads.every(r=>!['pos-dev','pos-dev/bizDays','pos-dev/bizDaySummaries','backup-dev/bizDays'].includes(r.key)));
  }
});

test('cashier data actions succeed under production rules while list writes and races fail atomically',
  {skip:process.env.POS_RULES_EMULATOR!=='1'},async t=>{
  const cashier=await emulator('demo-pos-cashier-data','cashier');
  const list=await emulator('demo-pos-cashier-data','list');
  const access={authorizedUsers:{cashier:true,list:true},roles:{cashier:'cashier',list:'list'}};
  const saved=root=>cashier.request(root,'GET',undefined,true);
  const reset=state=>cashier.request('','PUT',{access:clone(access),pos:clone(state),'pos-dev':clone(state)},true);
  async function run(ctx,state,operation){
    const expected=clone(state.history.h1);
    return operation==='restore'?ctx.guardedRestoreHistoryToFloor(expected):
      ctx.guardedHistoryRecordUpdate(expected,operation==='payment'?desiredPayment(expected):null);
  }

  for(const root of ['pos','pos-dev'])for(const operation of ['payment','delete','restore']){
    await t.test(root+' cashier '+operation+' saves without OP or archive access',async()=>{
      const state=dataFixture();await reset(state);
      const ctx=dataContext(cashier.db(),state,root);await run(ctx,state,operation);
      const remote=await saved(root);
      assert.equal(remote.history.other.total,8000);
      if(operation==='payment'){
        assert.equal(remote.history.h1.payMethod,'card');assert.equal(remote.history.h1._rev,3);
        assert.deepEqual(remote.history.h1.splits,[{method:'card',amount:6000}]);
        assert.equal(remote.history.h1.receiptIssued,undefined);
      }else assert.equal(remote.history.h1,undefined);
      if(operation==='restore'){
        assert.equal(remote.sessions.t1.sessionId,'session-1');
        assert.equal(remote.assignments.a1.endTime,undefined);assert.equal(remote.assignments.a1._rev,8);
        assert.equal(remote.shifts.s1.status,'active');assert.equal(remote.shifts.s1._rev,3);
      }
      await assert.rejects(cashier.request(root+'/bizDays'),error=>error.code==='PERMISSION_DENIED');
    });

    await t.test(root+' list cannot replay cashier '+operation+' payload',async()=>{
      const state=dataFixture();await reset(state);
      const db=fakeDb(clone(state)),ctx=dataContext(db,state);
      await run(ctx,state,operation);
      const payload=Object.fromEntries(Object.entries(db.writes[0]).map(([key,value])=>[key.replace(/^pos-dev\//,root+'/'),value]));
      const before=await saved(root);
      await assert.rejects(list.request('','PATCH',payload),error=>error.code==='PERMISSION_DENIED');
      assert.deepEqual(await saved(root),before);
    });
  }

  for(const operation of ['payment','delete','restore'])for(const race of ['history','business-end','business-switch']){
    await t.test(operation+' rejects concurrent '+race+' without partial data changes',async()=>{
      const state=dataFixture();await reset(state);let afterRace;
      const ctx=dataContext(cashier.db(async()=>{
        const updates=race==='history'?{'pos-dev/history/h1/_rev':3}:
          {'pos-dev/activeBizDay':race==='business-end'?null:'2026-09-09'};
        await cashier.request('','PATCH',updates,true);afterRace=await saved('pos-dev');
      }),state);
      await assert.rejects(run(ctx,state,operation));
      assert.ok(afterRace,'race reaches the atomic write');
      assert.deepEqual(await saved('pos-dev'),afterRace);
      assert.equal(ctx.S.history.find(record=>record.id===1200).payMethod,'cash');
      assert.equal(ctx.S.sessions.t1,undefined);
    });
  }

  for(const race of ['occupied-table','table-preparation','assignment','shift','cast-assignment','cast-shift','table-assignment']){
    await t.test('floor restore rejects concurrent '+race+' without deleting history',async()=>{
      const state=dataFixture();await reset(state);let afterRace;
      const mutations={
        'occupied-table':{'pos-dev/sessions/t1':{sessionId:'another',startTime:900,_rev:1}},
        'table-preparation':{'pos-dev/tablePreparations/t1':{state:'pending'}},
        assignment:{'pos-dev/assignments/a1/_rev':8},shift:{'pos-dev/shifts/s1/_rev':3},
        'cast-assignment':{'pos-dev/_castAssignmentRevisions/c1':1},
        'cast-shift':{'pos-dev/_castShiftRevisions/c1':1},
        'table-assignment':{'pos-dev/_tableAssignmentRevisions/t1':4}
      };
      const ctx=dataContext(cashier.db(async()=>{
        await cashier.request('','PATCH',mutations[race],true);afterRace=await saved('pos-dev');
      }),state);
      await assert.rejects(ctx.guardedRestoreHistoryToFloor(clone(state.history.h1)));
      assert.ok(afterRace,'race reaches the atomic write');
      assert.deepEqual(await saved('pos-dev'),afterRace);
      assert.ok(ctx.S.history.some(record=>record.id===1200));
      assert.equal(ctx.S.sessions.t1,undefined);
    });
  }

  await t.test('restoring checkout leaves another session on the same table unchanged',async()=>{
    const state=dataFixture();
    state.assignments.old={id:'old',castId:'c2',tableId:'t1',sessionId:90,startTime:95,endTime:500,type:'free',_rev:3};
    state.shifts.s2={id:'s2',castId:'c2',clockIn:80,status:'waiting',_rev:1};
    await reset(state);const ctx=dataContext(cashier.db(),state);
    const result=await ctx.guardedRestoreHistoryToFloor(clone(state.history.h1));
    const remote=await saved('pos-dev');
    assert.equal(result.restoredAssignments,1);assert.equal(result.skippedAssignments,0);
    assert.equal(remote.assignments.a1.endTime,undefined);assert.equal(remote.shifts.s1.status,'active');
    assert.deepEqual(remote.assignments.old,state.assignments.old);assert.deepEqual(remote.shifts.s2,state.shifts.s2);
  });

  await t.test('restoring checkout does not reactivate off-duty or currently assigned casts',async()=>{
    for(const unavailable of ['off-duty','another-table']){
      const state=dataFixture();
      if(unavailable==='off-duty'){state.shifts.s1.clockOut=600;state.shifts.s1.status='off';}
      else{
        state.sessions.t2={sessionId:'session-2',startTime:600,_rev:1};
        state.assignments.a2={id:'a2',castId:'c1',tableId:'t2',sessionId:600,startTime:600,_rev:1};
        state.shifts.s1.status='active';
      }
      await reset(state);const ctx=dataContext(cashier.db(),state);
      const result=await ctx.guardedRestoreHistoryToFloor(clone(state.history.h1));
      const remote=await saved('pos-dev');
      assert.equal(result.restoredAssignments,0);assert.equal(result.skippedAssignments,1);
      assert.equal(remote.sessions.t1.sessionId,'session-1');assert.equal(remote.history.h1,undefined);
      assert.deepEqual(remote.assignments,state.assignments);assert.deepEqual(remote.shifts,state.shifts);
    }
  });
});
