const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {loadDays}=require('../analysis-data');

const local=(date,time='19:00:00')=>new Date(date+'T'+time).getTime();
const snapshot=value=>({val:()=>value});
function mockDatabase(){
  const calls=[];
  const db={ref(root){
    const call={root,order:null,start:null,end:null,event:null};
    const query={
      orderByKey(){call.order='key';return this;},
      startAt(value){call.start=value;return this;},
      endAt(value){call.end=value;return this;},
      once(event){
        call.event=event;calls.push(call);
        return new Promise((resolve,reject)=>{call.resolve=resolve;call.reject=reject;});
      },
      set(){throw new Error('Unexpected write');},
      update(){throw new Error('Unexpected write');}
    };
    return query;
  }};
  return {db,calls};
}

test('selected bounds query business-day keys and keep the end timestamp exclusive',async()=>{
  const {db,calls}=mockDatabase();
  const pending=loadDays({db,root:'pos',from:local('2026-09-01'),to:local('2026-10-01')});
  const call=calls[0];
  assert.equal(call.root,'pos/bizDays');assert.equal(call.order,'key');assert.equal(call.event,'value');
  assert.equal(call.start,'2026-09-01');assert.equal(call.end,'2026-09-30');
  const days=Object.freeze({'2026-09-01':Object.freeze({id:'2026-09-01'})});
  call.resolve(snapshot(days));
  assert.strictEqual(await pending,days,'return the fetched snapshot without cloning or modifying it');
});

test('local 19:00 rollover handles early hours, month boundaries and leap days',async()=>{
  const cases=[
    ['2026-09-02','18:59:59','2026-09-01'],
    ['2026-09-02','19:00:00','2026-09-02'],
    ['2026-01-01','00:00:00','2025-12-31'],
    ['2024-03-01','18:00:00','2024-02-29']
  ];
  for(const [date,time,expected] of cases){
    const {db,calls}=mockDatabase();
    const pending=loadDays({db,root:'pos',from:local(date,time)});
    assert.equal(calls[0].start,expected);assert.equal(calls[0].end,null);
    calls[0].resolve(snapshot(null));assert.deepEqual(await pending,{});
  }
});

test('one-sided and unbounded requests only apply their supplied query bounds',async()=>{
  for(const options of [
    {from:local('2026-09-01'),to:null,start:'2026-09-01',end:null},
    {from:null,to:local('2026-09-01'),start:null,end:'2026-08-31'},
    {from:null,to:local('2026-09-01')+1,start:null,end:'2026-09-01'},
    {start:null,end:null}
  ]){
    const {db,calls}=mockDatabase();
    const pending=loadDays({db,root:'pos',from:options.from,to:options.to});
    assert.equal(calls[0].start,options.start);assert.equal(calls[0].end,options.end);
    calls[0].resolve(snapshot(null));await pending;
  }
});

test('identical concurrent requests share one read but completed requests fetch again',async()=>{
  const {db,calls}=mockDatabase(),options={db,root:'pos',from:local('2026-09-01'),to:local('2026-09-02')};
  const first=loadDays(options),second=loadDays({...options});
  assert.strictEqual(first,second);assert.equal(calls.length,1);
  calls[0].resolve(snapshot({first:true}));assert.deepEqual(await first,{first:true});
  const refreshed=loadDays(options);
  assert.equal(calls.length,2);assert.notStrictEqual(refreshed,first);
  calls[1].resolve(snapshot({latest:true}));assert.deepEqual(await refreshed,{latest:true});
});

test('database identity, root, and exact timestamps isolate pending requests',async()=>{
  const first=mockDatabase(),second=mockDatabase(),from=local('2026-09-01');
  const promises=[
    loadDays({db:first.db,root:'pos',from}),
    loadDays({db:first.db,root:'pos-dev',from}),
    loadDays({db:first.db,root:'pos',from:from+1}),
    loadDays({db:first.db,root:'pos',from,to:local('2026-09-02')}),
    loadDays({db:second.db,root:'pos',from})
  ];
  assert.equal(first.calls.length,4);assert.equal(second.calls.length,1);
  [...first.calls,...second.calls].forEach((call,index)=>call.resolve(snapshot({index})));
  assert.deepEqual(await Promise.all(promises),[{index:0},{index:1},{index:2},{index:3},{index:4}]);
});

test('invalid timestamps, reversed or empty ranges and timeout settings reject before reading',async()=>{
  const {db,calls}=mockDatabase();
  for(const range of [
    {from:NaN},{to:Infinity},{from:'2026-09-01'},{from:1e20},
    {from:2,to:1},{from:1,to:1},{timeoutMs:0},{timeoutMs:-1},{timeoutMs:Infinity},{timeoutMs:'20'}
  ])await assert.rejects(loadDays({db,root:'pos',...range}));
  await assert.rejects(loadDays({db,root:''}));
  await assert.rejects(loadDays({root:'pos'}));
  assert.equal(calls.length,0);
});

test('read failures and malformed snapshots release the request so callers can retry',async()=>{
  const {db,calls}=mockDatabase(),options={db,root:'pos'};
  const failed=loadDays(options),check=assert.rejects(failed,/offline/);
  calls[0].reject(new Error('offline'));await check;
  const malformed=loadDays(options),bad=assert.rejects(malformed,/bad snapshot/);
  calls[1].resolve({val(){throw new Error('bad snapshot');}});await bad;
  const retry=loadDays(options);assert.equal(calls.length,3);
  calls[2].resolve(snapshot({ok:true}));assert.deepEqual(await retry,{ok:true});
});

function timedContext(){
  const timers=new Map();let timerId=0;
  const source=fs.readFileSync(path.join(__dirname,'..','analysis-data.js'),'utf8');
  const state=Object.freeze({bizDays:Object.freeze({existing:true})});
  const context={S:state,updateRemoteHash(){throw new Error('Unexpected hash');},
    setTimeout(callback,ms){const id=++timerId;timers.set(id,{callback,ms});return id;},
    clearTimeout(id){timers.delete(id);}
  };
  vm.createContext(context);vm.runInContext(source,context);
  return {api:context.ANALYSIS_DATA,timers,state,context};
}

test('timeouts allow retry and a late response cannot resolve or clear the newer request',async()=>{
  const {api,timers,state,context}=timedContext(),{db,calls}=mockDatabase();
  const options={db,root:'pos',timeoutMs:25};
  const first=api.loadDays(options),check=assert.rejects(first,error=>error.code==='analysis/timeout');
  assert.equal(timers.size,1);assert.equal([...timers.values()][0].ms,25);
  [...timers.values()][0].callback();await check;assert.equal(timers.size,0);
  const retry=api.loadDays(options);
  assert.equal(calls.length,2);assert.equal(timers.size,1);
  calls[0].resolve({val(){throw new Error('Timed-out snapshots must not be consumed');}});
  await Promise.resolve();await Promise.resolve();
  assert.strictEqual(api.loadDays(options),retry);assert.equal(calls.length,2);assert.equal(timers.size,1);
  const days=Object.freeze({latest:Object.freeze({history:Object.freeze([])})});
  calls[1].resolve(snapshot(days));assert.strictEqual(await retry,days);
  assert.equal(timers.size,0);assert.strictEqual(context.S,state);assert.equal(state.bizDays.existing,true);
});

test('success and failure clear the default timer without retaining completed data',async()=>{
  const {api,timers}=timedContext(),{db,calls}=mockDatabase();
  const first=api.loadDays({db,root:'pos'});
  assert.equal([...timers.values()][0].ms,20000);
  calls[0].resolve(snapshot({ok:true}));await first;assert.equal(timers.size,0);
  const next=api.loadDays({db,root:'pos'}),check=assert.rejects(next,/offline/);
  calls[1].reject(new Error('offline'));await check;assert.equal(timers.size,0);
  const broken={ref(){throw new Error('bad query');}};
  await assert.rejects(api.loadDays({db:broken,root:'pos'}),/bad query/);
  assert.equal(timers.size,0);
});
