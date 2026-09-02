const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const app=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const helperSource=app.slice(app.indexOf("async function guardedSessionNodeUpdate"),app.indexOf("async function guardedSessionUpdate"));

function clone(value){return value==null?null:JSON.parse(JSON.stringify(value));}
function getPathValue(obj,pathValue){
  return String(pathValue).split("/").filter(Boolean).reduce((value,key)=>value==null?undefined:value[key],obj);
}
function setPathValue(obj,pathValue,value){
  const parts=String(pathValue).split("/").filter(Boolean);
  let current=obj;
  parts.slice(0,-1).forEach(key=>{if(!current[key])current[key]={};current=current[key];});
  current[parts[parts.length-1]]=clone(value);
}
function applyRootUpdates(root,updates){
  Object.entries(updates).forEach(([updatePath,value])=>{
    const relative=updatePath.replace(/^pos-dev\//,"");
    if(relative!=="_writeGate")setPathValue(root,relative,value);
  });
  return root;
}

function createContext(updateImpl){
  const remote={
    "sessions/t1":{sessionId:"session-1",startTime:10,_rev:4,items:[]},
    "assignments/a1":{id:"a1",castId:"c1",tableId:"t1",type:"free",_rev:7}
  };
  const writes=[];
  const synced={};
  const context={
    APP_VERSION:"6.138.1",
    BANAI_ATOMIC_VALIDATION_VERSION:613600,
    FB_ROOT:"pos-dev",
    requireFirebaseReady:()=>true,
    ensureSessionId:session=>session,
    versionedRecordPathInfo:updatePath=>{
      const relative=String(updatePath).replace(/^pos-dev\//,"");
      const parts=relative.split("/");
      return parts[0]==="assignments"&&parts.length===2?{collection:parts[0],id:parts[1],relative}:null;
    },
    readRemoteRelative:async relative=>clone(remote[relative]),
    setPathValue,
    getPathValue,
    sameSession:(actual,expected)=>actual.sessionId===expected.sessionId&&actual._rev===expected._rev,
    syncRemoteSession:(tableId,session)=>{synced.session={tableId,session:clone(session)};},
    cloneData:clone,
    _verNum:()=>613700,
    prepareVersionedRecordUpdates:(root,updates)=>{
      const prepared={...updates};
      const assignmentPath="pos-dev/assignments/a1";
      if(prepared[assignmentPath])prepared[assignmentPath]={...clone(prepared[assignmentPath]),_rev:8,_nodeWriteVersion:613700,_nodeWriteNonce:"assignment-nonce"};
      return prepared;
    },
    window:{_db:{ref:refPath=>({update:async updates=>{writes.push({refPath,updates:clone(updates)});return updateImpl(updates);}})}},
    withWriteGate:updates=>({...updates,"pos-dev/_writeGate":{versionNum:613700,nonce:"gate-nonce"}}),
    isFirebasePermissionDenied:error=>error&&error.code==="PERMISSION_DENIED",
    applyRootUpdates,
    syncVersionedRecordsFromPrepared:prepared=>{synced.assignment=clone(prepared["pos-dev/assignments/a1"]);},
    markSessionGuard:()=>{}
  };
  vm.createContext(context);
  vm.runInContext(helperSource,context);
  return{context,writes,synced};
}

(async()=>{
  const{context,writes,synced}=createContext(async()=>{});
  const desiredSession={sessionId:"session-1",startTime:10,_rev:4,items:[{id:"b1",isBanaiShimei:true}]};
  const desiredAssignment={id:"a1",castId:"c1",tableId:"t1",type:"banai",_rev:7};
  await context.guardedSessionNodeUpdate("t1",desiredSession,{
    "pos-dev/sessions/t1":desiredSession,
    "pos-dev/assignments/a1":desiredAssignment
  },{expectedRecords:{"assignments/a1":desiredAssignment}});

  assert.strictEqual(writes.length,1,"the session and assignment must use one atomic multipath update");
  assert.strictEqual(writes[0].refPath,"/");
  assert.deepStrictEqual(Object.keys(writes[0].updates).sort(),[
    "pos-dev/_banaiOperations/t1",
    "pos-dev/_writeGate",
    "pos-dev/assignments/a1",
    "pos-dev/sessions/t1"
  ]);
  assert.strictEqual(writes[0].updates["pos-dev/sessions/t1"]._rev,5);
  assert.strictEqual(writes[0].updates["pos-dev/sessions/t1"]._nodeWriteVersion,613700);
  assert.strictEqual(writes[0].updates["pos-dev/assignments/a1"]._rev,8);
  assert.strictEqual(writes[0].updates["pos-dev/_banaiOperations/t1"].sessionRev,5);
  assert.strictEqual(writes[0].updates["pos-dev/_banaiOperations/t1"].assignmentId,"a1");
  assert.strictEqual(writes[0].updates["pos-dev/_banaiOperations/t1"].assignmentRev,8);
  assert.strictEqual(synced.session.session._rev,5);
  assert.strictEqual(synced.assignment.type,"banai");

  const denied=createContext(async()=>{throw Object.assign(new Error("denied"),{code:"PERMISSION_DENIED"});});
  await assert.rejects(
    denied.context.guardedSessionNodeUpdate("t1",desiredSession,{
      "pos-dev/sessions/t1":desiredSession,
      "pos-dev/assignments/a1":desiredAssignment
    },{}),
    error=>error.userMessage&&error.userMessage.includes("最新状態")
  );
  assert.strictEqual(denied.synced.session,undefined,"a rejected multipath update must not be applied locally as saved");

  const addBanaiSource=app.slice(app.indexOf("async function addBanai"),app.indexOf("function applyET"));
  assert.match(addBanaiSource,/const tableId=at/);
  assert.match(addBanaiSource,/markOptimisticPaths\(updates\)[\s\S]*applyLocalRootUpdates\(updates\)[\s\S]*closeM\(\)/);
  assert.match(addBanaiSource,/fastNodeUpdate:banaiAtomicValidationVersion>=BANAI_ATOMIC_VALIDATION_VERSION/);
  assert.match(addBanaiSource,/restoreLocalRootSnapshot\(localSnapshot\)/);
  assert.doesNotMatch(addBanaiSource,/guardedRootTransaction/);

  console.log("banai order lightweight sync passed");
})().catch(error=>{console.error(error);process.exit(1);});
