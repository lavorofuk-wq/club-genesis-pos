(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LIST_ANALYSIS=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const TYPES=['hon','banai','free'];
  const rows=value=>Object.values(value||{}).filter(row=>row&&typeof row==='object');
  const identity=value=>value==null?'':String(value);
  const timestamp=value=>value!=null&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
  const assignmentType=value=>value==='harem'?'free':(['hon','banai','free','help'].includes(value)?value:null);
  const emptyTypes=()=>Object.fromEntries(TYPES.map(type=>[type,{count:0,ms:0,averageCount:null,averageMs:null}]));
  const emptyFreeAverage=()=>({count:0,ms:0,averageMs:null});
  const range=(start,end,from,to)=>start!=null&&end!=null&&Math.min(end,to)>Math.max(start,from)?[Math.max(start,from),Math.min(end,to)]:null;

  function merge(intervals){
    const result=[];
    intervals.filter(Boolean).map(value=>value.slice()).sort((a,b)=>a[0]-b[0]||a[1]-b[1]).forEach(value=>{
      const last=result[result.length-1];
      if(last&&value[0]<=last[1])last[1]=Math.max(last[1],value[1]);
      else result.push(value);
    });
    return result;
  }
  const duration=intervals=>merge(intervals).reduce((sum,value)=>sum+value[1]-value[0],0);
  function intersect(interval,windows){
    return windows.map(window=>range(interval[0],interval[1],window[0],window[1])).filter(Boolean);
  }
  function subtract(intervals,occupied){
    const blockers=merge(occupied),result=[];
    merge(intervals).forEach(([start,end])=>{
      let cursor=start;
      for(const [left,right] of blockers){
        if(right<=cursor)continue;
        if(left>=end)break;
        if(left>cursor)result.push([cursor,Math.min(left,end)]);
        cursor=Math.max(cursor,right);
        if(cursor>=end)break;
      }
      if(cursor<end)result.push([cursor,end]);
    });
    return result;
  }
  function unique(records,keyFor){
    const map=new Map();
    records.forEach((row,index)=>map.set(keyFor(row,index),row));
    return [...map.values()];
  }
  function recordKey(record,index){
    if(record.sessionId!=null&&record.sessionId!=='')return 'session:'+record.sessionId;
    if(record.tableId!=null&&timestamp(record.startTime)!=null)return JSON.stringify(['visit',record.tableId,Number(record.startTime)]);
    return record.id!=null?'id:'+record.id:'row:'+index;
  }
  function findSession(assignment,history){
    const candidates=history.filter(record=>identity(record.tableId)===identity(assignment.tableId));
    const sessionId=identity(assignment.sessionId);
    if(sessionId){
      const matches=candidates.filter(record=>{
        const original=identity(record.sessionId).match(/^ses_(\d+)_[a-z0-9]+$/i)?.[1];
        return [record.startTime,record.sessionId,original].some(value=>value!=null&&identity(value)===sessionId);
      });
      return matches.length===1?matches[0]:null;
    }
    const start=timestamp(assignment.startTime);
    if(start==null)return null;
    const matches=candidates.filter(record=>{
      const left=timestamp(record.startTime),right=timestamp(record.endTime);
      // Without an explicit visit ID, both visit boundaries are needed to
      // identify a historical visit. A missing checkout is not an open-ended match.
      return left!=null&&right!=null&&right>=left&&start>=left-60000&&start<right;
    });
    return matches.length===1?matches[0]:null;
  }
  function typeSegments(assignment,start,end){
    const events=rows(assignment.typeHistory).map((entry,index)=>({
      type:assignmentType(entry.type),start:timestamp(entry.startTime),index
    })).filter(entry=>entry.type&&entry.start!=null).sort((a,b)=>a.start-b.start||a.index-b.index);
    if(!events.length)return {legacy:true,segments:[{type:assignmentType(assignment.type),interval:[start,end]}]};
    let current=events[0].type,cursor=start;
    const segments=[];
    events.forEach(event=>{
      if(event.start<start){current=event.type;return;}
      if(event.start>end)return;
      // Preserve a zero-length phase when a cast changes type at the same instant.
      // It still represents one seating of each type, without adding elapsed time.
      segments.push({type:current,interval:[cursor,event.start]});
      current=event.type;cursor=event.start;
    });
    if(end>=cursor)segments.push({type:current,interval:[cursor,end]});
    return {legacy:false,segments};
  }
  function extensionTargets(item){
    return [...(Array.isArray(item.banaiExtCastIds)?item.banaiExtCastIds:[]),item.banaiExtCastId,item.castId]
      .filter(value=>value!=null&&value!=='').map(String);
  }
  function isExtensionParent(item){
    // The same isExtension / chargeRole fields are also used for ordinary
    // extensions. Only the explicit banai marker identifies this sales type.
    if(!item.isBanaiExtension||item.isDiscount)return false;
    if(item.chargeRole)return item.chargeRole==='extension';
    const label=identity(item.label),id=identity(item.id);
    if(item.isRoomCharge||item.isVipCharge||item.isKaraokeCharge||item.isRoomExtension||
      /^sc(?:_|$)/i.test(id)||/^room(?:_|$)/i.test(id)||label.includes('シングルチャージ')||label.includes('室料'))return false;
    return true;
  }
  function newDay(date){
    return {date,attendanceDays:0,workMs:0,waitingMs:0,types:emptyTypes(),extensionCount:0,extensionTables:0,extensionSales:0,
      freeAverage:emptyFreeAverage(),
      missingWaitingDays:0,legacyTypeAssignments:0,unresolvedVisitAssignments:0,unresolvedVisitTypes:[],
      _work:[],_waiting:[],_occupied:[],_breaks:[],_typeIntervals:{hon:[],banai:[],free:[]},
      _visits:{hon:new Set(),banai:new Set(),free:new Set()},_extensionEvents:new Set(),_extensionVisits:new Set(),
      _unresolvedTypes:new Set(),_freeVisits:new Map()};
  }

  // Only completed business days participate in this report.
  // Attendance and averages use business dates; transaction sales use visit startTime.
  function buildReport(options={}){
    const result={attendanceDays:0,workMs:0,waitingMs:0,types:emptyTypes(),extensionCount:0,extensionTables:0,extensionSales:0,
      freeAverage:emptyFreeAverage(),
      banaiRate:null,extensionRate:null,days:[],missingWaitingDays:0,legacyTypeAssignments:0,unresolvedVisitAssignments:0,unresolvedVisitTypes:[]};
    const cid=identity(options.castId),from=timestamp(options.from)??-Infinity,to=timestamp(options.to)??Infinity;
    if(!cid||to<=from)return result;
    const daily=new Map();
    const days=unique(rows(options.days),(day,index)=>identity(day.id||day.date)||'row:'+index);
    days.forEach((day,dayIndex)=>{
      const dayEnd=timestamp(day.endedAt);
      if(dayEnd==null||dayEnd<=0)return;
      const dayId=identity(day.id||day.date)||'day:'+dayIndex;
      const date=identity(day.date||day.id)||dayId;
      const row=daily.get(date)||newDay(date);
      const endBound=Math.min(to,dayEnd);
      const history=unique(rows(day.history),recordKey);
      const shifts=unique(rows(day.shifts).filter(shift=>identity(shift.castId)===cid),
        shift=>shift.id!=null?'id:'+shift.id:JSON.stringify([shift.castId,shift.clockIn,shift.clockOut]));
      const work=[];
      let missingWaiting=false;
      shifts.forEach(shift=>{
        const start=timestamp(shift.clockIn),end=timestamp(shift.clockOut)??dayEnd;
        const interval=range(start,end,from,endBound);
        if(!interval)return;
        work.push(interval);row._work.push(interval);
        const logs=rows(shift.statusLog);
        const hasWaitingLog=logs.some(log=>log.status==='waiting'&&timestamp(log.startTime)!=null&&
          (timestamp(log.endTime)??end)>=Number(log.startTime));
        if(!hasWaitingLog)missingWaiting=true;
        logs.forEach(log=>{
          if(log.status!=='waiting'&&log.status!=='break')return;
          const logInterval=range(timestamp(log.startTime),timestamp(log.endTime)??end,interval[0],interval[1]);
          if(logInterval)(log.status==='waiting'?row._waiting:row._breaks).push(logInterval);
        });
      });
      const workWindows=merge(work);
      const includesPoint=point=>point>=from&&point<endBound&&
        (!shifts.length||workWindows.some(window=>point>=window[0]&&point<window[1]));
      const assignments=unique(rows(day.assignments).filter(assignment=>identity(assignment.castId)===cid),
        assignment=>assignment.id!=null?'id:'+assignment.id:JSON.stringify([
          assignment.castId,assignment.tableId,assignment.sessionId,assignment.startTime,assignment.endTime,assignment.type
        ]));
      assignments.forEach(assignment=>{
        const start=timestamp(assignment.startTime),session=findSession(assignment,history);
        const end=timestamp(assignment.endTime)??timestamp(session?.endTime)??dayEnd;
        const interval=range(start,end,from,endBound);
        const zeroDuration=start!=null&&start===end&&includesPoint(start);
        if(!interval&&!zeroDuration)return;
        // With no shift record, retain explicit assignment data but do not invent attendance.
        const windows=interval?(shifts.length?intersect(interval,workWindows):[interval]):[];
        if(!windows.length&&!zeroDuration)return;
        row._occupied.push(...windows);
        if(!shifts.length)missingWaiting=true;
        const visitId=session?recordKey(session,history.indexOf(session)):identity(assignment.sessionId);
        const visit=visitId?JSON.stringify([dayId,identity(assignment.tableId),visitId]):null;
        const typed=typeSegments(assignment,start,end);
        if(typed.legacy)row.legacyTypeAssignments++;
        let unresolvedVisit=false;
        typed.segments.forEach(segment=>{
          if(!TYPES.includes(segment.type))return;
          const pieces=intersect(segment.interval,windows);
          const point=segment.interval[0]===segment.interval[1]&&includesPoint(segment.interval[0]);
          if(!pieces.length&&!point)return;
          if(visit)row._visits[segment.type].add(visit);
          else{unresolvedVisit=true;row._unresolvedTypes.add(segment.type);}
          row._typeIntervals[segment.type].push(...pieces);
          if(segment.type==='free'&&visit){
            if(!row._freeVisits.has(visit))row._freeVisits.set(visit,[]);
            row._freeVisits.get(visit).push(...pieces);
          }
        });
        if(unresolvedVisit)row.unresolvedVisitAssignments++;
      });
      history.forEach((record,index)=>{
        const start=timestamp(record.startTime);
        if(start==null||start<from||start>=to)return;
        const items=rows(record.items);
        // Any cast's hon nomination makes the whole visit ineligible for banai extensions.
        if(items.some(item=>item.isHonShimei))return;
        const visit=JSON.stringify([dayId,identity(record.tableId),recordKey(record,index)]);
        let hasTarget=false;
        items.forEach((item,itemIndex)=>{
          if(!extensionTargets(item).includes(cid))return;
          if(item.isBanaiExtension)hasTarget=true;
          if(!isExtensionParent(item))return;
          const event=JSON.stringify([visit,identity(item.groupId||item.id)||'row:'+itemIndex]);
          row._extensionEvents.add(event);row._extensionVisits.add(visit);
        });
        if(hasTarget&&typeof options.extensionSales==='function'){
          const amount=Number(options.extensionSales(record,cid));
          if(Number.isFinite(amount))row.extensionSales+=Math.max(0,amount);
        }
      });
      if(missingWaiting)row.missingWaitingDays=1;
      daily.set(date,row);
    });
    [...daily.values()].sort((a,b)=>b.date.localeCompare(a.date)).forEach(row=>{
      row.workMs=duration(row._work);
      row.attendanceDays=row.workMs>0?1:0;
      row.waitingMs=duration(subtract(row._waiting,[...row._occupied,...row._breaks]));
      TYPES.forEach(type=>{
        row.types[type].count=row._visits[type].size;
        row.types[type].ms=duration(row._typeIntervals[type]);
        if(row.attendanceDays){
          if(!row._unresolvedTypes.has(type))row.types[type].averageCount=row.types[type].count;
          row.types[type].averageMs=row.types[type].ms;
        }
      });
      row.unresolvedVisitTypes=TYPES.filter(type=>row._unresolvedTypes.has(type));
      // The average uses one sample per visit, including all returns to that visit.
      // Apply the five-minute cutoff to exact merged durations, not rounded values.
      row._freeVisits.forEach(intervals=>{
        const ms=duration(intervals);
        if(ms>5*60000){row.freeAverage.count++;row.freeAverage.ms+=ms;}
      });
      if(row.freeAverage.count&&!row._unresolvedTypes.has('free'))
        row.freeAverage.averageMs=row.freeAverage.ms/row.freeAverage.count;
      row.extensionCount=row._extensionEvents.size;row.extensionTables=row._extensionVisits.size;
      const hasActivity=row.workMs||row.waitingMs||row.extensionCount||row.extensionSales||row.legacyTypeAssignments||
        row.unresolvedVisitAssignments||TYPES.some(type=>row.types[type].count||row.types[type].ms);
      if(!hasActivity)return;
      Object.keys(row).filter(key=>key.startsWith('_')).forEach(key=>delete row[key]);
      result.days.push(row);
      ['attendanceDays','workMs','waitingMs','extensionCount','extensionTables','extensionSales','missingWaitingDays','legacyTypeAssignments','unresolvedVisitAssignments']
        .forEach(key=>{result[key]+=row[key];});
      TYPES.forEach(type=>{result.types[type].count+=row.types[type].count;result.types[type].ms+=row.types[type].ms;});
      result.freeAverage.count+=row.freeAverage.count;result.freeAverage.ms+=row.freeAverage.ms;
    });
    result.unresolvedVisitTypes=TYPES.filter(type=>result.days.some(row=>row.unresolvedVisitTypes.includes(type)));
    if(result.freeAverage.count&&!result.unresolvedVisitTypes.includes('free'))
      result.freeAverage.averageMs=result.freeAverage.ms/result.freeAverage.count;
    TYPES.forEach(type=>{
      if(result.attendanceDays){
        if(!result.unresolvedVisitTypes.includes(type))result.types[type].averageCount=result.types[type].count/result.attendanceDays;
        result.types[type].averageMs=result.types[type].ms/result.attendanceDays;
      }
    });
    if(result.types.banai.count&&!result.unresolvedVisitTypes.includes('banai'))
      result.extensionRate=result.extensionTables/result.types.banai.count*100;
    if(result.types.free.count&&!result.unresolvedVisitTypes.some(type=>type==='free'||type==='banai'))
      result.banaiRate=result.types.banai.count/result.types.free.count*100;
    return result;
  }
  return {buildReport};
});
