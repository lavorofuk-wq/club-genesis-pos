const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const app=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");

assert.doesNotMatch(app,/save\(["'](?:shifts|assignments)\//);
assert.doesNotMatch(app,/setCastStatus\s*\(/);

const clockOut=app.slice(app.indexOf("async function clockOut"),app.indexOf("function saveLocalBackup"));
assert.match(clockOut,/remoteActiveAssign/);
assert.match(clockOut,/expectedRecords/);
assert.match(clockOut,/guardedCheckedUpdateOptimistic/);
assert.match(clockOut,/readActiveAssignCasts:\[current\.castId\]/);

const shiftOps=app.slice(app.indexOf("async function clockIn"),app.indexOf("async function deleteShift"));
assert.match(app,/function readRemoteActiveShiftsForCast\(castId\)/);
assert.match(app,/window\._db\.ref\(FB_ROOT\+"\/shifts"\)\.orderByChild\("castId"\)\.equalTo\(value\)\.once\("value"\)/);
assert.match(shiftOps,/async function clockIn[\s\S]*createRecords:\["shifts\/"\+sid\][\s\S]*readActiveShiftCasts:\[castId\]/);
assert.match(shiftOps,/async function cancelClockOut[\s\S]*readActiveShiftCasts:\[current\.castId\]/);
assert.match(shiftOps,/async function saveShiftEdit[\s\S]*readActiveShiftCasts:\[current\.castId\][\s\S]*readActiveAssignCasts:\[current\.castId\]/);

const startAssign=app.slice(app.indexOf("async function startAssignAt"),app.indexOf("async function changeAssignType"));
assert.match(startAssign,/remoteSession/);
assert.match(startAssign,/remoteShift/);
assert.match(startAssign,/remoteActiveAssign/);
assert.match(startAssign,/createRecords/);
assert.match(startAssign,/readActiveAssignCasts:\[castId\]/);
assert.doesNotMatch(startAssign,/readCollections:\["assignments"\]/);
assert.doesNotMatch(startAssign,/location\.reload\s*\(\s*\)/);

const assignmentOps=app.slice(app.indexOf("async function endAssign"),app.indexOf("// ===== 出勤画面"));
assert.doesNotMatch(assignmentOps,/location\.reload\s*\(\s*\)/);
assert.match(assignmentOps,/async function endAssign[\s\S]*nodeUpdate:\{expectedRecords\}/);
assert.match(assignmentOps,/async function moveToBreak[\s\S]*nodeUpdate:\{expectedRecords,readActiveAssignCasts:\[castId\]\}/);
assert.match(assignmentOps,/async function moveToWaiting[\s\S]*nodeUpdate:\{expectedRecords,readActiveAssignCasts:\[castId\]\}/);
assert.doesNotMatch(assignmentOps,/readCollections:\["assignments"\]/);

assert.match(app,/function mergeRemoteVersionedCollection\(collection,remote\)/);
assert.match(app,/S\.shifts=mergeRemoteVersionedCollection\("shifts",d\.shifts\)/);
assert.match(app,/S\.assignments=mergeRemoteVersionedCollection\("assignments",d\.assignments\)/);
assert.match(app,/function shouldFallbackNodeUpdate\(error\)[\s\S]*message==="record changed"[\s\S]*message==="record create conflict"/);
assert.match(app,/function readRemoteActiveAssignmentsForCast\(castId\)/);
assert.match(app,/window\._db\.ref\(FB_ROOT\+"\/assignments"\)\.orderByChild\("castId"\)\.equalTo\(value\)\.once\("value"\)/);
assert.match(app,/window\._db\.ref\("\/"\)\.update\(withWriteGate\(prepared\)\)/);

const salesData=app.slice(app.indexOf("function _salesDataStatsFromHist"),app.indexOf("function _castDrinkRowsFromHist"));
assert.match(salesData,/honShimeiSalesItems:\[\],banaiExtensionSalesItems:\[\][\s\S]*champagneWineItems:\[\],keepBottleItems:\[\],roomChargeItems:\[\]/);
assert.match(salesData,/liquorCategory=item=>/);
assert.match(salesData,/isRoomChargeItem=item=>/);
assert.match(salesData,/salesItemAmountLabel=item=>/);
assert.match(salesData,/targetNameSuffix=names=>/);
assert.match(salesData,/anaLiquorLabel\(item\)\+"\ "\+salesItemAmountLabel\(item\)\+targetNameSuffix\(targetNames\)/);
assert.match(salesData,/row\.roomChargeItems\.push\(anaLiquorLabel\(item\)\+"\ "\+salesItemAmountLabel\(item\)\+targetNameSuffix\(targetNames\)\)/);
assert.doesNotMatch(salesData,/new Set\(r\.champagneWineItems/);
assert.doesNotMatch(salesData,/new Set\(r\.keepBottleItems/);
assert.doesNotMatch(salesData,/new Set\(r\.roomChargeItems/);
assert.match(salesData,/const share=Math\.floor\(\(\(phase\.total\|\|0\)\+\(phase\.backTotal\|\|0\)\)\/Math\.max\(1,phase\.ids\.length\)\)/);
assert.match(salesData,/rows\[0\]\.push\("\u30b7\u30e3\u30f3\u30d1\u30f3\u30fb\u30ef\u30a4\u30f3","\u30ad\u30fc\u30d7\u30dc\u30c8\u30eb","\u5ba4\u6599"\)/);
assert.match(salesData,/stats\.forEach\(\(r,idx\)=>rows\[idx\+1\]\.push\([\s\S]*\(r\.roomChargeItems\|\|\[\]\)\.join\(" \/ "\)\)\)/);
assert.match(salesData,/function _salesDataColumnWidths\(rows\)/);
assert.match(salesData,/widths\[6\]=_xlsxAutoColWidth\(rows,6,24\)/);
assert.match(salesData,/widths\[7\]=_xlsxAutoColWidth\(rows,7,24\)/);
assert.match(salesData,/widths\[8\]=_xlsxAutoColWidth\(rows,8,24\)/);
assert.match(salesData,/widths\[1\]=_xlsxAutoColWidth\(rows,1,16\)/);
assert.match(salesData,/widths\[2\]=_xlsxAutoColWidth\(rows,2,16\)/);
assert.match(salesData,/if\(values\.length>1\)labels\.push\("合計 \\u00a5"\+fmt\(Math\.round\(Number\(total\)\|\|0\)\)\)/);
assert.match(app,/_downloadXLSX\(rows,"sales_data_"\+date\+"\.xlsx","Sales",\{columnWidths:_salesDataColumnWidths\(rows\)\}\)/);

const salesRowsSource=app.slice(app.indexOf("function _salesDataStatsFromHist"),app.indexOf("function _salesDataColumnWidths"));
const castNames={a:"A",b:"B",c:"C",d:"D"};
const salesStatsContext={
  gmsItemCategory:item=>item.category||"",
  fmt:value=>String(value),
  anaLiquorLabel:item=>{
    const qty=Math.max(1,Number(item.qty||item.quantity)||1);
    return String(item.label||"")+(qty>1?" x"+qty:"");
  },
  itemCastName:item=>item.castName||"",
  gmsCastName:id=>castNames[id]||"",
  banaiExtensionSalesPhases:items=>items.filter(item=>item.mockPhase).map(item=>item.mockPhase)
};
vm.createContext(salesStatsContext);
vm.runInContext(salesRowsSource,salesStatsContext);
const salesHist=[
  {subtotal:100000,items:[
    {category:"vipRoom",isRoomCharge:true,label:"VIP室料",price:30000},
    {isHonShimei:true,castId:"a",castName:"A"},
    {isHonShimei:true,castId:"b",castName:"B"},
    {category:"karaokeRoom",isRoomCharge:true,label:"カラオケ室料",price:1000,qty:3}
  ]},
  {subtotal:20000,items:[
    {isHonShimei:true,castId:"a",castName:"A"}
  ]},
  {items:[
    {category:"vipRoom",isRoomCharge:true,label:"延長前室料",price:30000},
    {isBanaiExtension:true,banaiExtCastIds:["c","d"],label:"延長30分",price:4000,mockPhase:{ids:["c","d"],total:30000,backTotal:0}},
    {category:"vipRoom",isRoomCharge:true,label:"VIP室料延長 30分",price:15000}
  ]},
  {items:[
    {isBanaiExtension:true,banaiExtCastIds:["c","d"],label:"延長30分",price:4000,mockPhase:{ids:["c","d"],total:10000,backTotal:0}}
  ]}
];
const roomStats=JSON.parse(JSON.stringify(salesStatsContext._salesDataStatsFromHist(salesHist)));
assert.deepStrictEqual(roomStats.find(row=>row.castId==="a").roomChargeItems,["VIP室料 \u00a530000(A\u30fbB)","カラオケ室料 x3 \u00a53000(A\u30fbB)"]);
assert.deepStrictEqual(roomStats.find(row=>row.castId==="b").roomChargeItems,["VIP室料 \u00a530000(A\u30fbB)","カラオケ室料 x3 \u00a53000(A\u30fbB)"]);
assert.deepStrictEqual(roomStats.find(row=>row.castId==="c").roomChargeItems,["VIP室料延長 30分 \u00a515000(C\u30fbD)"]);
assert.deepStrictEqual(roomStats.find(row=>row.castId==="d").roomChargeItems,["VIP室料延長 30分 \u00a515000(C\u30fbD)"]);
assert.ok(roomStats.every(row=>!row.roomChargeItems.some(label=>label.includes("延長前室料"))));
assert.deepStrictEqual(roomStats.find(row=>row.castId==="a").honShimeiSalesItems,[50000,20000]);
assert.deepStrictEqual(roomStats.find(row=>row.castId==="b").honShimeiSalesItems,[50000]);
assert.deepStrictEqual(roomStats.find(row=>row.castId==="c").banaiExtensionSalesItems,[15000,5000]);
assert.deepStrictEqual(roomStats.find(row=>row.castId==="d").banaiExtensionSalesItems,[15000,5000]);
const salesRows=JSON.parse(JSON.stringify(salesStatsContext._salesDataRowsFromHist(salesHist)));
assert.strictEqual(salesRows.find(row=>row[0]==="A")[1],"\u00a550000 / \u00a520000 / 合計 \u00a570000");
assert.strictEqual(salesRows.find(row=>row[0]==="B")[1],"\u00a550000");
assert.strictEqual(salesRows.find(row=>row[0]==="C")[2],"\u00a515000 / \u00a55000 / 合計 \u00a520000");
assert.strictEqual(salesRows.find(row=>row[0]==="D")[2],"\u00a515000 / \u00a55000 / 合計 \u00a520000");

const castDrinkOrder=app.slice(app.indexOf("function updateQtyDisplay"),app.indexOf("function addCustom"));
assert.match(castDrinkOrder,/function openCastDrinkQty\(cid,price,drinkLabel\)/);
assert.match(castDrinkOrder,/qtyLabel:"杯数を選択",unitLabel:"杯",confirmLabel:"オーダーする"/);
assert.match(castDrinkOrder,/s\.items=\[\.\.\.s\.items,\{[^}]*\.\.\.\(qm\.itemData\|\|\{\}\)\}\]/);
assert.match(castDrinkOrder,/function addCD\(cid,did\)[\s\S]*openCastDrinkQty\(cid,d\.price,d\.label\)/);
assert.match(app,/function addCDC\(\)[\s\S]*openCastDrinkQty\(cdc,p,"その他 "\+fmt\(p\)\+"円"\)/);

const drinkRowsSource=app.slice(app.indexOf("function _castDrinkRowsFromHist"),app.indexOf("function exportDrinkDataXLSX"));
const drinkRowsContext={itemCastName:()=>""};
vm.createContext(drinkRowsContext);
vm.runInContext(drinkRowsSource,drinkRowsContext);
const drinkRows=JSON.parse(JSON.stringify(drinkRowsContext._castDrinkRowsFromHist([{items:[
  {id:"cd_a1",category:"castDrink",castId:"a",castName:"A",price:2000,qty:3},
  {id:"cd_a2",category:"castDrink",castId:"a",castName:"A",price:3000,qty:2},
  {id:"cd_a3",category:"castDrink",castId:"a",castName:"A",price:2500,qty:4},
  {id:"cd_b1",category:"castDrink",castId:"b",castName:"B",price:2000}
]}])));
assert.deepStrictEqual(drinkRows[1],["A","3杯","2杯","2500円(4杯)","9杯"]);
assert.deepStrictEqual(drinkRows[2],["B","1杯","0杯","0杯","1杯"]);
assert.deepStrictEqual(drinkRows[3],["全キャスト合計","4杯","2杯","2500円(4杯)","10杯"]);

const checkout=app.slice(app.indexOf("async function checkout"),app.indexOf("async function tableChange"));
assert.match(checkout,/expectedRecords/);
assert.ok(checkout.indexOf("queueSessionUpdate")<checkout.indexOf("eposPrint"));

const checkin=app.slice(app.indexOf("async function startSession"),app.indexOf("function addExt"));
assert.match(checkin,/checkinBusy/);
assert.match(checkin,/await queueSessionSave\(tableId,desired,\{expectCreate:true\}\)/);
assert.doesNotMatch(checkin,/S\.sessions\[at\]\s*=/);
assert.ok(checkin.indexOf("await queueSessionSave")<checkin.indexOf("openFloorDetail"));
assert.match(app,/function cancelCheckin\(\)\{if\(checkinBusy\)return;/);

console.log("pos-sync integration guards passed");
