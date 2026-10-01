const fs=require('node:fs');
const path=require('node:path');

const ROLE_PATH="root.child('access').child('roles').child(auth.uid).val()";
const AUTHORIZED="auth != null && root.child('access').child('authorizedUsers').child(auth.uid).val() == true";
const roleGrant=roles=>`${AUTHORIZED} && (${roles.map(role=>`${ROLE_PATH} == '${role}'`).join(' || ')})`;
const OP=roleGrant(['op']);
const STAFF=roleGrant(['op','cashier','list']);
const CASHIER=roleGrant(['op','cashier']);
const CASHIER_ONLY=roleGrant(['cashier']);
const SHARED_READ_PATHS=[
  'appVersion','casts','castLifecycleLogs','menus','tables','sessions','tablePreparations',
  'history','shifts','assignments','activeBizDay','loMode','loStatus','_capabilities',
  '_writeGate','_scopedOperation','_tableAssignmentRevisions','_castAssignmentRevisions',
  '_castShiftRevisions','_shiftDeleteOperations'
];
const CASHIER_READ_PATHS=['config','_settingsRevisions','_settingsWriteMeta','_tableChangeOperations','_banaiOperations'];
const SHARED_WRITE_PATHS=[
  'assignments','shifts','tablePreparations','_writeGate','_scopedOperation',
  '_tableAssignmentRevisions','_castAssignmentRevisions','_castShiftRevisions','_shiftDeleteOperations'
];
const CASHIER_WRITE_PATHS=[
  'sessions','history','casts','castLifecycleLogs','menus','tables','config','loMode','loStatus',
  '_settingsRevisions','_settingsWriteMeta','_tableChangeOperations','_banaiOperations'
];

// A cashier may create one empty, previously unused business day. Keep the
// ancestor grants OP-only: a child grant cannot revoke an ancestor RTDB grant.
function applyCashierStartRules(rules,writeGate){
  const and=parts=>parts.map(part=>`(${part})`).join(' && ');
  const start=(before,after)=>{
    const operation=`${after}.child('_bizDayOperation')`;
    const id=`${operation}.child('dayId').val()`;
    const day=`${after}.child('bizDays').child(${id})`;
    const summary=`${after}.child('bizDaySummaries').child(${id})`;
    const counter=`${before}.child('_bizDayRevisions').child(${id})`;
    const revision=`(${counter}.isNumber() ? ${counter}.val() : 0)`;
    return and([
      CASHIER_ONLY,
      writeGate.replace(/\bnewData\b/g,after).replace(/\bdata\b/g,before),
      `!${before}.child('activeBizDay').exists()`,
      `${operation}.child('type').val() == 'start'`,
      `${operation}.child('version').isNumber() && ${operation}.child('version').val() >= 614400`,
      `${operation}.child('nonce').isString() && ${operation}.child('nonce').val() != ${before}.child('_bizDayOperation/nonce').val()`,
      `${operation}.child('dayId').isString() && ${id}.matches(/^\\d{4}-\\d{2}-\\d{2}$/)`,
      `!${operation}.child('expectedActiveBizDay').exists()`,
      `${operation}.child('nextActiveBizDay').val() == ${id}`,
      `${operation}.child('expectedDayExists').val() == false`,
      `${operation}.child('expectedDayRev').val() == 0`,
      `${operation}.child('expectedDayCounter').val() == ${revision}`,
      `${operation}.child('updatedAt').isNumber() && ${operation}.child('updatedAt').val() > 0`,
      `!${before}.child('bizDays').child(${id}).exists()`,
      `!${before}.child('bizDaySummaries').child(${id}).exists()`,
      `${after}.child('activeBizDay').val() == ${id}`,
      `${after}.child('_bizDayRevisions').child(${id}).val() == ${revision} + 1`,
      `${day}.child('_rev').val() == ${revision} + 1`,
      `${day}.child('id').val() == ${id} && ${day}.child('date').val() == ${id}`,
      `${day}.child('startedAt').isNumber() && ${day}.child('startedAt').val() > 0`,
      ...['endedAt','isReEdit','history','shifts','assignments'].map(key=>`!${day}.child('${key}').exists()`),
      `${summary}.child('id').val() == ${id} && ${summary}.child('date').val() == ${id}`,
      `${summary}.child('_dayRev').val() == ${revision} + 1`,
      `${summary}.child('startedAt').val() == ${day}.child('startedAt').val()`,
      `!${summary}.child('endedAt').exists() && ${summary}.child('sales').val() == 0`,
      `${summary}.child('updatedAt').isNumber() && ${summary}.child('updatedAt').val() > 0`,
      ...['history','shifts','assignments','sessions'].map(key=>`!${after}.child('${key}').exists()`)
    ]);
  };
  const limitChildren=(node,allowed)=>{
    // Explicit allow-listed children shadow $other, so constrain any existing
    // non-allowed child as well (for example indexed day history).
    for(const [key,value] of Object.entries(node)){
      if(key.startsWith('.')||key==='$other'||allowed.includes(key)||!value||typeof value!=='object')continue;
      const previous=value['.validate'];
      if(previous!==OP&&!String(previous||'').startsWith(`${OP} && (`))value['.validate']=previous===undefined?OP:`${OP} && (${previous})`;
    }
    for(const key of allowed)node[key]={'.validate':true,...(node[key]||{})};
    node.$other={'.validate':OP};
  };
  rules.activeBizDay['.write']=start('data.parent()','newData.parent()');
  rules._bizDayOperation['.write']=start('data.parent()','newData.parent()');
  limitChildren(rules._bizDayOperation,['version','nonce','type','dayId','expectedActiveBizDay','nextActiveBizDay','updatedAt','expectedDayRev','expectedDayExists','expectedDayCounter']);
  for(const [collection,key] of [['bizDays','$dayId'],['bizDaySummaries','$id'],['_bizDayRevisions','$id']]){
    const node=rules[collection][key];
    node['.write']=and([
      start('data.parent().parent()','newData.parent().parent()'),
      `${key} == newData.parent().parent().child('_bizDayOperation/dayId').val()`
    ]);
  }
  const day=rules.bizDays.$dayId;
  limitChildren(day,['id','date','startedAt','_rev']);
  day.id['.read']=CASHIER_ONLY;
  rules._bizDayRevisions.$id['.read']=CASHIER_ONLY;
  limitChildren(rules.bizDaySummaries.$id,['id','date','_dayRev','startedAt','sales','updatedAt']);
}

// Layer role checks onto the existing write protocol. Validators and indexes stay intact.
// Reapplying this transform after scoped-rules regeneration is intentionally idempotent.
function applyAccessRules(document){
  const result=structuredClone(document);
  result.rules.access={
    ...(result.rules.access||{}),'.read':OP,'.write':false,
    authorizedUsers:{$uid:{
      '.read':'auth != null && auth.uid == $uid',
      '.write':`${OP} && auth.uid != $uid`,
      '.validate':'newData.isBoolean()'
    }},
    roles:{$uid:{
      '.read':'auth != null && auth.uid == $uid',
      '.write':`${OP} && auth.uid != $uid`,
      '.validate':"newData.isString() && (newData.val() == 'op' || newData.val() == 'cashier' || newData.val() == 'list')"
    }}
  };
  for(const name of ['pos','pos-dev']){
    const rules=result.rules[name];
    if(!rules)throw new Error(`Missing ${name} rules`);
    const opPrefix=`${OP} && (`;
    const priorRootWrite=rules['.write'];
    if(typeof priorRootWrite!=='string')throw new Error(`Missing ${name} write gate`);
    const writeGate=priorRootWrite.startsWith(opPrefix)?priorRootWrite.slice(opPrefix.length,-1):priorRootWrite;
    // Parent grants cascade in RTDB: the POS root must be OP-only, and every old
    // descendant grant must also require its allowed role before adding leaf grants.
    function constrainDescendants(node,topPath){
      for(const [key,value] of Object.entries(node)){
        if(key==='.write'&&typeof value==='string'&&!value.includes("child('roles')")){
          const grant=SHARED_WRITE_PATHS.includes(topPath)?STAFF:CASHIER_WRITE_PATHS.includes(topPath)?CASHIER:OP;
          node[key]=`${grant} && (${value})`;
        }else if(value&&typeof value==='object')constrainDescendants(value,topPath);
      }
    }
    for(const [key,value] of Object.entries(rules))if(value&&typeof value==='object')constrainDescendants(value,key);
    rules['.read']=OP;
    rules['.write']=`${OP} && (${writeGate})`;
    for(const key of SHARED_READ_PATHS)rules[key]={...(rules[key]||{}),'.read':STAFF};
    for(const key of CASHIER_READ_PATHS)rules[key]={...(rules[key]||{}),'.read':CASHIER};
    const childGate=writeGate.replace(/\bnewData\b/g,'newData.parent()').replace(/\bdata\b/g,'data.parent()');
    for(const key of SHARED_WRITE_PATHS)rules[key]={...(rules[key]||{}),'.write':`${STAFF} && (${childGate})`};
    for(const key of CASHIER_WRITE_PATHS)rules[key]={...(rules[key]||{}),'.write':`${CASHIER} && (${childGate})`};
    applyCashierStartRules(rules,writeGate);
  }
  for(const name of ['backup','backup-dev'])result.rules[name]={...(result.rules[name]||{}),'.read':OP,'.write':OP};
  return result;
}
module.exports={applyAccessRules,SHARED_READ_PATHS,CASHIER_READ_PATHS,SHARED_WRITE_PATHS,CASHIER_WRITE_PATHS};
if(require.main===module){
  const file=path.join(__dirname,'..','database.rules.json');
  fs.writeFileSync(file,JSON.stringify(applyAccessRules(JSON.parse(fs.readFileSync(file,'utf8'))),null,2)+'\n');
}
