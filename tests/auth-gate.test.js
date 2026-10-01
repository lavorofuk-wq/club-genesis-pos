const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const access=require("../access-control.js");

const root=path.join(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

test("POS login uses session authentication without public signup",()=>{
  const init=read("firebase-init.js");
  assert.match(init,/firebase-auth-compat\.js/);
  assert.match(init,/Auth\.Persistence\.SESSION/);
  assert.match(init,/signInWithEmailAndPassword/);
  assert.match(init,/access\/authorizedUsers\//);
  assert.match(init,/access\/roles\//);
});

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
async function authHarness(options={}){
  const allowed=Object.prototype.hasOwnProperty.call(options,"allowed")?options.allowed:true;
  const role=Object.prototype.hasOwnProperty.call(options,"role")?options.role:"op";
  const {failPath=null,watchValues={},signOutWait=null}=options;
  const nodes=new Map();
  for(const id of ["lmsg","lsub","auth-gate","loading","auth-error","auth-email","auth-password","auth-submit","auth-form","app","m","md","fom-inner","receipt-print-area","floor-order-modal"]){
    nodes.set(id,{style:{},dataset:{},attributes:{},textContent:"private content",value:"",disabled:false,focus(){},setAttribute(key,value){this.attributes[key]=value;},addEventListener(){}});
  }
  const values=new Map([["access/authorizedUsers/user1",allowed],["access/roles/user1",role]]);
  const watchers=new Map();
  const calls={signOut:0,offline:0,reload:0,clear:0,events:[],reads:[]};
  const db={
    goOffline(){calls.offline++;},
    ref(path){
      return{
        once:async()=>{
          calls.reads.push(path);
          if(path===failPath)throw Object.assign(new Error("denied"),{code:"PERMISSION_DENIED"});
          return{val:()=>values.get(path)};
        },
        on(_event,listener,cancel){
          const entries=watchers.get(path)||[];entries.push({listener,cancel});watchers.set(path,entries);
          listener({val:()=>Object.prototype.hasOwnProperty.call(watchValues,path)?watchValues[path]:values.get(path)});
        },
        off(_event,listener){watchers.set(path,(watchers.get(path)||[]).filter(entry=>entry.listener!==listener));}
      };
    }
  };
  let authCallback,authErrorCallback;
  const auth={
    currentUser:null,
    setPersistence:async()=>{},
    onAuthStateChanged(callback,error){authCallback=callback;authErrorCallback=error;},
    async signOut(){calls.signOut++;if(signOutWait)await signOutWait.promise;this.currentUser=null;if(authCallback)await authCallback(null);}
  };
  const authFactory=()=>auth;authFactory.Auth={Persistence:{SESSION:"session"}};
  const context={
    firebase:{apps:[{}],auth:authFactory,database:()=>db},PosAccess:access,
    document:{readyState:"complete",getElementById:id=>nodes.get(id)||null},
    console:{error(){}},setTimeout(){return 1;},clearTimeout(){},
    Event:class{constructor(type){this.type=type;}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
    location:{hostname:"localhost",reload(){calls.reload++;}},
    dispatchEvent(event){calls.events.push({type:event.type,role:this._posRole,uid:this._posUid});},
    posClearPrivateState(){calls.clear++;}
  };
  context.window=context;
  vm.runInNewContext(read("firebase-init.js"),context,{filename:"firebase-init.js"});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(typeof authCallback,"function");
  return{
    context,calls,nodes,watchers,values,auth,
    async login(uid="user1"){auth.currentUser={uid};await authCallback(auth.currentUser);},
    async logoutState(){auth.currentUser=null;await authCallback(null);},
    change(path,value){values.set(path,value);for(const entry of [...(watchers.get(path)||[])])entry.listener({val:()=>value});},
    cancel(path){for(const entry of [...(watchers.get(path)||[])])entry.cancel(new Error("denied"));},
    authError(){authErrorCallback(new Error("auth failed"));},
    async settle(){await new Promise(resolve=>setImmediate(resolve));}
  };
}

test("only an allowlisted account with an exact known role can expose Firebase",async()=>{
  for(const role of ["op","cashier","list"]){
    const h=await authHarness({role});await h.login();
    assert.equal(h.context._fbReady,true);
    assert.equal(h.context._posRole,role);
    assert.equal(h.context._posUid,"user1");
    assert.deepEqual(h.calls.events,[{type:"fbReady",role,uid:"user1"}]);
    assert.equal(h.calls.signOut,0);
    assert.equal(h.watchers.get("access/roles/user1").length,1);
  }
  for(const role of [undefined,null,"","OP","staff",true,{role:"op"}]){
    const h=await authHarness({role});await h.login();
    assert.notEqual(h.context._fbReady,true);
    assert.equal(h.context._db,undefined);
    assert.equal(h.calls.events.length,0);
    assert.equal(h.calls.signOut,1);
  }
  for(const allowed of [false,undefined,null,"true",1]){
    const h=await authHarness({allowed});await h.login();
    assert.notEqual(h.context._fbReady,true);
    assert.equal(h.calls.events.length,0);
    assert.equal(h.calls.signOut,1);
  }
});

test("a failed role or allowlist read never starts the POS",async()=>{
  for(const failPath of ["access/roles/user1","access/authorizedUsers/user1"]){
    const h=await authHarness({failPath});await h.login();
    assert.equal(h.calls.events.length,0);
    assert.equal(h.calls.signOut,1);
    assert.equal(h.context._posRole,null);
    assert.match(h.nodes.get("auth-error").textContent,/確認できません/);
  }
});

test("role changes remove rendered private data before sign-out finishes",async()=>{
  const wait=deferred();
  const h=await authHarness({signOutWait:wait});await h.login();
  h.change("access/roles/user1","list");
  assert.equal(h.context._posRole,null);
  assert.equal(h.context._posUid,null);
  assert.equal(h.context._db,null);
  assert.equal(h.context._fbReady,false);
  assert.equal(h.context._posAccessInvalidated,true);
  assert.equal(h.nodes.get("app").style.display,"none");
  for(const id of ["m","md","fom-inner","receipt-print-area"]){assert.equal(h.nodes.get(id).textContent,"");}
  assert.equal(h.nodes.get("floor-order-modal").style.display,"none");
  assert.equal(h.calls.offline,1);
  assert.equal(h.calls.clear,1);
  assert.equal(h.calls.reload,0);
  assert.equal(h.watchers.get("access/roles/user1").length,0);
  wait.resolve();await h.settle();
  assert.equal(h.calls.reload,1);
});

test("allowlist revocation, monitor errors and auth errors invalidate active access",async()=>{
  for(const trigger of [
    h=>h.change("access/authorizedUsers/user1",false),
    h=>h.change("access/roles/user1",null),
    h=>h.cancel("access/roles/user1"),
    h=>h.authError()
  ]){
    const h=await authHarness();await h.login();trigger(h);await h.settle();
    assert.equal(h.context._fbReady,false);
    assert.equal(h.context._posRole,null);
    assert.equal(h.calls.reload,1);
    assert.equal(h.calls.signOut,1);
  }
});

test("revocation between the initial read and live subscription cannot expose Firebase",async()=>{
  const h=await authHarness({watchValues:{"access/roles/user1":"list"}});await h.login();await h.settle();
  assert.equal(h.calls.events.length,0);
  assert.equal(h.context._fbReady,false);
  assert.equal(h.calls.reload,1);
});

test("same authorization values keep the current session, account replacement clears it",async()=>{
  const h=await authHarness();await h.login();
  h.change("access/roles/user1","op");h.change("access/authorizedUsers/user1",true);
  assert.equal(h.context._fbReady,true);
  assert.equal(h.calls.signOut,0);
  await h.login("user2");
  assert.equal(h.context._fbReady,false);
  assert.equal(h.calls.reload,1);
});

test("database rules deny by default and require an allowlisted authenticated UID",()=>{
  const rules=JSON.parse(read("database.rules.json"));
  assert.equal(rules.rules[".read"],false);
  assert.equal(rules.rules[".write"],false);
  for(const key of ["pos","pos-dev","backup","backup-dev"]){
    assert.match(rules.rules[key][".read"],/auth != null/);
    assert.match(rules.rules[key][".read"],/authorizedUsers/);
  }
  for(const key of ["authorizedUsers","roles"]){
    const write=rules.rules.access[key]["$uid"][".write"];
    assert.match(write,/roles/);
    assert.match(write,/== 'op'/);
    assert.match(write,/auth\.uid != \$uid/);
  }
});

test("GMS target corrections use a narrow authenticated child transaction rule",()=>{
  const rules=JSON.parse(read("database.rules.json"));
  for(const key of ["pos","pos-dev"]){
    const write=rules.rules[key].gmsTargetCorrections["$dayId"]["$transactionId"][".write"];
    assert.deepEqual(rules.rules[key].bizDays["$dayId"].history[".indexOn"],["id","startTime"]);
    assert.match(write,/auth != null/);
    assert.match(write,/authorizedUsers/);
    assert.match(write,/activeBizDay/);
    assert.match(write,/schemaVersion'\)\.val\(\) == 1/);
    assert.match(write,/transactionId'\)\.val\(\) == \$transactionId/);
    assert.match(write,/_nodeWriteVersion'\)\.val\(\) >= 614004/);
    assert.match(write,/_rev'\)\.val\(\) ==/);
  }
});

test("shift deletion requires an atomic revision-bound companion operation",()=>{
  const rules=JSON.parse(read("database.rules.json"));
  for(const key of ["pos","pos-dev"]){
    const shiftWrite=rules.rules[key].shifts["$shiftId"][".write"];
    const operationWrite=rules.rules[key]._shiftDeleteOperations["$shiftId"][".write"];
    assert.match(shiftWrite,/_shiftDeleteOperations/);
    assert.match(shiftWrite,/version'\)\.val\(\) >= 614006/);
    assert.match(shiftWrite,/expectedRev/);
    assert.match(shiftWrite,/castId/);
    assert.match(operationWrite,/auth != null/);
    assert.match(operationWrite,/authorizedUsers/);
    assert.match(operationWrite,/version'\)\.val\(\) >= 614006/);
    assert.match(operationWrite,/expectedRev/);
    assert.match(operationWrite,/castId/);
    assert.match(operationWrite,/!newData\.parent\(\)\.parent\(\)\.child\('shifts'\)\.child\(\$shiftId\)\.exists\(\)/);
    assert.match(operationWrite,new RegExp(`root\\.child\\('${key}'\\)\\.child\\('shifts'\\)`));
  }
});

test("login form does not offer public account registration",()=>{
  const html=read("index.html");
  assert.match(html,/id="auth-form"/);
  assert.match(html,/autocomplete="current-password"/);
  assert.doesNotMatch(html,/新規登録|アカウント作成|signUp/i);
});
