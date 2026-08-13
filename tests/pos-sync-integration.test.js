const assert=require("assert");
const fs=require("fs");
const path=require("path");

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
assert.match(salesData,/champagneWineItems:\[\],keepBottleItems:\[\]/);
assert.match(salesData,/liquorCategory=item=>/);
assert.match(salesData,/liquorAmountLabel=item=>/);
assert.match(salesData,/targetNameSuffix=names=>/);
assert.match(salesData,/anaLiquorLabel\(item\)\+"\ "\+liquorAmountLabel\(item\)\+targetNameSuffix\(targetNames\)/);
assert.match(salesData,/const share=Math\.floor\(\(\(phase\.total\|\|0\)\+\(phase\.backTotal\|\|0\)\)\/Math\.max\(1,phase\.ids\.length\)\)/);
assert.match(salesData,/rows\[0\]\.push\("\u30b7\u30e3\u30f3\u30d1\u30f3\u30fb\u30ef\u30a4\u30f3","\u30ad\u30fc\u30d7\u30dc\u30c8\u30eb"\)/);
assert.match(salesData,/stats\.forEach\(\(r,idx\)=>rows\[idx\+1\]\.push\(\(r\.champagneWineItems\|\|\[\]\)\.join\(" \/ "\),\(r\.keepBottleItems\|\|\[\]\)\.join\(" \/ "\)\)\)/);

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
