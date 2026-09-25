const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {source,clone}=require('./helpers/scoped-runtime.cjs');

function setup(overrides={}){
  const session={items:[{id:'set',isSet:true,label:'Set',price:50000,qty:1}],...overrides};
  const input={value:'50000',focus(){}};
  const saved=[];
  const ctx={
    TAX_RATE:0.3,TOTAL_ROUND_UNIT:100,
    roundCharge:n=>Math.ceil(Math.max(0,Number(n)||0)/100)*100,
    S:{sessions:{t1:session}},at:'t1',
    document:{getElementById:()=>input},fmt:n=>Number(n).toLocaleString('ja-JP'),
    save:(path,value)=>saved.push({path,value:clone(value)}),closeM:()=>{},renderOrderPartial:()=>{}
  };
  vm.createContext(ctx);
  vm.runInContext(source('function sessionGrossSubtotal','function isV(id)'),ctx);
  vm.runInContext(source('function adjustedTotalResult','function addSetToSession'),ctx);
  return{ctx,session,input,saved};
}

for(const [target,subtotal,discount] of [[50000,35000,15000],[60000,45000,5000]]){
  test('applying '+target+' fixes original tax/SC and deducts the full discount from subtotal',()=>{
    const {ctx,session,input,saved}=setup();
    input.value=String(target);
    const preview=ctx.adjustedTotalResult(session,input.value);
    assert.equal(preview.valid,true);
    assert.equal(preview.subtotal,subtotal);
    assert.equal(preview.tax,15000);
    assert.equal(preview.discount,discount);
    ctx.applyAdjustedTotal();
    assert.equal(saved.length,1);
    assert.equal(saved[0].value.adjustedTotalTax,15000);
    const totals=ctx.ct(saved[0].value);
    assert.equal(totals.grossSubtotal,50000);
    assert.equal(totals.subtotal,subtotal);
    assert.equal(totals.tax,15000);
    assert.equal(totals.discount,discount);
    assert.equal(totals.total,target);
    assert.equal(totals.subtotal+totals.tax,totals.total);
    const html=ctx.adjustedTotalPreviewHtml(preview);
    assert.ok(html.includes('¥'+ctx.fmt(subtotal)));
    assert.ok(html.includes('¥15,000'));
    assert.ok(html.includes('¥'+ctx.fmt(target)));
  });
}

test('changing and removing a discount always use the original amount, without cumulative discounts',()=>{
  const {ctx,session,input}=setup();
  for(const [target,subtotal] of [[60000,45000],[50000,35000],[63000,48000]]){
    input.value=String(target);ctx.applyAdjustedTotal();
    assert.equal(ctx.ct(session).tax,15000);
    assert.equal(ctx.ct(session).subtotal,subtotal);
  }
  ctx.clearAdjustedTotal();
  for(const key of ['adjustedTotal','adjustedTotalBaseSubtotal','adjustedTotalTax'])assert.equal(session[key],undefined);
  assert.equal(ctx.ct(session).total,65000);
  input.value='50000';ctx.applyAdjustedTotal();
  input.value='65000';ctx.applyAdjustedTotal();
  assert.equal(session.adjustedTotalTax,undefined);
  assert.equal(ctx.ct(session).total,65000);
});

test('legacy in-progress discounts keep their stored behavior until explicitly reapplied',()=>{
  const {ctx,session,input}=setup({adjustedTotal:50000,adjustedTotalBaseSubtotal:50000});
  const before=clone(session);
  assert.equal(ctx.ct(session).subtotal,38400);
  assert.equal(ctx.ct(session).tax,11600);
  assert.deepEqual(session,before);
  input.value='50000';ctx.applyAdjustedTotal();
  assert.equal(ctx.ct(session).subtotal,35000);
  assert.equal(ctx.ct(session).tax,15000);
  const free=setup({adjustedTotal:0,adjustedTotalBaseSubtotal:50000});
  assert.equal(free.ctx.ct(free.session).total,0);
  assert.equal(free.ctx.ct(free.session).tax,0);
});

test('invalid totals and totals below fixed tax cannot be applied',()=>{
  const {ctx,session,input,saved}=setup();
  const before=clone(session);
  for(const value of ['', 'bad', 'Infinity', '-100', '0', '14900', '49999', '49999.9', '50000.1', '65100']){
    input.value=value;
    assert.equal(ctx.adjustedTotalResult(session,value).valid,false,value);
    ctx.applyAdjustedTotal();
    assert.deepEqual(session,before,value);
  }
  assert.equal(saved.length,0);
  assert.match(ctx.adjustedTotalResult(session,14900).message,/Tax\+SC/);
  input.value='15000';ctx.applyAdjustedTotal();
  assert.equal(ctx.ct(session).subtotal,0);
  assert.equal(ctx.ct(session).tax,15000);
  assert.equal(ctx.ct(session).total,15000);
});

test('fixed tax preserves original total rounding and does not round the remaining subtotal again',()=>{
  const {ctx,session,input}=setup({items:[{price:50050,qty:1}]});
  assert.equal(ctx.ct(session).total,65100);
  assert.equal(ctx.ct(session).tax,15050);
  input.value='50000';ctx.applyAdjustedTotal();
  assert.equal(ctx.ct(session).subtotal,34950);
  assert.equal(ctx.ct(session).tax,15050);
  assert.equal(ctx.ct(session).discount,15100);
  assert.equal(ctx.adjustedTotalResult(session,15000).valid,false);
  input.value='15100';ctx.applyAdjustedTotal();
  assert.equal(ctx.ct(session).subtotal,50);
  assert.equal(ctx.ct(session).tax,15050);
});

test('a changed order invalidates the old discount; reapplying uses the new original tax',()=>{
  const {ctx,session,input}=setup();
  ctx.applyAdjustedTotal();
  session.items.push({price:10000,qty:1});
  assert.equal(ctx.ct(session).total,78000);
  assert.equal(ctx.ct(session).tax,18000);
  input.value='50000';ctx.applyAdjustedTotal();
  assert.equal(ctx.ct(session).subtotal,32000);
  assert.equal(ctx.ct(session).tax,18000);
  assert.equal(session.adjustedTotalBaseSubtotal,60000);
});

test('checkout display and guest/store receipts show the same fixed tax and reduced subtotal',()=>{
  const {ctx,session}=setup();
  ctx.pAmt=n=>'¥'+ctx.fmt(n);
  ctx.S.tables=[{id:'t1',vip:false}];
  ctx.S.menus={};
  ctx.S.config={};
  for(const [from,to] of [
    ['function isV(id)','function sc()'],
    ['function isSetCatItem','function remItemDetail'],
    ['function includedConsumptionTax','// ===== HISTORY / SETTINGS'],
    ['function buildReceiptHTML','// ===== ePOS PRINT ====='],
    ['function buildEposXML','function printReceiptFallback']
  ])vm.runInContext(source(from,to),ctx);
  const modal=source('else if(md==="co"&&s)','else if(md==="co2"&&s)');
  vm.runInContext('function checkoutHtml(){let h="";const md="co",s=S.sessions[at];if(false){}'+modal+'return h;}',ctx);
  ctx.applyAdjustedTotal();
  const html=ctx.checkoutHtml();
  assert.match(html,/割引後小計<\/span><span[^>]*>¥35,000<\/span>/);
  assert.match(html,/tax\+SC \(30%\)<\/span><span>¥15,000<\/span>/);
  for(const isGuest of [false,true]){
    const record={...ctx.ct(session),items:session.items,tableLabel:'T1',startTime:1,guests:1,isGuest};
    const before=JSON.stringify(record);
    const receipt=ctx.buildReceiptHTML(record,false);
    assert.ok(receipt.includes('<span>割引後小計</span><span>¥35,000</span>'));
    assert.ok(receipt.includes('<span>税・SC (30%)</span><span>¥15,000</span>'));
    const xml=ctx.buildEposXML(record,false);
    assert.match(xml,/割引後小計\s+¥35,000/);
    assert.match(xml,/税・SC \(30%\)\s+¥15,000/);
    assert.match(xml,/合 計\s+¥50,000/);
    assert.equal(JSON.stringify(record),before);
  }
});
