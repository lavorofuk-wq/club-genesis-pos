const {test}=require('node:test');
const assert=require('node:assert/strict');
const rules=require('../database.rules.json');
const {clone,fixture,fakeDb,contextFor,emulator}=require('./helpers/scoped-runtime.cjs');

test('cashier destructive writes cannot inherit a history or sessions ancestor grant',()=>{
  for(const root of ['pos','pos-dev']){
    for(const collection of ['history','sessions']){
      assert.match(rules.rules[root][collection]['.write'],/== 'op'/);
      assert.doesNotMatch(rules.rules[root][collection]['.write'],/== 'list'/);
      assert.match(rules.rules[root][collection]['.write'],/!data\.exists\(\) && !newData\.exists\(\)/,'cashier parent grant only clears an already empty collection');
    }
    assert.match(rules.rules[root].history.$id['.write'],/newData\.exists\(\)/);
    assert.match(rules.rules[root].sessions.$tableId['.write'],/child\('sessionMoves'\)/);
  }
});

function currentState(){
  return {...fixture(),tables:[{id:'t1',label:'1'},{id:'t2',label:'2'}],
    history:{old:{id:'old',tableId:'t2',startTime:10,endTime:20,total:2000,_rev:1}}};
}
function setup(db,state,root='pos-dev',role='cashier'){
  const ctx=contextFor(db,state);ctx.FB_ROOT=root;ctx.window._posRole=role;
  ctx.withWriteGate=updates=>({...updates,[root+'/_writeGate']:{versionNum:616200,nonce:Math.random().toString()}});
  return ctx;
}
async function payloadFor(state,operation){
  const db=fakeDb(clone(state)),ctx=setup(db,state,'pos-dev','op');
  if(operation==='delete')await ctx.guardedCloseSession('t1',clone(state.sessions.t1));
  else if(operation==='checkout')await ctx.guardedCloseSession('t1',clone(state.sessions.t1),
    {id:123,tableId:'t1',sessionId:state.sessions.t1.sessionId,startTime:state.sessions.t1.startTime,endTime:500,total:6000});
  else await ctx.guardedAtomicTableChange('t1','t2',clone(state.sessions.t1));
  assert.equal(db.writes.length,1);return db.writes[0];
}
async function historyPayload(state,desired){
  const db=fakeDb(clone(state)),ctx=setup(db,state,'pos-dev','op');
  await ctx.guardedHistoryRecordUpdate(clone(state.history.old),desired);
  assert.equal(db.writes.length,1);return db.writes[0];
}
const forRoot=(payload,root)=>Object.fromEntries(Object.entries(payload).map(([key,value])=>[key.replace(/^pos-dev\//,root+'/'),value]));

test('database denies cashier deletion and restoration bypasses while keeping checkout and both table moves',
  {skip:process.env.POS_RULES_EMULATOR!=='1'},async t=>{
  const cashier=await emulator('demo-pos-cashier-destructive','cashier');
  const op=await emulator('demo-pos-cashier-destructive','op');
  const access={authorizedUsers:{cashier:true,op:true},roles:{cashier:'cashier',op:'op'}};
  const reset=state=>op.request('','PUT',{access,pos:clone(state),'pos-dev':clone(state)},true);
  const saved=root=>op.request(root,'GET',undefined,true);
  const denied=promise=>assert.rejects(promise,error=>error.code==='PERMISSION_DENIED');
  const gated=(root,updates)=>({...updates,[root+'/_writeGate']:{versionNum:616200,nonce:Math.random().toString()}});

  for(const root of ['pos','pos-dev']){
    await t.test(root+' cashier cannot hollow out history while payment, receipt flags and cast names remain editable',async()=>{
      const state=currentState();
      Object.assign(state.history.old,{sessionId:'past-session',guests:2,subtotal:1800,tax:200,rate:0.1,
        payMethod:'cash',receiptIssued:true,items:[{id:'drink',castId:'c1',castName:'Before',price:1800,qty:1}]});
      const mutations=[['metadata only',()=>({})],['total altered',record=>({...record,total:1})],
        ...['id','tableId','sessionId','startTime','endTime','guests','total','subtotal','tax','rate','items'].map(key=>[key+' removed',record=>{delete record[key];return record;}])];
      for(const [label,mutate] of mutations){
        const payload=forRoot(await historyPayload(state,mutate(clone(state.history.old))),root);
        await reset(state);const before=await saved(root);
        await denied(cashier.request('','PATCH',payload));
        assert.deepEqual(await saved(root),before,label);
      }
      for(const operation of ['payment','receipt','cast-name']){
        const desired=clone(state.history.old);
        if(operation==='payment'){desired.payMethod='card';desired.splits=[{method:'card',amount:2000}];delete desired.receiptIssued;}
        if(operation==='receipt')desired.receiptIssued=false;
        if(operation==='cast-name')desired.items[0].castName='After';
        const payload=forRoot(await historyPayload(state,desired),root);
        await reset(state);await cashier.request('','PATCH',payload);
        const record=(await saved(root)).history.old;
        assert.equal(record.total,2000);assert.equal(record._rev,2);
        if(operation==='payment'){assert.equal(record.payMethod,'card');assert.equal(record.receiptIssued,undefined);}
        if(operation==='receipt')assert.equal(record.receiptIssued,false);
        if(operation==='cast-name')assert.equal(record.items[0].castName,'After');
      }
      const legacy=currentState(),desired={...legacy.history.old,payMethod:'card'};
      await reset(legacy);await cashier.request('','PATCH',forRoot(await historyPayload(legacy,desired),root));
      assert.equal((await saved(root)).history.old.payMethod,'card','legacy optional fields stay compatible');
    });

    for(const legacy of [false,true])await t.test(root+' rejects leaf, collection and whole-root history/session deletion'+(legacy?' without capabilities':''),async()=>{
      const state=currentState();if(legacy)delete state._capabilities;
      await reset(state);const before=await saved(root);
      for(const target of ['history/old','history','sessions/t1','sessions']){
        await denied(cashier.request('','PATCH',gated(root,{[root+'/'+target]:null})));
        assert.deepEqual(await saved(root),before,target);
      }
      await denied(cashier.request(root,'PUT',{...state,history:null,sessions:null,_writeGate:{versionNum:616200,nonce:'replace-root'}}));
      assert.deepEqual(await saved(root),before);
    });

    await t.test(root+' cashier cannot replay a fully valid OP session cancellation',async()=>{
      const state=currentState(),payload=forRoot(await payloadFor(state,'delete'),root);
      await reset(state);const before=await saved(root);
      await denied(cashier.request('','PATCH',payload));assert.deepEqual(await saved(root),before);
      await op.request('','PATCH',payload);
      assert.equal((await saved(root)).sessions,undefined,'OP cancellation remains available');
    });

    for(const operation of ['checkout','move','scoped-move'])await t.test(root+' cashier '+operation+' keeps the session accounted for',async()=>{
      const state=currentState();
      if(operation==='scoped-move'){
        state.sessions.t1.sessionId='ses_100_original';state.sessions.t1.startTime=200;
        state.assignments.a1.endTime=300;
      }
      const payload=forRoot(await payloadFor(state,operation),root);
      await reset(state);await cashier.request('','PATCH',payload);
      const remote=await saved(root);
      assert.equal(remote.sessions?.t1,undefined);
      if(operation==='checkout'){
        assert.equal(remote.history['123'].total,6000);assert.equal(remote.tablePreparations.t1.sessionId,'123');
      }else{
        assert.equal(remote.sessions.t2.sessionId,state.sessions.t1.sessionId);
        assert.equal(remote.sessions.t2.startTime,state.sessions.t1.startTime);
        assert.equal(remote.assignments.a1.tableId,'t2');
      }
      if(operation==='scoped-move'){
        assert.equal(payload[root+'/_scopedOperation'].sessionMoves.t1,'t2');
        assert.equal(remote.assignments.a1.sessionId,200);
      }
    });

    for(const changed of ['missing-proof','wrong-target','changed-identity'])await t.test(root+' denies scoped table move '+changed+' without partial deletion',async()=>{
      const state=currentState();state.sessions.t1.sessionId='ses_100_original';state.sessions.t1.startTime=200;state.assignments.a1.endTime=300;
      const payload=forRoot(await payloadFor(state,'scoped-move'),root);
      if(changed==='missing-proof')delete payload[root+'/_scopedOperation'].sessionMoves;
      if(changed==='wrong-target')payload[root+'/_scopedOperation'].sessionMoves.t1='missing';
      if(changed==='changed-identity')payload[root+'/sessions/t2'].sessionId='another-session';
      await reset(state);const before=await saved(root);
      await denied(cashier.request('','PATCH',payload));assert.deepEqual(await saved(root),before);
      if(changed==='missing-proof'){
        await op.request('','PATCH',payload);
        assert.equal((await saved(root)).sessions.t2.sessionId,state.sessions.t1.sessionId,'OP supports older move clients');
      }
    });
  }
});
