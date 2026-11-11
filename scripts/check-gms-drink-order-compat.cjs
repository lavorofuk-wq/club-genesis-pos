// Actual committed GMS code, synthetic POS exports, no database access or GMS edits.
const assert=require('node:assert/strict'),vm=require('node:vm');
const {loadGms,fixture}=require('./check-gms-discount-compat.cjs');
const {execFileSync}=require('node:child_process'),path=require('node:path');
const ts=require('node:module').createRequire(path.resolve(process.argv[2],'package.json'))('typescript');
function loadCostRetention(ref,gms){
  const source=execFileSync('git',['show',ref+':src/components/store-work.tsx'],{cwd:process.argv[2],encoding:'utf8'});
  const parsed=ts.createSourceFile('store-work.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
  const declaration=parsed.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='retainMatchingSpecialCosts');
  assert.ok(declaration,'GMS cost retention function exists');
  const compiled=ts.transpileModule(declaration.getText(parsed),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};vm.runInThisContext('(function(exports,posItemOccurrenceKey){'+compiled+'})')(exports,gms.posItemOccurrenceKey);
  return exports.retainMatchingSpecialCosts;
}
fixture.drinkEdit=require('../cast-drink-change.js');
function editPair(type,mode,operation){
  const ctx=createContext(),state=registeredState(type);addOrders(state);
  state.castLifecycleLogs[businessDate].enteredCasts.forEach(r=>{r.enteredAt=clockIn;});
  state.castLifecycleLogs[businessDate].trialCasts.forEach(r=>{r.trialRegisteredAt=clockIn;r.trialEndedAt=clockOut;});
  const receipt=state.history[0],drink=receipt.items.find(i=>i.category==='castDrink');
  if(mode==='hon')receipt.items.filter(i=>i.isBanaiShimei).forEach(i=>{delete i.isBanaiShimei;i.isHonShimei=true;});
  receipt.items.push({id:'late-ext',label:'Next extension',price:4000,qty:1,isExtension:true,isBanaiExtension:true,banaiExtCastIds:[otherId]});
  function output(){
    const r=state.history[0];r.subtotal=r.items.reduce((sum,i)=>sum+i.price*i.qty,0);r.total=r.subtotal;r.splits=[{method:'cash',amount:r.total}];
    ctx.S=closeSyntheticDay(state);const untouched=JSON.stringify(ctx.S),payload=clone(ctx.gmsClosingPayload(businessDate));
    assert.equal(payload._gmsError,undefined,payload._gmsError);delete payload._gmsMeta;assert.equal(GMS_JSON.validatePayload(payload).length,0);
    assert.equal(JSON.stringify(ctx.S),untouched);return payload;
  }
  const before=output();
  state.history[0]=operation==='price'?drinkEdit.reprice(receipt,drink.id,{price:3000,qty:4,menuId:'cd3',menuLabel:'Drink 3000'}):
    operation==='zero'?drinkEdit.reprice(receipt,drink.id,{price:0,qty:2}):
    drinkEdit.reorder(receipt,drink.id,operation==='early'?3:receipt.items.length-1);
  return{before,after:output(),castId,otherId};
}
vm.runInContext(editPair.toString(),fixture);
async function check(gms,retainCosts,type,mode,operation){
  const pair=JSON.parse(JSON.stringify(vm.runInContext(`editPair(${JSON.stringify(type)},${JSON.stringify(mode)},${JSON.stringify(operation)})`,fixture)));
  const before=await gms.parsePosClosingV3(pair.before),after=await gms.parsePosClosingV3(pair.after);
  const delta=operation==='price'?2000:operation==='zero'?-10000:0,drinkAmount=10000+delta;
  assert.deepEqual(after.castWork,before.castWork);
  for(const key of ['groupCount','totalCustomers'])assert.equal(after.customers[key],before.customers[key]);
  assert.equal(after.sales.totalSales-before.sales.totalSales,delta);
  assert.equal(after.customers.customerUnitPrice,Math.floor(after.sales.totalSales/after.customers.totalCustomers));
  for(const row of after.castSales){
    const prev=before.castSales.find(r=>r.castId===row.castId);
    assert.equal(row.honShimeiSales-prev.honShimeiSales,mode==='hon'?delta/2:0);
    const extensionDelta=mode==='hon'?0:operation==='early'?-5000:operation==='late'?(row.castId===pair.castId?-5000:5000):delta/2;
    assert.equal(row.jonaiExtensionSales-prev.jonaiExtensionSales,extensionDelta);
    assert.equal(row.jonaiExtensionBackSales,prev.jonaiExtensionBackSales);
    assert.equal(row.drinkSales,row.castId===pair.castId?drinkAmount:0);
  }
  const mapping=Object.fromEntries(after.castWork.map(r=>[r.castId,{masterId:r.castId,name:r.castName,kind:r.castType,hourlyRate:3000}]));
  const liquor=[{kind:'champagneWine',name:'シャンパン',salePrice:30000,costPrice:4000},{kind:'keepBottle',name:'キープボトル',salePrice:20000,costPrice:3000}];
  const oldDaily=gms.buildDailyCasts(before,mapping,liquor,{}),newDaily=gms.buildDailyCasts(after,mapping,liquor,{});
  const withoutKeys=rows=>rows.map(({sourceKey,...row})=>row);
  for(const row of newDaily){
    const prev=oldDaily.find(r=>r.posCastId===row.posCastId),sale=after.castSales.find(r=>r.castId===row.posCastId);
    assert.equal(row.honShimeiSales,sale.honShimeiSales);assert.equal(row.jonaiExtensionSales,sale.jonaiExtensionSales);
    assert.deepEqual(withoutKeys(row.bottles),withoutKeys(prev.bottles));assert.equal(row.liquorCost,prev.liquorCost);
    assert.equal((row.drinkAllocations||[]).reduce((n,r)=>n+r.backAmount,0),row.posCastId===pair.castId?drinkAmount*.1:0);
    for(const key of ['honShimeiCount','banaiShimeiCount','dohanCount','dohanBack'])assert.equal(row[key],prev[key]);
  }
  const beforeOther=before.transactions[0].items.filter(r=>r.category!=='castDrink');
  const afterOther=after.transactions[0].items.filter(r=>r.category!=='castDrink');assert.deepEqual(afterOther,beforeOther);
  const oldBottle=before.transactions[0].items.findIndex(r=>r.category==='champagneWine'),newBottle=after.transactions[0].items.findIndex(r=>r.category==='champagneWine');
  const oldKey=gms.posItemOccurrenceKey(before.transactions[0],oldBottle),newKey=gms.posItemOccurrenceKey(after.transactions[0],newBottle);
  const retained=retainCosts(before,after,{[oldKey]:4000});
  assert.equal(retained[newKey],oldKey===newKey?4000:undefined,'shifted special cost requires re-confirmation, never a guessed transfer');
  if(!delta)assert.deepEqual(after.sales,before.sales);
}
async function main(){
  for(const ref of process.argv.slice(3).length?process.argv.slice(3):['origin/main','origin/dev']){
    const{gms,commit}=loadGms(ref),retainCosts=loadCostRetention(commit,gms);let count=0;
    for(const type of ['regular','trial','dispatch'])for(const mode of ['hon','banai'])for(const operation of ['price','zero','early','late']){
      try{await check(gms,retainCosts,type,mode,operation);count++;}catch(error){throw new Error(`${ref} ${type} ${mode} ${operation}`,{cause:error});}
    }
    console.log(`${ref} ${commit.slice(0,12)}: ${count} cases passed (amount/quantity, cross-extension reorder, import, sales, drink backs, unchanged bottles and attendance).`);
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={loadCostRetention};
