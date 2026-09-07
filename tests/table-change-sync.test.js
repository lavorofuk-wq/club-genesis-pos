const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const clone=value=>value==null?null:JSON.parse(JSON.stringify(value));
const get=(root,key)=>String(key).split('/').filter(Boolean).reduce((v,k)=>v?.[k],root);
function put(root,key,value){
  const keys=String(key).split('/').filter(Boolean);
  const last=keys.pop();
  const parent=keys.reduce((v,k)=>v[k]||(v[k]={}),root);
  if(value==null)delete parent[last];else parent[last]=clone(value);
}
function fixture(){
  return{
    sessions:{t1:{tableId:'t1',sessionId:'s1',startTime:100,_rev:4,items:[{id:'drink',price:2000,qty:3}]}},
    assignments:{
      a1:{id:'a1',tableId:'t1',castId:'c1',sessionId:100,startTime:110,type:'free',_rev:7},
      a2:{id:'a2',tableId:'t1',castId:'c2',sessionId:100,startTime:120,endTime:150,type:'banai',_rev:2},
      old:{id:'old',tableId:'t1',castId:'c3',sessionId:10,startTime:10,endTime:50,_rev:1},
      other:{id:'other',tableId:'t3',castId:'c4',sessionId:200,startTime:200,_rev:1}
    },
    activeBizDay:'2026-09-08',
    _capabilities:{tableChangeAtomicValidationVersion:614300},
    _tableAssignmentRevisions:{t1:3,t2:2}
  };
}
function contextFor(db,state=fixture()){
  const context={
    APP_VERSION:'6.143',FB_ROOT:'pos-dev',TABLE_CHANGE_ATOMIC_VALIDATION_VERSION:614300,
    tableChangeAtomicValidationVersion:614300,tableChangeBusy:false,
    S:clone(state),at:'t1',md:'tc',sessionSaveStates:{},
    performance,console,Date,Promise,Set,window:{_db:db},
    POS_SYNC:require('../sync-core.js'),cloneData:clone,
    requireFirebaseReady:()=>true,_verNum:()=>614300,
    getPathValue:get,setPathValue:put,
    versionedRecordPathInfo:key=>{const relative=key.replace(/^pos-dev\//,'');const [collection,id]=relative.split('/');return collection==='assignments'?{collection,id,relative}:null;},
    recordConflictMessage:()=> 'record conflict',
    sameSession:(remote,expected)=>remote.sessionId===expected.sessionId&&remote.startTime===expected.startTime&&remote._rev===expected._rev,
    sameSessionIdOnly:(remote,expected)=>!!remote&&remote.sessionId===expected.sessionId&&remote.startTime===expected.startTime,
    ensureSessionId:s=>s.sessionId?s:{...s,sessionId:'legacy-id'},
    isFirebasePermissionDenied:error=>error.code==='PERMISSION_DENIED',
    withWriteGate:updates=>({...updates,'pos-dev/_writeGate':{versionNum:614300,nonce:Math.random().toString()}}),
    syncRemoteSession:(id,value)=>put(context.S,'sessions/'+id,value),
    syncVersionedRecordsFromPrepared:updates=>Object.entries(updates).filter(([p])=>p.startsWith('pos-dev/assignments/')).forEach(([p,v])=>put(context.S,p.slice(8),v)),
    withDataOperation:async(key,fn)=>fn(),waitForSessionSaveQueue:async()=>{},
    isPendingAssignment:()=>false,rModal:()=>{},sbs:()=>{},closeM:()=>{context.md=null;},render:()=>{},refreshFloorModal:()=>{},
    alert:message=>context.alerts.push(message),alerts:[]
  };
  vm.createContext(context);
  vm.runInContext(app.slice(app.indexOf('function prepareVersionedRecordUpdates'),app.indexOf('function syncVersionedRecordsFromRoot')),context);
  vm.runInContext(app.slice(app.indexOf('function tableChangeAssignments'),app.indexOf('// ===== RENDER ENGINE =====')),context);
  return context;
}
function fakeDb(state){
  const reads=[],writes=[];
  return{reads,writes,ref(refPath){
    let field,filter;
    return{
      orderByChild(value){field=value;return this;},equalTo(value){filter=value;return this;},
      async get(){
        reads.push(refPath);
        let value=get({'pos-dev':state},refPath);
        if(field)value=Object.fromEntries(Object.entries(value||{}).filter(([,v])=>v[field]===filter));
        const snapshot=clone(value);
        return{val:()=>snapshot};
      },
      async update(updates){writes.push(clone(updates));}
    };
  }};
}
test('TC moves only the two sessions and matching assignments in one write',async()=>{
  const state=fixture(),db=fakeDb(state),context=contextFor(db,state);
  await context.guardedAtomicTableChange('t1','t2',state.sessions.t1);
  assert.equal(db.writes.length,1);
  const update=db.writes[0];
  assert.equal(update['pos-dev/sessions/t1'],null);
  assert.deepEqual(update['pos-dev/sessions/t2'].items,state.sessions.t1.items);
  assert.equal(update['pos-dev/sessions/t2'].sessionId,'s1');
  assert.equal(update['pos-dev/assignments/a1']._rev,8);
  assert.equal(update['pos-dev/assignments/a2'].tableId,'t2');
  assert.equal(update['pos-dev/assignments/old'],undefined);
  assert.equal(update['pos-dev/assignments/other'],undefined);
  assert.ok(db.reads.every(p=>p!=='pos-dev'&&!p.includes('bizDays')&&!p.includes('history')));
  assert.ok(db.reads.indexOf('pos-dev/_tableAssignmentRevisions/t1')<db.reads.indexOf('pos-dev/assignments'));
  assert.equal(context.S.sessions.t1,undefined);
  assert.equal(context.S.sessions.t2.tableId,'t2');
});
test('TC refuses a stale source or occupied target without writing',async()=>{
  for(const occupied of [false,true]){
    const state=fixture(),db=fakeDb(state),context=contextFor(db,state),expected=clone(state.sessions.t1);
    if(occupied)state.sessions.t2={sessionId:'other'};else state.sessions.t1._rev++;
    await assert.rejects(context.guardedAtomicTableChange('t1','t2',expected));
    assert.equal(db.writes.length,0);
  }
});
test('TC uses the latest queued order and blocks duplicate clicks while waiting',async()=>{
  const state=fixture(),db=fakeDb(state),context=contextFor(db,state);
  let release;
  context.waitForSessionSaveQueue=id=>id==='t1'?new Promise(resolve=>{release=()=>{
    state.sessions.t1.items.push({id:'queued',price:5000,qty:1});state.sessions.t1._rev++;
    context.S.sessions.t1=clone(state.sessions.t1);resolve();
  };}):Promise.resolve();
  const first=context.tableChange('t2');
  assert.equal(context.tableChangeBusy,true);
  await context.tableChange('t3');
  release();await first;
  assert.equal(db.writes.length,1);
  assert.equal(db.writes[0]['pos-dev/sessions/t2'].items.length,2);
  assert.equal(context.at,'t2');
  assert.equal(context.tableChangeBusy,false);
});
test('TC preserves the source and allows retry after a save failure',async()=>{
  const state=fixture(),db=fakeDb(state),originalRef=db.ref;
  db.ref=p=>{const ref=originalRef(p);ref.update=async()=>{throw new Error('network error');};return ref;};
  const context=contextFor(db,state);
  await context.tableChange('t2');
  assert.equal(context.at,'t1');
  assert.deepEqual(clone(context.S.sessions.t1),state.sessions.t1);
  assert.equal(context.S.sessions.t2,undefined);
  assert.equal(context.tableChangeBusy,false);
  assert.equal(context.md,'tc');
  assert.equal(context.alerts.length,1);
});
test('TC does not move after a failed queued order',async()=>{
  const state=fixture(),db=fakeDb(state),context=contextFor(db,state);
  context.sessionSaveStates.t1={status:'error'};
  await context.tableChange('t2');
  assert.equal(db.writes.length,0);
  assert.equal(context.at,'t1');
  assert.equal(context.tableChangeBusy,false);
});
test('normal cast assignment reads and advances its table membership revision',async()=>{
  const state=fixture(),db=fakeDb(state),context=contextFor(db,state),reads=[];
  context.readRemoteRelative=async key=>{reads.push(key);return clone(get(state,key));};
  context.applyRootUpdates=(root,updates)=>{Object.entries(updates).forEach(([key,v])=>put(root,key.replace(/^pos-dev\//,''),v));return root;};
  vm.runInContext(app.slice(app.indexOf('async function guardedCheckedNodeUpdate'),app.indexOf('const optimisticRootPaths')),context);
  await context.guardedCheckedNodeUpdate({'pos-dev/assignments/new':{id:'new',tableId:'t1',castId:'new-cast',sessionId:100,startTime:160}},()=>true,{createRecords:['assignments/new']});
  assert.ok(reads.includes('_tableAssignmentRevisions/t1'));
  assert.equal(db.writes[0]['pos-dev/_tableAssignmentRevisions/t1'],4);
});

// This suite never connects to the live Firebase project.
test('TC Firebase rules reject races atomically',{skip:process.env.POS_RULES_EMULATOR!=='1'},async t=>{
  const endpoint='http://127.0.0.1:9017';
  const namespace='demo-pos-table-change';
  const token=Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:'tc-test',user_id:'tc-test',aud:namespace,iss:'https://securetoken.google.com/'+namespace,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.';
  async function request(key,method='GET',value,admin=false,query={}){
    const url=new URL(endpoint+'/'+key.replace(/^\//,'')+'.json');
    url.searchParams.set('ns',namespace);
    if(!admin)url.searchParams.set('auth',token);
    for(const [k,v] of Object.entries(query))url.searchParams.set(k,JSON.stringify(v));
    const response=await fetch(url,{method,headers:{'content-type':'application/json',...(admin?{Authorization:'Bearer owner'}:{})},body:value===undefined?undefined:JSON.stringify(value)});
    const result=await response.json();
    if(!response.ok)throw Object.assign(new Error(JSON.stringify(result)),{code:response.status===401||response.status===403?'PERMISSION_DENIED':String(response.status)});
    return result;
  }
  const rules=JSON.parse(fs.readFileSync(path.join(__dirname,'..','database.rules.json'),'utf8'));
  await request('.settings/rules','PUT',rules,true);
  const reset=async(state=fixture())=>request('','PUT',{access:{authorizedUsers:{'tc-test':true}},'pos-dev':state},true);
  function restDb(beforeWrite){return{ref(key){let field,filter;return{
    orderByChild(value){field=value;return this;},equalTo(value){filter=value;return this;},
    async get(){const value=await request(key,'GET',undefined,false,field?{orderBy:field,equalTo:filter}:{});return{val:()=>value};},
    async update(updates){if(beforeWrite)await beforeWrite();return request('','PATCH',updates);}
  };}};}
  await t.test('move succeeds and later unrelated root writes still work',async()=>{
    await reset();const context=contextFor(restDb());
    await context.guardedAtomicTableChange('t1','t2',fixture().sessions.t1);
    const state=await request('pos-dev','GET',undefined,true);
    assert.equal(state.sessions.t1,undefined);assert.equal(state.sessions.t2.items[0].qty,3);
    assert.equal(state.assignments.a1.tableId,'t2');assert.equal(state.assignments.old.tableId,'t1');
    state._writeGate={versionNum:614300,nonce:'later-root-write'};state.loMode=true;
    await request('pos-dev','PUT',state);
  });
  for(const change of ['order','destination','assignment','new-assignment','business-day']){
    await t.test('rejects concurrent '+change,async()=>{
      await reset();
      const db=restDb(async()=>{
        if(change==='order')await request('pos-dev/sessions/t1/_rev','PUT',5,true);
        if(change==='destination')await request('pos-dev/sessions/t2','PUT',{sessionId:'other',startTime:500,_rev:1},true);
        if(change==='assignment')await request('pos-dev/assignments/a1/_rev','PUT',8,true);
        if(change==='new-assignment'){
          const context=contextFor(null),state=fixture();
          const updates=context.prepareVersionedRecordUpdates(state,{'pos-dev/assignments/new':{id:'new',tableId:'t1',castId:'new-cast',sessionId:100,startTime:160}},{createRecords:['assignments/new']});
          await request('','PATCH',context.withWriteGate(updates));
        }
        if(change==='business-day')await request('pos-dev/activeBizDay','PUT','different-day',true);
      });
      await assert.rejects(contextFor(db).guardedAtomicTableChange('t1','t2',fixture().sessions.t1),error=>error.message==='table change conflict');
      const state=await request('pos-dev','GET',undefined,true);
      assert.equal(state.sessions.t1.sessionId,'s1');assert.equal(state.assignments.a1.tableId,'t1');
      if(change!=='destination')assert.equal(state.sessions.t2,undefined);
    });
  }
  await t.test('assignment cannot be added to the emptied source after TC',async()=>{
    await reset();const stale=fixture(),context=contextFor(restDb());
    await context.guardedAtomicTableChange('t1','t2',stale.sessions.t1);
    const updates=context.prepareVersionedRecordUpdates(stale,{'pos-dev/assignments/new':{id:'new',tableId:'t1',castId:'c5',sessionId:100,startTime:160}},{createRecords:['assignments/new']});
    await assert.rejects(request('','PATCH',context.withWriteGate(updates)));
  });
  await t.test('two clients moving the same session cannot both commit',async()=>{
    await reset();
    let count=0,release;
    const ready=new Promise(resolve=>{release=resolve;});
    const beforeWrite=async()=>{if(++count===2)release();await ready;};
    const results=await Promise.allSettled(['t2','t3'].map(id=>contextFor(restDb(beforeWrite)).guardedAtomicTableChange('t1',id,fixture().sessions.t1)));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const state=await request('pos-dev','GET',undefined,true);
    assert.equal(Object.keys(state.sessions).length,1);
    assert.equal(state.assignments.a1.tableId,Object.keys(state.sessions)[0]);
  });
  await t.test('TC supports a legacy session with no revision or session ID and no assignments',async()=>{
    const state=fixture();delete state.sessions.t1.sessionId;delete state.sessions.t1._rev;delete state._tableAssignmentRevisions;state.assignments={};
    await reset(state);
    await contextFor(restDb(),state).guardedAtomicTableChange('t1','t2',state.sessions.t1);
    const saved=await request('pos-dev/sessions/t2','GET',undefined,true);
    assert.equal(saved.startTime,100);assert.equal(saved.items[0].qty,3);
  });
  await t.test('business-day reload can restore assignments without incrementing every table',async()=>{
    const state=fixture();delete state.activeBizDay;state.assignments={};state.sessions={};
    await reset(state);
    await request('','PATCH',{'pos-dev/activeBizDay':'2026-09-01','pos-dev/assignments':fixture().assignments,'pos-dev/_writeGate':{versionNum:614300,nonce:'reopen'}});
  });
});
