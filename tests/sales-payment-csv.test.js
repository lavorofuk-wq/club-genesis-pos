const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {source}=require('./helpers/scoped-runtime.cjs');

function contextFor(hist){
  const ctx={
    S:{bizDays:{day:{date:'2026-09-24',history:hist}},activeBizDay:'day'},histFilter:{},
    getFilteredHist:()=>hist,fmt:n=>Number(n).toLocaleString('ja-JP'),
    Date,Blob,URL:{createObjectURL:blob=>{ctx.blob=blob;return 'blob:test';},revokeObjectURL:()=>{}},
    document:{createElement:()=>({click(){}})},alert:()=>assert.fail('unexpected alert'),
    _dlCSV:csv=>{ctx.blob=new Blob([csv]);}
  };
  vm.createContext(ctx);
  for(const [from,to] of [
    ['function gmsEscapeHtml','function gmsInt'],
    ['function exportCSV','function cdh'],
    ['function _paymentBreakdownFromHist','function _accountingRowsFromHist']
  ])vm.runInContext(source(from,to),ctx);
  return ctx;
}

for(const exporter of ['exportDayCSV','exportCSV']){
  test(exporter+' exports split payment labels and cash/card amounts without changing history',async()=>{
    const cases=[
      {payMethod:'cash',splits:[{method:'cash',amount:5000},{method:'card',amount:8000}],label:'現金・カード',cash:5000,card:8000},
      {payMethod:'card',splits:[{method:'card',amount:8000},{method:'cash',amount:5000}],label:'現金・カード',cash:5000,card:8000},
      {payMethod:'cash',splits:[{method:'card',amount:6000},{method:'card',amount:7000}],label:'カード',cash:0,card:13000},
      {payMethod:'card',label:'カード',cash:0,card:13000},
      {payMethod:'cash',label:'現金',cash:13000,card:0},
      {payMethod:'cash',splits:[{method:'cash',amount:0},{method:'card',amount:13000}],label:'カード',cash:0,card:13000}
    ];
    const hist=cases.map((row,i)=>({...row,id:i,startTime:1,tableLabel:'T1',guests:1,subtotal:10000,tax:3000,total:13000,items:[]}));
    const before=JSON.stringify(hist),ctx=contextFor(hist);
    ctx[exporter]('day');
    const rows=(await ctx.blob.text()).replace(/^\uFEFF/,'').trim().split('\n').map(line=>line.split(','));
    const header=rows.shift();
    assert.ok(header.includes('現金金額'));
    assert.ok(header.includes('カード金額'));
    cases.forEach((expected,i)=>{
      const row=rows[i];
      assert.equal(row[header.indexOf('支払方法')],expected.label);
      assert.equal(Number(row[header.indexOf('現金金額')]),expected.cash);
      assert.equal(Number(row[header.indexOf('カード金額')]),expected.card);
    });
    assert.equal(JSON.stringify(hist),before);
  });

  test(exporter+' escapes CSV labels without shifting the added payment columns',async()=>{
    const ctx=contextFor([{startTime:1,tableLabel:'T,"1"',guests:1,total:1000,payMethod:'cash',items:[{label:'A,"B"\nC',price:1000}]}]);
    ctx[exporter]('day');
    const csv=await ctx.blob.text();
    assert.ok(csv.includes(',"T,""1""",1,'));
    assert.ok(csv.endsWith(',1000,0'));
    if(exporter==='exportCSV')assert.ok(csv.includes('"A,""B""\nC(¥1,000)"'));
  });
}
