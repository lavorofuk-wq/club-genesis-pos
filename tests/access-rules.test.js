const {test}=require('node:test');
const assert=require('node:assert/strict');
const rules=require('../database.rules.json');
const {applyAccessRules,SHARED_READ_PATHS,CASHIER_READ_PATHS,SHARED_WRITE_PATHS,CASHIER_WRITE_PATHS}=require('../scripts/access-rules.cjs');
const {fixture,clone,contextFor,emulator}=require('./helpers/scoped-runtime.cjs');

test('role rule generation is idempotent and preserves validators and indexes',()=>{
  assert.deepEqual(applyAccessRules(rules),rules);
  const source=clone(rules);
  source.rules.pos.sessions.$tableId['.validate']+=' && newData.child("custom").exists()';
  source.rules['pos-dev'].assignments['.indexOn']=['castId','tableId','custom'];
  const output=applyAccessRules(source);
  assert.equal(output.rules.pos.sessions.$tableId['.validate'],source.rules.pos.sessions.$tableId['.validate']);
  assert.deepEqual(output.rules['pos-dev'].assignments['.indexOn'],source.rules['pos-dev'].assignments['.indexOn']);
  for(const root of ['pos','pos-dev']){
    assert.match(output.rules[root]['.read'],/== 'op'/);
    assert.doesNotMatch(output.rules[root]['.read'],/== 'cashier'|== 'list'/);
    const inspect=node=>Object.entries(node).forEach(([key,value])=>{
      if(key==='.write'&&typeof value==='string')assert.match(value,/child\('roles'\)/);
      else if(value&&typeof value==='object')inspect(value);
    });
    inspect(output.rules[root]);
  }
});

test('client path permissions match the server path categories',()=>{
  const access=require('../access-control.js');
  for(const role of ['cashier','list']){
    for(const name of SHARED_READ_PATHS)assert.equal(access.canReadPath(role,name),true,`${role} read ${name}`);
    for(const name of CASHIER_READ_PATHS)assert.equal(access.canReadPath(role,name),role==='cashier',`${role} read ${name}`);
    for(const name of SHARED_WRITE_PATHS)assert.equal(access.canWritePath(role,name),true,`${role} write ${name}`);
    for(const name of CASHIER_WRITE_PATHS)assert.equal(access.canWritePath(role,name),role==='cashier',`${role} write ${name}`);
  }
});

test('Firebase enforces account roles, direct reads, writes and atomic workflows',{skip:process.env.POS_RULES_EMULATOR!=='1'},async t=>{
  const namespace='demo-pos-access-roles';
  const clients={};
  for(const role of ['op','cashier','list','missing','unknown','disabled'])clients[role]=await emulator(namespace,role);
  const admin=clients.op;
  const access={authorizedUsers:{op:true,cashier:true,list:true,missing:true,unknown:true,disabled:false},roles:{op:'op',cashier:'cashier',list:'list',unknown:'admin',disabled:'op'}};
  function state(){
    return {...fixture(),appVersion:'6.152',casts:[{id:'c1',name:'A'}],menus:[{id:'m1',price:1000}],tables:[{id:'t1',label:'T1'},{id:'t2',label:'T2'}],
      config:{printerIP:'192.0.2.1'},loMode:false,loStatus:{},bizDays:{'2026-09-01':{history:[{total:999}]}},
      bizDaySummaries:{'2026-09-01':{sales:999}},gmsExportMeta:{private:true},gmsTargetCorrections:{private:true},backups:{private:true}};
  }
  async function reset(value=state()){
    await admin.request('','PUT',{access:clone(access),pos:clone(value),'pos-dev':clone(value),backup:{private:true},'backup-dev':{private:true}},true);
    return value;
  }
  const denied=promise=>assert.rejects(promise,error=>error.code==='PERMISSION_DENIED');
  const patchFor=(root,paths)=>({...Object.fromEntries(Object.entries(paths).map(([key,value])=>[root+'/'+key,value])),[root+'/_writeGate']:{versionNum:615200,nonce:Math.random().toString()}});

  await t.test('only valid authorized roles can read operational data, and non-OP accounts cannot read administrative data',async()=>{
    await reset();
    for(const root of ['pos','pos-dev']){
      for(const role of ['cashier','list']){
        for(const name of SHARED_READ_PATHS)await clients[role].request(root+'/'+name);
        for(const name of ['', 'bizDays','bizDaySummaries','backups','gmsExportMeta','gmsTargetCorrections','_bizDayOperation','_bizDayRevisions'])await denied(clients[role].request(name?root+'/'+name:root));
        for(const name of CASHIER_READ_PATHS){
          if(role==='cashier')await clients[role].request(root+'/'+name);
          else await denied(clients[role].request(root+'/'+name));
        }
      }
      for(const role of ['missing','unknown','disabled'])await denied(clients[role].request(root+'/sessions'));
      await clients.op.request(root);
    }
    for(const root of ['backup','backup-dev']){
      await clients.op.request(root);
      for(const role of ['cashier','list','missing','unknown','disabled'])await denied(clients[role].request(root));
    }
    const anonymous=await fetch(`http://127.0.0.1:9017/pos/sessions.json?ns=${namespace}`);
    assert.equal(anonymous.status,401);
    for(const role of ['op','cashier','list','missing','unknown','disabled']){
      await clients[role].request('access/authorizedUsers/'+role);
      await clients[role].request('access/roles/'+role);
      if(role!=='op')await denied(clients[role].request('access'));
    }
  });

  await t.test('non-OP accounts cannot bypass roles using an ancestor update, backup, lifecycle, capability or legacy node grant',async()=>{
    await reset();
    for(const root of ['pos','pos-dev']){
      for(const role of ['cashier','list']){
        for(const path of ['activeBizDay','bizDays/test','bizDaySummaries/test','gmsExportMeta/test','_capabilities/scopedAtomicValidationVersion','_bizDayRevisions/test','_bizDayOperation','backups/test','unknown/path']){
          await denied(clients[role].request('','PATCH',patchFor(root,{[path]:path==='activeBizDay'?'new-day':1})));
        }
        await denied(clients[role].request(root,'PUT',{...state(),_writeGate:{versionNum:615200,nonce:'replace'}}));
        await denied(clients[role].request('backup/test','PUT',true));
        await denied(clients[role].request('backup-dev/test','PUT',true));
      }
      const session={tableId:'t2',startTime:200,_rev:1,_nodeWriteVersion:615200,_nodeWriteNonce:'new'};
      await denied(clients.list.request(root+'/sessions/t2','PUT',session));
      await clients.cashier.request(root+'/sessions/t2','PUT',session);
      for(const role of ['missing','unknown','disabled'])await denied(clients[role].request(root+'/sessions/other','PUT',{...session,tableId:'other'}));
    }
  });

  await t.test('cashier settings write needs the existing write gate and list cannot change settings or history',async()=>{
    await reset();
    for(const root of ['pos','pos-dev']){
      await denied(clients.cashier.request(root+'/config/printerIP','PUT','192.0.2.2'));
      await clients.cashier.request('','PATCH',patchFor(root,{'config/printerIP':'192.0.2.2'}));
      for(const path of ['config/printerIP','menus/test','casts/test','tables/test','castLifecycleLogs/test','history/test','loMode','_settingsRevisions/menus','_settingsWriteMeta/menus','_banaiOperations/test','_tableChangeOperations/test']){
        await denied(clients.list.request('','PATCH',patchFor(root,{[path]:true})));
      }
      await denied(clients.list.request('','PATCH',patchFor(root,{'config/printerIP':'192.0.2.3','shifts/s1':null})));
      assert.ok(await admin.request(root+'/shifts/s1','GET',undefined,true),'mixed forbidden updates remain atomic');
      assert.equal(await admin.request(root+'/config/printerIP','GET',undefined,true),'192.0.2.2');
    }
  });

  await t.test('cashier checkout and list assignment, attendance and preparation completion succeed with existing atomic validation',async()=>{
    const original=await reset();
    const cashier=contextFor(clients.cashier.db(),original);
    await cashier.guardedCloseSession('t1',clone(original.sessions.t1),{id:123,tableId:'t1',startTime:100,endTime:500,total:6000});
    const closed=await admin.request('pos-dev','GET',undefined,true);
    assert.equal(closed.sessions,undefined);assert.equal(closed.history['123'].total,6000);
    assert.equal(closed.shifts.s1.status,'waiting');assert.ok(closed.tablePreparations.t1);
    const listing=contextFor(clients.list.db(),closed);
    await listing.guardedCompleteTablePreparation('t1',closed.tablePreparations.t1);
    assert.equal(await admin.request('pos-dev/tablePreparations/t1','GET',undefined,true),null);
    const current=await reset();
    const editor=contextFor(clients.list.db(),current);
    await editor.guardedCheckedNodeUpdate({'pos-dev/assignments/a1':{...current.assignments.a1,type:'hon'}},null,{expectedRecords:{'assignments/a1':clone(current.assignments.a1)}});
    assert.equal((await admin.request('pos-dev/assignments/a1','GET',undefined,true)).type,'hon');
    await editor.guardedCheckedNodeUpdate({'pos-dev/shifts/s1':{...current.shifts.s1,status:'waiting'}},null,{expectedRecords:{'shifts/s1':clone(current.shifts.s1)}});
    assert.equal((await admin.request('pos-dev/shifts/s1','GET',undefined,true)).status,'waiting');
    const fresh=await admin.request('pos-dev','GET',undefined,true);
    const blocked=contextFor(clients.list.db(),fresh);
    await assert.rejects(blocked.guardedCloseSession('t1',fresh.sessions.t1,{id:124,tableId:'t1',startTime:100,endTime:500,total:6000}));
    assert.ok(await admin.request('pos-dev/sessions/t1','GET',undefined,true));
  });

  await t.test('missing gate and stale concurrency proofs stay denied for permitted staff operations',async()=>{
    const initial=await reset();
    const altered={...initial.assignments.a1,type:'hon',_rev:8,_nodeWriteVersion:615200,_nodeWriteNonce:'stale'};
    await denied(clients.list.request('pos-dev/assignments/a1','PUT',altered));
    const raceDb=clients.list.db(async()=>{
      await admin.request('pos-dev/assignments/a1','PUT',{...initial.assignments.a1,_rev:8,_nodeWriteNonce:'racing'},true);
    });
    const stale=contextFor(raceDb,initial);
    await assert.rejects(stale.guardedCheckedNodeUpdate({'pos-dev/assignments/a1':{...initial.assignments.a1,type:'hon'}},null,{expectedRecords:{'assignments/a1':clone(initial.assignments.a1)}}));
    assert.equal((await admin.request('pos-dev/assignments/a1','GET',undefined,true)).type,'free');
    await reset();
  });

  await t.test('only OP can assign other users, strict values and self-lockout protection apply to multi-path writes',async()=>{
    await reset();
    for(const role of ['cashier','list','missing','unknown','disabled']){
      await denied(clients[role].request('access/roles/'+role,'PUT','op'));
      await denied(clients[role].request('access/authorizedUsers/other','PUT',true));
      await denied(clients[role].request('','PATCH',{['access/roles/'+role]:'op'}));
    }
    for(const value of ['cashier',null])await denied(clients.op.request('access/roles/op','PUT',value));
    for(const value of [false,null])await denied(clients.op.request('access/authorizedUsers/op','PUT',value));
    await denied(clients.op.request('access','PUT',access));
    await denied(clients.op.request('','PATCH',{'access/roles/op':'list','access/roles/new':'op'}));
    await denied(clients.op.request('access/roles/other','PUT','owner'));
    await denied(clients.op.request('access/authorizedUsers/other','PUT','true'));
    await clients.op.request('','PATCH',{'access/roles/new':'cashier','access/authorizedUsers/new':true});
    assert.equal(await clients.op.request('access/roles/new'),'cashier');
    await clients.op.request('access/authorizedUsers/new','PUT',false);
    await clients.op.request('access/roles/new','DELETE');
    const remaining=await clients.op.request('access');
    assert.equal(remaining.roles.op,'op');assert.equal(remaining.authorizedUsers.op,true);
  });
});
