const {test}=require('node:test');
const assert=require('node:assert/strict');
const {clone,fixture,fakeDb,contextFor,emulator}=require('./helpers/scoped-runtime.cjs');
const {applyAccessRules}=require('../scripts/access-rules.cjs');
const {applyScopedRules}=require('../scripts/scoped-rules.cjs');
const document=require('../database.rules.json');

test('attendance grants require an open day and fresh scoped proof, with only lifecycle ancestor grants',()=>{
  for(const name of ['pos','pos-dev']){
    const rules=document.rules[name];
    assert.match(rules['.write'],/child\('type'\).val\(\) == 'reopen'/);
    assert.match(rules['.write'],/child\('expectedActiveBizDay'\)/);
    assert.match(rules.shifts['.write'],/child\('activeBizDay'\).isString\(\)/);
    assert.match(rules.shifts['.write'],/child\('_scopedOperation\/expectedActiveBizDay'\)/);
    assert.match(rules.shifts.$shiftId['.write'],/child\('_scopedOperation\/expectedActiveBizDay'\)/);
    assert.match(rules.shifts.$shiftId['.validate'],/child\('_scopedOperation\/records\/shifts'\)/);
    assert.match(rules.$other['.write'],/== 'op'/);
    assert.doesNotMatch(rules.$other['.write'],/== 'cashier'|== 'list'/);
  }
  assert.deepEqual(applyAccessRules(document),document);
  assert.deepEqual(applyScopedRules(document),document);
  assert.deepEqual(applyScopedRules(applyAccessRules(document)),document);
});

test('Firebase denies closed attendance and stale day writes without breaking normal operation',{skip:process.env.POS_RULES_EMULATOR!=='1'},async t=>{
  const clients={};
  for(const role of ['op','cashier','list'])clients[role]=await emulator('demo-pos-closed-attendance',role);
  const admin=clients.op;
  const access={authorizedUsers:{op:true,cashier:true,list:true},roles:{op:'op',cashier:'cashier',list:'list'}};
  const denied=promise=>assert.rejects(promise,error=>error.code==='PERMISSION_DENIED');
  const saved=root=>admin.request(root,'GET',undefined,true);
  async function reset(state){await admin.request('','PUT',{access:clone(access),pos:clone(state),'pos-dev':clone(state)},true);}
  async function prepare(state,kind){
    // Create the actual application payload while open; replaying it while closed
    // tests the server independently of the client-side availability guard.
    const opened={...clone(state),activeBizDay:'2026-09-08',shifts:clone(state.shifts)||{}};
    const db=fakeDb(clone(opened)),ctx=contextFor(db,opened);
    const id=kind==='create'?'s2':'s1';
    const previous=opened.shifts?.[id]||null;
    const value=kind==='create'?{id,castId:'c2',clockIn:120,status:'waiting'}:
      kind==='delete'?null:
      kind==='clockOut'?{...previous,clockOut:500,status:'off'}:{...previous,clockIn:80};
    await ctx.guardedCheckedNodeUpdate({['pos-dev/shifts/'+id]:value},null,{expectedRecords:{['shifts/'+id]:previous}});
    return db.writes[0];
  }
  function forRoot(payload,root){return Object.fromEntries(Object.entries(clone(payload)).map(([key,value])=>[key.replace(/^pos-dev\//,root+'/'),value]));}

  await t.test('every role is denied create, edit, clock-out and delete with null/null business-day proof',async()=>{
    for(const root of ['pos','pos-dev'])for(const role of ['op','cashier','list'])for(const kind of ['create','edit','clockOut','delete']){
      const state=fixture();state.activeBizDay=null;
      const original=clone(state.shifts);
      await reset(state);
      const payload=forRoot(await prepare(state,kind),root);
      payload[root+'/_scopedOperation'].expectedActiveBizDay=null;
      await denied(clients[role].request('','PATCH',payload));
      assert.deepEqual((await saved(root)).shifts,original,root+' '+role+' '+kind+' is atomic');
      assert.equal((await saved(root))._scopedOperation,undefined);
    }
  });

  await t.test('closed empty days, missing capabilities and stored old lifecycle proof do not allow registration',async()=>{
    for(const variant of ['empty','legacy','previous-start'])for(const role of ['op','cashier','list']){
      const state=fixture();state.activeBizDay=null;state.shifts=null;
      if(variant==='legacy')delete state._capabilities;
      if(variant==='previous-start')state._bizDayOperation={version:614400,type:'start',nonce:'old',dayId:'2026-09-08',nextActiveBizDay:'2026-09-08'};
      await reset(state);
      const payload=await prepare(state,'create');payload['pos-dev/_scopedOperation'].expectedActiveBizDay=null;
      await denied(clients[role].request('','PATCH',payload));
      assert.equal((await saved('pos-dev')).shifts,undefined);
    }
  });

  await t.test('closed direct child writes, field removal, collection clear and OP ancestor replacement cannot bypass the guard',async()=>{
    const state=fixture();state.activeBizDay=null;
    for(const role of ['op','cashier','list']){
      await reset(state);
      for(const [path,method,value] of [
        ['shifts/s2','PUT',{id:'s2',castId:'c2',clockIn:120}],
        ['shifts/s1/clockIn','PUT',80],['shifts/s1/castId','DELETE'],
        ['shifts/s1','DELETE'],['shifts','DELETE']
      ])await denied(clients[role].request('pos-dev/'+path,method,value));
      await denied(clients[role].request('','PATCH',{'pos-dev/shifts':null,'pos-dev/_writeGate':{versionNum:614400,nonce:'closed-clear'}}));
      const replacement={...clone(state),shifts:{s2:{id:'s2',castId:'c2',clockIn:120}},_writeGate:{versionNum:614400,nonce:'root-replace'}};
      await denied(clients[role].request('pos-dev','PUT',replacement));
      assert.deepEqual((await saved('pos-dev')).shifts,state.shifts);
    }
  });

  await t.test('fresh lifecycle metadata without an actual business-day transition cannot authorize closed attendance',async()=>{
    for(const role of ['op','cashier','list'])for(const type of ['start','reopen','end']){
      const state=fixture();state.activeBizDay=null;await reset(state);
      const payload=await prepare(state,'create');
      payload['pos-dev/_scopedOperation'].expectedActiveBizDay=null;
      payload['pos-dev/_bizDayOperation']={version:614400,nonce:'forged-'+role+'-'+type,type,
        dayId:'2026-09-08',expectedActiveBizDay:null,nextActiveBizDay:null,
        expectedDayExists:false,expectedDayRev:0,expectedDayCounter:0,updatedAt:Date.now()};
      await denied(clients[role].request('','PATCH',payload));
      assert.deepEqual((await saved('pos-dev')).shifts,state.shifts);
      assert.equal((await saved('pos-dev'))._bizDayOperation,undefined);
    }
  });

  await t.test('open attendance cannot omit its scoped proof or replay an already accepted proof',async()=>{
    for(const role of ['op','cashier','list'])for(const kind of ['create','delete']){
      const state=fixture();await reset(state);
      const payload=await prepare(state,kind),missing=clone(payload);
      delete missing['pos-dev/_scopedOperation'];
      await denied(clients[role].request('','PATCH',missing));
      await clients[role].request('','PATCH',payload);
      const replay=clone(payload);replay['pos-dev/_writeGate'].nonce='replay-'+role+'-'+kind;
      await denied(clients[role].request('','PATCH',replay));
    }
  });

  await t.test('all roles retain open create, edit, clock-out and delete with the existing atomic protocol',async()=>{
    for(const root of ['pos','pos-dev'])for(const role of ['op','cashier','list'])for(const kind of ['create','edit','clockOut','delete']){
      const state=fixture();await reset(state);
      const payload=forRoot(await prepare(state,kind),root);
      await clients[role].request('','PATCH',payload);
      const result=await saved(root);
      if(kind==='create')assert.equal(result.shifts.s2.castId,'c2');
      if(kind==='edit')assert.equal(result.shifts.s1.clockIn,80);
      if(kind==='clockOut')assert.equal(result.shifts.s1.clockOut,500);
      if(kind==='delete')assert.equal(result.shifts,undefined);
    }
  });

  await t.test('close and different-day races reject both inserts and deletes before any partial update',async()=>{
    for(const role of ['op','cashier','list'])for(const nextDay of [null,'2026-09-09'])for(const kind of ['create','delete']){
      const state=fixture(),payload=await prepare(state,kind);
      state.activeBizDay=nextDay;await reset(state);
      await denied(clients[role].request('','PATCH',payload));
      assert.deepEqual((await saved('pos-dev')).shifts,state.shifts);
      assert.equal((await saved('pos-dev'))._castShiftRevisions,undefined);
    }
  });

  await t.test('non-attendance settings and archived business-day edits remain available while closed',async()=>{
    const state=fixture();state.activeBizDay=null;
    state.bizDays={old:{id:'old',date:'old',endedAt:200,shifts:{s1:{clockIn:1}}}};
    await reset(state);
    for(const role of ['op','cashier'])await clients[role].request('','PATCH',{
      'pos-dev/loMode':true,'pos-dev/_writeGate':{versionNum:614400,nonce:'closed-setting-'+role}
    });
    await clients.op.request('','PATCH',{
      'pos-dev/bizDays/old/shifts/s1/clockIn':2,
      'pos-dev/gmsExportMeta/example':{archived:true},
      'pos-dev/_writeGate':{versionNum:614400,nonce:'closed-archive'}
    });
    const result=await saved('pos-dev');
    assert.equal(result.bizDays.old.shifts.s1.clockIn,2);
    assert.deepEqual(result.gmsExportMeta.example,{archived:true});
    assert.deepEqual(result.shifts,state.shifts);
  });
});
