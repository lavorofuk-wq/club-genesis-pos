const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const app=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");

test("past business history loads one page and does not fetch all GMS data",async()=>{
  const start=app.indexOf("function bizDaySummary");
  const end=app.indexOf("async function ensureBackupsLoaded",start);
  assert.ok(start>=0&&end>start);
  const days={};
  for(let day=1;day<=30;day++){
    const id=`2026-08-${String(day).padStart(2,"0")}`;
    days[id]={id,date:id,startedAt:day,endedAt:day+1,history:[{total:day*1000}],shifts:{[`sh_${day}`]:{}}};
  }
  const reads=[];
  const writes=[];
  const data={"pos-dev/bizDaySummaries":{},"pos-dev/bizDays":days};
  function query(refPath){
    let endAt=null,limit=Infinity;
    return{
      orderByKey(){return this;},
      endAt(value){endAt=value;return this;},
      limitToLast(value){limit=value;return this;},
      async once(){
        reads.push(refPath);
        let entries=Object.entries(data[refPath]||{}).sort(([a],[b])=>a.localeCompare(b));
        if(endAt)entries=entries.filter(([key])=>key<=endAt);
        entries=entries.slice(-limit);
        return{val:()=>Object.fromEntries(entries)};
      }
    };
  }
  const context={
    HISTORY_PAGE_SIZE:24,
    FB_ROOT:"pos-dev",
    window:{_db:{ref:query}},
    S:{bizDays:{},bizDaySummaries:{}},
    lazyDataState:{bizDayList:{status:"idle",loadedAt:0,promise:null,ids:[],oldestKey:null,hasMore:true}},
    guardedUpdate:async updates=>{writes.push(updates);},
    updateRemoteHash:()=>{},cloneData:value=>JSON.parse(JSON.stringify(value)),
    expandedHist:{},vw:"histlog",render:()=>{},sbs:()=>{},alert:()=>{},
    console,Date,Math,String,Object,Array,Set,Promise,Error
  };
  vm.createContext(context);
  vm.runInContext(app.slice(start,end),context);

  assert.equal(await context.ensureBizDayListLoaded(true),true);
  assert.equal(context.lazyDataState.bizDayList.ids.length,24);
  assert.equal(context.lazyDataState.bizDayList.ids[0],"2026-08-30");
  assert.equal(context.lazyDataState.bizDayList.hasMore,true);
  assert.deepEqual(reads,["pos-dev/bizDaySummaries","pos-dev/bizDays"]);
  assert.ok(reads.every(value=>!value.includes("gmsExportMeta")&&!value.includes("gmsTargetCorrections")));
  assert.equal(writes.length,1);
  assert.ok(Object.keys(writes[0]).every(key=>key.startsWith("pos-dev/bizDaySummaries/")));
});
