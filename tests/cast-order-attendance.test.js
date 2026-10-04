const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const core=require('../cast-order-attendance.js');
const {source,clone,fixture,fakeDb,contextFor,emulator}=require('./helpers/scoped-runtime.cjs');

function receipt(items,extra={}){return{id:10,tableId:'t1',tableLabel:'履歴テーブル',startTime:100,endTime:500,items,total:2600,...extra};}
const drink={id:'cd_1',category:'castDrink',castId:2,castName:'休みキャスト',price:0,qty:3};
const banai={id:'b_2',isBanaiShimei:true,castId:2,castName:'休みキャスト',price:2000,qty:1};

test('missing attendance identifies each receipt, cast and affected order type without mutating sales',()=>{
  const rows=[receipt([drink,banai,drink]),receipt([banai],{id:11,tableLabel:'別会計'})],before=clone(rows);
  const issues=core.missingOrders(rows,{old:{castId:1,clockIn:100,clockOut:200}}, {},[{id:'t1',label:'変更後の卓'}]);
  assert.equal(issues.length,2);
  assert.equal(issues[0].tableLabel,'履歴テーブル');
  assert.equal(issues[0].castName,'休みキャスト');
  assert.deepEqual(issues[0].kinds,['キャストDrink','場内指名']);
  assert.equal(issues[1].historyId,'11');
  assert.deepEqual(rows,before);
});

test('any valid attendance in the active business data resolves the issue, including later clock-in and completed shifts',()=>{
  for(const shift of [{castId:2,clockIn:600},{castId:'2',clockIn:600,clockOut:700}]){
    assert.deepEqual(core.missingOrders([receipt([drink,banai])],{sh:shift}),[]);
  }
  for(const clockIn of [null,0,-1,'invalid',Infinity]){
    assert.equal(core.missingOrders([receipt([drink])],{sh:{castId:2,clockIn}}).length,1);
  }
  assert.equal(core.missingOrders([receipt([drink])],{}).length,1,'deleted attendance is not inferred from names or orders');
});

test('open tables, zero drinks and legacy drink IDs are checked but unrelated orders are unchanged',()=>{
  const issues=core.missingOrders([],{}, {t2:{startTime:200,items:[{...drink,category:undefined}]}},[{id:'t2',label:'フロア卓'}]);
  assert.equal(issues[0].source,'session');assert.equal(issues[0].tableLabel,'フロア卓');
  assert.deepEqual(core.missingOrders([receipt([{isHonShimei:true,castId:2},{category:'guestDrink'},{category:'champagneWine',castId:2}])],{}),[]);
  const noId=core.missingOrders([receipt([{category:'castDrink',castName:'名前のみ'}])],{sh:{castId:2,castName:'名前のみ',clockIn:100}});
  assert.equal(noId.length,1,'matching names are not attendance proof');
});

function runtime(role='op'){
  const state=fixture(),db=fakeDb(state),ctx=contextFor(db,state);
  ctx.window._posRole=role;
  ctx.S.casts=[{id:1,name:'出勤中'},{id:2,name:'休みキャスト'},{id:3,name:'退勤済み'},{id:4,name:'退店済み',active:false}];
  ctx.S.shifts={on:{castId:'1',clockIn:100},out:{castId:3,clockIn:100,clockOut:200}};
  Object.assign(ctx,{offDutyCastSelection:false,cds:0,cdc:null,qm:null,qv:1,md:'cd',
    sc:()=>ctx.S.casts.filter(c=>c.active!==false),getOnduty:()=>Object.values(ctx.S.shifts).filter(sh=>!sh.clockOut),
    renderOrderPartial:()=>{},save:()=>{ctx.saves=(ctx.saves||0)+1;},om:name=>{ctx.md=name;},
    gmsBottleBackEligibleCastIds:()=>[],gmsUniqueStrings:values=>[...new Set(values||[])],
    BANAI_SHIMEI_PRICE:2000
  });
  vm.runInContext(source('function castOrderCandidates','function addCDC'),ctx);
  vm.runInContext(source('function confQty()','function selectLiquorBackCast'),ctx);
  vm.runInContext(source('function assignmentWithType','function assignmentMatchesSession'),ctx);
  ctx.S.sessions.t1.items=[];
  ctx.queueSessionSave=async(tableId,session)=>{ctx.S.sessions[tableId]=session;ctx.saves=(ctx.saves||0)+1;};
  return ctx;
}

test('only OP sees and opens off-duty candidates; normal selection and closed-business restrictions stay intact',()=>{
  for(const role of ['op','cashier','list']){
    const ctx=runtime(role);
    assert.deepEqual(Array.from(ctx.castOrderCandidates(),c=>c.id),[1]);
    assert.equal(ctx.offDutyCastButton().includes('休み'),role==='op');
    ctx.toggleOffDutyCastSelection();
    assert.equal(ctx.offDutyCastSelection,role==='op');
    assert.deepEqual(Array.from(ctx.castOrderCandidates(),c=>c.id),role==='op'?[2,3]:[1]);
    ctx.S.activeBizDay=null;
    assert.equal(ctx.requireCastOrderTarget(2),false);
  }
});

test('cast selection preserves the roster ID type for drink lookup',()=>{
  const ctx=runtime();
  ctx.scc('2');assert.equal(ctx.cdc,2);
  ctx.S.casts[1].id='rest-2';
  ctx.scc('rest-2');assert.equal(ctx.cdc,'rest-2');
  ctx.openCastDrinkQty(ctx.cdc,2000,'Drink');
  assert.equal(ctx.qm.itemData.castId,'rest-2');
});

test('OP can order zero drinks and banai for an off-duty cast without creating attendance or assignments',async()=>{
  const ctx=runtime(),shifts=clone(ctx.S.shifts),assignments=clone(ctx.S.assignments);
  ctx.openCastDrinkQty(2,0,'無料Drink');ctx.qv=3;ctx.confQty();
  await ctx.addBanai(2);
  assert.equal(ctx.S.sessions.t1.items.length,2);
  assert.equal(ctx.S.sessions.t1.items[0].price,0);
  assert.equal(ctx.S.sessions.t1.items[0].qty,3);
  assert.deepEqual(Array.from(ctx.S.sessions.t1.items[0].backTargetCastIds),['2']);
  assert.equal(ctx.S.sessions.t1.items[1].isBanaiShimei,true);
  assert.deepEqual(clone(ctx.S.shifts),shifts);
  assert.deepEqual(clone(ctx.S.assignments),assignments);
});

test('cashier cannot bypass the off-duty restriction through selection, price, banai or final quantity handlers',async()=>{
  const ctx=runtime('cashier');
  ctx.scc(2);assert.equal(ctx.cdc,null);
  ctx.openCastDrinkQty(2,2000,'Drink');assert.equal(ctx.qm,null);
  await ctx.addBanai(2);assert.equal(ctx.S.sessions.t1.items.length,0);
  ctx.qm={id:'cd',category:'castDrink',price:2000,itemData:{castId:2}};
  ctx.confQty();assert.equal(ctx.S.sessions.t1.items.length,0);
  ctx.openCastDrinkQty(1,2000,'Drink');
  ctx.S.shifts.on.clockOut=300;
  ctx.confQty();assert.equal(ctx.S.sessions.t1.items.length,0,'attendance is rechecked on confirmation');
  assert.equal(ctx.saves||0,0);
});

function closingFixture(){
  const state=fixture(),id=state.activeBizDay;
  state.sessions={};state.assignments={};
  state.shifts={sh:{id:'sh',castId:2,clockIn:100,clockOut:400,_rev:1}};
  state.history={10:receipt([drink])};state.bizDays={[id]:{id,date:id,startedAt:50,_rev:1}};
  state._bizDayRevisions={[id]:1};
  state.tables=[{id:'t1',label:'T1'},{id:'t2',label:'T2'}];
  return state;
}
async function end(ctx,state){
  const id=state.activeBizDay,day={...state.bizDays[id],endedAt:600,history:Object.values(state.history),shifts:clone(state.shifts),assignments:clone(state.assignments)};
  return ctx.guardedAtomicBizDayUpdate('end',id,id,null,{
    ['bizDays/'+id]:day,['bizDaySummaries/'+id]:{id,date:id},activeBizDay:null,history:null,shifts:null,assignments:null,sessions:null
  },{['backup-dev/bizDays/'+id]:day},{backupKey:id,expectedDay:state.bizDays[id]});
}
test('end save independently checks current remote attendance even when the local screen is stale',async()=>{
  const state=closingFixture(),db=fakeDb(state),ctx=contextFor(db,state);
  delete state.shifts.sh;
  await assert.rejects(end(ctx,{...state,shifts:clone(ctx.S.shifts)}),error=>error.castAttendanceIssues?.[0].tableLabel==='履歴テーブル');
  assert.equal(db.writes.length,0);
});

test('Firebase atomically rejects attendance or history changes after the final end check',{skip:process.env.POS_RULES_EMULATOR!=='1'},async t=>{
  const em=await emulator('demo-pos-cast-order-attendance');
  for(const action of ['success','shift-deleted','new-missing-order','session-created','proof-removed']){
    await t.test(action,async()=>{
      const state=closingFixture();await em.reset(state);
      const db=em.db(async updates=>{
        if(action==='shift-deleted')await em.request('pos-dev/shifts/sh','PUT',null,true);
        if(action==='new-missing-order')await em.request('pos-dev/history/11','PUT',receipt([{...drink,castId:9}],{id:11}),true);
        if(['shift-deleted','new-missing-order'].includes(action))await em.request('pos-dev/_writeGate','PUT',{versionNum:615800,nonce:'other-writer'},true);
        if(action==='session-created')await em.request('pos-dev/sessions/t2','PUT',{tableId:'t2',sessionId:'late',startTime:500,items:[]},true);
        if(action==='proof-removed')delete updates['pos-dev/_bizDayOperation'].endStateVersion;
      });
      const ctx=contextFor(db,state);
      if(action==='success'){
        await end(ctx,state);
        assert.equal(await em.request('pos-dev/activeBizDay','GET',undefined,true),null);
        assert.equal((await em.request('pos-dev/bizDays/'+state.activeBizDay,'GET',undefined,true)).history[0].total,2600);
      }else{
        await assert.rejects(end(ctx,state),/Permission denied/i);
        assert.equal(await em.request('pos-dev/activeBizDay','GET',undefined,true),state.activeBizDay);
        assert.ok(await em.request('pos-dev/history/10','GET',undefined,true));
      }
    });
  }
});
