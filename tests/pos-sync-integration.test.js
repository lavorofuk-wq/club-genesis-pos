const assert=require("assert");
const fs=require("fs");
const path=require("path");

const app=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");

assert.doesNotMatch(app,/save\(["'](?:shifts|assignments)\//);
assert.doesNotMatch(app,/setCastStatus\s*\(/);

const clockOut=app.slice(app.indexOf("async function clockOut"),app.indexOf("function saveLocalBackup"));
assert.match(clockOut,/remoteActiveAssign/);
assert.match(clockOut,/expectedRecords/);

const startAssign=app.slice(app.indexOf("async function startAssignAt"),app.indexOf("async function changeAssignType"));
assert.match(startAssign,/remoteSession/);
assert.match(startAssign,/remoteShift/);
assert.match(startAssign,/remoteActiveAssign/);
assert.match(startAssign,/createRecords/);
assert.doesNotMatch(startAssign,/location\.reload\s*\(\s*\)/);

const assignmentOps=app.slice(app.indexOf("async function endAssign"),app.indexOf("// ===== 出勤画面"));
assert.doesNotMatch(assignmentOps,/location\.reload\s*\(\s*\)/);
assert.match(assignmentOps,/async function endAssign[\s\S]*nodeUpdate:\{expectedRecords\}/);
assert.match(assignmentOps,/async function moveToBreak[\s\S]*nodeUpdate:\{expectedRecords,readCollections:\["assignments"\]\}/);
assert.match(assignmentOps,/async function moveToWaiting[\s\S]*nodeUpdate:\{expectedRecords,readCollections:\["assignments"\]\}/);

assert.match(app,/function mergeRemoteVersionedCollection\(collection,remote\)/);
assert.match(app,/S\.shifts=mergeRemoteVersionedCollection\("shifts",d\.shifts\)/);
assert.match(app,/S\.assignments=mergeRemoteVersionedCollection\("assignments",d\.assignments\)/);
assert.match(app,/function shouldFallbackNodeUpdate\(error\)[\s\S]*message==="record changed"[\s\S]*message==="record create conflict"/);

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
