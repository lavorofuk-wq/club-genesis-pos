const fs=require('node:fs');
const path=require('node:path');
const rev=p=>`(${p}.isNumber() ? ${p}.val() : 0)`;
const and=parts=>parts.map(p=>`(${p})`).join(' && ');
const or=parts=>parts.map(p=>`(${p})`).join(' || ');

function applyScopedRules(document){
  const result=structuredClone(document);
  for(const name of ['pos','pos-dev']){
    const rules=result.rules[name],before=`root.child('${name}')`;
    const capability=`${before}.child('_capabilities/scopedAtomicValidationVersion')`;
    const enabled=`${capability}.exists() && ${capability}.val() >= 614400`;
    const disabled=`!(${enabled})`;
    const liveTransition=`newData.parent().parent().child('activeBizDay').val() != ${before}.child('activeBizDay').val()`;
    const unchangedOp=`newData.parent().parent().parent().child('nonce').val() == ${before}.child('_scopedOperation/nonce').val()`;
    const after='newData.parent().parent().parent().parent()';
    const oldRecord=`${before}.child($collection).child($id)`;
    const newRecord=`${after}.child($collection).child($id)`;
    const newOp='newData.parent().parent().parent()';
    const membership=(collection,cast,base=before,post=after)=>`${post}.child('${collection}').child(${cast} + '').val() == ${rev(`${base}.child('${collection}').child(${cast} + '')`)} + 1`;
    const recordChecks=[
      or(['sessions','shifts','assignments','history','bizDays'].map(key=>`$collection == '${key}'`)),
      `newData.child('exists').val() == ${oldRecord}.exists()`,
      `newData.child('rev').val() == ${rev(`${oldRecord}.child('_rev')`)}`,
      `newData.child('startTime').val() == ${oldRecord}.child('startTime').val()`,
      `newData.child('sessionId').val() == ${oldRecord}.child('sessionId').val()`,
      or([
        and([`newData.child('deleted').val() == true`,`!${newRecord}.exists()`]),
        and([`newData.child('deleted').val() == false`,`${newRecord}.exists()`,`${rev(`${newRecord}.child('_rev')`)} == newData.child('nextRev').val()`,or([
          and([`newData.child('write').val() == true`,`${newRecord}.child('_nodeWriteNonce').val() == ${newOp}.child('nonce').val()`]),
          and([`newData.child('write').val() == false`,`newData.child('nextRev').val() == newData.child('rev').val()`,`${newRecord}.child('startTime').val() == newData.child('startTime').val()`,`${newRecord}.child('sessionId').val() == newData.child('sessionId').val()`])
        ])])
      ]),
      `$collection != 'bizDays' || newData.child('write').val() != true || (newData.child('deleted').val() == true ? !${after}.child('bizDaySummaries').child($id).exists() : ${after}.child('bizDaySummaries').child($id).child('_dayRev').val() == newData.child('nextRev').val())`,
      `$collection != 'assignments' || newData.child('deleted').val() != true || !${oldRecord}.exists() || (${membership('_tableAssignmentRevisions',`${oldRecord}.child('tableId').val()`)} && (${oldRecord}.child('endTime').exists() || ${membership('_castAssignmentRevisions',`${oldRecord}.child('castId').val()`)}))`,
      `$collection != 'shifts' || newData.child('deleted').val() != true || !${oldRecord}.exists() || ${oldRecord}.child('clockOut').exists() || ${membership('_castShiftRevisions',`${oldRecord}.child('castId').val()` )}`
    ];
    rules._scopedOperation={
      '.validate':or([`newData.child('nonce').val() == data.child('nonce').val()`,and([
        `newData.child('version').val() >= 614400`,`newData.child('nonce').isString()`,`newData.child('nonce').val() != data.child('nonce').val()`,
        `newData.child('expectedActiveBizDay').val() == data.parent().child('activeBizDay').val()`,
        `newData.child('expectedActiveBizDay').val() == newData.parent().child('activeBizDay').val()`
      ])]),
      records:{$collection:{$id:{'.validate':or([unchangedOp,and(recordChecks)])}}},
      counters:{$collection:{$id:{'.validate':or([unchangedOp,and([
        or(['_tableAssignmentRevisions','_castAssignmentRevisions','_castShiftRevisions','_bizDayRevisions','_settingsRevisions'].map(key=>`$collection == '${key}'`)),
        `newData.child('rev').val() == ${rev(oldRecord)}`,
        `newData.child('nextRev').val() == ${rev(newRecord)}`,
        `newData.child('nextRev').val() == newData.child('rev').val() || newData.child('nextRev').val() == newData.child('rev').val() + 1`
      ])])}}}
    };
    for(const key of ['_castAssignmentRevisions','_castShiftRevisions','_bizDayRevisions'])rules[key]={$id:{'.validate':`newData.isNumber() && (newData.val() == data.val() || newData.val() == ${rev('data')} + 1)`}};
    rules.history={'.indexOn':['id'], $id:{'.validate':or([disabled,liveTransition,and([
      `newData.child('_nodeWriteVersion').val() >= 614400`,
      `newData.child('_rev').val() == ${rev("data.child('_rev')")} + 1`,
      `newData.child('_nodeWriteNonce').isString()`,`newData.child('_nodeWriteNonce').val() != data.child('_nodeWriteNonce').val()`
    ])])}};
    rules.bizDaySummaries={$id:{'.validate':or([disabled,`newData.child('_dayRev').val() == ${rev("newData.parent().parent().child('bizDays').child($id).child('_rev')")}`])}};
    rules['.write']=rules['.write'].replace("newData.child('_writeGate/versionNum').val() >= 613300",`newData.child('_writeGate/versionNum').val() >= (${enabled} ? 614400 : 613300)`);
    for(const [collection,wildcard,endField,counter] of [['assignments','$assignmentId','endTime','_castAssignmentRevisions'],['shifts','$shiftId','clockOut','_castShiftRevisions']]){
      const node=rules[collection][wildcard];
      if(!node['.write'].includes('scopedAtomicValidationVersion'))node['.write']=and([node['.write'],disabled]);
      const nextRoot='newData.parent().parent()';
      const prevActive=`data.exists() && !data.child('${endField}').exists()`;
      const nextActive=`!newData.child('${endField}').exists()`;
      const changed=`(${prevActive}) != (${nextActive}) || data.child('castId').val() != newData.child('castId').val()`;
      const checks=[
        `newData.child('_nodeWriteVersion').val() >= 614400`,
        `newData.child('_rev').val() == ${rev("data.child('_rev')")} + 1`,
        `newData.child('_nodeWriteNonce').isString()`,`newData.child('_nodeWriteNonce').val() != data.child('_nodeWriteNonce').val()`,
        `!(${changed}) || ((!(${prevActive}) || ${membership(counter,"data.child('castId').val()",before,nextRoot)}) && (!(${nextActive}) || ${membership(counter,"newData.child('castId').val()",before,nextRoot)}))`
      ];
      if(collection==='assignments'){
        const tableChanged=`!data.exists() || (${prevActive}) != (${nextActive}) || data.child('tableId').val() != newData.child('tableId').val()`;
        checks.push(`!(${tableChanged}) || ((!data.exists() || ${membership('_tableAssignmentRevisions',"data.child('tableId').val()",before,nextRoot)}) && ${membership('_tableAssignmentRevisions',"newData.child('tableId').val()",before,nextRoot)})`);
      }
      const validation=or([disabled,liveTransition,`!${nextRoot}.child('activeBizDay').exists()`,and(checks)]);
      if(collection==='assignments'&&!node['.validate'].includes('_castAssignmentRevisions'))node['.validate']=and([node['.validate'],validation]);
      else if(collection==='shifts')node['.validate']=validation;
      rules[collection]['.indexOn']=collection==='assignments'?['tableId','castId']:['castId'];
    }
    const session=rules.sessions.$tableId;
    session['.validate']=or([disabled,`newData.child('_nodeWriteVersion').val() >= 614400`,liveTransition]);
    const dayCheck=and([
      `newData.child('version').val() >= 614400`,
      `newData.child('expectedDayExists').val() == ${before}.child('bizDays').child(newData.child('dayId').val()).exists()`,
      `newData.child('expectedDayRev').val() == ${rev(`${before}.child('bizDays').child(newData.child('dayId').val()).child('_rev')`)}`,
      `newData.child('expectedDayCounter').val() == ${rev(`${before}.child('_bizDayRevisions').child(newData.child('dayId').val())`)}`,
      `newData.parent().child('_bizDayRevisions').child(newData.child('dayId').val()).val() == newData.child('expectedDayCounter').val() + 1`,
      `newData.parent().child('bizDays').child(newData.child('dayId').val()).child('_rev').val() == newData.child('expectedDayCounter').val() + 1`,
      `newData.parent().child('bizDaySummaries').child(newData.child('dayId').val()).child('_dayRev').val() == newData.child('expectedDayCounter').val() + 1`
    ]);
    if(!rules._bizDayOperation['.validate'].includes('expectedDayCounter'))rules._bizDayOperation['.validate']=and([rules._bizDayOperation['.validate'],or([disabled,`newData.child('nonce').val() == data.child('nonce').val()`,dayCheck])]);
    function normalizeCapability(node){
      Object.entries(node).forEach(([key,value])=>{
        if(value&&typeof value==='object')normalizeCapability(value);
        else if(typeof value==='string'&&!value.includes(`${capability}.exists()`))node[key]=value.replaceAll(`${capability}.val() >= 614400`,`(${enabled})`);
      });
    }
    normalizeCapability(rules);
  }
  return result;
}
module.exports={applyScopedRules};
if(require.main===module){
  const file=path.join(__dirname,'..','database.rules.json');
  fs.writeFileSync(file,JSON.stringify(applyScopedRules(JSON.parse(fs.readFileSync(file,'utf8'))),null,2)+'\n');
}
