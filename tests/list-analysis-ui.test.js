const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const LIST_ANALYSIS=require('../list-analysis-core');

process.env.TZ='Asia/Tokyo';
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const ui=read('list-analysis-ui.js'),app=read('app.js');
const css=read('list-analysis.css'),index=read('index.html'),sw=read('sw.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const timestamp=value=>Date.parse(value+'+09:00');
const START=timestamp('2026-09-24T19:00:00'),HOUR=3600000;

function contextFor(){
  const ctx={
    Date,URL,LIST_ANALYSIS,APP_VERSION:app.match(/const APP_VERSION="([^"]+)"/)[1],
    S:{casts:[],bizDays:{},activeBizDay:null,history:[],sessions:{},assignments:{},shifts:{}},
    md:null,modalCalls:0,alerts:[],rendered:'',
    allCasts:()=>ctx.S.casts,normalizeCastType:require('../gms-json-core').normalizeCastType,getBizDate:()=> '2026-09-26',
    rModal:()=>{ctx.modalCalls++;},
    ct:()=>{throw new Error('live session totals must not be read by closed-day analysis');},
    banaiExtensionSalesForCast:(items,cid,subtotal)=>subtotal,
    pAmt:value=>'¥'+Number(value).toLocaleString('ja-JP'),
    document:{baseURI:'https://example.test/pos/index.html'},
    window:{open:()=>null},alert:message=>ctx.alerts.push(message)
  };
  vm.createContext(ctx);
  vm.runInContext(ui+'\nthis.state=listAnalysisState;',ctx);
  return ctx;
}
function activeFixture(ctx){
  const date='2026-09-24';
  ctx.S.activeBizDay=date;
  ctx.S.bizDays[date]={id:date,date,endedAt:START+8*HOUR,shifts:{stale:{castId:'a',clockIn:START,clockOut:START+8*HOUR}}};
  ctx.S.shifts={live:{id:'live',castId:'a',castName:'A',clockIn:START,clockOut:null,statusLog:[{status:'waiting',startTime:START,endTime:null}]}};
  ctx.S.assignments={a1:{id:'a1',castId:'a',castName:'A',tableId:'T1',sessionId:START+HOUR,type:'banai',startTime:START+HOUR,endTime:null,typeHistory:[{type:'banai',startTime:START+HOUR}]}};
  ctx.S.sessions={T1:{sessionId:'ses_'+(START+HOUR)+'_abc',startTime:START+HOUR,mockSubtotal:12000,items:[
    {id:'ext',groupId:'g',chargeRole:'extension',isExtension:true,isBanaiExtension:true,banaiExtCastIds:['a'],price:4000,qty:3}
  ]}};
}
function savedFixture(ctx){
  activeFixture(ctx);
  const date=ctx.S.activeBizDay;
  const visit={...clone(ctx.S.sessions.T1),id:'closed-visit-a',tableId:'T1',endTime:START+3*HOUR,subtotal:16000};
  visit.items.push({...clone(visit.items[0]),id:'ext2',groupId:'g2'});
  const shifts=clone(ctx.S.shifts);shifts.live.clockOut=START+8*HOUR;
  const assignments=clone(ctx.S.assignments);assignments.a1.endTime=START+3*HOUR;
  assignments.a2={...clone(assignments.a1),id:'a2',sessionId:START+4*HOUR,startTime:START+4*HOUR,endTime:START+5*HOUR,typeHistory:[{type:'banai',startTime:START+4*HOUR}]};
  ctx.S.bizDays[date]={id:date,date,endedAt:START+8*HOUR,shifts,assignments,history:[visit,
    {id:'closed-visit-b',tableId:'T1',startTime:START+4*HOUR,endTime:START+5*HOUR,subtotal:8000,items:[]}
  ]};
  return ctx.S.bizDays[date];
}

test('selected business dates cover 19:00 through the following day just before 19:00',()=>{
  const ctx=contextFor();
  ctx.state.from='2026-09-30';ctx.state.to='2026-09-30';
  assert.deepEqual(clone(ctx.listAnalysisRange()),{from:timestamp('2026-09-30T19:00:00'),to:timestamp('2026-10-01T19:00:00')});
  ctx.state.from='';ctx.state.to='';
  assert.deepEqual(clone(ctx.listAnalysisRange()),{from:null,to:null});
  ctx.state.from='2026-09-01';
  assert.equal(ctx.listAnalysisRange().to,null);
});

test('month defaults follow the active business date and reopening preserves a selected period',()=>{
  const ctx=contextFor();
  ctx.S.activeBizDay='2026-08-31';
  ctx.openListAnalysis();
  assert.equal(ctx.md,'anaListDate');
  assert.equal(ctx.state.from,'2026-08-01');
  assert.equal(ctx.state.to,'2026-08-31');
  ctx.state.from='2026-07-12';ctx.state.to='2026-07-15';
  ctx.openListAnalysis();
  assert.equal(ctx.state.from,'2026-07-12');
  assert.equal(ctx.state.to,'2026-07-15');
  ctx.S.activeBizDay=null;ctx.listAnalysisSetMonth();
  assert.equal(ctx.state.from,'2026-09-01');
  assert.equal(ctx.state.to,'2026-09-26');
  const html=ctx.listAnalysisModalHtml('anaListDate');
  const all=html.match(/onclick="([^"]+)"[^>]*>全期間<\/button>/);
  assert.ok(all);vm.runInContext(all[1],ctx);
  assert.deepEqual(clone(ctx.listAnalysisRange()),{from:null,to:null});
});

test('invalid or reversed dates keep the period modal open and same-day periods proceed',()=>{
  const ctx=contextFor();ctx.md='anaListDate';
  for(const [from,to] of [['2026-09-25','2026-09-24'],['invalid','2026-09-24'],['2026-09-24','invalid']]){
    ctx.state.from=from;ctx.state.to=to;ctx.listAnalysisNext();
    assert.equal(ctx.md,'anaListDate');assert.ok(ctx.state.error);
  }
  ctx.state.from='2026-09-24';ctx.state.to='2026-09-24';ctx.listAnalysisNext();
  assert.equal(ctx.md,'anaListCast');assert.equal(ctx.state.error,'');
});

test('cast selection keeps opaque IDs intact and escapes names and attributes',()=>{
  const ctx=contextFor(),id='cast"\'&<id>',name='<img src=x onerror="bad()">';
  ctx.S.casts=[{id,name},{id:7,name:'Current'},{id:'old',name:'Old',active:false}];
  ctx.S.bizDays={
    '2026-09-24':{date:'2026-09-24',endedAt:START+8*HOUR,shifts:[{castId:'old',castName:'Archived'}],assignments:[{castId:7,castName:'Previous name'}]},
    '2026-08-01':{date:'2026-08-01',endedAt:timestamp('2026-08-02T03:00:00'),assignments:[{castId:'outside',castName:'Outside'}]}
  };
  ctx.state.from='2026-09-24';ctx.state.to='2026-09-24';
  assert.deepEqual(clone(ctx.listAnalysisCasts()).map(c=>c.id),[id,'7']);
  const html=ctx.listAnalysisModalHtml('anaListCast');
  assert.ok(html.includes('data-cast-id="'+ctx.listAnalysisEscape(id)+'"'));
  assert.ok(html.includes(ctx.listAnalysisEscape(name)));
  assert.doesNotMatch(html,/<img|parseInt|selectListAnalysisCast\(['"]/);
  ctx.selectListAnalysisCast(id);
  assert.equal(ctx.state.castId,id);assert.equal(ctx.state.castName,name);
  assert.equal(ctx.md,'anaListDetail');
});

test('active snapshots and current state are excluded even if the snapshot has an endedAt value',()=>{
  const ctx=contextFor();savedFixture(ctx);
  const before=JSON.stringify(ctx.S);
  assert.deepEqual(clone(ctx.listAnalysisDays()),[]);
  ctx.state.castId='a';ctx.state.castName='A';ctx.refreshListAnalysis();
  const report=ctx.state.report;
  assert.equal(report.attendanceDays,0);assert.equal(report.workMs,0);
  assert.equal(report.types.banai.count,0);assert.equal(report.types.banai.ms,0);
  assert.equal(report.extensionCount,0);assert.equal(report.extensionSales,0);
  assert.equal(JSON.stringify(ctx.S),before);
});

test('unclosed business days and the reopened day are excluded while other closed snapshots remain',()=>{
  const ctx=contextFor(),saved=savedFixture(ctx);
  saved.isReEdit=true;
  ctx.S.bizDays['2026-09-23']={...clone(saved),id:'2026-09-23',date:'2026-09-23',isReEdit:false};
  ctx.S.bizDays['2026-09-25']={date:'2026-09-25',endedAt:null,shifts:[{castId:'unclosed',castName:'Unclosed'}]};
  ctx.S.bizDays['2026-09-26']={date:'2026-09-26',shifts:[{castId:'missing-end',castName:'Missing end'}]};
  ctx.S.bizDays['2026-09-27']={date:'2026-09-27',endedAt:0};
  assert.deepEqual(clone(ctx.listAnalysisDays()).map(day=>day.id),['2026-09-23']);
  assert.deepEqual(clone(ctx.listAnalysisCasts()).map(cast=>cast.id),[]);
  delete ctx.S.bizDays['2026-09-23'];
  assert.deepEqual(clone(ctx.listAnalysisCasts()),[]);
});

test('closing a business day includes its saved snapshot and sales ignore all current state',()=>{
  const ctx=contextFor(),saved=savedFixture(ctx),salesCalls=[];
  ctx.S.activeBizDay=null;
  ctx.S.history=[{...clone(saved.history[0]),subtotal:999000}];
  ctx.S.sessions.T1.mockSubtotal=888000;
  ctx.banaiExtensionSalesForCast=(items,cid,subtotal)=>{salesCalls.push({items:clone(items),cid,subtotal});return subtotal;};
  const before=JSON.stringify(ctx.S);
  ctx.state.castId='a';ctx.state.castName='A';ctx.state.from='2026-09-24';ctx.state.to='2026-09-24';
  ctx.refreshListAnalysis();
  const report=ctx.state.report;
  assert.equal(report.attendanceDays,1);assert.equal(report.workMs,8*HOUR);
  assert.equal(report.types.banai.count,2);assert.equal(report.types.banai.ms,3*HOUR);
  assert.equal(report.waitingMs,5*HOUR);
  assert.equal(report.extensionCount,2);assert.equal(report.extensionTables,1);assert.equal(report.extensionSales,16000);
  assert.equal(report.extensionRate,50);
  assert.deepEqual(salesCalls,[{items:saved.history[0].items,cid:'a',subtotal:16000}]);
  assert.equal(JSON.stringify(ctx.S),before);
  const html=ctx.listAnalysisReportHtml(report);
  assert.match(html,/延長 1 卓 ÷ 場内指名 2 卓/);assert.match(html,/50\.0%/);
  assert.match(html,/営業終了済みのデータのみ対象/);
  assert.match(html,/会計後の別のお客様は別の来店として数えます/);
  assert.doesNotMatch(html,/営業中のデータ|100%を超える/);
});

test('empty reports are readable and report names and periods are escaped',()=>{
  const ctx=contextFor();
  const report={...LIST_ANALYSIS.buildReport({castId:'a'}),castName:'<script>bad()</script>',from:'<from>',to:'<to>',createdAt:START};
  const empty=ctx.listAnalysisReportHtml(report);
  assert.match(empty,/選択した期間のリスト・場内延長データはありません/);
  assert.doesNotMatch(empty,/NaN|undefined|Infinity|<script>|<from>|<to>|営業日別の内訳/);
  assert.match(empty,/&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  const populated={...report,days:[{date:'<date>',types:report.types,waitingMs:0,extensionCount:0,extensionSales:0}],legacyTypeAssignments:1,missingWaitingDays:1};
  const html=ctx.listAnalysisReportHtml(populated);
  assert.doesNotMatch(html,/営業日別の内訳|&lt;date&gt;|待機時間|待機ログ|勤務時間/);assert.match(html,/復元できません/);
  assert.match(html,/出勤日数あたりの平均は算出できません/);
});

test('unresolved visits keep time visible and show unavailable count averages and extension rate',()=>{
  const ctx=contextFor();
  const report={...LIST_ANALYSIS.buildReport({castId:'a'}),castName:'A',from:'',to:'',createdAt:START,
    attendanceDays:1,workMs:HOUR,unresolvedVisitAssignments:1,unresolvedVisitTypes:['banai'],extensionRate:null};
  report.types.banai={count:0,ms:HOUR,averageCount:null,averageMs:HOUR};
  report.days=[{date:'2026-09-24',types:report.types,waitingMs:0,extensionCount:0,extensionSales:0,unresolvedVisitTypes:['banai']}];
  const html=ctx.listAnalysisReportHtml(report);
  const banai=html.match(/<tr><th scope="row"><span class="la-dot la-banai"><\/span>場内指名<\/th>(.*?)<\/tr>/)[1];
  assert.match(banai,/来店不明の記録あり/);assert.match(banai,/<td>1時間00分<\/td><td>—<\/td><td>1時間00分<\/td>/);
  assert.match(html,/場内指名に対する延長割合<\/span><strong>—<\/strong>/);
  assert.match(html,/来店を特定できない付け回し 1 件は時間のみ集計/);
  assert.match(html,/該当種別の平均回数と、場内指名の回数が不明な場合の延長割合は算出していません/);
  assert.equal((html.match(/来店不明の記録あり/g)||[]).length,1);
});

test('modal and A4 print share free visit averages and omit daily, work, attendance count, and waiting displays',()=>{
  const ctx=contextFor();savedFixture(ctx);ctx.S.activeBizDay=null;
  ctx.state.castId='a';ctx.state.castName='A';ctx.refreshListAnalysis();
  const report=ctx.state.report;
  report.freeAverage={count:2,ms:20*60000,averageMs:10*60000};
  report.attendanceDays=37;report.missingWaitingDays=1;
  report.days[0].date='日別専用ラベル';
  const before=JSON.stringify(report);
  const outputs=[ctx.listAnalysisModalHtml('anaListDetail'),ctx.listAnalysisPrintHtml(report,'https://example.test/list-analysis.css')];
  for(const html of outputs){
    assert.match(html,/フリーの平均時間<\/span><strong>0時間10分<\/strong>/);
    assert.match(html,/1来店卓あたり・合算5分以下を除外/);
    assert.match(html,/平均回数 \/ 日/);assert.match(html,/平均時間 \/ 日/);
    assert.match(html,/表の平均は1出勤日あたり/);
    assert.match(html,/同じ来店卓のフリー時間を合算し、5分を超える卓の合計時間 ÷ 対象卓数/);
    assert.match(html,/5分以下の卓も表の回数・合計時間には含みます/);
    assert.doesNotMatch(html,/営業日別の内訳|日別専用ラベル|la-daily|勤務時間|待機|<span>出勤日数<\/span>|出勤 37 日/);
  }
  assert.equal(JSON.stringify(report),before,'rendering must preserve saved report values');
});

test('free averages show a dash when unavailable and explain unidentified free visits',()=>{
  const ctx=contextFor();
  const report={...LIST_ANALYSIS.buildReport({castId:'a'}),castName:'A',from:'',to:'',createdAt:START,
    freeAverage:{count:0,ms:0,averageMs:null}};
  const empty=ctx.listAnalysisReportHtml(report);
  assert.match(empty,/フリーの平均時間<\/span><strong>—<\/strong>/);
  assert.doesNotMatch(empty,/フリーの来店を特定できない記録/);
  report.freeAverage={count:1,ms:10*60000,averageMs:null};
  report.unresolvedVisitAssignments=1;report.unresolvedVisitTypes=['free'];
  const unresolved=ctx.listAnalysisPrintHtml(report,'https://example.test/list-analysis.css');
  assert.match(unresolved,/フリーの平均時間<\/span><strong>—<\/strong>/);
  assert.match(unresolved,/フリーの来店を特定できない記録があるため、フリーの平均時間は算出していません/);
  assert.doesNotMatch(unresolved,/NaN|undefined|Infinity/);
});

test('printing escapes the standalone document and waits for the popup stylesheet load',()=>{
  const ctx=contextFor(),events=[];
  ctx.state.report={...LIST_ANALYSIS.buildReport({castId:'a'}),castName:'</title><script>bad()</script>',from:'',to:'',createdAt:START};
  const unsafeUrl='https://example.test/a.css?x=" onload="bad()';
  const html=ctx.listAnalysisPrintHtml(ctx.state.report,unsafeUrl);
  assert.match(html,/<!DOCTYPE html><html lang="ja">/);
  assert.ok(html.includes('href="'+ctx.listAnalysisEscape(unsafeUrl)+'"'));
  assert.doesNotMatch(html,/<script>/);assert.match(html,/body class="la-print-page"/);
  const popup={document:{open:()=>events.push('open'),write:value=>{ctx.printed=value;events.push('write');},close:()=>events.push('close')},
    addEventListener:(type,fn,options)=>{assert.equal(type,'load');assert.equal(options.once,true);ctx.onLoad=fn;events.push('listener');},
    focus:()=>events.push('focus'),print:()=>events.push('print')};
  ctx.window.open=()=>popup;ctx.printListAnalysis();
  assert.deepEqual(events,['open','write','listener','close']);
  assert.ok(ctx.printed.includes('https://example.test/pos/list-analysis.css?v='+ctx.APP_VERSION));
  ctx.onLoad();assert.deepEqual(events.slice(-2),['focus','print']);
  ctx.window.open=()=>null;ctx.printListAnalysis();assert.equal(ctx.alerts.length,1);
  assert.match(css,/@page\s*\{\s*size:A4 portrait;\s*margin:12mm;/);
  assert.match(css,/\.la-table thead\s*\{display:table-header-group;/);
  assert.match(css,/\.la-print-controls\s*\{display:none!important;/);
  assert.match(css,/\.la-table tr\s*\{break-inside:avoid;page-break-inside:avoid;/);
});

test('analysis entry points and all new cached assets use the current application version',()=>{
  const ctx=contextFor(),version=ctx.APP_VERSION;
  for(const file of ['list-analysis.css','list-analysis-core.js','list-analysis-ui.js']){
    assert.ok(index.includes(file+'?v='+version),file+' index version');
    assert.ok(sw.includes(file+'?v='+version),file+' service worker version');
  }
  assert.ok(sw.includes('genesis-pos-v'+version+'-auth'));
  assert.ok(index.indexOf('list-analysis-core.js')<index.indexOf('list-analysis-ui.js'));
  assert.ok(index.indexOf('list-analysis-ui.js')<index.indexOf('src="app.js'));
  const start=app.indexOf('function rAnalysis(){'),end=app.indexOf('function anaSetMonth()',start);
  vm.runInContext(app.slice(start,end),ctx);
  assert.match(ctx.rAnalysis(),/onclick="openListAnalysis\(\)"[^>]*>リスト情報<\/button>/);
  assert.match(app,/\["anaListDate","anaListCast","anaListDetail"\]\.includes\(md\)\)\{c.innerHTML=listAnalysisModalHtml\(md\);return;/);
});


test('list candidates exclude trial and departed casts without restoring them from historical records',()=>{
  const ctx=contextFor();
  ctx.S.casts=[
    {id:'regular',name:'在籍',castType:'regular',active:true},
    {id:'trial',name:'体入',castType:'trial',active:true},
    {id:'legacy-trial',name:'旧体入',isTrial:true},
    {id:'status-trial',name:'旧状態の体入',status:'trial'},
    {id:'departed',name:'退店済',castType:'regular',active:false},
    {id:'dispatch',name:'在籍派遣',castType:'dispatch',active:true}
  ];
  ctx.S.bizDays={closed:{date:'2026-09-24',endedAt:START+8*HOUR,
    shifts:['trial','legacy-trial','status-trial','departed','removed-from-roster'].map(castId=>({castId,castName:castId,clockIn:START,clockOut:START+HOUR})),
    assignments:[{castId:'removed-from-roster',castName:'名簿から削除済み',startTime:START,endTime:START+HOUR,type:'free'}]}};
  const before=JSON.stringify(ctx.S);
  for(const range of [{from:'',to:''},{from:'2026-09-24',to:'2026-09-24'}]){
    Object.assign(ctx.state,range);
    assert.deepEqual(clone(ctx.listAnalysisCasts()).map(c=>c.id),['regular','dispatch']);
    const html=ctx.listAnalysisModalHtml('anaListCast');
    assert.doesNotMatch(html,/旧体入|旧状態の体入|退店済|名簿から削除済み|data-cast-id="trial"/);
    for(const id of ['trial','legacy-trial','status-trial','departed','removed-from-roster']){
      ctx.state.castId=null;ctx.state.report=null;ctx.md='anaListCast';ctx.selectListAnalysisCast(id);
      assert.equal(ctx.md,'anaListCast');assert.equal(ctx.state.report,null);assert.equal(ctx.state.castId,null);
    }
  }
  ctx.S.casts=ctx.S.casts.filter(c=>c.id!=='regular'&&c.id!=='dispatch');
  assert.deepEqual(clone(ctx.listAnalysisCasts()),[]);
  assert.match(ctx.listAnalysisModalHtml('anaListCast'),/対象キャストがいません/);
  ctx.S.casts=JSON.parse(before).casts;
  assert.equal(JSON.stringify(ctx.S),before,'candidate filtering must not delete historical data');
});
