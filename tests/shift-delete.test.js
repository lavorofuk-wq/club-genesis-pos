const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const root=path.join(__dirname,"..");
const app=fs.readFileSync(path.join(root,"app.js"),"utf8");
const sync=require(path.join(root,"sync-core.js"));
const start=app.indexOf("async function guardedShiftDelete");
const end=app.indexOf("function syncVersionedRecordsFromPrepared",start);
assert.ok(start>=0&&end>start,"出勤削除ヘルパーを抽出できる");
const source=app.slice(start,end);

function createContext({remote,activeAssignments={},updateError=null}){
  const reads=[];
  const updates=[];
  let remoteReadCount=0;
  const context={
    APP_VERSION:"6.140.6",
    FB_ROOT:"pos-dev",
    POS_SYNC:sync,
    S:{shifts:{[remote.id]:JSON.parse(JSON.stringify(remote))}},
    requireFirebaseReady:()=>true,
    _verNum:value=>{
      const parts=String(value||"0").split(".");
      return parseInt((parts[0]||"0").padStart(2,"0")+(parts[1]||"0").padStart(2,"0")+(parts[2]||"0").padStart(2,"0"),10);
    },
    readRemoteRelative:async relative=>{
      reads.push(relative);
      remoteReadCount++;
      return JSON.parse(JSON.stringify(remote));
    },
    readRemoteActiveAssignmentsForCast:async castId=>{
      reads.push("activeAssignments:"+castId);
      return activeAssignments;
    },
    isFirebasePermissionDenied:error=>error&&error.code==="PERMISSION_DENIED",
    window:{_db:{ref:refPath=>({update:async values=>{
      assert.strictEqual(refPath,"/","小さいマルチパス更新を使う");
      updates.push(values);
      if(updateError)throw updateError;
    }})}},
    Date,
    Math
  };
  vm.createContext(context);
  vm.runInContext(source,context);
  return{context,reads,updates,getRemoteReadCount:()=>remoteReadCount};
}

test("completed shift deletion reads one record and atomically writes only deletion and its proof",async()=>{
  const shift={id:"sh_1",castId:"cast_a",castName:"A",clockIn:1000,clockOut:2000,_rev:4};
  const {context,reads,updates}=createContext({remote:shift});
  await context.guardedShiftDelete(shift.id,{...shift});

  assert.deepStrictEqual(reads,["shifts/sh_1"]);
  assert.strictEqual(updates.length,1);
  assert.deepStrictEqual(Object.keys(updates[0]).sort(),[
    "pos-dev/_shiftDeleteOperations/sh_1",
    "pos-dev/shifts/sh_1"
  ]);
  assert.strictEqual(updates[0]["pos-dev/shifts/sh_1"],null);
  const operation=updates[0]["pos-dev/_shiftDeleteOperations/sh_1"];
  assert.strictEqual(operation.version,614006);
  assert.strictEqual(operation.expectedRev,4);
  assert.strictEqual(operation.castId,"cast_a");
  assert.equal(context.S.shifts.sh_1,undefined);
});

test("active shift without assignments is deleted after the targeted assignment check",async()=>{
  const shift={id:"sh_active",castId:"cast_active",castName:"出勤中",clockIn:1000,clockOut:null,_rev:5};
  const {context,reads,updates}=createContext({remote:shift});

  await context.guardedShiftDelete(shift.id,{...shift});

  assert.deepStrictEqual(reads,["shifts/sh_active","activeAssignments:cast_active"]);
  assert.strictEqual(updates.length,1);
  assert.strictEqual(updates[0]["pos-dev/shifts/sh_active"],null);
  assert.equal(context.S.shifts.sh_active,undefined);
});

test("active shift deletion checks assignments and rejects a cast still assigned",async()=>{
  const shift={id:"sh_2",castId:"cast_b",castName:"B",clockIn:1000,clockOut:null,_rev:2};
  const assignment={id:"as_1",castId:"cast_b",endTime:null};
  const {context,reads,updates}=createContext({remote:shift,activeAssignments:{as_1:assignment}});

  await assert.rejects(
    context.guardedShiftDelete(shift.id,{...shift}),
    error=>error.userMessage==="付け回し中の出退勤記録は削除できません。先に付け回しを終了してください。"
  );
  assert.deepStrictEqual(reads,["shifts/sh_2","activeAssignments:cast_b"]);
  assert.strictEqual(updates.length,0);
  assert.ok(context.S.shifts.sh_2);
});

test("shift deletion rejects a stale revision before writing",async()=>{
  const remote={id:"sh_3",castId:"cast_c",castName:"C",clockIn:1000,clockOut:2000,_rev:3};
  const expected={...remote,_rev:2};
  const {context,updates}=createContext({remote});

  await assert.rejects(
    context.guardedShiftDelete(remote.id,expected),
    error=>error.userMessage==="出退勤情報が他端末で更新されています。最新状態を確認してください。"
  );
  assert.strictEqual(updates.length,0);
  assert.strictEqual(context.S.shifts.sh_3._rev,3);
});
