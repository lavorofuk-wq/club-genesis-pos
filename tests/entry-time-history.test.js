const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {source,clone,fixture,fakeDb,contextFor,emulator}=require('./helpers/scoped-runtime.cjs');

const minute=60000;
const start=Date.parse('2026-09-20T21:00:00+09:00');
function stateFor(){
  const state=fixture();
  state.sessions.t1={...state.sessions.t1,sessionId:'ses_'+start+'_test',startTime:start,setEndTime:start+60*minute,vipEndTime:start+30*minute,guests:1};
  const a={...state.assignments.a1,sessionId:start,startTime:start+minute,castName:'CURRENT_CAST'};
  state.assignments={
    a1:a,
    ended:{...a,id:'ended',castId:'c2',castName:'ENDED_CAST',endTime:start+5*minute},
    old:{...a,id:'old',sessionId:start-120*minute,startTime:start-119*minute,endTime:start-100*minute,castName:'PREVIOUS_GUEST'},
    other:{...a,id:'other',tableId:'t2',castName:'OTHER_TABLE'}
  };
  return state;
}
function runtime(db,state){
  const ctx=contextFor(db,state);
  vm.runInContext(source('async function guardedEntryTimeUpdate(','async function remItem('),ctx);
  vm.runInContext(source('function rAssignHistory(){','function openAssignActionModal('),ctx);
  Object.assign(ctx,{
    at:'t1',etv:'21:10',vw:'floor',md:'et',entryTimeBusy:false,dataOperationLocks:new Set(),
    document:{getElementById:()=>({value:ctx.etv})},hhmm2ts:()=>ctx.nextStart??start+10*minute,
    save:()=>{},renderOrderPartial:()=>{},isV:()=>false,rem:()=>null,ts:()=>'',fmtDur:()=>'',itemCastName:()=>'',
    ASSIGN_TYPES:{hon:{},free:{},help:{},banai:{}},
    alerts:[],alert:message=>ctx.alerts.push(message),
    closeM:()=>{ctx.md=null;},
    sameSessionIdOnly:(a,b)=>!!a&&!!b&&a.sessionId===b.sessionId
  });
  ctx.S.tables=[{id:'t1',label:'T1'},{id:'t2',label:'T2'}];
  ctx.window._detailTid='t1';
  return ctx;
}

test('entry-time edit keeps active and ended cast history on the unclosed table',async()=>{
  const state=stateFor(),db=fakeDb(state),ctx=runtime(db,state);
  assert.match(ctx.rTableDetail(),/ENDED_CAST/);
  await ctx.applyET();
  assert.deepEqual(ctx.alerts,[]);
  assert.match(ctx.rTableDetail(),/CURRENT_CAST/);
  assert.match(ctx.rTableDetail(),/ENDED_CAST/);
  assert.doesNotMatch(ctx.rTableDetail(),/PREVIOUS_GUEST|OTHER_TABLE/);
  assert.doesNotMatch(ctx.rAssignHistory(),/CURRENT_CAST|ENDED_CAST/);
  assert.ok(ctx.S.sessions.t1);
  assert.equal(db.writes.length,1);
});

test('an existing entry-time mismatch is visible by its original session timestamp without writes',()=>{
  const state=stateFor();
  state.sessions.t1.startTime=start-10*minute;
  const db=fakeDb(state),ctx=runtime(db,state),before=clone(ctx.S);
  assert.match(ctx.rTableDetail(),/ENDED_CAST/);
  assert.doesNotMatch(ctx.rAssignHistory(),/CURRENT_CAST|ENDED_CAST/);
  assert.deepEqual(clone(ctx.S),before);
  assert.equal(db.writes.length,0);
});

test('VIP-shaped mixed links stay together without changing saved cast times',()=>{
  const state=stateFor(),original=Date.parse('2026-09-20T22:50:00+09:00');
  state.sessions.t1={...state.sessions.t1,sessionId:'ses_'+original+'_sample',startTime:original-10*minute};
  state.assignments.a1.sessionId=state.sessions.t1.startTime;
  state.assignments.ended.sessionId=original;
  state.assignments.ended.startTime=original-19*minute;
  const ctx=runtime(fakeDb(state),state);
  assert.match(ctx.rTableDetail(),/CURRENT_CAST/);
  assert.match(ctx.rTableDetail(),/ENDED_CAST/);
  assert.doesNotMatch(ctx.rTableDetail(),/PREVIOUS_GUEST|OTHER_TABLE/);
  vm.runInContext(source('function exportAssignHistCSV(){','function _dlCSV('),ctx);
  let csv='';ctx._dlCSV=value=>{csv=value;};ctx.exportAssignHistCSV();
  assert.doesNotMatch(csv,/CURRENT_CAST|ENDED_CAST/);
  assert.match(csv,/PREVIOUS_GUEST/);
});

test('unknown session IDs never infer a match from a nearby working time',()=>{
  const state=stateFor();
  state.sessions.t1.startTime=start-10*minute;
  state.sessions.t1.sessionId='unrecognized-session';
  const ctx=runtime(fakeDb(state),state);
  assert.doesNotMatch(ctx.rTableDetail(),/ENDED_CAST/);
});

test('TC also moves an existing original-time link in one scoped write',async()=>{
  const state=stateFor();state.sessions.t1.startTime=start-10*minute;
  state.assignments.unknown={...state.assignments.a1,id:'unknown',sessionId:start-5*minute};
  const db=fakeDb(state),ctx=runtime(db,state);
  await ctx.guardedAtomicTableChange('t1','t2',ctx.S.sessions.t1);
  ctx.window._detailTid='t2';
  assert.match(ctx.rTableDetail(),/ENDED_CAST/);
  assert.equal(ctx.S.assignments.ended.sessionId,start-10*minute);
  assert.equal(ctx.S.assignments.old.tableId,'t1');
  assert.equal(ctx.S.assignments.unknown.sessionId,start-5*minute);
  assert.equal(db.writes.length,1);
  assert.ok(db.writes[0]['pos-dev/_scopedOperation']);
});

test('entry-time modal blocks close and repeat actions while saving, then restores input',()=>{
  const state=stateFor(),ctx=runtime(fakeDb(state),state),modal={innerHTML:''};
  ctx.DEV='mobile';ctx.checkoutBusy=false;
  ctx.document={getElementById:id=>id==='md'?modal:null};
  vm.runInContext(source('function rModal(){','function scc('),ctx);
  vm.runInContext(source('function om(name)','// ===== RECEIPT PRINT ====='),ctx);
  ctx.rModal();assert.match(modal.innerHTML,/value="21:10"/);
  ctx.entryTimeBusy=true;ctx.rModal();
  assert.match(modal.innerHTML,/role="status"/);
  assert.doesNotMatch(modal.innerHTML,/applyET\(\)|onclick="closeM\(\)"/);
  ctx.closeM();ctx.om('co');assert.equal(ctx.md,'et');
  ctx.entryTimeBusy=false;ctx.rModal();assert.match(modal.innerHTML,/value="21:10"/);
});

test('entry-time edit changes only the session and its links, not cast working times',async()=>{
  const state=stateFor(),before=clone(state),db=fakeDb(state),ctx=runtime(db,state);
  await ctx.applyET();
  assert.equal(ctx.S.sessions.t1.startTime,start+10*minute);
  assert.equal(ctx.S.sessions.t1.setEndTime,start+70*minute);
  assert.equal(ctx.S.sessions.t1.vipEndTime,start+40*minute);
  assert.equal(ctx.S.sessions.t1.sessionId,before.sessions.t1.sessionId);
  for(const id of ['a1','ended']){
    assert.equal(ctx.S.assignments[id].sessionId,start+10*minute);
    assert.equal(ctx.S.assignments[id].startTime,before.assignments[id].startTime);
    assert.equal(ctx.S.assignments[id].endTime,before.assignments[id].endTime);
    assert.equal(ctx.S.assignments[id]._rev,before.assignments[id]._rev+1);
  }
  assert.deepEqual(ctx.S.assignments.old,before.assignments.old);
  assert.deepEqual(ctx.S.assignments.other,before.assignments.other);
  assert.deepEqual(state.shifts,before.shifts);
  assert.ok(db.reads.every(r=>r.key!=='pos-dev'&&!r.key.includes('history')&&!r.key.includes('bizDays')));
  assert.ok(db.reads.some(r=>r.key==='pos-dev/assignments'&&r.field==='tableId'&&r.filter==='t1'));
});

test('TC after editing the entry time moves ended history with the current session',async()=>{
  const state=stateFor(),db=fakeDb(state),ctx=runtime(db,state);
  await ctx.applyET();
  assert.equal(state.sessions.t1.startTime,start+10*minute);
  await ctx.guardedAtomicTableChange('t1','t2',ctx.S.sessions.t1);
  ctx.window._detailTid='t2';
  assert.match(ctx.rTableDetail(),/ENDED_CAST/);
  assert.equal(ctx.S.assignments.ended.tableId,'t2');
  assert.equal(ctx.S.assignments.old.tableId,'t1');
});

test('failed entry-time save preserves the table, assignments and input for retry',async()=>{
  const state=stateFor(),db=fakeDb(state,()=>{throw new Error('offline');}),ctx=runtime(db,state);
  const before=clone(ctx.S);
  await ctx.applyET();
  assert.deepEqual(clone(ctx.S),before);
  assert.equal(ctx.md,'et');
  assert.equal(ctx.etv,'21:10');
  assert.equal(ctx.entryTimeBusy,false);
  assert.equal(ctx.alerts.length,1);
  assert.equal(db.writes.length,0);
});

test('entry-time edit waits for queued orders and prevents duplicate submission',async()=>{
  const state=stateFor(),db=fakeDb(state),ctx=runtime(db,state);
  let release;
  ctx.waitForSessionSaveQueue=()=>new Promise(resolve=>{release=()=>{
    state.sessions.t1.items.push({id:'queued',qty:1,price:1000});
    state.sessions.t1._rev++;
    ctx.S.sessions.t1=clone(state.sessions.t1);
    resolve();
  };});
  const first=ctx.applyET();
  assert.equal(ctx.entryTimeBusy,true);
  await ctx.applyET();
  release();await first;
  assert.equal(db.writes.length,1);
  assert.ok(ctx.S.sessions.t1.items.some(i=>i.id==='queued'));
});

test('failed queued orders and pending assignments block entry-time changes',async()=>{
  for(const pendingAssignment of [false,true]){
    const state=stateFor(),db=fakeDb(state),ctx=runtime(db,state);
    if(pendingAssignment)ctx.isPendingAssignment=id=>id==='ended';
    else ctx.sessionSaveStates.t1={status:'error'};
    await ctx.applyET();
    assert.equal(db.writes.length,0);
    assert.equal(ctx.S.sessions.t1.startTime,start);
    assert.equal(ctx.alerts.length,1);
  }
});

test('repeated entry-time edits keep every current assignment linked',async()=>{
  const state=stateFor(),db=fakeDb(state),ctx=runtime(db,state);
  for(const delta of [10,-5,20]){
    ctx.nextStart=start+delta*minute;
    await ctx.applyET();
    assert.equal(ctx.S.assignments.ended.sessionId,ctx.nextStart);
    assert.equal(ctx.S.sessions.t1.setEndTime,ctx.nextStart+60*minute);
    assert.match(ctx.rTableDetail(),/ENDED_CAST/);
  }
});

test('entry-time edit handles legacy missing links but does not guess mismatched links',async()=>{
  const state=stateFor();
  delete state.assignments.ended.sessionId;
  state.assignments.mismatch={...state.assignments.ended,id:'mismatch',sessionId:start-5*minute};
  const db=fakeDb(state),ctx=runtime(db,state);
  await ctx.applyET();
  assert.equal(ctx.S.assignments.ended.sessionId,start+10*minute);
  assert.equal(ctx.S.assignments.mismatch.sessionId,start-5*minute);
});

test('entry-time save rejects a remotely changed or closed session',async()=>{
  for(const closed of [false,true]){
    const state=stateFor(),db=fakeDb(state),ctx=runtime(db,state);
    if(closed)delete state.sessions.t1;else state.sessions.t1._rev++;
    await ctx.applyET();
    assert.equal(db.writes.length,0);
    assert.equal(ctx.alerts.length,1);
    assert.equal(ctx.S.sessions.t1.startTime,start);
  }
});

test('entry-time updates are atomic under Firebase races',{skip:process.env.POS_RULES_EMULATOR!=='1'},async t=>{
  const em=await emulator('demo-pos-entry-time');
  await t.test('entry-time edit and TC preserve ended history under deployed rules',async()=>{
    const state=stateFor();await em.reset(state);
    const ctx=runtime(em.db(),state);
    await ctx.applyET();assert.deepEqual(ctx.alerts,[]);
    await ctx.guardedAtomicTableChange('t1','t2',ctx.S.sessions.t1);
    const saved=await em.request('pos-dev');
    assert.equal(saved.assignments.ended.tableId,'t2');
    assert.equal(saved.assignments.ended.sessionId,start+10*minute);
    assert.equal(saved.assignments.old.tableId,'t1');
  });
  await t.test('an existing original-time link moves atomically under unchanged rules',async()=>{
    const state=stateFor();state.sessions.t1.startTime=start-10*minute;await em.reset(state);
    const ctx=runtime(em.db(),state);
    await ctx.guardedAtomicTableChange('t1','t2',ctx.S.sessions.t1);
    const saved=await em.request('pos-dev');
    assert.equal(saved.sessions.t1,undefined);
    assert.equal(saved.sessions.t2.startTime,start-10*minute);
    assert.equal(saved.assignments.ended.tableId,'t2');
    assert.equal(saved.assignments.ended.sessionId,start-10*minute);
    assert.equal(saved.assignments.old.tableId,'t1');
  });
  for(const race of ['order','ended-history','new-assignment','destination','business-day']){
    await t.test('recovered-history TC rejects concurrent '+race,async()=>{
      const state=stateFor();state.sessions.t1.startTime=start-10*minute;await em.reset(state);
      const ctx=runtime(em.db(async()=>{
        const updates=race==='order'?{'sessions/t1/_rev':5}
          :race==='ended-history'?{'assignments/ended/_rev':8}
          :race==='new-assignment'?{'assignments/new':{...state.assignments.a1,id:'new'},'_tableAssignmentRevisions/t1':4}
          :race==='destination'?{'sessions/t2':{sessionId:'other',startTime:1,_rev:1}}
          :{activeBizDay:'another-day'};
        await em.request('pos-dev','PATCH',updates,true);
      }),state);
      const before=clone(ctx.S);
      await assert.rejects(ctx.guardedAtomicTableChange('t1','t2',ctx.S.sessions.t1));
      assert.deepEqual(clone(ctx.S),before);
      const saved=await em.request('pos-dev');
      assert.ok(saved.sessions.t1);
      assert.equal(saved.assignments.ended.tableId,'t1');
      assert.equal(saved.assignments.ended.sessionId,start);
    });
  }
  for(const race of ['order','assignment','new-assignment','checkout','business-day']){
    await t.test('rejects concurrent '+race+' without a partial time change',async()=>{
      const state=stateFor();await em.reset(state);
      const db=em.db(async()=>{
        const updates=race==='order'?{'sessions/t1/_rev':5}
          :race==='assignment'?{'assignments/ended/_rev':8}
          :race==='new-assignment'?{'assignments/new':{...state.assignments.a1,id:'new',castId:'c9'},'_tableAssignmentRevisions/t1':4}
          :race==='checkout'?{'sessions/t1':null}
          :{activeBizDay:'another-day'};
        await em.request('pos-dev','PATCH',updates,true);
      });
      const ctx=runtime(db,state),before=clone(ctx.S);
      await ctx.applyET();
      assert.equal(ctx.alerts.length,1);
      assert.deepEqual(clone(ctx.S),before);
      const saved=await em.request('pos-dev');
      if(race!=='checkout')assert.equal(saved.sessions.t1.startTime,start);
      assert.equal(saved.assignments.ended.sessionId,start);
    });
  }
});
