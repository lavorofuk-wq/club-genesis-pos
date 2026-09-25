const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

process.env.TZ='Asia/Tokyo';
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
function source(from,to){
  const start=app.indexOf(from),end=app.indexOf(to,start+from.length);
  assert.ok(start>=0&&end>start,from);return app.slice(start,end);
}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function contextFor(loadDays=async()=>({})){
  const elements={m:{innerHTML:''},md:{innerHTML:''}};
  const ctx={Date,console,window:{_db:{}},FB_ROOT:'pos-dev',BACKUP_ROOT:'backup-dev',
    S:{bizDays:{cached:{endedAt:1,history:[{id:'stale',startTime:1}]}},activeBizDay:null},
    analysisSt:{mode:null,castId:null,castName:null,days:null,loading:false,error:'',requestId:0},
    histFilter:{from:'2026-09-24',to:'2026-09-25',fromTime:'19:00',toTime:'18:59'},
    ANALYSIS_DATA:{loadDays},vw:'analysis',md:null,
    document:{getElementById:id=>elements[id]},updateNav:()=>{},syncLegacyFloorCardSizes:()=>{},
    rModal:()=>{ctx.modalCalls++;},modalCalls:0,elements,
    updateRemoteHash:()=>{throw new Error('analysis must not hash the global business history');}
  };
  vm.createContext(ctx);
  for(const [from,to] of [
    ['const POS_CORE_SYNC_PATHS','// Firebase config'],
    ['function rAnalysis(){','function anaSetMonth('],
    ['function render(){','let _renderPending='],
    ['function getFilteredHist(){','function exportCSV('],
    ['function _findHistRec(','function printHistReceipt(']
  ])vm.runInContext(source(from,to),ctx);
  return ctx;
}

test('analysis menu renders immediately without database reads, even while other views load or fail',()=>{
  const ctx=contextFor();let reads=0;
  ctx.window._db={ref:()=>{reads++;throw new Error('unexpected read');}};
  for(const status of ['idle','loading','loaded','error']){
    vm.runInContext('lazyDataState.bizDays.status='+JSON.stringify(status)+';lazyDataState.bizDays.loadedAt=0;',ctx);
    assert.equal(ctx.startLazyViewDataLoad('analysis',true),null);
    ctx.render();
    assert.match(ctx.elements.m.innerHTML,/openSalesAnalysis\(\)/);
    assert.match(ctx.elements.m.innerHTML,/openListAnalysis\(\)/);
    assert.doesNotMatch(ctx.elements.m.innerHTML,/読み込み中|データを取得できません/);
  }
  assert.equal(reads,0);
});

test('sales waits for only the chosen period, keeps global history intact, and deduplicates next clicks',async()=>{
  const pending=deferred(),calls=[];
  const ctx=contextFor(options=>{calls.push(options);return pending.promise;});
  const before=JSON.stringify(ctx.S);
  ctx.openSalesAnalysis();assert.equal(calls.length,0);
  const loading=ctx.anaNext();
  await ctx.anaNext();
  assert.equal(calls.length,1);assert.equal(ctx.md,'anaDateSel');assert.equal(ctx.analysisSt.loading,true);
  assert.equal(calls[0].from,Date.parse('2026-09-24T19:00:00+09:00'));
  assert.equal(calls[0].to,Date.parse('2026-09-25T18:59:59+09:00')+1);
  const days={'2026-09-24':{endedAt:1,history:[{id:'fresh',startTime:Date.parse('2026-09-24T20:00:00+09:00')} ]}};
  pending.resolve(days);
  assert.equal(await loading,true);assert.equal(ctx.md,'anaCastSel');
  assert.equal(ctx.analysisSt.days,days);assert.equal(ctx.analysisSt.loading,false);
  assert.deepEqual(Array.from(ctx.getFilteredHist(),row=>row.id),['fresh']);
  assert.equal(JSON.stringify(ctx.S),before);
});

test('sales validates periods and supports retry without presenting a failed read as empty data',async()=>{
  let calls=0,fail=true;
  const ctx=contextFor(async()=>{calls++;if(fail)throw new Error('offline');return{};});
  ctx.openSalesAnalysis();ctx.histFilter.from='2026-09-26';
  assert.equal(await ctx.anaNext(),false);assert.equal(calls,0);assert.ok(ctx.analysisSt.error);
  ctx.histFilter.from='invalid';await ctx.anaNext();assert.equal(calls,0);
  ctx.histFilter.from='2026-09-24';
  assert.equal(await ctx.anaNext(),false);assert.equal(ctx.md,'anaDateSel');assert.ok(ctx.analysisSt.error);
  assert.equal(ctx.analysisSt.days,null);assert.equal(ctx.analysisSt.loading,false);
  fail=false;assert.equal(await ctx.anaNext(),true);
  assert.equal(ctx.analysisSt.error,'');assert.equal(ctx.md,'anaCastSel');
  assert.equal(ctx.getFilteredHist().length,0,'a successful empty snapshot must not fall back to stale global history');
});

test('closing, reopening, switching tabs or changing a period discards obsolete sales responses',async()=>{
  for(const cancel of [ctx=>{ctx.md=null;},ctx=>ctx.openSalesAnalysis(),ctx=>{ctx.vw='home';},ctx=>{ctx.histFilter.from='2026-09-23';}]){
    const pending=deferred(),ctx=contextFor(()=>pending.promise);
    ctx.openSalesAnalysis();const loading=ctx.anaNext();cancel(ctx);
    pending.resolve({old:{endedAt:1,history:[]}});
    assert.equal(await loading,false);assert.equal(ctx.analysisSt.days,null);
    assert.notEqual(ctx.md,'anaCastSel');
  }
});

test('a reopened sales request cannot be overwritten by an older request finishing later',async()=>{
  const old=deferred(),fresh=deferred();let calls=0;
  const ctx=contextFor(()=>++calls===1?old.promise:fresh.promise);
  ctx.openSalesAnalysis();const first=ctx.anaNext();
  ctx.md=null;ctx.openSalesAnalysis();ctx.histFilter.from='2026-09-23';const second=ctx.anaNext();
  const newest={newest:{endedAt:1,history:[]}};
  fresh.resolve(newest);assert.equal(await second,true);
  old.resolve({old:{endedAt:1,history:[]}});assert.equal(await first,false);
  assert.equal(ctx.analysisSt.days,newest);assert.equal(ctx.md,'anaCastSel');
});

test('sales receipt details and printing find fresh private records while other views retain their own history',()=>{
  const ctx=contextFor(),fresh={id:123,total:18000},old={id:123,total:10000};
  ctx.analysisSt.days={'2026-09-24':{history:[fresh,{id:456,total:2000}]}};
  ctx.S.history=[old];
  assert.equal(ctx._findHistRec(123),fresh);
  assert.equal(ctx._findHistRec(456).total,2000);
  ctx.md='viewHistDetail';assert.equal(ctx._findHistRec(123),fresh);
  ctx.vw='history';assert.equal(ctx._findHistRec(123),old);
  assert.equal(ctx._findHistRec(456),null);
});
