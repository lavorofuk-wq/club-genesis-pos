const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const app=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const numberingSource=app.slice(app.indexOf("function nextCastInternalNo"),app.indexOf("function emptyLifecycle"));
const departureSource=app.slice(app.indexOf("function castSnapshot"),app.indexOf("async function saveCastsAndLifecycle"));

const numberingContext={
  REGULAR_CAST_MAX_NO:99,
  TRIAL_CAST_START_NO:100,
  S:{castLifecycleLogs:{}},
  currentCasts:[]
};
numberingContext.allCasts=()=>numberingContext.currentCasts;
vm.createContext(numberingContext);
vm.runInContext(numberingSource,numberingContext);

numberingContext.currentCasts=[
  {internalNo:48,castType:"regular"},
  {internalNo:100,castType:"trial",trialBizDay:"2026-09-01"},
  {internalNo:103,castType:"regular"}
];
numberingContext.S.castLifecycleLogs={
  "2026-07-21":{exitedCasts:[{internalNo:100}]},
  "2026-08-24":{enteredCasts:[{internalNo:104,castType:"regular"}]},
  "2026-09-01":{trialCasts:[{internalNo:100,castType:"trial"}]}
};
assert.strictEqual(numberingContext.nextCastInternalNo(),49,"trial and legacy 100-series numbers must not advance regular numbering");
assert.strictEqual(numberingContext.nextTrialCastInternalNo("2026-09-01"),101,"a departed trial number must not be reused on the same day");

numberingContext.currentCasts=[{internalNo:99,castType:"regular"}];
numberingContext.S.castLifecycleLogs={};
assert.strictEqual(numberingContext.nextCastInternalNo(),100,"the caller must block regular registration after No.99");

const lifecycleCalls=[];
const departureContext={
  upsertLifecycle(...args){lifecycleCalls.push(args);},
  String,
  Number
};
vm.createContext(departureContext);
vm.runInContext(departureSource,departureContext);

departureContext.recordCastDeparture({id:"trial-1",name:"体入",internalNo:100,castType:"trial",trialBizDay:"2026-09-01",trialRegisteredAt:10},20,"2026-09-01");
assert.strictEqual(lifecycleCalls[0][0],"2026-09-01");
assert.strictEqual(lifecycleCalls[0][1],"trialCasts");
assert.strictEqual(lifecycleCalls[0][2].trialEndedAt,20);
assert.strictEqual(lifecycleCalls[0][2].castType,"trial");

departureContext.recordCastDeparture({id:"regular-1",name:"通常",internalNo:49,castType:"regular"},30,"2026-09-01");
assert.strictEqual(lifecycleCalls[1][1],"exitedCasts");
assert.strictEqual(lifecycleCalls[1][2].exitedAt,30);
assert.strictEqual(lifecycleCalls[1][2].castType,"regular");

const addRegularSource=app.slice(app.indexOf("function ac2"),app.indexOf("function actrial"));
assert.match(addRegularSource,/const internalNo=nextCastInternalNo\(\)/);
assert.match(addRegularSource,/if\(internalNo>REGULAR_CAST_MAX_NO\)/);
assert.match(app,/recordCastDeparture\(cast,ts,biz\)/);

console.log("cast numbering guards passed");
