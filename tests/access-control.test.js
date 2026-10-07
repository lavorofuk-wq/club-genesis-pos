const test=require("node:test");
const assert=require("node:assert/strict");
const access=require("../access-control.js");

test("each role receives exactly the requested tabs",()=>{
  assert.deepEqual(access.tabs("cashier"),["floor","list","settings","shifts","history"]);
  assert.deepEqual(access.tabs("list"),["list","shifts"]);
  for(const tab of ["floor","list","settings","shifts","history","analysis","admin","accounts"]){
    assert.equal(access.canView("op",tab),true,tab);
  }
  const tabs=access.tabs("list");tabs.push("admin");
  assert.equal(access.canView("list","admin"),false);
});

test("missing, malformed and inherited roles fail closed",()=>{
  for(const role of [undefined,null,true,1,{},[],"","OP"," op","cashier ","manager","__proto__","constructor","toString"]){
    assert.equal(access.normalizeRole(role),null);
    assert.deepEqual(access.tabs(role),[]);
    for(const view of ["home","floor","list","shifts","settings","accounts"]){assert.equal(access.canView(role,view),false);}
    assert.equal(access.canReadPath(role,"sessions"),false);
    assert.equal(access.canWritePath(role,"shifts/s1"),false);
    assert.equal(access.canStartBusiness(role),false);
  }
});

test("business start is available to cashier and OP without granting end or archive access",()=>{
  assert.equal(access.canStartBusiness("cashier"),true);
  assert.equal(access.canStartBusiness("op"),true);
  assert.equal(access.canStartBusiness("list"),false);
  for(const prefix of ["","pos/","pos-dev/"]){
    for(const path of ["bizDays/2026-10-02/id","_bizDayRevisions/2026-10-02"]){
      assert.equal(access.canReadPath("cashier",prefix+path),true,prefix+path);
      assert.equal(access.canReadPath("list",prefix+path),false,prefix+path);
    }
    for(const path of ["bizDays/2026-10-02","bizDays/2026-10-02/history","bizDays/2026-10-02/id/extra","bizDays/not-a-date/id","_bizDayRevisions","_bizDayRevisions/not-a-date","bizDaySummaries/2026-10-02"]){
      assert.equal(access.canReadPath("cashier",prefix+path),false,prefix+path);
    }
    for(const path of ["activeBizDay","_bizDayOperation","bizDays/2026-10-02","bizDaySummaries/2026-10-02","_bizDayRevisions/2026-10-02"]){
      assert.equal(access.canWritePath("cashier",prefix+path),true,prefix+path);
      assert.equal(access.canWritePath("list",prefix+path),false,prefix+path);
    }
  }
});

test("internal navigation cannot open another role's tab",()=>{
  for(const role of ["cashier","list","op"]){
    assert.equal(access.canView(role,"home"),true);
    assert.equal(access.canView(role,"tableDetail"),true);
    assert.equal(access.canView(role,"assignHistory"),true);
    assert.equal(access.canView(role,"unknown"),false);
    assert.equal(access.canView(role,"__proto__"),false);
  }
  for(const role of ["cashier","list"]){
    for(const view of ["analysis","admin","histlog","backupDetail","accounts"]){assert.equal(access.canView(role,view),false);}
  }
  assert.equal(access.canView("cashier","history"),true);
  assert.equal(access.canView("list","history"),false);
  for(const view of ["floor","settings"]){assert.equal(access.canView("list",view),false);}
});

test("operating data is readable without exposing archives or configuration to list accounts",()=>{
  for(const role of ["cashier","list"]){
    for(const prefix of ["","pos/","pos-dev/"]){
      for(const node of ["sessions/t1","tables","assignments","history","shifts","activeBizDay","_capabilities"]){
        assert.equal(access.canReadPath(role,prefix+node),true,prefix+node);
      }
      for(const node of ["bizDays","bizDaySummaries","backups","gmsExportMeta","gmsTargetCorrections"]){
        assert.equal(access.canReadPath(role,prefix+node),false,prefix+node);
      }
    }
    for(const path of ["pos","pos-dev","backup/bizDays","backup-dev/bizDays"]){assert.equal(access.canReadPath(role,path),false);}
  }
  assert.equal(access.canReadPath("cashier","config"),true);
  assert.equal(access.canReadPath("list","config"),false);
  assert.equal(access.canReadPath("op","backup/bizDays"),true);
});

test("write scopes protect account, business-day and settings administration",()=>{
  for(const role of ["cashier","list"]){
    for(const path of ["_capabilities","bizDays/day","gmsTargetCorrections/day","backup/bizDays","access/roles/other","access/authorizedUsers/other"]){
      assert.equal(access.canWritePath(role,path),false,path);
    }
    for(const path of ["shifts/s1","assignments/a1","_scopedOperation","tablePreparations/t1"]){assert.equal(access.canWritePath(role,path),true,path);}
  }
  for(const path of ["sessions/t1","menus","casts","config","history/h1"]){
    assert.equal(access.canWritePath("cashier",path),true,path);
    assert.equal(access.canWritePath("list",path),false,path);
  }
  assert.equal(access.canWritePath("op","bizDays/day"),true);
  // Account administration is deliberately outside the generic POS path policy.
  assert.equal(access.canWritePath("op","access/roles/other"),false);
  for(const path of [null,{},"../history","sessions//t1","sessions/../../history","sessions\\t1"]){
    assert.equal(access.canReadPath("op",path),false);
    assert.equal(access.canWritePath("cashier",path),false);
  }
});
