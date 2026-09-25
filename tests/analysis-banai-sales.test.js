const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

process.env.TZ='Asia/Tokyo';
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
function source(from,to){
  const begin=app.indexOf(from),end=app.indexOf(to,begin+from.length);
  assert.ok(begin>=0&&end>begin,from+' extraction boundary');
  return app.slice(begin,end);
}
function contextFor(){
  const casts=['a','b','c'].map(id=>({id,name:id.toUpperCase()}));
  const context={
    Date,
    S:{casts,menus:{champagne:[],keepBottles:[]},bizDays:{}},
    histFilter:{},
    MAX_SHIFT_MS:24*60*60*1000,
    safeDurationMs:ms=>ms,
    allCasts:()=>casts,
    gmsUniqueStrings:values=>[...new Set(values.filter(v=>v!=null&&v!=='').map(String))],
    gmsInt:value=>Math.round(Number(value)||0),
    itemCastName:item=>item.castName||casts.find(c=>c.id===String(item.castId))?.name||'',
    fmt:value=>Number(value||0).toLocaleString('ja-JP'),
    pAmt:value=>'YEN '+Number(value||0).toLocaleString('ja-JP'),
    _getShiftMsForCast:()=>0,
    _fmtWorkH:()=> '0',
    _dlCSV:csv=>{context.csv=csv;}
  };
  vm.createContext(context);
  for(const [from,to] of [
    ['function sessionGrossSubtotal','function standardChargeFromSubtotal'],
    ['function isSetCatItem','function isGuestCatItem'],
    ['function isBanaiExtensionBackItem','async function execDelItem'],
    ['function gmsItemCategory','function gmsCastIdentityResult'],
    ['function gmsCastName','function gmsTransactions'],
    ['function banaiExtensionSalesPhases','function exportAssignHistCSV'],
    ['function _salesDataStatsFromHist','function _salesDataColumnWidths'],
    ['function getFilteredHist','function exportCSV']
  ])vm.runInContext(source(from,to),context);
  const modal=source('else if(md==="anaDetail")','else if(md==="viewHistDetail")');
  vm.runInContext('function renderAnalysis(){let h="";const md="anaDetail";if(false){}'+modal+'return h;}',context);
  return context;
}
function record(items,overrides={}){
  return{
    id:1,startTime:Date.parse('2026-09-24T21:00:00+09:00'),tableLabel:'T1',guests:2,
    items,subtotal:items.filter(i=>!i.isDiscount).reduce((sum,i)=>sum+i.price*(i.qty||1),0),
    ...overrides
  };
}
function extension(ids,price=4000){
  return{isExtension:true,isBanaiExtension:true,banaiExtCastIds:ids,label:'Extension',price,qty:1};
}
function metric(html,label){
  const labelEnd=html.indexOf('>'+label+'</div>');
  assert.ok(labelEnd>=0,'missing metric: '+label);
  const match=html.slice(labelEnd+label.length+7).match(/<div[^>]*>([^<]*)/);
  assert.ok(match,'missing metric value: '+label);
  return match[1];
}
function verifyAnalysis(hist,expected){
  const ctx=contextFor();
  const before=JSON.stringify(hist);
  ctx.S.bizDays={closed:{date:'2026-09-24',endedAt:Date.parse('2026-09-25T06:00:00+09:00'),history:hist}};
  const filtered=ctx.getFilteredHist();
  const stats=ctx._salesDataStatsFromHist(hist);
  const exportRows=ctx._salesDataRowsFromHist(hist);
  const gmsSales=ctx.gmsCastSales(hist);
  for(const [cid,amount] of Object.entries(expected)){
    const name=cid.toUpperCase();
    assert.equal(stats.find(row=>row.castId===cid)?.banaiExtensionSales||0,amount,'data export baseline '+cid);
    const gms=gmsSales.find(row=>row.castId===cid);
    assert.equal(gms?.jonaiExtensionSales||0,amount,'GMS extension sales '+cid);
    if(gms)assert.equal(gms.totalAttributedSales,gms.honShimeiSales+amount,'GMS total must not add back sales twice '+cid);
    const exported=exportRows.find(row=>row[0]===name);
    if(amount)assert.ok(exported[2].includes('\u00a5'+ctx.fmt(amount)),'exported amount '+cid);
    const details=ctx.anaCastDetailRows(filtered,cid,name);
    assert.equal(details.reduce((sum,row)=>sum+row.banaiExtSales,0),amount,'daily analysis '+cid);
    assert.equal(metric(ctx.anaCastDetailHtml(filtered,cid,name),'場内延長売上'),ctx.pAmt(amount));
    ctx.analysisSt={mode:'uriage',castId:cid,castName:name};
    assert.equal(metric(ctx.renderAnalysis(),'小計（場内延長）'),ctx.pAmt(amount),'analysis summary '+cid);
    ctx.exportUriageCSV(filtered,cid,name);
    const csvRows=ctx.csv.trim().split('\n').map(row=>row.split(','));
    assert.equal(Number(csvRows[1][2]),amount,'analysis CSV '+cid);
  }
  const summary=ctx.gmsCastSalesSummary(gmsSales);
  assert.equal(summary.jonaiExtensionSales,ctx._salesDataTotalsFromHist(hist).banaiExtensionSales,'GMS sales summary');
  assert.equal(summary.totalAttributedSales,summary.honShimeiSales+summary.jonaiExtensionSales,'GMS total summary');
  assert.equal(JSON.stringify(hist),before,'analysis must not mutate stored history');
  return ctx;
}

test('analysis includes post-extension bottles and room charges, but excludes pre-extension orders',()=>{
  const hist=[record([
    {isSet:true,label:'Set',price:8000},
    {category:'keepBottle',label:'Before extension',price:50000},
    extension(['a','b']),
    {category:'champagneWine',label:'Champagne',price:30000},
    {category:'keepBottle',label:'Bottle',price:10000,qty:2},
    {isRoomCharge:true,isVipCharge:true,label:'Room',price:15000},
    {category:'castDrink',castId:'a',label:'Drink',price:2000}
  ])];
  const ctx=verifyAnalysis(hist,{a:35500,b:35500,c:0});
  assert.deepEqual(Array.from(ctx.anaBanaiExtensionDetails(hist[0].items,'a',hist[0].subtotal).liquors),['Champagne','Bottle x2']);
  ctx.analysisSt={mode:'uriage',castId:'a',castName:'A'};
  assert.equal(metric(ctx.renderAnalysis(),'うち場延バック'),'YEN 25,000');
  ctx.exportUriageCSV(hist,'a','A');
  assert.ok(ctx.csv.split('\n')[0].includes('場内延長バック（内数）'));
  assert.equal(Number(ctx.csv.split('\n')[1].split(',')[3]),25000);
  const gms=ctx.gmsCastSales(hist);
  assert.equal(gms.find(row=>row.castId==='a').jonaiExtensionSales,35500);
  assert.equal(gms.find(row=>row.castId==='a').jonaiExtensionBackSales,25000);
});

test('discounted sales are floored after combining the phase including bottle amounts',()=>{
  verifyAnalysis([record([
    {isSet:true,price:1000},
    extension(['a','b','c'],4000),
    {category:'champagneWine',label:'Champagne',price:1001},
    {label:'Drink',price:1001},
    {isDiscount:true,price:500}
  ],{subtotal:3501})],{a:1000,b:1000,c:1000});
});

test('rounding for multiple ordinary orders matches the data export without bottles',()=>{
  verifyAnalysis([record([
    extension(['a','b','c'],4000),
    {label:'Drink',price:1000},
    {label:'Drink',price:1000}
  ])],{a:2000,b:2000,c:2000});
});

test('changing extension casts and returning to the same group preserves allocation',()=>{
  verifyAnalysis([record([
    extension(['a','b'],4001),
    {category:'champagneWine',price:10000},
    extension(['b'],4000),
    {category:'keepBottle',price:9000},
    extension(['b','a','a'],4001)
  ])],{a:9001,b:22001,c:0});
});

test('legacy extension cast IDs match all analysis views and the data export',()=>{
  for(const target of [{banaiExtCastId:'a'},{castId:'a'}]){
    verifyAnalysis([record([
      {isBanaiExtension:true,isExtension:true,label:'Extension',price:4000,...target},
      {category:'champagneWine',price:10000}
    ])],{a:14000,b:0});
  }
});

test('hon-shimei tables do not also accrue banai-extension sales',()=>{
  const ctx=verifyAnalysis([record([
    {isHonShimei:true,castId:'c',castName:'C',price:2000},
    extension(['a'],4000),
    {category:'champagneWine',price:10000}
  ])],{a:0,c:0});
  assert.equal(ctx._salesDataStatsFromHist(ctx.getFilteredHist()).find(row=>row.castId==='c').honShimeiSales,16000);
});

test('zero discounted subtotal and no extension produce no banai-extension sales',()=>{
  verifyAnalysis([record([extension(['a']),{category:'keepBottle',price:10000}],{subtotal:0})],{a:0});
  verifyAnalysis([record([{isBanaiShimei:true,castId:'a',price:2000},{category:'keepBottle',price:10000}])],{a:0});
});

test('multiple checkouts sum their independently rounded sales',()=>{
  verifyAnalysis([
    record([extension(['a','b','c'],4000)]),
    record([extension(['a','b','c'],4000)],{id:2})
  ],{a:2666,b:2666,c:2666});
});

test('hon-shimei sales use unique casts and floor each checkout in every view',()=>{
  for(const duplicate of [false,true]){
    const ctx=contextFor();
    const items=['a','b','c',...(duplicate?['a']:[])].map(castId=>({isHonShimei:true,castId,price:2000}));
    const hist=[record(items,{subtotal:10000}),record(items,{id:2,subtotal:10000})];
    const before=JSON.stringify(hist);
    ctx.S.bizDays={closed:{date:'2026-09-24',endedAt:1,history:hist}};
    for(const cid of ['a','b','c']){
      assert.equal(ctx._salesDataStatsFromHist(hist).find(r=>r.castId===cid).honShimeiSales,6666);
      assert.equal(ctx.gmsCastSales(hist).find(r=>r.castId===cid).honShimeiSales,6666);
      assert.equal(ctx.anaCastDetailRows(hist,cid,cid).reduce((s,r)=>s+r.honSales,0),6666);
      ctx.analysisSt={mode:'uriage',castId:cid,castName:cid};
      assert.equal(metric(ctx.renderAnalysis(),'小計（本指名）'),'YEN 6,666');
      ctx.exportUriageCSV(hist,cid,cid);
      assert.equal(Number(ctx.csv.split('\n')[1].split(',')[1]),6666);
    }
    assert.equal(JSON.stringify(hist),before);
  }
});

test('dohan counts only its recorded target, honors quantities, and does not guess missing targets',()=>{
  const ctx=contextFor();
  const hist=[record([
    {isHonShimei:true,castId:'a',price:2000},
    {isHonShimei:true,castId:'b',price:2000},
    {isBanaiShimei:true,castId:'c',price:2000},
    {category:'dohan',label:'同伴料',castId:'b',backTargetCastIds:['a'],price:3000,qty:2},
    {category:'dohan',label:'同伴料',castId:'a',price:3000},
    {category:'dohan',label:'同伴料',price:3000},
    {category:'dohan',label:'同伴料',backTargetCastIds:['a','b'],price:3000}
  ])];
  const before=JSON.stringify(hist);
  ctx.S.bizDays={closed:{date:'2026-09-24',endedAt:1,history:hist}};
  for(const [cid,expected] of [['a',3],['b',0],['c',0]]){
    assert.equal(ctx._salesDataStatsFromHist(hist).find(r=>r.castId===cid).dohanCount,expected);
    assert.equal(ctx.anaCastDetailRows(hist,cid,cid).reduce((s,r)=>s+r.dohanCount,0),expected);
    ctx.analysisSt={mode:'uriage',castId:cid,castName:cid};
    assert.equal(metric(ctx.renderAnalysis(),'同伴'),expected+'件');
    ctx.exportUriageCSV(hist,cid,cid);
    assert.equal(Number(ctx.csv.split('\n')[1].split(',')[9]),expected);
  }
  assert.equal(ctx._salesDataTotalsFromHist(hist).dohanCount,3);
  assert.equal(JSON.stringify(hist),before);
});

test('fixed-tax discounts use the reduced subtotal in hon-shimei analysis, data and GMS exports',()=>{
  const ctx=contextFor();
  Object.assign(ctx,{TAX_RATE:0.3,TOTAL_ROUND_UNIT:100,roundCharge:n=>Math.ceil(n/100)*100});
  vm.runInContext(source('function standardChargeFromSubtotal','function isV(id)'),ctx);
  for(const target of [50000,60000])for(const count of [1,2,3]){
    const ids=['a','b','c'].slice(0,count);
    const items=[{isSet:true,price:50000-count*2000},...ids.map(castId=>({isHonShimei:true,castId,price:2000}))];
    const totals=ctx.ct({items,adjustedTotal:target,adjustedTotalBaseSubtotal:50000,adjustedTotalTax:15000});
    assert.equal(totals.subtotal,target-15000);
    const hist=[record(items,totals)],before=JSON.stringify(hist);
    const expected=Math.floor((target-15000)/count);
    ctx.S.bizDays={closed:{date:'2026-09-24',endedAt:1,history:hist}};
    for(const cid of ids){
      assert.equal(ctx._salesDataStatsFromHist(hist).find(r=>r.castId===cid).honShimeiSales,expected);
      assert.equal(ctx.gmsCastSales(hist).find(r=>r.castId===cid).honShimeiSales,expected);
      assert.equal(ctx.anaCastDetailRows(hist,cid,cid).reduce((s,r)=>s+r.honSales,0),expected);
      ctx.analysisSt={mode:'uriage',castId:cid,castName:cid};
      assert.equal(metric(ctx.renderAnalysis(),'小計（本指名）'),ctx.pAmt(expected));
      ctx.exportUriageCSV(hist,cid,cid);
      assert.equal(Number(ctx.csv.split('\n')[1].split(',')[1]),expected);
    }
    assert.equal(JSON.stringify(hist),before);
  }
});

test('fixed-tax discounts scale post-extension sales including bottles, excluding pre-extension orders',()=>{
  const ctx=contextFor();
  Object.assign(ctx,{TAX_RATE:0.3,TOTAL_ROUND_UNIT:100,roundCharge:n=>Math.ceil(n/100)*100});
  vm.runInContext(source('function standardChargeFromSubtotal','function isV(id)'),ctx);
  for(const target of [50000,60000,15000])for(const count of [1,2,3]){
    const ids=['a','b','c'].slice(0,count);
    const items=[{isSet:true,price:30000},extension(ids,4000),{category:'champagneWine',price:16000}];
    const totals=ctx.ct({items,adjustedTotal:target,adjustedTotalBaseSubtotal:50000,adjustedTotalTax:15000});
    assert.equal(totals.tax,15000);
    assert.equal(totals.subtotal,target-15000);
    const expected=Math.floor(20000*((target-15000)/50000)/count);
    verifyAnalysis([record(items,totals)],Object.fromEntries(ids.map(id=>[id,expected])));
  }
});
