const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const app=fs.readFileSync(path.join(__dirname,'../../app.js'),'utf8');
const clone=value=>value==null?null:JSON.parse(JSON.stringify(value));
const relative=key=>String(key).replace(/^pos-dev\//,'');
const get=(root,key)=>relative(key).split('/').filter(Boolean).reduce((v,k)=>v?.[k],root);
function put(root,key,value){
  const keys=relative(key).split('/').filter(Boolean),last=keys.pop();
  const parent=keys.reduce((v,k)=>v[k]||(v[k]={}),root);
  if(value==null)delete parent[last];else parent[last]=clone(value);
}
function source(from,to){
  const start=app.indexOf(from),end=app.indexOf(to,start+from.length);
  assert.ok(start>=0&&end>start,from+' extraction boundary');
  return app.slice(start,end);
}
function fixture(){return{
  activeBizDay:'2026-09-08',
  _capabilities:{scopedAtomicValidationVersion:614400,tableChangeAtomicValidationVersion:614300,bizDayAtomicValidationVersion:614100},
  sessions:{t1:{tableId:'t1',sessionId:'s1',startTime:100,_rev:4,items:[{id:'drink',price:2000,qty:3}]}},
  shifts:{s1:{id:'s1',castId:'c1',clockIn:90,status:'active',_rev:2}},
  assignments:{a1:{id:'a1',castId:'c1',tableId:'t1',sessionId:100,startTime:110,type:'free',_rev:7}},
  history:{},bizDays:{},bizDaySummaries:{},castLifecycleLogs:{},
  _tableAssignmentRevisions:{t1:3,t2:2}
};}
function fakeDb(state,beforeWrite){
  const reads=[],writes=[];
  return{reads,writes,ref(key){let field,filter;return{
    orderByChild(value){field=value;return this;},equalTo(value){filter=value;return this;},
    async get(){
      reads.push({key,field,filter});
      let value=get(state,key);
      if(field)value=Object.fromEntries(Object.entries(value||{}).filter(([,v])=>v[field]===filter));
      const snapshot=clone(value);return{val:()=>snapshot};
    },
    async once(){return this.get();},
    async update(updates){if(beforeWrite)await beforeWrite(updates);writes.push(clone(updates));Object.entries(updates).forEach(([p,v])=>{if(p.startsWith('pos-dev/'))put(state,p,v);});}
  };}};
}
function contextFor(db,state=fixture()){
  const context={
    APP_VERSION:'6.144',FB_ROOT:'pos-dev',BIZ_DAY_ATOMIC_VALIDATION_VERSION:614100,
    SCOPED_ATOMIC_VALIDATION_VERSION:614400,TABLE_CHANGE_ATOMIC_VALIDATION_VERSION:614300,
    scopedAtomicValidationVersion:614400,tableChangeAtomicValidationVersion:614300,bizDayAtomicValidationVersion:614100,
    S:{sessions:{},assignments:{},shifts:{},bizDays:{},bizDaySummaries:{},...clone(state),history:Object.values(state.history||{})},
    window:{_db:db},POS_SYNC:require('../../sync-core.js'),requireFirebaseReady:()=>true,
    _verNum:()=>614400,performance,console,Date,Promise,Set,
    withWriteGate:updates=>({...updates,'pos-dev/_writeGate':{versionNum:614400,nonce:Math.random().toString()}}),
    guardedUpdate:async updates=>db.ref('/').update(context.withWriteGate(updates)),
    lazyDataState:{bizDays:{status:'loaded'},bizDayList:{ids:Object.keys(state.bizDays||{})}},
    bizDaySummary:(day,id)=>({id,date:day.date||id,_dayRev:Number(day._rev)||0,sales:(day.history||[]).reduce((n,h)=>n+(h.total||0),0)}),
    sbs:()=>{},render:()=>{},refreshFloorModal:()=>{},rModal:()=>{},closeM:()=>{},alert:()=>{},
    waitForSessionSaveQueue:async()=>{},sessionSaveStates:{},at:'t1',md:'tc',tableChangeBusy:false,
    isPendingAssignment:()=>false
  };
  vm.createContext(context);
  for(const [from,to] of [
    ['function canonicalJsonValue','function settingConflictError'],
    ['function castIdQueryValues','const optimisticRootPaths'],
    ['const optimisticRootPaths','function bizDayOperation'],
    ['function bizDayOperation','// ===== SESSIONS ====='],
    ['async function guardedCloseSession','async function checkout'],
    ['function tableChangeAssignments','// ===== RENDER ENGINE ====='],
    ['function closedBizDayConflictMessage','async function confirmDeleteBizDay'],
    ['async function guardedRestoreBackupDays','async function restoreFromBackupDay'],
    ['async function guardedHistoryRecordUpdate','async function saveHistPay'],
    ['function remoteActiveAssign','async function clockIn'],
    ['function shiftWithStatus','async function clockOut']
  ])vm.runInContext(source(from,to),context);
  return context;
}
async function emulator(namespace='demo-pos-scoped'){
  const token=Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:'scoped-test',user_id:'scoped-test',aud:namespace,iss:'https://securetoken.google.com/'+namespace,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.';
  const reads=[];
  async function request(key,method='GET',value,admin=false,query={}){
    const url=new URL('http://127.0.0.1:9017/'+key.replace(/^\//,'')+'.json');
    url.searchParams.set('ns',namespace);if(!admin)url.searchParams.set('auth',token);
    for(const [k,v] of Object.entries(query))url.searchParams.set(k,JSON.stringify(v));
    const response=await fetch(url,{method,headers:{'content-type':'application/json',...(admin?{Authorization:'Bearer owner'}:{})},body:value===undefined?undefined:JSON.stringify(value)});
    const result=await response.json();
    if(!response.ok)throw Object.assign(new Error(JSON.stringify(result)),{code:response.status===401||response.status===403?'PERMISSION_DENIED':String(response.status)});
    return result;
  }
  await request('.settings/rules','PUT',JSON.parse(fs.readFileSync(path.join(__dirname,'../../database.rules.json'),'utf8')),true);
  return{
    request,reads,
    reset:state=>request('','PUT',{access:{authorizedUsers:{'scoped-test':true}},'pos-dev':state},true),
    db(beforeWrite){return{ref(key){let field,filter;return{
      orderByChild(value){field=value;return this;},equalTo(value){filter=value;return this;},
      async get(){reads.push({key,field,filter});const value=await request(key,'GET',undefined,false,field?{orderBy:field,equalTo:filter}:{});return{val:()=>value};},
      async once(){return this.get();},
      async update(updates){if(beforeWrite)await beforeWrite(updates);return request('','PATCH',updates);}
    };}};}
  };
}
module.exports={app,clone,get,put,source,fixture,fakeDb,contextFor,emulator};
