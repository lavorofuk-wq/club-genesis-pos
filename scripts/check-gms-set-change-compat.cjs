// Actual committed GMS code, synthetic POS data, no database access or GMS edits.
// Usage: node scripts/check-gms-set-change-compat.cjs <GMS repo> [git refs...]
const assert=require('node:assert/strict'),vm=require('node:vm');
const {loadGms,fixture}=require('./check-gms-discount-compat.cjs');
fixture.charges=require('../charge-core.js');
function buildPair(type,mode,custom){
  const ctx=createContext(),state=registeredState(type);addOrders(state);
  state.castLifecycleLogs[businessDate].enteredCasts.forEach(r=>{r.enteredAt=clockIn;});
  state.castLifecycleLogs[businessDate].trialCasts.forEach(r=>{r.trialRegisteredAt=clockIn;r.trialEndedAt=clockOut;});
  const receipt=state.history[0],base=receipt.items[0],extension=receipt.items.find(i=>i.isExtension);
  base.minutes=60;base.qty=3;
  receipt.guests=3;receipt.totalGuests=3;receipt.setEndTime=receipt.startTime+120*60000;
  extension.extMinutes=60;extension.groupId='phase-one';extension.qty=2;
  extension.guestsBefore=3;extension.totalGuestsBefore=3;
  charges.setNextGuests(receipt,2);
  if(mode==='hon')receipt.items.filter(i=>i.isBanaiShimei).forEach(i=>{delete i.isBanaiShimei;i.isHonShimei=true;});
  function exportState(){
    receipt.subtotal=receipt.items.reduce((sum,i)=>sum+i.price*i.qty,0);
    receipt.tax=Math.floor(receipt.subtotal*.3);receipt.total=receipt.subtotal+receipt.tax;
    receipt.splits=[{method:'cash',amount:receipt.total}];
    const closed=closeSyntheticDay(state);ctx.S=closed;const untouched=JSON.stringify(closed);
    const payload=clone(ctx.gmsClosingPayload(businessDate));assert.equal(payload._gmsError,undefined,payload._gmsError);delete payload._gmsMeta;
    assert.equal(GMS_JSON.validatePayload(payload).length,0);assert.equal(JSON.stringify(closed),untouched);
    return payload;
  }
  const before=exportState();
  charges.setPrice(receipt,base.id,{id:'s90',label:'Set 90',price:15000,minutes:90},{custom,price:7000,allowCustom:true});
  charges.addGuestSet(receipt,{id:'s90',label:'Set 90',price:15000,minutes:90},1,'joined');
  charges.setNextGuests(receipt,4);
  receipt.items.push({id:'ext-next',label:'Next extension',price:8000,qty:4,isExtension:true,extMinutes:60,
    isBanaiExtension:true,banaiExtCastIds:[castId],banaiExtCastNames:[state.casts[0].name]});
  const after=exportState();
  return{before,after,castId,otherId,baseDelta:custom?-9000:15000};
}
vm.runInContext(buildPair.toString(),fixture);
async function check(gms,type,mode,custom){
  const pair=JSON.parse(JSON.stringify(vm.runInContext(`buildPair(${JSON.stringify(type)},${JSON.stringify(mode)},${custom})`,fixture)));
  const before=await gms.parsePosClosingV3(pair.before),after=await gms.parsePosClosingV3(pair.after);
  assert.equal(after.customers.totalCustomers,7);assert.equal(before.customers.totalCustomers,5);
  assert.equal(after.transactions[0].guests,5);assert.equal(before.transactions[0].guests,3);
  assert.deepEqual(after.castWork,before.castWork);
  for(const row of after.castSales){
    const old=before.castSales.find(r=>r.castId===row.castId);
    const honDelta=mode==='hon'?(pair.baseDelta+47000)/2:0;
    const banaiDelta=mode==='banai'?(row.castId===pair.castId?39500:7500):0;
    assert.equal(row.honShimeiSales-old.honShimeiSales,honDelta);
    assert.equal(row.jonaiExtensionSales-old.jonaiExtensionSales,banaiDelta);
    for(const key of ['drinkSales','jonaiExtensionBackSales','honShimeiCount','banaiShimeiCount','dohanCount'])assert.equal(row[key],old[key],key);
  }
  const mapping=Object.fromEntries(after.castWork.map(row=>[row.castId,{masterId:row.castId,name:row.castName,kind:row.castType,hourlyRate:3000}]));
  const liquor=[{kind:'champagneWine',name:'シャンパン',salePrice:30000,costPrice:4000},{kind:'keepBottle',name:'キープボトル',salePrice:20000,costPrice:3000}];
  const previous=gms.buildDailyCasts(before,mapping,liquor,{}),next=gms.buildDailyCasts(after,mapping,liquor,{});
  assert.equal(next.length,previous.length);
  for(const row of next){
    const old=previous.find(r=>r.posCastId===row.posCastId);
    for(const key of ['bottles','liquorCost','drinkAllocations','drinkSales','dohanCount','dohanBack','honShimeiCount','banaiShimeiCount'])assert.deepEqual(row[key],old[key],key);
    const sale=after.castSales.find(r=>r.castId===row.posCastId);
    assert.equal(row.honShimeiSales,sale.honShimeiSales);assert.equal(row.jonaiExtensionSales,sale.jonaiExtensionSales);
  }
}
async function main(){
  for(const ref of process.argv.slice(3).length?process.argv.slice(3):['origin/main','origin/dev']){
    const{gms,commit}=loadGms(ref);let cases=0;
    for(const type of ['regular','trial','dispatch'])for(const mode of ['hon','banai'])for(const custom of [false,true]){
      try{await check(gms,type,mode,custom);cases++;}catch(error){throw new Error(`${ref} ${type} ${mode} custom=${custom}`,{cause:error});}
    }
    console.log(`${ref} ${commit.slice(0,12)}: ${cases} cases passed (guest totals, set corrections, joins, phases, import, payroll sales and unchanged backs).`);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
