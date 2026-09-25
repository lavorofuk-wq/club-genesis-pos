const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {source,fixture,fakeDb,contextFor,clone}=require('./helpers/scoped-runtime.cjs');

function setup(splits=[{method:'cash',amount:7800}]){
  const state=fixture(),db=fakeDb(state),ctx=contextFor(db,state);
  Object.assign(ctx,{
    TAX_RATE:0.3,TOTAL_ROUND_UNIT:100,roundCharge:n=>Math.ceil(n/100)*100,
    coState:{payMethod:'cash',splits},checkoutBusy:false,checkoutError:'',md:'co2',
    document:{querySelectorAll:()=>[],getElementById:()=>null},confirm:()=>false,
    setCheckoutProgress:()=>{},startCheckoutSlowNotice:()=>{},clearCheckoutSlowNotice:()=>{},
    waitForCheckoutPaint:async()=>{},historySetEndTime:()=>null,
    setTimeout:callback=>{callback();return 0;}
  });
  ctx.S.tables=[{id:'t1',label:'T1'}];
  for(const [from,to] of [
    ['function sessionGrossSubtotal','function isV(id)'],
    ['function sameSessionIdOnly','function prepareQueuedSession'],
    ['async function checkout','function setCheckoutProgress'],
    ['function failCheckout','function tableChangeAssignments']
  ])vm.runInContext(source(from,to),ctx);
  return{ctx,state,db};
}

test('checkout rejects changed totals after queued orders, retains payment input, and allows a corrected retry',async()=>{
  const {ctx,state,db}=setup();
  ctx.waitForSessionSaveQueue=async()=>{
    state.sessions.t1.items.push({id:'added',price:1000,qty:1});
    state.sessions.t1._rev++;
    ctx.S.sessions.t1=clone(state.sessions.t1);
  };
  await ctx.checkout();
  assert.equal(db.writes.length,0);
  assert.ok(state.sessions.t1);
  assert.equal(ctx.at,'t1');
  assert.equal(ctx.coState.splits[0].amount,7800);
  assert.equal(ctx.checkoutBusy,false);
  assert.match(ctx.checkoutError,/支払|合計/);
  ctx.coState.splits[0].amount=9100;
  ctx.waitForSessionSaveQueue=async()=>{};
  await ctx.checkout();
  assert.equal(db.writes.length,1);
  assert.equal(state.sessions.t1,undefined);
  assert.equal(Object.values(state.history)[0].total,9100);
});

for(const splits of [
  [{method:'cash',amount:7800}],
  [{method:'card',amount:7800}],
  [{method:'cash',amount:3000},{method:'card',amount:4800}],
  []
])test('checkout accepts balanced payments '+JSON.stringify(splits),async()=>{
  const {ctx,state,db}=setup(splits);
  await ctx.checkout();
  assert.equal(db.writes.length,1);
  const rec=Object.values(state.history)[0];
  assert.equal(rec.total,7800);
  assert.equal(rec.splits.reduce((sum,sp)=>sum+sp.amount,0),rec.total);
});

for(const splits of [
  [{method:'cash',amount:7900}],
  [{method:'cash',amount:-100},{method:'card',amount:7900}],
  [{method:'cash',amount:0.5},{method:'card',amount:7799.5}],
  [{method:'cash',amount:NaN}],
  [{method:'other',amount:7800}]
])test('checkout rejects invalid payments '+JSON.stringify(splits),async()=>{
  const {ctx,state,db}=setup(splits);
  await ctx.checkout();
  assert.equal(db.writes.length,0);
  assert.ok(state.sessions.t1);
  assert.ok(ctx.checkoutError);
});

test('zero-total checkout rejects a positive payment and accepts zero',async()=>{
  const {ctx,state,db}=setup([{method:'cash',amount:7800}]);
  state.sessions.t1.items=[];ctx.S.sessions.t1=clone(state.sessions.t1);
  await ctx.checkout();
  assert.equal(db.writes.length,0);
  ctx.coState.splits[0].amount=0;
  await ctx.checkout();
  assert.equal(db.writes.length,1);
  assert.equal(Object.values(state.history)[0].total,0);
});

test('checkout freezes the submitted payment during asynchronous saves',async()=>{
  const {ctx,state}=setup();
  ctx.waitForSessionSaveQueue=async()=>{ctx.coState.splits[0].amount=1;};
  await ctx.checkout();
  assert.equal(Object.values(state.history)[0].splits[0].amount,7800);
});

test('checkout saves the discounted subtotal with original tax/SC and a balanced payment',async()=>{
  const {ctx,state,db}=setup([{method:'cash',amount:20000},{method:'card',amount:30000}]);
  Object.assign(state.sessions.t1,{
    items:[{isSet:true,price:50000,qty:1}],
    adjustedTotal:50000,adjustedTotalBaseSubtotal:50000,adjustedTotalTax:15000
  });
  ctx.S.sessions.t1=clone(state.sessions.t1);
  await ctx.checkout();
  assert.equal(db.writes.length,1);
  const rec=Object.values(state.history)[0];
  assert.equal(rec.grossSubtotal,50000);
  assert.equal(rec.subtotal,35000);
  assert.equal(rec.tax,15000);
  assert.equal(rec.discount,15000);
  assert.equal(rec.total,50000);
  assert.equal(rec.splits.reduce((sum,sp)=>sum+sp.amount,0),50000);
  assert.equal(rec.items[0].price,50000,'the original order price must remain unchanged');
});

test('checkout rejects blank and fractional DOM inputs without rounding or clearing them',async()=>{
  for(const value of ['', '7800.5', '-1']){
    const {ctx,db}=setup();
    ctx.document.querySelectorAll=()=>[{value}];
    await ctx.checkout();
    assert.equal(db.writes.length,0);
    assert.equal(ctx.coState.splits[0].amount,value===''?NaN:Number(value));
  }
});

test('checkout rejects a changed remote session without printing or closing the floor',async()=>{
  const {ctx,state,db}=setup();
  ctx.waitForSessionSaveQueue=async()=>{
    state.sessions.t1.items.push({price:1000,qty:1});
    state.sessions.t1._rev++;
  };
  await ctx.checkout();
  assert.equal(db.writes.length,0);
  assert.ok(state.sessions.t1);
  assert.equal(ctx.at,'t1');
  assert.ok(ctx.checkoutError);
});

test('repeat checkout clicks cannot submit twice while awaiting pending orders',async()=>{
  const {ctx,db}=setup();
  let release;
  ctx.waitForSessionSaveQueue=()=>new Promise(resolve=>{release=resolve;});
  const pending=ctx.checkout();
  await Promise.resolve();
  await ctx.checkout();
  assert.equal(ctx.checkoutBusy,true);
  assert.equal(db.writes.length,0);
  release();
  await pending;
  assert.equal(db.writes.length,1);
});

test('checkout modal and live input use the same nonnegative integer and balance validation',()=>{
  const {ctx}=setup();
  ctx.fmt=String;ctx.pAmt=n=>'YEN '+n;
  vm.runInContext(source('function spSetMethod','// ===== 履歴支払変更'),ctx);
  const modal=source('else if(md==="co2"&&s)','else if(md==="disc"&&s)');
  vm.runInContext('function paymentModal(){let h="";const s=S.sessions[at];if(false){}'+modal+'return h;}',ctx);
  const button={style:{}},remaining={style:{}};
  ctx.document.getElementById=id=>id==='sp-confirm-btn'?button:remaining;
  for(const [input,disabled] of [['7800',false],['',true],['7800.5',true],['-1',true],['0',true]]){
    ctx.spUpdateAmt(0,input);
    assert.equal(button.disabled,disabled,input);
    assert.equal(/id="sp-confirm-btn"[^>]* disabled/.test(ctx.paymentModal()),disabled,input);
  }
  ctx.coState.splits=[{method:'cash',amount:-100},{method:'card',amount:7900}];
  assert.match(ctx.paymentModal(),/id="sp-confirm-btn"[^>]* disabled/);
  ctx.S.sessions.t1.items=[];
  ctx.coState.splits=[{method:'cash',amount:7800}];
  assert.match(ctx.paymentModal(),/超過/);
  assert.match(ctx.paymentModal(),/id="sp-confirm-btn"[^>]* disabled/);
  ctx.spUpdateAmt(0,'0');
  assert.equal(button.disabled,false);
  assert.doesNotMatch(ctx.paymentModal(),/id="sp-confirm-btn"[^>]* disabled/);
  ctx.document.querySelectorAll=()=>[{value:'0.5'}];
  ctx.spAdd(0);
  assert.equal(ctx.coState.splits[0].amount,0.5,'adding a payment does not silently truncate invalid amounts');
});
