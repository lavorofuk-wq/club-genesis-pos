const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
function source(from,to){
  const start=app.indexOf(from),end=app.indexOf(to,start+from.length);
  assert.ok(start>=0&&end>start,from+' extraction boundary');
  return app.slice(start,end);
}
function contextFor(){
  let now=200;
  const ctx={
    Date:{now:()=>now},setNow:value=>{now=value;},cloneData:clone,
    at:'t1',FB_ROOT:'pos-dev',BANAI_SHIMEI_PRICE:2000,
    S:{casts:[{id:1,name:'Cast'}],sessions:{t1:{startTime:80,items:[]}},
      assignments:{a1:{id:'a1',castId:1,castName:'Cast',tableId:'t1',sessionId:80,type:'free',startTime:100,endTime:null}},
      shifts:{s1:{id:'s1',castId:1,status:'active',clockIn:50}}},
    calls:[],alerts:[],isPendingAssignment:()=>false,isPendingCastMove:()=>false,
    requireFirebaseReady:()=>true,withDataOperation:async(key,fn)=>fn(),
    closeM:()=>{},render:()=>{},renderOrderPartial:()=>{},refreshFloorModal:()=>{},sbs:()=>{},
    alert:message=>ctx.alerts.push(message),
    markOptimisticPaths:()=>{},unmarkOptimisticPaths:()=>{},
    snapshotLocalRootPaths:()=>clone(ctx.S),restoreLocalRootSnapshot:value=>{ctx.S=value;},
    applyLocalRootUpdates:updates=>apply(updates),
    POS_CHARGES:{isParent:()=>false,isRoom:()=>false,isSC:()=>false},
    getShiftByCastId:()=>ctx.S.shifts.s1,
    shiftWithStatus:(shift,status)=>({...clone(shift),status}),
    remoteActiveAssign:()=>null,
    queueSessionUpdate:async(tableId,makeUpdates,options)=>{
      const updates=makeUpdates(options.session);
      ctx.calls.push({kind:'session',updates:clone(updates),options:clone(options)});
      apply(updates);
    },
    queueSessionSave:async(tableId,session)=>{ctx.S.sessions[tableId]=clone(session);},
    guardedRecordSet:async(collection,id,expected,desired)=>{
      ctx.calls.push({kind:'record',collection,id,expected:clone(expected),desired:clone(desired)});
      ctx.S[collection][id]=clone(desired);
    },
    guardedCheckedUpdateOptimistic:async(updates,check,options)=>{
      assert.deepEqual(clone(check(ctx.S)),{ok:true});
      ctx.calls.push({kind:'checked',updates:clone(updates),options:clone(options)});
      apply(updates);
    }
  };
  function apply(updates){
    for(const [key,value] of Object.entries(updates)){
      const [,collection,id]=key.split('/');ctx.S[collection][id]=clone(value);
    }
  }
  vm.createContext(ctx);
  for(const [from,to] of [
    ['function assignmentWithType(','function assignmentMatchesSession('],
    ['async function remItem(','// qty '],
    ['async function startAssignAt(','function openChangeType(']
  ])vm.runInContext(source(from,to),ctx);
  return ctx;
}

test('legacy free to banai to free conversion retains every type boundary without mutating the source',()=>{
  const ctx=contextFor(),original=clone(ctx.S.assignments.a1);
  const banai=ctx.assignmentWithType(original,'banai',200);
  const free=ctx.assignmentWithType(banai,'free',300);
  assert.deepEqual(clone(free.typeHistory),[
    {type:'free',startTime:100},{type:'banai',startTime:200},{type:'free',startTime:300}
  ]);
  assert.deepEqual(original,ctx.S.assignments.a1);
  assert.equal(original.typeHistory,undefined);
  assert.equal(banai.type,'banai');
  assert.equal(free.type,'free');
  assert.deepEqual(clone(ctx.assignmentWithType(free,'free',400).typeHistory),clone(free.typeHistory));
});

test('conversion timestamps stay within assignment bounds and never precede the last transition',()=>{
  const ctx=contextFor();
  const future=ctx.assignmentWithType({...ctx.S.assignments.a1,startTime:500},'banai',200);
  assert.deepEqual(clone(future.typeHistory),[{type:'free',startTime:500},{type:'banai',startTime:500}]);
  const ended=ctx.assignmentWithType({...ctx.S.assignments.a1,endTime:150},'banai',200);
  assert.equal(ended.typeHistory[1].startTime,150);
  const backwards=ctx.assignmentWithType({...ctx.S.assignments.a1,type:'banai',typeHistory:[
    {type:'free',startTime:100},{type:'banai',startTime:180}
  ]},'hon',120);
  assert.equal(backwards.typeHistory[2].startTime,180);
});

test('new assignments record their initial type while preserving atomic create and previous-assignment guards',async()=>{
  const ctx=contextFor();
  ctx.S.sessions.t2={startTime:150,items:[]};
  await ctx.startAssignAt(1,'t2','banai',200,'a1');
  assert.deepEqual(ctx.alerts,[]);
  const call=ctx.calls[0],created=Object.values(call.updates).find(row=>row.id?.startsWith('a_'));
  assert.deepEqual(created.typeHistory,[{type:'banai',startTime:200}]);
  assert.equal(call.updates['pos-dev/assignments/a1'].endTime,200);
  assert.equal(call.options.expectedRecords['assignments/a1'].type,'free');
  assert.ok(call.options.createRecords.includes('assignments/'+created.id));
});

test('order promotion and removal preserve free and banai periods in the same guarded session write',async()=>{
  const ctx=contextFor();
  await ctx.addBanai(1);
  assert.deepEqual(ctx.alerts,[]);
  assert.deepEqual(ctx.S.assignments.a1.typeHistory,[{type:'free',startTime:100},{type:'banai',startTime:200}]);
  assert.equal(ctx.calls[0].options.expectedRecords['assignments/a1'].type,'free');
  assert.ok(ctx.calls[0].updates['pos-dev/sessions/t1'].items[0].isBanaiShimei);
  ctx.setNow(300);
  await ctx.remItem(ctx.S.sessions.t1.items[0].id);
  assert.deepEqual(ctx.S.assignments.a1.typeHistory,[
    {type:'free',startTime:100},{type:'banai',startTime:200},{type:'free',startTime:300}
  ]);
  assert.equal(ctx.calls[1].options.expectedRecords['assignments/a1'].type,'banai');
  assert.equal(ctx.S.sessions.t1.items.length,0);
});

test('manual type changes retain history and the unchanged expected record for concurrency checks',async()=>{
  const ctx=contextFor(),before=clone(ctx.S.assignments.a1);
  await ctx.changeAssignType('a1','hon');
  assert.deepEqual(ctx.calls[0].expected,before);
  assert.deepEqual(ctx.calls[0].desired.typeHistory,[{type:'free',startTime:100},{type:'hon',startTime:200}]);
  ctx.setNow(300);
  await ctx.changeAssignType('a1','hon');
  assert.equal(ctx.S.assignments.a1.typeHistory.length,2);
});
