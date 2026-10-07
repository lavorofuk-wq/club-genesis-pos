// Database rules enforce the same roles. Keep every UI entry point consistent.
function posBusinessView(view){return ["floor","list","shifts","history","tableDetail","assignHistory"].includes(view);}
function posCanView(view){return !window._posAccessInvalidated&&!!window.PosAccess&&window.PosAccess.canView(window._posRole,view)&&(!posBusinessView(view)||(typeof S!=="undefined"&&!!S.activeBizDay));}
function posIsOp(){return !window._posAccessInvalidated&&window._posRole==="op";}
function posCanStartBusiness(){return !window._posAccessInvalidated&&!!window.PosAccess?.canStartBusiness(window._posRole);}
function posDefaultView(){return S.activeBizDay?(posCanView("floor")?"floor":posCanView("list")?"list":"home"):"home";}
function posDenyAccess(){if(typeof sbs==="function")sbs(false,"この機能の利用権限がありません");return false;}
function posRequireView(view){return posCanView(view)||posDenyAccess();}
function posRequireAttendanceBusinessDay(expectedBizDay=S.activeBizDay){
  if(!posCanView("shifts")||!expectedBizDay||expectedBizDay!==S.activeBizDay){
    if(typeof sbs==="function")sbs(false,!S.activeBizDay?"営業開始後に出勤を登録してください":"営業状態が変更されています。出勤画面を開き直してください");
    return false;
  }
  return true;
}
function posBusinessModal(name){
  if(name==="castDrinkChange"||name==="editpay")return true;
  return ["shift","tsuke","assignAction","moveToTable","changeType","editAssignTime","castStatus","castHistory","tablePreparation","opsMenu","loModeOn","loList","loConfirm","loFix","confirm-del","co","co2","disc","cu","gcu","reduce-guests","add-set","add-hon","cd","liquor-target","ext","sc-add","room","room-vip","room-karaoke","fd","qty","banai-ext-cast","banai","setDetail","guestDetail","castDetail","et","dh","tc","est","deleteSession","endBizDay"].includes(name)||String(name||"").startsWith("ci-")||String(name||"").startsWith("liquor_");
}
function invalidateBusinessDayDialogs(previous,next){
  if(previous===next)return;
  if(typeof castDrinkChangeState!=="undefined")castDrinkChangeState=null;
  if(typeof offDutyCastSelection!=="undefined")offDutyCastSelection=false;
  if(typeof endBizDayAttendanceIssues!=="undefined")endBizDayAttendanceIssues=null;
  if(typeof shiftMd!=="undefined")shiftMd={step:"cast",mode:"in",castId:null,shiftId:null,time:"",bizDayId:null};
  if(typeof editPayHid!=="undefined")editPayHid=null;
  if(typeof dhi!=="undefined")dhi=null;
  window._viewHistRec=null;window._histDetailBack=null;
  if(typeof md!=="undefined"&&(posBusinessModal(md)||md==="startBizDay"||md==="viewHistDetail")){
    md=null;
    const modal=document.getElementById("md");if(modal)modal.innerHTML="";
  }
  const floor=document.getElementById("floor-order-modal");if(floor)floor.style.display="none";
  if(typeof at!=="undefined")at=null;
  window._detailTid=null;
  if(typeof vw!=="undefined"&&posBusinessView(vw))vw=posDefaultView();
}
function posCanOpenModal(name){
  if(window._posAccessInvalidated)return false;
  if(!name)return true;
  if(!window.PosAccess?.normalizeRole(window._posRole))return false;
  if(posBusinessModal(name)&&!(typeof S!=="undefined"&&S.activeBizDay))return false;
  if(name==="startBizDay")return posCanStartBusiness()&&!S.activeBizDay;
  if(posIsOp())return true;
  if(["releaseNotes","firebaseLock","sessionConflict"].includes(name))return true;
  if(name==="settingsEditor")return posCanView("settings");
  if(name==="shift")return posCanView("shifts");
  if(["editpay","viewHistDetail"].includes(name))return posCanView("history");
  if(["tsuke","assignAction","moveToTable","changeType","editAssignTime","castStatus","castHistory","tablePreparation"].includes(name))return posCanView("list");
  const floorModals=["opsMenu","loModeOn","loList","loConfirm","loFix","confirm-del","co","co2","disc","cu","gcu","reduce-guests","add-set","add-hon","cd","liquor-target","ext","sc-add","room","room-vip","room-karaoke","fd","qty","banai-ext-cast","banai","setDetail","guestDetail","castDetail","et","dh","tc","est"];
  return posCanView("floor")&&(floorModals.includes(name)||name.startsWith("ci-")||name.startsWith("liquor_"));
}
function posLimitedHome(){
  const escape=value=>String(value||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const role=window._posRole,labels={floor:"フロア",list:"リスト",settings:"設定",shifts:"出勤",history:"データ"};
  const tabs=window.PosAccess?.tabs(role)||[];
  return '<section class="access-home"><h2>'+escape(window.PosAccess?.label(role)||"アクセス確認中")+'</h2><p>'
    +(S.activeBizDay?'営業日：'+escape(S.activeBizDay):posCanStartBusiness()?'現在営業していません。営業日を選択して開始してください。':'現在営業していません。営業開始はキャッシャーまたはOPアカウントで操作してください。')
    +'</p>'+(!S.activeBizDay&&posCanStartBusiness()?'<button class="btn access-start-business" onclick="om(\'startBizDay\')">営業を開始する</button>':'')
    +'<div class="access-home-tabs">'+tabs.filter(tab=>labels[tab]&&posCanView(tab)).map(tab=>'<button class="btn" onclick="sv(\''+tab+'\')">'+labels[tab]+'</button>').join('')+'</div></section>';
}
window.posClearPrivateState=function(){
  if(typeof castDrinkChangeState!=="undefined")castDrinkChangeState=null;
  if(typeof offDutyCastSelection!=="undefined")offDutyCastSelection=false;
  if(typeof endBizDayAttendanceIssues!=="undefined")endBizDayAttendanceIssues=null;
  if(typeof S!=="undefined"){
    S.history=[];S.sessions={};S.tablePreparations={};S.bizDays={};S.bizDaySummaries={};S.backups={};S.casts=[];S.tables=[];S.menus={};S.shifts={};S.assignments={};S.config={};S.castLifecycleLogs={};S.gmsExportMeta={};S.gmsTargetCorrections={};S.activeBizDay=null;
  }
  if(typeof md!=="undefined")md=null;
  if(typeof at!=="undefined")at=null;
  if(typeof vw!=="undefined")vw="home";
  if(typeof clearAccountAccessState==="function")clearAccountAccessState();
  try{sessionStorage.removeItem("genesis_admin");}catch(error){}
};
