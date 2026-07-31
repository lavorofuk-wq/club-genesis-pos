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

const checkout=app.slice(app.indexOf("async function checkout"),app.indexOf("async function tableChange"));
assert.match(checkout,/expectedRecords/);
assert.ok(checkout.indexOf("queueSessionUpdate")<checkout.indexOf("eposPrint"));

console.log("pos-sync integration guards passed");
