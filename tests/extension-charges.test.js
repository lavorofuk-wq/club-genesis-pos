const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {source,clone,emulator,fixture}=require('./helpers/scoped-runtime.cjs');

const scLabel='\u30b7\u30f3\u30b0\u30eb\u30c1\u30e3\u30fc\u30b8';
const minute=60000;
function runtime({guests=1,room='vip',fail=false}={}){
  let tick=1800000000000;
  class Clock extends Date{static now(){return ++tick;}}
  const ctx={
    Date:Clock,at:'t1',md:'ext',chargeSaveBusy:false,chargeSaveFailure:null,chargeTargetId:'base',chargeLegacyId:'',failSave:fail,
    extRoomIncluded:true,extSingleIncluded:true,chargeSessionIdentity:null,banaiExtCastIds:[],
    S:{casts:[],assignments:{},menus:{
      options:[{id:'sc',price:2000}],
      vip:[{id:'v60',label:'VIP60',price:30000,minutes:60}],
      karaoke:[{id:'k60',label:'Karaoke60',price:2000,minutes:60}],
      extensions:[{id:'e30',label:'Ext30',price:4000,minutes:30},{id:'e60',label:'Ext60',price:8000,minutes:60}]
    },sessions:{t1:{sessionId:'visit-1',startTime:100000,setEndTime:100000+60*minute,guests,
      items:[{id:'set',label:'Set',isSet:true,minutes:60,price:8000,qty:guests},
        {id:'sc',label:scLabel,price:2000,qty:1},{id:'fd',label:'FD',isFreeDrink:true,price:2000,qty:guests}]}}},
    cloneData:clone,requireFirebaseReady:()=>true,waitForSessionSaveQueue:async()=>{},sessionSaveStates:{},
    sameSessionIdOnly:(a,b)=>a?.sessionId===b?.sessionId,
    closeM:()=>{ctx.md=null;},render:()=>{},renderOrderPartial:()=>{},refreshFloorModal:()=>{},rModal:()=>{},sbs:()=>{},
    alerts:[],alert:message=>ctx.alerts.push(message),writes:[],ct:()=>({})
  };
  if(fs.existsSync(require.resolve('../app.js').replace('app.js','charge-core.js')))ctx.POS_CHARGES=require('../charge-core.js');
  ctx.queueSessionSave=async(id,s)=>{
    if(ctx.beforeSave)await ctx.beforeSave();
    if(ctx.failSave){ctx.sessionSaveStates[id]={status:'error'};throw new Error('denied');}
    ctx.writes.push(clone(s));ctx.S.sessions[id]=clone(s);
  };
  ctx.save=(path,s)=>ctx.queueSessionSave('t1',s);
  vm.createContext(ctx);
  for(const [from,to] of [
    ['function roomTypeFromItem','async function addBanai'],
    ['async function remItem','// qty '],
    ['function freeDrinkLabel','function calcEst()'],
    ['function addSCToSession','async function doh']
  ])vm.runInContext(source(from,to),ctx);
  if(room)ctx.S.sessions.t1.items.push(ctx.roomChargeItem(room,ctx.S.menus[room][0],guests));
  return ctx;
}
const session=c=>c.S.sessions.t1;
const ext=c=>session(c).items.filter(i=>i.extMinutes>0);
const sc=c=>session(c).items.filter(i=>i.isExtension&&String(i.id).startsWith('sc_'));

for(const room of ['vip','karaoke'])test(room+' fee removal preserves extension, SC, free drink and end time',async()=>{
  const c=runtime({room,guests:room==='karaoke'?3:1});
  await c.addExt(c.S.menus.extensions[1],true);
  const end=session(c).setEndTime;
  await c.remItem(session(c).items.find(i=>i.isRoomExtension).id);
  assert.equal(ext(c).length,1);assert.equal(sc(c).length,1);
  assert.equal(session(c).items.filter(i=>i.isFreeDrink).length,2);
  assert.equal(session(c).setEndTime,end);
});

test('SC removal preserves extension and room, and does not back-charge the waived block',async()=>{
  const c=runtime();await c.addExt(c.S.menus.extensions[0],true);
  const end=session(c).setEndTime;await c.remItem(sc(c)[0].id);
  assert.equal(ext(c).length,1);assert.equal(session(c).setEndTime,end);
  assert.equal(session(c).items.filter(i=>i.isRoomExtension).length,1);
  await c.addExt(c.S.menus.extensions[0],true);assert.equal(sc(c).length,0);
  await c.addExt(c.S.menus.extensions[0],true);assert.equal(sc(c).length,1);
});

test('SC eligibility returns when the current guest count is one',()=>{
  const c=runtime();session(c).items.push({id:'added',isSet:true,addedGuests:1,qty:1,minutes:60});
  assert.equal(c.isSingleChargeExtensionEligible(session(c)),true);
});

test('deleting extension parent removes only its own charges and minutes',async()=>{
  const c=runtime();await c.addExt(c.S.menus.extensions[1],true);await c.addExt(c.S.menus.extensions[1],true);
  const target=ext(c)[0],other=ext(c)[1],end=session(c).setEndTime;
  await c.remItem(target.id);
  assert.equal(session(c).items.some(i=>i.groupId===target.groupId),false);
  assert.equal(session(c).items.some(i=>i.id===other.id),true);
  assert.equal(session(c).setEndTime,end-60*minute);
});

test('failed charge deletion keeps all amounts and time',async()=>{
  const c=runtime();await c.addExt(c.S.menus.extensions[1],true);
  const before=clone(session(c));c.queueSessionSave=async()=>{throw new Error('denied');};
  assert.equal(await c.remItem(session(c).items.find(i=>i.isRoomExtension).id),false);
  assert.deepEqual(clone(session(c)),before);
});

test('30+30 and repeated 60-minute extensions charge each block only once',async()=>{
  const c=runtime(),counts=[];
  for(const minutes of [30,30,30,30,60,120]){
    await c.addExt({label:'Ext'+minutes,minutes,price:minutes/30*4000},true);
    counts.push(sc(c).length);
  }
  assert.deepEqual(counts,[1,1,2,2,3,5]);
});

test('manual SC in a 30-minute extension prevents a duplicate in the next 30 minutes',async()=>{
  const c=runtime();await c.addExt(c.S.menus.extensions[0],false);
  c.chargeTargetId=ext(c)[0].groupId;
  assert.equal(await c.addSCToSession(),true);assert.equal(sc(c).length,1);
  await c.addExt(c.S.menus.extensions[0],true);assert.equal(sc(c).length,1);
  const before=clone(session(c));assert.equal(await c.addSCToSession(),false);
  assert.deepEqual(clone(session(c)),before);
});

test('manual room fees attach to the selected extension with its original guest quantity',async()=>{
  const c=runtime({room:'',guests:3});await c.addExt(c.S.menus.extensions[1],false,{roomIncluded:false});
  c.chargeTargetId=ext(c)[0].groupId;session(c).guests=1;
  await c.addRoomCharge('karaoke','k60');
  const fee=session(c).items.find(i=>i.isRoomExtension);
  assert.equal(fee.qty,3);assert.equal(fee.groupId,ext(c)[0].groupId);
  assert.equal(c.POS_CHARGES.defaultRoomType(session(c)),'karaoke');
  const before=clone(session(c));assert.equal(await c.addRoomCharge('karaoke','k60'),false);
  assert.deepEqual(clone(session(c)),before);
  await c.remItem(fee.id);assert.equal(ext(c).length,1);
  assert.equal(c.POS_CHARGES.defaultRoomType(session(c)),'');
});

test('room exclusion persists independently of the base room fee',async()=>{
  const c=runtime();await c.addExt(c.S.menus.extensions[1],true,{roomIncluded:false});
  assert.equal(session(c).items.filter(i=>i.isRoomExtension).length,0);
  assert.equal(c.POS_CHARGES.defaultRoomType(session(c)),'');
  assert.equal(c.POS_CHARGES.availableRoomType(session(c)),'vip');
  assert.equal(session(c).items.filter(i=>i.isVipCharge).length,1);
});

test('removing an earlier extension leaves the next paid block valid',async()=>{
  const c=runtime();await c.addExt(c.S.menus.extensions[0],true);await c.addExt(c.S.menus.extensions[1],true);
  await c.remItem(ext(c)[0].id);assert.equal(sc(c).length,1);
  await c.addExt(c.S.menus.extensions[0],true);assert.equal(sc(c).length,2);
  assert.equal(c.extensionMinutesTotal(session(c)),90);
});

test('removing an intervening half hour does not remap a later SC onto an already-paid block',async()=>{
  const c=runtime();
  for(const minutes of [30,30,60])await c.addExt({label:'Ext',minutes,price:4000*minutes/30},true);
  await c.remItem(ext(c)[1].id);
  assert.equal(sc(c).length,2);
  await c.addExt(c.S.menus.extensions[0],true);
  assert.equal(sc(c).length,2);assert.equal(c.extensionMinutesTotal(session(c)),120);
});

test('a shortened visit with overlapping paid SC is flagged without changing historical amounts',async()=>{
  const c=runtime();for(let n=0;n<3;n++)await c.addExt(c.S.menus.extensions[0],true);
  await c.remItem(ext(c)[1].id);const before=clone(session(c));
  assert.equal(c.POS_CHARGES.blockState(session(c)).conflicts.length,1);
  assert.equal(await c.addExt(c.S.menus.extensions[0],true),false);
  assert.deepEqual(clone(session(c)),before);
  await c.remItem(sc(c)[1].id);
  assert.equal(c.POS_CHARGES.blockState(session(c)).conflicts.length,0);
  assert.equal(await c.addExt(c.S.menus.extensions[0],true),true);
});

test('legacy automatic group fees can be deleted without removing their parent',async()=>{
  const c=runtime();session(c).items.push(
    {id:'old-extension',groupId:'old',isExtension:true,extMinutes:30,price:4000,qty:1},
    {id:'sc_old',groupId:'old',isExtension:true,label:scLabel,price:2000,qty:1},
    {id:'room_old',groupId:'old',isExtension:true,isVipCharge:true,price:15000,qty:1});
  session(c).setEndTime+=30*minute;
  const end=session(c).setEndTime;await c.remItem('sc_old');await c.remItem('room_old');
  assert.equal(ext(c).length,1);assert.equal(session(c).setEndTime,end);
  await c.addExt(c.S.menus.extensions[0],true);assert.equal(sc(c).length,0);
});

test('unscoped legacy manual SC requires explicit attribution without repricing',async()=>{
  const c=runtime();await c.addExt(c.S.menus.extensions[0],false);
  session(c).items.push({id:'sc_add_legacy',label:scLabel,price:1500,qty:1});
  const before=clone(session(c));
  assert.equal(await c.addExt(c.S.menus.extensions[1],true),false);
  assert.deepEqual(clone(session(c)),before);
  c.chargeTargetId=ext(c)[0].groupId;c.chargeLegacyId='sc_add_legacy';
  assert.equal(await c.addSCToSession(),true);
  assert.equal(session(c).items.find(i=>i.id==='sc_add_legacy').price,1500);
  assert.equal(c.POS_CHARGES.unresolvedSC(session(c)).length,0);
  await c.addExt(c.S.menus.extensions[0],true);assert.equal(sc(c).length,1);
});

test('manual corrections retain the selected extension cast attribution and item ordering',async()=>{
  const c=runtime();c.S.casts=[{id:'a',name:'A'},{id:'b',name:'B'}];
  c.banaiExtCastIds=['a'];await c.addExt(c.S.menus.extensions[1],false,{roomIncluded:false});
  c.banaiExtCastIds=['b'];await c.addExt(c.S.menus.extensions[1],false,{roomIncluded:false});
  c.chargeTargetId=ext(c)[0].groupId;await c.addSCToSession();await c.addRoomCharge('vip','v60');
  const corrected=session(c).items.filter(i=>i.groupId===c.chargeTargetId&&(i.chargeRole==='single'||i.chargeRole==='room'));
  assert.equal(corrected.length,2);
  corrected.forEach(i=>assert.deepEqual(clone(i.banaiExtCastIds),['a']));
  const secondIndex=session(c).items.findIndex(i=>i.id===ext(c)[1].id);
  corrected.forEach(i=>assert.ok(session(c).items.findIndex(x=>x.id===i.id)<secondIndex));
});

test('estimate and actual extension use identical charge amounts for all option combinations',async()=>{
  for(const roomIncluded of [false,true])for(const singleIncluded of [false,true])for(const minutes of [30,60,120]){
    const c=runtime();const estimate=c.calcEstForMinutes(session(c),minutes,roomIncluded,singleIncluded);
    const before=session(c).items.length;
    await c.addExt({label:'Ext'+minutes,minutes,price:4000*minutes/30},singleIncluded,{roomIncluded});
    const amounts=items=>items.map(i=>[i.price,i.qty,!!i.isRoomCharge,i.chargeRole||'']);
    assert.deepEqual(clone(amounts(session(c).items.slice(before))),clone(amounts(estimate.extraItems)));
  }
});

test('failed additions do not mutate the session, close the modal or lose selections',async()=>{
  const c=runtime({fail:true});const before=clone(session(c));
  assert.equal(await c.addExt(c.S.menus.extensions[1],true),false);
  assert.deepEqual(clone(session(c)),before);assert.equal(c.md,'ext');assert.equal(c.extRoomIncluded,true);
  c.chargeTargetId='base';session(c).items=session(c).items.filter(i=>i.id!=='sc');
  const noSC=clone(session(c));assert.equal(await c.addSCToSession(),false);assert.deepEqual(clone(session(c)),noSC);
});

test('double taps produce one write and stale modal targets cannot change a newer visit',async()=>{
  const c=runtime();let release;c.beforeSave=()=>new Promise(resolve=>{release=resolve;});
  const first=c.addExt(c.S.menus.extensions[1],true);
  await Promise.resolve();await Promise.resolve();
  assert.equal(c.chargeSaveBusy,true);
  assert.equal(await c.addExt(c.S.menus.extensions[1],true),false);
  release();assert.equal(await first,true);assert.equal(c.writes.length,1);
  c.chargeSessionIdentity=clone(session(c));session(c).sessionId='another-visit';
  const before=clone(session(c));assert.equal(await c.addExt(c.S.menus.extensions[1],true),false);
  assert.deepEqual(clone(session(c)),before);assert.equal(c.writes.length,1);
});

test('a remote order or guest change while the modal is open is not overwritten',async()=>{
  const c=runtime();c.chargeSessionIdentity=clone(session(c));session(c).guests=2;
  assert.equal(await c.addExt(c.S.menus.extensions[1],true),false);assert.equal(c.writes.length,0);
});

test('missing room menu prevents only room-included extensions',async()=>{
  const c=runtime();c.S.menus.vip=[];
  assert.equal(await c.addExt(c.S.menus.extensions[1],true),false);
  assert.equal(await c.addExt(c.S.menus.extensions[1],true,{roomIncluded:false}),true);
});

test('retry after this operation fails is allowed, but another unsaved order is not bypassed',async()=>{
  const c=runtime({fail:true});assert.equal(await c.addExt(c.S.menus.extensions[1],true),false);
  c.failSave=false;assert.equal(await c.addExt(c.S.menus.extensions[1],true),true);assert.equal(c.writes.length,1);
  c.sessionSaveStates.t1={status:'error',message:'another order failed'};
  assert.equal(await c.addExt(c.S.menus.extensions[1],true),false);assert.equal(c.writes.length,1);
});

test('room type is remembered for explicit re-addition after deleting the only fee',async()=>{
  const c=runtime({room:''});await c.addExt(c.S.menus.extensions[1],false,{roomIncluded:false});
  c.chargeTargetId=ext(c)[0].groupId;await c.addRoomCharge('karaoke','k60');
  await c.remItem(session(c).items.find(i=>i.isRoomExtension).id);
  assert.equal(c.POS_CHARGES.defaultRoomType(session(c)),'');assert.equal(c.POS_CHARGES.availableRoomType(session(c)),'karaoke');
});

test('increasing current guests does not silently preselect a single charge',()=>{
  const c=runtime();session(c).singleChargeDefault=true;session(c).guests=2;
  assert.equal(c.POS_CHARGES.defaultSC(session(c)),false);
  session(c).guests=1;assert.equal(c.POS_CHARGES.defaultSC(session(c)),true);
});

test('charge modal prevents close and navigation while saving and lists the whole parent deletion',async()=>{
  const c=runtime(),modal={innerHTML:''};
  Object.assign(c,{DEV:'mobile',checkoutBusy:false,tableChangeBusy:false,entryTimeBusy:false,window:{},
    document:{getElementById:id=>id==='md'?modal:null},fmt:value=>String(value)});
  vm.runInContext(source('function rModal(){','function scc('),c);
  vm.runInContext(source('function om(name)','// ===== RECEIPT PRINT ====='),c);
  await c.addExt(c.S.menus.extensions[1],true);
  c.md='confirm-del';c.window._delItemId=ext(c)[0].id;c.rModal();
  assert.match(modal.innerHTML,/Ext60/);assert.match(modal.innerHTML,/VIP60/);
  assert.match(modal.innerHTML,/charge-delete-list/);
  c.chargeSaveBusy=true;c.rModal();
  assert.match(modal.innerHTML,/role="status"/);assert.doesNotMatch(modal.innerHTML,/onclick=/);
  c.closeM();c.om('co');assert.equal(c.md,'confirm-del');
});

test('Firebase rules accept charge metadata and reject stale single-table writes', {skip:process.env.POS_RULES_EMULATOR!=='1'},async()=>{
  const em=await emulator('demo-pos-charges'),c=runtime();
  await c.addExt(c.S.menus.extensions[1],true);
  const state=fixture();state.sessions.t1={...clone(session(c)),_rev:4};await em.reset(state);
  const desired=clone(state.sessions.t1);
  c.POS_CHARGES.remove(desired,desired.items.find(i=>i.isRoomExtension).id);
  Object.assign(desired,{_rev:5,_nodeWriteVersion:614906,_nodeWriteNonce:'charge-save-1'});
  await em.request('pos-dev/sessions/t1','PUT',desired);
  const saved=await em.request('pos-dev/sessions/t1');
  assert.equal(saved.setEndTime,state.sessions.t1.setEndTime);
  assert.equal(saved.items.filter(i=>i.extMinutes>0).length,1);
  assert.equal(saved.items.some(i=>i.isRoomExtension),false);
  await assert.rejects(em.request('pos-dev/sessions/t1','PUT',{...desired,_nodeWriteNonce:'stale-charge-save'}));
  assert.deepEqual(await em.request('pos-dev/sessions/t1'),saved);
});
