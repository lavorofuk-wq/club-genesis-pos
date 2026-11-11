const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const core=require('../cast-drink-change.js');
const {items}=require('./helpers/banai-order-fixture.cjs');
const {clone,source,fixture,fakeDb,contextFor,emulator}=require('./helpers/scoped-runtime.cjs');
const category=item=>item.category||'';
function state(){
  const s=fixture();s.casts=[{id:'a',name:'A',active:true},{id:'b',name:'B',active:true}];
  Object.assign(s.sessions.t1,{items:items(),banaiShimeis:['a','b'],honShimeis:[],guests:1,totalGuests:1});
  return s;
}
function runtime(db,s){
  const c=contextFor(db,s);Object.assign(c,{CAST_DRINK_CHANGE:core,castDrinkChangeState:null,renderOrderPartial:()=>{},
    document:{getElementById:()=>null,querySelector:()=>null},gmsItemCategory:category,
    sc:()=>c.S.casts.filter(c=>c.active!==false),isVisibleCast:c=>c.active!==false,
    gmsUniqueStrings:ids=>[...new Set(ids.map(String))],historySetEndTime:h=>h.setEndTime||null});
  c.window._posUid='scoped-test';vm.runInContext(source('function castDrinkChangeAllowed','function extensionAdditions'),c);return c;
}
function choose(c){
  assert.equal(c.openBanaiOrderChange('nom-b'),true);
  while(c.castDrinkChangeState.position>2)c.moveDrinkEdit(-1);
  c.selectBanaiOrderCast('ext1','a',true);c.selectBanaiOrderCast('ext1','b',true);
}
function move(s,id,position,selections){return core.reorderBanai(s,id,position,selections,category);}
test('crossed extensions require explicit reselection from preceding nominations only',()=>{
  const s=state().sessions.t1,before=clone(s),plan=core.banaiPlan(s,'nom-b',2);
  assert.deepEqual(plan.extensions.map(g=>g.id),['ext1']);
  assert.deepEqual(plan.extensions[0].candidates.map(c=>c.id),['a','b']);
  assert.throws(()=>move(s,'nom-b',2,{}),/selection-required/);
  assert.throws(()=>move(s,'nom-b',2,{ext1:['c']}),/selection-invalid/);
  assert.throws(()=>move(s,'nom-b',2,{ext1:['a','a']}),/selection-invalid/);
  const next=move(s,'nom-b',2,{ext1:['a','b']});
  for(const id of ['ext1','sc1','room1','bottle1']){
    const i=next.items.find(i=>i.id===id);
    assert.deepEqual(i.banaiExtCastIds||i.backTargetCastIds,['a','b'],id);
  }
  assert.deepEqual(next.items.find(i=>i.id==='bottle1').backTargetCastNames,['A','B']);
  assert.equal(next.items.find(i=>i.id==='bottle1').backAllocation,'equal');
  for(const id of ['nom-a','nom-b','cd_a','ext2','bottle2','guest'])assert.deepEqual(next.items.find(i=>i.id===id),s.items.find(i=>i.id===id),id);
  for(const i of next.items){const old=s.items.find(j=>j.id===i.id);assert.equal(i.price,old.price);assert.equal(i.qty,old.qty);}
  assert.deepEqual(s,before);assert.deepEqual(next.banaiShimeis,s.banaiShimeis);
  assert.deepEqual(next.items.filter(i=>i.id!=='nom-b').map(i=>i.id),s.items.filter(i=>i.id!=='nom-b').map(i=>i.id));
});
test('moving past multiple extensions permits an explicit empty allocation and clears bottle backs',()=>{
  const s=state().sessions.t1,plan=core.banaiPlan(s,'nom-a',9);
  assert.deepEqual(plan.extensions.map(g=>[g.id,g.candidates.map(c=>c.id)]),[['ext1',[]],['ext2',['b']]]);
  assert.throws(()=>move(s,'nom-a',9,{ext1:[],ext2:['a']}),/selection-invalid/);
  assert.throws(()=>move(s,'nom-a',9,{ext1:[]}),/selection-required/);
  const next=move(s,'nom-a',9,{ext1:[],ext2:['b']});
  for(const id of ['ext1','sc1','room1']){const i=next.items.find(i=>i.id===id);assert.equal(i.isBanaiExtension,true);assert.deepEqual(i.banaiExtCastIds,[]);}
  const bottle=next.items.find(i=>i.id==='bottle1');assert.deepEqual(bottle.backTargetCastIds,[]);assert.equal(bottle.castId,'');assert.equal(bottle.backType,'');assert.equal(bottle.backAllocation,'');
  assert.deepEqual(next.items.find(i=>i.id==='cd_a'),s.items.find(i=>i.id==='cd_a'));
});
test('a later empty extension resets allocation instead of inheriting an earlier selected cast',()=>{
  const s=state().sessions.t1;
  const next=move(s,'nom-b',10,{ext2:[]});
  assert.deepEqual(next.items.find(i=>i.id==='ext1'),s.items.find(i=>i.id==='ext1'));
  assert.deepEqual(next.items.find(i=>i.id==='ext2').banaiExtCastIds,[]);
  assert.deepEqual(next.items.find(i=>i.id==='bottle2').backTargetCastIds,[]);
});
test('normal extensions become attributed and the next untouched normal extension resets the phase',()=>{
  const s=state().sessions.t1;
  for(const i of s.items)if(i.isBanaiExtension){delete i.isBanaiExtension;delete i.banaiExtCastIds;delete i.banaiExtCastNames;}
  const next=move(s,'nom-b',2,{ext1:['b']});
  assert.deepEqual(next.items.find(i=>i.id==='ext1').banaiExtCastIds,['b']);
  assert.deepEqual(next.items.find(i=>i.id==='bottle1').backTargetCastIds,['b']);
  assert.deepEqual(next.items.find(i=>i.id==='ext2').banaiExtCastIds,[]);
});
test('linked extension charges cannot be split and UI movement skips the entire group',()=>{
  const s=state().sessions.t1;
  for(const pos of [3,4])assert.throws(()=>core.banaiPlan(s,'nom-b',pos),/group-split/);
  assert.equal(core.nextBanaiPosition(s,'nom-b',5,-1),2);
  assert.equal(core.nextBanaiPosition(s,'nom-b',2,1),5);
  assert.equal(core.nextBanaiPosition(s,'nom-b',0,-1),0);
});
test('legacy scalar targets and ungrouped extension children are rewritten without stale cast IDs',()=>{
  const s=state().sessions.t1;
  for(const i of s.items)if(i.isBanaiExtension){delete i.groupId;i.castId=i.banaiExtCastIds[0];i.castName=i.banaiExtCastNames[0];i.banaiExtCastId=i.castId;delete i.banaiExtCastIds;}
  const next=move(s,'nom-b',2,{ext1:['b']});
  for(const id of ['ext1','sc1','room1']){const i=next.items.find(i=>i.id===id);assert.deepEqual(i.banaiExtCastIds,['b']);assert.equal(i.castId,undefined);assert.equal(i.banaiExtCastId,undefined);}
});
test('guest joins during an extension remain charges, not new extension boundaries',()=>{
  const s=state().sessions.t1;
  s.items.splice(7,0,{id:'joined',isSet:true,isExtension:true,isBanaiExtension:true,addedGuests:1,guestSetTarget:'ext1',groupId:'ext1',minutes:60,price:10000,qty:1,banaiExtCastIds:['a'],banaiExtCastNames:['A']});
  s.items.splice(5,0,{id:'free',groupId:'ext1',isFreeDrink:true,price:1000,qty:1});
  const within=core.banaiPlan(s,'nom-b',7);assert.equal(within.extensions.length,0);
  const next=move(s,'nom-b',2,{ext1:['a','b']});
  assert.deepEqual(next.items.find(i=>i.id==='joined').banaiExtCastIds,['a','b']);
  assert.deepEqual(next.items.find(i=>i.id==='free'),s.items.find(i=>i.id==='free'));
  assert.equal(next.items.find(i=>i.id==='joined').addedGuests,1);
});
test('within-phase moves and hon tables preserve all attribution, discounts and back targets',()=>{
  const s=state().sessions.t1;s.adjustedTotal=60000;s.adjustedTotalTax=18300;s.adjustedTotalBaseSubtotal=61000;
  const within=move(s,'nom-b',6,{});assert.deepEqual(within.items.filter(i=>i.id!=='nom-b'),s.items.filter(i=>i.id!=='nom-b'));
  s.items.push({id:'hon',isHonShimei:true,castId:'a',castName:'A',price:2000,qty:1});
  assert.equal(core.banaiPlan(s,'nom-b',2).extensions.length,0);
  const hon=move(s,'nom-b',2,{});
  assert.deepEqual(hon.items.filter(i=>i.id!=='nom-b'),s.items.filter(i=>i.id!=='nom-b'));
  for(const k of ['adjustedTotal','adjustedTotalTax','adjustedTotalBaseSubtotal','guests','totalGuests','startTime','setEndTime'])assert.equal(hon[k],s[k]);
});
test('unsupported or ambiguous records fail without guessing; drinks remain drink-only',()=>{
  const s=state().sessions.t1;
  assert.throws(()=>core.change(s,'nom-a',{id:'b',name:'B'}),/target-missing/);
  assert.throws(()=>core.reprice(s,'nom-a',{price:1000,qty:1}),/target-missing/);
  assert.throws(()=>core.reorder(s,'nom-a',0),/target-missing/);
  assert.throws(()=>core.banaiPlan(s,'cd_a',0),/target-missing/);
  for(const pos of [-1,11,NaN,1.5])assert.throws(()=>core.banaiPlan(s,'nom-a',pos),/position-invalid/);
  for(const mutate of [s=>s.items.push({...s.items[1]}),s=>s.items.push({...s.items[1],id:'duplicate-cast'}),s=>s.items[3].groupId='missing',s=>s.items[3].banaiExtCastIds=['b']]){
    const bad=clone(s);mutate(bad);assert.throws(()=>core.banaiPlan(bad,'nom-b',2),/group-invalid/);
  }
});
test('OP save commits reordered nominations, selected extensions and bottle backs with one audit',async()=>{
  const s=state(),db=fakeDb(s),c=runtime(db,s),before=clone(s);choose(c);
  c.setDrinkChangeMode('price');assert.equal(c.castDrinkChangeState.mode,'order');
  assert.equal(await c.saveCastDrinkChange(),true);assert.equal(db.writes.length,1);assert.equal(c.md,'setDetail');
  const audit=Object.values(s.banaiOrderChanges[s.activeBizDay])[0];
  assert.deepEqual(audit.extensions,{ext1:['a','b']});assert.equal(audit.changedItems.length,4);assert.equal(audit.fromIndex,7);assert.equal(audit.toIndex,2);
  assert.deepEqual(c.S.assignments,before.assignments);assert.deepEqual(c.S.shifts,before.shifts);
});
for(const mutation of ['cashier','list','uid','local-order','remote-order','checkout','day','modal','selection','mode','offline'])test('atomic save rejects stale state: '+mutation,async()=>{
  const s=state(),db=fakeDb(s),c=runtime(db,s);choose(c);
  c.waitForSessionSaveQueue=async()=>{
    if(['cashier','list'].includes(mutation))c.window._posRole=mutation;
    if(mutation==='uid')c.window._posUid='other';
    if(mutation==='local-order')c.S.sessions.t1.items[0].qty++;
    if(mutation==='remote-order')s.sessions.t1._rev++;
    if(mutation==='checkout')delete s.sessions.t1;
    if(mutation==='day')c.S.activeBizDay='other';
    if(mutation==='modal')c.md=null;
    if(mutation==='selection')c.castDrinkChangeState.extensions.ext1=['b'];
    if(mutation==='mode')c.castDrinkChangeState.mode='price';
    if(mutation==='offline')c.requireFirebaseReady=()=>false;
  };
  assert.equal(await c.saveCastDrinkChange(),false);assert.equal(db.writes.length,0);assert.equal(s.banaiOrderChanges,undefined);
});
for(const mutation of ['selection','local-order','uid','role','day','offline'])test('rechecks after remote reads: '+mutation,async()=>{
  const s=state(),db=fakeDb(s),c=runtime(db,s);choose(c);const ref=db.ref;
  db.ref=function(key){const node=ref.call(this,key),get=node.get;node.get=async()=>{
    if(key==='pos-dev/sessions/t1'){
      if(mutation==='selection')c.castDrinkChangeState.extensions.ext1=[];
      if(mutation==='local-order')c.S.sessions.t1.items[0].price++;
      if(mutation==='uid')c.window._posUid='other';
      if(mutation==='role')c.window._posRole='cashier';
      if(mutation==='day')c.S.activeBizDay='other';
      if(mutation==='offline')c.requireFirebaseReady=()=>false;
    }return get.call(node);};return node;};
  assert.equal(await c.saveCastDrinkChange(),false);assert.equal(db.writes.length,0);
});
test('no-op, unconfirmed selections and forced price/cast modes never save',async()=>{
  const s=state(),db=fakeDb(s),c=runtime(db,s);c.openBanaiOrderChange('nom-b');
  assert.equal(await c.saveCastDrinkChange(),false);c.moveDrinkEdit(-1);c.moveDrinkEdit(-1);c.moveDrinkEdit(-1);
  assert.equal(await c.saveCastDrinkChange(),false);
  for(const mode of ['price','cast']){c.castDrinkChangeState.mode=mode;assert.equal(await c.saveCastDrinkChange(),false);}
  assert.equal(db.writes.length,0);
});
test('failures are atomic, retries succeed and double submissions only write once',async()=>{
  const s=state();let fail=true;const db=fakeDb(s,()=>{if(fail)throw Error('offline');}),c=runtime(db,s);choose(c);const before=clone(s.sessions.t1);
  assert.equal(await c.saveCastDrinkChange(),false);assert.deepEqual(s.sessions.t1,before);assert.equal(s.banaiOrderChanges,undefined);
  fail=false;let release;c.waitForSessionSaveQueue=()=>new Promise(r=>release=r);
  const first=c.saveCastDrinkChange();assert.equal(await c.saveCastDrinkChange(),false);release();assert.equal(await first,true);assert.equal(db.writes.length,1);
});
test('closed history cannot be edited until restored; restored nominations remain reorderable',()=>{
  const s=state(),c=runtime(fakeDb(s),s),history=clone(s.sessions.t1);
  vm.runInContext(source('function buildRestoredSessionFromHistory','async function guardedRestoreHistoryToFloor'),c);
  delete c.S.sessions.t1;assert.equal(c.openBanaiOrderChange('nom-a'),false);
  c.S.sessions.t1=c.buildRestoredSessionFromHistory(history);choose(c);
  assert.deepEqual(clone(c.drinkEditDesired(c.S.sessions.t1,c.castDrinkChangeState).items.find(i=>i.id==='bottle1').backTargetCastIds),['a','b']);
});
test('database rules enforce OP-only atomic nomination edits',{skip:process.env.POS_RULES_EMULATOR!=='1'},async()=>{
  const em=await emulator('demo-pos-banai-order');
  for(const scenario of ['ok','cashier','list','revoked','checkout-race','order-race','day-race']){
    const s=state();await em.reset(s);
    const c=runtime(em.db(async()=>{
      if(['cashier','list'].includes(scenario))await em.request('access/roles/scoped-test','PUT',scenario,true);
      if(scenario==='revoked')await em.request('access/authorizedUsers/scoped-test','PUT',false,true);
      if(scenario==='checkout-race')await em.request('pos-dev/sessions/t1','DELETE',undefined,true);
      if(scenario==='order-race')await em.request('pos-dev/sessions/t1/_rev','PUT',5,true);
      if(scenario==='day-race')await em.request('pos-dev/activeBizDay','PUT','other',true);
    }),s);choose(c);assert.equal(await c.saveCastDrinkChange(),scenario==='ok');
    assert.equal(!!await em.request('pos-dev/banaiOrderChanges','GET',undefined,true),scenario==='ok');
  }
});
