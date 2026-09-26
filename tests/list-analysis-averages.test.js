const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildReport,buildCastAverages}=require('../list-analysis-core');
const BASE=Date.parse('2026-09-24T19:00:00+09:00'),MIN=60000,DAY=24*60;
const at=minute=>BASE+minute*MIN;
const seat=(id,castId,type,start,duration,session=start)=>({id,castId,tableId:'T1',sessionId:at(session),type,
  startTime:at(start),endTime:at(start+duration),typeHistory:[{type,startTime:at(start)}]});
function timeDay(date,offset,castIds){
  const durations={a:{hon:30,banai:20,free:10},b:{hon:60,banai:40,free:20}};
  return {id:date,date,endedAt:at(offset+300),
    shifts:castIds.map(castId=>({id:'shift-'+castId,castId,clockIn:at(offset),clockOut:at(offset+240)})),
    assignments:castIds.flatMap(castId=>Object.entries(durations[castId]||{}).map(([type,minutes],index)=>seat(castId+'-'+type,castId,type,offset+index*70,minutes))),history:[]};
}
function ratioDay(){
  const nominations=castId=>({isBanaiShimei:true,castId});
  const extension=(id,castId)=>({id,isBanaiExtension:true,chargeRole:'extension',banaiExtCastIds:[castId]});
  const assignments=[],history=[];
  for(const [castId,freeVisits,banaiVisits] of [['a',1,1],['b',4,1],['c',1,0]]){
    for(let i=0;i<freeVisits;i++){
      const start=10+(castId.charCodeAt(0)-97)*60+i*10;
      assignments.push(seat(castId+'-free-'+i,castId,'free',start,6));
      if(i<banaiVisits)assignments.push(seat(castId+'-banai-'+i,castId,'banai',start+6,3,start));
      history.push({id:castId+'-'+i,tableId:'T1',startTime:at(start),endTime:at(start+10),items:[nominations(castId),...(i===0&&castId!=='c'?[extension(castId+'-ext',castId)]:[])]});
    }
  }
  return {id:'2026-09-24',endedAt:at(300),assignments,history};
}

test('all-cast time averages give each cast equal weight despite different attendance and visit counts',()=>{
  const days=[timeDay('2026-09-24',0,['a','b']),timeDay('2026-09-25',DAY,['b'])],before=JSON.stringify(days);
  const result=buildCastAverages({days,castIds:['a','b']});
  assert.equal(result.castCount,2);
  assert.deepEqual(result.metrics.honDailyMs,{value:45*MIN,count:2});
  assert.deepEqual(result.metrics.banaiDailyMs,{value:30*MIN,count:2});
  assert.deepEqual(result.metrics.freeDailyMs,{value:15*MIN,count:2});
  assert.deepEqual(result.metrics.freeVisitMs,{value:15*MIN,count:2});
  assert.equal(JSON.stringify(days),before);
});

test('all-cast rates average individual percentages instead of dividing pooled totals',()=>{
  const days=[ratioDay()];
  const a=buildReport({days,castId:'a'}),b=buildReport({days,castId:'b'});
  assert.equal(a.banaiRate,100);assert.equal(b.banaiRate,25);
  assert.equal(a.extensionRate,100);assert.equal(b.extensionRate,25);
  const result=buildCastAverages({days,castIds:['a','b']});
  assert.deepEqual(result.metrics.banaiRate,{value:62.5,count:2});
  assert.deepEqual(result.metrics.extensionRate,{value:62.5,count:2});
});

test('null is excluded per metric while zero minutes and zero percent are valid samples',()=>{
  const days=[timeDay('2026-09-24',0,['a','b','idle'])];
  const result=buildCastAverages({days,castIds:['a','b','idle','no-data']});
  assert.equal(result.castCount,4);
  assert.deepEqual(result.metrics.honDailyMs,{value:30*MIN,count:3});
  assert.deepEqual(result.metrics.freeDailyMs,{value:10*MIN,count:3});
  assert.deepEqual(result.metrics.freeVisitMs,{value:15*MIN,count:2});
  assert.deepEqual(result.metrics.extensionRate,{value:null,count:0});
  const ratios=buildCastAverages({days:[ratioDay()],castIds:['a','b','c','no-data']});
  assert.equal(ratios.metrics.banaiRate.count,3);assert.ok(Math.abs(ratios.metrics.banaiRate.value-125/3)<1e-10);
  assert.equal(ratios.metrics.extensionRate.count,3);assert.ok(Math.abs(ratios.metrics.extensionRate.value-125/3)<1e-10);
});

test('averages use unrounded values, normalized unique cast IDs, selected bounds and completed days',()=>{
  const day={id:'2026-09-24',endedAt:at(300),assignments:[
    seat('fraction-a',7,'free',10,10+29/60),seat('fraction-b','8','free',30,10+59/60)
  ]};
  const options={days:[day,{...day,id:'open',endedAt:null}],castIds:[7,'7','8',null,''],from:at(0),to:at(100)};
  const result=buildCastAverages(options);
  assert.equal(result.castCount,2);
  assert.deepEqual(result.metrics.freeVisitMs,{value:10*MIN+44000,count:2});
  const subset=buildCastAverages({...options,from:at(25)});
  assert.deepEqual(subset.metrics.freeVisitMs,{value:10*MIN+59000,count:1});
  for(const metric of Object.values(buildCastAverages({...options,to:at(0)}).metrics))assert.deepEqual(metric,{value:null,count:0});
});

test('averaging does not deduplicate different casts sharing a table and needs no sales allocation',()=>{
  const day={id:'2026-09-24',endedAt:at(300),assignments:[seat('a','a','free',10,10),seat('b','b','free',10,20)],history:[]};
  const result=buildCastAverages({days:[day],castIds:['a','b'],extensionSales:()=>{throw new Error('unexpected sales calculation');}});
  assert.deepEqual(result.metrics.freeVisitMs,{value:15*MIN,count:2});
  const empty=buildCastAverages();assert.equal(empty.castCount,0);
  for(const metric of Object.values(empty.metrics))assert.deepEqual(metric,{value:null,count:0});
});
