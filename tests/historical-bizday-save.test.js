const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,fakeDb,contextFor,clone}=require('./helpers/scoped-runtime.cjs');
test('closed day edits read and revise only the chosen day and summary',async()=>{
  const state=fixture();state.activeBizDay=null;state.bizDays={d1:{id:'d1',date:'d1',history:[{total:1000}]},d2:{id:'d2',history:[{total:2000}]}};
  const expected=clone(state.bizDays.d1),db=fakeDb(state),ctx=contextFor(db,state);
  ctx.S.bizDays.d2.history[0].total=99999;
  await ctx.guardedReplaceClosedBizDay('d1',expected,{...expected,history:[{total:1500}]});
  assert.equal(state.bizDays.d2.history[0].total,2000);assert.equal(ctx.S.bizDays.d2.history[0].total,99999);
  assert.equal(ctx.S.bizDays.d1._rev,1);assert.equal(ctx.S.bizDaySummaries.d1._dayRev,1);
  assert.ok(db.reads.every(r=>!r.key.endsWith('/bizDays')&&!r.key.endsWith('/d2')));
  await assert.rejects(ctx.guardedReplaceClosedBizDay('d1',expected,expected));
  state.activeBizDay='d1';
  await assert.rejects(ctx.guardedReplaceClosedBizDay('d1',state.bizDays.d1,null));
  assert.equal(db.writes.length,1);
});
