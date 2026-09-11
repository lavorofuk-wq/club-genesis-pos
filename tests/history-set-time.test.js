const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

process.env.TZ='Asia/Tokyo';
const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const start=Date.parse('2026-09-11T21:00:00+09:00');
const minute=60000;
function source(from,to){
  const begin=app.indexOf(from),end=app.indexOf(to,begin+from.length);
  assert.ok(begin>=0&&end>begin,from+' extraction boundary');
  return app.slice(begin,end);
}
function contextFor(){
  const context={
    Date,cloneData:clone,markSessionGuard:value=>value,
    gmsUniqueStrings:values=>[...new Set(values.map(String))]
  };
  vm.createContext(context);
  for(const [from,to] of [
    ['function extensionMinutesTotal','function extensionSingleChargeCount'],
    ['function historySetEndTime','// ===== HISTORY / SETTINGS'],
    ['function buildRestoredSessionFromHistory','async function guardedRestoreHistoryToFloor']
  ])vm.runInContext(source(from,to),context);
  return context;
}
function record(overrides={}){
  return{
    startTime:start,endTime:start+157*minute,
    items:[{id:'set60',isSet:true,minutes:60,qty:1}],
    ...overrides
  };
}

test('60-minute set ends at 22:00 regardless of the actual checkout time',()=>{
  const ctx=contextFor();
  for(const elapsed of [30,85,157]){
    const h=record({endTime:start+elapsed*minute,setEndTime:start+elapsed*minute});
    const before=clone(h);
    assert.equal(ctx.historySetEndTime(h),start+60*minute);
    assert.match(ctx.historyTimeLabel(h),/21:00.*22:00$/);
    assert.deepEqual(h,before);
  }
});
test('one 60-minute extension changes the end time to 23:00',()=>{
  const ctx=contextFor(),h=record();
  h.items.push({isExtension:true,extMinutes:60,qty:1});
  assert.equal(ctx.historySetEndTime(h),start+120*minute);
  assert.match(ctx.historyTimeLabel(h),/21:00.*23:00$/);
});
test('multiple extensions add their minutes, never their guest quantities',()=>{
  const ctx=contextFor(),h=record({guests:4});
  h.items[0].qty=4;
  h.items.push({isExtension:true,extMinutes:30,qty:4},{isExtension:true,extMinutes:30,qty:4});
  assert.equal(ctx.historySetEndTime(h),start+120*minute);
  h.items.pop();
  assert.equal(ctx.historySetEndTime(h),start+90*minute);
});
test('added guests do not add another set duration even when listed first',()=>{
  const ctx=contextFor(),h=record();
  h.items.unshift({isSet:true,minutes:30,qty:2,addedGuests:2});
  assert.equal(ctx.historySetEndTime(h),start+60*minute);
});
test('added-guest-only history preserves the saved end instead of guessing a base set',()=>{
  const ctx=contextFor(),h=record({
    setEndTime:start+120*minute,
    items:[{isSet:true,minutes:30,qty:2,addedGuests:2},{isExtension:true,extMinutes:60}]
  });
  assert.equal(ctx.historySetEndTime(h),start+120*minute);
  assert.equal(ctx.buildRestoredSessionFromHistory(h).setEndTime,start+120*minute);
  delete h.setEndTime;
  assert.equal(ctx.historySetEndTime(h),null);
});
test('room fees, free drinks and single charges do not extend the set time',()=>{
  const ctx=contextFor(),h=record();
  h.items.push(
    {isExtension:true,extMinutes:60,qty:3,groupId:'e1'},
    {isRoomCharge:true,isVipCharge:true,roomMinutes:60},
    {isRoomCharge:true,isKaraokeCharge:true,isRoomExtension:true,isExtension:true,roomMinutes:60,groupId:'e1'},
    {isExtension:true,id:'sc_e1',groupId:'e1'},
    {isFreeDrink:true,freeDrinkMinutes:60,groupId:'e1'}
  );
  assert.equal(ctx.historySetEndTime(h),start+120*minute);
});
test('legacy history is calculated from saved item minutes without menu lookups',()=>{
  const ctx=contextFor(),h=record();
  h.items[0].minutes='60';
  h.items.push({isExtension:true,extMinutes:'60'});
  assert.equal(ctx.historySetEndTime(h),start+120*minute);
  assert.match(ctx.historyTimeLabel(h,true),/9\/11.*21:00.*23:00$/);
});
test('a set and extension spanning midnight end on the following day',()=>{
  const ctx=contextFor(),h=record({startTime:Date.parse('2026-09-11T23:30:00+09:00')});
  h.items.push({isExtension:true,extMinutes:60});
  assert.equal(ctx.historySetEndTime(h),Date.parse('2026-09-12T01:30:00+09:00'));
  assert.match(ctx.historyTimeLabel(h),/23:30.*01:30$/);
});
test('missing historical item minutes fall back only to a valid stored set end',()=>{
  const ctx=contextFor(),h=record({items:[],setEndTime:start+60*minute});
  assert.equal(ctx.historySetEndTime(h),start+60*minute);
  for(const setEndTime of [null,0,Infinity,'bad',start-1]){
    assert.equal(ctx.historySetEndTime({...h,setEndTime}),null);
  }
});
test('unknown set time never falls back to checkout time or an assumed duration',()=>{
  const ctx=contextFor(),h=record({items:[]});
  assert.equal(ctx.historySetEndTime(h),null);
  assert.match(ctx.historyTimeLabel(h),/21:00$/);
  assert.doesNotMatch(ctx.historyTimeLabel(h),/23:37/);
  assert.equal(ctx.historySetEndTime(null),null);
});
test('restoring history reuses the calculated end without mutating the history',()=>{
  const ctx=contextFor(),h=record({tableId:'t1',guests:2,setEndTime:start+157*minute});
  h.items.push({isExtension:true,extMinutes:60},{isHonShimei:true,castId:14});
  const before=clone(h),restored=ctx.buildRestoredSessionFromHistory(h);
  assert.equal(restored.startTime,start);
  assert.equal(restored.setEndTime,start+120*minute);
  assert.deepEqual(Array.from(restored.honShimeis),['14']);
  assert.deepEqual(h,before);
  restored.items.pop();
  assert.deepEqual(h,before);
  assert.equal(ctx.buildRestoredSessionFromHistory(record({items:[]})).setEndTime,null);
});
test('checkout persists set end separately from actual checkout time',async()=>{
  const ctx=contextFor(),session=record({tableId:'t1',sessionId:'s1',guests:1,setEndTime:start+157*minute});
  session.items.push({isExtension:true,extMinutes:60});
  let saved;
  Object.assign(ctx,{
    at:'t1',S:{sessions:{t1:session},tables:[{id:'t1',label:'T1'}],history:[]},
    checkoutBusy:false,checkoutError:'',coState:{payMethod:'cash',splits:[]},sessionSaveStates:{},
    document:{querySelectorAll:()=>[],getElementById:()=>null},confirm:()=>false,
    setCheckoutProgress:()=>{},startCheckoutSlowNotice:()=>{},clearCheckoutSlowNotice:()=>{},
    waitForCheckoutPaint:async()=>{},waitForSessionSaveQueue:async()=>{},sameSessionIdOnly:()=>true,
    ct:()=>({subtotal:10000,tax:4000,total:14000}),
    guardedCloseSession:async(tableId,s,h)=>{saved=h;return{history:{[h.id]:h}};},
    setTimeout:callback=>callback(),closeM:()=>{},render:()=>{},
    failCheckout:error=>{throw error;}
  });
  vm.runInContext(source('async function checkout(){','function setCheckoutProgress'),ctx);
  const before=Date.now();
  await ctx.checkout();
  assert.equal(saved.setEndTime,start+120*minute);
  assert.ok(saved.endTime>=before&&saved.endTime<=Date.now());
  assert.equal(ctx.S.history[0].setEndTime,saved.setEndTime);
});
