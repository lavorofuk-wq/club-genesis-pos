const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {source}=require('./helpers/scoped-runtime.cjs');

function runtime(overrides={}){
  const rendered=[];
  const ctx={
    S:{activeBizDay:'day',bizDays:{day:{id:'day',date:'2026-10-02',startedAt:1790938800000}},history:[],sessions:{},...overrides},
    TAX_RATE:.30,TOTAL_ROUND_UNIT:100,priceHidden:false,
    window:{_fbFirstSync:true},tableChangeBusy:false,
    finishInitialPosSyncPath:()=>{},hasPendingSettingSaves:()=>false,
    clientUpdateRequired:()=>false,sbs:()=>{},
    handlePosSyncRender:()=>rendered.push(ctx.rHome())
  };
  vm.createContext(ctx);
  vm.runInContext(source('function fmt(','function isV('),ctx);
  vm.runInContext(source('function pAmt(','function togglePriceHide('),ctx);
  vm.runInContext(source('function rHome(){','function rHistLog(){'),ctx);
  vm.runInContext(source('function applyPosCoreValue(','function subscribePosCoreData('),ctx);
  return{ctx,rendered};
}

function summary(html,label){
  const match=html.match(new RegExp('>'+label+'</div><div[^>]*>([^<]+)</div>'));
  assert.ok(match,`${label} の金額表示が存在する`);
  return match[1];
}

function assertSummary(ctx,paid,pending,total){
  const html=ctx.rHome();
  assert.equal(summary(html,'会計済み'),paid);
  assert.equal(summary(html,'未収'),pending);
  assert.equal(summary(html,'合計見込み'),total);
  return html;
}

test('営業開始直後は会計済み・未収・合計見込みが0円で表示される',()=>{
  for(const history of [[],undefined]){
    const {ctx}=runtime({history});
    assertSummary(ctx,'¥0','¥0','¥0');
  }
});

test('営業日スナップショットに履歴がなくても最新の会計済み1件を表示する',()=>{
  const {ctx}=runtime({history:[{id:'receipt-1',total:13000,items:[{price:99999,qty:1}]}]});
  assert.equal(ctx.S.bizDays.day.history,undefined);
  assertSummary(ctx,'¥13,000','¥0','¥13,000');
});

test('会計済み複数件は保存済み最終金額を合算し現在の会計計算で再計算しない',()=>{
  const history=[
    {id:'cash',total:12100,subtotal:9000,paymentMethod:'cash',items:[{price:10000,qty:1}]},
    {id:'card',total:23400,subtotal:18000,paymentMethod:'card',items:[{price:18000,qty:1}]}
  ];
  const {ctx}=runtime({history});
  const before=JSON.stringify(ctx.S);
  assertSummary(ctx,'¥35,500','¥0','¥35,500');
  assert.equal(JSON.stringify(ctx.S),before,'ホーム描画は営業日・会計データを書き換えない');
});

test('未収は進行中セッションの現在の計算結果で合算し会計済みと合計見込みへ反映する',()=>{
  const {ctx}=runtime({
    history:[{id:'receipt-1',total:13000}],
    sessions:{
      t1:{items:[{price:10000,qty:1}]},
      t2:{items:[{price:2000,qty:2}],adjustedTotal:5000,adjustedTotalBaseSubtotal:4000,adjustedTotalTax:1200}
    }
  });
  assert.equal(ctx.ct(ctx.S.sessions.t1).total,13000);
  assert.equal(ctx.ct(ctx.S.sessions.t2).total,5000);
  assertSummary(ctx,'¥13,000','¥18,000','¥31,000');
});

test('他端末からのhistory同期でホームの会計済み表示が更新される',()=>{
  const {ctx,rendered}=runtime();
  ctx.applyPosCoreValue({},'history',{
    receipt1:{id:'receipt1',startTime:100,total:13000},
    receipt2:{id:'receipt2',startTime:200,total:26000}
  });
  assert.equal(ctx.S.history[0].id,'receipt2','実同期処理の並び順を保持する');
  assert.equal(rendered.length,1);
  assert.equal(summary(rendered[0],'会計済み'),'¥39,000');
  assertSummary(ctx,'¥39,000','¥0','¥39,000');
  assert.equal(ctx.S.bizDays.day.history,undefined,'営業日スナップショットの再保存は不要');
});

test('会計復元後は履歴から除いた金額を未収へ移し二重計上しない',()=>{
  const {ctx}=runtime({history:[{id:'restored',startTime:100,total:13000},{id:'kept',startTime:200,total:26000}]});
  assertSummary(ctx,'¥39,000','¥0','¥39,000');
  ctx.S.sessions.t1={items:[{price:10000,qty:1}]};
  ctx.applyPosCoreValue({},'history',[{id:'kept',startTime:200,total:26000}]);
  assertSummary(ctx,'¥26,000','¥13,000','¥39,000');
});

test('会計履歴の削除・全削除同期後に古い会計済み金額を残さない',()=>{
  const {ctx,rendered}=runtime({history:[{id:'receipt',startTime:100,total:13000}]});
  assertSummary(ctx,'¥13,000','¥0','¥13,000');
  ctx.applyPosCoreValue({},'history',null);
  assert.equal(rendered.length,1);
  assertSummary(ctx,'¥0','¥0','¥0');
});

test('過去日再開後は古い営業日スナップショットでなく編集後の現在履歴を表示する',()=>{
  const snapshot=[{id:'old',startTime:100,total:13000}];
  const {ctx}=runtime({
    bizDays:{day:{id:'day',date:'2026-09-11',startedAt:1789124363465,history:snapshot}},
    history:[{id:'old',startTime:100,total:15600},{id:'new',startTime:200,total:26000}]
  });
  assertSummary(ctx,'¥41,600','¥0','¥41,600');
  assert.equal(ctx.S.bizDays.day.history[0].total,13000,'保存済み営業日を描画時に変更しない');
  ctx.applyPosCoreValue({},'history',null);
  assertSummary(ctx,'¥0','¥0','¥0');
});

test('未営業ホームに残存履歴の金額を表示しない',()=>{
  const {ctx}=runtime({activeBizDay:null,history:[{total:13000}]});
  const html=ctx.rHome();
  assert.match(html,/現在営業中の日はありません/);
  assert.match(html,/営業を開始する/);
  assert.doesNotMatch(html,/会計済み|合計見込み|¥13,000/);
});

test('金額非表示モードは会計済み・未収・合計見込みすべてをマスクする',()=>{
  const {ctx}=runtime({history:[{total:13000}],sessions:{t1:{items:[{price:2000,qty:1}]}}});
  ctx.priceHidden=true;
  const html=assertSummary(ctx,'¥****','¥****','¥****');
  assert.doesNotMatch(html,/¥13,000|¥2,600|¥15,600/);
  ctx.priceHidden=false;
  assertSummary(ctx,'¥13,000','¥2,600','¥15,600');
});
