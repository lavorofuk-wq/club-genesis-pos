// Actual committed GMS import and payroll code; synthetic records only.
const assert=require('node:assert/strict'),vm=require('node:vm');
const {loadGms,fixture}=require('./check-gms-discount-compat.cjs');
const {loadCostRetention}=require('./check-gms-drink-order-compat.cjs');
fixture.banaiEdit=require('../cast-drink-change.js');
fixture.banaiItems=require('../tests/helpers/banai-order-fixture.cjs').items;
function banaiPair(type,operation,hon,discount){
  const ctx=createContext(),state=registeredState(type);addOrders(state);state.sessions={};
  state.castLifecycleLogs[businessDate].enteredCasts.forEach(r=>r.enteredAt=clockIn);
  state.castLifecycleLogs[businessDate].trialCasts.forEach(r=>{r.trialRegisteredAt=clockIn;r.trialEndedAt=clockOut;});
  const names=new Map(state.casts.map(c=>[c.id,c.name]));
  const receipt=state.history[0];receipt.items=banaiItems(castId,otherId);
  if(hon){
    receipt.items.push({id:'hon',isHonShimei:true,castId,castName:names.get(castId),price:0,qty:1});
    receipt.items.filter(i=>i.category==='keepBottle').forEach(i=>{i.castId=castId;i.backTargetCastIds=[castId];});
  }
  receipt.items.forEach(i=>{
    if(i.castId)i.castName=names.get(i.castId);
    if(i.banaiExtCastIds)i.banaiExtCastNames=i.banaiExtCastIds.map(id=>names.get(id));
    if(i.backTargetCastIds)i.backTargetCastNames=i.backTargetCastIds.map(id=>names.get(id));
  });
  function output(){
    const r=state.history[0];r.subtotal=discount?35000:61000;r.tax=18300;r.discount=discount?26000:0;r.total=r.subtotal+r.tax;
    if(discount){r.adjustedTotal=r.total;r.adjustedTotalTax=r.tax;r.adjustedTotalBaseSubtotal=61000;}
    r.splits=[{method:'cash',amount:r.total}];ctx.S=closeSyntheticDay(state);
    const untouched=JSON.stringify(ctx.S),payload=clone(ctx.gmsClosingPayload(businessDate));
    assert.equal(payload._gmsError,undefined,payload._gmsError);delete payload._gmsMeta;
    const errors=GMS_JSON.validatePayload(payload);assert.equal(errors.length,0,errors.join('\n'));assert.equal(JSON.stringify(ctx.S),untouched);return payload;
  }
  const before=output();
  const choice=operation==='shared'?{ext1:[castId,otherId]}:operation==='single'?{ext1:[otherId]}:operation==='empty'?{ext1:[],ext2:[otherId]}:{ext2:[]};
  const id=operation==='empty'?'nom-a':'nom-b',position=operation==='empty'?9:operation==='later-empty'?10:2;
  state.history[0]=banaiEdit.reorderBanai(receipt,id,position,hon?{}:choice,ctx.gmsItemCategory);
  return{before,after:output(),castId,otherId};
}
vm.runInContext(banaiPair.toString(),fixture);
async function check(gms,retain,type,operation,hon,discount){
  const pair=JSON.parse(JSON.stringify(vm.runInContext(`banaiPair(${JSON.stringify(type)},${JSON.stringify(operation)},${hon},${discount})`,fixture)));
  const before=await gms.parsePosClosingV3(pair.before),after=await gms.parsePosClosingV3(pair.after),ratio=discount?35000/61000:1;
  const expected=hon?[0,0]:operation==='shared'?[Math.floor(16000*ratio),Math.floor(16000*ratio)+Math.floor(15000*ratio)]:
    operation==='single'?[0,Math.floor(47000*ratio)]:operation==='empty'?[0,Math.floor(17000*ratio)]:[Math.floor(32000*ratio),0];
  assert.deepEqual(after.sales,before.sales);assert.deepEqual(after.customers,before.customers);assert.deepEqual(after.castWork,before.castWork);
  const mapping=Object.fromEntries(after.castWork.map(c=>[c.castId,{masterId:c.castId,name:c.castName,kind:c.castType,hourlyRate:3000}]));
  const liquor=[{kind:'keepBottle',name:'bottle1',salePrice:20000,costPrice:2000},{kind:'keepBottle',name:'bottle2',salePrice:10000,costPrice:1000}];
  const oldDaily=gms.buildDailyCasts(before,mapping,liquor,{}),daily=gms.buildDailyCasts(after,mapping,liquor,{});
  for(const [n,id] of [pair.castId,pair.otherId].entries()){
    const sale=after.castSales.find(c=>c.castId===id),row=daily.find(c=>c.posCastId===id),old=oldDaily.find(c=>c.posCastId===id);
    assert.equal(sale?.jonaiExtensionSales||0,expected[n]);
    if(type==='dispatch'&&n===0){assert.equal(row,undefined);assert.equal(old,undefined);continue;}
    assert.equal(row.jonaiExtensionSales,Math.floor(expected[n]/10)*10);
    assert.equal(row.honShimeiSales,hon&&n===0?(discount?35000:61000):0);
    for(const k of ['honShimeiCount','banaiShimeiCount','dohanCount','dohanBack','hours'])assert.equal(row[k],old[k]);
    assert.equal((row.drinkAllocations||[]).reduce((sum,d)=>sum+d.backAmount,0),n===0?400:0);
    const bottles=after.transactions[0].items.filter(i=>i.category==='keepBottle'&&i.backTargetCastIds.includes(id));
    assert.equal(row.bottles.length,bottles.length);
    for(const bottle of bottles){
      const allocation=row.bottles.find(b=>b.itemId===bottle.itemId),count=bottle.backTargetCastIds.length,cost=bottle.itemId==='bottle1'?2000:1000;
      assert.equal(allocation.salesAmount,bottle.price/count);assert.equal(allocation.costAmount,cost/count);
      assert.equal(allocation.backAmount,Math.floor(Math.floor((bottle.price-cost)*.15/10)*10/count/10)*10);
    }
  }
  const oldIndex=before.transactions[0].items.findIndex(i=>i.itemId==='bottle1'),newIndex=after.transactions[0].items.findIndex(i=>i.itemId==='bottle1');
  const oldKey=gms.posItemOccurrenceKey(before.transactions[0],oldIndex),newKey=gms.posItemOccurrenceKey(after.transactions[0],newIndex);
  const costs=retain(before,after,{[oldKey]:2000});
  if(oldKey!==newKey)assert.equal(costs[newKey],undefined,'shifted special costs require confirmation');
}
async function main(){
  for(const ref of process.argv.slice(3).length?process.argv.slice(3):['origin/main','origin/dev']){
    const {gms,commit}=loadGms(ref),retain=loadCostRetention(commit,gms);let count=0;
    for(const type of ['regular','trial','dispatch'])for(const operation of ['shared','single','empty','later-empty'])for(const hon of [false,true])for(const discount of [false,true]){
      try{await check(gms,retain,type,operation,hon,discount);count++;}catch(error){throw new Error(`${ref} ${type} ${operation} hon=${hon} discount=${discount}`,{cause:error});}
    }
    console.log(`${ref} ${commit.slice(0,12)}: ${count} cases passed (reselection, empty phases, discounts, counts, attendance, drink and bottle backs, reimport cost guard).`);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
