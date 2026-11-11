const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {source}=require('./helpers/scoped-runtime.cjs');
const {installAccessRuntime}=require('./helpers/access-runtime.cjs');

function setup(role,activeBizDay='2026-10-02'){
  const context={window:{},S:{activeBizDay},md:null,vw:'home',at:null,
    document:{getElementById:()=>({style:{},innerHTML:''})},sbs:()=>{}};
  installAccessRuntime(context,{role});return context;
}

test('cashier data permission enables data entry points without promoting operational authority',()=>{
  for(const role of ['cashier','list','op']){
    const ctx=setup(role),hasData=role!=='list';
    assert.equal(ctx.posCanView('history'),hasData,role);
    for(const modal of ['editpay','viewHistDetail'])assert.equal(ctx.posCanOpenModal(modal),hasData,role+': '+modal);
    if(role==='cashier')assert.match(ctx.posLimitedHome(),/sv\('history'\).*?データ/);
    for(const view of ['analysis','admin','histlog','backupDetail','accounts'])assert.equal(ctx.posCanView(view),role==='op',role+': '+view);
    for(const modal of ['dh','endBizDay','mgmtMenu','deleteSession','anaDateSel','restore-conflicts','loadBizDayConfirm_2026-10-01'])assert.equal(ctx.posCanOpenModal(modal),role==='op',role+': '+modal);
    assert.equal(ctx.posCanStartBusiness(),role!=='list');
  }
});

test('closed data and attendance stay blocked while OP archived invoice viewing remains available',()=>{
  for(const role of ['cashier','list','op']){
    const ctx=setup(role,null);
    for(const view of ['history','shifts','floor','list'])assert.equal(ctx.posCanView(view),false,role+': '+view);
    for(const modal of ['editpay','shift','dh'])assert.equal(ctx.posCanOpenModal(modal),false,role+': '+modal);
    assert.equal(ctx.posCanOpenModal('viewHistDetail'),role==='op','OP archived detail remains read-only when closed');
    if(role!=='op')assert.doesNotMatch(ctx.posLimitedHome(),/sv\('(?:history|shifts|floor|list)'\)/);
    assert.equal(ctx.posCanView('histlog'),role==='op');
  }
});

test('invalidated cashier session cannot reopen data or its dialogs',()=>{
  const ctx=setup('cashier');ctx.window._posAccessInvalidated=true;
  assert.equal(ctx.posCanView('history'),false);
  for(const name of ['editpay','viewHistDetail','dh'])assert.equal(ctx.posCanOpenModal(name),false,name);
});

test('cashier and list accounts cannot directly invoke summary exports or session deletion',async()=>{
  for(const role of ['cashier','list']){
    const ctx=setup(role),before=JSON.stringify(ctx.S);
    ctx.confirm=()=>assert.fail('unauthorized destructive confirmation');
    for(const [start,end] of [
      ['function exportCSV(){','function cdh'],
      ['function exportDrinkDataXLSX(){','// ===== RECEIPT PRINT END ====='],
      ['async function execDeleteSession(){','// ===== ラストオーダー機能 ====='],
      ['async function clearAllSessions(){','async function clearAllAssignments(){']
    ])vm.runInContext(source(start,end),ctx);
    for(const name of ['exportCSV','exportDrinkDataXLSX','exportAccountingDataXLSX','exportSalesDataXLSX','execDeleteSession','clearAllSessions']){
      assert.equal(await ctx[name](),false,role+': '+name);
    }
    assert.equal(JSON.stringify(ctx.S),before);
  }
});
