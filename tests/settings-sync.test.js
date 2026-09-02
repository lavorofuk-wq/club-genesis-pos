const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const app=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const rulesDoc=fs.readFileSync(path.join(__dirname,"..","POS_RTDATABASE_WRITE_GATE_RULES.md"),"utf8");
const versionSource=app.slice(app.indexOf("function _verNum"),app.indexOf("function applyFixedShimeiPrices"));
const stateSource=app.slice(app.indexOf("const LIGHTWEIGHT_SETTING_PATHS"),app.indexOf("const sessionSaveQueues"));
const stableSource=app.slice(app.indexOf("function canonicalJsonValue"),app.indexOf("function shouldGuardWholeValue"));
const queueSource=app.slice(app.indexOf("function settingConflictError"),app.indexOf("function castIdQueryValues"));

const remote={
  menus:{sets:[{id:"s1",price:1000}]},
  tables:[{id:"t1",label:"T1",vip:false}],
  _settingsRevisions:{menus:0,tables:0},
  _settingsWriteMeta:{}
};
let activeWrites=0;
let maxActiveWrites=0;
let writeCount=0;

function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function getValue(root,key){
  return String(key||"").split("/").filter(Boolean).reduce((value,part)=>value==null?undefined:value[part],root);
}
function setValue(root,key,value){
  const parts=String(key||"").split("/").filter(Boolean);
  let target=root;
  parts.slice(0,-1).forEach(part=>{if(!target[part]||typeof target[part]!=="object")target[part]={};target=target[part];});
  target[parts[parts.length-1]]=clone(value);
}

const context={
  window:{_remoteValueHashes:{}},
  document:{getElementById:()=>null},
  FB_ROOT:"pos-dev",
  APP_VERSION:"6.140.3",
  sbs:()=>{},
  requireFirebaseReady:()=>true,
  stableJson:value=>JSON.stringify(value===undefined?null:value),
  cloneData:clone,
  updateRemoteHash:(key,value)=>{context.window._remoteValueHashes[key]=JSON.stringify(value===undefined?null:value);},
  _verNum:()=>613700,
  readRemoteRelative:async key=>clone(getValue(remote,key)),
  guardedRootUpdate:async values=>{
    activeWrites++;
    maxActiveWrites=Math.max(maxActiveWrites,activeWrites);
    await new Promise(resolve=>setTimeout(resolve,5));
    Object.entries(values).forEach(([key,value])=>setValue(remote,key,value));
    writeCount++;
    activeWrites--;
  },
  setTimeout,
  clearTimeout,
  Promise
};
context.window._db={ref:key=>({once:async()=>({val:()=>clone(getValue(remote,key.replace(/^pos-dev\/?/,"")))})})};
context.window._remoteValueHashes.menus=JSON.stringify(remote.menus);
context.window._remoteValueHashes.tables=JSON.stringify(remote.tables);

vm.createContext(context);
vm.runInContext(stateSource,context);
vm.runInContext(queueSource,context);

const versionContext={parseInt};
vm.createContext(versionContext);
vm.runInContext(versionSource,versionContext);
assert.strictEqual(versionContext._verNum("6.133"),613300);
assert.strictEqual(versionContext._verNum("6.136"),613600);
assert.strictEqual(versionContext._verNum("6.137"),613700);
assert.strictEqual(versionContext._verNum("6.108"),610800);
assert.strictEqual(versionContext._verNum("6.109"),610900);
assert.match(rulesDoc,/versionNum'\)\.val\(\) >= 613300/);
assert.match(rulesDoc,/"_banaiOperations"/);
assert.match(rulesDoc,/"\.validate"[\s\S]*sessionRev/);
assert.match(rulesDoc,/banaiAtomicValidationVersion/);
assert.match(rulesDoc,/_nodeWriteVersion'\)\.val\(\) >= 610800/);
assert.match(rulesDoc,/_nodeWriteVersion'\)\.val\(\) >= 610900/);
assert.doesNotMatch(rulesDoc,/>= 6133(?:\D|$)/);
assert.doesNotMatch(rulesDoc,/>= 6108(?:\D|$)/);
assert.doesNotMatch(rulesDoc,/>= 6109(?:\D|$)/);

const stableContext={};
vm.createContext(stableContext);
vm.runInContext(stableSource,stableContext);
assert.strictEqual(
  stableContext.stableJson({b:2,a:{d:4,c:3}}),
  stableContext.stableJson({a:{c:3,d:4},b:2}),
  "setting comparisons must ignore Firebase object key order"
);

(async()=>{
  const first={sets:[{id:"s1",price:2000}]};
  const latest={sets:[{id:"s1",price:3000}]};
  await Promise.all([context.queueSettingSave("menus",first),context.queueSettingSave("menus",latest)]);
  assert.deepStrictEqual(remote.menus,latest);
  assert.strictEqual(maxActiveWrites,1,"settings writes must be serialized");
  assert.ok(writeCount<=2,"intermediate settings writes should be coalesced while a save is running");
  assert.strictEqual(vm.runInContext("settingSaveStates.menus.status",context),"saved");

  remote.tables=[{id:"t1",label:"OTHER DEVICE",vip:false}];
  const conflicts=await Promise.allSettled([
    context.queueSettingSave("tables",[{id:"t1",label:"LOCAL 1",vip:false}]),
    context.queueSettingSave("tables",[{id:"t1",label:"LOCAL 2",vip:false}])
  ]);
  assert.ok(conflicts.every(result=>result.status==="rejected"&&result.reason?._txConflict===true));
  assert.strictEqual(remote.tables[0].label,"OTHER DEVICE","a conflicting remote setting must not be overwritten");
  assert.strictEqual(vm.runInContext("settingSaveStates.tables.status",context),"error");

  const tableState=vm.runInContext("settingSaveStates.tables",context);
  assert.strictEqual(tableState.waiters.length,0,"a failed settings write must reject every queued waiter");

  assert.match(app,/scheduleFirebaseRender\(settingsChanged\)/);
  assert.match(app,/if\(vw==="settings"\)[\s\S]*if\(!settingsChanged\)return/);
  assert.match(app,/queueSettingSave\(path,val\)/);
  assert.match(queueSource,/async function waitForSettingSaveQueue\(path\)[\s\S]*while\(state&&\(state\.running\|\|state\.requestedVersion>state\.savedVersion\)\)/);
  assert.match(app,/guardedRootUpdateIfActive[\s\S]*_settingsRevisions\/"\+key/);
  assert.doesNotMatch(queueSource,/guardedRootTransaction/);
  console.log("settings sync guards passed");
})().catch(error=>{console.error(error);process.exit(1);});
