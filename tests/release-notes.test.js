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
function versions(html){return [...html.matchAll(/class="rn-list-version">Ver([^<]+)/g)].map(match=>match[1]);}
function dom(){
  const listeners=new Map(),events=new Map(),doc={body:{style:{overflow:'auto'}},activeElement:null,dialog:null};
  doc.addEventListener=(type,listener)=>listeners.set(type,listener);doc.removeEventListener=(type,listener)=>{if(listeners.get(type)===listener)listeners.delete(type);};
  let entryButtons=[];
  function matches(element,selector){
    if(selector.startsWith('#'))return element.id===selector.slice(1);
    const match=selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);if(!match)return false;
    const value=element.getAttribute(match[1]);return match[2]===undefined?value!==null:value===match[2];
  }
  function node(dataset={},id=''){
    const attributes={},element={dataset,id,isConnected:true,hidden:false,hiddenParent:false,cssHidden:false,style:{},
      focus(){doc.activeElement=this;if(dialog.contains(this))events.get('focusin')?.({target:this});},
      getAttribute(name){if(name==='id')return this.id||null;if(name.startsWith('data-')){const key=name.slice(5).replace(/-([a-z])/g,(_,char)=>char.toUpperCase());return this.dataset[key]??null;}return attributes[name]??null;},
      setAttribute:(name,value)=>{attributes[name]=String(value);},
      getClientRects(){return this.cssHidden?[]:[{}];},
      closest(selector){if(this.hiddenParent&&selector.includes('[hidden]'))return{};return selector.split(',').some(part=>matches(this,part.trim()))?this:null;}
    };return element;
  }
  const close=node({releaseNotesAction:'dismiss'}),confirm=node({releaseNotesAction:'acknowledge'}),trigger=node({},'opener');
  const updates=node({releaseNotesView:'updates'}),history=node({releaseNotesView:'history'}),select=node({},'release-notes-select');select.value='0';
  const content=Object.assign(node({},'release-notes-content'),{innerHTML:'',scrollTop:0}),list={};content.setAttribute('tabindex','0');
  Object.defineProperty(list,'innerHTML',{set(html){entryButtons.forEach(button=>button.isConnected=false);entryButtons=[...html.matchAll(/data-release-notes-entry="(\d+)"/g)].map(match=>node({releaseNotesEntry:match[1]}));}});
  const all=()=>[close,updates,history,...entryButtons,select,content,confirm];
  const dialog={
    contains:element=>element===dialog||all().includes(element),
    querySelectorAll(selector){if(selector.startsWith('button:not'))return all();return all().filter(element=>matches(element,selector));},
    querySelector(selector){if(selector==='.rn-list')return list;if(selector==='.rn-content')return content;return all().find(element=>matches(element,selector))||null;},
    focus(){doc.activeElement=dialog;},
    addEventListener:(type,listener)=>events.set(type,listener),removeEventListener:(type,listener)=>{if(events.get(type)===listener)events.delete(type);}
  };
  doc.getElementById=id=>id==='release-notes-dialog'?doc.dialog:id===trigger.id?trigger:null;doc.activeElement=trigger;
  const result={doc,dialog,close,confirm,trigger,updates,history,select,content,list,listeners,clicks:events,
    mount(notes){doc.dialog=dialog;list.innerHTML=notes.renderModal();notes.mountModal();},
    get entries(){return entryButtons;},
    click(target){const event={target,preventDefault(){}};events.get('click')?.(event);},
    change(value){select.value=value;events.get('change')?.({target:select});},
    key(key,shiftKey=false){const event={key,shiftKey,prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};listeners.get('keydown')?.(event);return event;}
  };return result;
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
  f.notes.acknowledge();seed(f,history[0].version);f.state.version=unknownVersion;f.notes.open();assert.deepEqual(versions(f.notes.renderModal()),[unknownVersion]);assert.match(f.notes.renderModal(),/新しいバージョンに更新されました/);
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


test('the two views keep the opening unread set and show exactly one selected article',()=>{
  const f=fixture();seed(f,'6.152');const before=f.store.getItem(storageKey(f.state.scope));f.notes.open();
  let html=f.notes.renderModal();assert.deepEqual(versions(html),['6.153','6.152.1']);assert.match(html,/data-release-notes-view="updates"[^>]*aria-pressed="true"/);
  assert.equal((html.match(/<article /g)||[]).length,1);assert.match(html,/<p class="rn-version">Ver6\.153<\/p>/);
  assert.equal(f.notes.selectEntry(1),true);html=f.notes.renderModal();assert.match(html,/<p class="rn-version">Ver6\.152\.1<\/p>/);assert.match(html,/data-release-notes-entry="1" aria-current="true"/);
  assert.equal(f.notes.setView('history'),true);assert.deepEqual(versions(f.notes.renderModal()),['6.153','6.152.1','6.152']);f.notes.selectEntry(2);
  assert.match(f.notes.renderModal(),/<p class="rn-version">Ver6\.152<\/p>/);f.notes.setView('updates');
  assert.deepEqual(versions(f.notes.renderModal()),['6.153','6.152.1']);assert.match(f.notes.renderModal(),/<p class="rn-version">Ver6\.153<\/p>/);
  assert.equal(f.store.getItem(storageKey(f.state.scope)),before,'selection is not confirmation');assert.equal(f.notes.needsAttention(),true);
});

test('a confirmed manual opening starts in history and its update view contains only the current release',()=>{
  const f=fixture();f.state.version='6.154';seed(f,'6.154');f.notes.open({manual:true});
  assert.match(f.notes.renderModal(),/data-release-notes-view="history"[^>]*aria-pressed="true"/);
  assert.deepEqual(versions(f.notes.renderModal()),history.filter(entry=>compareVersions(entry.version,'6.154')!==1).map(entry=>entry.version));
  f.notes.setView('updates');assert.deepEqual(versions(f.notes.renderModal()),['6.154']);assert.equal(f.notes.selectEntry(1),false);assert.equal(f.notes.needsAttention(),false);
});

test('confirming while an old entry is selected records the opened application version',()=>{
  const f=fixture();f.notes.open({manual:true});f.notes.selectEntry(2);f.notes.acknowledge();
  assert.equal(JSON.parse(f.store.getItem(storageKey(f.state.scope))).version,'6.153');assert.equal(f.notes.needsAttention(),false);
});

test('invalid view and selection inputs do not alter the current article',()=>{
  const f=fixture();assert.equal(f.notes.setView('history'),false);assert.equal(f.notes.selectEntry(0),false);f.notes.open();const before=f.notes.renderModal();
  for(const index of [-1,1,0.5,NaN,undefined,null,'','x','<img>'])assert.equal(f.notes.selectEntry(index),false);
  for(const view of ['',null,'other'])assert.equal(f.notes.setView(view),false);assert.equal(f.notes.renderModal(),before);
});

test('delegated list, tab and mobile selection preserve focus and reset only detail scrolling',()=>{
  const d=dom(),f=fixture({document:d.doc});f.notes.open({manual:true});d.mount(f.notes);const before=f.store.data.size;
  const selected=d.entries[1];selected.focus();d.content.scrollTop=120;d.click(selected);
  assert.equal(d.doc.activeElement,selected);assert.equal(selected.getAttribute('aria-current'),'true');assert.equal(d.content.scrollTop,0);assert.match(d.content.innerHTML,/<p class="rn-version">Ver6\.152\.1<\/p>/);
  d.select.focus();d.content.scrollTop=80;d.change('2');assert.equal(d.doc.activeElement,d.select);assert.equal(d.content.scrollTop,0);assert.match(d.content.innerHTML,/<p class="rn-version">Ver6\.152<\/p>/);
  d.updates.focus();d.click(d.updates);assert.equal(d.doc.activeElement,d.updates);assert.equal(d.updates.getAttribute('aria-pressed'),'true');assert.equal(d.entries.length,1);assert.equal(d.select.value,'0');
  d.history.focus();d.click(d.history);assert.equal(d.doc.activeElement,d.history);assert.equal(d.entries.length,3);assert.equal(f.store.data.size,before);
});

test('a remount restores the current control and hidden ancestors are excluded from focus trapping',()=>{
  const d=dom(),f=fixture({document:d.doc});f.notes.open({manual:true});d.mount(f.notes);d.history.focus();d.doc.activeElement=d.trigger;f.notes.mountModal();assert.equal(d.doc.activeElement,d.history);
  d.close.hiddenParent=true;d.updates.cssHidden=true;d.confirm.focus();d.key('Tab');assert.equal(d.doc.activeElement,d.history);
  d.close.hiddenParent=false;d.confirm.focus();d.key('Tab');assert.equal(d.doc.activeElement,d.close);
});

test('priority locks and a replaced dialog block every delegated view or selection operation',()=>{
  const d=dom();let allowed=true;const f=fixture({document:d.doc,canInteract:()=>allowed});f.notes.open({manual:true});d.mount(f.notes);
  const original=f.notes.renderModal();allowed=false;d.click(d.updates);d.click(d.entries[1]);d.change('2');assert.equal(f.notes.selectEntry(1),false);assert.equal(f.notes.setView('updates'),false);assert.equal(f.notes.renderModal(),original);
  allowed=true;d.doc.dialog=null;d.click(d.updates);d.change('2');assert.equal(f.notes.renderModal(),original);assert.equal(f.store.data.size,0);
});


test('the scrollable detail is a named keyboard region and remains in the focus sequence',()=>{
  const d=dom(),f=fixture({document:d.doc});f.notes.open();d.mount(f.notes);
  assert.match(f.notes.renderModal(),/id="release-notes-content" class="rn-content" tabindex="0" role="region" aria-labelledby="release-note-heading"/);
  d.content.focus();assert.equal(d.key('Tab').prevented,false,'native Tab may proceed from detail to confirmation');assert.equal(d.key('Tab',true).prevented,false,'native reverse Tab may return to the picker or list');
  d.doc.activeElement=d.trigger;f.notes.mountModal();assert.equal(d.doc.activeElement,d.content,'a rerender retains focus on the reading region');
  assert.equal(f.store.data.size,0,'reading does not acknowledge the release');
});
