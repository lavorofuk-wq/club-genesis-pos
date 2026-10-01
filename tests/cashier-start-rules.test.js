const {test}=require('node:test');
const assert=require('node:assert/strict');
const {clone,fixture,emulator}=require('./helpers/scoped-runtime.cjs');
const rules=require('../database.rules.json');

test('cashier business-day access is limited to metadata reads and guarded child writes',()=>{
  for(const root of ['pos','pos-dev']){
    const node=rules.rules[root];
    assert.doesNotMatch(node['.read'],/== 'cashier'/);
    assert.doesNotMatch(node['.write'],/== 'cashier'/);
    assert.equal(node.bizDays['.read'],undefined);
    assert.equal(node.bizDays.$dayId['.read'],undefined);
    assert.match(node.bizDays.$dayId.id['.read'],/== 'cashier'/);
    assert.match(node._bizDayRevisions.$id['.read'],/== 'cashier'/);
    for(const branch of [node.activeBizDay,node._bizDayOperation,node.bizDays.$dayId,node.bizDaySummaries.$id,node._bizDayRevisions.$id]){
      assert.match(branch['.write'],/== 'cashier'/);
      assert.match(branch['.write'],/child\('type'\).val\(\) == 'start'/);
    }
  }
});

test('Firebase permits cashier new-day start without expanding lifecycle or historical-data permissions',{skip:process.env.POS_RULES_EMULATOR!=='1'},async t=>{
  const clients={};
  for(const role of ['op','cashier','cashier2','list','missing','disabled'])clients[role]=await emulator('demo-pos-cashier-start',role);
  const access={authorizedUsers:{op:true,cashier:true,cashier2:true,list:true,missing:true,disabled:false},roles:{op:'op',cashier:'cashier',cashier2:'cashier',list:'list',disabled:'cashier'}};
  const admin=clients.op;
  const denied=promise=>assert.rejects(promise,error=>error.code==='PERMISSION_DENIED');
  const dayId='2026-10-02';
  const previousId='2026-10-01';
  function state(){
    return{...fixture(),activeBizDay:null,sessions:null,history:null,shifts:null,assignments:null,
      bizDays:{[previousId]:{id:previousId,date:previousId,startedAt:100,endedAt:200,history:[{total:90000}],_rev:4}},
      bizDaySummaries:{[previousId]:{id:previousId,date:previousId,startedAt:100,endedAt:200,sales:90000,_dayRev:4}},
      _bizDayRevisions:{[previousId]:4},_bizDayOperation:{nonce:'previous-operation'}};
  }
  async function reset(next=state()){
    await admin.request('','PUT',{access:clone(access),pos:clone(next),'pos-dev':clone(next)},true);
    return next;
  }
  function start(root='pos-dev',id=dayId,counter=0){
    const timestamp=Date.now();
    const nonce='start-'+timestamp+'-'+Math.random();
    return{
      [root+'/activeBizDay']:id,
      [root+'/bizDays/'+id]:{id,date:id,startedAt:timestamp,_rev:counter+1},
      [root+'/bizDaySummaries/'+id]:{id,date:id,startedAt:timestamp,sales:0,updatedAt:timestamp,_dayRev:counter+1},
      [root+'/_bizDayRevisions/'+id]:counter+1,
      [root+'/_bizDayOperation']:{version:614400,nonce,type:'start',dayId:id,nextActiveBizDay:id,updatedAt:timestamp,expectedDayExists:false,expectedDayRev:0,expectedDayCounter:counter},
      [root+'/history']:null,[root+'/shifts']:null,[root+'/assignments']:null,[root+'/sessions']:null,
      [root+'/_writeGate']:{versionNum:614400,nonce}
    };
  }

  await t.test('cashier can only read day ID and exact revision, never full day, history, summary or root',async()=>{
    await reset();
    for(const root of ['pos','pos-dev']){
      assert.equal(await clients.cashier.request(root+'/bizDays/'+previousId+'/id'),previousId);
      assert.equal(await clients.cashier.request(root+'/bizDays/'+dayId+'/id'),null);
      assert.equal(await clients.cashier.request(root+'/_bizDayRevisions/'+previousId),4);
      assert.equal(await clients.cashier.request(root+'/_bizDayRevisions/'+dayId),null);
      for(const path of ['', 'bizDays','bizDays/'+previousId,'bizDays/'+previousId+'/history','bizDays/'+previousId+'/endedAt','bizDaySummaries/'+previousId,'_bizDayRevisions','_bizDayOperation']){
        await denied(clients.cashier.request(path?root+'/'+path:root));
      }
      for(const role of ['list','missing','disabled']){
        await denied(clients[role].request(root+'/bizDays/'+previousId+'/id'));
        await denied(clients[role].request(root+'/_bizDayRevisions/'+previousId));
      }
    }
  });

  await t.test('one atomic cashier start succeeds on both environments; list and unauthorized accounts cannot start',async()=>{
    for(const root of ['pos','pos-dev']){
      await reset();
      for(const role of ['list','missing','disabled'])await denied(clients[role].request('','PATCH',start(root)));
      await clients.cashier.request('','PATCH',start(root));
      const value=await admin.request(root,'GET',undefined,true);
      assert.equal(value.activeBizDay,dayId);
      assert.equal(value.bizDays[dayId].id,dayId);
      assert.equal(value.bizDays[dayId]._rev,1);
      assert.equal(value.bizDaySummaries[dayId].sales,0);
      assert.equal(value.bizDays[previousId].history[0].total,90000);
      assert.equal(value._bizDayOperation.type,'start');
      await denied(clients.cashier.request(root+'/activeBizDay','DELETE'));
      await denied(clients.cashier.request('','PATCH',start(root,'2026-10-03')));
    }
  });

  await t.test('cashier start cannot overwrite existing or legacy business days and orphan summaries',async()=>{
    const original=await reset();
    await denied(clients.cashier.request('','PATCH',start('pos-dev',previousId,4)));
    const legacy=state();legacy.bizDays[dayId]={history:[{total:77}]};
    await reset(legacy);
    await denied(clients.cashier.request('','PATCH',start()));
    const orphan=state();orphan.bizDaySummaries[dayId]={sales:77};
    await reset(orphan);
    await denied(clients.cashier.request('','PATCH',start()));
    assert.deepEqual((await admin.request('pos-dev','GET',undefined,true)).bizDays[previousId],original.bizDays[previousId]);
  });

  await t.test('malformed, incomplete, reopened, nonempty and unexpected-field payloads are denied atomically',async()=>{
    const root='pos-dev';
    const op=root+'/_bizDayOperation',day=root+'/bizDays/'+dayId,summary=root+'/bizDaySummaries/'+dayId;
    const mutations=[
      p=>{delete p[root+'/_writeGate'];},
      p=>{delete p[op];},
      p=>{delete p[day];},
      p=>{delete p[summary];},
      p=>{delete p[root+'/_bizDayRevisions/'+dayId];},
      p=>{p[op].type='reopen';},
      p=>{p[op].type='end';},
      p=>{p[op].nonce='previous-operation';},
      p=>{p[op].dayId='invalid-date';},
      p=>{p[op].expectedDayExists=true;},
      p=>{p[op].expectedDayRev=99;},
      p=>{p[op].expectedDayCounter=99;},
      p=>{p[op].expectedActiveBizDay='2026-09-30';},
      p=>{p[op].nextActiveBizDay=previousId;},
      p=>{p[op].backupKey='forged';},
      p=>{p[day].id=previousId;},
      p=>{p[day].date=previousId;},
      p=>{p[day]._rev=99;},
      p=>{p[day].startedAt='invalid';},
      p=>{p[day].endedAt=Date.now();},
      p=>{p[day].isReEdit=true;},
      p=>{p[day].history=[{total:100}];},
      p=>{p[day].shifts={fake:{castId:'c1'}};},
      p=>{p[day].assignments={fake:{castId:'c1'}};},
      p=>{p[day].rosterSnapshot={cast:'forged'};},
      p=>{p[summary].sales=100;},
      p=>{p[summary].date=previousId;},
      p=>{p[summary].startedAt=1;},
      p=>{p[summary]._dayRev=99;},
      p=>{p[summary].endedAt=Date.now();},
      p=>{p[summary].unexpected=true;},
      p=>{p[root+'/history']={forged:{total:1}};},
      p=>{p[root+'/sessions']={t1:{tableId:'t1'}};},
      p=>{p[root+'/shifts']={s1:{castId:'c1'}};},
      p=>{p[root+'/assignments']={a1:{castId:'c1'}};},
      p=>{p[root+'/activeBizDay']=previousId;}
    ];
    for(const [index,mutate] of mutations.entries()){
      await reset();
      const payload=start();mutate(payload);
      await assert.rejects(clients.cashier.request('','PATCH',payload),error=>error.code==='PERMISSION_DENIED','mutation '+index);
      assert.equal(await admin.request(root+'/activeBizDay','GET',undefined,true),null,'mutation '+index+' remains atomic');
      assert.equal(await admin.request(day,'GET',undefined,true),null,'mutation '+index+' leaves no partial day');
    }
  });

  await t.test('new start cannot smuggle a second day, delete old data or modify unrelated lifecycle metadata',async()=>{
    const forbidden={
      ['pos-dev/bizDays/2026-10-03']:{id:'2026-10-03',date:'2026-10-03',startedAt:1,_rev:1},
      ['pos-dev/bizDays/'+previousId]:null,
      ['pos-dev/bizDays/'+previousId+'/endedAt']:null,
      ['pos-dev/bizDaySummaries/'+previousId+'/sales']:0,
      ['pos-dev/_bizDayRevisions/'+previousId]:5,
      ['pos-dev/_capabilities/bizDayAtomicValidationVersion']:999999,
      ['pos-dev/gmsExportMeta/forged']:{id:'forged'},
      ['backup-dev/bizDays/'+previousId]:{date:previousId}
    };
    for(const [path,value] of Object.entries(forbidden)){
      await reset();
      await denied(clients.cashier.request('','PATCH',{...start(),[path]:value}));
      assert.equal(await admin.request('pos-dev/activeBizDay','GET',undefined,true),null);
    }
  });

  await t.test('concurrent cashier starts allow exactly one winner and cannot reuse old start proof to end',async()=>{
    await reset();
    const first=start(),second=start('pos-dev','2026-10-03');
    const results=await Promise.allSettled([clients.cashier.request('','PATCH',first),clients.cashier2.request('','PATCH',second)]);
    assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
    assert.equal(results.filter(result=>result.status==='rejected'&&result.reason.code==='PERMISSION_DENIED').length,1);
    const current=await admin.request('pos-dev','GET',undefined,true);
    assert.equal(Object.keys(current.bizDays).length,2);
    assert.ok([dayId,'2026-10-03'].includes(current.activeBizDay));
    const endPayload=start('pos-dev',current.activeBizDay);
    endPayload['pos-dev/activeBizDay']=null;
    endPayload['pos-dev/_bizDayOperation']={...current._bizDayOperation,type:'end',nextActiveBizDay:null};
    endPayload['pos-dev/bizDays/'+current.activeBizDay]={...current.bizDays[current.activeBizDay],endedAt:Date.now()};
    await denied(clients.cashier.request('','PATCH',endPayload));
    assert.equal(await admin.request('pos-dev/activeBizDay','GET',undefined,true),current.activeBizDay);
  });

  await t.test('counter changes between read and write reject stale start, while a fresh counter is accepted',async()=>{
    await reset();
    await admin.request('pos-dev/_bizDayRevisions/'+dayId,'PUT',4,true);
    await denied(clients.cashier.request('','PATCH',start()));
    await clients.cashier.request('','PATCH',start('pos-dev',dayId,4));
    assert.equal(await admin.request('pos-dev/bizDays/'+dayId+'/_rev','GET',undefined,true),5);
  });

  await t.test('OP retains historical edit and extension fields without gaining a new cashier shortcut',async()=>{
    await reset();
    const payload={
      ['pos-dev/bizDays/'+previousId+'/customMetadata']:{preserved:true},
      ['pos-dev/bizDays/'+previousId+'/history/0/total']:12345,
      'pos-dev/_writeGate':{versionNum:614400,nonce:'op-history-edit'}
    };
    await clients.op.request('','PATCH',payload);
    const value=await admin.request('pos-dev/bizDays/'+previousId,'GET',undefined,true);
    assert.equal(value.history[0].total,12345);
    assert.deepEqual(value.customMetadata,{preserved:true});
  });
});
