const {test}=require('node:test');
const assert=require('node:assert/strict');
const {app,fixture,fakeDb,contextFor}=require('./helpers/scoped-runtime.cjs');
test('banai saves the session and assignment once and does not retry a rejected write',async()=>{
  for(const denied of [false,true]){
    const state=fixture(),db=fakeDb(state,denied?async()=>{throw Object.assign(new Error('denied'),{code:'PERMISSION_DENIED'});}:null),ctx=contextFor(db,state);
    const session={...state.sessions.t1,items:[{id:'banai',isBanaiShimei:true}]};
    const promise=ctx.guardedSessionNodeUpdate('t1',session,{'pos-dev/sessions/t1':session,'pos-dev/assignments/a1':{...state.assignments.a1,type:'banai'}},{expectedRecords:{'assignments/a1':state.assignments.a1}});
    if(denied){await assert.rejects(promise,/scoped conflict/);assert.equal(ctx.S.sessions.t1._rev,4);assert.equal(db.writes.length,0);}
    else{await promise;assert.equal(db.writes.length,1);assert.equal(ctx.S.sessions.t1._rev,5);assert.equal(ctx.S.assignments.a1._rev,8);assert.equal(db.writes[0]['pos-dev/_scopedOperation'].records.sessions.t1.rev,4);}
  }
  const source=app.slice(app.indexOf('async function addBanai'),app.indexOf('function applyET'));
  assert.match(source,/markOptimisticPaths\(updates\)[\s\S]*applyLocalRootUpdates\(updates\)[\s\S]*closeM\(\)/);
  assert.match(source,/restoreLocalRootSnapshot\(localSnapshot\)/);
  assert.doesNotMatch(source,/fastNodeUpdate|guardedRootTransaction/);
});
