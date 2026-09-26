const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {contextFor}=require('./helpers/scoped-runtime.cjs');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const clone=value=>value==null?null:JSON.parse(JSON.stringify(value));
const source=(from,to)=>app.slice(app.indexOf(from),app.indexOf(to,app.indexOf(from)+from.length));

// RTDB removes null/empty children; nonempty numeric collections may be returned as arrays.
function firebaseRoundTrip(value){
  if(value==null||typeof value!=='object')return value??null;
  const result=Array.isArray(value)?[]:{};
  for(const [key,child] of Object.entries(value)){
    const next=firebaseRoundTrip(child);
    if(next!==null)result[key]=next;
  }
  return Object.keys(result).length?result:null;
}
function runtime(initial={},writeHook){
  const remote=firebaseRoundTrip(initial)||{},writes=[];
  const read=key=>key.split('/').filter(Boolean).reduce((value,part)=>value?.[part],remote)??null;
  const put=(key,value)=>{
    const parts=key.split('/'),last=parts.pop();
    const parent=parts.reduce((target,part)=>target[part]||(target[part]={}),remote);
    const normalized=firebaseRoundTrip(value);
    if(normalized===null)delete parent[last];else parent[last]=normalized;
  };
  const commit=async values=>{
    if(writeHook)await writeHook(values,()=>Object.entries(values).forEach(([key,value])=>put(key,value)));
    writes.push(clone(values));Object.entries(values).forEach(([key,value])=>put(key,value));
  };
  const db={ref:key=>({
    get:async()=>({val:()=>clone(read(key.replace(/^pos-dev\//,'')))}),
    once:async()=>({val:()=>clone(read(key.replace(/^pos-dev\//,'')))}),
    update:async updates=>commit(Object.fromEntries(Object.entries(updates).filter(([path])=>path.startsWith('pos-dev/')).map(([path,value])=>[path.slice(8),value])))
  })};
  const ctx=contextFor(db,{...clone(initial),activeBizDay:null,sessions:{},shifts:{},assignments:{},history:{}});
  Object.assign(ctx,{document:{getElementById:()=>null},MAX_TABLE_COUNT:30,
    normalizeCasts:casts=>clone(casts||[]),readRemoteRelative:async key=>clone(read(key)),guardedRootUpdate:commit});
  ctx.currentCastBizDate=()=>ctx.S.activeBizDay||'2026-09-27';
  ctx.S.casts=clone(initial.casts||[]);ctx.S.castLifecycleLogs=clone(initial.castLifecycleLogs||{});
  for(const [from,to] of [
    ['const LIGHTWEIGHT_SETTING_PATHS','const sessionSaveQueues'],
    ['function settingConflictError','function castIdQueryValues'],
    ['async function saveCastsAndLifecycle','function applyPosCastPolicy'],
    ['function castNameItemValue','async function ucn']
  ])vm.runInContext(source(from,to),ctx);
  for(const key of ['menus','tables','casts','castLifecycleLogs'])ctx.updateRemoteHash(key,read(key));
  return{ctx,remote,writes};
}
const menu=price=>({sets:[{id:'s1',price,backTargets:[],optional:null}],champagne:[],nested:{unused:{}}});

test('setting hashes accept legacy JSON and Firebase-equivalent array/null representations',()=>{
  const {ctx}=runtime();
  const old=JSON.stringify(menu(1000));
  assert.equal(ctx.settingHashMatches({sets:{0:{id:'s1',price:1000}}},old),true);
  assert.equal(ctx.settingHashMatches(null,JSON.stringify({unused:[]})),true);
  assert.equal(ctx.settingHashMatches({sets:[{id:'s1',price:2000}]},old),false);
  assert.equal(ctx.settingHashMatches({},'not json'),false);
});

test('repeated menu saves survive Firebase removal of empty categories and optional nulls',async()=>{
  const {ctx,remote,writes}=runtime({menus:menu(1000)});
  for(const price of [2000,3000,4000])await ctx.queueSettingSave('menus',menu(price));
  assert.equal(remote.menus.sets[0].price,4000);
  assert.equal(writes.length,3);
  assert.equal(ctx.settingSaveState('menus').status,'saved');
  let reapplied=false;
  ctx.acceptRemoteSettingValue('menus',clone(remote.menus),()=>{reapplied=true;});
  assert.equal(reapplied,false,'acknowledged Firebase normalization is not a new remote edit');
});

test('explicit roster drafts save repeatedly without changing committed local state',async()=>{
  const initial={casts:[{id:'c1',name:'A'}],castLifecycleLogs:{}};
  const {ctx,remote}=runtime(initial);
  const draft=[...initial.casts,{id:'c2',name:'B'}];
  const lifecycle={'2026-09-27':{enteredCasts:[{castId:'c2',name:'B',endedAt:null}],exitedCasts:[],trialCasts:[]}};
  await ctx.saveCastsAndLifecycle(draft,lifecycle);
  await ctx.saveCastsAndLifecycle([...draft,{id:'c3',name:'C'}],lifecycle);
  assert.equal(remote.casts.length,3);
  assert.equal(ctx.S.casts.length,1,'only the caller confirms the draft into S after acknowledgement');
  assert.equal(ctx.settingSaveState('casts').status,'saved');
});

test('actual remote edits still reject stale drafts and preserve the other device value',async()=>{
  const {ctx,remote,writes}=runtime({menus:menu(1000)});
  ctx.settingSaveState('menus');
  remote.menus.sets[0].price=9000;
  await assert.rejects(ctx.queueSettingSave('menus',menu(2000)),error=>error._txConflict===true&&error.settingKind==='conflict');
  assert.equal(remote.menus.sets[0].price,9000);assert.equal(writes.length,0);
  assert.equal(ctx.settingSaveState('menus').waiters.length,0);
});

test('permission errors retain their classification and a later authorized save can retry',async()=>{
  let denied=true;
  const {ctx,remote}=runtime({menus:menu(1000)},()=>{if(denied)throw Object.assign(new Error('Permission denied'),{code:'PERMISSION_DENIED'});});
  await assert.rejects(ctx.queueSettingSave('menus',menu(2000)),error=>error.settingKind==='permission'&&error.retryable===false);
  assert.match(ctx.settingSaveState('menus').message,/保存権限/);
  assert.equal(remote.menus.sets[0].price,1000);
  denied=false;await ctx.queueSettingSave('menus',menu(3000));
  assert.equal(remote.menus.sets[0].price,3000);
  assert.equal(ctx.classifySettingSaveError(new Error('network unavailable')).kind,'offline');
  assert.equal(ctx.classifySettingSaveError(new Error('invalid tables')).kind,'validation');
});

test('a lost acknowledgement recognizes an already committed normalized setting',async()=>{
  const {ctx,remote}=runtime({menus:menu(1000)},(_values,commit)=>{commit();throw new Error('network unavailable');});
  await ctx.queueSettingSave('menus',menu(2000));
  assert.equal(remote.menus.sets[0].price,2000);
  assert.equal(ctx.settingSaveState('menus').status,'saved');
});

for(const fail of [false,true])test('cast rename notifies queue waiters after '+(fail?'failure':'success'),{timeout:3000},async()=>{
  let release;
  const {ctx,remote}=runtime({casts:[{id:'c1',name:'A'}]},()=>new Promise((resolve,reject)=>{release=()=>fail?reject(new Error('network unavailable')):resolve();}));
  const rename=ctx.guardedCastNameChange('c1','Renamed').then(()=>({ok:true}),error=>({error}));
  for(let turn=0;turn<100&&!release;turn++)await new Promise(resolve=>setImmediate(resolve));
  assert.ok(release,'rename must reach the write');
  const waiting=ctx.waitForSettingSaveQueue('casts').then(()=>({ok:true}),error=>({error}));
  assert.equal(ctx.settingSaveState('casts').waiters.length,1);
  release();
  const [renamed,settled]=await Promise.all([rename,waiting]);
  assert.equal(Boolean(renamed.error),fail);assert.equal(Boolean(settled.error),fail);
  assert.equal(ctx.settingSaveState('casts').waiters.length,0);
  assert.equal(remote.casts[0].name,fail?'A':'Renamed');
});
