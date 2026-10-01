const fs=require('node:fs');
const path=require('node:path');

const ROLE_PATH="root.child('access').child('roles').child(auth.uid).val()";
const AUTHORIZED="auth != null && root.child('access').child('authorizedUsers').child(auth.uid).val() == true";
const roleGrant=roles=>`${AUTHORIZED} && (${roles.map(role=>`${ROLE_PATH} == '${role}'`).join(' || ')})`;
const OP=roleGrant(['op']);
const STAFF=roleGrant(['op','cashier','list']);
const CASHIER=roleGrant(['op','cashier']);
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
  }
  for(const name of ['backup','backup-dev'])result.rules[name]={...(result.rules[name]||{}),'.read':OP,'.write':OP};
  return result;
}
module.exports={applyAccessRules,SHARED_READ_PATHS,CASHIER_READ_PATHS,SHARED_WRITE_PATHS,CASHIER_WRITE_PATHS};
if(require.main===module){
  const file=path.join(__dirname,'..','database.rules.json');
  fs.writeFileSync(file,JSON.stringify(applyAccessRules(JSON.parse(fs.readFileSync(file,'utf8'))),null,2)+'\n');
}
