const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {source}=require('./helpers/scoped-runtime.cjs');

function runtime(){
  const overlay={style:{display:'none'}},loading={style:{display:'flex'}},locks=[],writes=[];
  const ctx={APP_VERSION:'6.151.1',FB_ROOT:'pos-dev',window:{_fbFirstSync:false,_fbConnected:true,_db:{ref:()=>({update:async value=>writes.push(value)})}},
    initialPosSyncPending:new Set(['appVersion','sessions']),POS_CORE_SYNC_PATHS:['appVersion'],
    document:{getElementById:id=>id==='version-overlay'?overlay:loading},
    vw:'home',tableChangeBusy:false,hasPendingSettingSaves:()=>false,sbs:()=>{},render:()=>{},handlePosSyncRender:()=>{},
    showFirebaseLock:msg=>locks.push(msg),withWriteGate:value=>value};
  vm.createContext(ctx);
  vm.runInContext(source('function _verNum','function applyFixedShimeiPrices'),ctx);
  vm.runInContext(source('function clientUpdateRequired','function handlePosSyncRender'),ctx);
  vm.runInContext(source('function applyPosCoreValue','function updateBizDayRemoteHashes'),ctx);
  vm.runInContext(source('function requireFirebaseReady','function canonicalJsonValue'),ctx);
  return {ctx,overlay,loading,locks,writes};
}

test('newer version received before initial sync shows the reload overlay once syncing completes',async()=>{
  const {ctx,overlay,writes}=runtime();
  ctx.applyPosCoreValue({},'appVersion','6.152');
  assert.equal(overlay.style.display,'none');assert.equal(ctx.clientUpdateRequired(),true);
  ctx.finishInitialPosSyncPath('sessions');
  assert.equal(overlay.style.display,'flex');assert.equal(ctx.requireFirebaseReady(),false);
  assert.equal(ctx.requireFirebaseReady({allowBeforeFirstSync:true,silent:true}),false);
  await assert.rejects(ctx.guardedSet('loMode',true),/not ready/);assert.equal(writes.length,0);
});

test('newer version received as the last initial snapshot also blocks writes',()=>{
  const {ctx,overlay}=runtime();
  ctx.finishInitialPosSyncPath('sessions');ctx.applyPosCoreValue({},'appVersion','6.152');
  assert.equal(overlay.style.display,'flex');assert.equal(ctx.requireFirebaseReady(),false);
});

test('same, older and empty server versions allow the current application to save',async()=>{
  for(const version of ['6.151.1','6.151','6.150.12',null]){
    const {ctx,overlay,writes}=runtime();
    ctx.applyPosCoreValue({},'appVersion',version);ctx.finishInitialPosSyncPath('sessions');
    assert.equal(ctx.requireFirebaseReady(),true);assert.equal(overlay.style.display,'none');
    await ctx.guardedSet('loMode',true);assert.equal(writes.length,1);
  }
});

test('a live upgrade is sticky and cannot be bypassed by a delayed older snapshot',()=>{
  const {ctx,overlay}=runtime();
  ctx.window._fbFirstSync=true;ctx.rememberServerAppVersion('6.152');ctx.rememberServerAppVersion('6.151');
  assert.equal(overlay.style.display,'flex');assert.equal(ctx.requireFirebaseReady(),false);
  ctx.window._posWriteLocked=false;assert.equal(ctx.requireFirebaseReady(),false);
});

test('version read failure fails closed and a successful retry clears only the version error',()=>{
  const {ctx,locks}=runtime();let onError;
  ctx.subscribePosCoreData({ref:()=>({on:(type,ok,error)=>{onError=error;}})});
  ctx.finishInitialPosSyncPath('$activeBizDayRecord');onError();
  assert.equal(ctx.window._fbFirstSync,true);assert.equal(ctx.requireFirebaseReady(),false);assert.ok(locks.length);
  ctx.rememberServerAppVersion('6.151.1');assert.equal(ctx.requireFirebaseReady(),true);
  ctx.window._posNeedsReloadAfterDisconnect=true;assert.equal(ctx.requireFirebaseReady(),false);
});
