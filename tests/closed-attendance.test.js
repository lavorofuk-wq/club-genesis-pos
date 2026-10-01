const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {source,clone,fixture,fakeDb,contextFor}=require('./helpers/scoped-runtime.cjs');
const {installAccessRuntime}=require('./helpers/access-runtime.cjs');

process.env.TZ='Asia/Tokyo';
const DAY='2026-10-02',NEXT='2026-10-03';
function setup(role='op',activeBizDay=DAY){
  const writes=[],alerts=[],statuses=[],confirmations=[];
  const context={
    FB_ROOT:'pos-dev',window:{},Date,Math,JSON,console,Set,
    S:{activeBizDay,casts:[{id:101,name:'QA Cast',castType:'regular'}],
      shifts:{sh1:{id:'sh1',castId:101,castName:'QA Cast',clockIn:Date.parse(DAY+'T20:00:00+09:00'),clockOut:null,status:'waiting',statusLog:[]}},assignments:{}},
    md:null,vw:'home',at:null,
    document:{getElementById:id=>({value:({'se-in':'20:15','se-out':'22:00','shift-time':'21:00'})[id]||'',style:{},innerHTML:''})},
    sbs:(ok,text)=>statuses.push({ok,text}),alert:text=>alerts.push(text),
    confirm:text=>{confirmations.push(text);return true;},
    normalizeCastType:()=> 'regular',cloneData:clone,
    withDataOperation:async(key,action)=>action(),
    guardedCheckedUpdateOptimistic:async(updates,validate,options)=>{writes.push({updates:clone(updates),options:clone(options)});},
    guardedShiftDelete:async(...args)=>{writes.push({deleteArgs:clone(args)});},
    render:()=>{},rModal:()=>{},updateNav:()=>{},closeM:()=>{context.md=null;}
  };
  vm.createContext(context);installAccessRuntime(context,{role,uid:'qa-'+role});
  vm.runInContext(source('let shiftMd=','function exportShiftCSV'),context);
  vm.runInContext(source('function rShifts(){','// ===== CLOCK ====='),context);
  return {context,writes,alerts,statuses,confirmations};
}
const evaluate=(context,code)=>vm.runInContext(code,context);

test('every account loses operational views and the shift modal while the business is closed',()=>{
  for(const role of ['cashier','list','op']){
    const {context:ctx}=setup(role,null);
    for(const view of ['floor','list','shifts','tableDetail','assignHistory'])assert.equal(ctx.posCanView(view),false,role+': '+view);
    assert.equal(ctx.posCanView('home'),true);
    assert.equal(ctx.posCanOpenModal('shift'),false,role+' cannot bypass through the modal');
    assert.equal(ctx.posRequireAttendanceBusinessDay(),false);
    const html=ctx.rShifts();
    assert.doesNotMatch(html,/onclick="(?:openShiftMd|editShift|cancelClockOut|exportShiftCSV)/);
    if(role!=='op')assert.doesNotMatch(ctx.posLimitedHome(),/sv\('(?:shifts|floor|list)'\)/);
    assert.equal(ctx.posCanStartBusiness(),role!=='list','start authority remains unchanged');
    assert.equal(ctx.posCanView('settings'),role!=='list','settings remains available before opening');
  }
});

test('closed-business direct attendance calls neither write records nor ask destructive confirmations',async()=>{
  for(const role of ['cashier','list','op']){
    const {context:ctx,writes,confirmations}=setup(role,null),before=JSON.stringify(ctx.S);
    for(const action of [
      ()=>ctx.openShiftMd('in'),()=>ctx.openShiftMd('out'),()=>ctx.editShift('sh1'),
      ()=>ctx.clockIn(101,'21:00'),()=>ctx.clockOut('sh1','22:00'),
      ()=>ctx.cancelClockOut('sh1'),()=>ctx.deleteShift('sh1'),
      ()=>{evaluate(ctx,"shiftMd={step:'edit',mode:'in',castId:101,shiftId:'sh1',time:'21:00',bizDayId:'2026-10-02'}");return ctx.saveShiftEdit();},
      ()=>ctx.confirmShiftTime()
    ]){
      await action();assert.equal(ctx.md,null,role+' must not open attendance modal');
      assert.equal(writes.length,0,role+' must not write closed-business attendance');
      assert.equal(JSON.stringify(ctx.S),before);
    }
    assert.equal(confirmations.length,0);
  }
});

test('opening business restores attendance access and binds new and edit dialogs to that day',()=>{
  for(const role of ['cashier','list','op']){
    const {context:ctx}=setup(role,null);ctx.S.activeBizDay=DAY;
    assert.equal(ctx.posCanView('shifts'),true);assert.equal(ctx.posCanOpenModal('shift'),true);
    assert.equal(ctx.posRequireAttendanceBusinessDay(DAY),true);
    assert.match(ctx.rShifts(),/出勤登録/);
    for(const mode of ['in','out']){
      ctx.openShiftMd(mode);assert.equal(ctx.md,'shift');
      assert.equal(evaluate(ctx,'shiftMd.bizDayId'),DAY);ctx.closeM();
    }
    ctx.editShift('sh1');assert.equal(ctx.md,'shift');
    assert.equal(evaluate(ctx,'shiftMd.bizDayId'),DAY);
  }
});

test('old attendance dialogs cannot save after closure or a switch to a different business day',async()=>{
  for(const role of ['cashier','list','op'])for(const next of [null,NEXT]){
    for(const action of ['confirmShiftTime','saveShiftEdit']){
      const {context:ctx,writes}=setup(role);
      if(action==='saveShiftEdit')ctx.editShift('sh1');
      else{ctx.openShiftMd('in');evaluate(ctx,"shiftMd.castId=101;shiftMd.step='time'");}
      ctx.S.activeBizDay=next;
      assert.equal(ctx.posRequireAttendanceBusinessDay(DAY),false);
      await ctx[action]();assert.equal(writes.length,0,role+' stale '+action);
    }
  }
});

test('attendance updates retain their expected business day through async persistence',async()=>{
  for(const role of ['cashier','list','op'])for(const action of ['clockIn','clockOut','cancelClockOut','saveShiftEdit']){
    const {context:ctx,writes}=setup(role);
    if(action==='clockIn')await ctx.clockIn(101,'21:00');
    else if(action==='clockOut')await ctx.clockOut('sh1','22:00');
    else if(action==='cancelClockOut')await ctx.cancelClockOut('sh1');
    else{ctx.editShift('sh1');await ctx.saveShiftEdit();}
    assert.equal(writes.length,1,role+' '+action+' still works during business');
    assert.equal(writes[0].options.deferOptimistic,true,action+' waits for persistence before changing attendance');
    assert.equal(writes[0].options.expectedActiveBizDay,DAY,action+' atomic fallback remains day-bound');
    assert.equal(writes[0].options.nodeUpdate.expectedActiveBizDay,DAY,action+' scoped write remains day-bound');
  }
});

test('pending attendance saves cannot leak or restore old-day rows into a newly opened business day',async()=>{
  for(const fail of [false,true]){
    let release,entered;
    const ready=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
    const state={...fixture(),activeBizDay:DAY,shifts:{},assignments:{}};
    const db=fakeDb(state,async()=>{entered();await gate;if(fail)throw new Error('PERMISSION_DENIED');});
    const ctx=contextFor(db,state),alerts=[];
    Object.assign(ctx,{Date,Math,md:null,vw:'shifts',at:null,
      document:{getElementById:()=>null},normalizeCastType:()=> 'regular',
      withDataOperation:async(key,action)=>action(),alert:text=>alerts.push(text),
      closeM:()=>{ctx.md=null;}});
    ctx.S.casts=[{id:'c1',name:'QA Cast',castType:'regular'}];
    vm.runInContext(source('let shiftMd=','function exportShiftCSV'),ctx);
    const pending=ctx.clockIn('c1','21:00');await ready;
    assert.deepEqual(clone(ctx.S.shifts),{},'no local shift before server acknowledgement');
    const nextShift={id:'next',castId:'c2',castName:'New day cast',clockIn:Date.parse(NEXT+'T21:00:00+09:00')};
    ctx.S.activeBizDay=NEXT;ctx.S.shifts={next:nextShift};
    ctx.openShiftMd('in');assert.equal(ctx.md,'shift');
    release();await pending;
    assert.deepEqual(clone(ctx.S.shifts),{next:nextShift},fail?'failed old write does not restore an old snapshot':'accepted old write does not overwrite new-day rows');
    assert.equal(ctx.S.activeBizDay,NEXT);assert.equal(alerts.length,fail?1:0);
    assert.equal(ctx.md,'shift','old response leaves the new-day dialog open');
    assert.equal(evaluate(ctx,'shiftMd.bizDayId'),NEXT);
  }
});

test('late successes from every attendance write leave a newly opened day dialog untouched',async()=>{
  for(const role of ['cashier','list','op'])for(const action of ['clockIn','clockOut','cancelClockOut','saveShiftEdit','deleteShift']){
    const {context:ctx}=setup(role);let release,entered;
    const ready=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
    ctx.guardedCheckedUpdateOptimistic=ctx.guardedShiftDelete=async()=>{entered();await gate;};
    let pending;
    if(action==='clockIn')pending=ctx.clockIn(101,'21:00');
    else if(action==='clockOut')pending=ctx.clockOut('sh1','22:00');
    else if(action==='saveShiftEdit'){ctx.editShift('sh1');pending=ctx.saveShiftEdit();}
    else pending=ctx[action]('sh1');
    await ready;ctx.S.activeBizDay=NEXT;ctx.openShiftMd('in');release();await pending;
    assert.equal(ctx.md,'shift',role+' '+action+' must not close the new dialog');
    assert.equal(evaluate(ctx,'shiftMd.bizDayId'),NEXT);
  }
});

test('revoked role cannot mutate attendance even when a business day remains open',async()=>{
  const {context:ctx,writes}=setup('cashier');ctx.window._posAccessInvalidated=true;
  for(const action of [()=>ctx.clockIn(101,'21:00'),()=>ctx.clockOut('sh1','22:00'),()=>ctx.cancelClockOut('sh1'),()=>ctx.deleteShift('sh1')])await action();
  assert.equal(writes.length,0);assert.equal(ctx.posCanView('shifts'),false);
});
