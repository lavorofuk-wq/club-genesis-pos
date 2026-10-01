const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','account-access-ui.js'),'utf8');
function runtime(options={}){
  const reads=[],writes=[],elements={},data=options.data||{authorizedUsers:{owner:true,staff:true},roles:{owner:'op',staff:'list'}};
  const window={_posUid:options.uid||'owner',_posRole:options.role||'op',PosAccess:{canView:(role,view)=>role==='op'&&view==='accounts'},_db:{ref:key=>({
    get:async()=>{reads.push(key);if(options.get)return options.get();return{val:()=>data};},
    update:async values=>{writes.push({key,values:JSON.parse(JSON.stringify(values))});if(options.update)return options.update(values);}
  })}};
  const ctx={window,document:{getElementById:id=>elements[id]||null},vw:'accounts',renders:0,console,render:()=>{ctx.renders++;}};
  vm.createContext(ctx);vm.runInContext(source,ctx);
  return {ctx,window,reads,writes,elements,set(uid,role='cashier'){ctx.accountAccessField('uid',uid);ctx.accountAccessField('role',role);},state(){return vm.runInContext('accountAccessState',ctx);}};
}
test('OP reads once until explicit reload; rendering never requests data',async()=>{
  const r=runtime();assert.match(r.ctx.rAccountAccess(),/アカウント権限/);assert.equal(r.reads.length,0);
  assert.equal(await r.ctx.ensureAccountAccessLoaded(),true);
  await r.ctx.ensureAccountAccessLoaded();r.ctx.rAccountAccess();assert.deepEqual(r.reads,['access']);
  await r.ctx.ensureAccountAccessLoaded(true);assert.equal(r.reads.length,2);
});
test('save atomically assigns role and permits the UID, with no password or account creation',async()=>{
  const r=runtime();r.set('new-user','cashier');assert.equal(await r.ctx.saveAccountAccess(),true);
  assert.deepEqual(r.writes,[{key:'access',values:{'authorizedUsers/new-user':true,'roles/new-user':'cashier'}}]);
  assert.equal(r.state().users['new-user'],true);assert.equal(r.state().roles['new-user'],'cashier');
  r.set('new-user','list');assert.equal(await r.ctx.saveAccountAccess(),true);
  assert.deepEqual(r.writes[1].values,{'authorizedUsers/new-user':true,'roles/new-user':'list'});
});
test('revoke disables authorization and preserves the existing role',async()=>{
  const r=runtime();await r.ctx.ensureAccountAccessLoaded();assert.equal(await r.ctx.revokeAccountAccess('staff'),true);
  assert.deepEqual(r.writes,[{key:'access',values:{'authorizedUsers/staff':false}}]);
  assert.equal(r.state().roles.staff,'list');assert.equal(r.state().users.staff,false);
});
test('own UID cannot be changed, revoked, or edited through any action entrypoint',async()=>{
  const r=runtime();await r.ctx.ensureAccountAccessLoaded();r.set('owner','list');
  assert.equal(await r.ctx.saveAccountAccess(),false);assert.match(r.state().error,/自分/);
  assert.equal(await r.ctx.revokeAccountAccess('owner'),false);
  assert.equal(await r.ctx.writeAccountAccess('owner','list',true),false);
  assert.equal(r.ctx.editAccountAccess('owner'),false);assert.equal(r.writes.length,0);
  const html=r.ctx.rAccountAccess();assert.ok(!html.includes('data-uid="owner"'));assert.match(html,/ログイン中/);
});
test('cashier, list, missing role and missing UID cannot read, write, or render private account data',async()=>{
  for(const role of ['cashier','list','',null]){
    const r=runtime();r.window._posRole=role;
    assert.equal(await r.ctx.ensureAccountAccessLoaded(),false);r.set('new-user');
    assert.equal(await r.ctx.saveAccountAccess(),false);assert.equal(await r.ctx.revokeAccountAccess('staff'),false);
    assert.equal(await r.ctx.writeAccountAccess('new-user','op',true),false);
    assert.match(r.ctx.rAccountAccess(),/OPアカウントのみ/);assert.equal(r.reads.length,0);assert.equal(r.writes.length,0);
  }
  const r=runtime();r.window._posUid='';assert.equal(await r.ctx.ensureAccountAccessLoaded(),false);assert.equal(r.reads.length,0);
});
test('UID validation accepts Firebase-safe variable lengths and rejects path/control injection',async()=>{
  const r=runtime();
  for(const uid of ['a','a'.repeat(128),'abc-def_123','__proto__',"quote'uid"]){assert.equal(r.ctx.accountAccessValidUid(uid),true,uid);}
  for(const uid of ['', 'a'.repeat(129),'a.b','a#b','a$b','a[b','a]b','a/b','a b','a\nb','a\u0000b','a\u007fb']){
    r.set(uid);assert.equal(await r.ctx.saveAccountAccess(),false,JSON.stringify(uid));
  }
  assert.equal(r.writes.length,0);
});
test('UID strings are escaped in text and attributes, never interpolated into inline code',async()=>{
  const uid="<uid\"'&>",r=runtime({data:{authorizedUsers:{[uid]:true},roles:{[uid]:'list'}}});await r.ctx.ensureAccountAccessLoaded();
  const html=r.ctx.rAccountAccess();assert.ok(!html.includes(uid));assert.match(html,/&lt;uid&quot;&#39;&amp;&gt;/);
  assert.match(html,/editAccountAccess\(this.dataset.uid\)/);assert.match(html,/revokeAccountAccess\(this.dataset.uid\)/);
});
test('save disables duplicate requests, reports errors, and allows retry without losing draft',async()=>{
  let reject;const r=runtime({update:()=>new Promise((_resolve,fail)=>{reject=fail;})});r.set('new-user','op');
  const first=r.ctx.saveAccountAccess();assert.equal(r.state().saving,true);assert.equal(await r.ctx.saveAccountAccess(),false);
  assert.equal(r.writes.length,1);reject({code:'PERMISSION_DENIED'});assert.equal(await first,false);
  assert.equal(r.state().saving,false);assert.equal(r.state().uid,'new-user');assert.match(r.state().error,/OPアカウント/);
  r.ctx.accountAccessField('uid','retry-user');assert.equal(r.state().error,'');
});
test('failed read does not loop on render or ordinary ensure; explicit reload retries',async()=>{
  const r=runtime({get:async()=>{throw new Error('network');}});
  assert.equal(await r.ctx.ensureAccountAccessLoaded(),false);r.ctx.rAccountAccess();await r.ctx.ensureAccountAccessLoaded();assert.equal(r.reads.length,1);
  await r.ctx.ensureAccountAccessLoaded(true);assert.equal(r.reads.length,2);assert.equal(r.state().loading,false);
});
test('in-flight private read is ignored after account or role changes',async()=>{
  let resolve;const r=runtime({get:()=>new Promise(done=>{resolve=done;})});const loading=r.ctx.ensureAccountAccessLoaded();
  r.window._posRole='list';r.ctx.clearAccountAccessState();resolve({val:()=>({authorizedUsers:{secret:true},roles:{secret:'op'}})});
  assert.equal(await loading,false);assert.equal(Object.keys(r.state().users).length,0);assert.ok(!r.ctx.rAccountAccess().includes('secret'));
});
test('unsafe and unknown roles cannot be saved by directly calling the writer',async()=>{
  const r=runtime();assert.equal(await r.ctx.writeAccountAccess('staff','admin',true),false);
  assert.equal(await r.ctx.writeAccountAccess('staff/elsewhere','list',true),false);
  assert.equal(await r.ctx.writeAccountAccess('staff','list','true'),false);assert.equal(r.writes.length,0);
});
