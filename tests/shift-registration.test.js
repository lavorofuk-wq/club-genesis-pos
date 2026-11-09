const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {clone,contextFor,emulator,fakeDb,fixture,source}=require('./helpers/scoped-runtime.cjs');

const DAY='2026-10-02',NEXT='2026-10-03';
function attendanceState(){
  return {...fixture(),activeBizDay:DAY,shifts:{},assignments:{},casts:[
    {id:101,name:'QA Cast',castType:'regular'},
    {id:102,name:'QA Cast',castType:'regular'}
  ]};
}
function attendanceContext(db,state){
  const ctx=contextFor(db,state),alerts=[];
  Object.assign(ctx,{
    alert:message=>alerts.push(message),confirm:()=>true,
    normalizeCastType:castType=>castType,
    withDataOperation:(_key,operation)=>operation()
  });
  vm.runInContext(source('let shiftMd=','function exportShiftCSV'),ctx);
  return {ctx,alerts};
}

test('clock-in refuses a closed shift from Firebase even if the local picker is stale',async()=>{
  for(const castId of [101,'101']){
    const state=attendanceState();
    state.shifts.old={id:'old',castId,castName:'QA Cast',clockIn:100,clockOut:200};
    const before=clone(state.shifts),db=fakeDb(state);
    const {ctx,alerts}=attendanceContext(db,{...state,shifts:{}});
    await ctx.clockIn(101,'01:00');
    assert.equal(db.writes.length,0);
    assert.deepEqual(state.shifts,before);
    assert.match(alerts[0],/退勤済み.*退勤取消/);
    const revisionRead=db.reads.findIndex(r=>r.key==='pos-dev/_castShiftRevisions/101');
    const shiftQuery=db.reads.findIndex(r=>r.key==='pos-dev/shifts'&&r.field==='castId');
    assert.ok(revisionRead>=0&&revisionRead<shiftQuery);
    assert.deepEqual(db.reads.filter(r=>r.key==='pos-dev/shifts').map(r=>r.filter),['101',101]);
  }
});

test('other cast IDs and the next business day can clock in, and undo reuses the original record',async()=>{
  const state=attendanceState(),db=fakeDb(state),{ctx,alerts}=attendanceContext(db,state);
  await ctx.clockIn(101,'20:00');
  const [id]=Object.keys(state.shifts);
  assert.equal(state.shifts[id].castId,101);
  await ctx.clockOut(id,'22:00');
  assert.ok(state.shifts[id].clockOut);
  await ctx.clockIn(102,'22:00');
  assert.equal(Object.values(state.shifts).filter(sh=>sh.castId===102).length,1);
  await ctx.cancelClockOut(id);
  assert.equal(Object.values(state.shifts).filter(sh=>sh.castId===101).length,1);
  assert.equal(state.shifts[id].clockOut,undefined);
  await ctx.clockOut(id,'23:00');

  state.bizDays[DAY]={id:DAY,shifts:clone(state.shifts)};
  state.activeBizDay=NEXT;state.shifts={};
  ctx.S.activeBizDay=NEXT;ctx.S.shifts={};
  await ctx.clockIn('101','20:00');
  assert.equal(Object.values(state.shifts).length,1);
  assert.equal(Object.values(state.shifts)[0].castId,101);
  assert.ok(state.bizDays[DAY].shifts[id].clockOut);
  assert.deepEqual(alerts,[]);
});

test('Firebase accepts only one of two simultaneous clock-ins for the same cast',{
  skip:process.env.POS_RULES_EMULATOR!=='1',timeout:10000
},async()=>{
  const em=await emulator('demo-pos-shift-registration');
  const state=attendanceState();
  await em.reset(state);
  let markReady,resume;
  const ready=new Promise(resolve=>{markReady=resolve;});
  const gate=new Promise(resolve=>{resume=resolve;});
  const stale=attendanceContext(em.db(async()=>{markReady();await gate;}),state);
  const winner=attendanceContext(em.db(),state);
  const pending=stale.ctx.clockIn(101,'20:00');
  try{
    await Promise.race([ready,pending]);
    assert.deepEqual(stale.alerts,[]);
    await winner.ctx.clockIn('101','20:15');
    assert.deepEqual(winner.alerts,[]);
  }finally{resume();}
  await pending;

  const shifts=await em.request('pos-dev/shifts');
  assert.equal(Object.values(shifts).length,1);
  assert.equal(Object.values(shifts)[0].castId,101);
  assert.equal(await em.request('pos-dev/_castShiftRevisions/101'),1);
  assert.match(stale.alerts[0],/他端末で変更/);
});
