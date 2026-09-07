const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const app=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");

test("business-day transitions use one narrow atomic multipath update",async()=>{
  const start=app.indexOf("function bizDayOperation");
  const end=app.indexOf("function sessionGuardStart",start);
  assert.ok(start>=0&&end>start);
  const writes=[];
  const context={
    BIZ_DAY_ATOMIC_VALIDATION_VERSION:614100,
    bizDayAtomicValidationVersion:614100,
    FB_ROOT:"pos-dev",
    SCOPED_ATOMIC_VALIDATION_VERSION:614400,
    S:{bizDays:{}},
    requireScopedAtomic:()=>{},
    readScopedPaths:async()=>({activeBizDay:writes.length?'2026-09-07':null}),
    getPathValue:()=>null,
    stableJson:value=>JSON.stringify(value||null),
    sameFirebaseValue:(a,b)=>JSON.stringify(a||null)===JSON.stringify(b||null),
    cloneData:value=>value==null?null:JSON.parse(JSON.stringify(value)),
    requireFirebaseReady:()=>true,
    guardedUpdate:async updates=>{writes.push(updates);},
    Date,Math,String,Object,Error
  };
  vm.createContext(context);
  vm.runInContext(app.slice(start,end),context);

  const update=context.guardedAtomicBizDayUpdate;
  assert.equal(await update("start","2026-09-07",null,"2026-09-07",{
    "bizDays/2026-09-07":{id:"2026-09-07"},activeBizDay:"2026-09-07",history:null,sessions:null
  }),true);
  assert.deepEqual(Object.keys(writes[0]).sort(),[
    "pos-dev/_bizDayOperation","pos-dev/_bizDayRevisions/2026-09-07","pos-dev/activeBizDay","pos-dev/bizDays/2026-09-07","pos-dev/history","pos-dev/sessions"
  ]);
  assert.equal(writes[0]["pos-dev/_bizDayOperation"].type,"start");
  assert.equal(writes[0]["pos-dev/_bizDayOperation"].expectedActiveBizDay,null);

  assert.equal(await update("end","2026-09-07","2026-09-07",null,{
    "bizDays/2026-09-07":{id:"2026-09-07",endedAt:123},activeBizDay:null,history:null,sessions:null
  },{"backup-dev/bizDays/2026-09-07":{date:"2026-09-07",endedAt:123}},{backupKey:"2026-09-07"}),true);
  assert.equal(writes[1]["pos-dev/_bizDayOperation"].type,"end");
  assert.equal(writes[1]["pos-dev/_bizDayOperation"].backupKey,"2026-09-07");
  assert.deepEqual(writes[1]["backup-dev/bizDays/2026-09-07"],{date:"2026-09-07",endedAt:123});

  context.bizDayAtomicValidationVersion=0;
  await assert.rejects(update("start","2026-09-08",null,"2026-09-08",{}));
  assert.equal(writes.length,2);
});

test("start, reopen and end use atomic transitions without any legacy fallback",()=>{
  for(const [name,next] of [["loadBizDayForReEdit","startBizDay"],["startBizDay","endBizDay"],["endBizDay","// ===== FLOOR ====="]]){
    const source=app.slice(app.indexOf("async function "+name),app.indexOf(next,name==="loadBizDayForReEdit"?app.indexOf("async function "+name)+1:app.indexOf("async function "+name)+1));
    assert.match(source,/guardedAtomicBizDayUpdate\(/,name+" must use the atomic path");
    assert.doesNotMatch(source,/guardedRootUpdateIfActive/,name+" must not retry using a root transaction");
    assert.ok(source.indexOf("guardedAtomicBizDayUpdate(")<source.indexOf("S.bizDays="),name+" must not commit local business state before Firebase accepts the write");
  }
  const endSource=app.slice(app.indexOf("async function endBizDay"),app.indexOf("// ===== FLOOR ====="));
  assert.match(endSource,/\{\[BACKUP_ROOT\+"\/bizDays\/"\+backupKey\]:daySnap\}/,"end must include its backup in the atomic update");
});

test("rules require a revision-bound business-day operation once capability is enabled",()=>{
  const rules=JSON.parse(fs.readFileSync(path.join(__dirname,"..","database.rules.json"),"utf8")).rules;
  for(const key of ["pos","pos-dev"]){
    assert.match(rules[key][".validate"],/bizDayAtomicValidationVersion/);
    assert.match(rules[key][".validate"],/_bizDayOperation/);
    const validation=rules[key]._bizDayOperation[".validate"];
    assert.match(validation,/nonce'\)\.val\(\) == data\.child\('nonce'/);
    assert.match(validation,/614100/);
    assert.match(validation,/type'\)\.val\(\) == 'start'/);
    assert.match(validation,/type'\)\.val\(\) == 'reopen'/);
    assert.match(validation,/type'\)\.val\(\) == 'end'/);
    assert.match(validation,key==="pos"?/child\('backup'\)/:/child\('backup-dev'\)/);
  }
});
