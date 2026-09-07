const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,fakeDb,contextFor}=require('./helpers/scoped-runtime.cjs');
test('completed shift deletion reads only its record and active business day',async()=>{
  const state=fixture();state.shifts.s1.clockOut=200;
  const db=fakeDb(state),ctx=contextFor(db,state);
  await ctx.guardedShiftDelete('s1',state.shifts.s1);
  assert.deepEqual(db.reads.map(r=>r.key).sort(),['pos-dev/activeBizDay','pos-dev/shifts/s1']);
  assert.equal(db.writes.length,1);assert.equal(ctx.S.shifts.s1,undefined);
  assert.equal(db.writes[0]['pos-dev/_scopedOperation'].records.shifts.s1.rev,2);
});
test('active shift deletion queries only its cast and advances the membership revision',async()=>{
  const state=fixture();state.assignments={};
  const db=fakeDb(state),ctx=contextFor(db,state);
  await ctx.guardedShiftDelete('s1',state.shifts.s1);
  assert.equal(db.writes.length,1);assert.equal(ctx.S.shifts.s1,undefined);
  assert.equal(state._castShiftRevisions.c1,1);
  assert.ok(db.reads.some(r=>r.field==='castId'&&r.filter==='c1'));
});
test('shift deletion rejects active assignment and stale revision before writing',async()=>{
  for(const stale of [false,true]){
    const state=fixture(),expected={...state.shifts.s1};
    if(stale){state.assignments={};expected._rev--;}
    const db=fakeDb(state),ctx=contextFor(db,state);
    await assert.rejects(ctx.guardedShiftDelete('s1',expected));
    assert.equal(db.writes.length,0);assert.ok(ctx.S.shifts.s1);
  }
});
