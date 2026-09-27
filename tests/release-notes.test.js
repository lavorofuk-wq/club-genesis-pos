const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {create,history,storageKey,compareVersions}=require('../release-notes.js');
function storage(){const data=new Map();return{data,getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};}
function fixture(overrides={}){
  const state={version:'6.153',scope:'pos-dev:user-a'},store=storage(),events=[];
  const adapter={getVersion:()=>state.version,getScope:()=>state.scope,storage:store,onOpen:()=>events.push('open'),onClose:()=>events.push('close'),...overrides};
  return{state,store,events,adapter,notes:create(adapter)};
}
function seed(f,version){f.store.setItem(storageKey(f.state.scope),JSON.stringify({version,seenAt:1}));}
function versions(html){return [...html.matchAll(/class="rn-version">Ver([^<]+)/g)].map(match=>match[1]);}
function dom(){
  const listeners=new Map(),clicks=new Map(),doc={body:{style:{overflow:'auto'}},activeElement:null,dialog:null};
  doc.addEventListener=(type,listener)=>listeners.set(type,listener);doc.removeEventListener=(type,listener)=>{if(listeners.get(type)===listener)listeners.delete(type);};
  const button=action=>({dataset:{releaseNotesAction:action},focus(){doc.activeElement=this;},getAttribute:()=>null,closest(){return this;}});
  const close=button('dismiss'),confirm=button('acknowledge'),trigger={isConnected:true,focus(){doc.activeElement=this;}};
  const dialog={contains:node=>[dialog,close,confirm].includes(node),querySelectorAll:()=>[close,confirm],querySelector:()=>confirm,focus(){doc.activeElement=dialog;},addEventListener:(type,listener)=>clicks.set(type,listener),removeEventListener:(type,listener)=>{if(clicks.get(type)===listener)clicks.delete(type);}};
  doc.getElementById=()=>doc.dialog;doc.activeElement=trigger;
  return{doc,dialog,close,confirm,trigger,listeners,clicks,key(key,shiftKey=false){const event={key,shiftKey,prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};listeners.get('keydown')?.(event);return event;}};
}

test('the active APP_VERSION has an explicit nonempty release entry',()=>{
  const version=fs.readFileSync(require.resolve('../app.js'),'utf8').match(/const APP_VERSION="([^"]+)"/)[1];
  const entry=history.find(entry=>compareVersions(entry.version,version)===0);
  assert.ok(entry,'Add release notes when APP_VERSION changes: '+version);assert.ok(entry.title&&entry.changes.length&&entry.changes.every(change=>change.trim()));
  assert.ok(history.length>0);
  assert.equal(new Set(history.map(entry=>entry.version)).size,history.length,'release versions must be unique');
  history.forEach((entry,index)=>{
    assert.match(entry.version,/^\d+(?:\.\d+)*$/);
    assert.ok(typeof entry.title==='string'&&entry.title.trim(),'each release needs a title');
    assert.ok(Array.isArray(entry.changes)&&entry.changes.length>0&&entry.changes.every(change=>typeof change==='string'&&change.trim()),'each release needs nonempty changes');
    if(index>0)assert.equal(compareVersions(history[index-1].version,entry.version),1,'history must be strictly newest first');
  });
});

test('first launch opens only the current notes and does not mark them seen before confirmation',()=>{
  const f=fixture();assert.equal(f.notes.needsAttention(),true);assert.equal(f.notes.open(),true);
  assert.deepEqual(versions(f.notes.renderModal()),['6.153']);assert.equal(f.store.data.size,0);assert.equal(f.notes.needsAttention(),true);
  assert.equal(f.notes.acknowledge(),true);assert.equal(f.notes.isOpen(),false);assert.equal(f.notes.renderModal(),'');
  assert.equal(JSON.parse(f.store.getItem(storageKey(f.state.scope))).version,'6.153');assert.equal(f.notes.needsAttention(),false);assert.equal(f.notes.open(),false);
  assert.equal(create(f.adapter).needsAttention(),false);
});

test('upgrading several versions shows every unacknowledged entry up to the current version',()=>{
  const f=fixture();seed(f,'6.152');f.notes.open();assert.deepEqual(versions(f.notes.renderModal()),['6.153','6.152.1']);
  const unknownVersion=(Number(history[0].version.split('.')[0])+1)+'.0';
  f.notes.acknowledge();f.state.version=unknownVersion;f.notes.open();assert.deepEqual(versions(f.notes.renderModal()),[unknownVersion]);assert.match(f.notes.renderModal(),/新しいバージョンに更新されました/);
});

test('manual history is available after confirmation and excludes future release entries',()=>{
  const f=fixture();seed(f,'6.153');assert.equal(f.notes.open({manual:true}),true);assert.deepEqual(versions(f.notes.renderModal()),['6.153','6.152.1','6.152']);
  f.notes.dismiss();f.state.version='6.152.1';f.notes.open({manual:true});assert.deepEqual(versions(f.notes.renderModal()),['6.152.1','6.152']);f.notes.acknowledge();
  assert.equal(JSON.parse(f.store.getItem(storageKey(f.state.scope))).version,'6.153');f.state.version='6.153';assert.equal(f.notes.needsAttention(),false);
});

test('version comparison is numeric and treats missing patch numbers as zero',()=>{
  assert.equal(compareVersions('6.99','6.100'),-1);assert.equal(compareVersions('6.152','6.152.0'),0);assert.equal(compareVersions('6.152.1','6.152'),1);
  const f=fixture();seed(f,'6.153.0');assert.equal(f.notes.needsAttention(),false);
});

test('accounts and environments have independent confirmation state',()=>{
  const f=fixture();f.notes.open();f.notes.acknowledge();
  for(const key of ['pos-dev:user-b','pos:user-a']){f.state.scope=key;assert.equal(f.notes.needsAttention(),true);}
  f.state.scope='pos-dev:user-a';assert.equal(f.notes.needsAttention(),false);
});

test('changing identity while visible closes without confirming either identity',()=>{
  const f=fixture();f.notes.open();f.state.scope='pos:user-b';assert.equal(f.notes.acknowledge(),true);assert.equal(f.store.data.size,0);assert.equal(f.notes.needsAttention(),true);
  f.state.scope=null;assert.equal(f.notes.needsAttention(),false);assert.equal(f.notes.open(),false);
});

test('a newer confirmation from another tab cannot be replaced by an older manual acknowledgement',()=>{
  const f=fixture();f.notes.open();seed(f,'6.154');f.notes.acknowledge();assert.equal(JSON.parse(f.store.getItem(storageKey(f.state.scope))).version,'6.154');
});

test('storage failure still confirms in memory and closes normally',()=>{
  const f=fixture({storage:{getItem(){throw Error('blocked');},setItem(){throw Error('quota');}}});
  f.notes.open();assert.equal(f.notes.acknowledge(),true);assert.equal(f.notes.needsAttention(),false);assert.deepEqual(f.events,['open','close']);
  f.state.scope='pos-dev:other';assert.equal(f.notes.needsAttention(),true);
});

test('missing or corrupt storage is treated as unseen and storage is written before onClose',()=>{
  const f=fixture();f.store.setItem(storageKey(f.state.scope),'not json');f.adapter.onClose=()=>assert.equal(JSON.parse(f.store.getItem(storageKey(f.state.scope))).version,'6.153');
  assert.equal(f.notes.needsAttention(),true);f.notes.open();f.notes.dismiss();
});

test('unknown version fallback escapes every displayed value and remains a semantic dialog',()=>{
  const f=fixture();f.state.version='<img src=x onerror="boom">';f.notes.open();const html=f.notes.renderModal();
  assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img src=x onerror=&quot;boom&quot;&gt;/);assert.match(html,/role="dialog" aria-modal="true"/);assert.match(html,/aria-labelledby="release-notes-title"/);
  f.notes.acknowledge();assert.equal(f.notes.needsAttention(),false);
});

test('mount focuses confirmation, traps Tab both ways, and restores focus and scroll after Escape',()=>{
  const d=dom(),f=fixture({document:d.doc});f.notes.open();assert.equal(d.doc.body.style.overflow,'hidden');d.doc.dialog=d.dialog;f.notes.mountModal();assert.equal(d.doc.activeElement,d.confirm);
  assert.equal(d.key('Tab').prevented,true);assert.equal(d.doc.activeElement,d.close);assert.equal(d.key('Tab',true).prevented,true);assert.equal(d.doc.activeElement,d.confirm);
  d.dialog.focus();assert.equal(d.key('Tab',true).prevented,true);assert.equal(d.doc.activeElement,d.confirm);
  f.notes.mountModal();assert.equal(d.listeners.size,1);const event=d.key('Escape');assert.equal(event.stopped,true);assert.equal(f.notes.needsAttention(),false);
  assert.equal(d.doc.activeElement,d.trigger);assert.equal(d.doc.body.style.overflow,'auto');assert.equal(d.listeners.size,0);assert.equal(d.clicks.size,0);
});

test('mounted confirmation and explicit close buttons acknowledge through delegated events',()=>{
  for(const action of ['close','confirm']){const d=dom(),f=fixture({document:d.doc});f.notes.open();d.doc.dialog=d.dialog;f.notes.mountModal();d.clicks.get('click')({target:d[action],preventDefault(){}});assert.equal(f.notes.needsAttention(),false);assert.equal(f.notes.isOpen(),false);}
});

test('a removed or superseded modal never traps keys or records confirmation',()=>{
  const d=dom();let allowed=true;const f=fixture({document:d.doc,canInteract:()=>allowed});f.notes.open();d.doc.dialog=d.dialog;f.notes.mountModal();
  allowed=false;assert.equal(d.key('Escape').prevented,false);assert.equal(d.key('Tab').prevented,false);assert.equal(f.notes.acknowledge(),false);assert.equal(f.store.data.size,0);
  allowed=true;d.doc.dialog=null;assert.equal(d.key('Escape').prevented,false);assert.equal(f.store.data.size,0);
  assert.equal(f.notes.open(),true,'a replaced modal can reopen');d.doc.dialog=d.dialog;f.notes.mountModal();d.key('Escape');assert.equal(f.notes.needsAttention(),false);
});

test('browser UMD installation does not open a modal or create timers',()=>{
  const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../release-notes.js'),'utf8'),context);assert.equal(typeof context.window.PosReleaseNotes.create,'function');
  const f=fixture();assert.equal(f.notes.isOpen(),false);assert.equal(f.notes.renderModal(),'');assert.deepEqual(f.events,[]);
});
