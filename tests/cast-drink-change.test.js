const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const core=require('../cast-drink-change.js');
const {clone,source,fixture,fakeDb,contextFor,emulator}=require('./helpers/scoped-runtime.cjs');
function state(){
  const s=fixture();s.casts=[{id:'c1',name:'Same',active:true},{id:'c2',name:'Same',active:true}];
  s.menus={castDrinks:[{id:'d3',label:'Drink 3000',price:3000}]};
  s.sessions.t1.items=[{id:'set',isSet:true,price:10000,qty:1},
    {id:'ext1',isExtension:true,isBanaiExtension:true,banaiExtCastIds:['c1'],price:4000,qty:1},
    {id:'cd_1',category:'castDrink',castId:'c1',castName:'Same',price:2000,qty:3,backTargetCastIds:['c1'],backTargetCastNames:['Same'],customField:'preserved'},
    {id:'ext2',isExtension:true,isBanaiExtension:true,banaiExtCastIds:['c2'],price:4000,qty:1}];
  return s;
}
function runtime(db,s){
  const c=contextFor(db,s);Object.assign(c,{CAST_DRINK_CHANGE:core,castDrinkChangeState:null,renderOrderPartial:()=>{},
    document:{getElementById:()=>null},
    sc:()=>c.S.casts.filter(c=>c.active!==false),isVisibleCast:c=>c.active!==false,
    gmsUniqueStrings:ids=>[...new Set(ids.map(String))],historySetEndTime:h=>h.setEndTime||null});
  c.window._posUid='scoped-test';
  vm.runInContext(source('function castDrinkChangeAllowed','function extensionAdditions'),c);
  return c;
}
function choose(c){assert.equal(c.openCastDrinkChange('cd_1'),true);assert.equal(c.selectDrinkChangeCast('c2'),true);}
function chooseEdit(c,mode){
  assert.equal(c.openCastDrinkEdit('cd_1'),true);assert.equal(c.castDrinkChangeState.mode,'choose');c.setDrinkChangeMode(mode);
  if(mode==='price'){c.selectDrinkChangeMenu('d3');c.setDrinkEditField('qty','4');}
  else c.moveDrinkEdit(1);
}

test('price and quantity edits preserve attribution and order; zero price and quantity-only edits work',()=>{
  const s=state().sessions.t1,before=clone(s),next=core.reprice(s,'cd_1',{price:3000,qty:4,menuId:'d3',menuLabel:'Drink 3000'});
  assert.deepEqual(s,before);assert.deepEqual(next.items.map(i=>i.id),s.items.map(i=>i.id));
  assert.equal(next.items[2].price,3000);assert.equal(next.items[2].qty,4);assert.equal(next.items[2].drinkMenuId,'d3');
  for(const key of ['castId','castName','backTargetCastIds','backTargetCastNames','customField'])assert.deepEqual(next.items[2][key],s.items[2][key]);
  assert.equal(core.reprice(s,'cd_1',{price:0,qty:3}).items[2].price,0);
  assert.equal(core.reprice(s,'cd_1',{price:2000,qty:2}).items[2].qty,2);
});
test('reordering crosses extension boundaries but never changes amounts, identity or other relative order',()=>{
  const s=state().sessions.t1;s.adjustedTotal=20000;
  for(const position of [0,1,3]){
    const before=clone(s),next=core.reorder(s,'cd_1',position);
    assert.deepEqual(s,before);assert.deepEqual(next.items[position],s.items[2]);assert.equal(next.adjustedTotal,20000);
    assert.deepEqual(next.items.filter(i=>i.id!=='cd_1'),s.items.filter(i=>i.id!=='cd_1'));
  }
  for(const position of [-1,4,1.5,NaN])assert.throws(()=>core.reorder(s,'cd_1',position),/position/);
  assert.throws(()=>core.reorder(s,'set',0),/missing/);
  assert.throws(()=>core.reprice(s,'cd_1',{price:1000,qty:1}),/discount/);
});
test('empty, fractional, negative and nonnumeric prices or quantities are rejected',()=>{
  const s=state().sessions.t1;
  for(const price of ['',null,undefined,-1,1.2,NaN,Infinity,10000001,true])assert.throws(()=>core.reprice(s,'cd_1',{price,qty:1}),/price/);
  for(const qty of ['',null,undefined,0,-1,1.2,NaN,Infinity,1000,true])assert.throws(()=>core.reprice(s,'cd_1',{price:1000,qty}),/qty/);
  s.items.push(clone(s.items[2]));assert.throws(()=>core.reprice(s,'cd_1',{price:1000,qty:1}),/missing/);
});
for(const mode of ['price','order']){
  test(mode+' saves atomically with an OP audit and preserves work records',async()=>{
    const s=state(),db=fakeDb(s),c=runtime(db,s);chooseEdit(c,mode);
    assert.equal(await c.saveCastDrinkChange(),true);assert.equal(db.writes.length,1);
    const audit=Object.values(s.castDrinkChanges[s.activeBizDay])[0];assert.equal(audit.kind,mode);
    assert.equal(audit.before.price,2000);assert.equal(audit.after.price,mode==='price'?3000:2000);
    assert.equal(audit.toIndex,mode==='order'?3:2);assert.equal(audit.after.qty,mode==='price'?4:3);
    assert.deepEqual(c.S.assignments,state().assignments);assert.deepEqual(c.S.shifts,state().shifts);
  });
  for(const mutation of ['cashier','list','uid','quantity','menu-local','menu-remote','day','checkout','remote-order','closed-modal','selection']){
    if(mode==='order'&&mutation.startsWith('menu-'))continue;
    test(mode+' rejects stale or unauthorized changes: '+mutation,async()=>{
      const s=state(),db=fakeDb(s),c=runtime(db,s);chooseEdit(c,mode);
      c.waitForSessionSaveQueue=async()=>{
        if(['cashier','list'].includes(mutation))c.window._posRole=mutation;
        if(mutation==='uid')c.window._posUid='another-op';
        if(mutation==='quantity')c.S.sessions.t1.items[2].qty++;
        if(mutation==='menu-local')c.S.menus.castDrinks[0].price++;
        if(mutation==='menu-remote')s.menus.castDrinks[0].price++;
        if(mutation==='day')c.S.activeBizDay='other-day';
        if(mutation==='checkout')delete s.sessions.t1;
        if(mutation==='remote-order')s.sessions.t1._rev++;
        if(mutation==='closed-modal')c.md=null;
        if(mutation==='selection')c.castDrinkChangeState.qty=99;
      };
      assert.equal(await c.saveCastDrinkChange(),false);assert.equal(db.writes.length,0);
    });
  }
  test(mode+' failure leaves both order and audit unchanged, retry and double tap write once',async()=>{
    const s=state();let fail=true;const db=fakeDb(s,()=>{if(fail)throw new Error('offline');}),c=runtime(db,s);chooseEdit(c,mode);
    const before=clone(s.sessions.t1);assert.equal(await c.saveCastDrinkChange(),false);assert.deepEqual(s.sessions.t1,before);assert.equal(s.castDrinkChanges,undefined);
    fail=false;let release;c.waitForSessionSaveQueue=()=>new Promise(resolve=>{release=resolve;});
    const first=c.saveCastDrinkChange();assert.equal(await c.saveCastDrinkChange(),false);release();assert.equal(await first,true);assert.equal(db.writes.length,1);
  });
  for(const mutation of ['local-order','selection','uid','offline','day'])test(mode+' checks again after asynchronous remote reads: '+mutation,async()=>{
    const s=state(),db=fakeDb(s),c=runtime(db,s);chooseEdit(c,mode);const ref=db.ref;
    db.ref=function(key){
      const node=ref.call(this,key),get=node.get;
      node.get=async()=>{
        if(key==='pos-dev/sessions/t1'){
          if(mutation==='local-order')c.S.sessions.t1.items[2].qty++;
          if(mutation==='selection')c.castDrinkChangeState.position=0;
          if(mutation==='uid')c.window._posUid='new-user';
          if(mutation==='offline')c.requireFirebaseReady=()=>false;
          if(mutation==='day')c.S.activeBizDay='other-day';
        }
        return get.call(node);
      };return node;
    };
    assert.equal(await c.saveCastDrinkChange(),false);assert.equal(db.writes.length,0);
  });
}

test('custom-price edit works without a live menu or changing an off-duty cast; discounts block only repricing',async()=>{
  const s=state(),db=fakeDb(s),c=runtime(db,s);s.casts[0].active=false;c.S.casts[0].active=false;
  c.openCastDrinkEdit('cd_1');c.setDrinkChangeMode('price');c.setDrinkEditField('price','0');c.setDrinkEditField('qty','2');
  assert.equal(await c.saveCastDrinkChange(),true);assert.equal(s.sessions.t1.items[2].castId,'c1');assert.equal(s.sessions.t1.items[2].price,0);
  c.S.sessions.t1.adjustedTotal=13000;s.sessions.t1=clone(c.S.sessions.t1);chooseEdit(c,'price');
  assert.equal(await c.saveCastDrinkChange(),false);assert.equal(db.writes.length,1);
  c.setDrinkChangeMode('order');c.moveDrinkEdit(1);assert.equal(await c.saveCastDrinkChange(),true);assert.equal(c.S.sessions.t1.adjustedTotal,13000);
});
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
  for(const mode of ['cast','price','order'])for(const scenario of ['ok','cashier','list','revoked','checkout-race','order-race','day-race',...(mode==='cast'?['roster-race']:mode==='price'?['menu-race']:[])]){
    const s=state();await em.reset(s);
    const c=runtime(em.db(async()=>{
      if(['cashier','list'].includes(scenario))await em.request('access/roles/scoped-test','PUT',scenario,true);
      if(scenario==='revoked')await em.request('access/authorizedUsers/scoped-test','PUT',false,true);
      if(scenario==='checkout-race')await em.request('pos-dev/sessions/t1','DELETE',undefined,true);
      if(scenario==='order-race')await em.request('pos-dev/sessions/t1/_rev','PUT',5,true);
      if(scenario==='day-race')await em.request('pos-dev/activeBizDay','PUT','2026-09-09',true);
      if(scenario==='roster-race')await em.request('pos-dev/_settingsRevisions/castRoster','PUT',1,true);
      if(scenario==='menu-race')await em.request('pos-dev/_settingsRevisions/menus','PUT',1,true);
    }),s);if(mode==='cast')choose(c);else chooseEdit(c,mode);
    assert.equal(await c.saveCastDrinkChange(),scenario==='ok',scenario);
    const audit=await em.request('pos-dev/castDrinkChanges','GET',undefined,true);
    assert.equal(!!audit,scenario==='ok',scenario+' atomic audit');
    const remote=await em.request('pos-dev/sessions/t1','GET',undefined,true);
    if(remote){
      const drink=remote.items.find(i=>i.id==='cd_1');
      assert.equal(drink.castId,scenario==='ok'&&mode==='cast'?'c2':'c1',scenario+' atomic session');
      assert.equal(drink.price,scenario==='ok'&&mode==='price'?3000:2000);
      assert.equal(drink.qty,scenario==='ok'&&mode==='price'?4:3);
      assert.equal(remote.items.indexOf(drink),scenario==='ok'&&mode==='order'?3:2);
    }
  }
});
