const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const app=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const normalizeSource=app.slice(app.indexOf("function normalizeCasts"),app.indexOf("function currentCastBizDate"));
const departureSource=app.slice(app.indexOf("function castSnapshot"),app.indexOf("async function saveCastsAndLifecycle"));

const normalizeCastType=(value,isTrial,status)=>["regular","trial","dispatch"].includes(value)?value:(isTrial===true||status==="trial"?"trial":"regular");
const normalizeContext={S:{casts:[]},Number,String,normalizeCastType};
vm.createContext(normalizeContext);
vm.runInContext(normalizeSource,normalizeContext);

const legacy={id:"legacy",name:"Legacy",internalNo:103,sortIndex:1,registeredAt:20};
const current={id:"current",name:"Current",sortIndex:0,registeredAt:30};
normalizeContext.S.casts=[legacy,current];
const casts=normalizeContext.allCasts();
assert.strictEqual(casts[0].id,"current","cast order must use sortIndex instead of the legacy number");
assert.strictEqual(casts[1].internalNo,103,"existing internal numbers must remain untouched for export compatibility");
assert.ok(!Object.prototype.hasOwnProperty.call(casts[0],"internalNo"),"normalization must not assign a new internal number");

const lifecycleCalls=[];
const departureContext={
  upsertLifecycle(...args){lifecycleCalls.push(args);},
  normalizeCastType,
  String,
  Number
};
vm.createContext(departureContext);
vm.runInContext(departureSource,departureContext);

departureContext.recordCastDeparture({id:"trial-1",name:"Trial",castType:"trial",trialBizDay:"2026-09-01",trialRegisteredAt:10},20,"2026-09-01");
assert.strictEqual(lifecycleCalls[0][0],"2026-09-01");
assert.strictEqual(lifecycleCalls[0][1],"trialCasts");
assert.strictEqual(lifecycleCalls[0][2].trialEndedAt,20);
assert.strictEqual(lifecycleCalls[0][2].castType,"trial");

departureContext.recordCastDeparture({id:"regular-1",name:"Regular",castType:"regular"},30,"2026-09-01");
assert.strictEqual(lifecycleCalls[1][1],"exitedCasts");
assert.strictEqual(lifecycleCalls[1][2].exitedAt,30);
assert.strictEqual(lifecycleCalls[1][2].castType,"regular");

const addRegularSource=app.slice(app.indexOf("function ac2"),app.indexOf("function actrial"));
const addTrialSource=app.slice(app.indexOf("function actrial"),app.indexOf("function dc2"));
assert.doesNotMatch(app,/function next(?:Trial)?CastInternalNo\(/);
assert.doesNotMatch(app,/REGULAR_CAST_MAX_NO|TRIAL_CAST_START_NO/);
assert.doesNotMatch(addRegularSource,/internalNo|No\.99/);
assert.doesNotMatch(addTrialSource,/internalNo/);
assert.doesNotMatch(app,/No\.'\+castNo|function castNo\(/);
assert.match(app,/recordCastDeparture\(cast,ts,biz\)/);

console.log("cast registration without numbering passed");
