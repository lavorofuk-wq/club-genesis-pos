const {test}=require('node:test');
const assert=require('node:assert/strict');
const {plan,create,same}=require('../settings-store.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const base={id:'one',label:'ドリンク',price:1000};
const edit=()=>({kind:'menu',category:'drinks',id:'one',action:'edit',base:clone(base),values:{label:'ドリンク',price:'0'}});
function fixture(beforeWrite){
  let remote={value:{drinks:[clone(base),{id:'other',label:'別商品',price:500}]},revision:2},local=clone(remote.value);
  const writes=[],states=[];
  const api=create({readSnapshot:async()=>clone(remote),maxTables:30,
    async write(change,snapshot){
      if(beforeWrite)await beforeWrite({change,snapshot,remote,writes});
      if(snapshot.revision!==remote.revision)throw Object.assign(new Error('race'),{code:'PERMISSION_DENIED'});
      writes.push(clone(change.updates));remote={value:clone(change.next),revision:snapshot.revision+1};
    },apply:(_path,value)=>{local=clone(value);},onState:(_path,status)=>states.push(status),
    isRaceError:error=>error.code==='PERMISSION_DENIED'});
  return{api,writes,states,get remote(){return remote;},get local(){return local;}};
}
test('one menu edit uses a narrow indexed patch and accepts zero without mutating the input',()=>{
  const source={drinks:[clone(base)],empty:[]},draft=edit(),change=plan(draft,source);
  assert.deepEqual(Object.keys(change.updates),['menus/drinks/0']);
  assert.equal(change.next.drinks[0].price,0);assert.equal(source.drinks[0].price,1000);
});
test('Firebase-equivalent empty values do not produce a false item conflict',()=>{
  const draft=edit();draft.base.optional=[];draft.base.unused=null;
  assert.equal(plan(draft,{drinks:[base]}).next.drinks[0].price,0);
  assert.equal(same({x:[]},{}),true);
});
test('invalid prices, times and names fail before a write',()=>{
  for(const price of ['',-1,'12abc','1.2','Infinity']){
    const draft=edit();draft.values.price=price;
    assert.throws(()=>plan(draft,{drinks:[base]}),error=>error.code==='SETTINGS_VALIDATION');
  }
  const draft=edit();draft.category='sets';draft.values.minutes='0';
  assert.throws(()=>plan(draft,{sets:[base]}),error=>error.field==='minutes');
  draft.values.minutes='60';draft.values.label=' ';
  assert.throws(()=>plan(draft,{sets:[base]}),error=>error.field==='label');
});
test('unrelated changes are preserved and the original ID is used after index shifts',()=>{
  const draft=edit(),other={id:'new',label:'他端末追加',price:900};
  const change=plan(draft,{drinks:[other,base]});
  assert.deepEqual(Object.keys(change.updates),['menus/drinks/1']);
  assert.deepEqual(change.next.drinks[0],other);
});
test('same item changes or removal reject without applying the stale draft',()=>{
  assert.throws(()=>plan(edit(),{drinks:[{...base,price:2000}]}),error=>error.code==='SETTINGS_CONFLICT'&&error.current.price===2000);
  assert.throws(()=>plan(edit(),{drinks:[]}),error=>error.code==='SETTINGS_CONFLICT'&&error.current===null);
});
test('addition retries are idempotent and an empty table collection becomes null on deletion',()=>{
  const add={kind:'table',id:'new',action:'add',base:null,values:{label:'新卓',vip:false}};
  assert.equal(plan(add,[{id:'new',label:'新卓',vip:false}]).unchanged,true);
  const remove={kind:'table',id:'new',action:'delete',base:{id:'new',label:'新卓',vip:false},values:{}};
  assert.equal(plan(remove,[remove.base]).updates.tables,null);
  assert.equal(plan(remove,[]).unchanged,true);
});
test('failed writes never apply desired settings and retry remains possible',async()=>{
  let fail=true;const ctx=fixture(()=>{if(fail)throw new Error('offline');});
  await assert.rejects(ctx.api.commit(edit()),/offline/);
  assert.equal(ctx.local.drinks[0].price,1000);assert.equal(ctx.writes.length,0);
  fail=false;await ctx.api.commit(edit());
  assert.equal(ctx.local.drinks[0].price,0);
});
test('pending writes keep confirmed prices and reject duplicate submissions',async()=>{
  let release;const ctx=fixture(()=>new Promise(resolve=>{release=resolve;}));
  const pending=ctx.api.commit(edit());while(!release)await new Promise(r=>setImmediate(r));
  assert.equal(ctx.local.drinks[0].price,1000);
  await assert.rejects(ctx.api.commit(edit()),/保存中/);
  release();await pending;assert.equal(ctx.writes.length,1);
});
test('a racing edit to another item is merged with a bounded revision retry',async()=>{
  let raced=false;const ctx=fixture(({remote})=>{if(!raced){raced=true;remote.value.drinks[1].price=700;remote.revision++;}});
  await ctx.api.commit(edit());
  assert.equal(ctx.local.drinks[0].price,0);assert.equal(ctx.local.drinks[1].price,700);
  assert.equal(ctx.writes.length,1);
});
test('a race on the same item shows the competing value and does not overwrite it',async()=>{
  const ctx=fixture(({remote})=>{remote.value.drinks[0].price=3000;remote.revision++;});
  await assert.rejects(ctx.api.commit(edit()),error=>error.code==='SETTINGS_CONFLICT'&&error.current.price===3000);
  assert.equal(ctx.writes.length,0);assert.equal(ctx.local.drinks[0].price,1000);
});
test('permission denials without a changed revision are not blindly retried',async()=>{
  let calls=0;const ctx=fixture(()=>{calls++;throw Object.assign(new Error('denied'),{code:'PERMISSION_DENIED'});});
  await assert.rejects(ctx.api.commit(edit()),/denied/);assert.equal(calls,1);
});


test('zero single-charge setting is used by new charges and estimates',()=>{
  const vm=require('node:vm'),{source}=require('./helpers/scoped-runtime.cjs');
  const ctx={S:{menus:{options:[{id:'sc',price:0}]}},Number};
  vm.createContext(ctx);vm.runInContext(source('function singleChargePrice(){','function extensionMinutesTotal'),ctx);
  assert.equal(ctx.singleChargePrice(),0);
  ctx.S.menus.options=[];assert.equal(ctx.singleChargePrice(),2000);
});
test('missing single-charge option can be explicitly created with its stable ID',()=>{
  const change=plan({kind:'menu',category:'options',id:'sc',action:'add',base:null,values:{label:'シングルチャージ',price:'0'}},{});
  assert.equal(change.next.options[0].id,'sc');assert.equal(change.next.options[0].price,0);
});
