const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const {plan}=require("../settings-store.js");
const app=fs.readFileSync(path.join(__dirname,"../app.js"),"utf8");
function source(from,to){
  const start=app.indexOf(from),end=app.indexOf(to,start+from.length);
  assert.ok(start>=0&&end>start,from+" extraction boundary");
  return app.slice(start,end);
}
const plain=value=>JSON.parse(JSON.stringify(value));
function runtime(){
  const ctx={
    S:{menus:{drinks:[{id:"soda",label:"SODA_ROW",price:1000}],champagne:[{id:"bottle",label:"WINE_ROW",price:5000}],keepBottles:[],castDrinks:[{id:"cd2",label:"無料Drink",price:0}]},casts:[{id:1,name:"A"}],sessions:{t1:{items:[]}}},
    at:"t1",qv:1,qm:null,cds:0,cdc:1,TAX_RATE:.3,TOTAL_ROUND_UNIT:100,
    fmt:value=>Number(value||0).toLocaleString("ja-JP"),
    save:()=>{},closeM:()=>{},renderOrderPartial:()=>{},
    gmsUniqueStrings:values=>[...new Set((values||[]).filter(value=>value!=null&&value!=="").map(String))],
    gmsBottleBackEligibleCastIds:()=>[],gmsBottleBackTargetCasts:()=>[],
    gmsCastName:(_id,name)=>name||"",gmsInt:value=>Math.round(Number(value)||0),
    roomTypeFromItem:()=>"",gmsBanaiExtensionSalesPhases:()=>[],recordSalesScale:()=>1,
    document:{getElementById:()=>({value:"0"})},
    om:()=>{ctx.modalOpens=(ctx.modalOpens||0)+1;},
    alert:message=>assert.fail("Unexpected alert: "+message)
  };
  vm.createContext(ctx);
  for(const [from,to] of [
    ["function roundCharge","function isV("],
    ["function isFreeDrinkItem","function hasFreeDrinkItem"],
    ["function isSetCatItem","function remItemDetail"],
    ["function buildReceiptHTML","function eposPrint("],
    ["function buildEposXML","function printReceiptFallback"],
    ["function confQty()","function selectLiquorBackCast"],
    ["function odq(","function ofdq("],
    ["function addCDC()","function addExt2("],
    ["function gmsItemCategory","function gmsIsBanaiBackItem"],
    ["function gmsCastSales(","function gmsCastSalesSummary"],
    ["function gmsTransactionItems","function gmsTransactions"],
    ["function _castDrinkRowsFromHist","function exportDrinkDataXLSX"]
  ])vm.runInContext(source(from,to),ctx);
  return ctx;
}
function membership(ctx,item){return[ctx.isSetCatItem(item),ctx.isGuestCatItem(item),ctx.isCastCatItem(item)];}
function receipt(ctx,items,extra={}){
  const charge=ctx.ct({items});
  return{tableLabel:"T1",guests:1,items,startTime:1,isGuest:true,...charge,...extra};
}

test("deleting a menu keeps existing rows in live sections and both guest receipt formats",()=>{
  const ctx=runtime();
  const soda={id:"soda_1",label:"SODA_ROW",price:1000,qty:1};
  const bottle={id:"bottle_1",label:"WINE_ROW",price:5000,qty:1,category:"champagneWine"};
  const items=[soda,bottle],before=JSON.stringify(items);
  for(const [category,id] of [["drinks","soda"],["champagne","bottle"]]){
    const base=ctx.S.menus[category][0];
    ctx.S.menus=plan({kind:"menu",category,id,action:"delete",base,values:{}},ctx.S.menus).next;
  }
  assert.deepEqual(membership(ctx,soda),[false,true,false]);
  assert.deepEqual(membership(ctx,bottle),[false,false,true]);
  const data=receipt(ctx,items);
  assert.equal(data.total,7800);
  for(const output of [ctx.buildReceiptHTML(data,false),ctx.buildEposXML(data,false)]){
    for(const label of ["SODA_ROW","WINE_ROW"])assert.equal(output.split(label).length-1,1,label+" must appear exactly once");
    assert.ok(output.includes("7,800"));
  }
  assert.equal(JSON.stringify(items),before,"history is never rewritten for display");
});

test("legacy rows without a category remain visible once after their master disappears",()=>{
  const ctx=runtime();ctx.S.menus={};
  const cases=[
    [{id:"champagne_11_22",label:"PREVIOUS_BOTTLE",price:4000},"cast"],
    [{id:"untyped",label:"LEGACY_CAST",price:1000,castId:"1"},"cast"],
    [{id:"other",label:"BACK_TARGET",price:1000,backTargetCastIds:["1"]},"cast"],
    [{id:"old",label:"BACK_TYPE",price:1000,backType:"keepBottle"},"cast"],
    [{id:"deleted_77",label:"UNKNOWN_ROW",price:1000},"guest"],
    [{id:7,label:"NUMERIC_ID",price:1000},"guest"],
    [{label:"NO_ID",price:1000},"guest"]
  ];
  for(const [item,section] of cases){
    assert.equal(membership(ctx,item).filter(Boolean).length,1,item.label);
    assert.equal(ctx.orderItemSection(item),section);
  }
  const data=receipt(ctx,cases.map(([item])=>({...item,qty:1})));
  for(const output of [ctx.buildReceiptHTML(data,false),ctx.buildEposXML(data,false)]){
    for(const [item] of cases)assert.equal(output.split(item.label).length-1,1);
  }
});

test("saved categories and charge flags take precedence over colliding menu IDs",()=>{
  const ctx=runtime();
  const cases=[
    [{id:"soda_1",label:"CAST_ROW",category:"castDrink",price:0},[false,false,true]],
    [{id:"bottle_1",label:"GUEST_ROW",orderSection:"guest",price:500},[false,true,false]],
    [{id:"cd_1",label:"FREE_ROW",isFreeDrink:true,price:0},[false,true,false]],
    [{id:"gcu_1",label:"CUSTOM_GUEST",castId:1,price:0},[false,true,false]],
    [{id:"backtype_1",label:"シングルチャージ付きドリンク",backType:"castDrink",price:500},[false,false,true]],
    [{id:"charge_1",label:"SC_ROW",chargeRole:"single",price:0},[true,false,false]],
    [{id:"charge_2",label:"DOHAN_ROW",category:"dohan",castId:1,price:3000},[true,false,false]],
    [{id:"charge_3",label:"EXT_ROW",category:"champagneWine",isExtension:true,price:3000},[true,false,false]],
    [{id:"soda_2",label:"シングルチャージ風ドリンク",orderSection:"guest",price:500},[false,true,false]],
    [{id:"discount",label:"DISCOUNT_ROW",isDiscount:true,isSet:true,price:-500},[false,false,false]]
  ];
  for(const [item,expected] of cases)assert.deepEqual(membership(ctx,item),expected,item.label);
  assert.deepEqual(membership(ctx,null),[false,false,false]);
});

test("new guest orders retain their display section without changing GMS category",()=>{
  const ctx=runtime();
  ctx.odq("soda");
  assert.equal(ctx.qm.itemData.orderSection,"guest");
  assert.equal(ctx.qm.category,"","existing export category remains unchanged");
  ctx.confQty();
  const stored=ctx.S.sessions.t1.items[0];
  assert.equal(stored.orderSection,"guest");
  assert.equal(stored.category,"");
  ctx.S.menus.drinks=[];
  assert.deepEqual(membership(ctx,stored),[false,true,false]);
});

test("zero cast drink follows quantity confirmation and retains back attribution with zero sales",()=>{
  const ctx=runtime();
  ctx.addCD(1,"cd2");
  assert.equal(ctx.modalOpens,1);
  assert.equal(ctx.qm.price,0);
  ctx.qv=3;ctx.confQty();
  const item=ctx.S.sessions.t1.items[0];
  assert.equal(item.price,0);
  assert.equal(item.qty,3);
  assert.equal(item.category,"castDrink");
  assert.equal(item.castId,1);
  assert.deepEqual(plain(item.backTargetCastIds),["1"]);
  assert.equal(item.backType,"castDrink");
  assert.equal(item.backAllocation,"orderedCast");
  assert.equal(ctx.ct({items:[item]}).total,0);
  const exported=ctx.gmsTransactionItems([item])[0];
  assert.equal(exported.price,0);assert.equal(exported.quantity,3);
  assert.deepEqual(plain(exported.backTargetCastIds),["1"]);
  assert.equal(exported.backType,"castDrink");
  const castSales=ctx.gmsCastSales([{items:[item],subtotal:0}]);
  assert.equal(castSales[0].drinkSales,0);
  const drinkRows=ctx._castDrinkRowsFromHist([{items:[item]}]);
  assert.ok(drinkRows.length>0,"zero drink remains countable in drink history");
  const data=receipt(ctx,[item]);
  for(const output of [ctx.buildReceiptHTML(data,false),ctx.buildEposXML(data,false)]){
    assert.ok(output.includes("キャストDrink"));
    assert.ok(output.includes("¥0"));
  }
});

test("zero custom cast drink is also selectable and invalid prices never become free drinks",()=>{
  const ctx=runtime();
  ctx.addCDC();assert.equal(ctx.modalOpens,1);assert.equal(ctx.qm.price,0);
  ctx.qm=null;ctx.modalOpens=0;
  for(const price of ["",null,undefined,-1,NaN,Infinity,"abc",false]){
    ctx.openCastDrinkQty(1,price,"invalid");
    assert.equal(ctx.qm,null,String(price));
    assert.equal(ctx.modalOpens,0,String(price));
  }
  ctx.openCastDrinkQty("missing",0,"none");assert.equal(ctx.modalOpens,0);
});
