const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildReport}=require('../list-analysis-core');

const BASE=Date.parse('2026-09-24T19:00:00+09:00'),MINUTE=60000,HOUR=60*MINUTE;
const at=hours=>BASE+hours*HOUR;
function assignment(id,type,start,end,extras={}){
  return {id,castId:'a',tableId:'T1',sessionId:at(1),type,startTime:at(start),endTime:at(end),
    typeHistory:[{type,startTime:at(start)}],...extras};
}
function shift(start=0,end=8,extras={}){
  return {id:'shift-a',castId:'a',clockIn:at(start),clockOut:at(end),
    statusLog:[{status:'waiting',startTime:at(start),endTime:at(end)}],...extras};
}
function day(extras={}){
  return {id:'2026-09-24',date:'2026-09-24',startedAt:at(0),endedAt:at(8),shifts:[shift()],assignments:[],history:[],...extras};
}
function report(days,extras={}){return buildReport({days,castId:'a',from:at(0),to:at(72),...extras});}
function extension(id,extras={}){
  return {id,groupId:id,chargeRole:'extension',isExtension:true,isBanaiExtension:true,banaiExtCastIds:['a'],price:4000,qty:3,...extras};
}

test('same visit counts once per type, retains return time, and splits free to banai time',()=>{
  const data=day({assignments:[
    assignment('first','banai',1,3,{typeHistory:[{type:'free',startTime:at(1)},{type:'banai',startTime:at(2)}]}),
    assignment('return','banai',4,5),
    assignment('next-visit','hon',6,7,{sessionId:at(6)}),
    assignment('harem','harem',7,8,{tableId:'T2',sessionId:at(7)})
  ]});
  const before=JSON.stringify(data),value=report([data]);
  assert.deepEqual(value.types.banai,{count:1,ms:2*HOUR,averageCount:1,averageMs:2*HOUR});
  assert.equal(value.types.free.count,2);
  assert.equal(value.types.free.ms,2*HOUR);
  assert.equal(value.types.hon.count,1);
  assert.equal(value.waitingMs,3*HOUR);
  assert.equal(value.attendanceDays,1);
  assert.equal(value.legacyTypeAssignments,0);
  assert.equal(JSON.stringify(data),before);
});

test('same-instant free to banai transitions count both types without fabricating free time',()=>{
  const data=day({assignments:[assignment('instant-change','banai',1,2,{typeHistory:[
    {type:'free',startTime:at(1)},{type:'banai',startTime:at(1)}
  ]})]});
  const value=report([data]);
  assert.equal(value.types.free.count,1);
  assert.equal(value.types.free.ms,0);
  assert.equal(value.types.banai.count,1);
  assert.equal(value.types.banai.ms,HOUR);
  assert.equal(report([data],{from:at(1.5)}).types.free.count,0);
  assert.equal(report([data],{to:at(1)}).types.banai.count,0);
  const zero=report([day({assignments:[assignment('instant','free',1,1)]})]);
  assert.equal(zero.types.free.count,1);
  assert.equal(zero.types.free.ms,0);
});

test('multiple shifts count one attendance day and period totals can exceed 24 hours',()=>{
  const days=[0,1,2,3].map(offset=>day({id:'d'+offset,date:'2026-09-'+(24+offset),endedAt:at(offset*24+9),
    shifts:[shift(offset*24,offset*24+4,{id:'a'}),shift(offset*24+5,offset*24+9,{id:'b'})],
    assignments:[assignment('a','hon',offset*24+1,offset*24+3)]
  }));
  const value=report(days,{to:at(100)});
  assert.equal(value.attendanceDays,4);
  assert.equal(value.workMs,32*HOUR);
  assert.equal(value.waitingMs,24*HOUR);
  assert.equal(value.types.hon.count,4);
  assert.equal(value.types.hon.averageCount,1);
  assert.equal(value.types.hon.averageMs,2*HOUR);
});

test('unclosed records in a completed business day stop at attendance, checkout, close and exclusive period bounds',()=>{
  const value=report([day({shifts:[shift(1,7)],assignments:[
    assignment('old-open','free',0,1,{sessionId:null,endTime:null}),
    assignment('open','hon',6,7,{sessionId:at(6),endTime:null})
  ],history:[{id:'h1',tableId:'T1',startTime:at(0),endTime:at(4)}]})],{from:at(2),to:at(7.5)});
  assert.equal(value.workMs,5*HOUR);
  assert.equal(value.types.free.ms,2*HOUR);
  assert.equal(value.types.hon.ms,HOUR);
  assert.equal(value.waitingMs,2*HOUR);
  const closedDay=report([day({endedAt:at(3),shifts:[shift(0,1,{clockOut:null})],
    assignments:[assignment('open','free',2,3,{endTime:null})]})]);
  assert.equal(closedDay.workMs,3*HOUR);
  assert.equal(closedDay.types.free.ms,HOUR);
});

test('business days without a valid closing time contribute no attendance, seating, or sales',()=>{
  const record={id:'r1',tableId:'T1',startTime:at(1),items:[extension('e1')]};
  const incomplete=[null,undefined,'',0,'invalid'].map((endedAt,index)=>day({
    id:'incomplete-'+index,date:'incomplete-'+index,endedAt,
    assignments:[assignment('a1','banai',1,2)],history:[record]
  }));
  let salesCalls=0;
  const value=report([...incomplete,day({assignments:[assignment('a1','banai',1,2)],history:[record]})],{
    extensionSales:()=>{salesCalls++;return 4000;}
  });
  assert.equal(value.days.length,1);
  assert.equal(value.attendanceDays,1);
  assert.equal(value.workMs,8*HOUR);
  assert.equal(value.types.banai.count,1);
  assert.equal(value.extensionTables,1);
  assert.equal(value.extensionCount,1);
  assert.equal(value.extensionSales,4000);
  assert.equal(salesCalls,1);
  const empty=report(incomplete);
  assert.equal(empty.days.length,0);
  assert.equal(empty.extensionRate,null);
});

test('waiting uses only recorded waiting and subtracts help, assignments, and break overlap',()=>{
  const value=report([day({shifts:[shift(0,8,{statusLog:[
    {status:'waiting',startTime:at(0),endTime:null},
    {status:'waiting',startTime:at(1),endTime:at(4)},
    {status:'break',startTime:at(5),endTime:at(7)},
    {status:'active',startTime:at(0),endTime:at(8)}
  ]})],assignments:[assignment('help','help',1,2),assignment('hon','hon',2,4)]})]);
  assert.equal(value.waitingMs,3*HOUR);
  assert.equal(value.types.free.count,0);
  assert.equal(value.types.hon.ms,2*HOUR);
  assert.equal(value.missingWaitingDays,0);
  const missing=report([day({shifts:[shift(0,8,{statusLog:undefined})]})]);
  assert.equal(missing.waitingMs,0);
  assert.equal(missing.missingWaitingDays,1);
});

test('a recorded zero-second waiting period is complete data, while inverted logs remain invalid',()=>{
  const value=report([day({shifts:[shift(0,8,{statusLog:[
    {status:'waiting',startTime:at(0),endTime:at(0)}
  ]})],assignments:[assignment('immediate','free',0,8)]})]);
  assert.equal(value.waitingMs,0);
  assert.equal(value.missingWaitingDays,0);
  const inverted=report([day({shifts:[shift(0,8,{statusLog:[
    {status:'waiting',startTime:at(1),endTime:at(0)}
  ]})]})]);
  assert.equal(inverted.waitingMs,0);
  assert.equal(inverted.missingWaitingDays,1);
});

test('legacy visits are separated by checkout history and same-name different IDs never match',()=>{
  const value=report([day({shifts:[shift(0,8,{castName:'同名'})],assignments:[
    assignment('a1','free',1,2,{sessionId:null,typeHistory:undefined,castName:'同名'}),
    assignment('a2','free',2,3,{sessionId:null,typeHistory:undefined}),
    assignment('a3','free',5,6,{sessionId:null,typeHistory:undefined}),
    assignment('other-cast','hon',6,7,{castId:'b',castName:'同名'})
  ],history:[
    {id:'first',tableId:'T1',startTime:at(1),endTime:at(4)},
    {id:'second',tableId:'T1',startTime:at(5),endTime:at(7)}
  ]})]);
  assert.equal(value.types.free.count,2);
  assert.equal(value.types.free.ms,3*HOUR);
  assert.equal(value.types.hon.count,0);
  assert.equal(value.legacyTypeAssignments,3);
  assert.equal(value.unresolvedVisitAssignments,0);
});

test('different customers using the same table count separately and returning to one visit counts once',()=>{
  const value=report([day({assignments:[
    assignment('first-visit','banai',1,2,{sessionId:at(1)}),
    assignment('first-return','banai',2.5,3,{sessionId:at(1)}),
    assignment('second-visit','banai',5,6,{sessionId:at(5)})
  ]})]);
  assert.equal(value.types.banai.count,2);
  assert.equal(value.types.banai.ms,2.5*HOUR);
  assert.equal(value.unresolvedVisitAssignments,0);
});

test('unidentified visits retain time but do not invent counts, count averages, or a banai extension rate',()=>{
  const value=report([day({assignments:[
    assignment('unknown','banai',1,3,{sessionId:null,typeHistory:[
      {type:'free',startTime:at(1)},{type:'banai',startTime:at(2)}
    ]}),
    assignment('known-free','free',4,5,{tableId:'T2',sessionId:at(4)}),
    assignment('known-banai','banai',5,6,{tableId:'T3',sessionId:at(5)})
  ],history:[{id:'receipt',tableId:'T3',startTime:at(5),endTime:at(7),items:[extension('e1')]}]})]);
  assert.equal(value.unresolvedVisitAssignments,1);
  assert.deepEqual(value.unresolvedVisitTypes,['banai','free']);
  assert.equal(value.days[0].unresolvedVisitAssignments,1);
  assert.deepEqual(value.days[0].unresolvedVisitTypes,['banai','free']);
  assert.equal(value.types.free.count,1);
  assert.equal(value.types.banai.count,1);
  assert.equal(value.types.free.ms,2*HOUR);
  assert.equal(value.types.banai.ms,2*HOUR);
  assert.equal(value.types.free.averageCount,null);
  assert.equal(value.days[0].types.free.averageCount,null);
  assert.equal(value.types.banai.averageCount,null);
  assert.equal(value.types.free.averageMs,2*HOUR);
  assert.equal(value.types.hon.averageCount,0);
  assert.equal(value.extensionTables,1);
  assert.equal(value.extensionRate,null);
});

test('ambiguous checkout history does not guess the closest visit',()=>{
  const value=report([day({assignments:[assignment('unknown','free',1,2,{sessionId:null})],history:[
    {id:'one',tableId:'T1',startTime:at(0),endTime:at(3)},
    {id:'two',tableId:'T1',startTime:at(0.5),endTime:at(4)}
  ]})]);
  assert.equal(value.types.free.count,0);
  assert.equal(value.types.free.ms,HOUR);
  assert.equal(value.unresolvedVisitAssignments,1);
  assert.deepEqual(value.unresolvedVisitTypes,['free']);
  assert.equal(value.types.free.averageCount,null);
});

test('a receipt without an end boundary cannot establish a legacy visit by time alone',()=>{
  const value=report([day({assignments:[assignment('unknown','free',5,6,{sessionId:null})],history:[
    {id:'earlier',tableId:'T1',startTime:at(1),endTime:null}
  ]})]);
  assert.equal(value.types.free.count,0);
  assert.equal(value.types.free.ms,HOUR);
  assert.equal(value.unresolvedVisitAssignments,1);
});

test('unidentified visits without shifts still retain daily time and do not collapse into a table count',()=>{
  const value=report([day({shifts:[],assignments:[
    assignment('unknown-1','hon',1,2,{sessionId:null}),
    assignment('unknown-2','hon',3,4,{sessionId:null})
  ]})]);
  assert.equal(value.days.length,1);
  assert.equal(value.attendanceDays,0);
  assert.equal(value.types.hon.count,0);
  assert.equal(value.types.hon.ms,2*HOUR);
  assert.equal(value.unresolvedVisitAssignments,2);
  assert.deepEqual(value.unresolvedVisitTypes,['hon']);
  assert.equal(value.types.hon.averageCount,null);
  assert.equal(value.types.hon.averageMs,null);
});

test('stable session aliases deduplicate assignments after entry time corrections',()=>{
  const value=report([day({assignments:[
    assignment('old','banai',2,3,{sessionId:String(at(1))}),
    assignment('new','banai',4,5,{sessionId:at(0.5)})
  ],history:[{id:'receipt',tableId:'T1',sessionId:'ses_'+at(1)+'_abc123',startTime:at(0.5),endTime:at(6)}]})]);
  assert.equal(value.types.banai.count,1);
  assert.equal(value.types.banai.ms,2*HOUR);
});

test('extension counts operations, excludes SC and room fees, and uses shared sales calculation',()=>{
  const records=[{id:'receipt',tableId:'T1',startTime:at(1),endTime:at(7),items:[
    extension('e1'),extension('e1'),
    extension('sc1',{groupId:'e1',chargeRole:'single'}),
    extension('room1',{groupId:'e1',chargeRole:'room'}),extension('e2',{banaiExtCastIds:['a','b']}),
    extension('e3',{chargeRole:undefined,groupId:undefined,banaiExtCastIds:undefined,banaiExtCastId:'a'}),
    extension('sc_old',{chargeRole:undefined,groupId:undefined,label:'シングルチャージ（延長）'}),
    extension('room_old',{chargeRole:undefined,groupId:undefined,isVipCharge:true}),
    extension('other',{banaiExtCastIds:['b']})
  ]}];
  const calls=[];
  const value=report([day({history:records,assignments:[assignment('a','banai',1,2)]})],{
    extensionSales:(record,cid)=>{calls.push([record.id,cid]);return 12345;}
  });
  assert.equal(value.extensionCount,3);
  assert.equal(value.extensionTables,1);
  assert.equal(value.extensionSales,12345);
  assert.equal(value.extensionRate,100,'three extensions at one banai table still count as one extended table');
  assert.deepEqual(calls,[['receipt','a']]);
});

test('one extended table out of two banai tables has a 50 percent extension rate',()=>{
  const value=report([day({assignments:[
    assignment('first','banai',1,2),
    assignment('second','banai',3,4,{tableId:'T2',sessionId:at(3)})
  ],history:[{id:'receipt',tableId:'T1',startTime:at(1),items:[extension('e1'),extension('e2')]}]})]);
  assert.equal(value.types.banai.count,2);
  assert.equal(value.extensionCount,2);
  assert.equal(value.extensionTables,1);
  assert.equal(value.extensionRate,50);
});

test('extension records exclude hon tables and out-of-period visit starts',()=>{
  const value=report([day({history:[
    {id:'hon-other',tableId:'T1',startTime:at(1),items:[{isHonShimei:true,castId:'b'},extension('e1')]},
    {id:'too-early',tableId:'T2',startTime:at(-1),items:[extension('e2')]},
    {id:'end-bound',tableId:'T3',startTime:at(72),items:[extension('e3')]}
  ]})],{extensionSales:()=>9999});
  assert.equal(value.extensionCount,0);
  assert.equal(value.extensionSales,0);
  assert.equal(value.extensionRate,null);
});

test('ordinary extension rows never become banai extensions merely through a matching cast ID',()=>{
  let calls=0;
  const value=report([day({history:[{id:'ordinary',tableId:'T1',startTime:at(1),items:[
    {id:'modern',chargeRole:'extension',isExtension:true,castId:'a'},
    {id:'legacy',isExtension:true,castId:'a'},
    {id:'incomplete',chargeRole:'extension',banaiExtCastIds:['a']}
  ]}]})],{extensionSales:()=>{calls++;return 9999;}});
  assert.equal(value.extensionCount,0);
  assert.equal(value.extensionTables,0);
  assert.equal(value.extensionSales,0);
  assert.equal(calls,0);
});

test('manual assignment time edits clip historical types without moving recorded transitions',()=>{
  const typeHistory=[{type:'free',startTime:at(1)},{type:'banai',startTime:at(2)},{type:'hon',startTime:at(4)}];
  const data=day({assignments:[assignment('edited','hon',2.5,3.5,{typeHistory})]});
  const before=JSON.stringify(data),value=report([data]);
  assert.equal(value.types.free.count,0);
  assert.equal(value.types.banai.count,1);
  assert.equal(value.types.banai.ms,HOUR);
  assert.equal(value.types.hon.count,0);
  assert.equal(JSON.stringify(data),before);
});

test('duplicate extension snapshots and repeated same-time type events do not inflate totals',()=>{
  const record={id:'duplicate',sessionId:'session-1',tableId:'T1',startTime:at(1),items:[extension('e1')]};
  let calls=0;
  const value=report([day({history:[record,record],assignments:[
    assignment('repeat','banai',1,2,{typeHistory:[
      {type:'free',startTime:at(1)},{type:'free',startTime:at(1)},
      {type:'banai',startTime:at(1)},{type:'banai',startTime:at(1)}
    ]})
  ]})],{extensionSales:()=>{calls++;return 4000;}});
  assert.equal(value.extensionCount,1);
  assert.equal(value.extensionTables,1);
  assert.equal(value.extensionSales,4000);
  assert.equal(calls,1);
  assert.equal(value.types.free.count,1);
  assert.equal(value.types.free.ms,0);
  assert.equal(value.types.banai.count,1);
  assert.equal(value.types.banai.ms,HOUR);
});

test('missing shifts preserve known assignment time without inventing attendance or averages',()=>{
  const value=report([day({shifts:[],assignments:[assignment('a','free',1,2)]})]);
  assert.equal(value.types.free.ms,HOUR);
  assert.equal(value.attendanceDays,0);
  assert.equal(value.types.free.averageCount,null);
  assert.equal(value.types.free.averageMs,null);
  assert.equal(value.waitingMs,0);
  assert.equal(value.missingWaitingDays,1);
});

test('duplicate snapshots, overlapping intervals, Firebase object collections and invalid rows are safe',()=>{
  const data=day({shifts:{one:shift(),copy:shift(0,8,{id:'copy'}),invalid:{castId:'a',clockIn:'bad'}},
    assignments:{one:assignment('a','free',1,3),copy:assignment('copy','free',2,4),invalid:{castId:'a',startTime:'bad'},empty:null}});
  const before=JSON.stringify(data),value=report([data,data]);
  assert.equal(value.attendanceDays,1);
  assert.equal(value.workMs,8*HOUR);
  assert.equal(value.types.free.count,1);
  assert.equal(value.types.free.ms,3*HOUR);
  assert.equal(value.waitingMs,5*HOUR);
  assert.equal(JSON.stringify(data),before);
  assert.equal(report([data],{from:at(9),to:at(1)}).days.length,0);
  assert.equal(buildReport().days.length,0);
});
