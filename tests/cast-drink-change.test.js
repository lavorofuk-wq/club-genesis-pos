const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const core=require('../cast-drink-change.js');
const {clone,source,fixture,fakeDb,contextFor,emulator}=require('./helpers/scoped-runtime.cjs');
function state(){
  const s=fixture();s.casts=[{id:'c1',name:'Same',active:true},{id:'c2',name:'Same',active:true}];
  s.sessions.t1.items=[{id:'set',isSet:true,price:10000,qty:1},
    {id:'ext1',isExtension:true,isBanaiExtension:true,banaiExtCastIds:['c1'],price:4000,qty:1},
    {id:'cd_1',category:'castDrink',castId:'c1',castName:'Same',price:2000,qty:3,backTargetCastIds:['c1'],backTargetCastNames:['Same'],customField:'preserved'},
    {id:'ext2',isExtension:true,isBanaiExtension:true,banaiExtCastIds:['c2'],price:4000,qty:1}];
  return s;
}
function runtime(db,s){
  const c=contextFor(db,s);Object.assign(c,{CAST_DRINK_CHANGE:core,castDrinkChangeState:null,renderOrderPartial:()=>{},
    sc:()=>c.S.casts.filter(c=>c.active!==false),isVisibleCast:c=>c.active!==false,
    gmsUniqueStrings:ids=>[...new Set(ids.map(String))],historySetEndTime:h=>h.setEndTime||null});
  c.window._posUid='scoped-test';
  vm.runInContext(source('function castDrinkChangeAllowed','function extensionAdditions'),c);
  return c;
}
function choose(c){assert.equal(c.openCastDrinkChange('cd_1'),true);assert.equal(c.selectDrinkChangeCast('c2'),true);}
test('drink change preserves row order, ID, price, quantity, discounts and unrelated metadata',()=>{
  const s=state().sessions.t1;s.adjustedTotal=23000;s.adjustedTotalTax=7200;s.adjustedTotalBaseSubtotal=24000;
  const before=clone(s),next=core.change(s,'cd_1',{id:2,name:'New'});
  assert.deepEqual(s,before);
  assert.deepEqual(next.items.map(i=>i.id),before.items.map(i=>i.id));
  for(const key of ['id','price','qty','customField'])assert.equal(next.items[2][key],before.items[2][key]);
  for(const key of ['adjustedTotal','adjustedTotalTax','adjustedTotalBaseSubtotal'])assert.equal(next[key],before[key]);
  for(const index of [0,1,3])assert.deepEqual(next.items[index],before.items[index]);
  assert.equal(next.items[2].castId,2);assert.deepEqual(next.items[2].backTargetCastIds,['2']);
  assert.deepEqual(next.items[2].backTargetCastNames,['New']);assert.equal(next.items[2].backAllocation,'orderedCast');
});
test('legacy and zero-price drinks supported; non-drinks and duplicate IDs rejected',()=>{
  assert.equal(core.isDrink({id:'cd_legacy',price:0}),true);
  for(const item of [{id:'bottle',category:'keepBottle'},{id:'cd_1',category:'castCustom'},{id:'cd_1',isSet:true},{id:'cd_1',isExtension:true}])assert.equal(core.isDrink(item),false);
  const s=state().sessions.t1;s.items[2].price=0;delete s.items[2].category;
  assert.equal(core.change(s,'cd_1',{id:'c2',name:'New'}).items[2].price,0);
  assert.throws(()=>core.change(s,'cd_1',{id:'c1',name:'Changed name'}),/unchanged/);
  assert.throws(()=>core.change(s,'set',{id:'c2',name:'New'}),/missing/);
  s.items.push(clone(s.items[2]));assert.throws(()=>core.change(s,'cd_1',{id:'c2',name:'New'}),/missing/);
});
test('successful save moves only drink attribution and records an atomic OP audit',async()=>{
  const s=state(),db=fakeDb(s),c=runtime(db,s);choose(c);
  assert.equal(await c.saveCastDrinkChange(),true);assert.equal(db.writes.length,1);
  assert.equal(c.S.sessions.t1.items[2].castId,'c2');assert.equal(s.sessions.t1._rev,5);
  assert.deepEqual(c.S.shifts,state().shifts);assert.deepEqual(c.S.assignments,state().assignments);
  const audit=Object.values(s.castDrinkChanges[s.activeBizDay]);assert.equal(audit.length,1);
  assert.equal(audit[0].fromCastId,'c1');assert.equal(audit[0].toCastId,'c2');assert.equal(audit[0].actorUid,'scoped-test');
  assert.equal(c.md,'castDetail');assert.equal(c.chargeSaveBusy,false);
});
for(const role of ['cashier','list',null])test('direct entry and save denied for role '+role,async()=>{
  const s=state(),db=fakeDb(s),c=runtime(db,s);choose(c);c.window._posRole=role;
  assert.equal(c.openCastDrinkChange('cd_1'),false);assert.equal(await c.saveCastDrinkChange(),false);assert.equal(db.writes.length,0);
});
for(const mutation of ['local-order','checkout','day','selection-cleared','closed-modal','target-inactive','target-renamed','remote-order','remote-checkout'])test('stale selection rejected: '+mutation,async()=>{
  const s=state(),db=fakeDb(s),c=runtime(db,s);choose(c);
  if(mutation==='local-order')c.S.sessions.t1.items[2].qty++;
  if(mutation==='checkout')delete c.S.sessions.t1;
  if(mutation==='day')c.S.activeBizDay='2026-09-09';
  if(mutation==='selection-cleared')c.castDrinkChangeState=null;
  if(mutation==='closed-modal')c.md=null;
  if(mutation==='target-inactive')s.casts[1].active=false;
  if(mutation==='target-renamed')s.casts[1].name='Renamed';
  if(mutation==='remote-order')s.sessions.t1._rev++;
  if(mutation==='remote-checkout')delete s.sessions.t1;
  assert.equal(await c.saveCastDrinkChange(),false);assert.equal(db.writes.length,0);assert.equal(c.chargeSaveBusy,false);
});
for(const mutation of ['quantity','added-order','note','selection-closed','table','day','offline','role','signout'])test('changes during remote reads cannot overwrite the order: '+mutation,async()=>{
  const s=state(),db=fakeDb(s),c=runtime(db,s);choose(c);
  const ref=db.ref;
  db.ref=function(key){
    const node=ref.call(this,key),get=node.get;
    node.get=async function(){
      if(key==='pos-dev/casts/1'){
        if(mutation==='quantity')c.S.sessions.t1.items[2].qty=4;
        if(mutation==='added-order')c.S.sessions.t1.items.push({id:'new',price:3000,qty:1});
        if(mutation==='note')c.S.sessions.t1.note='Updated';
        if(mutation==='selection-closed')c.md=null;
        if(mutation==='table')c.at='t2';
        if(mutation==='day')c.S.activeBizDay='2026-09-09';
        if(mutation==='offline')c.requireFirebaseReady=()=>false;
        if(mutation==='role')c.window._posRole='cashier';
        if(mutation==='signout')c.window.posClearPrivateState();
      }
      return get.call(this);
    };
    return node;
  };
  assert.equal(await c.saveCastDrinkChange(),false);assert.equal(db.writes.length,0);
  assert.equal(s.sessions.t1.items[2].castId,'c1');assert.equal(s.sessions.t1.items[2].qty,3);
  if(mutation==='quantity')assert.equal(c.S.sessions.t1.items[2].qty,4);
  if(mutation==='added-order')assert.equal(c.S.sessions.t1.items.at(-1).id,'new');
  if(mutation==='note')assert.equal(c.S.sessions.t1.note,'Updated');
  assert.equal(c.chargeSaveBusy,false);
});
test('save failure leaves the original order intact and allows retry',async()=>{
  const s=state();let fail=true;const db=fakeDb(s,()=>{if(fail)throw new Error('offline');}),c=runtime(db,s);choose(c);
  assert.equal(await c.saveCastDrinkChange(),false);assert.equal(c.S.sessions.t1.items[2].castId,'c1');assert.equal(db.writes.length,0);
  fail=false;assert.equal(await c.saveCastDrinkChange(),true);assert.equal(db.writes.length,1);
});
test('double submission writes once',async()=>{
  const s=state(),db=fakeDb(s),c=runtime(db,s);choose(c);
  let release;c.waitForSessionSaveQueue=()=>new Promise(r=>{release=r;});
  const first=c.saveCastDrinkChange();assert.equal(await c.saveCastDrinkChange(),false);release();assert.equal(await first,true);assert.equal(db.writes.length,1);
});
test('closed history must be restored before editing; restored row positions are retained',async()=>{
  const s=state(),c=runtime(fakeDb(s),s),history=clone(s.sessions.t1);
  vm.runInContext(source('function buildRestoredSessionFromHistory','async function guardedRestoreHistoryToFloor'),c);
  delete c.S.sessions.t1;assert.equal(c.openCastDrinkChange('cd_1'),false);
  const restored=c.buildRestoredSessionFromHistory(history);
  assert.deepEqual(Array.from(core.change(restored,'cd_1',{id:'c2',name:'Same'}).items,i=>i.id),history.items.map(i=>i.id));
});
test('database rules: atomic OP save, non-OP denial and concurrent update rejection',{skip:process.env.POS_RULES_EMULATOR!=='1'},async()=>{
  const em=await emulator('demo-pos-drink-change');
  for(const scenario of ['ok','cashier','list','revoked','checkout-race','order-race','day-race','roster-race']){
    const s=state();await em.reset(s);
    const c=runtime(em.db(async()=>{
      if(['cashier','list'].includes(scenario))await em.request('access/roles/scoped-test','PUT',scenario,true);
      if(scenario==='revoked')await em.request('access/authorizedUsers/scoped-test','PUT',false,true);
      if(scenario==='checkout-race')await em.request('pos-dev/sessions/t1','DELETE',undefined,true);
      if(scenario==='order-race')await em.request('pos-dev/sessions/t1/_rev','PUT',5,true);
      if(scenario==='day-race')await em.request('pos-dev/activeBizDay','PUT','2026-09-09',true);
      if(scenario==='roster-race')await em.request('pos-dev/_settingsRevisions/castRoster','PUT',1,true);
    }),s);choose(c);
    assert.equal(await c.saveCastDrinkChange(),scenario==='ok',scenario);
    const audit=await em.request('pos-dev/castDrinkChanges','GET',undefined,true);
    assert.equal(!!audit,scenario==='ok',scenario+' atomic audit');
    const remote=await em.request('pos-dev/sessions/t1','GET',undefined,true);
    if(remote)assert.equal(remote.items[2].castId,scenario==='ok'?'c2':'c1',scenario+' atomic session');
  }
});
