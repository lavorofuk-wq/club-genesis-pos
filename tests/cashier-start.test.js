const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {source,clone,get,put,fixture,emulator}=require('./helpers/scoped-runtime.cjs');
const {installAccessRuntime}=require('./helpers/access-runtime.cjs');

const DAY='2026-10-02';
function startContext(role,{existingDay=null,activeBizDay=null,rejectWrite=false}={}){
  const remote={activeBizDay,bizDays:existingDay?{[DAY]:clone(existingDay)}:{},_bizDayRevisions:existingDay?{[DAY]:4}:{}};
  const reads=[],writes=[],alerts=[],confirms=[],statuses=[];
  const context={
    APP_VERSION:'6.157',FB_ROOT:'pos-dev',BACKUP_ROOT:'backup-dev',
    BIZ_DAY_ATOMIC_VALIDATION_VERSION:614100,bizDayAtomicValidationVersion:614100,SCOPED_ATOMIC_VALIDATION_VERSION:614400,
    S:{activeBizDay,bizDays:existingDay?{[DAY]:clone(existingDay)}:{},bizDaySummaries:{},history:[{id:1,total:8000}],shifts:{old:{id:'old'}},assignments:{old:{id:'old'}},sessions:{old:{tableId:'old'}},casts:[],castLifecycleLogs:{}},
    window:{_db:{}},Date,Math,Object,String,Number,Error,console,
    requireFirebaseReady:()=>true,requireScopedAtomic:()=>{},bizDayBusy:false,vw:'home',md:'startBizDay',
    cloneData:clone,getPathValue:get,sameFirebaseValue:(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null),
    sbs:(ok,text)=>statuses.push({ok,text}),alert:text=>alerts.push(text),confirm:text=>{confirms.push(text);return true;},
    closeM:()=>{context.md=null;},render:()=>{},location:{reload:()=>{context.reloaded=true;}},getOnduty:()=>[],
    async readRemoteRelative(path){
      reads.push(path);
      assert.equal(context.window.PosAccess.canReadPath(role,path),true,'role must be allowed to read '+path);
      return clone(get(remote,path));
    },
    async readScopedPaths(paths){
      const value={};
      for(const path of paths)put(value,path,await context.readRemoteRelative(path));
      return value;
    },
    async guardedUpdate(updates){
      if(rejectWrite)throw Object.assign(new Error('PERMISSION_DENIED'),{code:'PERMISSION_DENIED'});
      writes.push(clone(updates));
      for(const [path,value]of Object.entries(updates))put(remote,path,value);
    }
  };
  vm.createContext(context);installAccessRuntime(context,{role,uid:'fixture-'+role});
  vm.runInContext(source('function bizDaySummary','function historyPageEntries'),context);
  vm.runInContext(source('function bizDayOperation','function sessionGuardStart'),context);
  vm.runInContext(source('async function startBizDay','// ===== FLOOR ====='),context);
  return {context,remote,reads,writes,alerts,confirms,statuses};
}

test('cashier starts a new business day atomically without reading archive contents',async()=>{
  const {context:ctx,remote,reads,writes,alerts}=startContext('cashier');
  await ctx.startBizDay(DAY);
  assert.equal(alerts.length,0);assert.equal(writes.length,1);
  assert.equal(ctx.S.activeBizDay,DAY);assert.equal(remote.activeBizDay,DAY);assert.equal(ctx.vw,'floor');
  assert.deepEqual(clone(ctx.S.history),[]);assert.deepEqual(clone(ctx.S.sessions),{});
  assert.ok(reads.includes('bizDays/'+DAY+'/id'));
  assert.ok(reads.includes('_bizDayRevisions/'+DAY));
  assert.ok(reads.every(path=>['activeBizDay','bizDays/'+DAY+'/id','_bizDayRevisions/'+DAY].includes(path)),reads.join(','));
  const operation=writes[0]['pos-dev/_bizDayOperation'];
  assert.equal(operation.type,'start');assert.equal(operation.expectedDayExists,false);assert.equal(operation.expectedDayRev,0);
  assert.equal(writes[0]['pos-dev/bizDays/'+DAY]._rev,1);
});

test('cashier cannot overwrite an already recorded day or start during another active day',async()=>{
  for(const settings of [{existingDay:{id:DAY,date:DAY,startedAt:100,endedAt:200,_rev:4,history:[{id:1,total:9000}]}},{activeBizDay:'2026-10-01'}]){
    const {context:ctx,reads,writes,alerts,confirms}=startContext('cashier',settings),before=JSON.stringify(ctx.S);
    await ctx.startBizDay(DAY);
    assert.equal(writes.length,0);assert.equal(confirms.length,0);assert.ok(alerts.length>0);
    assert.equal(JSON.stringify(ctx.S),before);
    assert.ok(reads.every(path=>path==='bizDays/'+DAY+'/id'));
  }
});

test('list cannot invoke business start and non-OP roles cannot invoke business end directly',async()=>{
  const deniedStart=startContext('list');await deniedStart.context.startBizDay(DAY);
  assert.equal(deniedStart.reads.length,0);assert.equal(deniedStart.writes.length,0);
  assert.equal(deniedStart.context.S.activeBizDay,null);
  for(const role of ['cashier','list']){
    const deniedEnd=startContext(role,{activeBizDay:DAY,existingDay:{id:DAY,date:DAY,startedAt:100}}),before=JSON.stringify(deniedEnd.context.S);
    await deniedEnd.context.endBizDay();
    assert.equal(deniedEnd.reads.length,0);assert.equal(deniedEnd.writes.length,0);
    assert.equal(JSON.stringify(deniedEnd.context.S),before);
  }
});

test('OP retains the confirmed overwrite flow for a recorded business day',async()=>{
  const {context:ctx,reads,writes,confirms}=startContext('op',{existingDay:{id:DAY,date:DAY,startedAt:100,endedAt:200,_rev:4,history:[{id:1,total:9000}]}});
  await ctx.startBizDay(DAY);
  assert.equal(confirms.length,1);assert.equal(writes.length,1);
  assert.ok(reads.includes('bizDays/'+DAY));assert.equal(ctx.S.activeBizDay,DAY);
  assert.equal(writes[0]['pos-dev/_bizDayOperation'].expectedDayExists,true);
  assert.equal(writes[0]['pos-dev/_bizDayOperation'].expectedDayRev,4);
  assert.equal(writes[0]['pos-dev/bizDays/'+DAY]._rev,5);
});

test('cashier does not commit local business state when the atomic start is rejected',async()=>{
  const {context:ctx,writes,alerts}=startContext('cashier',{rejectWrite:true}),before=JSON.stringify(ctx.S);
  await ctx.startBizDay(DAY);
  assert.equal(writes.length,0);assert.equal(JSON.stringify(ctx.S),before);
  assert.equal(ctx.bizDayBusy,false);assert.equal(ctx.reloaded,true);assert.equal(alerts.length,1);
});

test('invalidated cashier permission disables both start modal and direct start',async()=>{
  const {context:ctx,reads,writes}=startContext('cashier');ctx.window._posAccessInvalidated=true;
  assert.equal(ctx.posCanOpenModal('startBizDay'),false);
  await ctx.startBizDay(DAY);assert.equal(reads.length,0);assert.equal(writes.length,0);
});

test('cashier and list cannot bypass entry point guards through direct atomic end or reopen calls',async()=>{
  for(const role of ['cashier','list'])for(const operation of ['end','reopen']){
    const {context:ctx,reads,writes}=startContext(role);
    await assert.rejects(ctx.guardedAtomicBizDayUpdate(operation,DAY,null,DAY,{['bizDays/'+DAY]:{id:DAY}}),/BUSINESS_DAY_ACCESS_DENIED/);
    assert.equal(reads.length,0);assert.equal(writes.length,0);
  }
});

test('real cashier start and summary payload are accepted together by Firebase rules',{skip:process.env.POS_RULES_EMULATOR!=='1'},async()=>{
  const client=await emulator('demo-pos-cashier-start-app','app-cashier');
  const previous='2026-10-01',oldDay={id:previous,date:previous,startedAt:100,endedAt:200,_rev:4,history:[{id:1,total:75000}]};
  const state={...fixture(),activeBizDay:null,sessions:null,history:null,shifts:null,assignments:null,
    bizDays:{[previous]:oldDay},bizDaySummaries:{[previous]:{id:previous,date:previous,startedAt:100,endedAt:200,sales:75000,_dayRev:4}},
    _bizDayRevisions:{[previous]:4}};
  await client.request('','PUT',{access:{authorizedUsers:{'app-cashier':true},roles:{'app-cashier':'cashier'}},'pos-dev':state},true);
  const {context:ctx,alerts}=startContext('cashier'),writes=[];
  ctx.window._db=client.db(updates=>{writes.push(clone(updates));});
  ctx.S={...clone(state),activeBizDay:null,history:[],sessions:{},shifts:{},assignments:{},bizDays:{},bizDaySummaries:{}};
  ctx.setPathValue=put;ctx.stripRootPath=path=>String(path).replace(/^pos-dev\//,'');
  for(const [from,to]of [
    ['function _verNum','function applyFixedShimeiPrices'],
    ['function writeGate','function showFirebaseLock'],
    ['async function guardedUpdate','async function guardedRootUpdate'],
    ['async function readRemoteRelative','function settingConflictError'],
    ['async function readScopedPaths','async function guardedScopedCommit']
  ])vm.runInContext(source(from,to),ctx);
  await ctx.startBizDay(DAY);
  assert.deepEqual(alerts,[]);assert.equal(writes.length,1);assert.equal(ctx.S.activeBizDay,DAY);
  const persisted=await client.request('pos-dev','GET',undefined,true),day=persisted.bizDays[DAY],summary=persisted.bizDaySummaries[DAY];
  assert.equal(persisted.activeBizDay,DAY);assert.equal(day.id,DAY);assert.equal(day._rev,1);
  assert.equal(summary.id,DAY);assert.equal(summary.date,DAY);assert.equal(summary._dayRev,1);
  assert.equal(summary.startedAt,day.startedAt);assert.equal(summary.sales,0);assert.ok(summary.updatedAt>0);
  assert.equal(persisted._writeGate.appVersion,'6.157');assert.equal(persisted._writeGate.versionNum,ctx._verNum('6.157'));
  assert.deepEqual(persisted.bizDays[previous],oldDay,'starting a new day preserves prior business records');
  assert.ok(client.reads.every(({key})=>['pos-dev/activeBizDay','pos-dev/bizDays/'+DAY+'/id','pos-dev/_bizDayRevisions/'+DAY].includes(key)));
  for(const name of ['history','sessions','shifts','assignments'])assert.equal(persisted[name],undefined,name+' starts empty');
});
