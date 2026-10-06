// Usage: node scripts/check-gms-drink-change-compat.cjs <GMS repo> [git refs...]
// Executes committed GMS source read-only, without database access.
const assert=require('node:assert/strict'),vm=require('node:vm');
const {loadGms,fixture}=require('./check-gms-discount-compat.cjs');
fixture.drinkChange=require('../cast-drink-change.js');
function payloadPair(castType,mode,reverse){
  const ctx=createContext();let state=registeredState(castType);addOrders(state);state=rename(ctx,state);
  state.castLifecycleLogs[businessDate].enteredCasts.forEach(row=>{row.enteredAt=clockIn;});
  state.castLifecycleLogs[businessDate].trialCasts.forEach(row=>{row.trialRegisteredAt=clockIn;row.trialEndedAt=clockOut;});
  const receipt=state.history[0],drink=receipt.items.find(i=>i.category==='castDrink');
  if(mode==='hon')receipt.items.filter(i=>i.isBanaiShimei).forEach(i=>{delete i.isBanaiShimei;i.isHonShimei=true;});
  if(reverse){drink.castId=otherId;drink.castName=state.casts[1].name;drink.backTargetCastIds=[otherId];drink.backTargetCastNames=[state.casts[1].name];}
  const target=state.casts.find(c=>String(c.id)!==String(drink.castId)),fromId=drink.castId;
  function exportState(s){
    const closed=closeSyntheticDay(s);ctx.S=closed;const before=clone(closed),payload=clone(ctx.gmsClosingPayload(businessDate));
    assert.equal(payload._gmsError,undefined,payload._gmsError);delete payload._gmsMeta;
    assert.equal(GMS_JSON.validatePayload(payload).length,0);assert.equal(JSON.stringify(closed),JSON.stringify(before));
    return payload;
  }
  const baseline=exportState(state);
  state.history[0]=drinkChange.change(receipt,drink.id,target);
  const changed=exportState(state);
  return{baseline,changed,fromId,toId:target.id};
}
vm.runInContext(payloadPair.toString(),fixture);
async function check(gms,type,mode,reverse){
  const pair=JSON.parse(JSON.stringify(vm.runInContext(`payloadPair(${JSON.stringify(type)},${JSON.stringify(mode)},${reverse})`,fixture)));
  const before=await gms.parsePosClosingV3(pair.baseline),after=await gms.parsePosClosingV3(pair.changed);
  assert.deepEqual(before.sales,after.sales);assert.deepEqual(before.castWork,after.castWork);
  for(const row of after.castSales){
    const previous=before.castSales.find(r=>r.castId===row.castId);
    for(const key of ['honShimeiSales','jonaiExtensionSales','jonaiExtensionBackSales'])assert.equal(row[key],previous[key]);
    assert.equal(row.drinkSales,row.castId===pair.toId?10000:0);
  }
  const mapping=Object.fromEntries(after.castWork.map(row=>[row.castId,{masterId:row.castId,name:row.castName,kind:row.castType,hourlyRate:3000}]));
  const liquor=[{kind:'champagneWine',name:'シャンパン',salePrice:30000,costPrice:4000},{kind:'keepBottle',name:'キープボトル',salePrice:20000,costPrice:3000}];
  const oldDaily=gms.buildDailyCasts(before,mapping,liquor,{}),newDaily=gms.buildDailyCasts(after,mapping,liquor,{});
  assert.equal(newDaily.length,type==='dispatch'?1:2,'dispatch remains outside regular/trial payroll');
  for(const next of newDaily){
    const previous=oldDaily.find(r=>r.posCastId===next.posCastId);
    for(const key of ['honShimeiSales','jonaiExtensionSales','honShimeiCount','banaiShimeiCount','dohanCount','dohanBack','bottles','liquorCost'])assert.deepEqual(next[key],previous[key],key);
    assert.equal(next.drinkSales,next.posCastId===pair.toId?10000:0);
    assert.equal((next.drinkAllocations||[]).reduce((sum,r)=>sum+r.backAmount,0),next.posCastId===pair.toId?1000:0);
  }
  const rewards=gms.calculateCastRewards([{id:'changed',businessDate:after.businessDate,status:'approved',casts:newDaily,posSnapshot:after}],[],'2026-09');
  const oldRewards=gms.calculateCastRewards([{id:'baseline',businessDate:before.businessDate,status:'approved',casts:oldDaily,posSnapshot:before}],[],'2026-09');
  assert.equal(rewards.reduce((sum,r)=>sum+r.drinkBack,0),type!=='regular'&&reverse?0:1000,'existing trial/dispatch payroll policy');
  for(const row of rewards){
    const previous=oldRewards.find(r=>r.id===row.id);
    assert.ok(previous);for(const key of ['honShimeiSales','jonaiExtensionSales','bottleBack','salesRewardBase'])assert.equal(row[key],previous[key],key);
  }
  for(let i=0;i<after.transactions.length;i++)assert.deepEqual(after.transactions[i].items.map(r=>[r.itemId,r.price,r.quantity]),before.transactions[i].items.map(r=>[r.itemId,r.price,r.quantity]));
}
async function main(){
  for(const ref of process.argv.slice(3).length?process.argv.slice(3):['origin/main','origin/dev']){
    const{gms,commit}=loadGms(ref);let cases=0;
    for(const type of ['regular','trial','dispatch'])for(const mode of ['hon','banai'])for(const reverse of [false,true]){
      try{await check(gms,type,mode,reverse);cases++;}catch(e){throw new Error(`${ref} ${type} ${mode} reverse=${reverse}`,{cause:e});}
    }
    console.log(`${ref} ${commit.slice(0,12)}: ${cases} cases passed (export/checksum/import, same-name IDs, daily sales/backs, monthly rewards, order position).`);
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
