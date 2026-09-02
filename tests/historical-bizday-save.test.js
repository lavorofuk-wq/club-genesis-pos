const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const app=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const start=app.indexOf("function closedBizDayConflictMessage");
const end=app.indexOf("function gmsEscapeHtml",start);
assert.ok(start>=0&&end>start,"closed business-day save helpers must exist");

let remoteRoot={
  activeBizDay:null,
  bizDays:{
    "2026-09-01":{id:"2026-09-01",date:"2026-09-01",history:[{total:10000}]},
    "2026-09-02":{id:"2026-09-02",date:"2026-09-02",history:[{total:20000}]}
  }
};
const calls=[];
const canonical=value=>{
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==="object")return Object.keys(value).sort().reduce((out,key)=>(out[key]=canonical(value[key]),out),{});
  return value;
};
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const get=(root,relative)=>String(relative).split("/").filter(Boolean).reduce((value,key)=>value?.[key],root);
const set=(root,fullPath,value)=>{
  const parts=String(fullPath).replace(/^pos-dev\//,"").split("/").filter(Boolean);
  let cursor=root;
  parts.slice(0,-1).forEach(key=>{if(!cursor[key])cursor[key]={};cursor=cursor[key];});
  if(value==null)delete cursor[parts.at(-1)];else cursor[parts.at(-1)]=clone(value);
};
const context={
  FB_ROOT:"pos-dev",
  S:{activeBizDay:null,bizDays:clone(remoteRoot.bizDays)},
  lazyDataState:{bizDays:{status:"loaded",loadedAt:0}},
  cloneData:clone,
  stableJson:value=>JSON.stringify(canonical(value===undefined?null:value)),
  getPathValue:get,
  guardedCheckedUpdate:async(updates,checker)=>{
    calls.push(clone(updates));
    const working=clone(remoteRoot);
    const checked=checker(working);
    if(checked===false||checked?.ok===false)throw Object.assign(new Error("conflict"),{userMessage:checked?.message});
    Object.entries(updates).forEach(([key,value])=>set(working,key,value));
    remoteRoot=working;
    return clone(remoteRoot);
  },
  updateBizDayRemoteHashes:()=>{},
  isFirebasePermissionDenied:error=>String(error?.code||"").includes("PERMISSION_DENIED"),
  sbs:()=>{},
  withDataOperation:async(key,operation)=>operation(),
  closeM:()=>{},render:()=>{},rModal:()=>{},alert:()=>{},
  console,
  Date,
  Object,
  JSON,
  String
};
vm.createContext(context);
vm.runInContext(app.slice(start,end),context);

(async()=>{
  const expected=clone(remoteRoot.bizDays["2026-09-01"]);
  const next={...clone(expected),history:[{total:10000,items:[{category:"dohan",castId:"c1"}]}]};
  context.S.bizDays["2026-09-02"].history[0].total=99999;
  await vm.runInContext("guardedReplaceClosedBizDay",context)("2026-09-01",expected,next);

  assert.deepStrictEqual(Object.keys(calls[0]),["pos-dev/bizDays/2026-09-01"],"only the selected business day may be written");
  assert.deepStrictEqual(remoteRoot.bizDays["2026-09-02"],{id:"2026-09-02",date:"2026-09-02",history:[{total:20000}]},"other business days must remain untouched");
  assert.strictEqual(context.S.bizDays["2026-09-02"].history[0].total,20000,"an unrelated stale local day must not block the save and must be refreshed");
  assert.strictEqual(context.S.bizDays["2026-09-01"].history[0].items[0].castId,"c1");

  const staleExpected={...expected,history:[{total:9999}]};
  await assert.rejects(
    vm.runInContext("guardedReplaceClosedBizDay",context)("2026-09-01",staleExpected,next),
    error=>error.userMessage.includes("他端末で更新")
  );
  assert.strictEqual(calls.length,2);

  remoteRoot.activeBizDay="2026-09-01";
  await assert.rejects(
    vm.runInContext("guardedReplaceClosedBizDay",context)("2026-09-01",next,next),
    error=>error.userMessage.includes("営業中の日は変更できません")
  );

  console.log("historical business-day save guards passed");
})().catch(error=>{console.error(error);process.exit(1);});
