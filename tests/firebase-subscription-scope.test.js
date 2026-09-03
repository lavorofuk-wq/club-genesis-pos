const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const app=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const index=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const sw=fs.readFileSync(path.join(__dirname,"..","sw.js"),"utf8");

assert.match(app,/const APP_VERSION="6\.140\.5"/);
assert.match(index,/Ver6\.140\.5/);
assert.match(index,/app\.js\?v=6\.140\.5/);
assert.match(sw,/genesis-pos-v6\.140\.5-auth/);

assert.doesNotMatch(app,/db\.ref\(BACKUP_ROOT\)\.on\(/,"backup data must not be subscribed at startup");
assert.doesNotMatch(app,/db\.ref\(FB_ROOT\)\.on\(/,"the complete POS root must not be subscribed");
assert.match(app,/async function guardedRootTransaction[\s\S]*const primedSnapshot=await ref\.once\("value"\)[\s\S]*transactionAttempt\+\+===0\?primedRoot:current[\s\S]*ref\.transaction\(/,"the first root transaction attempt must use the complete server snapshot");
assert.match(app,/const POS_CORE_SYNC_PATHS=\[[^\]]*"sessions"[^\]]*"history"[^\]]*"activeBizDay"[^\]]*\]/);
assert.doesNotMatch(app,/const POS_CORE_SYNC_PATHS=\[[^\]]*"bizDays"/);
assert.doesNotMatch(app,/const POS_CORE_SYNC_PATHS=\[[^\]]*"gmsExportMeta"/);
assert.match(app,/db\.ref\(FB_ROOT\+"\/"\+path\)\.on\("value"/);

assert.match(app,/window\._db\.ref\(FB_ROOT\+"\/bizDays"\)\.once\("value"\)/);
assert.match(app,/window\._db\.ref\(FB_ROOT\+"\/gmsExportMeta"\)\.once\("value"\)/);
assert.match(app,/window\._db\.ref\(FB_ROOT\+"\/gmsTargetCorrections"\)\.once\("value"\)/);
assert.match(app,/window\._db\.ref\(BACKUP_ROOT\+"\/bizDays"\)\.once\("value"\)/);
assert.match(app,/db\.ref\(FB_ROOT\+"\/bizDays\/"\+nextId\)/,"the active business day must remain realtime");
assert.match(app,/const BIZ_DAYS_VIEWS=new Set\(\["history","analysis","histlog","shifts","backupDetail"\]\)/);
assert.match(app,/const BACKUP_VIEWS=new Set\(\["admin","backupDetail"\]\)/);

assert.match(app,/async function loadBizDayForReEdit[\s\S]*\["bizDays\/"\+dayId\]:day/);
assert.match(app,/async function startBizDay[\s\S]*\["bizDays\/"\+id\]:day/);
assert.match(app,/async function startBizDay\(dateStr\)[\s\S]*\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$/);
assert.match(app,/async function startBizDay[\s\S]*readRemoteRelative\("bizDays\/"\+id\)[\s\S]*記録済み/);
assert.match(app,/async function updateBizDateWarn[\s\S]*readRemoteRelative\('bizDays\/'\+val\)/);
assert.match(app,/async function endBizDay[\s\S]*\["bizDays\/"\+id\]:day/);
assert.doesNotMatch(app,/bizDays:S\.bizDays/,"business operations must not rewrite every historical day");
assert.doesNotMatch(app,/save\("bizDays",S\.bizDays\)/,"historical edits must not rewrite the complete business-day collection");
assert.match(app,/async function guardedReplaceClosedBizDay[\s\S]*\[FB_ROOT\+"\/bizDays\/"\+id\][\s\S]*stableJson\(remote\)!==stableJson\(expectedDay\)/,"closed-day edits must compare and update only their target day");
assert.match(app,/function rDayDetail[\s\S]*const hist=\[\.\.\.\(day\.history\|\|\[\]\)\]\.sort/ ,"history rendering must not reorder the stored history array in place");
assert.match(app,/async function saveGmsTargetCorrection[\s\S]*\/bizDays\/"\+id\+"\/history"\)[\s\S]*orderByChild\("id"\)\.equalTo\(recordId\)\.limitToFirst\(2\)[\s\S]*\/gmsTargetCorrections\/"\+id\+"\/"\+key[\s\S]*correctionRef\.transaction\(/,"GMS target corrections must find one record by transaction id and transact only their correction node");
assert.doesNotMatch(app,/async function saveGmsTargetEdit[\s\S]*guardedRootTransaction/ ,"GMS target corrections must not run a POS-root transaction");
assert.match(app,/async function saveGmsTargetEdit[\s\S]*saveGmsTargetCorrection\(dayId,cloneData\(record\),index/ ,"GMS target corrections must use the lightweight correction save");
assert.match(app,/function closedBizDaySaveErrorMessage[\s\S]*Firebaseの書込権限[\s\S]*Firebaseへ保存できませんでした/,"historical edit errors must identify permission and connection failures");

const syncSource=app.slice(app.indexOf("const POS_CORE_SYNC_PATHS"),app.indexOf("// Firebase config"));
const subscribed=[];
const reads=[];
const snapshots={
  "pos-dev/bizDays":{d1:{id:"d1",date:"2026-09-01"}},
  "pos-dev/gmsExportMeta":{d1:{submissionId:"g1"}},
  "pos-dev/gmsTargetCorrections":{d1:{tx_1:{_rev:1}}},
  "backup-dev/bizDays":{d1:{date:"2026-09-01",history:[]}}
};
const mockDb={ref:refPath=>({
  on:(event,callback)=>subscribed.push({refPath,event,callback}),
  once:async event=>{reads.push({refPath,event});return{val:()=>snapshots[refPath]||null};}
})};
const context={
  window:{_db:mockDb},
  S:{bizDays:{},gmsExportMeta:{},gmsTargetCorrections:{},backups:{}},
  FB_ROOT:"pos-dev",
  BACKUP_ROOT:"backup-dev",
  vw:"home",
  updateRemoteHash:()=>{},
  cloneData:value=>value==null?value:JSON.parse(JSON.stringify(value)),
  render:()=>{},
  sbs:()=>{},
  Date,
  Promise,
  Set
};
vm.createContext(context);
vm.runInContext(syncSource,context);

(async()=>{
  context.mockDb=mockDb;
  vm.runInContext("subscribePosCoreData(mockDb)",context);
  assert.ok(subscribed.length>5);
  assert.ok(subscribed.every(entry=>entry.event==="value"&&entry.refPath.startsWith("pos-dev/")));
  assert.ok(!subscribed.some(entry=>entry.refPath==="pos-dev"||entry.refPath.includes("/bizDays")||entry.refPath.includes("gmsExportMeta")));

  await vm.runInContext("ensureBizDaysLoaded()",context);
  await vm.runInContext("ensureBackupsLoaded()",context);
  assert.deepStrictEqual(reads.map(entry=>entry.refPath).sort(),[
    "backup-dev/bizDays",
    "pos-dev/bizDays",
    "pos-dev/gmsExportMeta",
    "pos-dev/gmsTargetCorrections"
  ]);
  assert.strictEqual(context.S.bizDays.d1.id,"d1");
  assert.strictEqual(context.S.gmsExportMeta.d1.submissionId,"g1");
  assert.strictEqual(context.S.gmsTargetCorrections.d1.tx_1._rev,1);
  assert.strictEqual(context.S.backups.bizDays.d1.date,"2026-09-01");

  console.log("firebase subscription scope guards passed");
})().catch(error=>{console.error(error);process.exit(1);});
