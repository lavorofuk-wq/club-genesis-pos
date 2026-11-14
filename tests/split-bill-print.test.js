const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const access=fs.readFileSync(path.join(__dirname,'..','access-ui.js'),'utf8');
const source=(from,to)=>app.slice(app.indexOf(from),app.indexOf(to,app.indexOf(from)+from.length));
const plain=value=>JSON.parse(JSON.stringify(value));
function setup(){
  const elements={},printed=[],alerts=[];
  const ctx={
    S:{activeBizDay:'2026-11-14',tables:[{id:'t1',label:'T1 <&>'}],sessions:{t1:{sessionId:'s1',startTime:1,guests:4,totalGuests:7,items:[{label:'set',price:60000,qty:1}],adjustedTotal:75700,adjustedTotalBaseSubtotal:60000,adjustedTotalTax:18000}}},
    at:'t1',md:'co',splitPrintState:null,checkoutBusy:false,TAX_RATE:.3,TOTAL_ROUND_UNIT:100,
    roundCharge:n=>Math.ceil(Math.max(0,Number(n)||0)/100)*100,
    fmt:n=>Number(n).toLocaleString('ja-JP'),posRequireView:()=>true,
    document:{getElementById:id=>elements[id]||null},
    om:name=>{ctx.md=name;ctx.rModal();},rModal:()=>{ctx.html=ctx.splitPrintModalHtml();},
    printReceipt:(data,estimate)=>printed.push({data:plain(data),estimate}),alert:message=>alerts.push(message)
  };
  vm.createContext(ctx);
  for(const [from,to] of [
    ['function sessionGrossSubtotal','function isV(id)'],
    ['function sameSessionIdOnly','function prepareQueuedSession'],
    ['// ===== SPLIT BILL PRINT =====','// ===== RECEIPT PRINT ====='],
    ['function buildReceiptHTML','// ===== ePOS PRINT ====='],
    ['function buildEposXML','function printReceiptFallback']
  ])vm.runInContext(source(from,to),ctx);
  return{ctx,elements,printed,alerts};
}

test('splits 75700 into 18900 x 3 and 19000 x 1',()=>{
  const {ctx}=setup();
  assert.deepEqual(plain(ctx.splitBillPlan(75700,4)),{total:75700,people:4,groups:[{amount:18900,people:3},{amount:19000,people:1}]});
});
test('exact, single-person, zero-total and fewer yen units than people stay balanced',()=>{
  const {ctx}=setup();
  for(const [total,people,groups] of [
    [60000,3,[{amount:20000,people:3}]],
    [75700,1,[{amount:75700,people:1}]],
    [0,4,[{amount:0,people:4}]],
    [100,4,[{amount:0,people:3},{amount:100,people:1}]],
    [75800,4,[{amount:18900,people:2},{amount:19000,people:2}]]
  ])assert.deepEqual(plain(ctx.splitBillPlan(total,people).groups),groups);
});
test('100-yen distribution conserves the bill and headcount across boundary values',()=>{
  const {ctx}=setup();
  for(const total of [0,100,200,700,75700,99999900,9007199254740900]){
    for(const people of [1,2,3,4,7,99,999,Number.MAX_SAFE_INTEGER]){
      const plan=ctx.splitBillPlan(total,people);
      assert.equal(plan.groups.reduce((sum,g)=>sum+g.people,0),people);
      assert.equal(plan.groups.reduce((sum,g)=>sum+g.amount*g.people,0),total);
      assert.ok(plan.groups.every(g=>g.people>0&&g.amount>=0&&g.amount%100===0));
      assert.ok(plan.groups.length<=2);
      assert.ok(plan.groups.at(-1).amount-plan.groups[0].amount<=100);
    }
  }
});
test('invalid inputs never get silently rounded or generate a print',()=>{
  const {ctx,printed}=setup();
  for(const value of [-100,1,99,100.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'100'])assert.equal(ctx.splitBillPlan(value,4),null);
  for(const people of [0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'4'])assert.equal(ctx.splitBillPlan(100,people),null);
  ctx.openSplitPrint();
  for(const input of ['', '0','-1','1.5','oops']){
    ctx.updateSplitPrintPeople(input);ctx.printCheckoutSplit();
    assert.ok(ctx.splitPrintPreview().error);
  }
  assert.equal(printed.length,0);
});
test('current occupants initialize the editable count without modifying business data or payments',()=>{
  const {ctx,printed}=setup();
  ctx.coState={splits:[{method:'cash',amount:20000},{method:'card',amount:55700}]};
  const before=JSON.stringify({state:ctx.S,payment:ctx.coState});
  ctx.openSplitPrint();
  assert.equal(ctx.splitPrintState.people,'4');
  assert.equal(ctx.md,'coSplit');
  ctx.updateSplitPrintPeople('3');ctx.printCheckoutSplit();
  assert.deepEqual(printed,[{data:{isSplitBill:true,tableLabel:'T1 <&>',total:75700,splitPeople:3},estimate:false}]);
  assert.equal(JSON.stringify({state:ctx.S,payment:ctx.coState}),before);
  ctx.openSplitPrint();assert.equal(ctx.splitPrintState.people,'3','cannot reopen from a different modal');
});
test('DOM count is validated at print time and preview button reflects invalid input',()=>{
  const {ctx,elements,printed}=setup();
  ctx.openSplitPrint();
  elements['split-print-preview']={innerHTML:''};elements['split-print-submit']={disabled:false};
  ctx.updateSplitPrintPeople('');assert.equal(elements['split-print-submit'].disabled,true);
  ctx.updateSplitPrintPeople('4');assert.equal(elements['split-print-submit'].disabled,false);
  elements['split-print-people']={value:'-1'};ctx.printCheckoutSplit();
  assert.equal(printed.length,0);
});
test('a changed live total must be displayed before a second print attempt',()=>{
  const {ctx,printed,alerts}=setup();ctx.openSplitPrint();
  delete ctx.S.sessions.t1.adjustedTotal;
  ctx.printCheckoutSplit();assert.equal(printed.length,0);assert.equal(alerts.length,1);
  assert.match(ctx.html,/78,000/);
  ctx.printCheckoutSplit();assert.equal(printed[0].data.total,78000);
});
test('closed/replaced/moved sessions, changed business days, and lost permissions cannot print',()=>{
  for(const change of [
    ctx=>delete ctx.S.sessions.t1,
    ctx=>ctx.S.sessions.t1.sessionId='s2',
    ctx=>ctx.at='t2',
    ctx=>ctx.S.activeBizDay='2026-11-15',
    ctx=>ctx.posRequireView=()=>false,
    ctx=>ctx.md='co2',
    ctx=>ctx.checkoutBusy=true
  ]){
    const {ctx,printed}=setup();ctx.openSplitPrint();change(ctx);ctx.printCheckoutSplit();assert.equal(printed.length,0);
  }
});
test('browser and Epson receipts contain identical groups and escape table labels without exposing store details',()=>{
  const {ctx}=setup();
  const data={isSplitBill:true,total:75700,splitPeople:4,tableLabel:'T1 <&>"',note:'private',items:[{label:'private order'}]};
  const before=JSON.stringify(data);
  for(const receipt of [ctx.buildReceiptHTML(data,false),ctx.buildEposXML(data,false)]){
    for(const text of ['割勘','75,700','18,900','19,000','3名','1名','&lt;&amp;&gt;&quot;'])assert.ok(receipt.includes(text),text);
    assert.doesNotMatch(receipt,/private|店舗控え|店 舗 控 え/);
  }
  assert.equal(JSON.stringify(data),before);
  assert.equal((ctx.buildEposXML(data,false).match(/<cut /g)||[]).length,1);
});
test('invalid receipt data fails closed for both printer paths',()=>{
  const {ctx}=setup();
  for(const builder of [ctx.buildReceiptHTML,ctx.buildEposXML]){
    assert.throws(()=>builder({isSplitBill:true,total:75701,splitPeople:4},false),/割勘/);
    assert.throws(()=>builder({isSplitBill:true,total:75700,splitPeople:0},false),/割勘/);
  }
});
test('only checkout preview loses store print; final checkout and history retain it',()=>{
  const preview=source('else if(md==="co"&&s)','else if(md==="coSplit")');
  assert.match(preview,/openSplitPrint\(\)/);assert.match(preview,/printCheckoutGuest\(\)/);
  assert.doesNotMatch(preview,/printCheckout\(\)|店舗用/);
  assert.match(source('async function checkout','function checkoutPaymentError'),/shouldPrintStoreCopy[\s\S]*eposPrint\(\{\.\.\.rec,isGuest:false\}/);
  assert.match(source('function printHistReceipt(hid)','function printHistReceiptGuest'),/eposPrint\(/);
});
test('split modal uses cashier floor permission and clears on logout/business-day changes',()=>{
  const {ctx}=setup();ctx.window={};ctx.document={getElementById:()=>null};ctx.posDefaultView=()=>'';
  vm.runInContext(access,ctx);
  ctx.posCanView=view=>view==='floor';
  assert.equal(ctx.posCanOpenModal('coSplit'),true);assert.equal(ctx.posBusinessModal('coSplit'),true);
  ctx.posCanView=()=>false;assert.equal(ctx.posCanOpenModal('coSplit'),false);
  ctx.md='coSplit';ctx.splitPrintState={people:4};ctx.invalidateBusinessDayDialogs('old','new');
  assert.equal(ctx.md,null);assert.equal(ctx.splitPrintState,null);
  ctx.splitPrintState={people:4};ctx.window.posClearPrivateState();assert.equal(ctx.splitPrintState,null);
});
