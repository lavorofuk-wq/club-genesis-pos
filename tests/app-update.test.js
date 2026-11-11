const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {installAccessRuntime}=require('./helpers/access-runtime.cjs');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const app=read('app.js'),html=read('index.html'),worker=read('sw.js');
const version=app.match(/const APP_VERSION="([^"]+)"/)[1];
const newer=version.split('.').slice(0,2).map((value,index)=>String(Number(value)+(index===1?1:0))).join('.');
function source(from,to){
  const start=app.indexOf(from),end=app.indexOf(to,start+from.length);
  assert.ok(start>=0&&end>start,from+' extraction boundary');
  return app.slice(start,end);
}
function runtime(){
  const timers=[],writes=[],connectionCallbacks=[],swCallbacks=[],elements={};
  for(const id of ['md','m','loading','auth-gate','version-overlay','offline-overlay','floor-order-modal']){
    elements[id]={id,style:{display:'none'},innerHTML:''};
  }
  const document={body:{},getElementById:id=>elements[id]||null,querySelector:()=>null,querySelectorAll:()=>[]};
  const db={ref:key=>({
    once:(_type,callback)=>callback({val:()=>version}),
    on:(_type,callback)=>{if(key==='.info/connected')connectionCallbacks.push(callback);},
    update:async value=>{writes.push(value);}
  })};
  const window={_fbReady:true,_fbFirstSync:true,_fbConnected:true,_db:db};
  Object.defineProperty(window,'localStorage',{get(){throw new Error('Rendering and synchronization do not require local storage');}});
  const ctx={
    window,document,APP_VERSION:version,FB_ROOT:'pos-dev',
    navigator:{serviceWorker:{getRegistration:async()=>null,addEventListener:(_type,handler)=>swCallbacks.push(handler)}},
    setTimeout:handler=>{timers.push(handler);return timers.length;},clearTimeout:()=>{},
    S:{activeBizDay:null,sessions:{}},vw:'home',at:null,md:null,DEV:'desktop',
    checkoutBusy:false,tableChangeBusy:false,entryTimeBusy:false,chargeSaveBusy:false,tablePreparationBusy:false,
    castDrinkChangeState:{draft:true},setPriceState:{draft:true},extensionGuests:3,chargeSessionIdentity:{id:'old'},
    hasPendingSettingSaves:()=>false,settingsSaving:()=>false,sbs:()=>{},updateNav:()=>{},
    startLazyViewDataLoad:()=>{},lazyViewDataState:()=>null,rHome:()=>'<main>home</main>',syncLegacyFloorCardSizes:()=>{},
    subscribePosCoreData:()=>{},withWriteGate:value=>value,settingsClose:()=>{},
    initialPosSyncPending:new Set(['appVersion','sessions']),console
  };
  vm.createContext(ctx);installAccessRuntime(ctx);
  for(const [from,to] of [
    ['function _verNum','function applyFixedShimeiPrices'],
    ['function clientUpdateRequired','function handlePosSyncRender'],
    ['function initFB','async function save('],
    ['function showFirebaseLock','function reloadForFirebaseResume'],
    ['function requireFirebaseReady','function canonicalJsonValue'],
    ['function render(){','let _renderPending'],
    ['function closeM(){','// ===== RECEIPT PRINT ====='],
    ['function rModal(){','function scc(']
  ])vm.runInContext(source(from,to),ctx);
  vm.runInContext(source('function handleServiceWorkerUpdate','\n}')+'\n}',ctx);
  return {ctx,window,elements,timers,writes,connectionCallbacks,swCallbacks,
    flush(){let count=0;while(timers.length){assert.ok(count++<20,'timer loop');timers.shift()();}}};
}

test('public entry files have no merge markers and exactly one noninteractive current version',()=>{
  for(const text of [app,html,worker])assert.doesNotMatch(text,/^(?:<{7}|={7}|>{7})(?:\s|$)/m);
  assert.equal((html.match(/id="app-version"/g)||[]).length,1);
  const label=html.match(/<span\b[^>]*id="app-version"[^>]*>([^<]+)<\/span>/);
  assert.equal(label?.[1],'Ver'+version);
  assert.doesNotMatch(label[0],/onclick|tabindex|aria-haspopup/);
  assert.equal(worker.match(/const RELEASE_VERSION = '([^']+)'/)[1],version);
  for(const match of html.matchAll(/(?:src|href)="[^"?]+\?v=([^"&]+)"/g))assert.equal(match[1],version);
});

test('initial synchronization renders home without opening a dialog or writing business data',()=>{
  const f=runtime();f.window._fbFirstSync=false;f.elements.loading.style.display='flex';
  f.ctx.finishInitialPosSyncPath('appVersion');f.flush();
  assert.equal(f.window._fbFirstSync,false);assert.equal(f.ctx.md,null);
  f.ctx.finishInitialPosSyncPath('sessions');f.flush();
  assert.equal(f.window._fbFirstSync,true);assert.equal(f.elements.loading.style.display,'none');
  assert.match(f.elements.m.innerHTML,/home/);assert.equal(f.ctx.md,null);assert.equal(f.elements.md.innerHTML,'');
  assert.equal(f.writes.length,0);assert.equal(f.timers.length,0);
});

test('initial sync with a failed version read retains the safety lock',()=>{
  const f=runtime();f.window._fbFirstSync=false;f.window._posVersionCheckFailed=true;
  f.ctx.finishInitialPosSyncPath('appVersion');f.ctx.finishInitialPosSyncPath('sessions');f.flush();
  assert.equal(f.ctx.md,'firebaseLock');assert.match(f.elements.md.innerHTML,/Firebase接続確認中/);
  assert.equal(f.ctx.requireFirebaseReady({silent:true}),false);assert.equal(f.writes.length,0);
});

test('connection after initial snapshots leaves home usable and only broadcasts the current version',async()=>{
  const f=runtime();f.window._fbFirstSync=false;f.window._fbConnected=undefined;
  f.ctx.initFB();f.ctx.finishInitialPosSyncPath('appVersion');f.ctx.finishInitialPosSyncPath('sessions');f.flush();
  f.connectionCallbacks[0]({val:()=>true});f.flush();
  assert.equal(f.ctx.md,null);assert.match(f.elements.m.innerHTML,/home/);assert.equal(f.ctx.requireFirebaseReady(),true);
  assert.equal(f.writes.length,1);assert.equal(f.writes[0]['pos-dev/appVersion'],version);
});

test('disconnect and reconnect preserve write locks until an explicit reload',()=>{
  const f=runtime();f.ctx.initFB();f.connectionCallbacks[0]({val:()=>false});
  assert.equal(f.elements['offline-overlay'].style.display,'flex');assert.equal(f.ctx.md,'firebaseLock');
  assert.equal(f.ctx.requireFirebaseReady({silent:true}),false);
  f.connectionCallbacks[0]({val:()=>true});f.flush();
  assert.equal(f.elements['offline-overlay'].style.display,'none');assert.equal(f.ctx.md,'firebaseLock');
  assert.equal(f.ctx.requireFirebaseReady({silent:true}),false);
  assert.equal(f.writes.length,1,'reconnection never changes business data');
});

test('render and modal close preserve active work without creating a replacement dialog',()=>{
  const f=runtime();f.ctx.md='co2';f.ctx.checkoutBusy=true;f.elements.md.innerHTML='checkout';
  f.ctx.closeM();f.ctx.render();f.flush();
  assert.equal(f.ctx.md,'co2');assert.equal(f.elements.md.innerHTML,'checkout');
  f.ctx.checkoutBusy=false;f.ctx.closeM();f.ctx.render();f.flush();
  assert.equal(f.ctx.md,null);assert.equal(f.elements.md.innerHTML,'');assert.equal(f.ctx.castDrinkChangeState,null);
  assert.equal(f.ctx.chargeSessionIdentity,null);assert.equal(f.writes.length,0);assert.equal(f.timers.length,0);
});

test('settings modal closing still delegates to its editor and respects pending saves',()=>{
  const f=runtime();let closes=0;f.ctx.settingsClose=()=>{closes++;};f.ctx.md='settingsEditor';
  f.ctx.closeM();assert.equal(closes,1);assert.equal(f.ctx.md,'settingsEditor','editor owns its close decision');
  f.ctx.md='co';f.ctx.settingsSaving=()=>true;f.ctx.closeM();assert.equal(f.ctx.md,'co');
  f.ctx.settingsSaving=()=>false;f.ctx.tableChangeBusy=true;f.ctx.closeM();assert.equal(f.ctx.md,'co');
  assert.equal(f.writes.length,0);
});

test('same, older, missing and malformed worker versions never demand a reload',()=>{
  const f=runtime();
  for(const data of [{type:'SW_UPDATED',version},{type:'SW_UPDATED',version:'6.100'},{type:'SW_UPDATED'},
    {type:'SW_UPDATED',version:615300},{type:'SW_UPDATED',version:'bad'},{type:'SW_UPDATED',version:version+'-dev'},{type:'OTHER',version:newer}]){
    assert.equal(f.ctx.handleServiceWorkerUpdate(data),false,JSON.stringify(data));
    assert.equal(f.ctx.clientUpdateRequired(),false);assert.equal(f.elements['version-overlay'].style.display,'none');
  }
  assert.equal(f.ctx.requireFirebaseReady(),true);
});

test('new worker versions block actual writes without clearing a failed database version read',async()=>{
  const f=runtime();f.window._posVersionCheckFailed=true;
  assert.equal(f.ctx.handleServiceWorkerUpdate({type:'SW_UPDATED',version:newer}),true);
  assert.equal(f.window._posVersionCheckFailed,true);assert.equal(f.ctx.clientUpdateRequired(),true);
  assert.equal(f.elements['version-overlay'].style.display,'flex');
  await assert.rejects(f.ctx.guardedSet('loMode',true),/not ready/);assert.equal(f.writes.length,0);
  f.ctx.handleServiceWorkerUpdate({type:'SW_UPDATED',version});
  assert.equal(f.ctx.clientUpdateRequired(),true,'a stale worker message cannot unlock an update');
});

test('worker updates received before initial sync take priority once synchronization completes',()=>{
  const f=runtime();f.window._fbFirstSync=false;
  f.ctx.handleServiceWorkerUpdate({type:'SW_UPDATED',version:newer});
  assert.equal(f.elements['version-overlay'].style.display,'none');
  f.ctx.finishInitialPosSyncPath('appVersion');f.ctx.finishInitialPosSyncPath('sessions');f.flush();
  assert.equal(f.elements['version-overlay'].style.display,'flex');assert.equal(f.ctx.md,null);
  assert.equal(f.ctx.requireFirebaseReady({silent:true}),false);assert.equal(f.writes.length,0);
});

test('initFB installs one message listener that ignores current and forwards newer worker versions',()=>{
  const f=runtime();f.ctx.initFB();f.ctx.initFB();assert.equal(f.swCallbacks.length,1);
  f.swCallbacks[0]({data:{type:'SW_UPDATED',version}});assert.equal(f.ctx.clientUpdateRequired(),false);
  f.swCallbacks[0]({data:{type:'SW_UPDATED',version:newer}});assert.equal(f.ctx.clientUpdateRequired(),true);
});

test('worker install precaches existing current assets and activation removes only older caches',async()=>{
  const handlers={},messages=[],deleted=[],installed=[];let claimed=false,skipped=false;
  const ctx={self:{addEventListener:(type,handler)=>{handlers[type]=handler;},skipWaiting:()=>{skipped=true;},
    clients:{claim:async()=>{claimed=true;},matchAll:async()=>[{postMessage:message=>messages.push(message)}]}},
    caches:{keys:async()=>['old-cache','genesis-pos-v'+version+'-auth'],delete:async key=>deleted.push(key),
      open:async name=>({addAll:async assets=>{installed.push({name,assets});}})}};
  vm.createContext(ctx);vm.runInContext(worker,ctx);
  let installedPromise;handlers.install({waitUntil:promise=>{installedPromise=promise;}});await installedPromise;
  assert.equal(skipped,true);assert.equal(installed.length,1);assert.equal(installed[0].name,'genesis-pos-v'+version+'-auth');
  const assets=installed[0].assets;assert.equal(new Set(assets).size,assets.length);
  for(const asset of assets){
    const [filename,query]=asset.split('?');
    assert.ok(fs.existsSync(path.resolve(root,filename)),asset+' must exist before cache installation');
    if(query)assert.equal(query,'v='+version);
  }
  for(const match of html.matchAll(/(?:src|href)="([^":]+\?v=[^"]+)"/g)){
    assert.ok(assets.includes('./'+match[1]),match[1]+' must be available offline');
  }
  let activatedPromise;handlers.activate({waitUntil:promise=>{activatedPromise=promise;}});await activatedPromise;
  assert.equal(claimed,true);assert.deepEqual(deleted,['old-cache']);
  assert.equal(messages.length,1);assert.equal(messages[0].type,'SW_UPDATED');assert.equal(messages[0].version,version);
});
