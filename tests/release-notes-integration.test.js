const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const version=app.match(/const APP_VERSION="([^"]+)"/)[1];
const newer=version.split('.').slice(0,2).map((value,index)=>String(Number(value)+(index===1?1:0))).join('.');
function source(from,to){
  const start=app.indexOf(from),end=app.indexOf(to,start+from.length);
  assert.ok(start>=0&&end>start,from+' extraction boundary');
  return app.slice(start,end);
}
function storage(){
  const values=new Map(),writes=[];
  return {values,writes,getItem:key=>values.get(key)||null,setItem:(key,value)=>{values.set(key,value);writes.push({key,value});}};
}
function runtime(options={}){
  const local=options.storage||storage(),timers=[],events={},windowEvents={},dialogEvents={};
  const elements={};
  for(const id of ['md','m','loading','auth-gate','version-overlay','offline-overlay','floor-order-modal']){
    elements[id]={id,style:{display:'none'},innerHTML:''};
  }
  const document={
    visibilityState:'visible',activeElement:null,body:{},getElementById:id=>id==='release-notes-dialog'?(elements.md.innerHTML.includes('id="release-notes-dialog"')?dialog:null):elements[id]||null,
    addEventListener:(type,handler)=>{(events[type]??=[]).push(handler);},
    removeEventListener:(type,handler)=>{events[type]=(events[type]||[]).filter(value=>value!==handler);},
    querySelector:()=>null,querySelectorAll:()=>[]
  };
  const control=(dataset={},id='')=>({id,dataset,isConnected:true,attributes:{},getAttribute(key){return this.attributes[key]??null;},setAttribute(key,value){this.attributes[key]=value;},
    focus(){document.activeElement=this;},closest(selector){return ['Action','View','Entry'].some(key=>this.dataset['releaseNotes'+key]!==undefined&&selector.includes('[data-release-notes-'+key.toLowerCase()+']'))?this:null;}});
  const close=control({releaseNotesAction:'dismiss'}),acknowledge=control({releaseNotesAction:'acknowledge'});
  const updates=control({releaseNotesView:'updates'}),history=control({releaseNotesView:'history'}),select=control({},'release-notes-select');
  const list={innerHTML:''},content={innerHTML:'',scrollTop:0},controls=[close,updates,history,select,acknowledge];
  const dialog={
    id:'release-notes-dialog',contains:value=>value===dialog||controls.includes(value),
    querySelectorAll:selector=>selector==='[data-release-notes-view]'?[updates,history]:selector==='[data-release-notes-entry]'?[]:controls,
    querySelector:selector=>selector==='.rn-list'?list:selector==='.rn-content'?content:selector==='#release-notes-select'?select
      :selector==='[data-release-notes-view="updates"]'?updates:selector==='[data-release-notes-view="history"]'?history
      :selector==='[data-release-notes-action="dismiss"]'?close:selector==='[data-release-notes-action="acknowledge"]'?acknowledge:null,
    focus:()=>{document.activeElement=dialog;},
    addEventListener:(type,handler)=>{dialogEvents[type]=handler;},
    removeEventListener:(type,handler)=>{if(dialogEvents[type]===handler)delete dialogEvents[type];}
  };
  const auth={currentUser:{uid:options.uid||'staff-a'}},writes=[],connectionCallbacks=[],swCallbacks=[];
  const db={ref:key=>({
    once:(_type,callback)=>callback({val:()=>version}),
    on:(_type,callback)=>{if(key==='.info/connected')connectionCallbacks.push(callback);}
  })};
  const window={
    _fbReady:true,_fbFirstSync:true,_fbConnected:true,_db:db,
    firebase:{auth:()=>auth},localStorage:local,
    addEventListener:(type,handler)=>{(windowEvents[type]??=[]).push(handler);}
  };
  const ctx={
    window,document,APP_VERSION:version,FB_ROOT:options.root||'pos-dev',navigator:{serviceWorker:{getRegistration:async()=>null,addEventListener:(_type,handler)=>swCallbacks.push(handler)}},
    setTimeout:handler=>{timers.push(handler);return timers.length;},clearTimeout:()=>{},
    S:{activeBizDay:null,sessions:{}},vw:'home',at:null,md:null,DEV:'desktop',
    checkoutBusy:false,checkinBusy:false,tableChangeBusy:false,entryTimeBusy:false,chargeSaveBusy:false,tablePreparationBusy:false,tableDeleteBusy:false,bizDayBusy:false,
    dataOperationLocks:new Set(),sessionSaveQueues:{},sessionSaveStates:{},
    hasPendingSettingSaves:()=>false,settingsSaving:()=>false,sbs:()=>{},updateNav:()=>{},
    startLazyViewDataLoad:()=>{},lazyViewDataState:()=>null,rHome:()=>'<main>home</main>',syncLegacyFloorCardSizes:()=>{},
    subscribePosCoreData:()=>{},guardedSet:async(key,value)=>{writes.push({key,value});},
    settingsClose:()=>{},initialPosSyncPending:new Set(['appVersion','sessions']),console
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root,'release-notes.js'),'utf8'),ctx);
  for(const [from,to] of [
    ['function _verNum','function applyFixedShimeiPrices'],
    ['function clientUpdateRequired','function handlePosSyncRender'],
    ['function initFB','async function save('],
    ['function showFirebaseLock','function reloadForFirebaseResume'],
    ['function requireFirebaseReady','async function guardedUpdate'],
    ['function render(){','let _renderPending'],
    ['function closeM(){','// ===== RECEIPT PRINT ====='],
    ['function rModal(){','function scc('],
    ['// ===== RELEASE NOTES =====','// ===== BOOT =====']
  ])vm.runInContext(source(from,to),ctx);
  const dispatch=(type,extra={})=>{
    const event={key:'',prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...extra};
    for(const handler of [...(events[type]||[])])handler(event);
    return event;
  };
  return {ctx,window,auth,local,elements,timers,writes,connectionCallbacks,swCallbacks,dispatch,
    controls:{updates,history,select},dialogEvent(type,target){dialogEvents[type]?.({target,preventDefault(){}});},
    flush(){let count=0;while(timers.length){assert.ok(count++<20,'timer loop');timers.shift()();}},
    focus(){for(const handler of windowEvents.focus||[])handler();}};
}

test('initial synchronization renders home before opening release notes, without business writes',()=>{
  const f=runtime();f.window._fbFirstSync=false;f.elements.loading.style.display='flex';
  f.ctx.finishInitialPosSyncPath('appVersion');f.flush();
  assert.equal(f.ctx.md,null);assert.equal(f.local.writes.length,0);
  f.ctx.finishInitialPosSyncPath('sessions');
  assert.match(f.elements.m.innerHTML,/home/);assert.equal(f.ctx.md,null);
  f.flush();
  assert.equal(f.ctx.md,'releaseNotes');assert.match(f.elements.md.innerHTML,/今回の更新内容/);
  assert.equal(f.local.writes.length,0,'opening is not acknowledgement');
  assert.equal(f.writes.length,0);
});

test('initial sync version failure takes priority over the release-notes timer',()=>{
  const f=runtime();f.window._fbFirstSync=false;f.window._posVersionCheckFailed=true;
  f.ctx.finishInitialPosSyncPath('appVersion');f.ctx.finishInitialPosSyncPath('sessions');f.flush();
  assert.equal(f.ctx.md,'firebaseLock');assert.doesNotMatch(f.elements.md.innerHTML,/release-notes-dialog/);
  assert.equal(f.local.writes.length,0);
});

test('connection arriving after initial snapshots retries the pending first notice',()=>{
  const f=runtime();f.window._fbFirstSync=false;f.window._fbConnected=undefined;
  f.ctx.initFB();f.ctx.finishInitialPosSyncPath('appVersion');f.ctx.finishInitialPosSyncPath('sessions');f.flush();
  assert.equal(f.ctx.md,null);
  f.connectionCallbacks[0]({val:()=>true});f.flush();
  assert.equal(f.ctx.md,'releaseNotes');
  assert.equal(f.writes.length,1,'only the existing appVersion broadcast writes');
});

test('automatic notice requires authorization, safe synchronization, home and no current work',async t=>{
  const conditions=[
    ['uninitialized authentication',f=>{f.window._fbReady=false;}],
    ['signed out',f=>{f.auth.currentUser=null;}],
    ['authentication lookup failure',f=>{f.window.firebase.auth=()=>{throw new Error('unavailable');};}],
    ['initial synchronization',f=>{f.window._fbFirstSync=false;}],
    ['disconnected',f=>{f.window._fbConnected=false;}],
    ['connection not yet known',f=>{f.window._fbConnected=undefined;}],
    ['newer database version',f=>{f.ctx.rememberServerAppVersion(newer);}],
    ['failed version read',f=>{f.window._posVersionCheckFailed=true;}],
    ['write lock',f=>{f.window._posWriteLocked=true;}],
    ['disconnect reload required',f=>{f.window._posNeedsReloadAfterDisconnect=true;}],
    ['other view',f=>{f.ctx.vw='settings';}],
    ['hidden tab',f=>{f.ctx.document.visibilityState='hidden';}],
    ['selected table',f=>{f.ctx.at='t1';}],
    ['existing modal',f=>{f.ctx.md='co2';}],
    ['scoped data operation',f=>{f.ctx.dataOperationLocks.add('session:t1');}],
    ['dirty settings',f=>{f.ctx.hasPendingSettingSaves=()=>true;}],
    ['saving settings modal',f=>{f.ctx.settingsSaving=()=>true;}],
    ['saving order',f=>{f.ctx.sessionSaveStates.t1={status:'saving'};}],
    ['unsaved order failure',f=>{f.ctx.sessionSaveStates.t1={status:'error'};}],
    ...['checkoutBusy','checkinBusy','tableChangeBusy','entryTimeBusy','chargeSaveBusy','tablePreparationBusy','tableDeleteBusy','bizDayBusy'].map(key=>[key,f=>{f.ctx[key]=true;}]),
    ...['loading','auth-gate','version-overlay','offline-overlay','floor-order-modal'].map(id=>[id,f=>{f.elements[id].style.display='flex';}])
  ];
  for(const [name,prepare] of conditions)await t.test(name,()=>{
    const f=runtime();prepare(f);
    const before=f.ctx.md;assert.equal(f.ctx.maybeShowReleaseNotes(),false);assert.equal(f.ctx.md,before);
    assert.equal(f.local.writes.length,0);
  });
});

test('queued notice rechecks current modal and locks when the timer runs',()=>{
  for(const prepare of [f=>{f.ctx.md='co2';},f=>{f.window._posWriteLocked=true;},f=>{f.auth.currentUser=null;}]){
    const f=runtime();f.ctx.scheduleReleaseNotes();f.ctx.scheduleReleaseNotes();assert.equal(f.timers.length,1);
    prepare(f);const before=f.ctx.md;f.flush();assert.equal(f.ctx.md,before);assert.equal(f.local.writes.length,0);
  }
});

test('closing another modal and returning to a visible home retries the unseen notice',()=>{
  const f=runtime();f.ctx.md='other';f.ctx.scheduleReleaseNotes();f.flush();assert.equal(f.ctx.md,'other');
  f.ctx.closeM();f.flush();assert.equal(f.ctx.md,'releaseNotes');
  f.ctx.acknowledgeReleaseNotes();f.ctx.render();f.flush();assert.equal(f.ctx.md,null);
  const hidden=runtime();hidden.ctx.document.visibilityState='hidden';hidden.ctx.render();hidden.flush();assert.equal(hidden.ctx.md,null);
  hidden.ctx.document.visibilityState='visible';hidden.dispatch('visibilitychange');hidden.flush();assert.equal(hidden.ctx.md,'releaseNotes');
});

test('acknowledgement survives reload and is isolated by account and database root',()=>{
  const local=storage(),f=runtime({storage:local});
  f.ctx.maybeShowReleaseNotes();assert.equal(f.ctx.acknowledgeReleaseNotes(),true);assert.equal(f.ctx.md,null);
  assert.equal(local.writes.length,1);assert.match(local.writes[0].key,/pos-dev:staff-a$/);
  assert.equal(JSON.parse(local.writes[0].value).version,version);
  assert.equal(runtime({storage:local}).ctx.maybeShowReleaseNotes(),false);
  assert.equal(runtime({storage:local,uid:'staff-b'}).ctx.maybeShowReleaseNotes(),true);
  assert.equal(runtime({storage:local,root:'pos'}).ctx.maybeShowReleaseNotes(),true);
});

test('retained settled order queue does not disable manual release history',()=>{
  const f=runtime();f.ctx.vw='settings';f.ctx.sessionSaveQueues.t1=Promise.resolve();
  f.ctx.sessionSaveStates.t1={status:'saved'};
  assert.equal(f.ctx.openReleaseNotes(),true);
  assert.match(f.elements.md.innerHTML,/更新履歴/);
  f.ctx.closeM();assert.equal(f.ctx.md,null);
  assert.equal(f.ctx.maybeShowReleaseNotes(),false,'automatic opening remains home-only');
});

test('storage access failure stays usable and suppresses duplicates within this page',()=>{
  const f=runtime();Object.defineProperty(f.window,'localStorage',{get(){throw new Error('storage blocked');}});
  assert.equal(f.ctx.maybeShowReleaseNotes(),true);assert.equal(f.ctx.acknowledgeReleaseNotes(),true);
  f.ctx.render();f.flush();assert.equal(f.ctx.md,null);
});

test('same, older, missing and malformed worker versions never demand a reload',()=>{
  const f=runtime();
  for(const data of [{type:'SW_UPDATED',version},{type:'SW_UPDATED',version:'6.152.1'},{type:'SW_UPDATED'},
    {type:'SW_UPDATED',version:615300},{type:'SW_UPDATED',version:'bad'},{type:'SW_UPDATED',version:version+'-dev'},{type:'OTHER',version:newer}]){
    assert.equal(f.ctx.handleServiceWorkerUpdate(data),false,JSON.stringify(data));
    assert.equal(f.ctx.clientUpdateRequired(),false);assert.equal(f.elements['version-overlay'].style.display,'none');
  }
  assert.equal(f.ctx.maybeShowReleaseNotes(),true);
});

test('new worker version blocks writes and notices without clearing a failed database version read',()=>{
  const f=runtime();f.window._posVersionCheckFailed=true;
  assert.equal(f.ctx.handleServiceWorkerUpdate({type:'SW_UPDATED',version:newer}),true);
  assert.equal(f.window._posVersionCheckFailed,true);
  assert.equal(f.ctx.clientUpdateRequired(),true);assert.equal(f.ctx.requireFirebaseReady({silent:true}),false);
  assert.equal(f.ctx.maybeShowReleaseNotes(),false);assert.equal(f.elements['version-overlay'].style.display,'flex');
  f.ctx.handleServiceWorkerUpdate({type:'SW_UPDATED',version});
  assert.equal(f.ctx.clientUpdateRequired(),true,'stale worker messages cannot unlock an update');
});

test('worker event before initial sync is remembered and takes priority once sync completes',()=>{
  const f=runtime();f.window._fbFirstSync=false;
  f.ctx.handleServiceWorkerUpdate({type:'SW_UPDATED',version:newer});
  assert.equal(f.elements['version-overlay'].style.display,'none');
  f.ctx.finishInitialPosSyncPath('appVersion');f.ctx.finishInitialPosSyncPath('sessions');f.flush();
  assert.equal(f.elements['version-overlay'].style.display,'flex');assert.equal(f.ctx.md,null);
  assert.equal(f.local.writes.length,0);
});

test('an update or safety lock shown over release notes cannot be acknowledged by its stale Escape listener',()=>{
  for(const interrupt of [
    f=>f.ctx.handleServiceWorkerUpdate({type:'SW_UPDATED',version:newer}),
    f=>{f.window._posWriteLocked=true;f.ctx.showFirebaseLock('connection lost');}
  ]){
    const f=runtime();assert.equal(f.ctx.maybeShowReleaseNotes(),true);
    interrupt(f);const before=f.ctx.md;
    const event=f.dispatch('keydown',{key:'Escape'});
    assert.equal(event.prevented,false);assert.equal(f.ctx.md,before);
    assert.equal(f.local.writes.length,0);
  }
});

test('actual initFB message listener ignores the active version and forwards a newer worker version',()=>{
  const f=runtime();f.ctx.initFB();assert.equal(f.swCallbacks.length,1);
  f.swCallbacks[0]({data:{type:'SW_UPDATED',version}});assert.equal(f.ctx.clientUpdateRequired(),false);
  f.swCallbacks[0]({data:{type:'SW_UPDATED',version:newer}});assert.equal(f.ctx.clientUpdateRequired(),true);
});

test('service-worker activation publishes the same release as app and precaches release-notes assets',async()=>{
  const handlers={},messages=[],deleted=[];
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const ctx={self:{addEventListener:(type,handler)=>{handlers[type]=handler;},clients:{claim:async()=>{},matchAll:async()=>[{postMessage:message=>messages.push(message)}]}},
    caches:{keys:async()=>['old-cache'],delete:async key=>deleted.push(key)}};
  vm.createContext(ctx);vm.runInContext(sw,ctx);
  let done;handlers.activate({waitUntil:promise=>{done=promise;}});await done;
  assert.equal(messages.length,1);assert.equal(messages[0].type,'SW_UPDATED');assert.equal(messages[0].version,version);
  assert.deepEqual(deleted,['old-cache']);
  const assets=vm.runInContext('ASSETS',ctx);
  for(const name of ['release-notes.js','release-notes.css']){
    assert.ok(assets.includes('./'+name+'?v='+version));assert.ok(html.includes(name+'?v='+version));assert.ok(fs.existsSync(path.join(root,name)));
  }
  assert.ok(html.indexOf('release-notes.js')<html.indexOf('app.js'));
});

test('browsing upgrade entries and manual history never confirms an update until explicit acknowledgement',()=>{
  const f=runtime(),key='genesis_release_notes_seen_v1:pos-dev:staff-a';
  f.local.values.set(key,JSON.stringify({version:'6.153',seenAt:1}));
  assert.equal(f.ctx.maybeShowReleaseNotes(),true);
  const notes=f.ctx.getReleaseNotes(),versions=()=>[...notes.renderModal().matchAll(/class="rn-list-version">Ver([^<]+)/g)].map(match=>match[1]);
  const unread=versions();assert.equal(unread[0],version);assert.ok(unread.length>1);assert.ok(!unread.includes('6.153'));
  f.dialogEvent('click',f.controls.history);const all=versions();assert.ok(all.includes('6.153'));assert.ok(all.includes('6.152'));
  f.controls.select.value=String(all.length-1);f.dialogEvent('change',f.controls.select);
  assert.match(notes.renderModal(),/class="rn-version">Ver6\.152</);
  assert.equal(f.local.writes.length,0);assert.equal(JSON.parse(f.local.getItem(key)).version,'6.153');
  f.dialogEvent('click',f.controls.updates);assert.deepEqual(versions(),unread);
  f.controls.select.value='1';f.dialogEvent('change',f.controls.select);
  assert.equal(f.local.writes.length,0);
  f.ctx.acknowledgeReleaseNotes();assert.equal(f.local.writes.length,1);assert.equal(JSON.parse(f.local.getItem(key)).version,version);
  const reopened=runtime({storage:f.local});assert.equal(reopened.ctx.maybeShowReleaseNotes(),false);
  assert.equal(reopened.ctx.openReleaseNotes(),true);assert.match(reopened.ctx.getReleaseNotes().renderModal(),/data-release-notes-view="history" aria-pressed="true"/);
  assert.equal(f.local.writes.length,1);
});

test('mounted history controls defer to an update lock and cannot acknowledge across account changes',()=>{
  const f=runtime();f.ctx.maybeShowReleaseNotes();const notes=f.ctx.getReleaseNotes();
  f.dialogEvent('click',f.controls.history);const before=notes.renderModal();
  f.ctx.handleServiceWorkerUpdate({type:'SW_UPDATED',version:newer});
  f.dialogEvent('click',f.controls.updates);f.controls.select.value='1';f.dialogEvent('change',f.controls.select);
  assert.equal(notes.renderModal(),before);assert.equal(f.ctx.acknowledgeReleaseNotes(),false);assert.equal(f.local.writes.length,0);
  const other=runtime();other.ctx.maybeShowReleaseNotes();other.dialogEvent('click',other.controls.history);other.auth.currentUser={uid:'staff-b'};
  other.ctx.acknowledgeReleaseNotes();assert.equal(other.local.writes.length,0);assert.equal(other.ctx.md,null);
  assert.equal(other.ctx.maybeShowReleaseNotes(),true,'the new account still has an unseen update');
});
