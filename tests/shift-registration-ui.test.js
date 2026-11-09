const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {source}=require('./helpers/scoped-runtime.cjs');

const DAY='2026-10-02';
const START=Date.parse(DAY+'T20:00:00+09:00');
const shift=(id,castId,clockOut=null)=>({id,castId,castName:'同じ表示名',clockIn:START,clockOut});

function setup(casts,shifts){
  const modal={innerHTML:''};
  const context=vm.createContext({
    S:{activeBizDay:DAY,casts,shifts},md:null,at:null,DEV:'desktop',chargeSaveBusy:false,
    document:{getElementById:id=>id==='md'?modal:null},
    posCanView:()=>true,posCanOpenModal:()=>true,
    posRequireAttendanceBusinessDay:day=>day===undefined||day===context.S.activeBizDay,
    sc:()=>context.S.casts
  });
  vm.runInContext(source('function gmsEscapeHtml(','\n'),context);
  vm.runInContext(source('function rModal(){','function castOrderCandidates(){'),context);
  vm.runInContext(source('let shiftMd=','function exportShiftCSV'),context);
  vm.runInContext(source('function rShifts(){','// ===== CLOCK ====='),context);
  return {context,modal};
}

function castButton(html,id){
  const button=[...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].find(match=>match[0].includes('data-cid="'+id+'"'));
  assert.ok(button,'missing cast '+id);
  return button[0];
}

test('clock-in picker labels and disables both kinds of registered casts by ID',()=>{
  const casts=[{id:101,name:'同じ表示名'},{id:'102',name:'同じ表示名'},{id:'fresh-103',name:'未出勤キャスト'}];
  const {context,modal}=setup(casts,{active:shift('active','101'),done:shift('done',102,START+3600000)});

  context.openShiftMd('in');
  assert.match(castButton(modal.innerHTML,'101'),/\bdisabled\b[\s\S]*出勤中/);
  assert.match(castButton(modal.innerHTML,'102'),/\bdisabled\b[\s\S]*退勤済み/);
  assert.match(modal.innerHTML,/退勤を登録した場合は、出勤管理の「退勤済み」から「退勤取消」/);

  const eligible=castButton(modal.innerHTML,'fresh-103');
  assert.doesNotMatch(eligible,/\bdisabled\b/);
  const handler=eligible.match(/onclick="([^"]+)"/)[1];
  vm.runInContext('(function(){'+handler+'}).call({dataset:{cid:"fresh-103"}})',context);
  assert.equal(vm.runInContext('shiftMd.castId',context),'fresh-103');
  assert.match(modal.innerHTML,/未出勤キャスト[\s\S]*出勤時刻/);

  context.openShiftMd('out');
  assert.match(modal.innerHTML,/data-sid="active"/);
  assert.doesNotMatch(modal.innerHTML,/data-sid="done"|退勤取消/);

  context.S.activeBizDay='2026-10-03';
  context.S.shifts={};
  context.openShiftMd('in');
  assert.doesNotMatch(castButton(modal.innerHTML,'102'),/\bdisabled\b/);
  assert.doesNotMatch(modal.innerHTML,/退勤取消/);
});

test('attendance shows existing duplicates for review and retains their individual editing actions',()=>{
  const shifts={
    active:shift('active',101),
    second:shift('second','101'),
    done:shift('done','101',START+3600000),
    other:shift('other',102,START+7200000)
  };
  const {context}=setup([],shifts);
  const html=context.rShifts();

  assert.match(html,/同じキャストに複数の出退勤記録があります。/);
  assert.match(html,/出勤中 \(1名\)/);
  assert.equal((html.match(/>要確認<\/span>/g)||[]).length,3,'same names with different IDs are independent');
  for(const id of Object.keys(shifts))assert.match(html,new RegExp('data-sid="'+id+'" onclick="editShift'));
  assert.match(html,/data-sid="done" onclick="cancelClockOut/);

  context.S.shifts={active:shifts.active,other:shifts.other};
  assert.doesNotMatch(context.rShifts(),/要確認|複数の出退勤記録/);
});
