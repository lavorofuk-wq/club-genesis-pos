// ===== DEFAULTS =====
const DC=[{id:1,name:"すず"},{id:2,name:"みお"},{id:3,name:"みゆ"},{id:4,name:"ひなの"},{id:5,name:"れな"},{id:6,name:"まなみ"},{id:7,name:"せりか"},{id:8,name:"あむ"},{id:9,name:"さき"},{id:10,name:"こはる"},{id:11,name:"さり"},{id:12,name:"かのん"},{id:13,name:"かすみ"},{id:14,name:"なな"},{id:15,name:"ゆうか"},{id:16,name:"めぐみ"},{id:17,name:"れみ"},{id:18,name:"ももか"},{id:19,name:"あみ"},{id:20,name:"るな"},{id:21,name:"あゆな"}];
const DM={castCustomItems:[],normalSets:[],sets:[{id:"s1",label:"セット料金",price:8000,minutes:60},{id:"s2",label:"案内所特別①",price:5000,minutes:60},{id:"s3",label:"案内所特別②",price:6000,minutes:60},{id:"s4",label:"案内所特別③",price:7000,minutes:60},{id:"s5",label:"同伴セット",price:12000,minutes:90}],options:[{id:"fd",label:"フリードリンク",price:2000},{id:"hs",label:"本指名料",price:2000},{id:"bs",label:"場内指名料",price:2000},{id:"dh",label:"同伴料",price:3000},{id:"sc",label:"シングルチャージ",price:2000}],extensions:[{id:"e30",label:"延長30分",price:4000,minutes:30},{id:"e60",label:"延長60分",price:8000,minutes:60}],vip:[{id:"v60",label:"VIP室料 60分",price:30000,minutes:60},{id:"v30",label:"VIP室料延長 30分",price:15000,minutes:30}],karaoke:[],castDrinks:[{id:"cd2",label:"キャストドリンク 2,000円",price:2000},{id:"cd3",label:"キャストドリンク 3,000円",price:3000}],drinks:[{id:"so",label:"ソーダ",price:1000},{id:"pi",label:"ピッチャー",price:1000},{id:"o1",label:"その他 1,000円",price:1000},{id:"o2",label:"その他 2,000円",price:2000},{id:"o3",label:"その他 3,000円",price:3000}],champagne:[],keepBottles:[],wine:[],whisky:[],shochu:[],brandy:[],discounts:[{id:"dc10",label:"10%割引",type:"percent",value:10},{id:"dc20",label:"20%割引",type:"percent",value:20},{id:"dc5k",label:"¥5,000割引",type:"fixed",value:5000}]};
const DT=[{id:"t1",label:"テーブル 1",vip:false},{id:"t2",label:"テーブル 2",vip:false},{id:"t3",label:"テーブル 3",vip:false},{id:"t4",label:"テーブル 4",vip:false},{id:"t5",label:"テーブル 5",vip:false},{id:"t6",label:"テーブル 6",vip:false},{id:"t7",label:"テーブル 7",vip:false},{id:"t8",label:"テーブル 8",vip:false},{id:"va",label:"VIP-A",vip:true},{id:"vb",label:"VIP-B",vip:true}];

// ===== STATE =====
const APP_VERSION="6.126";
const GMS_JSON=window.GmsJsonCore;
const POS_SYNC=window.PosSyncCore;
const MAX_TABLE_COUNT=30;
const TAX_RATE=.30;
const TOTAL_ROUND_UNIT=100;
const HON_SHIMEI_PRICE=2000;
const BANAI_SHIMEI_PRICE=2000;
const FREE_DRINK_OPTIONS=[{id:"fd60",label:"\u30d5\u30ea\u30fc\u30c9\u30ea\u30f3\u30af60\u5206",price:2000,minutes:60},{id:"fd30",label:"\u30d5\u30ea\u30fc\u30c9\u30ea\u30f3\u30af30\u5206",price:1000,minutes:30},{id:"fd0",label:"\u30d5\u30ea\u30fc\u30c9\u30ea\u30f3\u30af0\u5186",price:0,minutes:60}];
function _verNum(v){const p=(v||"0").split(".");return parseInt((p[0]||"0").padStart(2,"0")+(p[1]||"0").padStart(2,"0")+(p[2]||"0").padStart(2,"0"),10);}
function applyFixedShimeiPrices(menus){
  if(!menus||!Array.isArray(menus.options))return menus;
  menus.options=menus.options.map(o=>o.id==="hs"?{...o,price:HON_SHIMEI_PRICE}:o.id==="bs"?{...o,price:BANAI_SHIMEI_PRICE}:o);
  return menus;
}
function normalizeCasts(list){
  let nextNo=1;
  return (list||[]).map((cast,idx)=>{
    const internalNo=Number(cast.internalNo)||nextNo;
    nextNo=Math.max(nextNo,internalNo+1);
    return {...cast,internalNo,active:cast.active!==false,registeredAt:cast.registeredAt||0,sortIndex:cast.sortIndex??idx};
  });
}
function castSortValue(c){return Number(c.internalNo)||Number.MAX_SAFE_INTEGER;}
function allCasts(){return normalizeCasts(S.casts||[]).sort((a,b)=>castSortValue(a)-castSortValue(b)||String(a.name||"").localeCompare(String(b.name||""),"ja"));}
function castNo(c){return String(c?.internalNo||"").padStart(3,"0");}
function currentCastBizDate(){return (typeof S!=="undefined"&&S.activeBizDay)||getBizDate();}
function isVisibleCast(c){return c&&c.active!==false&&(c.castType!=="trial"||c.trialBizDay===currentCastBizDate());}
function activeRegularCasts(){return allCasts().filter(c=>c&&c.active!==false&&c.castType!=="trial");}
function nextCastInternalNo(){
  const nums=allCasts().filter(c=>c.castType!=="trial").map(c=>Number(c.internalNo)||0);
  Object.values((typeof S!=="undefined"&&S.castLifecycleLogs)||{}).forEach(log=>{
    [...(log.enteredCasts||[]),...(log.exitedCasts||[])].forEach(c=>nums.push(Number(c.internalNo)||0));
  });
  return Math.max(0,...nums)+1;
}
function nextTrialCastInternalNo(date){return Math.max(99,...allCasts().filter(c=>c.castType==="trial"&&c.trialBizDay===date).map(c=>Number(c.internalNo)||99))+1;}
function emptyLifecycle(){return{enteredCasts:[],exitedCasts:[],trialCasts:[]};}
function lifecycleFor(date){
  if(!S.castLifecycleLogs)S.castLifecycleLogs={};
  if(!S.castLifecycleLogs[date])S.castLifecycleLogs[date]=emptyLifecycle();
  const l=S.castLifecycleLogs[date];
  l.enteredCasts=l.enteredCasts||[];
  l.exitedCasts=l.exitedCasts||[];
  l.trialCasts=l.trialCasts||[];
  return l;
}
function upsertLifecycle(date,key,row,idField){
  const l=lifecycleFor(date);
  const eventType=key==="enteredCasts"?"entered":key==="exitedCasts"?"departed":key==="trialCasts"?"trial":"";
  const timeField=eventType==="entered"?"enteredAt":eventType==="departed"?"exitedAt":"trialRegisteredAt";
  const eventAt=eventType?gmsIso(row.eventAt||row[timeField]||row.registeredAt||date+"T00:00:00+09:00",date+"T00:00:00+09:00"):"";
  const enriched=eventType&&!row.eventId
    ?{...row,eventId:gmsStableId("evt",[date,eventType,String(row.castId||""),eventAt,Number(row.internalNo)||0])}
    :row;
  const id=String(enriched[idField||"castId"]||"");
  const idx=l[key].findIndex(x=>String(x[idField||"castId"]||"")===id);
  if(idx>=0)l[key][idx]={...l[key][idx],...enriched};
  else l[key].push(enriched);
}
function castSnapshot(c,extra={}){
  return{castId:String(c.id||""),internalNo:Number(c.internalNo)||0,castName:c.name||"",...extra};
}
async function saveCastsAndLifecycle(){
  if(window._db){
    const base=window._remoteValueHashes?.casts;
    return guardedRootTransaction(root=>{
      if(base!==undefined&&stableJson(root.casts||null)!==base){
        throw Object.assign(new Error("casts changed"),{userMessage:"他端末でキャスト名簿が変更されています。最新データに更新してから再実行してください。"});
      }
      root.casts=cloneData(S.casts);
      root.castLifecycleLogs=cloneData(S.castLifecycleLogs||{});
      return root;
    }).then(res=>{updateRemoteHash("casts",S.casts);return res;});
  }
  return save("casts",S.casts);
}
function applyPosCastPolicy(casts){
  const kept=[];
  normalizeCasts(casts).forEach(c=>{
    if(c.active===false&&c.castType!=="trial"){
      const biz=c.exitedBizDay||currentCastBizDate();
      upsertLifecycle(biz,"exitedCasts",castSnapshot(c,{exitedAt:c.exitedAt||null}),"castId");
      return;
    }
    if(c.active===false&&c.castType==="trial"){
      const biz=c.trialBizDay||currentCastBizDate();
      upsertLifecycle(biz,"trialCasts",castSnapshot(c,{trialBizDay:biz,trialRegisteredAt:c.trialRegisteredAt||c.registeredAt||null,trialEndedAt:c.trialEndedAt||null}),"castId");
      return;
    }
    kept.push(c);
  });
  return kept;
}
let S={casts:normalizeCasts(DC),menus:applyFixedShimeiPrices(DM),tables:DT,sessions:{},history:[],shifts:{},assignments:{},bizDays:{},castLifecycleLogs:{},gmsExportMeta:{},activeBizDay:null,config:{printerIP:'192.168.150.76',printerPort:8008},backups:{},loMode:false,loStatus:{}};
let vw="home",at=null,md=null,cds=0,cdc=null; // vw初期値をhomeに
let ci={guests:1,setMenu:null,setType:null,honShimeis:[],douhan:false,freedrink:false,single:false,note:""};
let etv="",stab="cast",ncn="",ntn="",cp="",cl="",dhi=null,qm=null,qv=1,nmi={},ntl="",ntv=false;
let _rcChoices={}; // 全件復旧コンフリクト選択 { date: bkKey }
let now=Date.now();
let priceHidden=false;
let expandedHist={};
let histFilter={from:"",to:"",fromTime:"19:00",toTime:"18:59"};
let analysisSt={mode:null,castId:null,castName:null};
let coState={payMethod:null,splits:[]}; // 会計終了ステート（splits:分割払い）
let checkoutBusy=false;
let checkinBusy=false;
let editPayHid=null; // 履歴支払変更対象ID
let estCustomMin=0; // 概算カスタム延長分
let banaiExtCastIds=[]; // 場内延長キャスト選択用（複数対応）

// ===== DEVICE DETECTION =====
function getDevice(){
  const ua=navigator.userAgent;
  const isIpad=(/iPad/.test(ua))||(/Macintosh/.test(ua)&&'ontouchend' in document);
  const isIphone=/iPhone/.test(ua);
  const isAndroid=/Android/.test(ua);
  const w=window.innerWidth;
  if(isIpad||(w>=768&&w<=1366&&('ontouchend' in document)))return"tablet";
  if(isIphone||isAndroid||w<768)return"mobile";
  return"desktop";
}
let DEV=getDevice();

// iPadOS 14系など、古いSafariのレイアウト機能を実測して必要な補正だけ有効にする
function supportsFlexGap(){
  const flex=document.createElement("div");
  flex.style.cssText="position:absolute;left:-9999px;display:flex;flex-direction:column;row-gap:1px;";
  flex.appendChild(document.createElement("div"));
  flex.appendChild(document.createElement("div"));
  document.body.appendChild(flex);
  const supported=flex.scrollHeight===1;
  flex.remove();
  return supported;
}
const legacyNoAspectRatio=!(window.CSS&&CSS.supports&&CSS.supports("aspect-ratio","1 / 1"));
const legacyNoFlexGap=!supportsFlexGap();
if(legacyNoAspectRatio)document.documentElement.classList.add("legacy-no-aspect-ratio");
if(legacyNoFlexGap)document.documentElement.classList.add("legacy-no-flex-gap");

let legacyLayoutFrame=0;
function syncLegacyFloorCardSizes(){
  if(!legacyNoAspectRatio)return;
  cancelAnimationFrame(legacyLayoutFrame);
  legacyLayoutFrame=requestAnimationFrame(()=>{
    document.querySelectorAll(".floor-table-card").forEach(card=>{
      card.style.setProperty("height",Math.round(card.getBoundingClientRect().width)+"px","important");
    });
  });
}
window.addEventListener("resize",()=>{DEV=getDevice();syncLegacyFloorCardSizes();});
window.addEventListener("orientationchange",syncLegacyFloorCardSizes);

function clampNum(value,min,max){return Math.max(min,Math.min(max,value));}
function floorGridLayout(){
  const count=Math.max(1,(S.tables||[]).length);
  const fallback="repeat(auto-fit,minmax(min(100%,clamp(118px,22vw,220px)),1fr))";
  if(DEV==="mobile"||typeof window==="undefined")return{cols:fallback,gap:"clamp(8px,1.6vw,14px)",fit:false,side:160};
  const main=document.querySelector("main");
  const ms=main?getComputedStyle(main):null;
  const padX=(parseFloat(ms?.paddingLeft)||16)+(parseFloat(ms?.paddingRight)||16);
  const padY=(parseFloat(ms?.paddingTop)||24)+(parseFloat(ms?.paddingBottom)||24);
  const contentW=Math.max(280,Math.min(main?.clientWidth||window.innerWidth,1280)-padX);
  const headerH=document.querySelector("header")?.getBoundingClientRect().height||72;
  const availableH=Math.max(260,window.innerHeight-headerH-padY-40);
  const gap=clampNum(window.innerWidth*0.016,8,14);
  const minSide=DEV==="tablet"?72:78;
  const maxSide=220;
  let best=null;
  for(let cols=1;cols<=count;cols++){
    const rawSide=(contentW-gap*(cols-1))/cols;
    if(rawSide<minSide)continue;
    const side=Math.min(rawSide,maxSide);
    const rows=Math.ceil(count/cols);
    const totalH=rows*side+gap*(rows-1);
    if(totalH<=availableH){
      best={cols,rows,side,totalH};
      break;
    }
  }
  if(!best){
    const cols=count;
    const side=clampNum((contentW-gap*(cols-1))/cols,52,maxSide);
    best={cols,rows:1,side,totalH:side};
  }
  const gridW=Math.floor(best.cols*best.side+gap*(best.cols-1));
  return{
    cols:"repeat("+best.cols+",minmax(0,1fr))",
    gap:Math.round(gap)+"px",
    fit:true,
    side:best.side,
    maxWidth:gridW+"px",
    labelFs:clampNum(Math.floor(best.side/12),10,14),
    timeFs:clampNum(Math.floor(best.side/17),9,11),
    timerFs:clampNum(Math.floor(best.side/8.5),13,20),
    nomFs:clampNum(Math.floor(best.side/13),8,14),
    nomBothFs:clampNum(Math.floor(best.side/17),7,11)
  };
}

// ===== UTILS =====
function fmt(n){return Number(n||0).toLocaleString("ja-JP");}
function roundCharge(n){return Math.ceil(Math.max(0,Number(n)||0)/TOTAL_ROUND_UNIT)*TOTAL_ROUND_UNIT;}
function ts(ms){const s=Math.max(0,Math.floor(ms/1000));return[Math.floor(s/3600),Math.floor((s%3600)/60),s%60].map(x=>String(x).padStart(2,"0")).join(":");}
function ct(ses){
  if(!ses||!Array.isArray(ses.items))return{subtotal:0,discount:0,subDiscAmt:0,totalDiscAmt:0,tax:0,total:0,rate:TAX_RATE};
  const items=ses.items.filter(Boolean);
  const r=TAX_RATE;
  const sub=items.filter(i=>!i.isDiscount).reduce((a,i)=>a+(i.price||0)*(i.qty||1),0);
  const subDiscAmt=items.filter(i=>i.isDiscount&&i.discountTarget!=='total').reduce((a,i)=>a+Math.abs((i.price||0)*(i.qty||1)),0);
  const totalDiscAmt=items.filter(i=>i.isDiscount&&i.discountTarget==='total').reduce((a,i)=>a+Math.abs((i.price||0)*(i.qty||1)),0);
  const afterSubDisc=Math.max(0,sub-subDiscAmt);
  const rawTax=Math.floor(afterSubDisc*r);
  const rawTotal=afterSubDisc+rawTax;
  const totalBeforePostDisc=roundCharge(rawTotal);
  const total=roundCharge(totalBeforePostDisc-totalDiscAmt);
  const tax=Math.max(0,totalBeforePostDisc-afterSubDisc);
  const discount=subDiscAmt+totalDiscAmt;
  return{subtotal:sub,discount,subDiscAmt,totalDiscAmt,tax,total,rate:r};
}
function isV(id){return S.tables.find(t=>t.id===id)?.vip||false;}
function sc(){return allCasts().filter(isVisibleCast);}
function rem(e){return e?e-now:null;}
function sbs(ok,msg){const el=document.getElementById("sb");if(!el)return;el.style.color=ok?"#4ade80":"#ff6b6b";el.style.borderColor=ok?"rgba(74,222,128,.2)":"rgba(255,80,80,.2)";el.style.background=ok?"rgba(74,222,128,.06)":"rgba(255,80,80,.06)";el.textContent="⟳ "+msg;}
const sessionSaveQueues={};
const sessionSaveStates={};
const sessionSaveLastOwn={};
let sessionNodeTransactionsSupported=null;
function isSessionSaving(tableId){return sessionSaveStates[tableId]?.status==="saving";}
function setSessionSaveState(tableId,status,message){
  if(!tableId)return;
  sessionSaveStates[tableId]={status,message:message||"",updatedAt:Date.now()};
  if(status==="saving")sbs(false,"\u4fdd\u5b58\u4e2d...");
  else if(status==="saved")sbs(true,"\u540c\u671f\u6e08\u307f \u2713");
  else if(status==="error")sbs(false,"\u4fdd\u5b58\u30a8\u30e9\u30fc");
  refreshFloorModal();
  if(status==="saved"){
    setTimeout(()=>{
      if(sessionSaveStates[tableId]?.status==="saved"){
        delete sessionSaveStates[tableId];
        refreshFloorModal();
      }
    },1200);
  }
}
function waitForSessionSaveQueue(tableId){return sessionSaveQueues[tableId]||Promise.resolve();}
function sameSessionIdOnly(a,b){
  if(!a||!b)return false;
  if(a.sessionId&&b.sessionId)return String(a.sessionId)===String(b.sessionId);
  return Number(a.startTime||0)===Number(b.startTime||0);
}
function prepareQueuedSession(tableId,desiredSession){
  if(!desiredSession)return null;
  const session=markSessionGuard(cloneData(desiredSession));
  const latest=S.sessions[tableId];
  const lastOwn=sessionSaveLastOwn[tableId];
  if(latest&&lastOwn&&sameSessionIdOnly(session,latest)&&sameSessionIdOnly(lastOwn,latest)&&sessionGuardRev(session)!==sessionGuardRev(latest)&&Number(lastOwn.rev||0)===sessionGuardRev(latest)){
    session._rev=Number(latest._rev||0);
    markSessionGuard(session);
  }
  return session;
}
function queueSessionUpdate(tableId,makeUpdates,options={}){
  const desiredSession=options.session?cloneData(options.session):(S.sessions[tableId]?cloneData(S.sessions[tableId]):null);
  const previous=sessionSaveQueues[tableId]||Promise.resolve();
  const run=previous.catch(()=>{}).then(async()=>{
    setSessionSaveState(tableId,"saving","\u4fdd\u5b58\u4e2d...");
    const session=prepareQueuedSession(tableId,desiredSession);
    if(!session&&!options.allowMissing)throw new Error("session is missing");
    const updates=typeof makeUpdates==="function"?makeUpdates(session):makeUpdates;
    const res=options.sessionOnly
      ?await guardedQueuedSessionSave(tableId,session,options)
      :await guardedSessionUpdate(tableId,session,updates,options);
    const saved=getPathValue(res,"sessions/"+tableId);
    if(saved)sessionSaveLastOwn[tableId]={sessionId:saved.sessionId,startTime:saved.startTime,rev:Number(saved._rev||0)};
    setSessionSaveState(tableId,"saved","\u4fdd\u5b58\u5b8c\u4e86");
    return res;
  }).catch(e=>{
    const msg=e.userMessage||"\u4fdd\u5b58\u3067\u304d\u306a\u304b\u3063\u305f\u30aa\u30fc\u30c0\u30fc\u304c\u3042\u308a\u307e\u3059\u3002\u6700\u65b0\u72b6\u614b\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002";
    setSessionSaveState(tableId,"error",msg);
    throw e;
  });
  sessionSaveQueues[tableId]=run.catch(()=>{});
  return run;
}
function queueSessionSave(tableId,session,options={}){
  return queueSessionUpdate(tableId,session=>({[FB_ROOT+"/sessions/"+tableId]:session}),{...options,session,sessionOnly:true});
}
function iso(i){const id=String(i?.id||"");const label=String(i?.label||"");if(i.isSet)return 0;if(i.isHonShimei)return 1;if(i.isBanaiShimei)return 2;if(id==="dh"||label.includes("\u540c\u4f34"))return 3;if(isFreeDrinkItem(i))return 4;if(label.includes("\u30b7\u30f3\u30b0\u30eb\u30c1\u30e3\u30fc\u30b8"))return 5;if(i.isRoomCharge||i.isVipCharge||i.isKaraokeCharge)return 6;if(i.isExtension)return 7;if(i.isDiscount)return 11;if(id.startsWith("cd_"))return 9;return 8;}
function itemCastName(i){
  if(!i)return"";
  const c=S.casts.find(c=>String(c.id)===String(i.castId));
  return c?.name||i.castName||String(i.label||"").replace(/^.*\(/,"").replace(/\).*$/,"").replace("本指名料","").replace("場内指名料","").trim();
}
function pAmt(n){return priceHidden?"¥****":"¥"+fmt(n);}
function togglePriceHide(){
  priceHidden=!priceHidden;
  const btn=document.getElementById("price-toggle");
  if(btn){btn.textContent=priceHidden?"¥非表示":"¥表示";btn.style.color=priceHidden?"#ff6b6b":"#888";btn.style.borderColor=priceHidden?"rgba(255,80,80,.3)":"rgba(255,255,255,.1)";}
  render();
}

// ===== FIREBASE =====
// Firebase config
function initFB(){
  const db=window._db;
  if(!db)return;
  if(window._fbListening)return;
  window._fbListening=true;
  sbs(false,"接続中…");
  // 自分が最新バージョンならFirebaseにブロードキャスト（古い端末への再読み込み要求用）
  db.ref(FB_ROOT+"/appVersion").once("value",snap=>{
if(_verNum(APP_VERSION)>=_verNum(snap.val()||"0"))guardedSet("appVersion",APP_VERSION,{allowBeforeFirstSync:true,silent:true}).catch(()=>{});
  });
  // Service Workerの更新を即座にチェック
  if('serviceWorker' in navigator){
navigator.serviceWorker.getRegistration().then(reg=>{if(reg)reg.update();}).catch(()=>{});
// SW更新通知を受信したら再読み込みオーバーレイを表示
navigator.serviceWorker.addEventListener('message',e=>{
  if(e.data?.type==='SW_UPDATED'){const ov=document.getElementById('version-overlay');if(ov)ov.style.display='flex';}
});
  }

  // ===== 接続状態監視 =====
  db.ref(".info/connected").on("value",(snap)=>{
const connected=snap.val()===true;
const wasConnected=window._fbConnected===true;
window._fbConnected=connected;
// 初回sync前はオーバーレイを出さない（ページ読み込み中の瞬断を避ける）
if(window._fbFirstSync){
  const ov=document.getElementById("offline-overlay");
  if(ov)ov.style.display=connected?"none":"flex";
}
if(window._fbFirstSync&&!connected){
  window._posWriteLocked=true;
  window._posNeedsReloadAfterDisconnect=true;
  showFirebaseLock("Firebase接続が切れました。会計データ保護のため、保存系操作を停止しています。");
}else if(window._fbFirstSync&&connected&&window._posNeedsReloadAfterDisconnect){
  window._posWriteLocked=true;
  showFirebaseLock("Firebase接続は復帰しました。操作を再開する前に、最新データへ更新してください。");
}else if(connected&&!window._posNeedsReloadAfterDisconnect&&wasConnected===false){
  window._posWriteLocked=false;
}
if(connected){sbs(true,"同期済み ✓");}
else{sbs(false,"⚠ オフライン");}
  });

  // ===== バックアップノード購読 =====
  db.ref(BACKUP_ROOT).on("value",(snap)=>{
S.backups=snap.val()||{};
if(["admin","backupDetail"].includes(vw))render();
  });

  db.ref(FB_ROOT).on("value",(snap)=>{
const d=snap.val();
if(!d){
  sbs(true,"同期済み ✓");
  if(!window._fbFirstSync){window._fbFirstSync=true;const _ld=document.getElementById("loading");if(_ld)_ld.style.display="none";vw="home";}
  render();return;
}
rememberRemoteHashes(d);
// バージョン不一致チェック（初回sync後のみ。自分より新しいバージョンが来たら再読み込みを要求）
if(window._fbFirstSync&&d.appVersion&&d.appVersion!==APP_VERSION&&_verNum(d.appVersion)>_verNum(APP_VERSION)){
  const ov=document.getElementById("version-overlay");if(ov)ov.style.display="flex";
}
S.castLifecycleLogs=d.castLifecycleLogs||{};
if(d.casts)S.casts=applyPosCastPolicy(d.casts);
if(d.menus){
  S.menus=applyFixedShimeiPrices(d.menus);
  // 未定義カテゴリを空配列で初期化
  if(!S.menus.champagne)S.menus.champagne=[];
  if(!S.menus.keepBottles)S.menus.keepBottles=[];
  if(!S.menus.normalSets)S.menus.normalSets=[];
  if(!S.menus.castCustomItems)S.menus.castCustomItems=[];
  if(!S.menus.karaoke)S.menus.karaoke=[];
}
if(d.tables)S.tables=d.tables;
// Firebaseを正として反映し、古い端末のローカル状態を混ぜ戻さない
S.sessions=d.sessions||{};
markSessionGuards(S.sessions);
// historyはキー付きオブジェクト形式（同時会計対応）と旧来配列形式の両方を受け入れる
S.history=d.history?(Array.isArray(d.history)?d.history:Object.values(d.history)).sort((a,b)=>b.startTime-a.startTime):[];
S.shifts=mergeRemoteVersionedCollection("shifts",d.shifts);
S.assignments=mergeRemoteVersionedCollection("assignments",d.assignments);
S.bizDays=d.bizDays||{};
S.gmsExportMeta=d.gmsExportMeta||{};
S.activeBizDay=d.activeBizDay||null;
S.loMode=d.loMode||false;
S.loStatus=d.loStatus||{};
if(d.config){
  S.config={printerIP:d.config.printerIP||'192.168.150.76',printerPort:d.config.printerPort||8008};
}
// config未設定時はデフォルト値を維持（S.configはState初期値で設定済み）
sbs(true,"同期済み ✓");
// 初回sync: loading解除してホームへ
if(!window._fbFirstSync){
  window._fbFirstSync=true;
  const _ld=document.getElementById("loading");
  if(_ld)_ld.style.display="none";
  vw="home";
  render();return;
}
// 自分が開いていたテーブルが他端末で会計終了されていたらフロアへ戻す
if(at&&!(md&&String(md).indexOf("ci-")===0)&&!S.sessions[at]){
  at=null;vw="floor";closeM();const _fom=document.getElementById("floor-order-modal");if(_fom)_fom.style.display="none";render();return;
}
// 営業日が終了していたらホームへ
if(S.activeBizDay===null&&["floor","list","tableDetail","assignHistory","shifts","history","settings"].includes(vw)){
  vw="home";closeM();render();return;
}
if(window._fbRenderTimer)clearTimeout(window._fbRenderTimer);
window._fbRenderTimer=setTimeout(()=>{scheduleRender();refreshFloorModal();},80);
  },(e)=>sbs(false,"接続エラー"));
}
async function save(path,val){
  if(!requireFirebaseReady())return;
  try{
    if(path.startsWith("sessions/")&&val){
      await queueSessionSave(path.split("/")[1],val);
    }else if(shouldGuardWholeValue(path)){
      await guardedSetIfUnchanged(path,val);
    }else{
      await guardedSet(path,val);
    }
    sbs(true,"同期済み ✓");
  }
  catch(e){sbs(false,"保存エラー");}
}
function writeGate(){
  const ts=(window.firebase&&firebase.database&&firebase.database.ServerValue)?firebase.database.ServerValue.TIMESTAMP:Date.now();
  return{appVersion:APP_VERSION,versionNum:_verNum(APP_VERSION),nonce:Date.now()+"_"+Math.random().toString(36).slice(2),updatedAt:ts};
}
function withWriteGate(updates){return{...updates,[FB_ROOT+"/_writeGate"]:writeGate()};}
function txWriteGate(){return{appVersion:APP_VERSION,versionNum:_verNum(APP_VERSION),nonce:Date.now()+"_"+Math.random().toString(36).slice(2),updatedAt:Date.now()};}
function showFirebaseLock(msg){
  window._firebaseLockMessage=msg||"Firebase接続が正しく確認できないため、会計データ保護のため保存系操作を停止しています。";
  sbs(false,"操作停止");
  md="firebaseLock";
  rModal();
}
function reloadForFirebaseResume(){location.reload();}
function requireFirebaseReady(options={}){
  if(options.allowBeforeFirstSync&&window._db&&window._fbConnected!==false&&!window._posNeedsReloadAfterDisconnect)return true;
  if(!window._db){
    if(!options.silent)showFirebaseLock("Firebaseが初期化されていません。保存系操作はできません。");
    return false;
  }
  if(!window._fbFirstSync){
    if(!options.silent)showFirebaseLock("Firebase初回同期が完了していません。同期完了まで保存系操作はできません。");
    return false;
  }
  if(window._fbConnected!==true){
    window._posWriteLocked=true;
    if(!options.silent)showFirebaseLock("Firebase接続が確認できません。会計データ保護のため保存系操作を停止しています。");
    return false;
  }
  if(window._posNeedsReloadAfterDisconnect){
    window._posWriteLocked=true;
    if(!options.silent)showFirebaseLock("Firebase接続が一度切断されました。操作再開前に最新データへ更新してください。");
    return false;
  }
  if(window._posWriteLocked){
    if(!options.silent)showFirebaseLock("保存系操作は現在ロックされています。最新データへ更新してから再開してください。");
    return false;
  }
  return true;
}
async function guardedUpdate(updates,options={}){
  if(!requireFirebaseReady(options))throw new Error("Firebase is not ready for write");
  return window._db.ref("/").update(withWriteGate(updates));
}
async function guardedRootUpdate(values,options={}){
  const updates={};
  Object.entries(values||{}).forEach(([k,v])=>{updates[FB_ROOT+"/"+k]=v;});
  return guardedUpdate(updates,options);
}
async function guardedSet(path,val,options={}){
  const updates={};
  updates[FB_ROOT+"/"+path]=val;
  return guardedUpdate(updates,options);
}
async function guardedRemove(path){return guardedSet(path,null);}
function stableJson(v){try{return JSON.stringify(v===undefined?null:v);}catch(e){return "";}}
function shouldGuardWholeValue(path){return["menus","tables","casts","bizDays","config"].includes(String(path||"").split("/")[0]);}
function updateRemoteHash(path,val){
  if(!window._remoteValueHashes)window._remoteValueHashes={};
  window._remoteValueHashes[path]=stableJson(val);
}
function rememberRemoteHashes(d){
  if(!d)return;
  ["menus","tables","casts","bizDays","config"].forEach(k=>updateRemoteHash(k,d[k]===undefined?null:d[k]));
}
function cloneData(v){return v==null?null:JSON.parse(JSON.stringify(v));}
function stripRootPath(path){path=String(path||"");return path.indexOf(FB_ROOT+"/")===0?path.slice(FB_ROOT.length+1):path;}
const VERSIONED_RECORD_COLLECTIONS=new Set(["shifts","assignments"]);
const recordNodeTransactionsSupported={shifts:null,assignments:null};
const dataOperationLocks=new Set();
function versionedRecordPathInfo(path){
  const relative=stripRootPath(path);
  const parts=relative.split("/").filter(Boolean);
  if(parts.length!==2||!VERSIONED_RECORD_COLLECTIONS.has(parts[0]))return null;
  return{collection:parts[0],id:parts[1],relative};
}
function recordConflictMessage(collection){
  return collection==="shifts"
    ?"出退勤情報が他端末で更新されています。最新状態を確認してください。"
    :"付け回し情報が他端末で更新されています。最新状態を確認してください。";
}
function prepareVersionedRecordUpdates(root,updates,options={}){
  const prepared={...updates};
  Object.entries(updates||{}).forEach(([path,desired])=>{
    const info=versionedRecordPathInfo(path);
    if(!info)return;
    const remote=getPathValue(root,info.relative)||null;
    if(desired===null){
      const expected=options.expectedRecords?.[info.relative];
      if(!expected||!POS_SYNC.sameRecord(remote,expected)){
        throw Object.assign(new Error("record changed"),{userMessage:recordConflictMessage(info.collection)});
      }
      prepared[path]=null;
      return;
    }
    const explicitExpected=options.expectedRecords?.[info.relative];
    const expectCreate=(options.createRecords||[]).includes(info.relative);
    if(remote){
      if(expectCreate||!POS_SYNC.sameRecord(remote,explicitExpected||desired)){
        throw Object.assign(new Error("record changed"),{userMessage:recordConflictMessage(info.collection)});
      }
    }else if(explicitExpected||!POS_SYNC.canCreate(remote,desired)){
      throw Object.assign(new Error("record create conflict"),{userMessage:recordConflictMessage(info.collection)});
    }
    prepared[path]=POS_SYNC.nextRecord(
      remote,
      cloneData(desired),
      _verNum(APP_VERSION),
      Date.now()+"_"+Math.random().toString(36).slice(2)
    );
  });
  return prepared;
}
function syncVersionedRecordsFromRoot(root,updates){
  Object.keys(updates||{}).forEach(path=>{
    const info=versionedRecordPathInfo(path);
    if(!info)return;
    const saved=getPathValue(root,info.relative);
    if(saved)S[info.collection][info.id]=saved;
    else delete S[info.collection][info.id];
  });
}
async function guardedRecordNodeTransaction(collection,id,expected,desired,options={}){
  if(!requireFirebaseReady(options))throw new Error("Firebase is not ready for record write");
  if(!desired)throw new Error("record deletion requires root transaction");
  let conflict=false;
  let conflictRemote=null;
  const nonce=Date.now()+"_"+Math.random().toString(36).slice(2);
  const ref=window._db.ref(FB_ROOT+"/"+collection+"/"+id);
  const result=await ref.transaction(remote=>{
    conflict=false;
    conflictRemote=null;
    if(remote){
      if(!POS_SYNC.sameRecord(remote,expected)){conflict=true;conflictRemote=remote;return;}
    }else if(!options.expectCreate){
      conflict=true;return;
    }else if(!POS_SYNC.canCreate(remote,desired)){
      conflict=true;return;
    }
    return POS_SYNC.nextRecord(remote,cloneData(desired),_verNum(APP_VERSION),nonce);
  },null,false);
  if(!result.committed){
    if(conflict){
      if(conflictRemote)S[collection][id]=conflictRemote;else delete S[collection][id];
    }
    const err=new Error("record conflict");
    err.userMessage=recordConflictMessage(collection);
    throw err;
  }
  const saved=result.snapshot.val();
  if(saved)S[collection][id]=saved;
  return saved;
}
async function guardedRecordSet(collection,id,expected,desired,options={}){
  const path=FB_ROOT+"/"+collection+"/"+id;
  if(desired&&recordNodeTransactionsSupported[collection]!==false){
    try{
      const saved=await guardedRecordNodeTransaction(collection,id,expected,desired,options);
      recordNodeTransactionsSupported[collection]=true;
      return saved;
    }catch(e){
      if(!isFirebasePermissionDenied(e))throw e;
      recordNodeTransactionsSupported[collection]=false;
    }
  }
  const updateOptions={...options,expectedRecords:{...(options.expectedRecords||{}),[collection+"/"+id]:expected}};
  const result=await guardedCheckedUpdate({[path]:desired},options.checker,updateOptions);
  return getPathValue(result,collection+"/"+id)||null;
}
async function withDataOperation(key,operation){
  if(dataOperationLocks.has(key)){
    sbs(false,"保存中...");
    return false;
  }
  dataOperationLocks.add(key);
  sbs(false,"保存中...");
  try{return await operation();}
  finally{dataOperationLocks.delete(key);}
}
function getPathValue(obj,path){
  const parts=stripRootPath(path).split("/").filter(Boolean);
  let cur=obj;
  for(const p of parts){if(cur==null||typeof cur!=="object")return undefined;cur=cur[p];}
  return cur;
}
function setPathValue(obj,path,val){
  const parts=stripRootPath(path).split("/").filter(Boolean);
  if(!parts.length)return;
  let cur=obj;
  for(let i=0;i<parts.length-1;i++){
    const p=parts[i];
    if(!cur[p]||typeof cur[p]!=="object")cur[p]={};
    cur=cur[p];
  }
  const last=parts[parts.length-1];
  if(val===null||val===undefined)delete cur[last];
  else cur[last]=val;
}
function applyRootUpdates(root,updates){
  Object.entries(updates||{}).forEach(([path,val])=>setPathValue(root,path,cloneData(val)));
  return root;
}
async function readRemoteRelative(path){
  const snap=await window._db.ref(FB_ROOT+"/"+stripRootPath(path)).once("value");
  return snap.val();
}
function castIdQueryValues(castId){
  const values=[String(castId)];
  const n=Number(castId);
  if(Number.isFinite(n)&&!values.includes(n))values.push(n);
  return values;
}
async function readRemoteActiveAssignmentsForCast(castId){
  const found={};
  for(const value of castIdQueryValues(castId)){
    const snap=await window._db.ref(FB_ROOT+"/assignments").orderByChild("castId").equalTo(value).once("value");
    Object.entries(snap.val()||{}).forEach(([id,a])=>{
      if(a&&String(a.castId)===String(castId)&&!a.endTime)found[id]=a;
    });
  }
  return found;
}
async function readRemoteActiveShiftsForCast(castId){
  const found={};
  for(const value of castIdQueryValues(castId)){
    const snap=await window._db.ref(FB_ROOT+"/shifts").orderByChild("castId").equalTo(value).once("value");
    Object.entries(snap.val()||{}).forEach(([id,sh])=>{
      if(sh&&String(sh.castId)===String(castId)&&!sh.clockOut)found[id]=sh;
    });
  }
  return found;
}
function syncVersionedRecordsFromPrepared(prepared){
  Object.entries(prepared||{}).forEach(([path,val])=>{
    const info=versionedRecordPathInfo(path);
    if(!info)return;
    if(val)S[info.collection][info.id]=val;
    else delete S[info.collection][info.id];
  });
}
async function guardedCheckedNodeUpdate(updates,checker,options={}){
  if(!requireFirebaseReady(options))throw new Error("Firebase is not ready for write");
  const root={};
  const readPaths=new Set([...(options.readPaths||[])]);
  Object.keys(updates||{}).forEach(path=>{
    const info=versionedRecordPathInfo(path);
    if(info)readPaths.add(info.relative);
  });
  for(const path of readPaths){
    setPathValue(root,path,await readRemoteRelative(path));
  }
  for(const collection of (options.readCollections||[])){
    root[collection]=await readRemoteRelative(collection)||{};
  }
  for(const castId of (options.readActiveAssignCasts||[])){
    root.assignments={...(root.assignments||{}),...(await readRemoteActiveAssignmentsForCast(castId))};
  }
  for(const castId of (options.readActiveShiftCasts||[])){
    root.shifts={...(root.shifts||{}),...(await readRemoteActiveShiftsForCast(castId))};
  }
  const ok=checker?checker(root):{ok:true};
  if(ok===false||ok?.ok===false){
    throw Object.assign(new Error(ok?.message||"conflict"),{userMessage:ok?.message});
  }
  const prepared=prepareVersionedRecordUpdates(root,updates,options);
  try{
    await window._db.ref("/").update(withWriteGate(prepared));
  }catch(e){
    if(isFirebasePermissionDenied(e)){
      const err=new Error("record conflict");
      err.userMessage="付け回し情報が他端末で更新されています。最新状態を確認してください。";
      throw err;
    }
    throw e;
  }
  syncVersionedRecordsFromPrepared(prepared);
  return applyRootUpdates(root,prepared);
}
const optimisticRootPaths=new Set();
function optimisticRelativePaths(updates){
  return Object.keys(updates||{}).map(stripRootPath);
}
function markOptimisticPaths(updates){
  optimisticRelativePaths(updates).forEach(path=>optimisticRootPaths.add(path));
}
function unmarkOptimisticPaths(updates){
  optimisticRelativePaths(updates).forEach(path=>optimisticRootPaths.delete(path));
}
function isOptimisticPath(path){
  return optimisticRootPaths.has(stripRootPath(path));
}
function mergeRemoteVersionedCollection(collection,remote){
  const merged={...(remote||{})};
  optimisticRootPaths.forEach(path=>{
    const info=versionedRecordPathInfo(path);
    if(!info||info.collection!==collection)return;
    const local=getPathValue(S,info.relative);
    if(local==null)delete merged[info.id];
    else merged[info.id]=cloneData(local);
  });
  return merged;
}
function shouldFallbackNodeUpdate(error){
  const message=String(error?.message||"");
  return isFirebasePermissionDenied(error)
    ||message==="record conflict"
    ||message==="record changed"
    ||message==="record create conflict";
}
function isPendingAssignment(aid){
  return !!aid&&isOptimisticPath("assignments/"+aid);
}
function isPendingCastShift(castId){
  const sh=getShiftByCastId(castId);
  return !!sh&&isOptimisticPath("shifts/"+sh.id);
}
function isPendingCastMove(castId,assignId){
  return isPendingAssignment(assignId)||isPendingCastShift(castId);
}
function snapshotLocalRootPaths(updates){
  const snap={};
  optimisticRelativePaths(updates).forEach(relative=>{
    snap[relative]=cloneData(getPathValue(S,relative));
  });
  return snap;
}
function restoreLocalRootSnapshot(snap){
  Object.entries(snap||{}).forEach(([path,val])=>setPathValue(S,path,val));
}
function applyLocalRootUpdates(updates){
  Object.entries(updates||{}).forEach(([path,val])=>setPathValue(S,stripRootPath(path),cloneData(val)));
}
function refreshAfterOptimisticUpdate(){
  render();
  refreshFloorModal();
}
async function guardedCheckedUpdateOptimistic(updates,checker,options={}){
  const snap=snapshotLocalRootPaths(updates);
  markOptimisticPaths(updates);
  applyLocalRootUpdates(updates);
  refreshAfterOptimisticUpdate();
  try{
    let result;
    if(options.nodeUpdate){
      try{
        result=await guardedCheckedNodeUpdate(updates,checker,options.nodeUpdate);
      }catch(e){
        if(!shouldFallbackNodeUpdate(e))throw e;
        result=await guardedCheckedUpdate(updates,checker,options);
      }
    }else{
      result=await guardedCheckedUpdate(updates,checker,options);
    }
    unmarkOptimisticPaths(updates);
    return result;
  }catch(e){
    restoreLocalRootSnapshot(snap);
    unmarkOptimisticPaths(updates);
    refreshAfterOptimisticUpdate();
    throw e;
  }
}
async function guardedRootTransaction(mutator,options={}){
  if(!requireFirebaseReady(options))throw new Error("Firebase is not ready for write");
  let blocked=null;
  const ref=window._db.ref(FB_ROOT);
  const res=await ref.transaction(current=>{
    const root=(current&&typeof current==="object")?cloneData(current):{};
    blocked=null;
    let next;
    try{next=mutator(root);}
    catch(e){blocked={message:e.userMessage||e.message||"他端末で更新されています。最新データに更新してから再実行してください。"};return;}
    if(!next){blocked=blocked||{message:"他端末で更新されています。最新データに更新してから再実行してください。"};return;}
    next._writeGate=txWriteGate();
    return next;
  },null,false);
  if(!res.committed){
    const err=new Error((blocked&&blocked.message)||"transaction aborted");
    err.userMessage=(blocked&&blocked.message)||"他端末で更新されています。最新データに更新してから再実行してください。";
    throw err;
  }
  return res.snapshot.val();
}
async function guardedCheckedUpdate(updates,checker,options={}){
  const result=await guardedRootTransaction(root=>{
    const ok=checker?checker(root):{ok:true};
    if(ok===false||ok?.ok===false){throw Object.assign(new Error(ok?.message||"conflict"),{_txConflict:true,userMessage:ok?.message});}
    return applyRootUpdates(root,prepareVersionedRecordUpdates(root,updates,options));
  },options);
  syncVersionedRecordsFromRoot(result,updates);
  return result;
}
async function guardedSetIfUnchanged(path,val,options={}){
  const base=window._remoteValueHashes?.[path];
  return guardedRootTransaction(root=>{
    const current=getPathValue(root,path);
    if(base!==undefined&&stableJson(current)!==base){
      throw Object.assign(new Error("remote changed"),{_txConflict:true,userMessage:"他端末で設定が変更されています。最新データに更新してから再実行してください。"});
    }
    setPathValue(root,path,val);
    return root;
  },options).then(res=>{updateRemoteHash(path,val);return res;});
}
async function guardedRootUpdateIfActive(expectedActiveBizDay,values,message){
  const expected=expectedActiveBizDay||null;
  return guardedRootTransaction(root=>{
    const current=root.activeBizDay||null;
    if(current!==expected){
      throw Object.assign(new Error("business day changed"),{userMessage:message||"営業状態が他端末で変更されています。最新データに更新してから再実行してください。"});
    }
    Object.entries(values||{}).forEach(([k,v])=>setPathValue(root,k,v));
    return root;
  });
}
function sessionGuardStart(s){return Number(s?._sessionGuardStartTime||s?.startTime||0);}
function sessionGuardRev(s){return Number(s?._sessionGuardRev??s?._rev??0)||0;}
function markSessionGuard(s){
  if(!s||typeof s!=="object")return s;
  try{Object.defineProperty(s,"_sessionGuardStartTime",{value:Number(s.startTime||0),writable:true,configurable:true,enumerable:false});}catch(e){s._sessionGuardStartTime=Number(s.startTime||0);}
  try{Object.defineProperty(s,"_sessionGuardRev",{value:Number(s._rev||0),writable:true,configurable:true,enumerable:false});}catch(e){s._sessionGuardRev=Number(s._rev||0);}
  return s;
}
function markSessionGuards(sessions){Object.values(sessions||{}).forEach(markSessionGuard);}
function ensureSessionId(s){
  if(s&&!s.sessionId)s.sessionId="ses_"+(s.startTime||Date.now())+"_"+Math.random().toString(36).slice(2,8);
  return s;
}
function sameSession(remote,expected){
  if(!remote||!expected)return false;
  const sameId=remote.sessionId&&expected.sessionId?String(remote.sessionId)===String(expected.sessionId):Number(remote.startTime||0)===sessionGuardStart(expected);
  return sameId&&Number(remote._rev||0)===sessionGuardRev(expected);
}
function isFirebasePermissionDenied(error){
  const code=String(error?.code||"").toUpperCase();
  const message=String(error?.message||"").toUpperCase();
  return code.includes("PERMISSION_DENIED")||message.includes("PERMISSION_DENIED")||message.includes("PERMISSION DENIED");
}
function syncRemoteSession(tableId,remote){
  if(!tableId)return;
  if(remote){S.sessions[tableId]=markSessionGuard(remote);}
  else delete S.sessions[tableId];
}
function showSessionConflict(msg){
  window._sessionConflictMessage=msg||"このテーブルは他端末で更新されています。最新状態を確認してください。";
  sbs(false,"保存停止");
  md="sessionConflict";
  rModal();
}
function closeSessionConflict(){
  window._sessionConflictMessage=null;
  location.reload();
}
async function readRemoteSession(tableId){
  if(!requireFirebaseReady())throw new Error("Firebase is not ready for read");
  const snap=await window._db.ref(FB_ROOT+"/sessions/"+tableId).once("value");
  return snap.val();
}
async function ensureSessionCurrent(tableId,expected,options={}){
  if(!requireFirebaseReady())throw new Error("Firebase is not ready for session write");
  const remote=await readRemoteSession(tableId);
  if(options.expectEmpty){
    if(remote){
      syncRemoteSession(tableId,remote);
      showSessionConflict("移動先テーブルは他端末で使用中になりました。最新状態を確認してください。");
      throw new Error("session target occupied");
    }
    return true;
  }
  if(options.expectCreate){
    if(remote){
      syncRemoteSession(tableId,remote);
      showSessionConflict("このテーブルは他端末で先に入店済みです。最新状態を確認してください。");
      throw new Error("session already exists");
    }
    return true;
  }
  if(!remote){
    syncRemoteSession(tableId,null);
    showSessionConflict("このテーブルは他端末で会計済み、または削除済みです。保存せず最新状態へ戻します。");
    throw new Error("session no longer exists");
  }
  if(!sameSession(remote,expected)){
    syncRemoteSession(tableId,remote);
    showSessionConflict("このテーブルは他端末で別の営業データに更新されています。保存せず最新状態へ戻します。");
    throw new Error("session changed");
  }
  return true;
}
async function guardedSessionSet(tableId,session,options={}){
  ensureSessionId(session);
  const res=await guardedSessionUpdate(tableId,session,{[FB_ROOT+"/sessions/"+tableId]:session},options);
  markSessionGuard(session);
  return res;
}
async function guardedSessionNodeTransaction(tableId,session,options={}){
  if(!requireFirebaseReady(options))throw new Error("Firebase is not ready for session write");
  ensureSessionId(session);
  let conflict=null;
  const writeNonce=Date.now()+"_"+Math.random().toString(36).slice(2);
  const ref=window._db.ref(FB_ROOT+"/sessions/"+tableId);
  const res=await ref.transaction(remote=>{
    conflict=null;
    if(options.expectEmpty||options.expectCreate){
      if(remote){conflict={remote,message:"このテーブルは他端末で使用中です。最新状態を確認してください。"};return;}
    }else{
      if(!remote){conflict={remote:null,message:"このテーブルは他端末で会計済み、または削除済みです。保存せず最新状態へ戻します。"};return;}
      if(!sameSession(remote,session)){conflict={remote,message:"このテーブルは他端末で更新されています。保存せず最新状態へ戻します。"};return;}
    }
    return ensureSessionId({
      ...cloneData(session),
      _rev:remote?Number(remote._rev||0)+1:1,
      _nodeWriteVersion:_verNum(APP_VERSION),
      _nodeWriteNonce:writeNonce
    });
  },null,false);
  if(!res.committed){
    if(conflict){
      syncRemoteSession(tableId,conflict.remote);
      showSessionConflict(conflict.message);
    }
    const err=new Error(conflict?"session conflict":"session transaction aborted");
    if(conflict)err.userMessage=conflict.message;
    throw err;
  }
  const saved=res.snapshot.val();
  if(saved){
    session._rev=saved._rev;
    syncRemoteSession(tableId,saved);
  }
  markSessionGuard(session);
  return{sessions:{[tableId]:saved}};
}
async function guardedQueuedSessionSave(tableId,session,options={}){
  const updates={[FB_ROOT+"/sessions/"+tableId]:session};
  if(sessionNodeTransactionsSupported===false)return guardedSessionUpdate(tableId,session,updates,options);
  try{
    const res=await guardedSessionNodeTransaction(tableId,session,options);
    sessionNodeTransactionsSupported=true;
    return res;
  }catch(e){
    if(!isFirebasePermissionDenied(e))throw e;
    sessionNodeTransactionsSupported=false;
    return guardedSessionUpdate(tableId,session,updates,options);
  }
}
async function guardedSessionUpdate(tableId,session,updates,options={}){
  ensureSessionId(session);
  let conflict=null;
  const res=await guardedRootTransaction(root=>{
    const remote=getPathValue(root,"sessions/"+tableId)||null;
    if(options.expectEmpty){
      if(remote){conflict={remote,message:"移動先テーブルは他端末で使用中になりました。最新状態を確認してください。"};return null;}
    }else if(options.expectCreate){
      if(remote){conflict={remote,message:"このテーブルは他端末で先に入店済みです。最新状態を確認してください。"};return null;}
    }else{
      if(!remote){conflict={remote:null,message:"このテーブルは他端末で会計済み、または削除済みです。保存せず最新状態へ戻します。"};return null;}
      if(!sameSession(remote,session)){conflict={remote,message:"このテーブルは他端末で更新されています。保存せず最新状態へ戻します。"};return null;}
    }
    const checked=options.checker?options.checker(root):{ok:true};
    if(checked===false||checked?.ok===false){
      throw Object.assign(new Error(checked?.message||"session update conflict"),{userMessage:checked?.message});
    }
    let nextUpdates={...updates};
    const sessionPath=FB_ROOT+"/sessions/"+tableId;
    if(nextUpdates[sessionPath]){
      nextUpdates[sessionPath]=ensureSessionId({...nextUpdates[sessionPath],_rev:remote?Number(remote._rev||0)+1:1});
    }
    Object.keys(nextUpdates).forEach(path=>{
      const relative=stripRootPath(path);
      if(!relative.startsWith("sessions/")||path===sessionPath||!nextUpdates[path])return;
      const targetRemote=getPathValue(root,relative)||null;
      nextUpdates[path]=ensureSessionId({...nextUpdates[path],_rev:targetRemote?Number(targetRemote._rev||0)+1:1});
    });
    nextUpdates=prepareVersionedRecordUpdates(root,nextUpdates,options);
    return applyRootUpdates(root,nextUpdates);
  });
  if(conflict){
    syncRemoteSession(tableId,conflict.remote);
    showSessionConflict(conflict.message);
    throw new Error("session conflict");
  }
  const saved=getPathValue(res,"sessions/"+tableId);
  if(saved&&session&&typeof session==="object")session._rev=saved._rev;
  Object.keys(updates||{}).forEach(path=>{
    const relative=stripRootPath(path);
    if(!relative.startsWith("sessions/"))return;
    const targetId=relative.split("/")[1];
    syncRemoteSession(targetId,getPathValue(res,relative)||null);
  });
  markSessionGuard(session);
  syncVersionedRecordsFromRoot(res,updates);
  return res;
}

// ===== SESSIONS =====
async function startSession(){
  if(checkinBusy||!at)return;
  const{guests,setMenu,honShimeis,douhan,freedrink,single}=ci;
  if(!setMenu)return;
  const tableId=at;
  const items=[];
  const sm=[...(S.menus.normalSets||[]),...(S.menus.sets||[])].find(s=>s.id===setMenu);
  if(sm)items.push({id:sm.id,label:sm.label,price:sm.price,qty:guests,minutes:sm.minutes,isSet:true});
  honShimeis.forEach(cid=>{const c=S.casts.find(c=>c.id===cid);items.push({id:"hs_"+cid,label:"本指名料 ("+c?.name+")",price:HON_SHIMEI_PRICE,qty:1,castId:cid,castName:c?.name||"",isHonShimei:true});});
  if(douhan)items.push({id:"dh",label:"同伴料",price:3000,qty:1});
  if(freedrink)items.push({id:"fd",label:freeDrinkLabel(60),price:freeDrinkPriceForMinutes(60),qty:guests,isFreeDrink:true,freeDrinkMinutes:60});
  if(single)items.push({id:"sc",label:"シングルチャージ",price:2000,qty:guests});
  let st=Date.now();
  if(etv)st=hhmm2ts(etv);
  const si=items.find(i=>i.isSet);
  const desired=markSessionGuard({sessionId:"ses_"+st+"_"+Math.random().toString(36).slice(2,8),tableId,startTime:st,guests,items,setEndTime:si?st+si.minutes*60000:null,honShimeis,banaiShimeis:[],note:ci.note||""});
  checkinBusy=true;
  rModal();
  try{
    // Firebaseでテーブル作成が確定するまで、オーダー操作を開始させない。
    await queueSessionSave(tableId,desired,{expectCreate:true});
    sbs(true,"同期済み ✓");
    at=tableId;vw="floor";md=null;resetCheckinState();
    render();openFloorDetail(tableId);
  }catch(e){
    sbs(false,"保存エラー");
    if(md&&String(md).indexOf("ci-")===0){
      alert(e.userMessage||"チェックインを保存できませんでした。入力内容を保持したまま再試行してください。");
    }
  }finally{
    checkinBusy=false;
    if(md&&String(md).indexOf("ci-")===0)rModal();
  }
}
function roomTypeFromItem(item){
  if(!item)return"";
  if(item.roomType==="karaoke"||item.isKaraokeCharge||String(item.label||"").includes("カラオケ室料"))return"karaoke";
  if(item.roomType==="vip"||item.isVipCharge)return"vip";
  return"";
}
function sessionRoomType(s){
  const roomItems=(s?.items||[]).filter(i=>i&&(i.isRoomCharge||i.isVipCharge||i.isKaraokeCharge||i.roomType==="vip"||i.roomType==="karaoke"||String(i.label||"").includes("カラオケ室料")));
  const base=roomItems.find(i=>!i.isRoomExtension)||roomItems[0];
  return roomTypeFromItem(base);
}
function roomTypeLabel(type){return type==="karaoke"?"カラオケ":"VIP";}
function roomMenuItems(type){return type==="karaoke"?(S.menus.karaoke||[]):(S.menus.vip||[]);}
function roomChargeItem(type,menu,guests,options={}){
  if(!menu)return null;
  const minutes=Math.max(0,Number(options.minutes)||Number(menu.minutes)||0);
  const baseMinutes=Math.max(1,Number(menu.minutes)||minutes||1);
  const price=Math.max(0,options.scaleToMinutes?Math.round((Number(menu.price)||0)*minutes/baseMinutes):Number(menu.price)||0);
  const isExtension=options.isExtension===true;
  const label=options.scaleToMinutes?roomTypeLabel(type)+"室料延長 "+minutes+"分":String(menu.label||roomTypeLabel(type)+"室料");
  return{
    id:(options.idPrefix||"room")+"_"+String(menu.id||type)+"_"+Date.now(),label,price,
    qty:type==="karaoke"?Math.max(1,Number(guests)||1):1,
    category:type==="karaoke"?"karaokeRoom":"vipRoom",isRoomCharge:true,roomType:type,roomMinutes:minutes,isRoomExtension:isExtension,
    ...(type==="vip"?{isVipCharge:true}:{isKaraokeCharge:true}),...(isExtension?{isExtension:true}:{})
  };
}
function roomChargeItemForMinutes(type,minutes,guests,options={}){
  const targetMinutes=Math.max(1,Number(minutes)||0);
  const menus=roomMenuItems(type).filter(item=>(Number(item.price)||0)>=0&&Number(item.minutes)>0);
  const exact=menus.find(item=>Number(item.minutes)===targetMinutes);
  const base=exact||menus.slice().sort((a,b)=>Number(a.minutes)-Number(b.minutes))[0];
  if(!base)return null;
  return roomChargeItem(type,base,guests,{...options,minutes:targetMinutes,scaleToMinutes:!exact});
}
function addExt(ext,wsc){
  const gid="eg_"+Date.now();const s=S.sessions[at];
  const roomType=sessionRoomType(s);
  const extRoom=roomType?roomChargeItemForMinutes(roomType,ext.minutes,s.guests,{isExtension:true,idPrefix:"roomext"}):null;
  if(roomType&&!extRoom){alert(roomTypeLabel(roomType)+"室料が設定されていないため延長できません。設定タブで室料を登録してください。");return;}
  const becs=banaiExtCastIds.length>0?banaiExtCastIds:[];
  const becNames=becs.map(id=>S.casts.find(c=>c.id===id)?.name||"").filter(Boolean);
  const becExtra=becs.length>0?{isBanaiExtension:true,banaiExtCastIds:becs,banaiExtCastNames:becNames}:{};
  const ni=[{id:"e_"+gid,label:ext.label,price:ext.price,qty:s.guests,isExtension:true,extMinutes:ext.minutes,groupId:gid,...becExtra}];
  if(wsc&&needsExtensionSingleCharge(s,ext.minutes))ni.push({id:"sc_"+gid,label:"\u30b7\u30f3\u30b0\u30eb\u30c1\u30e3\u30fc\u30b8\uff08\u5ef6\u9577\uff09",price:singleChargePrice(),qty:1,isExtension:true,groupId:gid,...becExtra});
  if(hasFreeDrinkItem(s)){const fdMinutes=Number(ext.minutes)||60;ni.push({id:"fd_"+gid,label:freeDrinkLabel(fdMinutes,true),price:freeDrinkPriceForMinutes(fdMinutes,s),qty:s.guests,groupId:gid,isFreeDrink:true,freeDrinkMinutes:fdMinutes});}
  if(extRoom)ni.push({...extRoom,groupId:gid,...becExtra});
  s.items=[...s.items,...ni];s.setEndTime=(s.setEndTime||Date.now())+ext.minutes*60000;
  banaiExtCastIds=[];
  save("sessions/"+at,S.sessions[at]);closeM();renderOrderPartial();
}
function addRoomCharge(type,itemId){
  const s=S.sessions[at];
  const existingType=sessionRoomType(s);
  if(existingType&&existingType!==type){alert("既に"+roomTypeLabel(existingType)+"室料が選択されています。変更する場合は現在の室料を削除してください。");return;}
  const menu=roomMenuItems(type).find(item=>String(item.id)===String(itemId));
  const item=roomChargeItem(type,menu,s.guests);
  if(!item)return;
  s.items=[...s.items,item];
  if(type==="vip"&&item.roomMinutes)s.vipEndTime=Math.max(Date.now(),Number(s.vipEndTime)||0)+item.roomMinutes*60000;
  save("sessions/"+at,S.sessions[at]);closeM();renderOrderPartial();
}
async function addBanai(cid){
  const c=S.casts.find(c=>c.id===cid);if(!c)return;
  const current=S.sessions[at];if(!current)return;
  if((current.items||[]).some(i=>i.isHonShimei&&i.castId===cid))return;
  if((current.items||[]).some(i=>i.isBanaiShimei&&i.castId===cid))return;
  const desiredSession=cloneData(current);
  desiredSession.items=[...desiredSession.items,{id:"b_"+cid+"_"+Date.now(),label:"場内指名料 ("+c.name+")",price:BANAI_SHIMEI_PRICE,qty:1,castId:cid,castName:c.name,isBanaiShimei:true}];
  desiredSession.banaiShimeis=[...(desiredSession.banaiShimeis||[]),cid];
  const freeA=Object.values(S.assignments||{}).find(a=>String(a.castId)===String(cid)&&a.tableId===at&&!a.endTime&&a.type==="free");
  const desiredAssignment=freeA?{...cloneData(freeA),type:"banai"}:null;
  // sessionsとassignmentsをレコード単位でアトミック保存
  if(window._db){
const _cu={};
_cu[FB_ROOT+"/sessions/"+at]=desiredSession;
if(desiredAssignment)_cu[FB_ROOT+"/assignments/"+freeA.id]=desiredAssignment;
try{
  await queueSessionUpdate(at,session=>({..._cu,[FB_ROOT+"/sessions/"+at]:session}),{
    session:desiredSession,
    expectedRecords:freeA?{["assignments/"+freeA.id]:cloneData(freeA)}:{}
  });
  sbs(true,"同期済み ✓");
}catch(e){
  sbs(false,"保存エラー");
  alert(e.userMessage||"場内指名の保存に失敗しました。最新状態を確認してください。");
  return;
}
  }
  closeM();
  setTimeout(()=>{render();refreshFloorModal();},50);
}
function applyET(){
  const v=document.getElementById("eti")?.value||etv;
  if(!v){closeM();return;}
  const ns=hhmm2ts(v);
  const s=S.sessions[at];const df=ns-s.startTime;
  s.startTime=ns;if(s.setEndTime)s.setEndTime+=df;if(s.vipEndTime)s.vipEndTime+=df;
  etv=v;
  save("sessions/"+at,S.sessions[at]);closeM();
  if(vw==="floor")render();else renderOrderPartial();
}
async function remItem(id){
  const current=S.sessions[at];const t=current?.items?.find(i=>i.id===id);if(!t)return;
  const desired=cloneData(current);
  let assignmentExpected=null;
  let assignmentDesired=null;
  if(t.isExtension&&t.groupId){
const ei=desired.items.find(i=>i.groupId===t.groupId&&i.extMinutes);
const mn=ei?ei.extMinutes:0;
desired.items=(desired.items||[]).filter(i=>i.groupId!==t.groupId);
if(desired.setEndTime&&mn>0)desired.setEndTime-=mn*60000;
  }else if(t.isSet){
const n=t.addedGuests||0;
desired.items=(desired.items||[]).filter(i=>i.id!==id);
if(n>0)desired.guests=Math.max(1,desired.guests-n);
const hasSet=(desired.items||[]).some(i=>i.isSet);
if(!hasSet)desired.setEndTime=null;
  }else if(t.isHonShimei){
desired.items=(desired.items||[]).filter(i=>i.id!==id);
desired.honShimeis=(desired.honShimeis||[]).filter(cid=>cid!==t.castId);
  }else if(t.isBanaiShimei){
desired.items=(desired.items||[]).filter(i=>i.id!==id);
desired.banaiShimeis=(desired.banaiShimeis||[]).filter(cid=>cid!==t.castId);
// リストタブ: banaiアサインをfreeに戻す。sessionsと同一書き込みで競合を防ぐ
const banaiA=Object.values(S.assignments||{}).find(a=>a.tableId===at&&String(a.castId)===String(t.castId)&&!a.endTime&&a.type==="banai");
if(banaiA){
  assignmentExpected=cloneData(banaiA);
  assignmentDesired={...cloneData(banaiA),type:"free"};
}
  }else{
desired.items=(desired.items||[]).filter(i=>i.id!==id);
  }
  try{
    if(assignmentDesired){
      const updates={
        [FB_ROOT+"/sessions/"+at]:desired,
        [FB_ROOT+"/assignments/"+assignmentDesired.id]:assignmentDesired
      };
      await queueSessionUpdate(at,session=>({...updates,[FB_ROOT+"/sessions/"+at]:session}),{
        session:desired,
        expectedRecords:{["assignments/"+assignmentDesired.id]:assignmentExpected}
      });
    }else{
      await queueSessionSave(at,desired);
    }
    sbs(true,"同期済み ✓");
  }catch(e){
    sbs(false,"保存エラー");
    alert(e.userMessage||"明細削除に失敗しました。最新状態を確認してください。");
    return false;
  }
  if(t.isSet)render();else renderOrderPartial();
  return true;
}
// qty モーダル: DOM再構築なしで表示を更新（iPad キーボード維持用）
function updateQtyDisplay(v){
  qv=Math.max(1,parseInt(v)||1);
  const inp=document.getElementById('qty-inp');
  if(inp&&parseInt(inp.value)!==qv)inp.value=qv;
  const pr=document.getElementById('qty-preview');
  const unit=qm?.unitLabel||"個";
  if(pr)pr.innerHTML='<span style="font-size:13px;color:#888;">'+qv+unit+' × ¥'+fmt(qm?.price||0)+' = </span><span style="font-size:18px;font-weight:700;color:#d4a017;">¥'+fmt(qv*(qm?.price||0))+'</span>';
  document.querySelectorAll('[data-qbtn]').forEach(b=>{
const n=parseInt(b.dataset.qbtn);
const sel=n===qv;
b.style.background=sel?'linear-gradient(135deg,#b8960c,#e8c84a)':'rgba(255,255,255,.06)';
b.style.color=sel?'#1a1200':'#e8dcc8';
  });
}
// 営業日選択モーダル: 日付変更時に警告のみ更新（DOM再構築なし）
function updateBizDateWarn(val){
  window._selBizDate=val;
  const el=document.getElementById('biz-date-warn');
  if(!el)return;
  el.style.display=val&&S.bizDays[val]?'':'none';
}
function confQty(){
  if(!qm)return;const qty=Math.max(1,qv);
  const s=S.sessions[at];
  const isCastDrink=qm.category==="castDrink";
  s.items=[...s.items,{id:qm.id+"_"+Date.now(),label:qm.itemLabel||qm.label,price:qm.price,qty,category:qm.category||"",...(qm.itemData||{})}];
  save("sessions/"+at,S.sessions[at]);qm=null;qv=1;
  if(isCastDrink){cds=0;cdc=null;}
  closeM();renderOrderPartial();
}
function openCastDrinkQty(cid,price,drinkLabel){
  const c=S.casts.find(c=>String(c.id)===String(cid));
  const amount=Math.max(0,Number(price)||0);
  if(!c||amount<=0)return;
  qv=1;
  qm={
    id:"cd",label:String(drinkLabel||"キャストDrink")+" ("+c.name+")",itemLabel:"キャストDrink ("+c.name+")",price:amount,category:"castDrink",
    qtyLabel:"杯数を選択",unitLabel:"杯",confirmLabel:"オーダーする",
    itemData:{castId:c.id,castName:c.name,backTargetCastIds:[String(c.id)],backTargetCastNames:[c.name],backType:"castDrink",backAllocation:"orderedCast"}
  };
  om("qty");
}
function addCD(cid,did){
  const d=S.menus.castDrinks.find(d=>String(d.id)===String(did));
  if(d)openCastDrinkQty(cid,d.price,d.label);
}
function addCustom(){
  const lEl=document.getElementById("cu-label");
  const pEl=document.getElementById("cu-price");
  const p=parseInt(pEl?.value||"",10);
  if(isNaN(p)||p<0){if(pEl)pEl.focus();return;}
  const l=lEl?.value||"その他";
  const s=S.sessions[at];
  s.items=[...s.items,{id:"cu_"+Date.now(),label:l,price:p,qty:1}];
  save("sessions/"+at,S.sessions[at]);closeM();renderOrderPartial();
}
function addGuestCustom(){
  const lEl=document.getElementById("gcu-label");
  const pEl=document.getElementById("gcu-price");
  const p=parseInt(pEl?.value||"",10);
  if(isNaN(p)||p<0){if(pEl)pEl.focus();return;}
  const l=lEl?.value||"その他";
  const s=S.sessions[at];
  s.items=[...s.items,{id:"gcu_"+Date.now(),label:l,price:p,qty:1}];
  save("sessions/"+at,S.sessions[at]);closeM();renderOrderPartial();
}
function addCastCustomItem(itemId){
  const item=(S.menus.castCustomItems||[]).find(x=>x.id===itemId);if(!item)return;
  const s=S.sessions[at];
  s.items=[...s.items,{id:"cci_"+itemId+"_"+Date.now(),label:item.label,price:item.price,qty:1}];
  save("sessions/"+at,S.sessions[at]);closeM();renderOrderPartial();
}
function addDiscount(id){
  const d=(S.menus.discounts||[]).find(x=>x.id===id);if(!d)return;
  const s=S.sessions[at];const tgt=window._discTarget||'subtotal';
  const{subtotal,total}=ct(s);
  const base=tgt==='total'?total:subtotal;
  let amt=0;
  if(d.type==="percent")amt=Math.floor(base*d.value/100);
  else amt=Math.min(d.value||d.price||0,base);
  if(amt<=0)return;
  const lbl=d.label+(tgt==='total'?' (合計割引)':'');
  s.items=[...s.items,{id:"disc_"+Date.now(),label:lbl,price:-amt,qty:1,isDiscount:true,discountTarget:tgt}];
  save("sessions/"+at,S.sessions[at]);closeM();renderOrderPartial();
}
function addCustomDiscount(){
  const el=document.getElementById("disc-custom");
  const v=parseInt(el?.value||"",10);if(!v||v<=0){if(el)el.focus();return;}
  const s=S.sessions[at];const tgt=window._discTarget||'subtotal';
  const{subtotal,total}=ct(s);
  const base=tgt==='total'?total:subtotal;
  const amt=Math.min(v,base);
  const lbl='割引 -¥'+fmt(amt)+(tgt==='total'?' (合計)':'');
  s.items=[...s.items,{id:"disc_"+Date.now(),label:lbl,price:-amt,qty:1,isDiscount:true,discountTarget:tgt}];
  save("sessions/"+at,S.sessions[at]);closeM();renderOrderPartial();
}
function remItemDisc(id){const s=S.sessions[at];if(!s)return;s.items=(s.items||[]).filter(i=>i.id!==id);save("sessions/"+at,S.sessions[at]);renderOrderPartial();rModal();}
// 後からセット/指名を追加
function addSetToSession(setId, addGuests){
  const s=S.sessions[at];if(!s)return;
  const sm=[...(S.menus.normalSets||[]),...(S.menus.sets||[])].find(x=>x.id===setId);if(!sm)return;
  const n=Math.max(1,parseInt(addGuests)||1);
  // 新セット追加（追加人数分）。addedGuests属性で追加人数を記録（削除時に戻すため）
  s.items=[...s.items,{id:sm.id+"_"+Date.now(),label:sm.label,price:sm.price,qty:n,minutes:sm.minutes,isSet:true,addedGuests:n}];
  if(!s.setEndTime)s.setEndTime=Date.now()+sm.minutes*60000;
  // 人数のみ加算（FD・SCは連動しない）
  s.guests=s.guests+n;
  save("sessions/"+at,S.sessions[at]);closeM();render();refreshFloorModal();
}
function reduceGuests(n){
  const s=S.sessions[at];if(!s)return;
  s.guests=Math.max(1,n);
  save("sessions/"+at,S.sessions[at]);closeM();render();refreshFloorModal();
}
function addHonShimeiToSession(cid){
  const s=S.sessions[at];if(!s)return;
  const c=S.casts.find(c=>c.id===cid);if(!c)return;
  if((s?.items||[]).some(i=>i.isHonShimei&&i.castId===cid))return;
  s.items=[...s.items,{id:"hs_"+cid+"_"+Date.now(),label:"本指名料 ("+c.name+")",price:HON_SHIMEI_PRICE,qty:1,castId:cid,castName:c.name,isHonShimei:true}];
  s.honShimeis=[...(s.honShimeis||[]),cid];
  save("sessions/"+at,S.sessions[at]);renderOrderPartial();
}
async function checkout(){
  if(!at||!S.sessions[at])return;
  if(checkoutBusy)return;
  checkoutBusy=true;
  document.querySelectorAll(".sp-amt").forEach((el,i)=>{
  if(coState.splits[i])coState.splits[i].amount=parseInt(el.value)||0;
  });
  const s=S.sessions[at];
  try{await waitForSessionSaveQueue(at);}
  catch(e){checkoutBusy=false;return;}
  try{await ensureSessionCurrent(at,s);}
  catch(e){checkoutBusy=false;return;}
  const totals=ct(s);
  const splits=coState.splits&&coState.splits.length>0?coState.splits:null;
  const payMethod=splits?splits[0].method:(coState.payMethod||"cash");
  const checkoutTableId=at; // atリセット前に保存
  const now_co=Date.now();
  const rec={
id:now_co,
tableId:checkoutTableId,
tableLabel:S.tables.find(t=>t.id===checkoutTableId)?.label,
startTime:s.startTime,
endTime:now_co,
guests:s.guests,
items:s.items,
note:s.note||"",
payMethod,
splits:splits||null,
...totals
  };
  const shouldPrintStoreCopy=confirm("支払方法などを記載した完成された店舗控えを印刷しますか？");
  // 全データをアトミックに保存（history/assignment/shiftはレコード単位書き込みで同時会計の上書き競合を防ぐ）
  if(window._db){
const _cu={};
const expectedRecords={};
_cu[FB_ROOT+"/history/"+rec.id]=rec;
_cu[FB_ROOT+"/sessions/"+checkoutTableId]=null;
const _chkShiftIds=new Set();
Object.values(S.assignments||{}).forEach(a=>{
  if(a.tableId===checkoutTableId&&!a.endTime){
    _cu[FB_ROOT+"/assignments/"+a.id]={...cloneData(a),endTime:now_co};
    expectedRecords["assignments/"+a.id]=cloneData(a);
    const shift=getShiftByCastId(a.castId);
    if(shift&&!_chkShiftIds.has(shift.id)){
      _chkShiftIds.add(shift.id);
      _cu[FB_ROOT+"/shifts/"+shift.id]=shiftWithStatus(shift,"waiting",now_co);
      expectedRecords["shifts/"+shift.id]=cloneData(shift);
    }
  }
});
try{await queueSessionUpdate(checkoutTableId,()=>_cu,{session:s,expectedRecords});}
catch(e){
  checkoutBusy=false;
  alert(e.userMessage||"会計保存に失敗しました。テーブルは閉じていません。最新状態を確認してください。");
  return;
}
  }
  S.history=[rec,...S.history.filter(h=>String(h.id)!==String(rec.id))];
  if(shouldPrintStoreCopy)eposPrint({...rec,isGuest:false},false);
  const fomEl=document.getElementById("floor-order-modal");if(fomEl)fomEl.style.display="none";
  at=null;vw="floor";coState={payMethod:null,splits:[]};closeM();render();
  checkoutBusy=false;
}
async function tableChange(newId){
  if(!at||!newId||newId===at)return;
  if(S.sessions[newId]){alert("移動先のテーブルは使用中です");return;}
  return withDataOperation("table:"+at,async()=>{
  const oldTid=at;
  const oldSession=cloneData(S.sessions[oldTid]);
  try{
    await waitForSessionSaveQueue(oldTid);
    await ensureSessionCurrent(oldTid,oldSession);
    await ensureSessionCurrent(newId,null,{expectEmpty:true});
  }catch(e){return;}
  const tcSessionId=oldSession.startTime||null;
  const movedSession={...cloneData(oldSession),tableId:newId};
  // アクティブなアサイン＋同セッションの終了済みアサイン（付け回し履歴）のtableIdも移動先に更新
  const movedAssignments=[];
  Object.values(S.assignments||{}).forEach(a=>{
if(a.tableId===oldTid&&(!a.endTime||(tcSessionId&&a.sessionId===tcSessionId))){
  movedAssignments.push({expected:cloneData(a),desired:{...cloneData(a),tableId:newId}});
}
  });
  // レコード単位書き込みで他端末のアサインを上書きしない
  if(window._db){
const _cu={};
const expectedRecords={};
_cu[FB_ROOT+"/sessions/"+newId]=movedSession;
_cu[FB_ROOT+"/sessions/"+oldTid]=null;
movedAssignments.forEach(({expected,desired})=>{
  _cu[FB_ROOT+"/assignments/"+expected.id]=desired;
  expectedRecords["assignments/"+expected.id]=expected;
});
try{
  await queueSessionUpdate(oldTid,()=>_cu,{
    session:oldSession,
    expectedRecords,
    checker:root=>(root.sessions||{})[newId]
      ?{ok:false,message:"移動先テーブルは他端末で使用中になりました。"}
      :{ok:true}
  });
  sbs(true,"同期済み ✓");
}catch(e){
  sbs(false,"保存エラー");
  alert(e.userMessage||"テーブル移動に失敗しました。最新状態を確認してください。");
  return;
}
  }
  at=newId;
  closeM();render();refreshFloorModal();
  });
}

// ===== RENDER ENGINE =====
// order画面の差分更新（スクロール位置を保持する）
let _floorModalRefreshPending=false;
function renderOrderPartial(){refreshFloorModal();}


function updateNav(){
  const inBiz=!!S.activeBizDay;
  const isAdmin=sessionStorage.getItem("genesis_admin")==="1";
  const nav=document.getElementById("main-nav");
  if(nav)nav.style.display="flex"; // 常時表示
  const opsBtn=document.getElementById("ops-btn");
  if(opsBtn)opsBtn.style.display=inBiz?"":"none";
  [["nf","floor"],["nli","list"],["nsh","shifts"],["nh","history"],["nan","analysis"],["ns","settings"],["nm","admin"]].forEach(([id,v])=>{
const el=document.getElementById(id);if(!el)return;
// フロア・リスト・出勤・売上は営業中のみ表示
const bizOnly=["floor","list","shifts","history"].includes(v);
if(bizOnly){el.style.display=inBiz?"":"none";}
// 管理は管理モード時のみ
else if(v==="admin"){el.style.display=isAdmin?"":"none";}
// 設定は常時表示
else{el.style.display="";}
el.className="nb"+((v==="floor"&&vw==="floor")||(v==="list"&&["list","tableDetail","assignHistory"].includes(vw))||(v===vw)?" ac":"");
  });
  // 営業ボタン: LOモード中は赤ハイライト
  const opsBtn2=document.getElementById("ops-btn");
  if(opsBtn2&&S.loMode){opsBtn2.style.background="rgba(255,68,68,.18)";opsBtn2.style.color="#ff4444";opsBtn2.style.borderColor="rgba(255,68,68,.4)";}
  else if(opsBtn2){opsBtn2.style.background="rgba(212,160,23,.12)";opsBtn2.style.color="#d4a017";opsBtn2.style.borderColor="rgba(212,160,23,.3)";}
  // 管理ボタン: 管理モード中はゴールドハイライト
  const mgmtBtn=document.getElementById("mgmt-btn");
  if(mgmtBtn&&isAdmin){mgmtBtn.style.background="rgba(212,160,23,.15)";mgmtBtn.style.color="#d4a017";mgmtBtn.style.borderColor="rgba(212,160,23,.3)";}
  else if(mgmtBtn){mgmtBtn.style.background="rgba(255,80,80,.12)";mgmtBtn.style.color="#ff6b6b";mgmtBtn.style.borderColor="rgba(255,80,80,.3)";}
  // 管理モード中のヘッダー強調
  const header=document.querySelector("header");
  if(header){header.style.borderBottom=isAdmin?"2px solid rgba(212,160,23,.5)":"";header.style.background=isAdmin?"rgba(212,160,23,.04)":"";}
}
function render(){
  updateNav();
  const m=document.getElementById("m");if(!m)return;
  try{
if(vw==="home"||(!S.activeBizDay&&!["history","shifts","settings","histlog","admin","backupDetail","analysis"].includes(vw)))m.innerHTML=rHome();
else if(vw==="floor")m.innerHTML=rFloor();
else if(vw==="list")m.innerHTML=rList();
else if(vw==="tableDetail")m.innerHTML=rTableDetail();
else if(vw==="assignHistory")m.innerHTML=rAssignHistory();
else if(vw==="history")m.innerHTML=rHist();
else if(vw==="analysis")m.innerHTML=rAnalysis();
else if(vw==="shifts")m.innerHTML=rShifts();
else if(vw==="settings")m.innerHTML=rSettings();
else if(vw==="admin")m.innerHTML=rAdmin();
else if(vw==="backupDetail")m.innerHTML=rBackupDetail();
else if(vw==="histlog")m.innerHTML=rHistLog();
  }catch(e){
console.error("render error:",vw,e);
m.innerHTML='<div style="padding:20px;color:#ff6b6b;font-size:13px;">表示エラー: '+e.message+'<br><button class="btn" onclick="sv(\'home\')" style="margin-top:12px;padding:8px 16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:4px;">ホームへ戻る</button></div>';
  }
  syncLegacyFloorCardSizes();
  if(!md)document.getElementById("md").innerHTML="";
}
let _renderPending=false;
function scheduleRender(){
  if(_renderPending)return;
  _renderPending=true;
  const schedule=window.requestAnimationFrame||function(fn){return setTimeout(fn,16);};
  schedule(()=>{_renderPending=false;render();});
}
function sv(v,extra){
  const _fom=document.getElementById("floor-order-modal");if(_fom)_fom.style.display="none";
  // 管理タブは管理モード時のみアクセス可
  if(v==="admin"&&sessionStorage.getItem("genesis_admin")!=="1")return;
  // home・histlog・history・shifts・settings・adminは営業日に関係なく常時アクセス可
  const alwaysOk=["home","histlog","history","analysis","shifts","settings","backupDetail","admin"];
  if(!S.activeBizDay&&!alwaysOk.includes(v))return;
  if(v==="tableDetail"&&extra)window._detailTid=extra;
  vw=v;if(!["tableDetail","assignHistory"].includes(v))at=null;render();
}
function tc2(id){if(!S.sessions[id]){openCheckinWizard(id);}else{openFloorDetail(id);}}
function openFloorDetail(id){
  at=id;etv=new Date(S.sessions[id].startTime).toTimeString().slice(0,5);
  const fom=document.getElementById("floor-order-modal");if(!fom)return;
  fom.style.display="flex";
  const inner=document.getElementById("fom-inner");
  if(inner){
if(DEV==="mobile"){inner.style.maxWidth="100vw";inner.style.maxHeight="100dvh";inner.style.padding="10px";inner.style.borderRadius="6px";}
else if(DEV==="tablet"){inner.style.maxWidth="min(900px,96vw)";inner.style.maxHeight="94vh";inner.style.padding="14px";inner.style.borderRadius="10px";}
else{inner.style.maxWidth="min(1400px,98vw)";inner.style.maxHeight="96vh";inner.style.padding="18px";inner.style.borderRadius="10px";}
inner.innerHTML=buildFloorOrderContent();
  }
}
function closeFloorDetail(){
  const fom=document.getElementById("floor-order-modal");if(fom)fom.style.display="none";
  at=null;render();
}
function refreshFloorModal(){
  const fom=document.getElementById("floor-order-modal");
  if(!fom||fom.style.display==="none")return;
  if(_floorModalRefreshPending)return;
  _floorModalRefreshPending=true;
  const schedule=window.requestAnimationFrame||function(fn){return setTimeout(fn,16);};
  schedule(()=>{
  _floorModalRefreshPending=false;
  const inner=document.getElementById("fom-inner");
  if(inner)inner.innerHTML=buildFloorOrderContent();
  });
}
function buildFloorOrderContent(){
  const s=S.sessions[at];if(!s)return'';
  const tl=S.tables.find(t=>t.id===at)?.label||'';
  const hn=(s.items||[]).filter(i=>i.isHonShimei).map(itemCastName).filter(Boolean);
  const bn=(s.items||[]).filter(i=>i.isBanaiShimei).map(itemCastName).filter(Boolean);
  const hasDh=(s.items||[]).some(i=>i.id==='dh'||i.label==='同伴料');
  const rv=rem(s.setEndTime);
  const urg=rv!==null&&rv>0&&rv<600000;const ovr=rv!==null&&rv<=0;
  const tc3=ovr?'#ff4444':urg?'#ff8c00':'#d4a017';
  const td=rv===null?'—':ovr?'- '+ts(-rv):ts(rv);
  const timeStr=new Date(s.startTime).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})+(s.setEndTime?' → '+new Date(s.setEndTime).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'}):'');
  const{total}=ct(s);
  const ondutyIds=getOndutyIds();
  // デバイス別サイズ
  const _m=DEV==="mobile",_t=DEV==="tablet";
  const fTbl=_m?'16px':_t?'18px':'20px';
  const fInfo=_m?'11px':_t?'12px':'13px';
  const fMeta=_m?'10px':_t?'11px':'12px';
  const fTimer=_m?'16px':_t?'18px':'20px';
  const fColH=_m?'9px':'10px';
  const fItem=_m?'11px':'12px';
  const fTotal=_m?'18px':_t?'20px':'22px';
  const colH=_m?'110px':_t?'140px':'160px';
  const colPad=_m?'8px':_t?'9px':'10px';
  const bPad=_m?'8px 10px':_t?'9px 12px':'10px 14px';
  const bFs=_m?'12px':'13px';
  const btnSm=`padding:${_m?'2px 7px':'3px 9px'};border-radius:4px;font-size:${_m?'10px':'11px'};touch-action:manipulation;`;
  const cols='repeat(auto-fill,minmax(100px,1fr))';
  const setCount=(s.items||[]).filter(isSetCatItem).length;
  const guestCount=(s.items||[]).filter(isGuestCatItem).length;
  const castCount=(s.items||[]).filter(isCastCatItem).length;
  const dtSt=`flex-shrink:0;width:100%;padding:5px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:4px;font-size:${fColH};touch-action:manipulation;margin-top:6px;`;
  // Item list helper for each column — fixed height + scroll
  const colItems=(items,color)=>{
const inner=items.length?items.map(i=>{
  const lb=i.qty>1?i.label+' ×'+i.qty:i.label;
  return '<div style="display:flex;justify-content:space-between;gap:4px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04);">'
    +'<span style="font-size:'+fItem+';color:#ccc;flex:1;line-height:1.4;word-break:break-all;">'+lb+'</span>'
    +'<span style="font-size:'+fItem+';color:'+color+';white-space:nowrap;">¥'+fmt(Math.abs(i.price*(i.qty||1)))+'</span>'
    +'</div>';
}).join(''):'<div style="font-size:'+fItem+';color:#3a3a3a;padding:6px 0;">なし</div>';
return '<div style="height:'+colH+';overflow-y:auto;margin-bottom:6px;">'+inner+'</div>';
  };
  const setItems=(s.items||[]).filter(isSetCatItem);
  const guestItems=(s.items||[]).filter(isGuestCatItem);
  const castItems=(s.items||[]).filter(isCastCatItem);
  const saveState=sessionSaveStates[at]||null;
  const saveWarn=saveState?.status==="error"?'<div style="flex-shrink:0;margin-bottom:8px;padding:8px 10px;background:rgba(255,80,80,.12);border:1px solid rgba(255,80,80,.35);color:#ffb4b4;border-radius:6px;font-size:'+fInfo+';line-height:1.5;font-weight:700;">'+saveState.message+'</div>':"";
  const saveOverlay=saveState?.status==="saving"?'<div style="position:absolute;inset:0;z-index:20;background:rgba(10,10,12,.58);backdrop-filter:blur(1px);display:flex;align-items:center;justify-content:center;pointer-events:auto;"><div style="padding:12px 18px;background:rgba(0,0,0,.72);border:1px solid rgba(212,160,23,.45);border-radius:8px;color:#d4a017;font-size:'+fInfo+';font-weight:900;letter-spacing:.04em;">\u4fdd\u5b58\u4e2d...</div></div>':"";
  let html='<div style="position:relative;display:flex;flex-direction:column;height:100%;min-height:0;">'
// HEADER
+'<div style="flex-shrink:0;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:8px;">'
+'<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;">'
+'<h3 style="font-family:\'Cormorant Garamond\',serif;font-size:'+fTbl+';color:#d4a017;margin:0;">'+tl+'</h3>'
+(isV(at)?'<span class="tag tv2">VIP</span>':"")
+'<span style="font-size:'+fInfo+';color:#e8dcc8;font-weight:600;">'+s.guests+'名</span>'
+(hasDh?'<span style="background:rgba(255,160,0,.18);border:1px solid #ffa000;color:#ffa000;border-radius:4px;padding:1px 6px;font-size:'+fColH+';font-weight:700;">同伴</span>':"")
+'<button class="btn" onclick="om(\'add-set\')" style="'+btnSm+'background:rgba(212,160,23,.12);border:1px solid rgba(212,160,23,.3);color:#d4a017;">人数追加</button>'
+(s.guests>1?'<button class="btn" onclick="om(\'reduce-guests\')" style="'+btnSm+'background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.25);color:#38bdf8;">人数削減</button>':"")
+'<span style="font-size:'+fColH+';color:'+(hn.length?'#ff4444':'#555')+'">'+(hn.length?'本指名 '+hn.join('・'):'フリー')+'</span>'
+'<button class="btn" onclick="om(\'add-hon\')" style="'+btnSm+'background:rgba(212,160,23,.12);border:1px solid rgba(212,160,23,.3);color:#d4a017;">本指名追加</button>'
+'<button class="btn" onclick="om(\'tc\')" style="'+btnSm+'background:rgba(0,200,255,.08);border:1px solid rgba(0,200,255,.25);color:#38bdf8;">TC</button>'
+'<button class="btn" onclick="closeFloorDetail()" style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:#888;font-size:15px;margin-left:auto;flex-shrink:0;touch-action:manipulation;">×</button>'
+'</div>'
+'<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">'
+'<span id="fom-starttime" style="font-size:'+fMeta+';color:#888;">'+timeStr+'</span>'
+'<span id="fom-timer" style="font-size:'+fTimer+';font-family:monospace;font-weight:700;color:'+tc3+';" class="'+(urg||ovr?'urg':'')+'">'+td+'</span>'
+'<button class="btn" onclick="etv=new Date(S.sessions[at].startTime).toTimeString().slice(0,5);om(\'et\')" style="padding:3px 10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:4px;font-size:'+fColH+';touch-action:manipulation;">時刻変更</button>'
+'</div>'
+'<input type="text" class="ip" placeholder="備考（タップして編集）" maxlength="40" value="'+(s.note||'')+'" oninput="S.sessions[at]&&(S.sessions[at].note=this.value)" onblur="saveNoteInline(this.value)" style="font-size:'+fMeta+';color:#ffa500;height:28px;padding:2px 10px;border-color:rgba(255,165,0,.2);background:rgba(255,165,0,.04);">'
+(bn.length?'<div style="margin-top:5px;display:flex;gap:4px;flex-wrap:wrap;">'+bn.map(n=>'<span style="font-size:'+fColH+';color:#4ade80;background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.2);border-radius:3px;padding:1px 6px;">場 '+n+'</span>').join('')+'</div>':"")
+'</div>'
+saveWarn
// CENTER 3-COLUMN — 注文済みアイテム + 詳細ボタン
+'<div style="flex:1;overflow:hidden;margin-bottom:8px;min-height:0;">'
+'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;height:100%;">'
// SET column
+'<div class="glass" style="border-radius:6px;padding:'+colPad+';display:flex;flex-direction:column;min-height:0;">'
+'<div style="font-size:'+fColH+';color:#d4a017;letter-spacing:.1em;margin-bottom:6px;font-weight:700;flex-shrink:0;">SET</div>'
+colItems(setItems,'#d4a017')
+'<button class="btn" onclick="om(\'setDetail\')" style="'+dtSt+'">詳細'+(setCount?' ('+setCount+')':'')+'</button>'
+'</div>'
// GUEST column
+'<div class="glass" style="border-radius:6px;padding:'+colPad+';display:flex;flex-direction:column;min-height:0;">'
+'<div style="font-size:'+fColH+';color:#38bdf8;letter-spacing:.1em;margin-bottom:6px;font-weight:700;flex-shrink:0;">GUEST</div>'
+colItems(guestItems,'#38bdf8')
+'<button class="btn" onclick="om(\'guestDetail\')" style="'+dtSt+'">詳細'+(guestCount?' ('+guestCount+')':'')+'</button>'
+'</div>'
// CAST column
+'<div class="glass" style="border-radius:6px;padding:'+colPad+';display:flex;flex-direction:column;min-height:0;">'
+'<div style="font-size:'+fColH+';color:#a78bfa;letter-spacing:.1em;margin-bottom:6px;font-weight:700;flex-shrink:0;">CAST</div>'
+colItems(castItems,'#a78bfa')
+'<button class="btn" onclick="om(\'castDetail\')" style="'+dtSt+'">詳細'+(castCount?' ('+castCount+')':'')+'</button>'
+'</div>'
+'</div></div>';
// BOTTOM
const _isAdmin=sessionStorage.getItem("genesis_admin")==="1";
html+='<div style="flex-shrink:0;display:flex;align-items:center;gap:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.06);">'
+'<div style="flex:1;"><div style="font-size:'+fColH+';color:#666;margin-bottom:2px;">合計</div>'
+'<div style="font-size:'+fTotal+';font-weight:700;color:#d4a017;" id="fom-total">'+pAmt(total)+'</div></div>'
+'<button class="btn gbg" onclick="om(\'co\')" style="padding:'+bPad+';font-size:'+bFs+';font-weight:700;border-radius:6px;touch-action:manipulation;">会計</button>'
+'<button class="btn" onclick="om(\'est\')" style="padding:'+bPad+';background:rgba(255,215,0,.08);border:1px solid rgba(255,215,0,.25);color:#ffd700;border-radius:6px;font-size:'+bFs+';font-weight:700;touch-action:manipulation;">概算</button>'
+'<button class="btn" onclick="om(\'disc\')" style="padding:'+bPad+';background:rgba(255,80,80,.1);border:1px solid rgba(255,80,80,.3);color:#ff6b6b;border-radius:6px;font-size:'+bFs+';font-weight:700;touch-action:manipulation;">割引</button>'
+(_isAdmin?'<button class="btn" onclick="om(\'deleteSession\')" style="padding:'+bPad+';background:rgba(255,30,30,.12);border:1px solid rgba(255,30,30,.35);color:#ff4444;border-radius:6px;font-size:'+bFs+';font-weight:700;touch-action:manipulation;">削除</button>':'')
+'</div>'
+saveOverlay
+'</div>'
return html;
}

// ===== HOME & 営業日管理 =====
function rHome(){
  const active=S.activeBizDay?S.bizDays[S.activeBizDay]:null;
  let html='<div style="max-width:480px;margin:0 auto;padding-top:32px;">';
  html+='<div style="text-align:center;margin-bottom:40px;">';
  html+='<div style="font-family:\'Cormorant Garamond\',serif;font-size:36px;font-weight:300;letter-spacing:.3em;color:#d4a017;">CLUB GENESIS</div>';
  html+='</div>';

  if(active){
// 営業中
html+='<div class="glass" style="border-radius:12px;padding:20px;margin-bottom:20px;text-align:center;border-color:rgba(212,160,23,.3);">';
html+='<div style="font-size:11px;color:#d4a017;letter-spacing:.15em;margin-bottom:6px;">OPEN</div>';
html+='<div style="font-size:28px;font-weight:700;color:#e8dcc8;margin-bottom:4px;">'+active.date+'</div>';
html+='<div style="font-size:12px;color:#888;">開始: '+new Date(active.startedAt).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})+'</div>';
html+='</div>';
// 当日の売上サマリー
const todaySales=(active.history||[]).reduce((a,h)=>a+h.total,0);
const pendingSales=Object.values(S.sessions).reduce((a,s)=>a+ct(s).total,0);
html+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:20px;">';
html+='<div style="text-align:center;padding:12px;background:rgba(74,222,128,.06);border:1px solid rgba(74,222,128,.15);border-radius:8px;"><div style="font-size:10px;color:#888;margin-bottom:4px;">会計済み</div><div style="font-size:15px;font-weight:700;color:#4ade80;">'+pAmt(todaySales)+'</div></div>';
html+='<div style="text-align:center;padding:12px;background:rgba(255,165,0,.06);border:1px solid rgba(255,165,0,.15);border-radius:8px;"><div style="font-size:10px;color:#888;margin-bottom:4px;">未収</div><div style="font-size:15px;font-weight:700;color:#ffa500;">'+pAmt(pendingSales)+'</div></div>';
html+='<div style="text-align:center;padding:12px;background:rgba(212,160,23,.06);border:1px solid rgba(212,160,23,.15);border-radius:8px;"><div style="font-size:10px;color:#888;margin-bottom:4px;">合計見込み</div><div style="font-size:15px;font-weight:700;color:#d4a017;">'+pAmt(todaySales+pendingSales)+'</div></div>';
html+='</div>';
// フロアへ
html+='<button class="btn gbg" onclick="sv(\'floor\')" style="width:100%;padding:16px;font-size:18px;font-weight:700;border-radius:10px;margin-bottom:12px;touch-action:manipulation;">フロアへ</button>';
html+='<button class="btn" onclick="sv(\'histlog\')" style="width:100%;padding:12px;font-size:14px;font-weight:700;border-radius:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;margin-bottom:12px;touch-action:manipulation;">過去の営業履歴</button>';
html+='<button class="btn" onclick="om(\'endBizDay\')" style="width:100%;padding:14px;font-size:15px;font-weight:700;border-radius:10px;background:rgba(255,80,80,.1);border:1px solid rgba(255,80,80,.3);color:#ff6b6b;touch-action:manipulation;">営業終了</button>';
  } else {
// 未営業
html+='<div style="text-align:center;margin-bottom:32px;">';
html+='<div style="font-size:13px;color:#555;margin-bottom:4px;">現在営業中の日はありません</div>';
html+='</div>';
html+='<button class="btn gbg" onclick="om(\'startBizDay\')" style="width:100%;padding:18px;font-size:18px;font-weight:700;border-radius:10px;margin-bottom:16px;touch-action:manipulation;">営業を開始する</button>';
html+='<button class="btn" onclick="sv(\'histlog\')" style="width:100%;padding:14px;font-size:15px;font-weight:700;border-radius:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;touch-action:manipulation;">過去の営業履歴</button>';
  }
  html+='</div>';
  return html;
}

function rHistLog(){
  // 過去の営業日一覧
  const days=Object.values(S.bizDays||{}).sort((a,b)=>b.date.localeCompare(a.date));
  let html='<div style="max-width:720px;margin:0 auto;">';
  html+='<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">';
  html+='<button class="btn" onclick="sv(\'home\')" style="font-size:12px;color:#888;padding:4px 0;background:none;">← ホーム</button>';
  html+='<h2 style="font-family:\'Cormorant Garamond\',serif;font-size:22px;color:#d4a017;">過去の営業履歴</h2>';
  html+='</div>';
  if(!days.length){html+='<div style="color:#555;font-size:14px;">履歴がありません</div></div>';return html;}
  days.forEach(day=>{
const sales=(day.history||[]).reduce((a,h)=>a+h.total,0);
const shiftCount=Object.values(day.shifts||{}).length;
const exp=expandedHist["day_"+day.id];
html+='<div class="glass" style="border-radius:8px;margin-bottom:10px;overflow:hidden;">';
// ヘッダー行
html+='<div style="padding:14px 16px;display:flex;justify-content:space-between;align-items:center;">';
html+='<div onclick="expandedHist[\'day_\'+\''+day.id+'\']='+(exp?"false":"true")+';render()" style="flex:1;cursor:pointer;">';
html+='<div style="font-size:16px;font-weight:700;color:#e8dcc8;">'+day.date+'</div>';
html+='<div style="font-size:11px;color:#666;margin-top:2px;">'+new Date(day.startedAt).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})+(day.endedAt?' 〜 '+new Date(day.endedAt).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}):' 〜 営業中')+'</div>';
html+='</div>';
html+='<div style="display:flex;align-items:center;gap:8px;">';
html+='<span style="font-size:15px;font-weight:700;color:#d4a017;">'+pAmt(sales)+'</span>';
html+='<button class="btn" data-dayid="'+day.id+'" onclick="event.stopPropagation();om(\'loadBizDayConfirm_\'+this.dataset.dayid)" style="padding:4px 10px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.2);color:#38bdf8;border-radius:4px;font-size:11px;touch-action:manipulation;">読み込み</button>';
html+='<button class="btn" data-dayid="'+day.id+'" onclick="event.stopPropagation();deleteBizDay(this.dataset.dayid)" style="padding:4px 10px;background:rgba(255,80,80,.1);border:1px solid rgba(255,80,80,.2);color:#ff6b6b;border-radius:4px;font-size:11px;touch-action:manipulation;">削除</button>';
html+='<span onclick="expandedHist[\'day_\'+\''+day.id+'\']='+(exp?"false":"true")+';render()" style="color:#555;font-size:16px;cursor:pointer;padding:4px;">'+(exp?"▲":"▼")+'</span>';
html+='</div></div>';
if(exp){html+=rDayDetail(day);}
html+='</div>';
  });
  html+='</div>';
  return html;
}


function pastAssignSessionKey(day,a){
  const hist=day?.history||[];
  if(a.sessionId!=null)return String(a.tableId||"")+"::"+String(a.sessionId);
  const rec=hist.find(h=>String(h.tableId||"")===String(a.tableId||"")&&Number(a.startTime||0)>=(Number(h.startTime||0)-60000)&&Number(a.startTime||0)<=((Number(h.endTime||0)||Number(h.startTime||0))+60000));
  return String(a.tableId||"")+"::"+String(rec?.startTime||a.startTime||a.id||"unknown");
}
function findPastAssignHistRec(day,tableId,sessionId,assigns){
  const hist=day?.history||[];
  let rec=hist.find(h=>String(h.tableId||"")===String(tableId||"")&&String(h.startTime||"")===String(sessionId||""));
  if(rec)return rec;
  const first=assigns?.[0];
  if(!first)return null;
  return hist.find(h=>String(h.tableId||"")===String(tableId||"")&&Number(first.startTime||0)>=(Number(h.startTime||0)-60000)&&Number(first.startTime||0)<=((Number(h.endTime||0)||Number(h.startTime||0))+60000))||null;
}
function rPastAssignHistory(day){
  const allA=Object.values(day?.assignments||{}).filter(Boolean).sort((a,b)=>(a.startTime||0)-(b.startTime||0));
  if(!allA.length)return "";
  const groups={};
  allA.forEach(a=>{
    const key=pastAssignSessionKey(day,a);
    if(!groups[key])groups[key]={tableId:a.tableId,sessionId:a.sessionId||null,assigns:[]};
    groups[key].assigns.push(a);
  });
  const sessions=Object.values(groups).sort((a,b)=>{
    const ta=a.assigns[0]?.sessionId||a.assigns[0]?.startTime||0;
    const tb=b.assigns[0]?.sessionId||b.assigns[0]?.startTime||0;
    return ta-tb;
  });
  const areaTypes=[
    {key:"hon",label:"\u672c\u6307\u540d",col:"#ff4444",types:["hon"]},
    {key:"free",label:"\u30d5\u30ea\u30fc",col:"#38bdf8",types:["free","harem"]},
    {key:"help",label:"\u30d8\u30eb\u30d7",col:"#e8dcc8",types:["help"]},
    {key:"banai",label:"\u5834\u5185\u6307\u540d",col:"#4ade80",types:["banai"]}
  ];
  let html='<div class="st" style="margin-top:14px;margin-bottom:10px;">\u4ed8\u3051\u56de\u3057\u5c65\u6b74 ('+allA.length+'\u4ef6)</div>';
  sessions.forEach(group=>{
    const assigns=group.assigns.sort((a,b)=>(a.startTime||0)-(b.startTime||0));
    const table=S.tables.find(t=>String(t.id)===String(group.tableId));
    const histRec=findPastAssignHistRec(day,group.tableId,group.sessionId,assigns);
    const sessionTs=histRec?.startTime||assigns[0]?.sessionId||assigns[0]?.startTime;
    const inTime=sessionTs?new Date(sessionTs).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}):"--:--";
    const guests=histRec?.guests||"?";
    const honNames=histRec?(histRec.items||[]).filter(i=>i.isHonShimei).map(itemCastName).filter(Boolean):[];
    const banaiNames=histRec?(histRec.items||[]).filter(i=>i.isBanaiShimei).map(itemCastName).filter(Boolean):[];
    html+='<div class="glass" style="border-radius:8px;margin-bottom:10px;overflow:hidden;border:1px solid rgba(255,255,255,.08);">';
    html+='<div style="padding:9px 12px;background:rgba(212,160,23,.06);border-bottom:1px solid rgba(212,160,23,.18);display:flex;align-items:center;flex-wrap:wrap;gap:7px;">';
    html+='<span style="font-size:14px;font-weight:700;color:#d4a017;">'+(table?.label||group.tableId||"\u30c6\u30fc\u30d6\u30eb\u4e0d\u660e")+'</span>';
    if(histRec?.note)html+='<span style="font-size:11px;color:#ffa500;">'+histRec.note+'</span>';
    html+='<span style="font-size:11px;color:#888;">'+inTime+'</span>';
    html+='<span style="font-size:11px;color:#aaa;">'+guests+'\u540d</span>';
    if(honNames.length)html+='<span style="font-size:10px;color:#ff4444;background:rgba(255,68,68,.1);padding:1px 6px;border-radius:8px;">\u672c: '+honNames.join("\u30fb")+'</span>';
    if(banaiNames.length)html+='<span style="font-size:10px;color:#4ade80;background:rgba(74,222,128,.1);padding:1px 6px;border-radius:8px;">\u5834: '+banaiNames.join("\u30fb")+'</span>';
    if(histRec)html+='<span data-hid="'+histRec.id+'" onclick="event.stopPropagation();window._viewHistRec=_findHistRec(Number(this.dataset.hid));window._histDetailBack=null;if(window._viewHistRec){md=\'viewHistDetail\';rModal();}" style="margin-left:auto;font-size:10px;color:#d4a017;padding:1px 7px;border:1px solid rgba(212,160,23,.35);border-radius:3px;cursor:pointer;">\u4f1d\u7968\u8a73\u7d30</span>';
    html+='</div>';
    areaTypes.forEach(area=>{
      const aItems=assigns.filter(a=>area.types.includes(a.type));
      if(!aItems.length)return;
      html+='<div style="padding:6px 12px 2px;">';
      html+='<div style="font-size:10px;font-weight:700;color:'+area.col+';padding:3px 8px;background:'+area.col+'12;border-left:2px solid '+area.col+';border-radius:0 3px 3px 0;margin-bottom:4px;">'+area.label+' ('+aItems.length+'\u4ef6)</div>';
      aItems.forEach(a=>{
        const sT=a.startTime?new Date(a.startTime).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}):"--:--";
        const eT=a.endTime?new Date(a.endTime).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}):"\u672a\u7d42\u4e86";
        const dur=a.endTime&&a.startTime?fmtDur(a.endTime-a.startTime):"";
        html+='<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.03);">';
        html+='<span style="font-size:13px;font-weight:700;color:#e8dcc8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+(a.castName||"\u540d\u524d\u306a\u3057")+'</span>';
        html+='<span style="font-size:11px;color:#888;white-space:nowrap;text-align:right;">'+sT+' \u2192 '+eT+(dur?' <span style="color:#555;">('+dur+')</span>':"")+'</span>';
        html+='</div>';
      });
      html+='</div>';
    });
    html+='</div>';
  });
  return html;
}

function rDayDetail(day){
  let html='<div style="padding:16px;border-top:1px solid rgba(255,255,255,.08);">';
  // 売上
  const hist=(day.history||[]).sort((a,b)=>a.startTime-b.startTime);
  const sales=hist.reduce((a,h)=>a+h.total,0);
  html+='<div class="st" style="margin-bottom:10px;">売上 ('+hist.length+'件 合計 '+pAmt(sales)+')</div>';
  hist.forEach(h=>{
const honN=(h.items||[]).filter(i=>i.isHonShimei).map(itemCastName).filter(Boolean);
const banN=(h.items||[]).filter(i=>i.isBanaiShimei).map(itemCastName).filter(Boolean);
html+='<div data-hid="'+h.id+'" onclick="window._viewHistRec=_findHistRec(Number(this.dataset.hid));window._histDetailBack=null;if(window._viewHistRec){md=\'viewHistDetail\';rModal();}" style="padding:7px 0;border-bottom:1px solid rgba(255,255,255,.04);display:flex;flex-wrap:wrap;align-items:center;gap:5px;cursor:pointer;">';
html+='<span style="font-size:13px;font-weight:700;color:#d4a017;">'+h.tableLabel+'</span>';
html+='<span style="font-size:12px;color:#aaa;">'+h.guests+'名</span>';
if(h.note)html+='<span style="font-size:11px;color:#ffa500;background:rgba(255,165,0,.1);padding:1px 6px;border-radius:8px;">'+h.note+'</span>';
if(honN.length)html+='<span style="font-size:10px;color:#ff4444;background:rgba(255,68,68,.1);padding:1px 6px;border-radius:8px;">本: '+honN.join("・")+'</span>';
if(banN.length)html+='<span style="font-size:10px;color:#4ade80;background:rgba(74,222,128,.1);padding:1px 6px;border-radius:8px;">場: '+banN.join("・")+'</span>';
html+='<span style="margin-left:auto;font-size:12px;color:#d4a017aa;">'+pAmt(h.total)+'</span>';
html+='<span style="font-size:10px;color:#d4a017;padding:1px 6px;border:1px solid rgba(212,160,23,.3);border-radius:3px;flex-shrink:0;">明細 ▶</span>';
html+='</div>';
  });
  // 出退勤
  const shifts=Object.values(day.shifts||{});
  if(shifts.length){
html+='<div class="st" style="margin-top:14px;margin-bottom:10px;">出退勤 ('+shifts.length+'名)</div>';
shifts.sort((a,b)=>a.clockIn-b.clockIn).forEach(sh=>{
  const inT=new Date(sh.clockIn).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"});
  const outT=sh.clockOut?new Date(sh.clockOut).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}):"退勤なし";
  const dur=sh.clockOut?fmtDur(sh.clockOut-sh.clockIn):"";
  const durStr=dur?"("+dur+")":"";
  html+='<div class="ir" style="font-size:13px;"><span style="color:#bbb;">'+sh.castName+'</span><span style="color:#888;">'+inT+' → '+outT+' '+durStr+'</span></div>';
});
  }
  html+=rPastAssignHistory(day);
  // CSV出力ボタン
  const gmsMeta=gmsGetExportMeta(day.date||day.id);
  const hasGmsSubmission=!!(gmsMeta&&gmsMeta.submissionId&&gmsMeta.payload);
  html+='<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;">';
  html+='<button class="btn" data-dayid="'+day.id+'" onclick="exportDayCSV(this.dataset.dayid)" style="padding:8px 16px;background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.25);color:#4ade80;border-radius:4px;font-size:12px;font-weight:600;touch-action:manipulation;">CSV出力</button>';
  html+='<button class="btn" data-dayid="'+day.id+'" onclick="'+(hasGmsSubmission?'redownloadGmsClosingJSON':'exportGmsClosingJSON')+'(this.dataset.dayid'+(hasGmsSubmission?'':',false')+')" style="padding:8px 16px;background:rgba(56,189,248,.1);border:1px solid rgba(56,189,248,.25);color:#0284c7;border-radius:4px;font-size:12px;font-weight:700;touch-action:manipulation;">'+(hasGmsSubmission?'前回JSON再ダウンロード':'GMS取込JSON')+'</button>';
  html+='<button class="btn" data-dayid="'+day.id+'" onclick="exportGmsClosingJSON(this.dataset.dayid,true)" '+(hasGmsSubmission?'':'disabled title="通常版の出力履歴がありません"')+' style="padding:8px 16px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.25);color:#d97706;border-radius:4px;font-size:12px;font-weight:700;touch-action:manipulation;'+(hasGmsSubmission?'':'opacity:.4;cursor:not-allowed;')+'">\u8a02\u6b63\u7248JSON</button>';
  html+='</div>';
  html+='</div>';
  return html;
}

function deleteBizDay(dayId){
  if(dayId===S.activeBizDay){alert("現在営業中の日は削除できません");return;}
  md="deleteBizDay_"+dayId;rModal();
}
function confirmDeleteBizDay(dayId){
  delete S.bizDays[dayId];
  save("bizDays",S.bizDays);
  closeM();render();
}
function saveBizDayEdit(dayId){
  const day=S.bizDays[dayId];if(!day)return;
  const dateEl=document.getElementById("edit-biz-date");
  if(dateEl&&dateEl.value&&dateEl.value!==day.date){
// 日付変更：古いキーを削除して新キーで保存
const newDate=dateEl.value;
const newDay={...day,id:newDate,date:newDate};
delete S.bizDays[dayId];
S.bizDays[newDate]=newDay;
  }
  save("bizDays",S.bizDays);
  closeM();render();
}
function deleteBizDayHist(dayId,idx){
  const day=S.bizDays[dayId];if(!day)return;
  day.history=(day.history||[]).filter((_,i)=>i!==idx);
  save("bizDays",S.bizDays);
  md="editBizDay_"+dayId;rModal();render();
}

function exportDayCSV(dayId){
  const day=S.bizDays[dayId];if(!day)return;
  const hist=day.history||[];
  if(!hist.length){alert("この営業日の売上データがありません");return;}
  const bom="\uFEFF";
  const header=["日時","テーブル","人数","小計","割引","税+SC","合計","支払方法"].join(",");
  const rows=hist.map(h=>[
new Date(h.startTime).toLocaleString("ja-JP"),
h.tableLabel||"",h.guests,
h.subtotal||0,h.discount||0,h.tax||0,h.total||0,
h.payMethod==="card"?"カード":"現金"
  ].join(","));
  const csv=bom+header+"\n"+rows.join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download="genesis_"+day.date+".csv";a.click();URL.revokeObjectURL(url);
}

function gmsInt(v){return Math.max(0,Math.floor(Number(v)||0));}
function gmsHHMM(ms){return ms?new Date(Math.round(Number(ms)/60000)*60000).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit",hour12:false}):"";}
function gmsMinutes(t){if(!/^\d{2}:\d{2}$/.test(t||""))return null;const[h,m]=t.split(":").map(Number);return h>=0&&h<=23&&m>=0&&m<=59?h*60+m:null;}
function gmsHours(start,end,breakMinutes){
  const s=gmsMinutes(start),e0=gmsMinutes(end);if(s==null||e0==null)return 0;
  let e=e0;if(e<s)e+=1440;
  return Math.round((Math.max(0,e-s-(parseInt(breakMinutes)||0))/60)*100)/100;
}
function gmsPaymentTotals(hist){
  let cash=0,card=0;
  (hist||[]).forEach(h=>{
    if(h.splits&&h.splits.length)h.splits.forEach(sp=>{if(sp.method==="card")card+=gmsInt(sp.amount);else cash+=gmsInt(sp.amount);});
    else if(h.payMethod==="card")card+=gmsInt(h.total);
    else cash+=gmsInt(h.total);
  });
  return{cash,card};
}
function gmsUniqueStrings(list){return[...new Set((list||[]).filter(x=>x!=null&&x!=="").map(String))];}
function gmsItemCategory(item){
  if(item.category)return item.category;
  const id=String(item.id||"");
  if(item.isKaraokeCharge||item.roomType==="karaoke")return"karaokeRoom";
  if(item.isVipCharge)return"vipRoom";
  if(item.isFreeDrink||id.startsWith("fd"))return"freeDrink";
  if(item.isHonShimei)return"honShimei";
  if(item.isBanaiShimei)return"banaiShimei";
  if(item.id==="dh"||item.label==="\u540c\u4f34\u6599")return"dohan";
  if(id.startsWith("cd_"))return"castDrink";
  if(item.isExtension)return item.isBanaiExtension?"banaiExtension":"extension";
  if(/\u30b7\u30e3\u30f3\u30d1\u30f3|\u30ef\u30a4\u30f3/.test(item.label||""))return"champagneWine";
  if(/\u30ad\u30fc\u30d7|\u30dc\u30c8\u30eb/.test(item.label||""))return"keepBottle";
  return"";
}
function gmsIsBanaiBackItem(item){const c=gmsItemCategory(item);return c==="champagneWine"||c==="keepBottle";}
function gmsBanaiExtensionSalesPhases(items){
  const phases=new Map();
  let currentIds=[];
  (items||[]).forEach(i=>{
    if(i.isBanaiExtension)currentIds=gmsUniqueStrings([...(i.banaiExtCastIds||[]),i.banaiExtCastId,i.castId]);
    if(!currentIds.length||i.isDiscount)return;
    const ids=[...currentIds].sort(),key=ids.join("|");
    if(!phases.has(key))phases.set(key,{ids,total:0,backTotal:0});
    const amount=gmsInt((i.price||0)*(i.qty||1));
    if(gmsIsBanaiBackItem(i))phases.get(key).backTotal+=amount;
    else phases.get(key).total+=amount;
  });
  return[...phases.values()].filter(p=>p.ids.length);
}
function gmsCastName(id,fallback){
  const c=allCasts().find(c=>String(c.id)===String(id));
  return c?.name||fallback||"";
}
function gmsCastSales(hist){
  const map={};
  const ensure=(id,name)=>{
    const k=String(id||name||"unknown");
    if(!map[k])map[k]={castId:String(id||""),castName:name||"",honShimeiSales:0,jonaiExtensionSales:0,jonaiExtensionBackSales:0,drinkSales:0,totalAttributedSales:0};
    return map[k];
  };
  (hist||[]).forEach(h=>{
    const items=h.items||[];
    const hon=[...new Map(items.filter(i=>i.isHonShimei&&i.castId!=null).map(i=>[String(i.castId),i])).values()];
    if(hon.length){
      const share=Math.floor(gmsInt(h.subtotal||h.total)/hon.length);
      hon.forEach(i=>{ensure(i.castId,gmsCastName(i.castId,i.castName||itemCastName(i))).honShimeiSales+=share;});
    }else{
      gmsBanaiExtensionSalesPhases(items).forEach(phase=>{
        const share=Math.floor((phase.total||0)/phase.ids.length);
        const backShare=Math.floor((phase.backTotal||0)/phase.ids.length);
        phase.ids.forEach(id=>{const row=ensure(id,gmsCastName(id,""));row.jonaiExtensionSales+=share;row.jonaiExtensionBackSales+=backShare;});
      });
    }
    items.filter(i=>gmsItemCategory(i)==="castDrink").forEach(i=>{
      const ids=gmsUniqueStrings(i.backTargetCastIds?.length?i.backTargetCastIds:[i.castId]);
      ids.forEach(id=>{ensure(id,gmsCastName(id,i.castName)).drinkSales+=gmsInt((i.price||0)*(i.qty||1));});
    });
  });
  return Object.values(map).map(r=>({...r,totalAttributedSales:r.honShimeiSales+r.jonaiExtensionSales+(r.jonaiExtensionBackSales||0)})).sort((a,b)=>b.totalAttributedSales-a.totalAttributedSales);
}
function gmsCastSalesSummary(rows){
  return(rows||[]).reduce((sum,row)=>({
    honShimeiSales:sum.honShimeiSales+gmsInt(row.honShimeiSales),
    jonaiExtensionSales:sum.jonaiExtensionSales+gmsInt(row.jonaiExtensionSales),
    jonaiExtensionBackSales:sum.jonaiExtensionBackSales+gmsInt(row.jonaiExtensionBackSales),
    drinkSales:sum.drinkSales+gmsInt(row.drinkSales),
    totalAttributedSales:sum.totalAttributedSales+gmsInt(row.totalAttributedSales)
  }),{honShimeiSales:0,jonaiExtensionSales:0,jonaiExtensionBackSales:0,drinkSales:0,totalAttributedSales:0});
}
function gmsTransactionItems(items){
  const src=(items||[]).filter(Boolean);
  const noHon=!src.some(i=>i.isHonShimei);
  let currentBanaiIds=[];
  return src.map(item=>{
    if(item.isBanaiExtension)currentBanaiIds=gmsUniqueStrings([...(item.banaiExtCastIds||[]),item.banaiExtCastId,item.castId]);
    const category=gmsItemCategory(item);
    let backTargetCastIds=gmsUniqueStrings(item.backTargetCastIds);
    let backType=item.backType||"",backAllocation=item.backAllocation||"";
    if(category==="castDrink"){
      backTargetCastIds=backTargetCastIds.length?backTargetCastIds:gmsUniqueStrings([item.castId]);
      backType=backType||"castDrink";backAllocation=backAllocation||"orderedCast";
    }else if(noHon&&currentBanaiIds.length&&gmsIsBanaiBackItem(item)){
      backTargetCastIds=currentBanaiIds;
      backType=backType||"jonaiExtension";
      backAllocation=backAllocation||(backTargetCastIds.length>1?"splitEvenly":"singleCast");
    }
    return{
      itemId:String(item.id||""),label:String(item.label||""),category,
      price:Number(item.price)||0,quantity:Math.max(0,Number(item.qty)||1),
      castId:item.castId==null?"":String(item.castId),castName:String(item.castName||""),
      banaiExtCastIds:(item.banaiExtCastIds||[]).map(String),
      isSet:!!item.isSet,isHonShimei:!!item.isHonShimei,isBanaiShimei:!!item.isBanaiShimei,
      isExtension:!!item.isExtension,isBanaiExtension:!!item.isBanaiExtension,isVipCharge:!!item.isVipCharge,isRoomCharge:!!(item.isRoomCharge||item.isVipCharge||item.isKaraokeCharge),isKaraokeCharge:!!item.isKaraokeCharge,roomType:String(item.roomType||roomTypeFromItem(item)||""),roomMinutes:Number(item.roomMinutes)||0,isRoomExtension:!!item.isRoomExtension,isDiscount:!!item.isDiscount,isFreeDrink:!!item.isFreeDrink,freeDrinkMinutes:Number(item.freeDrinkMinutes)||0,
      backTargetCastIds,backTargetCastNames:backTargetCastIds.map(id=>gmsCastName(id,"")),backType,backAllocation
    };
  });
}
function gmsTransactions(hist){
  return(hist||[]).map(h=>({
    transactionId:String(h.id||""),tableId:String(h.tableId||""),tableLabel:String(h.tableLabel||""),
    startTime:Number(h.startTime)||0,endTime:Number(h.endTime)||0,guests:gmsInt(h.guests),note:String(h.note||""),
    payMethod:h.payMethod==="card"?"card":"cash",
    splits:(h.splits||[]).map(sp=>({method:sp.method==="card"?"card":"cash",amount:gmsInt(sp.amount)})),
    subtotal:gmsInt(h.subtotal),discount:gmsInt(h.discount),tax:gmsInt(h.tax),total:gmsInt(h.total),
    items:gmsTransactionItems(h.items||[])
  })).sort((a,b)=>a.startTime-b.startTime);
}
function gmsCastWork(day){
  return Object.values(day.shifts||{}).sort((a,b)=>(a.clockIn||0)-(b.clockIn||0)).map(sh=>{
    const cast=allCasts().find(c=>String(c.id)===String(sh.castId));
    const startTime=gmsHHMM(sh.clockIn),endTime=gmsHHMM(sh.clockOut||day.endedAt);
    const castType=cast?.castType||sh.castType||"regular";
    const name=sh.castName||cast?.name||"";
    return{castId:String(sh.castId||""),castName:name,name,castType,isTrial:castType==="trial",startTime,endTime,breakMinutes:0,hours:gmsHours(startTime,endTime,0)};
  });
}
function gmsLifecycleRows(date,type){
  const log=(S.castLifecycleLogs||{})[date]||{};
  const list=type==="entered"?log.enteredCasts:type==="exited"?log.exitedCasts:log.trialCasts;
  return(Array.isArray(list)?list:[]).map(c=>({...c,castId:String(c.castId||""),castName:c.castName||c.name||"",internalNo:Number(c.internalNo)||0}));
}
function gmsIso(value,fallback){
  const v=value||fallback||Date.now();
  const d=new Date(typeof v==="number"?v:String(v));
  return isNaN(d.getTime())?new Date(fallback||Date.now()).toISOString():d.toISOString();
}
function gmsIsoForEvent(row,field,businessDate,day){
  const v=row?.[field]||row?.eventAt||row?.registeredAt||row?.ts||day?.startedAt||businessDate+"T00:00:00+09:00";
  return gmsIso(v,businessDate+"T00:00:00+09:00");
}
function gmsStableHash(text,seed){
  return GMS_JSON.stableHash(text,seed);
}
function gmsStableId(prefix,parts){
  return GMS_JSON.stableId(prefix,parts);
}
function gmsRosterSnapshot(capturedAt,day){
  if(day?.rosterSnapshot&&Array.isArray(day.rosterSnapshot.casts)){
    return GMS_JSON.createRosterSnapshot(
      day.rosterSnapshot.casts,
      day.rosterSnapshot.capturedAt||capturedAt,
      day.rosterSnapshot.complete===true
    );
  }
  // Ver6.102以前の営業日は当時の完全名簿を復元できないため、現在名簿を参考値として出力する。
  return GMS_JSON.createRosterSnapshot(allCasts(),capturedAt,false);
}
function gmsLifecycleEvents(businessDate,day){
  const entered=gmsLifecycleRows(businessDate,"entered").map(row=>({row,eventType:"entered",timeField:"enteredAt"}));
  const departed=gmsLifecycleRows(businessDate,"exited").map(row=>({row,eventType:"departed",timeField:"exitedAt"}));
  const trial=gmsLifecycleRows(businessDate,"trial").map(row=>({row,eventType:"trial",timeField:"trialRegisteredAt"}));
  return[...entered,...departed,...trial].map(({row,eventType,timeField})=>{
    const eventAt=gmsIsoForEvent(row,timeField,businessDate,day);
    const castId=String(row.castId||"");
    const eventId=String(row.eventId||gmsStableId("evt",[businessDate,eventType,castId,eventAt,Number(row.internalNo)||0]));
    return{eventId,eventType,eventAt,castId,castName:String(row.castName||row.name||""),entryDate:String(row.entryDate||row.trialBizDay||businessDate),internalNo:Number(row.internalNo)||0};
  }).sort((a,b)=>a.eventAt.localeCompare(b.eventAt)||a.eventId.localeCompare(b.eventId));
}
function gmsLocalMeta(){try{return JSON.parse(localStorage.getItem("genesis_gms_export_meta_v2")||"{}")||{};}catch(e){return{};}}
function gmsPutLocalMeta(meta){try{localStorage.setItem("genesis_gms_export_meta_v2",JSON.stringify(meta||{}));return true;}catch(e){return false;}}
function gmsMetaTime(meta){const value=Date.parse(meta?.updatedAt||meta?.generatedAt||"");return Number.isNaN(value)?0:value;}
function gmsGetExportMeta(date){
  const local=gmsLocalMeta()[date]||null;
  const remote=(S.gmsExportMeta||{})[date]||null;
  if(!local)return remote||{};
  if(!remote)return local;
  return gmsMetaTime(local)>gmsMetaTime(remote)?local:remote;
}
async function gmsSaveExportMeta(date,meta){
  const local={...gmsLocalMeta(),[date]:meta};
  const localSaved=gmsPutLocalMeta(local);
  if(!window._db)throw new Error(localSaved?"POS Firebaseに接続できません。共有提出履歴を保存できないため出力を中止しました。":"提出履歴を保存できません。");
  await guardedSet("gmsExportMeta/"+date,meta,{silent:true});
  S.gmsExportMeta={...(S.gmsExportMeta||{}),[date]:meta};
  return{localSaved,remoteSaved:true};
}
function gmsChecksum(payload){
  return GMS_JSON.closingChecksum(payload);
}
function validateGmsClosingPayload(payload){
  return GMS_JSON.validatePayload(payload);
}
function gmsClosingBasePayload(dayId){
  const day=S.bizDays[dayId];if(!day)return null;
  const hist=day.history||[],pay=gmsPaymentTotals(hist);
  const totalSales=hist.reduce((a,h)=>a+gmsInt(h.total),0),totalCustomers=hist.reduce((a,h)=>a+gmsInt(h.guests),0);
  const businessDate=day.date||dayId,transactions=gmsTransactions(hist),castSales=gmsCastSales(hist);
  const capturedAt=gmsIso(day.endedAt||Date.now());
  return{
    schema:"club-genesis-pos-closing",schemaVersion:2,
    businessDate,status:"submitted",
    sales:{totalSales,cashSales:pay.cash,cardSales:pay.card,discountTotal:hist.reduce((a,h)=>a+gmsInt(h.discount),0),taxServiceTotal:hist.reduce((a,h)=>a+gmsInt(h.tax),0)},
    customers:{groupCount:hist.length,totalCustomers,customerUnitPrice:totalCustomers?Math.floor(totalSales/totalCustomers):0},
    nominations:{honShimeiCount:hist.reduce((a,h)=>a+(h.items||[]).filter(i=>i.isHonShimei).length,0),jonaiCount:hist.reduce((a,h)=>a+(h.items||[]).filter(i=>i.isBanaiShimei).length,0)},
    transactions,castSales,castSalesSummary:gmsCastSalesSummary(castSales),castWork:gmsCastWork(day),staffWork:[],
    expenses:[],allowances:[],enteredCasts:gmsLifecycleRows(businessDate,"entered"),exitedCasts:gmsLifecycleRows(businessDate,"exited"),trialCasts:gmsLifecycleRows(businessDate,"trial"),
    rosterSnapshot:gmsRosterSnapshot(capturedAt,day),lifecycleEvents:gmsLifecycleEvents(businessDate,day),
    cashReconciliation:{expectedCash:pay.cash,actualCash:pay.cash,difference:0,note:""},
    source:{exportMethod:"file",exportedBy:"POS",businessStartedAt:day.startedAt||null,businessEndedAt:day.endedAt||null}
  };
}
function gmsClosingPayload(dayId,opts={}){
  const base=gmsClosingBasePayload(dayId);if(!base)return null;
  const prev=gmsGetExportMeta(base.businessDate)||{};
  const prepared=GMS_JSON.prepareSubmission(base,prev,{
    correction:!!opts.correction,
    generatedAt:gmsIso(base.source.businessEndedAt||Date.now()),
    nonce:Date.now()
  });
  if(prepared.error)return{_gmsError:prepared.error,_gmsMeta:{previous:prev}};
  const payload=prepared.payload;
  payload._gmsMeta=prepared.meta;
  return payload;
}
function gmsDownloadPayload(payload){
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=("club-genesis-pos-closing_"+payload.businessDate+"_"+payload.submissionId.slice(-8)+".json").replace(/[\\/:*?"<>|]/g,"");
  a.click();
  URL.revokeObjectURL(url);
  alert("GMS取込JSONを出力しました。\n営業日: "+payload.businessDate+"\nsubmissionId: "+payload.submissionId+"\ngeneratedAt: "+payload.generatedAt+"\nchecksum: "+payload.checksum);
}
async function redownloadGmsClosingJSON(dayId){
  const day=S.bizDays[dayId];if(!day){alert("出力対象の営業日が見つかりません");return;}
  const prev=gmsGetExportMeta(day.date||dayId)||{};
  if(!prev.payload||!prev.submissionId){return exportGmsClosingJSON(dayId,false);}
  const payload=JSON.parse(JSON.stringify(prev.payload));
  const errors=validateGmsClosingPayload(payload);
  if(errors.length){alert("保存済みJSONを再出力できませんでした。\n\n"+errors.slice(0,12).join("\n"));return;}
  try{
    const refreshed={...prev,payload,updatedAt:gmsIso(Date.now())};
    await gmsSaveExportMeta(payload.businessDate,refreshed);
  }catch(e){
    console.warn("gms export meta resave failed",e);
    alert("保存済みJSONを再出力できませんでした。\n\n提出履歴をPOS Firebaseへ確認保存できませんでした。\n接続状態を確認して、もう一度実行してください。");
    return;
  }
  gmsDownloadPayload(payload);
}
async function exportGmsClosingJSON(dayId,correction){
  const payload=gmsClosingPayload(dayId,{correction});
  if(!payload){alert("\u51fa\u529b\u5bfe\u8c61\u306e\u55b6\u696d\u65e5\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093");return;}
  if(payload._gmsError){alert(payload._gmsError);return;}
  if(!payload.transactions.length){alert("\u3053\u306e\u55b6\u696d\u65e5\u306e\u4f1a\u8a08\u30c7\u30fc\u30bf\u304c\u3042\u308a\u307e\u305b\u3093");return;}
  const meta=payload._gmsMeta||{};delete payload._gmsMeta;
  const prev=meta.previous||{};
  if(correction&&!prev.submissionId){
    alert("訂正元の提出履歴がありません。\n先に通常版のGMS取込JSONを出力してください。");
    return;
  }
  if(!correction&&prev.submissionId&&prev.contentHash&&prev.contentHash!==meta.contentHash){
    const ok=confirm("\u524d\u56de\u51fa\u529b\u6642\u304b\u3089\u55b6\u696d\u7de0\u3081\u30c7\u30fc\u30bf\u304c\u5909\u66f4\u3055\u308c\u3066\u3044\u307e\u3059\u3002\n\u540c\u3058submissionId\u3067\u7570\u306a\u308b\u5185\u5bb9\u306f\u51fa\u529b\u3067\u304d\u307e\u305b\u3093\u3002\n\n\u8a02\u6b63\u7248\u3068\u3057\u3066\u65b0\u3057\u3044submissionId\u3092\u767a\u884c\u3057\u307e\u3059\u304b\uff1f");
    if(!ok)return;
    return exportGmsClosingJSON(dayId,true);
  }
  if(correction&&meta.reused){
    alert("前回出力時から内容が変わっていないため、新しい訂正版は作成しません。\n同じsubmissionId・checksumのJSONを再ダウンロードします。");
  }else if(correction){
    const ok=confirm("訂正版JSONを新しく作成します。\n\n営業日: "+payload.businessDate+"\nGMSに取込済みの訂正元: "+(payload.supersedesSubmissionId||"なし")+"\n新submissionId: "+payload.submissionId+"\n\n表示された訂正元が実際にGMSへ取込済みであることを確認してください。\n正しい場合のみ「OK」を押してください。");
    if(!ok)return;
    const confirmationCode=String(payload.supersedesSubmissionId||"").slice(-8);
    const entered=prompt("誤った訂正チェーンを防ぐため、GMSに取込済みの訂正元submissionIdの末尾8文字を入力してください。\n\n末尾8文字: "+confirmationCode,"");
    if(String(entered||"").trim()!==confirmationCode){
      alert("訂正元submissionIdを確認できなかったため、訂正版の出力を中止しました。");
      return;
    }
  }
  const errors=validateGmsClosingPayload(payload);
  if(errors.length){alert("GMS\u53d6\u8fbcJSON\u3092\u51fa\u529b\u3067\u304d\u307e\u305b\u3093\u3002\n\n"+errors.slice(0,12).join("\n"));return;}
  const history=Array.isArray(prev.history)?[...prev.history]:[];
  if(prev.submissionId&&!history.some(row=>row.submissionId===prev.submissionId)){
    history.push({submissionId:prev.submissionId,checksum:prev.checksum||"",generatedAt:prev.generatedAt||"",supersedesSubmissionId:prev.supersedesSubmissionId||null});
  }
  if(!history.some(row=>row.submissionId===payload.submissionId)){
    history.push({submissionId:payload.submissionId,checksum:payload.checksum,generatedAt:payload.generatedAt,supersedesSubmissionId:payload.supersedesSubmissionId||null});
  }
  const exportMeta={schemaVersion:2,submissionId:payload.submissionId,generatedAt:payload.generatedAt,contentHash:meta.contentHash,checksum:payload.checksum,supersedesSubmissionId:payload.supersedesSubmissionId||null,payload:JSON.parse(JSON.stringify(payload)),history:history.slice(-20),updatedAt:gmsIso(Date.now())};
  try{
    await gmsSaveExportMeta(payload.businessDate,exportMeta);
  }catch(e){
    console.warn("gms export meta save failed",e);
    alert("GMS取込JSONを出力できませんでした。\n\n提出履歴をPOS Firebaseへ安全に保存できませんでした。\n接続状態を確認して、もう一度実行してください。\n\n"+(e?.message||"保存エラー"));
    return;
  }
  gmsDownloadPayload(payload);
}

async function loadBizDayForReEdit(dayId){
  if(S.activeBizDay){
alert("現在「"+S.activeBizDay+"」の営業が進行中です。\n営業終了後に読み込みできます。");
return;
  }
  const day=S.bizDays[dayId];if(!day)return;
  day.isReEdit=true;
  day.endedAt=null;
  S.bizDays[dayId]=day;
  S.activeBizDay=dayId;
  S.history=JSON.parse(JSON.stringify(day.history||[]));
  S.shifts=JSON.parse(JSON.stringify(day.shifts||{}));
  S.assignments=JSON.parse(JSON.stringify(day.assignments||{}));
  S.sessions={};
  if(window._db){
const _lhObj={};(S.history||[]).forEach(h=>{_lhObj[h.id]=h;});
	try{await guardedRootUpdateIfActive(null,{
  bizDays:S.bizDays,
  activeBizDay:S.activeBizDay,
  history:Object.keys(_lhObj).length>0?_lhObj:null,
  shifts:S.shifts,
  assignments:S.assignments,
  sessions:null
},"他端末で営業状態が変更されています。最新データに更新してから再実行してください。");
sbs(true,"同期済み ✓");
}catch(e){sbs(false,"保存エラー");alert(e.userMessage||"営業状態の保存に失敗しました。最新状態を確認してください。");location.reload();return;}
  }
  closeM();vw="floor";render();
}
async function startBizDay(dateStr){
  if(!requireFirebaseReady())return;
  // 他端末が既に営業を開始していた場合はブロック
  if(S.activeBizDay){
alert("既に「"+S.activeBizDay+"」の営業が進行中です。\n営業終了後に新しい営業を開始してください。");
closeM();vw="floor";render();return;
  }
  const id=dateStr;
  const day={id,date:dateStr,startedAt:Date.now(),endedAt:null,history:[],shifts:{},assignments:{}};
  S.bizDays[id]=day;
  S.activeBizDay=id;
  // history/shifts/assignmentsをクリア（新営業日）
  S.history=[];S.shifts={};S.assignments={};S.sessions={};
  if(window._db){
try{await guardedRootUpdateIfActive(null,{
  bizDays:S.bizDays,
  activeBizDay:S.activeBizDay,
  history:[],shifts:null,assignments:null,sessions:null
},"他端末で営業が開始されています。最新状態を確認してください。");
sbs(true,"同期済み ✓");
}catch(e){sbs(false,"保存エラー");alert(e.userMessage||"営業開始に失敗しました。最新状態を確認してください。");location.reload();return;}
  }
  closeM();vw="floor";render();
}

async function endBizDay(){
  const id=S.activeBizDay;if(!id)return;
  if(!requireFirebaseReady())return;
  const day=S.bizDays[id];if(!day)return;
  const onduty=getOnduty();
  if(onduty.length){
    md="endBizDay";
    sbs(false,"未退勤のキャストがいます");
    rModal();
    return;
  }
  const wasReEdit=!!day.isReEdit;
  day.endedAt=Date.now();
  day.history=[...S.history];
  day.shifts={...S.shifts};
  day.assignments={...S.assignments};
  if(!day.rosterSnapshot||!Array.isArray(day.rosterSnapshot.casts)){
    // 新規営業日は営業終了時点の完全名簿を固定する。旧営業日の再編集では完全性を推測しない。
    day.rosterSnapshot=GMS_JSON.createRosterSnapshot(allCasts(),gmsIso(day.endedAt),!wasReEdit);
  }
  delete day.isReEdit;
  let castsChanged=false;
  S.casts=normalizeCasts(S.casts).filter(c=>{
    if(c.castType==="trial"&&c.trialBizDay===id&&c.active!==false){
      castsChanged=true;
      upsertLifecycle(id,"trialCasts",{...castSnapshot(c,{trialBizDay:id,trialRegisteredAt:c.trialRegisteredAt||c.registeredAt||null,trialEndedAt:day.endedAt})},"castId");
      return false;
    }
    return true;
  });
  S.bizDays[id]=day;
  S.activeBizDay=null;
  if(window._db){
const daySnap={
  ts:Date.now(),
  date:day.date,
  history:JSON.parse(JSON.stringify(S.history||[])),
  shifts:JSON.parse(JSON.stringify(S.shifts||{})),
  assignments:JSON.parse(JSON.stringify(S.assignments||{})),
  castLifecycleLogs:JSON.parse(JSON.stringify((S.castLifecycleLogs||{})[day.date]||emptyLifecycle())),
  rosterSnapshot:JSON.parse(JSON.stringify(day.rosterSnapshot||null)),
  startedAt:day.startedAt||Date.now(),
  endedAt:day.endedAt
};
if(wasReEdit){
  // 再編集の場合：元バックアップを上書きせず、別キーで保存
  daySnap.edited=true;
  daySnap.editedAt=day.endedAt;
  await window._db.ref(BACKUP_ROOT+"/bizDays/"+day.date+"_edited").set(daySnap).catch(e=>console.warn("backup error",e));
}else{
  await window._db.ref(BACKUP_ROOT+"/bizDays/"+day.date).set(daySnap).catch(e=>console.warn("backup error",e));
}
try{await guardedRootUpdateIfActive(id,{
  bizDays:S.bizDays,
  activeBizDay:null,
  ...(castsChanged?{casts:S.casts}:{}),
  ...(castsChanged?{castLifecycleLogs:S.castLifecycleLogs}:{}),
  history:null,shifts:null,assignments:null,sessions:null
},"他端末で営業状態が変更されています。最新データに更新してから営業終了してください。");
sbs(true,"同期済み ✓");
}catch(e){sbs(false,"保存エラー");alert(e.userMessage||"営業終了に失敗しました。最新状態を確認してください。");location.reload();return;}
  }
  S.history=[];S.shifts={};S.assignments={};S.sessions={};
  closeM();vw="home";render();
}

// ===== FLOOR =====
function rFloor(){
  const layout=floorGridLayout();
  const gridFitStyle=layout.fit
    ?';justify-content:center;max-width:'+layout.maxWidth+';margin:0 auto;--floor-label-size:'+layout.labelFs+'px;--floor-timer-size:'+layout.timerFs+'px;--floor-nom-size:'+layout.nomFs+'px;--floor-nom-both-size:'+layout.nomBothFs+'px;'
    :"";
  const cols=layout.cols;
  let html='<div style="margin-bottom:16px;"><span style="font-size:11px;color:#888;letter-spacing:.1em;">FLOOR MAP</span></div>';
  html+='<div class="floor-grid '+(layout.fit?"floor-grid-fit":"")+'" style="display:grid;grid-template-columns:'+cols+';gap:'+layout.gap+';align-items:start'+gridFitStyle+'">';
  S.tables.forEach(t=>{
try{
const s=S.sessions[t.id];const rv=rem(s?.setEndTime);
const urg=rv!==null&&rv<600000&&rv>0;const exp=rv!==null&&rv<=0;
const hn=(s?.items||[]).filter(i=>i&&i.isHonShimei).map(itemCastName).filter(Boolean);
const bn=(s?.items||[]).filter(i=>i&&i.isBanaiShimei).map(itemCastName).filter(Boolean);
const hv=(s?.items||[]).some(i=>i&&i.isVipCharge);
const hasDh=(s?.items||[]).some(i=>i&&(i.id==="dh"||i.label==="同伴料"));
const maxSide=Math.max(hn.length,bn.length);
const nomFs=DEV==="mobile"
  ?(maxSide>=8?'6px':maxSide>=7?'7px':maxSide>=6?'8px':maxSide>=5?'9px':'11px')
  :DEV==="tablet"
  ?(maxSide>=8?'7px':maxSide>=7?'8px':maxSide>=6?'9px':maxSide>=5?'10px':'12px')
  :(maxSide>=7?'10px':maxSide>=6?'12px':'14px');
const lblFs=layout.fit?layout.labelFs+"px":DEV==="mobile"?"11px":DEV==="tablet"?"13px":"14px";
const timeFs=layout.fit?layout.timeFs+"px":DEV==="mobile"?"10px":"11px";
const timerFs=layout.fit?layout.timerFs+"px":DEV==="mobile"?"15px":DEV==="tablet"?"17px":"20px";
let inn=s?
  '<div style="font-size:'+timeFs+';color:#999;margin-bottom:4px;">'
  +new Date(s.startTime).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})
  +(s.setEndTime?' → <span style="color:'+(urg?"#ff8c00":exp?"#ff4444":"#b8960c")+'">'+new Date(s.setEndTime).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})+'</span>':"")
  +(hasDh?' <span style="background:rgba(255,160,0,.18);border:1px solid #ffa000;color:#ffa000;border-radius:4px;padding:1px 5px;font-size:9px;font-weight:700;vertical-align:middle;">同伴</span>':"")
  +'</div>'
  +'<div'+(s.setEndTime?' data-countdown="'+s.setEndTime+'" data-fmt="p"':'')+' style="text-align:right;font-size:'+timerFs+';font-weight:700;color:'+(exp?"#ff4444":urg?"#ff6b6b":"#d4a017")+';margin-bottom:4px;" class="'+(urg||exp?"urg":"")+'">'+( rv===null?"—":exp?"-"+ts(-rv):ts(rv))+'</div>'
  +(hn.length||bn.length?
    '<div class="floor-nomination-row '+((hn.length&&bn.length)?"has-both":"has-one")+'" style="display:flex;gap:4px;margin-top:2px;">'
    +'<div style="flex:1;min-width:0;">'
    +(hn.length?'<div class="floor-nomination floor-nomination-hon" style="font-size:'+nomFs+';color:#ff4444;line-height:1.6;word-break:break-all;">'+hn.map(n=>'本指名 '+n).join('<br>')+'</div>':'')
    +'</div>'
    +'<div style="flex:1;min-width:0;text-align:right;">'
    +(bn.length?'<div class="floor-nomination floor-nomination-banai" style="font-size:'+nomFs+';color:#4ade80;line-height:1.6;word-break:break-all;text-align:right;">'+bn.map(n=>'場指名 '+n).join('<br>')+'</div>':'')
    +'</div>'
    +'</div>'
    :"")
:'<div style="font-size:12px;color:#444;margin-top:10px;">空席</div>';
const loBadgeFs=(parseFloat(lblFs)*2)+"px";
const loSt=S.loMode&&s?(S.loStatus[t.id]==="done"?"done":"pending"):null;
const loBadge=loSt==="pending"?'<span style="font-size:'+loBadgeFs+';font-weight:900;color:#ff4444;line-height:1;">LO未</span>'
  :loSt==="done"?'<span style="font-size:'+loBadgeFs+';font-weight:900;color:#38bdf8;line-height:1;">LO完</span>':"";
html+='<div class="tc floor-table-card '+(s?"ta":"te")+' '+(isV(t.id)?"tv":"")+ '" data-tid="'+t.id+'" onclick="tc2(this.dataset.tid)" style="aspect-ratio:1/1;touch-action:manipulation;position:relative;">'
  +(loBadge?'<div style="position:absolute;top:4px;right:6px;pointer-events:none;">'+loBadge+'</div>':"")
  +'<div class="floor-table-heading" style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;">'
  +'<span style="font-size:'+lblFs+';font-weight:600;">'+t.label+'</span>'
  +(isV(t.id)?'<span class="tag tv2" style="flex-shrink:0;">VIP</span>':"")
  +(s?'<span style="font-size:'+lblFs+';font-weight:600;color:#e8dcc8;flex-shrink:0;">'+s.guests+'名</span>':"")
  +(s&&s.note?'<span style="font-size:10px;color:#ffa500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80px;">'+s.note+'</span>':"")
  +'</div>'+inn+'</div>';
}catch(e){
  // データ不整合のテーブルは空席として表示
  html+='<div class="tc floor-table-card te '+(isV(t.id)?"tv":"")+ '" data-tid="'+t.id+'" onclick="tc2(this.dataset.tid)" style="aspect-ratio:1/1;touch-action:manipulation;">'
    +'<div class="floor-table-heading" style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">'
    +'<span style="font-size:'+lblFs+';font-weight:600;">'+t.label+'</span>'
    +(isV(t.id)?'<span class="tag tv2">VIP</span>':"")
    +'</div><div style="font-size:12px;color:#444;margin-top:10px;">空席</div></div>';
}
  });
  html+='</div>';
  return html;
}

// ===== LIST（付け回し管理）=====
// DnD状態
let _dnd={dragging:false,castId:null,castName:null,fromTable:null,assignId:null,ghost:null};

function rList(){
  const waiting=getWaitingCasts();
  const brk=getBreakCasts();
  const activeSessions=S.tables.filter(t=>S.sessions[t.id]);
  const activeAssignments=Object.values(S.assignments||{}).filter(a=>!a.endTime);
  const assignmentsByTable={};
  activeAssignments.forEach(a=>{
    const key=String(a.tableId||"");
    if(!assignmentsByTable[key])assignmentsByTable[key]=[];
    assignmentsByTable[key].push(a);
  });
  const totalGuests=S.tables.reduce((s,t)=>s+(S.sessions[t.id]?.guests||0),0);
  const totalOnduty=getOnduty().length;
  const storeDiff=totalGuests-totalOnduty;
  const storeBalCol=storeDiff>0?"#ff4444":"#4ade80";
  const storeBalTxt=storeDiff>0?"-"+storeDiff+"人":storeDiff<0?"+"+Math.abs(storeDiff)+"人":"";

  let html='<div id="list-root">';

  // ヘッダー
  html+='<div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap;">';
  html+='<span style="font-size:11px;color:#888;letter-spacing:.1em;flex:1;">LIST</span>';
  html+='<span style="font-size:12px;padding:4px 10px;background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.25);color:#4ade80;border-radius:20px;">待機 '+waiting.length+'</span>';
  html+='<span style="font-size:12px;padding:4px 10px;background:rgba(255,165,0,.1);border:1px solid rgba(255,165,0,.25);color:#ffa500;border-radius:20px;">休憩 '+brk.length+'</span>';
  html+='<button class="btn" onclick="sv(\'assignHistory\')" style="padding:7px 12px;font-size:12px;font-weight:700;border-radius:6px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;touch-action:manipulation;">履歴</button>';
  html+='</div>';

  // ===== 2カラムレイアウト: 左=キャストゾーン 右=テーブルゾーン =====
  const isMob=DEV==="mobile";
  html+='<div style="display:grid;grid-template-columns:'+(isMob?"1fr":"minmax(160px,200px) 1fr")+';gap:12px;align-items:start;">';

  // ===== 左: 待機・休憩ゾーン（ドラッグソース & ドロップゾーン）=====
  html+='<div>';
  // 客数・過不足サマリー
  html+='<div class="glass" style="border-radius:10px;padding:10px;margin-bottom:10px;">';
  html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
  html+='<span style="font-size:11px;color:#888;">現在の客数</span>';
  html+='<span style="font-size:14px;font-weight:700;color:#e8dcc8;">'+totalGuests+'名</span>';
  html+='</div>';
  html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
  html+='<span style="font-size:11px;color:#888;">出勤人数</span>';
  html+='<span style="font-size:13px;font-weight:700;color:#a78bfa;">'+totalOnduty+'名</span>';
  html+='</div>';
  html+='<div style="display:flex;justify-content:space-between;align-items:center;">';
  html+='<span style="font-size:11px;color:#888;">店全体</span>';
  html+=(storeBalTxt?'<span style="font-size:12px;font-weight:700;color:'+storeBalCol+';">'+storeBalTxt+'</span>':"");
  html+='</div>';
  html+='</div>';
  // 待機ゾーン（テーブルからドロップで戻る）
  html+='<div id="dz-waiting" class="glass" style="border-radius:10px;padding:10px;margin-bottom:10px;min-height:60px;transition:background .2s;" ondragover="dzOver(event,\'waiting\')" ondragleave="dzLeave(\'waiting\')" ondrop="dzDrop(event,\'waiting\')">';
  html+='<div style="font-size:11px;font-weight:700;color:#4ade80;letter-spacing:.08em;margin-bottom:8px;">待機 '+waiting.length+'</div>';
  if(!waiting.length)html+='<div style="font-size:11px;color:#333;text-align:center;padding:6px 0;">なし</div>';
  waiting.forEach(sh=>{
const logs=sh.statusLog||[];
const lastLog=logs.filter(l=>l.status==="waiting"&&!l.endTime).pop();
const el=lastLog?(Date.now()-lastLog.startTime):(Date.now()-sh.clockIn);
      html+=castChip(sh.castId,sh.castName,"waiting",null,el,(lastLog?lastLog.startTime:sh.clockIn),isOptimisticPath("shifts/"+sh.id));
  });
  html+='</div>';
  // 休憩ゾーン
  html+='<div id="dz-break" class="glass" style="border-radius:10px;padding:10px;min-height:60px;transition:background .2s;" ondragover="dzOver(event,\'break\')" ondragleave="dzLeave(\'break\')" ondrop="dzDrop(event,\'break\')">';
  html+='<div style="font-size:11px;font-weight:700;color:#ffa500;letter-spacing:.08em;margin-bottom:8px;">休憩 '+brk.length+'</div>';
  if(!brk.length)html+='<div style="font-size:11px;color:#333;text-align:center;padding:6px 0;">なし</div>';
  brk.forEach(sh=>{
const logs=sh.statusLog||[];
const lastLog=logs.filter(l=>l.status==="break"&&!l.endTime).pop();
const el=lastLog?(Date.now()-lastLog.startTime):(Date.now()-sh.clockIn);
html+=castChip(sh.castId,sh.castName,"break",null,el,(lastLog?lastLog.startTime:sh.clockIn),isOptimisticPath("shifts/"+sh.id));
  });
  html+='</div>';
  html+='</div>';

  // ===== 右: テーブルゾーン =====
  const tblCols="repeat(auto-fit,minmax(min(100%,clamp(130px,20vw,190px)),1fr))";
  html+='<div class="list-table-grid" style="display:grid;grid-template-columns:'+tblCols+';gap:clamp(8px,1.4vw,12px);align-content:start;align-items:start;">';
  S.tables.forEach(t=>{
const s=S.sessions[t.id];
const ac=assignmentsByTable[String(t.id)]||[];
const rv=s?rem(s.setEndTime):null;
const urg=rv!==null&&rv<600000&&rv>0;const exp=rv!==null&&rv<=0;
const tc=exp?"#ff4444":urg?"#ff6b6b":"#d4a017";
const tr=rv===null?"—":exp?"- "+ts(-rv):"残 "+ts(rv);
const hn=s?(s.items||[]).filter(i=>i.isHonShimei).map(itemCastName).filter(Boolean):[];
const bn=s?(s.items||[]).filter(i=>i.isBanaiShimei).map(itemCastName).filter(Boolean):[];
const isActive=!!s;
// マンツーマン過不足
let manBadge="";
if(isActive&&s){
  const diff=s.guests-ac.length;
  if(diff>0)manBadge='<span style="font-size:9px;color:#ff4444;border:1px solid rgba(255,68,68,.35);border-radius:3px;padding:1px 5px;background:rgba(255,68,68,.08);">-'+diff+'人</span>';
  else if(diff<0)manBadge='<span style="font-size:9px;color:#4ade80;border:1px solid rgba(74,222,128,.35);border-radius:3px;padding:1px 5px;background:rgba(74,222,128,.08);">+'+Math.abs(diff)+'人</span>';
  // diff===0: 均衡は表示しない
}
// テーブルカード（ドロップゾーン）
html+='<div id="dz-tbl-'+t.id+'" class="list-table-card '+(isActive?"list-table-active":"list-table-empty")+'" '
  +'style="border-radius:10px;padding:10px;min-height:100px;transition:all .2s;cursor:'+(isActive?"pointer":"default")+';'
  +'background:'+(isActive?"rgba(255,255,255,.05)":"rgba(255,255,255,.02)")+';'
  +'border:1px solid '+(isActive?"rgba(212,160,23,.3)":"rgba(255,255,255,.06)")+';'
  +(isV(t.id)?"border-color:rgba(124,77,255,.3);":"")+'" '
  +(isActive?'ondragover="dzOver(event,\'tbl\',\''+t.id+'\')" ondragleave="dzLeave(\'tbl\',\''+t.id+'\')" ondrop="dzDrop(event,\'tbl\',\''+t.id+'\')" ':'' )
  +'onclick="if(!event.defaultPrevented&&\''+t.id+'\')sv(\'tableDetail\',\''+t.id+'\')">';
// テーブル名行：テーブル名＋人数＋バッジ＋マンツーマン
html+='<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:5px;">';
html+='<div style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;">';
html+='<div class="list-table-heading" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">';
html+='<span style="font-size:13px;font-weight:700;color:'+(isActive?"#e8dcc8":"#444")+';">'+t.label+'</span>';
if(isActive&&s){
  const honCount=hn.length;
  const freeCount=Math.max(0,s.guests-honCount-bn.length);
  if(!honCount&&!bn.length){
    // 全員フリー：人数 + Fバッジ
    html+='<span style="font-size:11px;color:#aaa;">'+s.guests+'名</span>';
    html+='<span style="font-size:9px;color:#38bdf8;padding:1px 4px;border:1px solid #38bdf866;border-radius:2px;">F'+s.guests+'</span>';
  } else {
    html+='<span style="font-size:11px;color:#aaa;">'+s.guests+'名</span>';
    if(honCount)html+='<span style="font-size:9px;color:#ff4444;padding:1px 4px;border:1px solid #ff444466;border-radius:2px;">本'+honCount+'</span>';
    if(bn.length)html+='<span style="font-size:9px;color:#4ade80;padding:1px 4px;border:1px solid #4ade8066;border-radius:2px;">場'+bn.length+'</span>';
    if(freeCount>0)html+='<span style="font-size:9px;color:#38bdf8;padding:1px 4px;border:1px solid #38bdf866;border-radius:2px;">F'+freeCount+'</span>';
  }
}
html+='</div>';
// 備考
if(isActive&&s&&s.note)html+='<span style="font-size:10px;color:#ffa500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;">'+s.note+'</span>';
html+='</div>';
html+='<div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;">';
if(isV(t.id))html+='<span class="tag tv2" style="font-size:9px;">VIP</span>';
if(manBadge)html+=manBadge;
html+='</div>';
html+='</div>';
if(isActive&&s){
  // 残り時間
  html+='<div'+(s.setEndTime?' data-countdown="'+s.setEndTime+'" data-fmt="r"':'')+' style="font-size:12px;font-weight:700;color:'+tc+';" class="list-countdown '+(urg||exp?"urg":"")+'">'+tr+'</div>';
  // 本指名・場内指名の名前表示（フロアタブと同じ2列レイアウト）
  if(hn.length||bn.length){
    const maxSide=Math.max(hn.length,bn.length);
    const nomFs=DEV==="mobile"
      ?(maxSide>=8?'6px':maxSide>=7?'7px':maxSide>=6?'8px':maxSide>=5?'9px':'11px')
      :DEV==="tablet"
      ?(maxSide>=8?'7px':maxSide>=7?'8px':maxSide>=6?'9px':maxSide>=5?'10px':'12px')
      :(maxSide>=7?'10px':maxSide>=6?'12px':'14px');
    html+='<div class="list-nomination-row '+((hn.length&&bn.length)?"has-both":"has-one")+'" style="display:flex;gap:4px;margin-top:2px;">'
      +'<div style="flex:1;min-width:0;">'
      +(hn.length?'<div class="list-nomination list-nomination-hon" style="font-size:'+nomFs+';color:#ff4444;line-height:1.6;word-break:break-all;">'+hn.map(n=>'本指名 '+n).join('<br>')+'</div>':'')
      +'</div>'
      +'<div style="flex:1;min-width:0;text-align:right;">'
      +(bn.length?'<div class="list-nomination list-nomination-banai" style="font-size:'+nomFs+';color:#4ade80;line-height:1.6;word-break:break-all;text-align:right;">'+bn.map(n=>'場指名 '+n).join('<br>')+'</div>':'')
      +'</div>'
      +'</div>';
  }
  // ついているキャストチップ
  if(ac.length){
    html+='<div style="margin-top:6px;display:flex;flex-direction:column;gap:4px;">';
    ac.forEach(a=>{
      const el=Date.now()-(a.attachedAt||a.startTime);
      html+=castChip(a.castId,a.castName,"active",a,el,(a.attachedAt||a.startTime),isOptimisticPath("assignments/"+a.id));
    });
    html+='</div>';
  } else {
    html+='<div style="font-size:10px;color:#333;margin-top:6px;text-align:center;padding:4px;border:1px dashed rgba(255,255,255,.08);border-radius:4px;">ドロップ</div>';
  }
} else {
  html+='<div style="font-size:11px;color:#333;margin-top:8px;">空席</div>';
}
html+='</div>';
  });
  html+='</div>';
  html+='</div>';

  // ＋付け回しボタン（フローティング）
  html+='<div style="position:sticky;bottom:16px;text-align:right;margin-top:12px;pointer-events:none;">';
  html+='<button class="btn gbg" onclick="tsukeMd={step:\'cast\',castId:null,type:null,tableId:null,time:\'\',useNow:true};om(\'tsuke\')" style="pointer-events:auto;padding:10px 20px;font-size:14px;font-weight:700;border-radius:24px;box-shadow:0 4px 20px rgba(0,0,0,.4);touch-action:manipulation;">＋ 付け回し</button>';
  html+='</div>';

  html+='</div>';
  return html;
}

// キャストチップ（ドラッグ可能なカード）
function castChip(castId,castName,zone,assign,elapsed,timerBase,pending=false){
  const isActive=zone==="active";
  const isWaiting=zone==="waiting";
  const isBreak=zone==="break";
  const col=isActive?(ASSIGN_TYPES[assign?.type]?.col||"#888"):isWaiting?"#4ade80":"#ffa500";
  const sfx=isActive?(TYPE_SFX[assign?.type]||"?"):"";
  const aid=assign?.id||"";
  const dragAttrs=pending?'draggable="false" ':'draggable="true" ';
  const eventAttrs=pending
    ?'onclick="event.stopPropagation()" '
    :'onclick="event.stopPropagation();chipTap(\''+castId+'\',\''+zone+'\',\''+aid+'\')" '
      +'ondragstart="chipDragStart(event,\''+castId+'\',\''+castName+'\',\''+zone+'\',\''+aid+'\')" '
      +'ondragend="chipDragEnd(event)" '
      +'ontouchstart="chipTouchStart(event,\''+castId+'\',\''+castName+'\',\''+zone+'\',\''+aid+'\')" '
      +'ontouchmove="chipTouchMove(event)" '
      +'ontouchend="chipTouchEnd(event)" ';
  return '<div class="list-cast-chip list-cast-'+zone+(isActive?' list-cast-type-'+(assign?.type||'unknown'):'')+'" '
+'data-cast-id="'+castId+'" data-cast-name="'+castName+'" data-zone="'+zone+'" data-assign-id="'+aid+'" '
+dragAttrs+eventAttrs
+'style="--list-cast-color:'+col+';display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-radius:7px;margin-bottom:4px;cursor:'+(pending?"wait":"grab")+';user-select:none;touch-action:none;'
+'background:'+(isActive?"rgba(0,0,0,.3)":isWaiting?"rgba(74,222,128,.08)":"rgba(255,165,0,.08)")+';'
+'border:1px solid '+col+'44;'+(pending?'opacity:.58;filter:saturate(.7);':'')+'">'
+'<div class="list-cast-main" style="display:flex;align-items:center;gap:6px;min-width:0;">'
+(isActive?'<span class="list-cast-type-badge" style="flex-shrink:0;font-size:9px;padding:1px 5px;border:1px solid '+col+';color:'+col+';border-radius:3px;font-weight:700;">'+sfx+'</span>':'')
+'<span class="list-cast-name" style="font-size:13px;font-weight:700;color:#e8dcc8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+castName+'</span>'
+'</div>'
+'<span class="list-elapsed-time" data-timer="'+timerBase+'" style="font-size:11px;font-family:monospace;color:'+col+';flex-shrink:0;">'+ts(elapsed).slice(3)+'</span>'
+'</div>';
}

// チップタップ（クリック）時の処理
function chipTap(castId,zone,assignId){
  if(isPendingCastMove(castId,assignId)){sbs(false,"保存中...");return;}
  if(zone==="active"&&assignId){openAssignActionModal(assignId);}
  else{openCastStatusModal(castId);}
}

// ===== ドラッグ&ドロップ（マウス）=====
function chipDragStart(e,castId,castName,zone,assignId){
  _dnd={dragging:true,castId,castName,fromZone:zone,assignId,ghost:null};
  e.dataTransfer.effectAllowed="move";
  e.dataTransfer.setData("text/plain",castId);
  e.currentTarget.style.opacity=".4";
}
function chipDragEnd(e){
  e.currentTarget.style.opacity="";
  // ドロップゾーンのハイライトを全解除
  document.querySelectorAll("[id^='dz-']").forEach(el=>{el.style.background="";el.style.boxShadow="";});
  _dnd.dragging=false;
}
function dzOver(e,zone,tableId){
  e.preventDefault();e.stopPropagation();
  e.dataTransfer.dropEffect="move";
  const el=document.getElementById(zone==="tbl"?"dz-tbl-"+tableId:zone==="waiting"?"dz-waiting":"dz-break");
  if(el){el.style.background=zone==="waiting"?"rgba(74,222,128,.15)":zone==="break"?"rgba(255,165,0,.15)":"rgba(167,139,250,.15)";
el.style.boxShadow=zone==="waiting"?"0 0 0 2px #4ade8066":zone==="break"?"0 0 0 2px #ffa50066":"0 0 0 2px #a78bfa66";}
}
function dzLeave(zone,tableId){
  const el=document.getElementById(zone==="tbl"?"dz-tbl-"+tableId:zone==="waiting"?"dz-waiting":"dz-break");
  if(el){el.style.background="";el.style.boxShadow="";}
}
function dzDrop(e,zone,tableId){
  e.preventDefault();e.stopPropagation();
  dzLeave(zone,tableId);
  if(!_dnd.dragging||!_dnd.castId)return;
  const {castId,castName,fromZone,assignId}=_dnd;
  _dnd.dragging=false;
  _dndExecute(castId,castName,fromZone,assignId,zone,tableId);
}

// ===== タッチDnD（iPad対応）=====
let _touch={active:false,castId:null,castName:null,fromZone:null,assignId:null,ghost:null,touchId:null};
function chipTouchStart(e,castId,castName,zone,assignId){
  // 既にドラッグ中は2本目の指を無視（残像バグ防止）
  if(_touch.active)return;
  const t=e.changedTouches[0];
  _touch={active:true,castId,castName,fromZone:zone,assignId,ghost:null,startX:t.clientX,startY:t.clientY,moved:false,touchId:t.identifier};
  // ゴーストを作成
  const src=e.currentTarget.cloneNode(true);
  src.style.cssText="position:fixed;pointer-events:none;z-index:9999;opacity:.85;width:160px;border-radius:8px;padding:8px 12px;background:#1a1a2e;border:1px solid rgba(212,160,23,.5);color:#e8dcc8;font-size:13px;font-weight:700;transform:scale(1.05);transition:none;left:"+(t.clientX-80)+"px;top:"+(t.clientY-20)+"px;";
  document.body.appendChild(src);
  _touch.ghost=src;
}
function chipTouchMove(e){
  if(!_touch.active)return;
  e.preventDefault();
  // ドラッグを開始した指のみ追跡
  const t=Array.from(e.touches).find(x=>x.identifier===_touch.touchId)||e.touches[0];
  if(_touch.ghost){_touch.ghost.style.left=(t.clientX-80)+"px";_touch.ghost.style.top=(t.clientY-20)+"px";}
  _touch.moved=true;
  // ドロップ候補ハイライト
  document.querySelectorAll("[id^='dz-']").forEach(el=>{
const r=el.getBoundingClientRect();
const over=t.clientX>=r.left&&t.clientX<=r.right&&t.clientY>=r.top&&t.clientY<=r.bottom;
el.style.background=over?(el.id.includes("waiting")?"rgba(74,222,128,.15)":el.id.includes("break")?"rgba(255,165,0,.15)":"rgba(167,139,250,.15)"):"";
el.style.boxShadow=over?(el.id.includes("waiting")?"0 0 0 2px #4ade8066":el.id.includes("break")?"0 0 0 2px #ffa50066":"0 0 0 2px #a78bfa66"):"";
  });
}
function chipTouchEnd(e){
  if(!_touch.active)return;
  // ドラッグを開始した指が離れたかチェック（別の指なら無視）
  const changed=Array.from(e.changedTouches).find(x=>x.identifier===_touch.touchId);
  if(!changed)return;
  if(_touch.ghost){_touch.ghost.remove();_touch.ghost=null;}
  document.querySelectorAll("[id^='dz-']").forEach(el=>{el.style.background="";el.style.boxShadow="";});
  if(!_touch.moved){_touch.active=false;return;} // タップは chipTap で処理
  const t=changed;
  let zone=null,tableId=null;
  document.querySelectorAll("[id^='dz-']").forEach(el=>{
const r=el.getBoundingClientRect();
if(t.clientX>=r.left&&t.clientX<=r.right&&t.clientY>=r.top&&t.clientY<=r.bottom){
  if(el.id==="dz-waiting")zone="waiting";
  else if(el.id==="dz-break")zone="break";
  else if(el.id.startsWith("dz-tbl-")){zone="tbl";tableId=el.id.replace("dz-tbl-","");}
}
  });
  const {castId,castName,fromZone,assignId}=_touch;
  _touch.active=false;
  if(zone)_dndExecute(castId,castName,fromZone,assignId,zone,tableId);
}

// ===== DnD実行処理 =====
function _dndExecute(castId,castName,fromZone,assignId,toZone,tableId){
  if(isPendingCastMove(castId,assignId)){sbs(false,"保存中...");return;}
  // 待機→待機、休憩→休憩は無視
  if(fromZone===toZone&&toZone!=="tbl")return;
  // テーブル上のchip(zone="active")→同じテーブルは無視、別テーブルは許可
  if(fromZone==="active"&&toZone==="tbl"&&S.assignments[assignId]?.tableId===tableId)return;
  if(toZone==="waiting"){
// テーブル or 休憩 → 待機
if(assignId)endAssign(assignId);
else if(fromZone==="break")moveToWaiting(castId);
  } else if(toZone==="break"){
// テーブル or 待機 → 休憩（アサイン終了とstatus="break"を1回のFirebase writeにまとめる）
moveToBreak(castId);
  } else if(toZone==="tbl"&&tableId){
// 待機 or 休憩 or テーブル → テーブル
const tblSession=S.sessions[tableId];
if(!tblSession)return; // 空席は不可
const prevAid=(assignId&&(fromZone==="active"||fromZone==="tbl"))?assignId:null;
openTsukeAuto(castId,castName,tableId,prevAid);
  }
}
// ===== 付け回し自動タイプ判定 =====
function getAutoType(castId,tableId){
  const s=S.sessions[tableId];if(!s)return{autoType:null,limitedTypes:null};
  const honIds=(s.items||[]).filter(i=>i.isHonShimei).map(i=>String(i.castId));
  const banaiIds=(s.items||[]).filter(i=>i.isBanaiShimei).map(i=>String(i.castId));
  if(honIds.includes(String(castId)))return{autoType:"hon",limitedTypes:null};
  if(banaiIds.includes(String(castId)))return{autoType:"banai",limitedTypes:null};
  // 付けるキャスト自身の指名情報がない場合はフリー/ヘルプのみ
  return{autoType:null,limitedTypes:["free","help"]};
}
function openTsukeAuto(castId,castName,tableId,prevAssignId){
  const{autoType,limitedTypes}=getAutoType(castId,tableId);
  if(autoType){
tsukeMd={step:"time",castId,castName,type:autoType,tableId,time:"",useNow:true,limitedTypes:null,prevAssignId:prevAssignId||null};
  }else{
tsukeMd={step:"type",castId,castName,type:null,tableId,time:"",useNow:true,limitedTypes,prevAssignId:prevAssignId||null};
  }
  md="tsuke";rModal();
}
function execMoveToTable(tableId){
  openTsukeAuto(window._moveCastId,window._moveCastName,tableId,window._moveFromAid);
}

// ===== 付け回し履歴画面 =====
function rAssignHistory(){
  const allA=Object.values(S.assignments||{}).sort((a,b)=>a.startTime-b.startTime);
  let html='<div style="max-width:780px;margin:0 auto;">';
  html+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;">';
  html+='<button class="btn" onclick="sv(\'list\')" style="padding:6px 12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:4px;font-size:13px;touch-action:manipulation;">← リスト</button>';
  html+='<h2 style="font-family:\'Cormorant Garamond\',serif;font-size:22px;color:#d4a017;flex:1;">付け回し履歴</h2>';
  html+='<button class="btn" onclick="exportAssignHistCSV()" style="padding:7px 14px;background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.25);color:#4ade80;border-radius:5px;font-size:12px;font-weight:700;touch-action:manipulation;">CSV出力</button>';
  html+='</div>';
  if(!allA.length){html+='<div style="color:#555;font-size:14px;padding:20px 0;">付け回しデータがありません</div></div>';return html;}

  // タイプ別フィルタータブ
  const typeKeys=["all",...Object.keys(ASSIGN_TYPES)];
  const curFilter=window._assignHistFilter||"all";
  html+='<div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;">';
  typeKeys.forEach(k=>{
const lbl=k==="all"?"すべて":(ASSIGN_TYPES[k]?.label||k);
const col=k==="all"?"#888":(ASSIGN_TYPES[k]?.col||"#888");
const isAc=curFilter===k;
html+='<button class="btn" data-fk="'+k+'" onclick="window._assignHistFilter=this.dataset.fk;render()" style="padding:5px 12px;border-radius:16px;font-size:12px;font-weight:700;touch-action:manipulation;background:'+(isAc?"rgba(255,255,255,.12)":"rgba(255,255,255,.04)")+';border:1px solid '+(isAc?col+"99":"rgba(255,255,255,.08)")+';color:'+(isAc?col:"#555")+';">'+lbl+'</button>';
  });
  html+='</div>';

  // フィルタリング
  const filtered=curFilter==="all"?allA:allA.filter(a=>a.type===curFilter);

  // テーブル×セッションでグループ化
  const sessionMap={};
  filtered.forEach(a=>{
const sid=a.sessionId||("nosid_"+a.startTime);
const key=a.tableId+"::"+sid;
if(!sessionMap[key])sessionMap[key]={tableId:a.tableId,sid,assigns:[]};
sessionMap[key].assigns.push(a);
  });

  // 会計終了済みセッションのみ・入店時刻の新しい順にソート
  const allSessions=Object.values(sessionMap)
.filter(({tableId,assigns})=>{
  const currentSess=S.sessions[tableId];
  const sessionId=assigns[0].sessionId;
  // 現在進行中のセッションは除外
  if(currentSess&&(sessionId===currentSess.startTime||sessionId==null))return false;
  return true;
})
.sort((a,b)=>{
  const ta=a.assigns[0].sessionId||a.assigns[0].startTime;
  const tb=b.assigns[0].sessionId||b.assigns[0].startTime;
  return tb-ta; // 新しい入店時刻が上
});

  if(!allSessions.length){html+='<div style="color:#555;font-size:14px;padding:20px 0;">会計終了済みの付け回しデータがありません</div></div>';return html;}

  allSessions.forEach(({tableId,assigns})=>{
const t=S.tables.find(t=>t.id===tableId);if(!t)return;
const group=assigns.sort((a,b)=>a.startTime-b.startTime);
const sessionTs=group[0].sessionId||group[0].startTime;
const inTime=new Date(sessionTs).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"});
// 会計履歴からセッション情報を取得
const histRec=(S.history||[]).find(h=>h.tableId===t.id&&h.startTime===group[0].sessionId);
const guests=histRec?.guests||"?";
const honNames=histRec?(histRec.items||[]).filter(i=>i.isHonShimei).map(itemCastName).filter(Boolean):[];
const banaiNames=histRec?(histRec.items||[]).filter(i=>i.isBanaiShimei).map(itemCastName).filter(Boolean):[];
const note=histRec?.note||"";

// セッションヘッダー
const _canViewBill=!!histRec;
html+='<div class="glass" style="border-radius:10px;margin-bottom:10px;overflow:hidden;">';
html+='<div style="padding:10px 14px;background:rgba(212,160,23,.08);border-bottom:2px solid rgba(212,160,23,.2);display:flex;align-items:center;flex-wrap:wrap;gap:8px;'+(_canViewBill?'cursor:pointer;':'')+'" '
  +(_canViewBill?'data-hrid="'+histRec.id+'" onclick="window._viewHistRec=(S.history||[]).find(h=>h.id===Number(this.dataset.hrid));md=\'viewHistDetail\';rModal()"':'')+' >';
html+='<span style="font-size:15px;font-weight:700;color:#d4a017;">'+t.label+'</span>';
if(note)html+='<span style="font-size:12px;color:#ffa500;">'+note+'</span>';
html+='<span style="font-size:12px;color:#888;">'+inTime+'〜</span>';
html+='<span style="font-size:12px;color:#aaa;">'+guests+'名</span>';
if(honNames.length)html+='<span style="font-size:11px;color:#ff4444;background:rgba(255,68,68,.1);padding:2px 8px;border-radius:10px;">本: '+honNames.join("・")+'</span>';
if(banaiNames.length)html+='<span style="font-size:11px;color:#4ade80;background:rgba(74,222,128,.1);padding:2px 8px;border-radius:10px;">場: '+banaiNames.join("・")+'</span>';
html+='<span style="margin-left:auto;font-size:11px;color:#555;">'+group.length+'件</span>';
if(_canViewBill)html+='<span style="font-size:10px;color:#d4a017;padding:1px 7px;border:1px solid rgba(212,160,23,.35);border-radius:3px;flex-shrink:0;">明細 ▶</span>';
html+='</div>';

// アサイン行をタイプ別エリアに分割
const areaTypes=[
  {key:"hon",   label:"本指名",   col:ASSIGN_TYPES.hon.col,   types:["hon"]},
  {key:"free",  label:"フリー",   col:ASSIGN_TYPES.free.col,  types:["free","harem"]},
  {key:"help",  label:"ヘルプ",   col:ASSIGN_TYPES.help.col,  types:["help"]},
  {key:"banai", label:"場内指名", col:ASSIGN_TYPES.banai.col, types:["banai"]},
];
areaTypes.forEach(area=>{
  const aItems=group.filter(a=>area.types.includes(a.type));
  if(!aItems.length)return;
  html+='<div style="padding:4px 14px 4px 14px;">';
  html+='<div style="font-size:10px;font-weight:700;color:'+area.col+';padding:3px 8px;background:'+area.col+'12;border-left:2px solid '+area.col+';border-radius:0 3px 3px 0;margin-bottom:4px;">'+area.label+' ('+aItems.length+'件)</div>';
  aItems.forEach(a=>{
    const sT=new Date(a.startTime).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"});
    const eT=a.endTime?new Date(a.endTime).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}):"終了";
    const dur=a.endTime?fmtDur(a.endTime-a.startTime):null;
    html+='<div style="display:grid;grid-template-columns:1fr auto auto auto;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.03);">';
    html+='<span style="font-size:13px;font-weight:700;color:#e8dcc8;">'+a.castName+'</span>';
    html+='<span style="font-size:11px;color:#555;white-space:nowrap;text-align:right;">'+sT+'→'+eT+(dur?'<br>('+dur+')':'')+'</span>';
    html+='<span style="font-size:10px;color:#444;"></span>';
    html+='<button class="btn" data-daid="'+a.id+'" onclick="event.stopPropagation();deleteAssign(this.dataset.daid)" style="padding:4px 8px;background:rgba(255,80,80,.08);border:1px solid rgba(255,80,80,.2);color:#ff6b6b;border-radius:4px;font-size:10px;touch-action:manipulation;">削除</button>';
    html+='</div>';
  });
  html+='</div>';
});
html+='</div>'; // end glass
  });
  html+='</div>';
  return html;
}

function rTableDetail(){
  const tid=window._detailTid;
  const t=S.tables.find(t=>t.id===tid);
  if(!t)return '<div style="padding:20px;"><button class="btn" onclick="sv(\'list\')" style="color:#888;background:none;font-size:13px;">← リストへ戻る</button><div style="color:#555;margin-top:16px;">テーブルが見つかりません</div></div>';
  const s=S.sessions[tid];
  // セッションがある場合はそのstartTime以降のアサインのみ表示（前回客のデータを除外）
  // hhmm2tsの秒切り捨て分を考慮して60秒のマージンを設ける
  const sessionStart=s?s.startTime:null;
  const allA=Object.values(S.assignments||{})
.filter(a=>{
  if(a.tableId!==tid)return false;
  // セッションなし（会計終了後）は何も表示しない
  if(sessionStart===null)return false;
  // sessionIdがある場合はそれで一致判定（最も確実）
  if(a.sessionId!=null)return a.sessionId===sessionStart;
  // sessionIdがない古いデータはstartTimeで判定（60秒のマージン）
  return a.startTime>=(sessionStart-60000);
})
.sort((a,b)=>a.startTime-b.startTime);
  const acA=allA.filter(a=>!a.endTime);
  const doneA=allA.filter(a=>a.endTime);
  const relatedCastIds=new Set(allA.map(a=>String(a.castId)));

  let html='<div style="max-width:600px;margin:0 auto;">';
  html+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">';
  html+='<button class="btn" onclick="sv(\'list\')" style="padding:6px 12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:4px;font-size:13px;touch-action:manipulation;">← リスト</button>';
  html+='<h2 style="font-family:\'Cormorant Garamond\',serif;font-size:22px;color:#d4a017;">'+t.label+'</h2>';
  if(isV(tid))html+='<span class="tag tv2">VIP</span>';
  html+='</div>';

  // テーブル情報カード
  html+='<div class="glass" style="border-radius:8px;padding:14px;margin-bottom:14px;">';
  if(s){
const rv=rem(s.setEndTime);const urg=rv!==null&&rv<600000&&rv>0;const exp=rv!==null&&rv<=0;
const tc=exp?"#ff4444":urg?"#ff6b6b":"#d4a017";const tr=rv===null?"—":exp?"- "+ts(-rv):"残 "+ts(rv);
const hn=(s.items||[]).filter(i=>i.isHonShimei).map(itemCastName).filter(Boolean);
const bn=(s.items||[]).filter(i=>i.isBanaiShimei).map(itemCastName).filter(Boolean);
const honCount=hn.length;const freeCount=Math.max(0,s.guests-honCount);
let guestStr=s.guests+'名'+(honCount>0&&freeCount>0?' (本'+honCount+' F'+freeCount+')':honCount>0?' (本'+honCount+')':' (F'+s.guests+')');
html+='<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">';
html+='<div><div style="font-size:12px;color:#999;">'+new Date(s.startTime).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})+(s.setEndTime?' → '+new Date(s.setEndTime).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}):"")+" · "+guestStr+'</div>';
if(hn.length||bn.length){html+='<div style="font-size:11px;margin-top:3px;">'+hn.map(n=>'<span style="color:#ff4444;margin-right:5px;">本'+n+'</span>').join("")+bn.map(n=>'<span style="color:#4ade80;margin-right:5px;">場'+n+'</span>').join("")+'</div>';}
html+='</div><div style="font-size:22px;font-weight:700;color:'+tc+';" class="'+(urg||exp?"urg":"")+'">'+tr+'</div></div>';
html+='<button class="btn gbg" onclick="tsukeMd={step:\'cast\',castId:null,type:null,tableId:\''+tid+'\',time:\'\'};om(\'tsuke\')" style="width:100%;padding:10px;font-size:14px;font-weight:700;border-radius:6px;touch-action:manipulation;">＋ 付ける</button>';
  } else {
html+='<div style="font-size:13px;color:#555;">（会計済み・付け回し履歴のみ表示）</div>';
  }
  html+='</div>';

  // ===== 現在（コンパクト・タップで詳細）=====
  html+='<div class="glass" style="border-radius:8px;padding:14px;margin-bottom:14px;">';
  html+='<div class="st" style="margin-bottom:10px;">現在</div>';
  if(!acA.length){html+='<div style="font-size:13px;color:#555;">付け回しなし</div>';}
  acA.forEach(a=>{
const col=ASSIGN_TYPES[a.type]?.col||"#888";const lbl=ASSIGN_TYPES[a.type]?.label||a.type;
const elapsed=Date.now()-(a.attachedAt||a.startTime);
html+='<div data-atd="'+a.id+'" onclick="openAssignActionModal(this.dataset.atd)" style="padding:12px 16px;background:rgba(0,0,0,.2);border:1px solid '+col+'55;border-radius:8px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;touch-action:manipulation;">';
// 左：タイプバッジ＋キャスト名
html+='<div style="display:flex;align-items:center;gap:10px;">';
html+='<span style="font-size:11px;padding:2px 8px;border:1px solid '+col+';color:'+col+';border-radius:4px;font-weight:700;white-space:nowrap;">'+lbl+'</span>';
html+='<span style="font-size:16px;font-weight:700;color:#e8dcc8;">'+a.castName+'</span>';
html+='</div>';
// 右：経過時間（data-timerでtickList更新）
html+='<span data-timer="'+(a.attachedAt||a.startTime)+'" style="font-size:22px;font-weight:700;font-family:monospace;color:'+col+';">'+ts(elapsed).slice(3)+'</span>';
html+='</div>';
  });
  html+='</div>';

  // ===== 付け回し履歴 =====
  if(doneA.length){
html+='<div class="glass" style="border-radius:8px;padding:14px;margin-bottom:14px;">';
html+='<div class="st" style="margin-bottom:12px;">付け回し履歴 ('+doneA.length+'件)</div>';
// タイプ別エリア定義
const areaTypes=[
  {key:"hon", label:"本指名", col:"#d4a017", types:["hon"]},
  {key:"free",   label:"フリー", col:"#38bdf8", types:["free","harem"]},
  {key:"help",   label:"ヘルプ", col:"#4ade80", types:["help"]},
  {key:"banai",  label:"場内指名", col:"#a78bfa", types:["banai"]},
];
areaTypes.forEach(area=>{
  const aItems=doneA.filter(a=>area.types.includes(a.type));
  if(!aItems.length)return;
  html+='<div style="margin-bottom:12px;">';
  html+='<div style="font-size:11px;font-weight:700;color:'+area.col+';padding:4px 10px;background:'+area.col+'12;border-left:3px solid '+area.col+';border-radius:0 4px 4px 0;margin-bottom:6px;">'+area.label+' ('+aItems.length+'件)</div>';
  [...aItems].reverse().forEach(a=>{
    const col=ASSIGN_TYPES[a.type]?.col||"#555";
    const lbl=ASSIGN_TYPES[a.type]?.label||a.type;
    const worked=a.endTime-a.startTime;
    const sT=new Date(a.startTime).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"});
    const eT=new Date(a.endTime).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"});
    html+='<div style="display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.04);">';
    html+='<span style="font-size:11px;font-weight:700;padding:2px 8px;border:1px solid '+col+'88;color:'+col+';border-radius:10px;background:'+col+'12;">'+lbl+'</span>';
    html+='<span style="font-size:13px;color:#e8dcc8;font-weight:600;">'+a.castName+'</span>';
    html+='<span style="font-size:11px;color:#555;white-space:nowrap;text-align:right;">'+sT+'→'+eT+'<br><span style="color:#444;">('+fmtDur(worked)+')</span></span>';
    html+='<div style="display:flex;gap:3px;">';
    html+='<button class="btn" data-aidct2="'+a.id+'" onclick="event.stopPropagation();openChangeType(this.dataset.aidct2)" style="padding:3px 6px;background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.2);color:#a78bfa;border-radius:3px;font-size:10px;touch-action:manipulation;">タイプ</button>';
    html+='<button class="btn" data-eid2="'+a.id+'" onclick="event.stopPropagation();openEditAssignTime(this.dataset.eid2)" style="padding:3px 6px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:3px;font-size:10px;touch-action:manipulation;">時刻</button>';
    html+='<button class="btn" data-aid5="'+a.id+'" onclick="event.stopPropagation();deleteAssign(this.dataset.aid5)" style="padding:3px 6px;background:rgba(255,80,80,.06);border:1px solid rgba(255,80,80,.15);color:#ff6b6b;border-radius:3px;font-size:10px;touch-action:manipulation;">削除</button>';
    html+='</div>';
    html+='</div>';
  });
  html+='</div>';
});
html+='</div>';
  }

  html+='</div>';
  return html;
}

function openAssignActionModal(aid){if(isPendingAssignment(aid)){sbs(false,"保存中...");return;}window._editAid=aid;md="assignAction";rModal();}

function openEditAssignTime(aid){
  if(isPendingAssignment(aid)){sbs(false,"保存中...");return;}
  window._editAid=aid;md="editAssignTime";rModal();
}
async function saveAssignTimeEdit(){
  const aid=window._editAid;
  if(isPendingAssignment(aid)){sbs(false,"保存中...");return;}
  const current=S.assignments[aid];if(!current)return;
  const expected=cloneData(current);
  const desired=cloneData(current);
  const sEl=document.getElementById("eat-start");
  const eEl=document.getElementById("eat-end");
  if(sEl&&sEl.value){
desired.startTime=hhmm2ts(sEl.value);
desired.attachedAt=desired.startTime; // カウントアップ基準も同期
  }
  if(eEl&&eEl.value){desired.endTime=hhmm2ts(eEl.value);if(desired.startTime&&desired.endTime<=desired.startTime)desired.endTime+=86400000;}
  else if(eEl&&eEl.value==="")desired.endTime=null;
  if(desired.endTime&&desired.endTime-desired.startTime>86400000){alert("付け回し時間は24時間以内にしてください。");return;}
  await withDataOperation("assignment:"+aid,async()=>{
    try{
      await guardedCheckedUpdate(
        {[FB_ROOT+"/assignments/"+aid]:desired},
        root=>{
          if(!desired.endTime&&remoteActiveAssign(root,desired.castId,[aid]))return{ok:false,message:"このキャストは他端末ですでに別のテーブルへ付け回されています。"};
          return{ok:true};
        },
        {expectedRecords:{["assignments/"+aid]:expected}}
      );
      sbs(true,"同期済み ✓");closeM();render();
    }catch(e){
      sbs(false,"保存エラー");
      alert(e.userMessage||"付け回し時刻の保存に失敗しました。最新状態を確認してください。");
    }
  });
}

// ===== CHECKIN =====
function resetCheckinState(){ci={guests:1,setMenu:null,setType:null,honShimeis:[],douhan:false,freedrink:false,single:false,note:""};etv=roundHHMM(5);}
function openCheckinWizard(tableId){at=tableId;resetCheckinState();md="ci-guests";rModal();}
function cancelCheckin(){if(checkinBusy)return;resetCheckinState();at=null;closeM();render();}
function ciGo(step){md=step;rModal();}
function ciSetGuests(n){const v=parseInt(n,10);if(v>0){ci.guests=v;ciGo("ci-set-type");}}
function ciSelectSetType(type){ci.setType=type;ci.setMenu=null;ciGo("ci-set");}
function ciSelectSet(id){ci.setMenu=id;ciGo("ci-time");}
function ciToggleHon(id){id=parseInt(id,10);ci.honShimeis=ci.honShimeis.includes(id)?ci.honShimeis.filter(x=>x!==id):[...ci.honShimeis,id];rModal();}
function ciAfterHon(){if(ci.honShimeis.length>0)ciGo("ci-douhan");else if(ci.guests===1)ciGo("ci-single");else ciGo("ci-note");}
function ciSetDouhan(v){ci.douhan=!!v;rModal();}
function ciAfterDouhan(){if(ci.guests===1)ciGo("ci-single");else ciGo("ci-note");}
function ciSetSingle(v){ci.single=!!v;rModal();}
function ciAfterSingle(){ciGo("ci-note");}
function saveNoteInline(val){const s=S.sessions[at];if(!s)return;s.note=val;save("sessions/"+at,S.sessions[at]);}

// ===== ORDER =====
// order画面は一度だけHTML構造を組み立てる
// タイマーや注文リストは差分更新（renderOrderPartial）で更新
// アイテム分類ヘルパー
function isSetCatItem(i){return !!(i.isSet||i.isHonShimei||i.isBanaiShimei||i.isExtension||i.isRoomCharge||i.isVipCharge||i.isKaraokeCharge||i.label==="同伴料"||(i.label||"").includes("シングルチャージ"));}
function isGuestCatItem(i){if(isSetCatItem(i)||i.isDiscount)return false;const id=String(i?.id||"");if(id.startsWith("gcu_"))return true;if(isFreeDrinkItem(i))return true;return (S.menus.drinks||[]).some(d=>id===String(d.id)||id.startsWith(String(d.id)+"_"));}
function isCastCatItem(i){if(isSetCatItem(i)||i.isDiscount)return false;if(i.id&&i.id.startsWith("gcu_"))return false;if(i.id&&i.id.startsWith("cd_"))return true;if(i.id&&i.id.startsWith("cu_"))return true;if(i.id&&i.id.startsWith("cci_"))return true;return [...(S.menus.champagne||[]),...(S.menus.keepBottles||[])].some(d=>i.id===d.id||i.id.startsWith(d.id+"_"));}
function remItemDetail(id){const s=S.sessions[at];const item=(s?.items||[]).find(i=>i.id===id);window._delItemId=id;window._delItemLabel=item?item.label:'このアイテム';window._delPrevMd=md;om('confirm-del');}
function isBanaiExtensionBackItem(i){
  if(!i||isSetCatItem(i)||i.isDiscount)return false;
  const id=String(i.id||"");
  if(i.category==="champagneWine"||i.category==="keepBottle")return true;
  const inMenu=(key)=>(S.menus?.[key]||[]).some(d=>id===String(d.id)||id.startsWith(String(d.id)+"_"));
  return inMenu("champagne")||inMenu("keepBottles");
}
async function execDelItem(){const id=window._delItemId;const prev=window._delPrevMd;window._delItemId=null;window._delItemLabel=null;window._delPrevMd=null;if(!id)return;const saved=await remItem(id);if(!saved)return;if(prev){md=prev;rModal();}else closeM();}
async function execDeleteSession(){
  if(!at||!S.sessions[at])return;
  const deletedTableId=at;
  return withDataOperation("table:"+deletedTableId,async()=>{
  const deletedSession=cloneData(S.sessions[deletedTableId]);
  try{await waitForSessionSaveQueue(deletedTableId);await ensureSessionCurrent(deletedTableId,deletedSession);}
  catch(e){return;}
  const _cu={};
  _cu[FB_ROOT+"/sessions/"+deletedTableId]=null;
  const _delShiftIds=new Set();
  const expectedRecords={};
  // アクティブなアサインを削除し、変更したシフトだけを同じトランザクションで待機へ戻す
  Object.values(S.assignments||{}).forEach(a=>{
    if(a.tableId!==deletedTableId||a.endTime)return;
    _cu[FB_ROOT+"/assignments/"+a.id]=null;
    expectedRecords["assignments/"+a.id]=cloneData(a);
    const shift=getShiftByCastId(a.castId);
    if(shift&&!_delShiftIds.has(shift.id)){
      _delShiftIds.add(shift.id);
      _cu[FB_ROOT+"/shifts/"+shift.id]=shiftWithStatus(shift,"waiting",Date.now());
      expectedRecords["shifts/"+shift.id]=cloneData(shift);
    }
  });
  try{
    await queueSessionUpdate(deletedTableId,()=>_cu,{session:deletedSession,expectedRecords});
    sbs(true,"同期済み ✓");
  }catch(e){
    sbs(false,"保存エラー");
    alert(e.userMessage||"テーブル削除に失敗しました。最新状態を確認してください。");
    return;
  }
  const fomEl=document.getElementById("floor-order-modal");if(fomEl)fomEl.style.display="none";
  at=null;md=null;vw="floor";render();
  });
}

// ===== ラストオーダー機能 =====
function toggleLO(){
  if(!S.loMode){om("loModeOn");}
  else{md="loList";rModal();}
}
function execLOStart(){
  S.loMode=true;S.loStatus={};
  if(window._db)guardedRootUpdate({loMode:true,loStatus:null}).then(()=>sbs(true,"同期済み ✓"));
  closeM();render();
}
function execLOComplete(){
  const tid=window._loTableId;if(!tid)return;
  S.loStatus[tid]="done";
  if(window._db)guardedSet("loStatus/"+tid,"done").then(()=>sbs(true,"同期済み ✓"));
  window._loTableId=null;md="loList";rModal();
}
function execLOUndone(tid){
  delete S.loStatus[tid];
  if(window._db)guardedRemove("loStatus/"+tid).then(()=>sbs(true,"同期済み ✓"));
  md="loFix";rModal();
}
function execLOEnd(){
  S.loMode=false;S.loStatus={};
  if(window._db)guardedRootUpdate({loMode:false,loStatus:null}).then(()=>sbs(true,"同期済み ✓"));
  closeM();render();
}


function odq(id){
  qv=1;
  const menuSources=[
    {items:S.menus.drinks||[],category:""},
    {items:S.menus.champagne||[],category:"champagneWine"},
    {items:S.menus.keepBottles||[],category:"keepBottle"}
  ];
  const source=menuSources.find(entry=>entry.items.some(item=>item.id===id));
  const d=source?.items.find(item=>item.id===id);
  if(d){qm={id:d.id,label:d.label,price:d.price,category:source.category};om("qty");}
}
function ofdq(){om("fd");}
function selectFreeDrink(minutes,price){qv=S.sessions[at]?.guests||1;qm={id:"fd_add",label:price===0?freeDrinkLabel(0):freeDrinkLabel(minutes),price,category:"",isFreeDrink:true,freeDrinkMinutes:minutes};om("qty");}
function oet(){
  const s=S.sessions[at];const t=new Date(s.startTime);
  etv=roundHHMM(5);
  om("et");
}

// ===== HISTORY / SETTINGS は省略なし =====
function rHist(){
  let html='<div style="max-width:720px;margin:0 auto;">';
  html+='<h2 style="font-family:Cormorant Garamond,serif;font-size:22px;color:#d4a017;margin-bottom:16px;">会計履歴</h2>';
  // 現状サマリー（現在の営業日のデータ）
  const todaySales=(S.history||[]).reduce((a,h)=>a+h.total,0);
  const pendingSales=Object.values(S.sessions||{}).reduce((a,s)=>a+ct(s).total,0);
  const grandTotal=todaySales+pendingSales;
  // 組数・客数
  const doneGroups=(S.history||[]).length;
  const doneGuests=(S.history||[]).reduce((a,h)=>a+(h.guests||0),0);
  const activeGroups=Object.values(S.sessions||{}).length;
  const activeGuests=Object.values(S.sessions||{}).reduce((a,s)=>a+(s.guests||0),0);
  const totalGroups=doneGroups+activeGroups;
  const totalGuests=doneGuests+activeGuests;
  // 客単価（100円単位切り上げ）
  const unitPrice=totalGuests>0?Math.ceil(grandTotal/totalGuests/100)*100:0;
  // キャスト合計稼働時間（30分単位切り上げ）
  const workMs=Object.values(S.shifts||{}).reduce((a,sh)=>a+safeShiftDurationMs(sh),0);
  const workMin=workMs/60000;
  const workRounded=Math.ceil(workMin/30)*30;
  const workH=workRounded/60;
  const workHStr=(workH%1===0)?workH.toString():(Math.round(workH*10)/10).toFixed(1);
  html+='<div class="glass" style="border-radius:8px;padding:14px;margin-bottom:16px;">';
  html+='<div class="st" style="margin-bottom:10px;">現状</div>';
  html+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;">';
  html+='<div style="text-align:center;padding:10px;background:rgba(74,222,128,.06);border:1px solid rgba(74,222,128,.15);border-radius:6px;"><div style="font-size:10px;color:#888;margin-bottom:4px;">会計済み</div><div style="font-size:16px;font-weight:700;color:#4ade80;">'+pAmt(todaySales)+'</div></div>';
  html+='<div style="text-align:center;padding:10px;background:rgba(255,165,0,.06);border:1px solid rgba(255,165,0,.15);border-radius:6px;"><div style="font-size:10px;color:#888;margin-bottom:4px;">未収（進行中）</div><div style="font-size:16px;font-weight:700;color:#ffa500;">'+pAmt(pendingSales)+'</div></div>';
  html+='<div style="text-align:center;padding:10px;background:rgba(212,160,23,.06);border:1px solid rgba(212,160,23,.15);border-radius:6px;"><div style="font-size:10px;color:#888;margin-bottom:4px;">合計見込み</div><div style="font-size:16px;font-weight:700;color:#d4a017;">'+pAmt(grandTotal)+'</div></div>';
  html+='</div>';
  html+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">';
  html+='<div style="padding:8px 10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:6px;"><div style="font-size:10px;color:#888;margin-bottom:3px;">組数</div><div style="font-size:15px;font-weight:700;color:#e8dcc8;">'+totalGroups+'<span style="font-size:11px;font-weight:400;color:#888;">組</span></div></div>';
  html+='<div style="padding:8px 10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:6px;"><div style="font-size:10px;color:#888;margin-bottom:3px;">総客数</div><div style="font-size:15px;font-weight:700;color:#e8dcc8;">'+totalGuests+'<span style="font-size:11px;font-weight:400;color:#888;">人</span></div></div>';
  html+='<div style="padding:8px 10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:6px;"><div style="font-size:10px;color:#888;margin-bottom:3px;">客単価</div><div style="font-size:15px;font-weight:700;color:#a78bfa;">'+(totalGuests>0?'¥'+fmt(unitPrice):'-')+'</div></div>';
  html+='</div>';
  html+='<div style="margin-top:8px;padding:8px 10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:6px;display:flex;justify-content:space-between;align-items:center;">';
  html+='<span style="font-size:10px;color:#888;">稼働時間</span>';
  html+='<span style="font-size:15px;font-weight:700;color:#38bdf8;">'+workHStr+'<span style="font-size:11px;font-weight:400;color:#888;">時間</span></span>';
  html+='</div>';
  const paySummary=_paymentBreakdownFromHist(S.history||[]);
  const salesSummary=_salesDataTotalsFromHist(S.history||[]);
  html+='<div style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;">';
  html+='<div style="padding:10px;background:rgba(184,150,12,.06);border:1px solid rgba(184,150,12,.18);border-radius:6px;"><div style="font-size:11px;color:#d4a017;font-weight:700;margin-bottom:6px;">会計データ</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;"><div><div style="font-size:10px;color:#888;">現金会計</div><div style="font-size:14px;font-weight:700;color:#d4a017;">'+pAmt(paySummary.cashTotal)+'</div></div><div><div style="font-size:10px;color:#888;">カード会計</div><div style="font-size:14px;font-weight:700;color:#38bdf8;">'+pAmt(paySummary.cardTotal)+'</div></div></div><button class="btn" onclick="exportAccountingDataXLSX()" style="width:100%;padding:8px;background:rgba(212,160,23,.08);border:1px solid rgba(212,160,23,.25);color:#d4a017;border-radius:6px;font-size:12px;font-weight:700;">会計データ出力</button></div>';
  html+='<div style="padding:10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:6px;"><div style="font-size:11px;color:#4ade80;font-weight:700;margin-bottom:6px;">売上データ</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;"><div><div style="font-size:10px;color:#888;">本指名売上</div><div style="font-size:14px;font-weight:700;color:#d4a017;">'+pAmt(salesSummary.honShimeiSales)+'</div></div><div><div style="font-size:10px;color:#888;">場内延長売上</div><div style="font-size:14px;font-weight:700;color:#ffa500;">'+pAmt(salesSummary.banaiExtensionSales)+'</div></div><div><div style="font-size:10px;color:#888;">指名本数</div><div style="font-size:13px;font-weight:700;color:#ff4444;">'+salesSummary.honCount+'本</div></div><div><div style="font-size:10px;color:#888;">場内指名本数</div><div style="font-size:13px;font-weight:700;color:#4ade80;">'+salesSummary.banaiCount+'本</div></div><div><div style="font-size:10px;color:#888;">同伴本数</div><div style="font-size:13px;font-weight:700;color:#e8dcc8;">'+salesSummary.dohanCount+'本</div></div></div><button class="btn" onclick="exportSalesDataXLSX()" style="width:100%;padding:8px;background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.25);color:#4ade80;border-radius:6px;font-size:12px;font-weight:700;">売上データ出力</button></div>';
  html+='<div style="padding:10px;background:rgba(56,189,248,.05);border:1px solid rgba(56,189,248,.16);border-radius:6px;"><div style="font-size:11px;color:#38bdf8;font-weight:700;margin-bottom:6px;">ドリンクデータ</div><div style="font-size:10px;color:#888;margin-bottom:8px;">キャスト別ドリンク本数</div><button class="btn" onclick="exportDrinkDataXLSX()" style="width:100%;padding:8px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.25);color:#38bdf8;border-radius:6px;font-size:12px;font-weight:700;">ドリンクデータ出力</button></div>';
  html+='</div>';
  html+='</div>';

  // ===== 会計履歴（開いている営業日のみ）=====
  const todayHist=[...(S.history||[])].sort((a,b)=>b.startTime-a.startTime);
  if(todayHist.length>0){
const totalAmt=todayHist.reduce((a,h)=>a+h.total,0);
const subtotalAmt=todayHist.reduce((a,h)=>a+(h.subtotal||h.total),0);
html+='<div class="glass" style="border-radius:8px;padding:12px 16px;margin-bottom:16px;">';
html+='<div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;">';
html+='<span style="font-size:12px;color:#888;">'+todayHist.length+'件</span>';
html+='<span style="font-size:12px;color:#666;">小計 '+pAmt(subtotalAmt)+'</span>';
html+='<span style="font-size:16px;font-weight:700;color:#d4a017;">合計 '+pAmt(totalAmt)+'</span>';
html+='</div>';
html+='</div>';
  }
  if(todayHist.length===0){html+='<div style="color:#555;font-size:14px;">会計履歴がありません</div>';}
  else todayHist.forEach(h=>{
const exp=expandedHist[h.id];
const hHon=(h.items||[]).filter(i=>i.isHonShimei).map(itemCastName).filter(Boolean);
const hBan=(h.items||[]).filter(i=>i.isBanaiShimei).map(itemCastName).filter(Boolean);
html+='<div class="hist-card">';
html+='<div class="hist-header" data-hid="'+h.id+'" onclick="toggleHist(parseInt(this.dataset.hid))">';
html+='<div style="flex:1;"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">';
html+='<span style="font-weight:600;font-size:15px;">'+h.tableLabel+'</span>';
if(h.note)html+='<span style="font-size:11px;color:#ffa500;background:rgba(255,165,0,.1);padding:1px 7px;border-radius:8px;">'+h.note+'</span>';
html+='<span style="font-size:12px;color:#888;">'+h.guests+'名</span>';
if(hHon.length)html+='<span style="font-size:11px;color:#ff4444;">本:'+hHon.join("・")+'</span>';
if(hBan.length)html+='<span style="font-size:11px;color:#4ade80;">場:'+hBan.join("・")+'</span>';
html+='</div>';
html+='<div style="font-size:11px;color:#666;">'+new Date(h.startTime).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})+' → '+new Date(h.endTime).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})+'</div></div>';
html+='<div style="display:flex;align-items:center;gap:8px;"><span style="color:#d4a017;font-weight:700;font-size:16px;">'+pAmt(h.total)+'</span>'
  +(h.splits&&h.splits.length>0
    ?h.splits.map(sp=>'<span style="font-size:10px;padding:2px 5px;background:'+(sp.method==="card"?"rgba(56,189,248,.15)":"rgba(184,150,12,.12)")+';border:1px solid '+(sp.method==="card"?"rgba(56,189,248,.3)":"rgba(184,150,12,.3)")+';color:'+(sp.method==="card"?"#38bdf8":"#d4a017")+';border-radius:3px;font-weight:700;">'+(sp.method==="card"?"カード":"現金")+'¥'+fmt(sp.amount)+'</span>').join("")
    :(h.payMethod==="card"
      ?'<span style="font-size:10px;padding:2px 6px;background:rgba(56,189,248,.15);border:1px solid rgba(56,189,248,.3);color:#38bdf8;border-radius:3px;font-weight:700;">カード</span>'
      :'<span style="font-size:10px;padding:2px 6px;background:rgba(184,150,12,.12);border:1px solid rgba(184,150,12,.3);color:#d4a017;border-radius:3px;font-weight:700;">現金</span>')
    )
  +'<span style="color:#555;font-size:18px;">'+(exp?"▲":"▼")+'</span></div></div>';
if(exp){
  html+='<div class="hist-body"><div style="margin:12px 0;">';
  [...(h.items||[])].forEach(i=>{const isDisc=i.isDiscount;html+='<div class="ir" style="font-size:13px;"><span style="color:'+(isDisc?"#ff6b6b":"#bbb")+'">'+(i.qty>1?i.label+" × "+i.qty:i.label)+'</span><span style="color:'+(isDisc?"#ff6b6b":"#d4a017")+'">'+(isDisc?"-":"")+pAmt(Math.abs(i.price*(i.qty||1)))+'</span></div>';});
  html+='</div><div style="border-top:1px solid rgba(255,255,255,.08);padding-top:10px;">';
  html+='<div class="ir" style="font-size:12px;"><span style="color:#888;">小計</span><span>'+pAmt(h.subtotal||h.total)+'</span></div>';
  if(h.discount>0)html+='<div class="ir" style="font-size:12px;"><span style="color:#ff6b6b;">割引</span><span style="color:#ff6b6b;">-'+pAmt(h.discount)+'</span></div>';
  html+='<div class="ir" style="font-size:12px;"><span style="color:#888;">tax+SC ('+Math.round((h.rate||TAX_RATE)*100)+'%)</span><span>'+pAmt(h.tax)+'</span></div>';
  html+='<div class="ir" style="font-size:15px;font-weight:700;"><span>合計</span><span style="color:#d4a017;">'+pAmt(h.total)+'</span></div></div>';
  html+='<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">';
  html+='<button class="btn" data-phidg="'+h.id+'" onclick="printHistReceiptGuest(Number(this.dataset.phidg))" style="padding:6px 12px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.25);color:#38bdf8;border-radius:4px;font-size:12px;font-weight:600;">🖨 ゲスト</button>';
  html+='<button class="btn" data-phids="'+h.id+'" onclick="printHistReceipt(Number(this.dataset.phids))" style="padding:6px 12px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);color:#ddd;border-radius:4px;font-size:12px;">🖨 店舗</button>';
  html+='<button class="btn" data-ehid="'+h.id+'" onclick="editHistPay(parseInt(this.dataset.ehid))" style="padding:6px 12px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.2);color:#38bdf8;border-radius:4px;font-size:12px;">支払変更</button>';
  if((S.history||[]).some(sh=>sh.id===h.id)){
    html+='<button class="btn" data-dhid="'+h.id+'" onclick="cdh(parseInt(this.dataset.dhid))" style="padding:6px 12px;background:rgba(255,80,80,.1);border:1px solid rgba(255,80,80,.2);color:#ff6b6b;border-radius:4px;font-size:12px;">削除</button>';
  }
  html+='</div></div>';
}
html+='</div>';
  });
  html+='</div>';
  return html;
}
function toggleHist(id){expandedHist[id]=!expandedHist[id];render();}
function rAnalysis(){
  let html='<div style="max-width:720px;margin:0 auto;">';
  html+='<h2 style="font-family:Cormorant Garamond,serif;font-size:22px;color:#d4a017;margin-bottom:16px;">分析</h2>';
  html+='<div class="glass" style="border-radius:8px;padding:14px;margin-bottom:16px;">';
  html+='<div class="st" style="margin-bottom:12px;">売上情報</div>';
  html+='<div style="display:flex;gap:8px;flex-wrap:wrap;">';
  html+='<button class="btn" onclick="analysisSt.mode=\'uriage\';analysisSt.castId=null;analysisSt.castName=null;md=\'anaDateSel\';rModal()" style="padding:9px 18px;border-radius:6px;font-size:13px;font-weight:700;background:rgba(212,160,23,.08);border:1px solid rgba(212,160,23,.25);color:#d4a017;touch-action:manipulation;">売上情報</button>';
  html+='</div>';
  html+='</div>';
  html+='</div>';
  return html;
}
function anaSetMonth(){
  const biz=S.activeBizDay||getBizDate();
  histFilter.from=biz.substring(0,7)+"-01";histFilter.fromTime="19:00";
  const nd=new Date(biz+"T19:00:00");nd.setDate(nd.getDate()+1);
  histFilter.to=nd.toLocaleDateString("sv-SE");histFilter.toTime="18:59";
  rModal();
}
function anaClrFilter(){histFilter={from:"",to:"",fromTime:"19:00",toTime:"18:59"};rModal();}
function setHistToday(){
  if(S.activeBizDay){
histFilter.from=S.activeBizDay;
histFilter.fromTime="19:00";
const nd=new Date(S.activeBizDay+"T19:00:00");nd.setDate(nd.getDate()+1);
histFilter.to=nd.toLocaleDateString("sv-SE");
histFilter.toTime="18:59";
  }else{
// 営業外: S.bizDaysから最新の営業日を取得
const lastDay=Object.values(S.bizDays||{}).filter(d=>d.endedAt).sort((a,b)=>b.endedAt-a.endedAt)[0];
const dateStr=lastDay?lastDay.date:getBizDate();
histFilter.from=dateStr;
histFilter.fromTime="19:00";
const nd=new Date(dateStr+"T19:00:00");nd.setDate(nd.getDate()+1);
histFilter.to=nd.toLocaleDateString("sv-SE");
histFilter.toTime="18:59";
  }
  render();
}
function clearHistFilter(){histFilter={from:"",to:"",fromTime:"19:00",toTime:"18:59"};render();}
function getFilteredHist(){
  // 分析は営業終了済みの営業日だけを対象にする
  let allHist=[];
  Object.values(S.bizDays||{}).filter(day=>day&&day.endedAt).forEach(day=>{
if(Array.isArray(day.history))allHist=allHist.concat(day.history);
  });
  // 重複除去（id基準）
  const seen=new Set();
  allHist=allHist.filter(h=>{if(seen.has(h.id))return false;seen.add(h.id);return true;});
  // フィルター適用
  return allHist.filter(h=>{
if(histFilter.from){const from=new Date(histFilter.from+"T"+(histFilter.fromTime||"19:00")).getTime();if(h.startTime<from)return false;}
if(histFilter.to){const to=new Date(histFilter.to+"T"+(histFilter.toTime||"18:59")+":59").getTime();if(h.startTime>to)return false;}
return true;
  }).sort((a,b)=>b.startTime-a.startTime);
}
function exportCSV(){
  const data=getFilteredHist();
  if(data.length===0){alert("エクスポートするデータがありません");return;}
  const bom="\uFEFF";
  const header=["日時","テーブル","人数","滞在時間(分)","小計","割引","税+SC","合計","支払方法","明細"].join(",");
  const rows=data.map(h=>{
const dur=Math.round((h.endTime-h.startTime)/60000);
const detail=(h.items||[]).map(i=>(i.qty>1?i.label+"×"+i.qty:i.label)+"(¥"+fmt(Math.abs(i.price*(i.qty||1)))+")").join("／");
return[new Date(h.startTime).toLocaleString("ja-JP"),h.tableLabel||"",h.guests,dur,h.subtotal||0,h.discount||0,h.tax||0,h.total||0,h.payMethod==="card"?"カード":"現金",'"'+detail+'"'].join(",");
  });
  const csv=bom+header+"\n"+rows.join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download="genesis_"+(histFilter.from||S.activeBizDay||getBizDate())+".csv";a.click();URL.revokeObjectURL(url);
}
function cdh(id){dhi=id;om("dh");}

// ===== 分割払い操作 =====
function spSetMethod(idx,method){
  coState.splits[idx].method=method;rModal();
}
function spUpdateAmt(idx,val){
  coState.splits[idx].amount=parseInt(val)||0;
  const s=S.sessions[at];if(!s)return;
  const total=ct(s).total;
  const used=coState.splits.reduce((a,sp)=>a+(sp.amount||0),0);
  const rem=total-used;
  // 残額表示を更新
  const remEl=document.getElementById("sp-remain");
  if(remEl){
if(rem>0){
  remEl.textContent="残り ¥"+fmt(rem);
  remEl.style.color="#ff6b6b";remEl.style.background="rgba(255,80,80,.08)";remEl.style.border="1px solid rgba(255,80,80,.2)";
}else if(rem<0){
  remEl.textContent="超過 ¥"+fmt(-rem);
  remEl.style.color="#ff6b6b";remEl.style.background="rgba(255,80,80,.08)";remEl.style.border="1px solid rgba(255,80,80,.2)";
}else{
  remEl.textContent="✓ 過不足なし";
  remEl.style.color="#4ade80";remEl.style.background="rgba(74,222,128,.08)";remEl.style.border="1px solid rgba(74,222,128,.2)";
}
  }
  // 確定ボタンの活性/非活性を更新
  const confirmBtn=document.getElementById("sp-confirm-btn");
  if(confirmBtn){
if(rem===0){
  confirmBtn.disabled=false;
  confirmBtn.textContent="✓ 会計終了を確定する";
  confirmBtn.className="btn gbg";
  confirmBtn.style.cssText="width:100%;padding:14px;font-size:16px;font-weight:700;border-radius:8px;touch-action:manipulation;";
}else{
  confirmBtn.disabled=true;
  confirmBtn.textContent="金額を合わせてください";
  confirmBtn.className="btn";
  confirmBtn.style.cssText="width:100%;padding:14px;font-size:16px;font-weight:700;border-radius:8px;opacity:.4;cursor:not-allowed;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);color:#666;";
}
  }
}
function spAdd(total){
  document.querySelectorAll(".sp-amt").forEach((el,i)=>{if(coState.splits[i])coState.splits[i].amount=parseInt(el.value)||0;});
  const used=coState.splits.reduce((a,sp)=>a+(sp.amount||0),0);
  coState.splits.push({method:"cash",amount:Math.max(0,total-used)});
  md="co2";rModal();
}
function spRemove(idx){
  coState.splits.splice(idx,1);
  md="co2";rModal();
}

// ===== 履歴支払変更 =====
function editHistPay(id){editPayHid=id;md="editpay";rModal();}
function epToggleMethod(btn,method){
  const row=btn.closest(".editpay-row");row.dataset.method=method;
  row.querySelectorAll(".ep-method-btn").forEach(b=>{
const isCash=b.dataset.m==="cash";
b.style.background=method===(isCash?"cash":"card")
  ?(isCash?"linear-gradient(135deg,#b8960c,#e8c84a)":"rgba(56,189,248,.2)")
  :"rgba(255,255,255,.06)";
b.style.borderColor=method===(isCash?"cash":"card")
  ?(isCash?"#b8960c":"#38bdf8"):"rgba(255,255,255,.1)";
b.style.color=method===(isCash?"cash":"card")
  ?(isCash?"#1a1200":"#38bdf8"):"#666";
  });
}
function epAddRow(){
  const rows=document.getElementById("editpay-rows");if(!rows)return;
  const div=document.createElement("div");
  div.className="editpay-row";div.dataset.method="cash";
  div.style.cssText="display:flex;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap;";
  div.innerHTML='<button class="btn ep-method-btn" data-m="cash" onclick="epToggleMethod(this,\'cash\')" style="width:52px;padding:8px 4px;border-radius:6px;font-size:11px;font-weight:700;background:linear-gradient(135deg,#b8960c,#e8c84a);border:2px solid #b8960c;color:#1a1200;touch-action:manipulation;">現金</button>'
+'<button class="btn ep-method-btn" data-m="card" onclick="epToggleMethod(this,\'card\')" style="width:52px;padding:8px 4px;border-radius:6px;font-size:11px;font-weight:700;background:rgba(255,255,255,.06);border:2px solid rgba(255,255,255,.1);color:#666;touch-action:manipulation;">カード</button>'
+'<input type="number" inputmode="numeric" class="ip editpay-amt" value="0" style="width:110px;font-size:16px;font-weight:700;"/>'
+'<button class="btn" onclick="this.closest(\'.editpay-row\').remove()" style="width:28px;height:28px;border-radius:50%;background:rgba(255,80,80,.15);color:#ff6b6b;font-size:14px;touch-action:manipulation;">×</button>';
  rows.appendChild(div);
}
function saveHistPay(){
  const h=S.history.find(x=>x.id===editPayHid);if(!h)return;
  const splits=[];
  document.querySelectorAll(".editpay-row").forEach(row=>{
const method=row.dataset.method||"cash";
const amount=parseInt(row.querySelector(".editpay-amt")?.value||"0")||0;
if(amount>0)splits.push({method,amount});
  });
  if(splits.length===0)return;
  h.splits=splits;h.payMethod=splits[0].method;delete h.receiptIssued;
  save("history/"+h.id,h);editPayHid=null;closeM();render();
}

// ===== 営業日（19:00〜翌18:59）=====
function getBizDayStart(t){
  const d=new Date(t||Date.now());
  if(d.getHours()<19)d.setDate(d.getDate()-1);
  d.setHours(19,0,0,0);return d.getTime();
}
function getBizDayEnd(t){
  const s=new Date(getBizDayStart(t));
  s.setDate(s.getDate()+1);s.setHours(18,59,59,999);return s.getTime();
}


function rSettings(){
  let html='<div style="max-width:680px;margin:0 auto;">';
  html+='<h2 style="font-family:Cormorant Garamond,serif;font-size:22px;color:#d4a017;margin-bottom:16px;">設定</h2>';
  html+='<div style="display:flex;gap:8px;margin-bottom:20px;">';
  [["cast","キャスト"],["menus","メニュー料金"],["special","特殊メニュー"],["tables","テーブル"]].forEach(([k,l])=>{
html+='<button class="nb '+(stab===k?"ac":"")+'" data-stab="'+k+'" onclick="sst(this.dataset.stab)">'+l+'</button>';
  });
  html+='</div>';
if(stab==="cast"){
const activeCasts=sc();
html+='<div class="glass" style="border-radius:8px;padding:16px;"><div class="st">キャスト名簿（入店順）</div>';
html+='<div style="font-size:11px;color:#666;margin-bottom:12px;">内部番号は登録順に自動付与されます。退店したキャストはPOS名簿から削除され、GMS側で管理します。</div>';
activeCasts.forEach(c=>{
html+='<div class="ir" style="gap:8px;align-items:center;">'
  +'<span style="width:48px;font-size:12px;color:#d4a017;font-weight:700;">No.'+castNo(c)+'</span>'
  +(c.castType==="trial"?'<span style="font-size:10px;color:#38bdf8;border:1px solid rgba(56,189,248,.3);border-radius:4px;padding:2px 6px;">体入</span>':'')
  +'<input class="ip" value="'+(c.name||"")+'" data-cid="'+c.id+'" onchange="ucn(parseInt(this.dataset.cid),this.value)" style="flex:1;font-size:13px;"/>'
  +(c.castType==="trial"?'<span style="font-size:11px;color:#64748b;white-space:nowrap;">'+(c.trialBizDay||currentCastBizDate())+'</span>':'')
  +'<button class="btn" data-cid="'+c.id+'" onclick="dc2(parseInt(this.dataset.cid))" style="padding:4px 10px;background:rgba(255,80,80,.1);border:1px solid rgba(255,80,80,.2);color:#ff6b6b;border-radius:4px;font-size:12px;">退店</button>'
  +'</div>';
});
html+='<div style="display:flex;gap:8px;margin-top:16px;"><input class="ip" id="nci" placeholder="入店キャスト名" value="'+ncn+'" oninput="ncn=this.value" style="flex:1;"/><button class="btn gbg" onclick="ac2()" style="padding:8px 16px;border-radius:4px;font-weight:600;font-size:14px;">入店登録</button></div>';
html+='<div style="display:flex;gap:8px;margin-top:10px;"><input class="ip" id="nti" placeholder="体入キャスト名（当日のみ）" value="'+ntn+'" oninput="ntn=this.value" style="flex:1;"/><button class="btn" onclick="actrial()" style="padding:8px 16px;border-radius:4px;font-weight:600;font-size:14px;background:rgba(56,189,248,.1);border:1px solid rgba(56,189,248,.25);color:#38bdf8;">体入登録</button></div>';
html+='</div>';
  }else if(stab==="menus"){
const menuSections=[["normalSets","通常セットメニュー",true],["sets","特別セットメニュー",true],["extensions","延長メニュー",true],["vip","VIP室料",true],["karaoke","カラオケ室料（1名単価）",true],["drinks","ゲストオーダー（ドリンク）",false],["castDrinks","キャストDrink",false],["discounts","割引メニュー",false]];
menuSections.forEach(([k,l,hm])=>{
  const ni=nmi[k]||{label:"",price:"",minutes:"",discType:"fixed"};
  const isDisc=(k==="discounts");
  html+='<div class="glass" style="border-radius:8px;padding:16px;margin-bottom:12px;"><div class="st">'+l+'</div>';
  (S.menus[k]||[]).forEach(item=>{
    html+='<div class="ir" style="flex-wrap:wrap;gap:6px;">';
    html+='<input class="ip" value="'+item.label+'" data-k="'+k+'" data-id="'+item.id+'" onchange="uml(this.dataset.k,this.dataset.id,this.value)" style="flex:2;min-width:80px;font-size:13px;"/>';
    html+='<div style="display:flex;align-items:center;gap:6px;">';
    if(hm&&item.minutes!=null)html+='<input type="number" inputmode="numeric" class="ip" value="'+item.minutes+'" data-k="'+k+'" data-id="'+item.id+'" onchange="umm(this.dataset.k,this.dataset.id,this.value)" style="width:52px;"/>分';
    html+='<input type="number" inputmode="numeric" class="ip" value="'+(item.type==="percent"?item.value:item.price||0)+'" data-k="'+k+'" data-id="'+item.id+'" onchange="ump(this.dataset.k,this.dataset.id,this.value)" style="width:80px;"/>';
    html+='<button class="btn" data-k="'+k+'" data-id="'+item.id+'" onclick="dmi(this.dataset.k,this.dataset.id)" style="padding:4px 8px;background:rgba(255,80,80,.1);border:1px solid rgba(255,80,80,.2);color:#ff6b6b;border-radius:4px;font-size:11px;">削除</button>';
    html+='</div></div>';
  });
  html+='<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.06);"><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">';
  html+='<input class="ip" placeholder="名前" data-k="'+k+'" data-f="label" value="'+ni.label+'" oninput="snmi(this.dataset.k,this.dataset.f,this.value)" style="flex:2;min-width:80px;font-size:13px;"/>';
  if(isDisc)html+='<select class="ip" data-k="'+k+'" data-f="discType" onchange="snmi(this.dataset.k,this.dataset.f,this.value)" style="width:90px;"><option value="fixed">固定額</option><option value="percent">%</option></select>';
  if(hm)html+='<input type="number" inputmode="numeric" class="ip" placeholder="分" data-k="'+k+'" data-f="minutes" value="'+ni.minutes+'" oninput="snmi(this.dataset.k,this.dataset.f,this.value)" style="width:52px;"/>';
  html+='<input type="number" inputmode="numeric" class="ip" placeholder="'+(isDisc?"値":"金額")+'" data-k="'+k+'" data-f="price" value="'+ni.price+'" oninput="snmi(this.dataset.k,this.dataset.f,this.value)" style="width:90px;"/>';
  html+='<button class="btn gbg" data-k="'+k+'" data-hm="'+(hm?1:0)+'" onclick="ami(this.dataset.k,this.dataset.hm==\'1\')" style="padding:8px 12px;border-radius:4px;font-weight:600;font-size:13px;white-space:nowrap;">＋ 追加</button>';
  html+='</div></div></div>';
});
// シングルチャージ単価（概算計算に使用）
{const scItem=(S.menus.options||[]).find(o=>o.id==="sc");
html+='<div class="glass" style="border-radius:8px;padding:16px;margin-bottom:12px;"><div class="st">シングルチャージ単価</div>';
html+='<div style="font-size:11px;color:#666;margin-bottom:10px;">概算シミュレーションで使用されます</div>';
if(scItem){
  html+='<div class="ir" style="gap:6px;">'
    +'<span style="flex:1;font-size:13px;color:#ccc;">'+scItem.label+'</span>'
    +'<input type="number" inputmode="numeric" class="ip" value="'+(scItem.price||2000)+'" data-k="options" data-id="'+scItem.id+'" onchange="ump(this.dataset.k,this.dataset.id,this.value)" style="width:90px;"/>'
    +'</div>';
}else{
  html+='<div style="font-size:12px;color:#555;">¥2,000（デフォルト）</div>';
}
html+='</div>';}
  }else if(stab==="tables"){
html+='<div class="glass" style="border-radius:8px;padding:16px;"><div class="st">テーブル一覧</div>';
const tableLimitReached=S.tables.length>=MAX_TABLE_COUNT;
html+='<div style="font-size:12px;color:#666;margin-bottom:10px;">'+S.tables.length+' / '+MAX_TABLE_COUNT+' 卓</div>';
S.tables.forEach(t=>{
  const iu=!!S.sessions[t.id];
  html+='<div class="ir" style="gap:8px;flex-wrap:wrap;">';
  html+='<input class="ip" value="'+t.label+'" data-tid="'+t.id+'" onchange="utl(this.dataset.tid,this.value)" style="flex:1;min-width:100px;font-size:13px;"/>';
  html+='<button class="btn" data-tid="'+t.id+'" onclick="ttv(this.dataset.tid)" style="padding:5px 12px;border-radius:4px;font-size:12px;font-weight:600;background:'+(t.vip?"rgba(124,77,255,.2)":"rgba(255,255,255,.05)")+';border:1px solid '+(t.vip?"rgba(124,77,255,.5)":"rgba(255,255,255,.1)")+';color:'+(t.vip?"#a78bfa":"#666")+'">'+(t.vip?"★ VIP":"VIP")+'</button>';
  html+='<button class="btn" '+(iu?"disabled":"")+' '+(iu?"":"data-tid=\""+t.id+"\" onclick=\"dta(this.dataset.tid)\"")+' style="padding:4px 10px;border-radius:4px;font-size:12px;background:'+(iu?"rgba(255,255,255,.03)":"rgba(255,80,80,.1)")+';border:1px solid '+(iu?"rgba(255,255,255,.06)":"rgba(255,80,80,.2)")+';color:'+(iu?"#444":"#ff6b6b")+';cursor:'+(iu?"not-allowed":"pointer")+'">'+(iu?"使用中":"削除")+'</button>';
  html+='</div>';
});
html+='<div style="margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.06);">';
html+='<div style="font-size:10px;color:#888;letter-spacing:.1em;margin-bottom:8px;">テーブルを追加</div>';
html+='<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">';
html+='<input class="ip" placeholder="テーブル名" value="'+ntl+'" oninput="ntl=this.value" style="flex:1;min-width:100px;"/>';
html+='<button class="btn" onclick="ntv=!ntv;render()" style="padding:8px 14px;border-radius:4px;font-size:13px;font-weight:600;background:'+(ntv?"rgba(124,77,255,.2)":"rgba(255,255,255,.05)")+';border:1px solid '+(ntv?"rgba(124,77,255,.5)":"rgba(255,255,255,.1)")+';color:'+(ntv?"#a78bfa":"#666")+'">'+(ntv?"★ VIP":"VIP")+'</button>';
html+='<button class="btn gbg" '+(tableLimitReached?'disabled':'onclick="ata()"')+' style="padding:8px 16px;border-radius:4px;font-weight:600;font-size:14px;white-space:nowrap;">'+(tableLimitReached?'上限':'＋ 追加')+'</button>';
html+='</div></div></div>';
  }else if(stab==="special"){
// 特殊メニュー：注文画面の特殊ボタンに表示される「オプション」カテゴリの編集
html+='<div class="glass" style="border-radius:8px;padding:16px;margin-bottom:12px;">';
html+='<div class="st">特殊メニュー一覧</div>';
html+='<div style="font-size:11px;color:#666;margin-bottom:12px;">フロアのGUEST / CASTオーダー欄に追加表示されます</div>';
// ゲストオーダー（GUEST）
html+='<div style="margin-bottom:16px;"><div style="font-size:11px;color:#38bdf8;letter-spacing:.1em;margin-bottom:8px;border-bottom:1px solid rgba(56,189,248,.15);padding-bottom:4px;">ゲストオーダー（GUEST）</div>';
(S.menus.drinks||[]).forEach(item=>{
  html+='<div class="ir" style="gap:8px;">';
  html+='<input class="ip" value="'+item.label+'" data-k="drinks" data-id="'+item.id+'" onchange="uml(this.dataset.k,this.dataset.id,this.value)" style="flex:2;font-size:13px;"/>';
  html+='<input type="number" inputmode="numeric" class="ip" value="'+(item.price||0)+'" data-k="drinks" data-id="'+item.id+'" onchange="ump(this.dataset.k,this.dataset.id,this.value)" style="width:80px;"/>';
  html+='<button class="btn" data-k="drinks" data-id="'+item.id+'" onclick="dmi(this.dataset.k,this.dataset.id)" style="padding:4px 8px;background:rgba(255,80,80,.1);border:1px solid rgba(255,80,80,.2);color:#ff6b6b;border-radius:4px;font-size:11px;">削除</button>';
  html+='</div>';
});
const nid=nmi["drinks"]||{label:"",price:""};
html+='<div style="display:flex;gap:6px;margin-top:8px;align-items:center;">';
html+='<input class="ip" placeholder="名前" data-k="drinks" data-f="label" value="'+nid.label+'" oninput="snmi(this.dataset.k,this.dataset.f,this.value)" style="flex:2;font-size:13px;"/>';
html+='<input type="number" inputmode="numeric" class="ip" placeholder="金額" data-k="drinks" data-f="price" value="'+nid.price+'" oninput="snmi(this.dataset.k,this.dataset.f,this.value)" style="width:80px;"/>';
html+='<button class="btn gbg" data-k="drinks" onclick="ami(this.dataset.k,false)" style="padding:8px 12px;border-radius:4px;font-weight:600;font-size:13px;">＋</button>';
html+='</div></div>';
// キャストDrink（CAST）
html+='<div style="margin-bottom:16px;"><div style="font-size:11px;color:#a78bfa;letter-spacing:.1em;margin-bottom:8px;border-bottom:1px solid rgba(167,139,250,.15);padding-bottom:4px;">キャストDrink（CAST）</div>';
(S.menus.castDrinks||[]).forEach(item=>{
  html+='<div class="ir" style="gap:8px;">';
  html+='<input class="ip" value="'+item.label+'" data-k="castDrinks" data-id="'+item.id+'" onchange="uml(this.dataset.k,this.dataset.id,this.value)" style="flex:2;font-size:13px;"/>';
  html+='<input type="number" inputmode="numeric" class="ip" value="'+(item.price||0)+'" data-k="castDrinks" data-id="'+item.id+'" onchange="ump(this.dataset.k,this.dataset.id,this.value)" style="width:80px;"/>';
  html+='<button class="btn" data-k="castDrinks" data-id="'+item.id+'" onclick="dmi(this.dataset.k,this.dataset.id)" style="padding:4px 8px;background:rgba(255,80,80,.1);border:1px solid rgba(255,80,80,.2);color:#ff6b6b;border-radius:4px;font-size:11px;">削除</button>';
  html+='</div>';
});
const nicd=nmi["castDrinks"]||{label:"",price:""};
html+='<div style="display:flex;gap:6px;margin-top:8px;align-items:center;">';
html+='<input class="ip" placeholder="名前" data-k="castDrinks" data-f="label" value="'+nicd.label+'" oninput="snmi(this.dataset.k,this.dataset.f,this.value)" style="flex:2;font-size:13px;"/>';
html+='<input type="number" inputmode="numeric" class="ip" placeholder="金額" data-k="castDrinks" data-f="price" value="'+nicd.price+'" oninput="snmi(this.dataset.k,this.dataset.f,this.value)" style="width:80px;"/>';
html+='<button class="btn gbg" data-k="castDrinks" onclick="ami(this.dataset.k,false)" style="padding:8px 12px;border-radius:4px;font-weight:600;font-size:13px;">＋</button>';
html+='</div></div>';
// 割引
html+='<div style="margin-bottom:16px;"><div style="font-size:11px;color:#ff6b6b;letter-spacing:.1em;margin-bottom:8px;border-bottom:1px solid rgba(255,80,80,.15);padding-bottom:4px;">割引メニュー</div>';
(S.menus.discounts||[]).forEach(item=>{
  html+='<div class="ir" style="gap:8px;">';
  html+='<input class="ip" value="'+item.label+'" data-k="discounts" data-id="'+item.id+'" onchange="uml(this.dataset.k,this.dataset.id,this.value)" style="flex:2;font-size:13px;"/>';
  html+='<select class="ip" data-k="discounts" data-id="'+item.id+'" onchange="udisctype(this.dataset.k,this.dataset.id,this.value)" style="width:70px;font-size:12px;"><option value="fixed"'+(item.type==="fixed"?" selected":"")+'>固定</option><option value="percent"'+(item.type==="percent"?" selected":"")+'>%</option></select>';
  html+='<input type="number" inputmode="numeric" class="ip" value="'+(item.type==="percent"?item.value:item.price||0)+'" data-k="discounts" data-id="'+item.id+'" onchange="ump(this.dataset.k,this.dataset.id,this.value)" style="width:70px;"/>';
  html+='<button class="btn" data-k="discounts" data-id="'+item.id+'" onclick="dmi(this.dataset.k,this.dataset.id)" style="padding:4px 8px;background:rgba(255,80,80,.1);border:1px solid rgba(255,80,80,.2);color:#ff6b6b;border-radius:4px;font-size:11px;">削除</button>';
  html+='</div>';
});
const nidc=nmi["discounts"]||{label:"",price:"",discType:"fixed"};
html+='<div style="display:flex;gap:6px;margin-top:8px;align-items:center;flex-wrap:wrap;">';
html+='<input class="ip" placeholder="名前" data-k="discounts" data-f="label" value="'+nidc.label+'" oninput="snmi(this.dataset.k,this.dataset.f,this.value)" style="flex:2;min-width:80px;font-size:13px;"/>';
html+='<select class="ip" data-k="discounts" data-f="discType" onchange="snmi(this.dataset.k,this.dataset.f,this.value)" style="width:70px;font-size:12px;"><option value="fixed">固定</option><option value="percent">%</option></select>';
html+='<input type="number" inputmode="numeric" class="ip" placeholder="値" data-k="discounts" data-f="price" value="'+nidc.price+'" oninput="snmi(this.dataset.k,this.dataset.f,this.value)" style="width:70px;"/>';
html+='<button class="btn gbg" data-k="discounts" onclick="ami(this.dataset.k,false)" style="padding:8px 12px;border-radius:4px;font-weight:600;font-size:13px;">＋</button>';
html+='</div></div>';
// シャンパン・ワイン（CASTオーダー）
{const ni=nmi["champagne"]||{label:"",price:""};
html+='<div style="margin-top:14px;"><div style="font-size:11px;color:#ffd700;letter-spacing:.1em;margin-bottom:8px;border-bottom:1px solid rgba(255,215,0,.15);padding-bottom:4px;">シャンパン・ワイン（CAST）</div>';
(S.menus.champagne||[]).forEach(item=>{
  html+='<div class="ir" style="gap:8px;">';
  html+='<input class="ip" value="'+item.label+'" data-k="champagne" data-id="'+item.id+'" onchange="uml(this.dataset.k,this.dataset.id,this.value)" style="flex:2;font-size:13px;"/>';
  html+='<input type="number" inputmode="numeric" class="ip" value="'+(item.price||0)+'" data-k="champagne" data-id="'+item.id+'" onchange="ump(this.dataset.k,this.dataset.id,this.value)" style="width:80px;"/>';
  html+='<button class="btn" data-k="champagne" data-id="'+item.id+'" onclick="dmi(this.dataset.k,this.dataset.id)" style="padding:4px 8px;background:rgba(255,80,80,.1);border:1px solid rgba(255,80,80,.2);color:#ff6b6b;border-radius:4px;font-size:11px;">削除</button>';
  html+='</div>';
});
html+='<div style="display:flex;gap:6px;margin-top:8px;align-items:center;">';
html+='<input class="ip" placeholder="銘柄名" data-k="champagne" data-f="label" value="'+ni.label+'" oninput="snmi(this.dataset.k,this.dataset.f,this.value)" style="flex:2;font-size:13px;"/>';
html+='<input type="number" inputmode="numeric" class="ip" placeholder="金額" data-k="champagne" data-f="price" value="'+ni.price+'" oninput="snmi(this.dataset.k,this.dataset.f,this.value)" style="width:80px;"/>';
html+='<button class="btn gbg" data-k="champagne" onclick="ami(this.dataset.k,false)" style="padding:8px 12px;border-radius:4px;font-weight:600;font-size:13px;">＋</button>';
html+='</div></div>';}
// キープボトル（CASTオーダー）
{const ni=nmi["keepBottles"]||{label:"",price:""};
html+='<div style="margin-top:14px;"><div style="font-size:11px;color:#f59e0b;letter-spacing:.1em;margin-bottom:8px;border-bottom:1px solid rgba(245,158,11,.15);padding-bottom:4px;">キープボトル（CAST）</div>';
(S.menus.keepBottles||[]).forEach(item=>{
  html+='<div class="ir" style="gap:8px;">';
  html+='<input class="ip" value="'+item.label+'" data-k="keepBottles" data-id="'+item.id+'" onchange="uml(this.dataset.k,this.dataset.id,this.value)" style="flex:2;font-size:13px;"/>';
  html+='<input type="number" inputmode="numeric" class="ip" value="'+(item.price||0)+'" data-k="keepBottles" data-id="'+item.id+'" onchange="ump(this.dataset.k,this.dataset.id,this.value)" style="width:80px;"/>';
  html+='<button class="btn" data-k="keepBottles" data-id="'+item.id+'" onclick="dmi(this.dataset.k,this.dataset.id)" style="padding:4px 8px;background:rgba(255,80,80,.1);border:1px solid rgba(255,80,80,.2);color:#ff6b6b;border-radius:4px;font-size:11px;">削除</button>';
  html+='</div>';
});
html+='<div style="display:flex;gap:6px;margin-top:8px;align-items:center;">';
html+='<input class="ip" placeholder="銘柄名" data-k="keepBottles" data-f="label" value="'+ni.label+'" oninput="snmi(this.dataset.k,this.dataset.f,this.value)" style="flex:2;font-size:13px;"/>';
html+='<input type="number" inputmode="numeric" class="ip" placeholder="金額" data-k="keepBottles" data-f="price" value="'+ni.price+'" oninput="snmi(this.dataset.k,this.dataset.f,this.value)" style="width:80px;"/>';
html+='<button class="btn gbg" data-k="keepBottles" onclick="ami(this.dataset.k,false)" style="padding:8px 12px;border-radius:4px;font-weight:600;font-size:13px;">＋</button>';
html+='</div></div>';}
// キャストプリセット品名（CASTオーダー追加ボタン）
{const ni=nmi["castCustomItems"]||{label:"",price:""};
html+='<div style="margin-top:14px;"><div style="font-size:11px;color:#c4b5fd;letter-spacing:.1em;margin-bottom:4px;border-bottom:1px solid rgba(196,181,253,.15);padding-bottom:4px;">プリセット品名（CAST）</div>';
html+='<div style="font-size:11px;color:#666;margin-bottom:8px;">キャストオーダー詳細に追加ボタンとして表示されます</div>';
(S.menus.castCustomItems||[]).forEach(item=>{
  html+='<div class="ir" style="gap:8px;">';
  html+='<input class="ip" value="'+item.label+'" data-k="castCustomItems" data-id="'+item.id+'" onchange="uml(this.dataset.k,this.dataset.id,this.value)" style="flex:2;font-size:13px;"/>';
  html+='<input type="number" inputmode="numeric" class="ip" value="'+(item.price||0)+'" data-k="castCustomItems" data-id="'+item.id+'" onchange="ump(this.dataset.k,this.dataset.id,this.value)" style="width:80px;"/>';
  html+='<button class="btn" data-k="castCustomItems" data-id="'+item.id+'" onclick="dmi(this.dataset.k,this.dataset.id)" style="padding:4px 8px;background:rgba(255,80,80,.1);border:1px solid rgba(255,80,80,.2);color:#ff6b6b;border-radius:4px;font-size:11px;">削除</button>';
  html+='</div>';
});
html+='<div style="display:flex;gap:6px;margin-top:8px;align-items:center;">';
html+='<input class="ip" placeholder="品名" data-k="castCustomItems" data-f="label" value="'+ni.label+'" oninput="snmi(this.dataset.k,this.dataset.f,this.value)" style="flex:2;font-size:13px;"/>';
html+='<input type="number" inputmode="numeric" class="ip" placeholder="金額" data-k="castCustomItems" data-f="price" value="'+ni.price+'" oninput="snmi(this.dataset.k,this.dataset.f,this.value)" style="width:80px;"/>';
html+='<button class="btn gbg" data-k="castCustomItems" onclick="ami(this.dataset.k,false)" style="padding:8px 12px;border-radius:4px;font-weight:600;font-size:13px;">＋</button>';
html+='</div></div>';}
html+='</div>';
  }
  html+='</div>';
  return html;
}

// ===== 管理タブ =====
function rAdmin(){
  const isAdmin=sessionStorage.getItem("genesis_admin")==="1";
  if(!isAdmin)return '<div style="padding:20px;color:#666;">管理モードが必要です</div>';
  const bkDays=Object.values((S.backups||{}).bizDays||{}).sort((a,b)=>b.date.localeCompare(a.date));
  let html='<div style="max-width:680px;margin:0 auto;">';
  html+='<h2 style="font-family:\'Cormorant Garamond\',serif;font-size:22px;color:#d4a017;margin-bottom:16px;">管理</h2>';
  // プリンター設定
  html+='<div class="glass" style="border-radius:8px;padding:16px;margin-bottom:16px;border:1px solid rgba(74,222,128,.2);">';
  html+='<div class="st" style="color:#4ade80;margin-bottom:12px;">プリンター設定（Epson TM-T88VII）</div>';
  html+='<div style="font-size:11px;color:#666;margin-bottom:12px;">Epson ePOS SDK経由でWi-Fi印刷。プリンターと同じWi-Fiに接続してください。</div>';
  html+='<div style="display:flex;gap:8px;margin-bottom:10px;">';
  html+='<div style="flex:2;">';
  html+='<div style="font-size:11px;color:#888;margin-bottom:4px;">プリンターIPアドレス</div>';
  html+='<input type="text" id="printer-ip" class="ip" value="'+(S.config.printerIP||"192.168.150.76")+'" placeholder="例: 192.168.150.76" style="font-size:15px;letter-spacing:.05em;"/>';
  html+='</div>';
  html+='<div style="flex:1;">';
  html+='<div style="font-size:11px;color:#888;margin-bottom:4px;">ポート</div>';
  html+='<input type="number" id="printer-port" class="ip" value="'+(S.config.printerPort||8008)+'" style="font-size:15px;"/>';
  html+='</div>';
  html+='</div>';
  html+='<div style="display:flex;gap:8px;">';
  html+='<button class="btn gbg" onclick="savePrinterConfig()" style="flex:1;padding:10px;font-size:13px;font-weight:700;border-radius:6px;touch-action:manipulation;">保存</button>';
  html+='<button class="btn" onclick="testPrint()" style="flex:1;padding:10px;font-size:13px;font-weight:600;border-radius:6px;background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.25);color:#4ade80;touch-action:manipulation;">テスト印刷</button>';
  html+='</div>';
  html+='</div>';
  html+='<div class="glass" style="border-radius:8px;padding:16px;margin-bottom:16px;border:1px solid rgba(56,189,248,.2);">';
  html+='<div class="st" style="color:#38bdf8;margin-bottom:4px;">Backup</div>';
  html+='<div style="font-size:11px;color:#666;margin-bottom:10px;">営業終了ごとに当営業日データを個別保存（蓄積）。削除操作の影響を受けません。</div>';
  const bkEntries2=Object.entries((S.backups||{}).bizDays||{}).sort((a,b)=>(b[1].ts||0)-(a[1].ts||0));
  const bkDays2=bkEntries2.map(([,v])=>v);
  if(bkDays2.length){
html+='<div style="font-size:12px;color:#e8dcc8;margin-bottom:8px;">保存済み: '+bkDays2.length+'件</div>';
html+='<div style="margin-bottom:10px;max-height:140px;overflow-y:auto;">';
bkDays2.slice(0,6).forEach(d=>{
  const dt=new Date(d.ts).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
  html+='<div style="font-size:11px;color:#666;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.04);">'+d.date+'&nbsp;–&nbsp;会計'+(d.history||[]).length+'件&nbsp;（'+dt+'）'+(d.edited?'&nbsp;<span style="color:#38bdf8;font-size:9px;">編集済</span>':"")+'</div>';
});
if(bkDays2.length>6)html+='<div style="font-size:10px;color:#444;padding-top:4px;">… 他'+(bkDays2.length-6)+'件</div>';
html+='</div>';
  }else{
html+='<div style="font-size:12px;color:#444;margin-bottom:10px;">バックアップなし（営業終了時に自動保存）</div>';
  }
  html+='<button class="btn" onclick="sv(\'backupDetail\')" style="padding:8px 14px;background:rgba(56,189,248,.1);border:1px solid rgba(56,189,248,.25);color:#38bdf8;border-radius:4px;font-size:13px;font-weight:600;touch-action:manipulation;">詳細・復旧</button>';
  html+='</div>';
  // 緊急リセット
  html+='<div class="glass" style="border-radius:8px;padding:16px;margin-bottom:12px;border:1px solid rgba(255,80,80,.2);">';
  html+='<div class="st" style="color:#ff6b6b;margin-bottom:8px;">緊急リセット</div>';
  html+='<div style="font-size:12px;color:#666;margin-bottom:12px;">フロアが開かない等の不具合時に使用。進行中のセッションが全て消えます。</div>';
  html+='<button class="btn" onclick="clearAllSessions()" style="padding:8px 16px;background:rgba(255,80,80,.15);border:1px solid rgba(255,80,80,.3);color:#ff6b6b;border-radius:4px;font-size:13px;font-weight:600;">セッションデータをクリア</button>';
  html+='</div>';
  html+='<div class="glass" style="border-radius:8px;padding:16px;border:1px solid rgba(255,165,0,.2);">';
  html+='<div class="st" style="color:#ffa500;margin-bottom:8px;">リストタブ緊急リセット</div>';
  html+='<div style="font-size:12px;color:#666;margin-bottom:12px;">付け回しが正常に動かない等の不具合時に使用。</div>';
  html+='<button class="btn" onclick="clearAllAssignments()" style="padding:8px 16px;background:rgba(255,165,0,.12);border:1px solid rgba(255,165,0,.3);color:#ffa500;border-radius:4px;font-size:13px;font-weight:600;">付け回しデータをクリア</button>';
  html+='</div>';
  html+='</div>';
  return html;
}
// Firebaseバックアップから復旧（POSデータに上書き）
// ↑古いlatest方式は廃止。restoreFromBackupDay()を使用。

function exportBackupJSON(){
  const data={
exportedAt:Date.now(),
exportedAtStr:new Date().toLocaleString("ja-JP"),
backupBizDays:(S.backups||{}).bizDays||{},
posBizDays:S.bizDays||{},
casts:S.casts||[],
castLifecycleLogs:S.castLifecycleLogs||{},
  };
  const json=JSON.stringify(data,null,2);
  const blob=new Blob([json],{type:"application/json;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download="genesis_backup_"+new Date().toLocaleDateString("sv-SE")+".json";
  a.click();
  URL.revokeObjectURL(url);
}

function rBackupDetail(){
  const bkEntries=Object.entries((S.backups||{}).bizDays||{}).sort((a,b)=>(b[1].ts||0)-(a[1].ts||0));
  const bkDays=bkEntries.map(([,v])=>v);
  let html='<div style="max-width:680px;margin:0 auto;">';
  html+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">';
  html+='<button class="btn" onclick="sv(\'admin\')" style="padding:6px 12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:4px;font-size:13px;touch-action:manipulation;">← 管理</button>';
  html+='<h2 style="font-family:\'Cormorant Garamond\',serif;font-size:22px;color:#38bdf8;">バックアップ詳細</h2>';
  html+='</div>';
  if(!bkDays.length){
html+='<div style="color:#555;font-size:14px;padding:20px 0;">バックアップデータがありません</div></div>';
return html;
  }
  html+='<div style="font-size:12px;color:#666;margin-bottom:12px;">各営業日データは独立して保存されています。削除してもPOSデータには影響しません。</div>';
  html+='<div style="display:flex;gap:8px;margin-bottom:14px;">';
  html+='<button class="btn gbg" onclick="restoreAllBackup()" style="flex:1;padding:10px;font-size:14px;font-weight:700;border-radius:6px;touch-action:manipulation;">全件まとめて復旧</button>';
  html+='</div>';
  // まとめて復旧ボタン
  html+='<button class="btn" onclick="restoreAllBackups()" style="width:100%;padding:12px;background:rgba(56,189,248,.12);border:1px solid rgba(56,189,248,.3);color:#38bdf8;border-radius:6px;font-size:14px;font-weight:700;touch-action:manipulation;margin-bottom:12px;">⟳ 全件まとめてPOSに復旧（'+bkDays.length+'営業日）</button>';
  // 同一営業日でグループ化
  const _bkByDate={};
  bkEntries.forEach(([bkKey,day])=>{
if(!_bkByDate[day.date])_bkByDate[day.date]=[];
_bkByDate[day.date].push([bkKey,day]);
  });
  const _bkDates=Object.keys(_bkByDate).sort((a,b)=>b.localeCompare(a));
  const _conflictDates=_bkDates.filter(d=>_bkByDate[d].length>1);
  if(_conflictDates.length>0){
html+='<div style="padding:8px 12px;background:rgba(250,200,0,.06);border:1px solid rgba(250,200,0,.2);border-radius:6px;margin-bottom:12px;font-size:12px;color:#f0c040;">'
  +'⚠ 同一営業日のバックアップが複数あります（'+_conflictDates.join("、")+'）。<br>各日付で使用するデータを選択して復旧してください。'
  +'</div>';
  }
  html+='<div class="glass" style="border-radius:8px;overflow:hidden;margin-bottom:14px;">';
  html+='<div style="padding:10px 14px;background:rgba(255,255,255,.03);border-bottom:1px solid rgba(255,255,255,.07);">';
  html+='<span style="font-size:13px;font-weight:700;color:#e8dcc8;">保存済み営業日（'+_bkDates.length+'日付 / '+bkDays.length+'件）</span>';
  html+='</div>';
  html+='<div style="padding:8px 12px;">';
  _bkDates.forEach(date=>{
const entries=_bkByDate[date];
const hasConflict=entries.length>1;
if(hasConflict){
  html+='<div style="margin-bottom:10px;padding:10px;background:rgba(56,189,248,.04);border:1px solid rgba(56,189,248,.18);border-radius:6px;">';
  html+='<div style="font-size:12px;font-weight:700;color:#38bdf8;margin-bottom:8px;">'+date+' &nbsp;<span style="font-weight:400;font-size:11px;opacity:.8;">— 複数バックアップあり（個別に復旧可）</span></div>';
  entries.forEach(([bkKey,day])=>{
    const sales=(day.history||[]).reduce((a,h)=>a+(h.total||0),0);
    const histCount=(day.history||[]).length;
    const saved=new Date(day.ts).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
    const isEdited=!!day.edited;
    html+='<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;margin-bottom:5px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:5px;">';
    html+='<div>';
    html+='<div style="font-size:13px;font-weight:700;color:#e8dcc8;">'+(isEdited?'<span style="font-size:10px;font-weight:700;color:#38bdf8;background:rgba(56,189,248,.12);padding:1px 7px;border:1px solid rgba(56,189,248,.25);border-radius:3px;margin-right:6px;">編集済</span>':'<span style="font-size:10px;color:#888;background:rgba(255,255,255,.06);padding:1px 7px;border:1px solid rgba(255,255,255,.1);border-radius:3px;margin-right:6px;">元データ</span>')+'会計 '+histCount+'件 | 売上 ¥'+Number(sales).toLocaleString("ja-JP")+'</div>';
    html+='<div style="font-size:10px;color:#444;margin-top:2px;">保存: '+saved+'</div>';
    html+='</div>';
    html+='<div style="display:flex;gap:5px;flex-shrink:0;">';
    html+='<button class="btn" data-bkkey="'+bkKey+'" onclick="restoreFromBackupDay(this.dataset.bkkey)" style="padding:5px 10px;background:rgba(56,189,248,.15);border:1px solid rgba(56,189,248,.35);color:#38bdf8;border-radius:4px;font-size:11px;font-weight:700;touch-action:manipulation;">このデータで復旧</button>';
    html+='<button class="btn" data-bkkey="'+bkKey+'" onclick="deleteBackupBizDay(this.dataset.bkkey)" style="padding:5px 8px;background:rgba(255,80,80,.08);border:1px solid rgba(255,80,80,.2);color:#ff6b6b;border-radius:4px;font-size:11px;touch-action:manipulation;">削除</button>';
    html+='</div>';
    html+='</div>';
  });
  html+='</div>';
} else {
  const [bkKey,day]=entries[0];
  const sales=(day.history||[]).reduce((a,h)=>a+(h.total||0),0);
  const histCount=(day.history||[]).length;
  const saved=new Date(day.ts).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
  const isEdited=!!day.edited;
  html+='<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);">';
  html+='<div>';
  html+='<div style="font-size:14px;font-weight:700;color:#e8dcc8;">'+day.date+(isEdited?'&nbsp;<span style="font-size:10px;font-weight:700;color:#38bdf8;background:rgba(56,189,248,.12);padding:1px 7px;border:1px solid rgba(56,189,248,.25);border-radius:3px;">編集済データ</span>':"")+'</div>';
  html+='<div style="font-size:11px;color:#666;margin-top:1px;">会計 '+histCount+'件 &nbsp;|&nbsp; 売上 ¥'+Number(sales).toLocaleString("ja-JP")+'</div>';
  html+='<div style="font-size:10px;color:#444;margin-top:1px;">保存: '+saved+'</div>';
  html+='</div>';
  html+='<div style="display:flex;gap:6px;flex-shrink:0;">';
  html+='<button class="btn" data-bkkey="'+bkKey+'" onclick="restoreFromBackupDay(this.dataset.bkkey)" style="padding:5px 10px;background:rgba(56,189,248,.12);border:1px solid rgba(56,189,248,.3);color:#38bdf8;border-radius:4px;font-size:11px;font-weight:700;touch-action:manipulation;">復旧</button>';
  html+='<button class="btn" data-bkkey="'+bkKey+'" onclick="deleteBackupBizDay(this.dataset.bkkey)" style="padding:5px 10px;background:rgba(255,80,80,.08);border:1px solid rgba(255,80,80,.2);color:#ff6b6b;border-radius:4px;font-size:11px;touch-action:manipulation;">削除</button>';
  html+='</div>';
  html+='</div>';
}
  });
  html+='</div></div>';
  html+='</div>';
  return html;
}

// バックアップ内の特定営業日を削除
async function deleteBackupBizDay(date){
  if(!requireFirebaseReady())return;
  if(!(S.backups?.bizDays?.[date])){alert("データが見つかりません");return;}
  if(!confirm("バックアップから「"+date+"」を削除します。\nこの操作は取り消せません。よろしいですか？"))return;
  if(window._db){
try{
  await window._db.ref(BACKUP_ROOT+"/bizDays/"+date).remove();
  sbs(true,"削除完了 ✓");render();
}catch(e){sbs(false,"削除エラー");alert("削除に失敗："+e.message);}
  }
}

// バックアップを全件一括復旧（bizDaysにマージ）
async function restoreAllBackup(){
  await restoreAllBackups();
}

// バックアップの特定営業日データをPOSに復旧（bizDaysにマージ）
function restoreFromBackupDay(bkKey){
  const bk=(S.backups?.bizDays||{})[bkKey];if(!bk)return;
  const date=bk.date;
  const label=bk.edited?(date+" (編集済データ)"):date;
  if(!confirm("「"+label+"」のバックアップデータをPOS（bizDays）に復旧します。\n会計: "+(bk.history||[]).length+"件\n\n既存の「"+date+"」データに上書きされます。よろしいですか？"))return;
  if(!S.bizDays[date])S.bizDays[date]={id:date,date,startedAt:bk.startedAt,endedAt:bk.endedAt,history:[],shifts:{},assignments:{}};
  S.bizDays[date].history=bk.history||[];
  S.bizDays[date].shifts=bk.shifts||{};
  S.bizDays[date].assignments=bk.assignments||{};
  if(bk.rosterSnapshot)S.bizDays[date].rosterSnapshot=bk.rosterSnapshot;
  if(bk.castLifecycleLogs)S.castLifecycleLogs={...(S.castLifecycleLogs||{}),[date]:bk.castLifecycleLogs};
  if(window._db){
const updates={[FB_ROOT+"/bizDays/"+date]:S.bizDays[date]};
if(bk.castLifecycleLogs)updates[FB_ROOT+"/castLifecycleLogs/"+date]=bk.castLifecycleLogs;
guardedRootUpdateIfActive(null,Object.fromEntries(Object.entries(updates).map(([k,v])=>[stripRootPath(k),v])),"営業中または他端末で営業状態が変更されています。復旧前に最新状態を確認してください。")
  .then(()=>{sbs(true,"復旧完了 ✓");alert("「"+label+"」の復旧が完了しました。");render();})
  .catch(()=>sbs(false,"復旧エラー"));
  }
}

// バックアップ全件をまとめてPOSに復旧（コンフリクト検出付き）
async function restoreAllBackups(){
  const bkEntries=Object.entries((S.backups||{}).bizDays||{});
  if(!bkEntries.length){alert("バックアップデータがありません");return;}
  // 日付ごとにグループ化
  const byDate={};
  bkEntries.forEach(([bkKey,bk])=>{
if(!byDate[bk.date])byDate[bk.date]=[];
byDate[bk.date].push([bkKey,bk]);
  });
  const conflicts=Object.entries(byDate).filter(([,e])=>e.length>1);
  if(conflicts.length>0){
// コンフリクトあり → 選択モーダルへ
_rcChoices={};
conflicts.forEach(([date,entries])=>{
  // デフォルト: 編集済があればそちら、なければ最初のエントリ
  const edited=entries.find(([k])=>k.endsWith("_edited"));
  _rcChoices[date]=edited?edited[0]:entries[0][0];
});
window._pendingRestoreByDate=byDate;
om("restore-conflicts");
return;
  }
  // コンフリクトなし → そのまま実行
  await _execRestoreAll(byDate,{});
}

// 全件復旧の実行（コンフリクト選択後に呼ばれる）
async function execRestoreAllWithChoices(){
  const byDate=window._pendingRestoreByDate;
  if(!byDate){closeM();return;}
  if(!confirm("選択したデータで全件復旧します。既存の各日データは上書きされます。\nよろしいですか？"))return;
  await _execRestoreAll(byDate,_rcChoices);
}

// 全件復旧共通処理
async function _execRestoreAll(byDate,choices){
  const updates={};
  const dates=Object.keys(byDate);
  for(const date of dates){
const entries=byDate[date];
let bk;
if(entries.length===1){
  bk=entries[0][1];
}else{
  const chosenKey=choices[date];
  const found=chosenKey?entries.find(([k])=>k===chosenKey):null;
  bk=found?found[1]:entries[0][1];
}
if(!S.bizDays[date])S.bizDays[date]={id:date,date,startedAt:bk.startedAt,endedAt:bk.endedAt,history:[],shifts:{},assignments:{}};
S.bizDays[date].history=bk.history||[];
S.bizDays[date].shifts=bk.shifts||{};
S.bizDays[date].assignments=bk.assignments||{};
if(bk.rosterSnapshot)S.bizDays[date].rosterSnapshot=bk.rosterSnapshot;
if(bk.castLifecycleLogs){S.castLifecycleLogs={...(S.castLifecycleLogs||{}),[date]:bk.castLifecycleLogs};updates[FB_ROOT+"/castLifecycleLogs/"+date]=bk.castLifecycleLogs;}
updates[FB_ROOT+"/bizDays/"+date]=S.bizDays[date];
  }
  if(window._db){
try{
  await guardedRootUpdateIfActive(null,Object.fromEntries(Object.entries(updates).map(([k,v])=>[stripRootPath(k),v])),"営業中または他端末で営業状態が変更されています。復旧前に最新状態を確認してください。");
  sbs(true,"全件復旧完了 ✓");
  alert("全"+dates.length+"営業日の復旧が完了しました。");
  closeM();render();
}catch(e){sbs(false,"復旧エラー");alert("復旧に失敗しました："+e.message);}
  }
}

// 手動バックアップ（現在の営業日データを即時保存）
async function manualFirebaseBackup(){
  if(!requireFirebaseReady())return;
  if(!S.activeBizDay){alert("営業中のみ手動バックアップできます");return;}
  const date=S.activeBizDay;
  const snap={
ts:Date.now(),
date,
history:JSON.parse(JSON.stringify(S.history||[])),
shifts:JSON.parse(JSON.stringify(S.shifts||{})),
assignments:JSON.parse(JSON.stringify(S.assignments||{})),
castLifecycleLogs:JSON.parse(JSON.stringify((S.castLifecycleLogs||{})[date]||emptyLifecycle())),
rosterSnapshot:JSON.parse(JSON.stringify(S.bizDays[date]?.rosterSnapshot||null)),
startedAt:S.bizDays[date]?.startedAt||Date.now(),
endedAt:null
  };
  try{
await window._db.ref(BACKUP_ROOT+"/bizDays/"+date).set(snap);
sbs(true,"バックアップ完了 ✓");
alert("「"+date+"」のバックアップを更新しました");
render();
  }catch(e){
sbs(false,"保存エラー");
alert("保存に失敗："+e.message);
  }
}
function clearAllSessions(){
  if(!confirm("進行中のセッションを全て削除します。よろしいですか？"))return;
  S.sessions={};
  if(window._db){
guardedSet("sessions",null)
  .then(()=>sbs(true,"セッションクリア済み ✓"))
  .catch(()=>sbs(false,"クリアエラー"));
  }
  at=null;vw="floor";render();
}
function clearAllAssignments(){
  if(!confirm("全ての付け回しデータをクリアし、全キャストを待機状態に戻します。\n出勤データは変更されません。\n\nよろしいですか？"))return;
  // assignments全クリア
  S.assignments={};
  // 全キャストのstatusをwaitingに戻す（shiftsは保持・statusLogは保持）
  const now_r=Date.now();
  Object.values(S.shifts||{}).forEach(sh=>{
if(!sh.clockOut){ // 出勤中のみ
  sh.status="waiting";
  // 現在進行中のstatusLogエントリを閉じて新しいwaitingを追加
  if(!sh.statusLog)sh.statusLog=[];
  const last=sh.statusLog[sh.statusLog.length-1];
  if(last&&!last.endTime)last.endTime=now_r;
  sh.statusLog.push({status:"waiting",startTime:now_r,endTime:null});
}
  });
  if(window._db){
guardedRootUpdate({
  assignments:null,
  shifts:Object.keys(S.shifts||{}).length>0?S.shifts:null
}).then(()=>sbs(true,"リセット済み ✓")).catch(()=>sbs(false,"リセットエラー"));
  }
  vw="list";render();
}
function sst(t){stab=t;render();}
function udisctype(k,id,v){S.menus[k]=S.menus[k].map(x=>x.id===id?{...x,type:v}:x);save("menus",S.menus);}
function ucn(id,name){
  const n=String(name||"").trim();
  if(!n)return render();
  S.casts=normalizeCasts(S.casts).map(c=>c.id===id?{...c,name:n}:c);
  save("casts",S.casts);render();
}
function hasVisibleCastName(name){
  const n=String(name||"").trim();
  return !!n&&allCasts().some(c=>isVisibleCast(c)&&String(c.name||"").trim()===n);
}
function ac2(){
  const name=String(ncn||"").trim();if(!name)return;
  if(hasVisibleCastName(name)){alert("在籍中または当日体入に同じ名前のキャストがいます。");return;}
  const ts=Date.now(),biz=S.activeBizDay||getBizDate();
  const cast={id:ts,name,castType:"regular",internalNo:nextCastInternalNo(),active:true,registeredAt:ts,enteredAt:ts,enteredBizDay:biz};
  S.casts=[...normalizeCasts(S.casts),cast];
  upsertLifecycle(biz,"enteredCasts",castSnapshot(cast,{enteredAt:ts}),"castId");
  saveCastsAndLifecycle().then(()=>sbs(true,"同期済み ✓")).catch(()=>sbs(false,"保存エラー"));
  ncn="";render();
}
function actrial(){
  const name=String(ntn||"").trim();if(!name)return;
  if(hasVisibleCastName(name)){alert("在籍中または当日体入に同じ名前のキャストがいます。");return;}
  const ts=Date.now(),biz=S.activeBizDay||getBizDate();
  const cast={id:ts,name,castType:"trial",internalNo:nextTrialCastInternalNo(biz),active:true,registeredAt:ts,trialRegisteredAt:ts,trialBizDay:biz};
  S.casts=[...normalizeCasts(S.casts),cast];
  upsertLifecycle(biz,"trialCasts",castSnapshot(cast,{trialBizDay:biz,trialRegisteredAt:ts,trialEndedAt:null}),"castId");
  saveCastsAndLifecycle().then(()=>sbs(true,"同期済み ✓")).catch(()=>sbs(false,"保存エラー"));
  ntn="";render();
}
function dc2(id){
  const cast=S.casts.find(c=>c.id===id);if(!cast)return;
  const shift=getShiftByCastId(id);
  const activeAssignments=Object.values(S.assignments||{}).filter(a=>String(a.castId)===String(id)&&!a.endTime);
  if(shift||activeAssignments.length){
    const details=[];
    if(shift)details.push("出勤中: "+new Date(shift.clockIn).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}));
    activeAssignments.forEach(a=>details.push("付け回し中: "+(S.tables.find(t=>t.id===a.tableId)?.label||a.tableId||"テーブル不明")));
    alert(cast.name+" は退店できません。\n退店前に退勤と付け回し終了を完了してください。\n\n"+details.join("\n"));
    return;
  }
  if(!confirm(cast.name+" を退店しますか？\nPOS名簿からは削除され、退店履歴は営業履歴/GMS側で管理します。"))return;
  const ts=Date.now(),biz=S.activeBizDay||getBizDate();
  upsertLifecycle(biz,"exitedCasts",castSnapshot(cast,{exitedAt:ts}),"castId");
  S.casts=normalizeCasts(S.casts).filter(c=>String(c.id)!==String(id));
  saveCastsAndLifecycle().then(()=>sbs(true,"同期済み ✓")).catch(()=>sbs(false,"保存エラー"));
  render();
}
function savePrinterConfig(){
  const ip=(document.getElementById("printer-ip")?.value||"").trim();
  const port=parseInt(document.getElementById("printer-port")?.value)||8008;
  if(!ip){alert("IPアドレスを入力してください");return;}
  S.config.printerIP=ip;
  S.config.printerPort=port;
  // localStorageにも保存（SDK読み込み用・次回起動時に使用）
  localStorage.setItem("genesis_printer_ip",ip);
  const newConfig={...S.config,printerIP:ip,printerPort:port};
  if(window._db){
guardedSet("config",newConfig)
  .then(()=>{sbs(true,"プリンター設定保存 ✓");alert("プリンター設定を保存しました\nIP: "+ip+"\nポート: "+port+"\n\nページを再読み込みするとSDKが再ロードされます。");})
  .catch(()=>sbs(false,"保存エラー"));
  }
  render();
}

function testPrint(){
  const ip=(document.getElementById("printer-ip")?.value||S.config.printerIP||"").trim();
  const port=parseInt(document.getElementById("printer-port")?.value||S.config.printerPort)||8008;
  if(!ip){alert("IPアドレスを入力してください");return;}

  // XML方式でテスト印刷（SDK不要）
  testPrintXML(ip,port);
}

function eposServiceUrls(ip,port){
  const p=parseInt(port,10)||8008;
  const path="/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000";
  const urls=[];
  const add=(proto,pt)=>{
    const u=proto+"://"+ip+(pt?":"+pt:"")+path;
    if(!urls.includes(u))urls.push(u);
  };
  add("https",p);
  add("https",443);
  add("https",8043);
  if(location.protocol!=="https:"){
    add("http",p);
    add("http",80);
    add("http",8008);
  }
  return urls;
}
async function postEposSoap(url,soap){
  const res=await fetch(url,{method:"POST",headers:{"Content-Type":"text/xml; charset=utf-8","SOAPAction":""},body:soap});
  if(!res.ok)throw new Error("HTTP "+res.status);
  const body=await res.text();
  const failed=body.match(/<response\b[^>]*\bsuccess=["']false["'][^>]*>/i);
  if(failed){
    const code=failed[0].match(/\bcode=["']([^"']*)["']/i);
    throw new Error("Epson印刷エラー"+(code?.[1]?": "+code[1]:""));
  }
  return body;
}

async function testPrintXML(ip,port){
  const now2=new Date();
  const xml='<text lang="ja" smooth="true"/>'
+'<text dh="true" dw="true" align="center"/>'+`<text>CLUB GENESIS\n</text>`
+'<text dh="false" dw="false"/>'+`<text align="center">テスト印刷\n</text>`
+`<feed line="1"/>`
+`<text align="left">IP: ${ip}\n</text>`
+`<text>日時: ${now2.toLocaleString("ja-JP")}\n</text>`
+`<text>接続: 正常\n</text>`
+`<feed line="3"/>`
+`<cut type="feed"/>`;
  const soap='<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">'+xml+'</epos-print></s:Body></s:Envelope>';
  let lastError=null;
  try{
for(const url of eposServiceUrls(ip,port)){
  try{await postEposSoap(url,soap);lastError=null;break;}
  catch(err){lastError=err;}
}
if(lastError)throw lastError;
sbs(true,"テスト印刷成功 ✓");
alert("テスト印刷成功！プリンターから出力されました。");
  }catch(e){
alert("接続失敗: "+e.message+"\n\nIP: "+ip+"\nポート: "+port+"\n\n確認事項:\n・プリンターの電源ON\n・同じWi-Fiに接続\n・Safariで https://"+ip+":"+port+" を一度開いて信頼済みにする");
  }
}

function uml(k,id,v){if(v.trim()){S.menus[k]=S.menus[k].map(x=>x.id===id?{...x,label:v.trim()}:x);save("menus",S.menus);}}
function ump(k,id,v){const p=parseInt(v,10);if(p>0){S.menus[k]=S.menus[k].map(x=>x.id===id?x.type==="percent"?{...x,value:p}:{...x,price:p}:x);S.menus=applyFixedShimeiPrices(S.menus);save("menus",S.menus);}}
function umm(k,id,v){const m=parseInt(v,10);if(m>0){S.menus[k]=S.menus[k].map(x=>x.id===id?{...x,minutes:m}:x);save("menus",S.menus);}}
function dmi(k,id){S.menus[k]=S.menus[k].filter(x=>x.id!==id);save("menus",S.menus);render();}
function snmi(k,f,v){if(!nmi[k])nmi[k]={label:"",price:"",minutes:"",discType:"fixed"};nmi[k][f]=v;}
function ami(k,hm){
  const ni=nmi[k]||{};
  if(!ni.label||ni.label.trim()==="")return;
  if(ni.price===""||ni.price===undefined)return;
  const p=parseInt(ni.price,10);if(isNaN(p)||p<0)return;
  const minutes=parseInt(ni.minutes,10);
  if((k==="vip"||k==="karaoke")&&(!minutes||minutes<=0)){alert("室料の分数を入力してください。");return;}
  const isDisc=(k==="discounts");
  let item;
  if(isDisc){const tp=ni.discType||"fixed";item={id:k+"_"+Date.now(),label:ni.label.trim(),type:tp,value:p};if(tp==="fixed")item.price=p;}
  else{item={id:k+"_"+Date.now(),label:ni.label.trim(),price:p};if(hm&&minutes>0)item.minutes=minutes;}
  if(!S.menus[k])S.menus[k]=[];
  S.menus[k]=[...S.menus[k],item];
  save("menus",S.menus);nmi[k]={label:"",price:"",minutes:"",discType:"fixed"};render();
}
function utl(id,v){if(v.trim()){S.tables=S.tables.map(t=>t.id===id?{...t,label:v.trim()}:t);save("tables",S.tables);}}
function ttv(id){S.tables=S.tables.map(t=>t.id===id?{...t,vip:!t.vip}:t);save("tables",S.tables);render();}
function dta(id){if(S.sessions[id])return;S.tables=S.tables.filter(t=>t.id!==id);save("tables",S.tables);render();}
function ata(){if(!ntl.trim())return;if(S.tables.length>=MAX_TABLE_COUNT){alert("テーブル数は最大 "+MAX_TABLE_COUNT+" 卓です");return;}S.tables=[...S.tables,{id:"t_"+Date.now(),label:ntl.trim(),vip:ntv}];save("tables",S.tables);ntl="";ntv=false;render();}

// ===== MODAL =====
function om(name){md=name;rModal();}
function closeM(){md=null;document.getElementById("md").innerHTML="";}

// ===== RECEIPT PRINT =====
function buildReceiptHTML(sessionOrEst, isEstimate){
  // sessionOrEst: {tableLabel, startTime, endTime?, guests, items, subtotal, discount, tax, total, rate, extraItems?}
  const now2=new Date();
  const tl=sessionOrEst.tableLabel||"";
  const st=new Date(sessionOrEst.startTime);
  const et=sessionOrEst.endTime?new Date(sessionOrEst.endTime):now2;
  const dur=Math.round((et-st)/60000);
  const{subtotal,discount,tax,total,rate}=sessionOrEst;

  const isGuest=!!sessionOrEst.isGuest;
  const noteText=sessionOrEst.note||"";
  // ゲスト用: 割引ラベルを一律「割引」に、店舗用: 割引アイテムをオーダー行に表示しない
  const rowHtml=(i)=>{
const lb=isGuest?'割引':(i.qty>1?i.label+" ×"+i.qty:i.label);
if(!isGuest&&i.isDiscount)return''; // 店舗用はオーダー行に割引を表示しない
return i.isDiscount
  ?'<div class="rcp-row rcp-disc"><span class="rcp-row-label">'+lb+'</span><span class="rcp-row-amt">-¥'+fmt(Math.abs(i.price*(i.qty||1)))+'</span></div>'
  :'<div class="rcp-row"><span class="rcp-row-label">'+(i.qty>1?i.label+" ×"+i.qty:i.label)+'</span><span class="rcp-row-amt">¥'+fmt(Math.abs(i.price*(i.qty||1)))+'</span></div>';
  };
  let rows="";
  const items=[...(sessionOrEst.items||[])];
  if(isGuest){
// ゲスト用: SET/GUEST/CASTセクション分け、セクション間に余白
const sItems=items.filter(isSetCatItem);
const gItems=items.filter(isGuestCatItem);
const cItems=items.filter(isCastCatItem);
const discItems=items.filter(i=>i.isDiscount);
const secHdr=(lbl)=>'<div style="font-size:8pt;font-weight:700;padding:1.5mm 0;margin-top:3mm;border-top:1px solid #999;">'+lbl+'</div>';
rows+=secHdr('＜ SET ＞')+sItems.map(rowHtml).join('')+(sItems.length?'':'<div class="rcp-row"><span class="rcp-row-label">—</span><span></span></div>');
rows+=secHdr('＜ GUEST ＞')+gItems.map(rowHtml).join('')+(gItems.length?'':'<div class="rcp-row"><span class="rcp-row-label">—</span><span></span></div>');
rows+=secHdr('＜ CAST ＞')+cItems.map(rowHtml).join('')+(cItems.length?'':'<div class="rcp-row"><span class="rcp-row-label">—</span><span></span></div>');
// 割引があれば末尾に表示
if(discItems.length)rows+=secHdr('＜ 割引 ＞')+discItems.map(rowHtml).join('');
  }else{
// 店舗用: 割引アイテムはオーダー行に表示しない
items.forEach(i=>rows+=rowHtml(i));
// 概算の追加分
if(isEstimate&&sessionOrEst.extraItems&&sessionOrEst.extraItems.length>0){
  rows+='<div style="font-size:8pt;color:#555;padding:0.5mm 0;border-top:1px dotted #ccc;margin-top:1mm;">【概算追加分】</div>';
  sessionOrEst.extraItems.forEach(i=>{const lb=i.qty>1?i.label+" ×"+i.qty:i.label;rows+='<div class="rcp-row rcp-disc"><span class="rcp-row-label">'+lb+'</span><span class="rcp-row-amt">¥'+fmt(i.price*(i.qty||1))+'</span></div>';});
}
  }

  return `
<div class="rcp-logo">CLUB GENESIS</div>
${isGuest?"":'<div class="rcp-sub">店舗控え</div>'}
<hr class="rcp-divider">
<div class="rcp-meta">テーブル: <strong>${tl}</strong> &nbsp; ${sessionOrEst.guests}名様</div>
<div class="rcp-meta">発行: ${now2.toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
${!isEstimate&&sessionOrEst.payMethod?`<div class="rcp-meta">お支払い: <strong>${sessionOrEst.payMethod==="card"?"カード":"現金"}</strong></div>`:""}
${(()=>{if(isGuest)return"";const _bn=[...new Set((sessionOrEst.items||[]).filter(i=>i.isBanaiExtension).flatMap(i=>i.banaiExtCastNames||[i.banaiExtCastName].filter(Boolean)))];return _bn.length?`<div class="rcp-meta">場内延長 ${_bn.map(n=>"（"+n+"）").join("")}</div>`:"";})()}
<hr class="rcp-divider">
${rows}
<hr class="rcp-divider">
<div class="rcp-subtotal-row"><span>小計</span><span>¥${fmt(subtotal)}</span></div>
${discount>0?`<div class="rcp-subtotal-row"><span>割引</span><span>-¥${fmt(discount)}</span></div>`:""}
<div class="rcp-subtotal-row"><span>税・SC (${Math.round((rate||TAX_RATE)*100)}%)</span><span>¥${fmt(tax)}</span></div>
<hr class="rcp-divider-solid">
<div class="rcp-total-row">
  <span class="rcp-total-label">合 計</span>
  <span class="rcp-total-amt">¥${fmt(total)}</span>
</div>
${!isGuest&&noteText?`<hr class="rcp-divider"><div class="rcp-meta" style="word-break:break-all;">備考: ${noteText}</div>`:""}
<hr class="rcp-divider">
<div class="rcp-thanks">
  ご来店ありがとうございました<br>
  またのご来店をお待ちしております<br>
  CLUB GENESIS
</div>`;
}

// ===== ePOS PRINT =====
// ePOS-Print XML APIで印刷し、失敗時は通常印刷を選択できる。
function eposPrint(data, isEstimate){
  const ip=S.config.printerIP||'192.168.150.76';
  const port=S.config.printerPort||8008;
  if(!ip){showEposPrintError("未設定",port,new Error("プリンターIPアドレスが設定されていません"),data,isEstimate);return;}
  eposPrintXML(ip,data,isEstimate);
}

// ePOS-Print XML API方式（SDK不要・直接HTTPS POST）
async function eposPrintXML(ip,data,isEstimate){
  const port=S.config.printerPort||8008;
  const xml=buildEposXML(data,isEstimate);
  const soap='<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">'+xml+'</epos-print></s:Body></s:Envelope>';
  let lastError=null;
  try{
for(const url of eposServiceUrls(ip,port)){
  try{await postEposSoap(url,soap);lastError=null;break;}
  catch(err){lastError=err;}
}
if(lastError)throw lastError;
sbs(true,"印刷しました ✓");
  }catch(e){
console.warn("ePOS-Print XML送信失敗:",e.message);
showEposPrintError(ip,port,e,data,isEstimate);
  }
}

// ePOS-Print XML形式でレシートデータを構築（80mm = 約42半角文字幅）
function buildEposXML(data,isEstimate){
  const{tableLabel,guests,items,subtotal,subDiscAmt,totalDiscAmt,discount,tax,total,rate,payMethod,splits,startTime,note,isGuest}=data;
  const now2=new Date();
  const W=42;
  const DIV="-".repeat(W);
  const DBL="=".repeat(W);
  let x="";
  const esc=(s)=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const sw=(s)=>[...String(s)].reduce((n,c)=>n+(c.charCodeAt(0)>127?2:1),0);
  const row=(label,amt,w=W)=>{const sp=Math.max(1,w-sw(label)-sw(amt));return esc(label+" ".repeat(sp)+amt)+"\n";};
  const ln=(t,al="left")=>{x+=`<text align="${al}">${esc(t)}\n</text>`;};
  const cleanLbl=(lbl)=>String(lbl).replace(/\s*[\d,]+円$/, "");
  const printItem=(i,forceLabel)=>{
if(!isGuest&&i.isDiscount)return; // 店舗用はオーダー行に割引を表示しない
const lb=i.isDiscount?(isGuest?"割引":cleanLbl(i.label)):(i.qty>1?cleanLbl(i.label)+" ×"+i.qty:cleanLbl(i.label));
const amt=(i.isDiscount?"-":"")+"¥"+fmt(Math.abs(i.price*(i.qty||1)));
x+=`<text>${row(lb,amt)}</text>`;
  };

  x+='<text lang="ja" smooth="true"/>';
  x+='<feed line="1"/>';
  x+='<text dh="true" dw="true"/>'; ln("CLUB  GENESIS","center");
  x+='<text dh="false" dw="false"/>';
  if(!isGuest)ln("店 舗 控 え","center");
  x+='<feed line="1"/>';
  x+='<text align="left"/>';
  ln(DIV);
  ln("テーブル: "+tableLabel+"　"+guests+"名様");
  if(startTime){const st=new Date(startTime);ln("入店: "+st.toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}));}
  const honNames=(items||[]).filter(i=>i.isHonShimei).map(i=>i.label.replace("本指名料 (","").replace(")","").replace("本指名料","").trim()).filter(Boolean);
  if(honNames.length)ln("本指名 "+honNames.map(n=>"（"+n+"）").join(""));
  if(!isGuest){const _bn=[...new Set((items||[]).filter(i=>i.isBanaiExtension).flatMap(i=>i.banaiExtCastNames||[i.banaiExtCastName].filter(Boolean)))];if(_bn.length)ln("場内延長 "+_bn.map(n=>"（"+n+"）").join(""));}
  if(payMethod){const pm=payMethod==="card"?"カード":"現金";ln("お支払い: "+pm);}
  if(splits&&splits.length>1)splits.forEach(sp=>{const m=sp.method==="card"?"カード":"現金";x+=`<text>${esc("  "+m+": ¥"+fmt(sp.amount))}\n</text>`;});
  ln(DIV);
  if(isGuest){
const sItems=(items||[]).filter(isSetCatItem);
const gItems=(items||[]).filter(isGuestCatItem);
const cItems=(items||[]).filter(isCastCatItem);
const dItems=(items||[]).filter(i=>i.isDiscount);
ln("--- SET ---"); sItems.forEach(printItem); if(!sItems.length)ln("  なし");
x+='<feed line="1"/>'; ln("--- GUEST ---"); gItems.forEach(printItem); if(!gItems.length)ln("  なし");
x+='<feed line="1"/>'; ln("--- CAST ---"); cItems.forEach(printItem); if(!cItems.length)ln("  なし");
if(dItems.length){x+='<feed line="1"/>'; ln("--- 割引 ---"); dItems.forEach(printItem);}
  }else{
(items||[]).forEach(printItem);
  }
  ln(DIV);
  x+=`<text>${row("小計","¥"+fmt(subtotal))}</text>`;
  if((subDiscAmt||0)>0)x+=`<text>${row(isGuest?"割引":"割引（小計）","-¥"+fmt(subDiscAmt))}</text>`;
  x+=`<text>${row("税・SC ("+Math.round((rate||TAX_RATE)*100)+"%)", "¥"+fmt(tax))}</text>`;
  if((totalDiscAmt||0)>0)x+=`<text>${row(isGuest?"割引":"割引（合計）","-¥"+fmt(totalDiscAmt))}</text>`;
  ln(DBL);
  x+='<feed line="1"/>';
  x+='<text dh="true" dw="true"/>'; x+=`<text>${row("合 計","¥"+fmt(total),Math.floor(W/2))}</text>`;
  x+='<text dh="false" dw="false"/>';
  x+='<feed line="1"/>';
  ln(DBL);
  if(!isGuest&&note){ln(DIV);ln("備考: "+note);}
  x+='<feed line="2"/>';
  ln("ご来店ありがとうございました","center");
  ln("またのご来店をお待ちしております","center");
  x+='<feed line="1"/>';
  ln("CLUB GENESIS","center");
  x+='<feed line="4"/>';
  x+='<cut type="feed"/>';
  return x;
}

function printReceiptFallback(data,isEstimate){
  const el=document.getElementById("receipt-print-area");
  if(!el)return;
  el.innerHTML=buildReceiptHTML(data,isEstimate);
  el.style.display="block";
  setTimeout(()=>{window.print();setTimeout(()=>{el.style.display="none";},500);},150);
}

function showEposPrintError(ip,port,e,data,isEstimate){
  sbs(false,"Epson接続エラー");
  const useNormalPrint=confirm("Epsonレシートプリンターに接続できませんでした。\n通常印刷に切り替えますか？\n\n設定IP: "+ip+"\n設定ポート: "+port+"\nエラー: "+(e?.message||e||"接続失敗"));
  if(useNormalPrint)printReceiptFallback(data,isEstimate);
}

function printReceipt(data, isEstimate){
  if(!confirm("レシートを印刷しますか？"))return;
  eposPrint(data,isEstimate);
}

function printCheckout(){
  const s=S.sessions[at];if(!s)return;
  const tl=S.tables.find(t=>t.id===at)?.label||"";
  const totals=ct(s);
  printReceipt({...s,...totals,tableLabel:tl,endTime:Date.now(),note:s.note||""},false);
}
function printCheckoutGuest(){
  const s=S.sessions[at];if(!s)return;
  const tl=S.tables.find(t=>t.id===at)?.label||"";
  const totals=ct(s);
  // ゲスト用: SET→GUEST→CAST順に並び替え、isGuest:trueフラグで識別
  const setItems=(s.items||[]).filter(isSetCatItem);
  const guestItems=(s.items||[]).filter(isGuestCatItem);
  const castItems=(s.items||[]).filter(isCastCatItem);
  const sortedItems=[...setItems,...guestItems,...castItems];
  printReceipt({...s,...totals,tableLabel:tl,endTime:Date.now(),items:sortedItems,isGuest:true},false);
}

function printEstimate(){
  if(!confirm("概算を印刷しますか？"))return;
  const s=S.sessions[at];if(!s)return;
  const tl=S.tables.find(t=>t.id===at)?.label||"";
  const estimateRoomType=sessionRoomType(s);
  const roomSuffix=estimateRoomType?" +"+roomTypeLabel(estimateRoomType)+"室料":"";
  const cur=ct(s);
  const r30=calcEstForMinutes(s,30);
  const r60=calcEstForMinutes(s,60);
  const rCustom=estCustomMin>0&&estCustomMin!==30&&estCustomMin!==60?calcEstForMinutes(s,estCustomMin):null;
  const missingRoom=[r30,r60,rCustom].filter(Boolean).find(result=>result.roomChargeMissing);
  if(missingRoom){alert(roomTypeLabel(missingRoom.roomType)+"室料が未設定のため概算を印刷できません。設定タブで室料を登録してください。");return;}
  const now2=new Date();

  // ePOS XML方式で概算印刷
  const ip=S.config.printerIP||'192.168.150.200';
  const port=S.config.printerPort||443;
  let x='<text lang="ja" smooth="true"/>';
  const e=(str)=>String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const ln=(t,al="left")=>{x+=`<text align="${al}">${e(t)}\n</text>`;};

  x+='<feed line="1"/>';
  x+='<text dh="true" dw="true"/>'; ln("CLUB  GENESIS","center");
  x+='<text dh="false" dw="false"/>'; ln("概算","center");
  x+='<feed line="1"/>';
  x+='<text align="left"/>';
  ln("テーブル: "+tl+"  "+s.guests+"名様");
  ln("--------------------------------");

  const estLine=(label,result)=>{
ln(label);
x+='<text dh="true" dw="true"/>'; ln("¥"+fmt(result.total),"right"); x+='<text dh="false" dw="false"/>';
x+='<feed line="1"/>';
ln("--------------------------------");
  };
  estLine("【現在の料金】",cur);
  estLine("【+30分延長"+roomSuffix+"】",r30);
  estLine("【+60分延長"+roomSuffix+"】",r60);
  if(rCustom)estLine("【+"+estCustomMin+"分延長"+roomSuffix+"】",rCustom);

  x+='<feed line="3"/><cut type="feed"/>';
  const url="https://"+ip+":"+port+"/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000";
  const soap='<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">'+x+'</epos-print></s:Body></s:Envelope>';
  fetch(url,{method:"POST",headers:{"Content-Type":"text/xml; charset=utf-8","SOAPAction":""},body:soap})
.then(res=>{
  if(!res.ok)throw new Error("HTTP "+res.status);
  sbs(true,"印刷しました ✓");
})
.catch(err=>{
  console.warn("概算印刷失敗:",err);
  // フォールバック：ブラウザ印刷
  const el=document.getElementById("receipt-print-area");
  if(!el)return;
  function estBlock(label,result){
    return '<div style="margin-bottom:4mm;">'
      +'<div style="font-size:9pt;font-weight:700;padding-bottom:2mm;margin-bottom:2mm;">'+label+'</div>'
      +'<hr class="rcp-divider">'
      +'<div style="font-size:36pt;font-weight:700;text-align:right;padding:2mm 0;">¥'+fmt(result.total)+'</div>'
      +'</div>';
  }
  let blocks=estBlock("【現在の料金】",cur);
  blocks+='<hr class="rcp-divider-solid" style="margin:3mm 0;">';
  blocks+=estBlock("【+30分延長"+roomSuffix+"】",r30);
  blocks+='<hr class="rcp-divider-solid" style="margin:3mm 0;">';
  blocks+=estBlock("【+60分延長"+roomSuffix+"】",r60);
  if(rCustom){blocks+='<hr class="rcp-divider-solid" style="margin:3mm 0;">';blocks+=estBlock("【+"+estCustomMin+"分延長"+roomSuffix+"】",rCustom);}
  el.innerHTML='<div class="rcp-logo">CLUB GENESIS</div><div class="rcp-sub">概算</div><hr class="rcp-divider">'
    +'<div class="rcp-meta">テーブル: <strong>'+tl+'</strong> &nbsp; '+s.guests+'名様</div>'
    +'<hr class="rcp-divider">'+blocks;
  el.style.display="block";
  setTimeout(()=>{window.print();setTimeout(()=>{el.style.display="none";},500);},150);
});
}

function _findHistRec(hid){
  let h=(S.history||[]).find(x=>x.id===hid);
  if(!h){for(const day of Object.values(S.bizDays||{})){h=(day.history||[]).find(x=>x.id===hid);if(h)break;}}
  return h||null;
}
function printHistReceipt(hid){
  if(!confirm("レシートを印刷しますか？"))return;
  const h=_findHistRec(hid);
  if(!h){alert("履歴が見つかりません");return;}
  eposPrint({...h,tableLabel:h.tableLabel||""},false);
}
function printHistReceiptGuest(hid){
  if(!confirm("ゲスト用レシートを印刷しますか？"))return;
  const h=_findHistRec(hid);
  if(!h){alert("履歴が見つかりません");return;}
  const setItems=(h.items||[]).filter(isSetCatItem);
  const guestItems=(h.items||[]).filter(isGuestCatItem);
  const castItems=(h.items||[]).filter(isCastCatItem);
  const sortedItems=[...setItems,...guestItems,...castItems];
  eposPrint({...h,tableLabel:h.tableLabel||"",items:sortedItems,isGuest:true},false);
}

// ===== データ分析 =====
function _analysisRangeFromFilter(filtered){
  let from=histFilter.from?new Date(histFilter.from+"T"+(histFilter.fromTime||"19:00")).getTime():null;
  let to=histFilter.to?new Date(histFilter.to+"T"+(histFilter.toTime||"18:59")+":59").getTime():null;
  if((!from||!to)&&(filtered||[]).length){
    const starts=filtered.map(h=>Number(h.startTime)||0).filter(Boolean);
    if(!from&&starts.length)from=Math.min(...starts);
    if(!to&&starts.length)to=Math.max(...starts)+24*60*60*1000;
  }
  return{from,to};
}
function safeShiftDurationMsInRange(sh,range){
  if(!sh)return 0;
  const start=Number(sh.clockIn)||0;
  let end=Number(sh.clockOut)||Date.now();
  if(!start||!end||!isFinite(start)||!isFinite(end)||end<=start)return 0;
  end=Math.min(end,start+MAX_SHIFT_MS);
  const from=range&&range.from?range.from:null;
  const to=range&&range.to?range.to:null;
  const overlapStart=from?Math.max(start,from):start;
  const overlapEnd=to?Math.min(end,to):end;
  return safeDurationMs(overlapEnd-overlapStart);
}
function _getShiftMsForCast(castId,filtered){
  let ms=0;
  const range=_analysisRangeFromFilter(filtered);
  const allShifts=Object.values(S.bizDays||{}).filter(day=>day&&day.endedAt).flatMap(d=>Object.values(d.shifts||{}));
  const seen=new Set();
  allShifts.forEach(sh=>{
    if(String(sh.castId)!==String(castId))return;
    const key=sh.id||[sh.castId,sh.clockIn,sh.clockOut].join("_");
    if(seen.has(key))return;
    seen.add(key);
    ms+=safeShiftDurationMsInRange(sh,range);
  });
  return Math.max(0,ms);
}
function _fmtWorkH(ms){
  if(ms<=0)return"0";
  const roundedMin=Math.ceil(ms/60000/30)*30;
  const h=roundedMin/60;
  return(h%1===0)?String(h):(Math.round(h*10)/10).toFixed(1);
}
function buildAnalysisResult(filtered,st){
  let html="";
  const {mode,castId,castName}=st;
  if(mode==="shimei"){
html+='<div style="border-top:1px solid rgba(255,255,255,.08);padding-top:12px;">';
if(castId==="all"){
  // 全キャスト
  html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
  html+='<span style="font-size:13px;font-weight:700;color:#e8dcc8;">指名情報（全キャスト）</span>';
  html+='<button class="btn" onclick="exportAllShimeiCSV(getFilteredHist())" style="padding:4px 12px;background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.25);color:#4ade80;border-radius:4px;font-size:11px;">CSV</button>';
  html+='</div>';
  html+='<div style="display:grid;grid-template-columns:1fr auto auto;gap:4px;font-size:11px;color:#555;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.06);">';
  html+='<span>キャスト</span><span style="text-align:right;">本指名</span><span style="text-align:right;">場内指名</span></div>';
  activeRegularCasts().forEach(c=>{
    const hon=filtered.filter(h=>(h.items||[]).some(i=>i.isHonShimei&&String(i.castId)===String(c.id))).length;
    const ban=filtered.filter(h=>(h.items||[]).some(i=>i.isBanaiShimei&&String(i.castId)===String(c.id))).length;
    if(!hon&&!ban)return;
    html+='<div style="display:grid;grid-template-columns:1fr auto auto;gap:4px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04);">';
    html+='<span style="font-size:13px;color:#e8dcc8;">'+c.name+'</span>';
    html+='<span style="font-size:13px;color:#ff4444;text-align:right;min-width:40px;">'+hon+'件</span>';
    html+='<span style="font-size:13px;color:#4ade80;text-align:right;min-width:50px;">'+ban+'件</span>';
    html+='</div>';
  });
} else {
  // 単一キャスト
  const hon=filtered.filter(h=>(h.items||[]).some(i=>i.isHonShimei&&String(i.castId)===String(castId))).length;
  const ban=filtered.filter(h=>(h.items||[]).some(i=>i.isBanaiShimei&&String(i.castId)===String(castId))).length;
  html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
  html+='<span style="font-size:13px;font-weight:700;color:#e8dcc8;">'+castName+'</span>';
  html+='<button class="btn" onclick="exportShimeiCastCSV(getFilteredHist(),\''+castId+'\',\''+castName+'\')" style="padding:4px 12px;background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.25);color:#4ade80;border-radius:4px;font-size:11px;">CSV</button>';
  html+='</div>';
  html+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
  html+='<div style="padding:8px;background:rgba(255,68,68,.06);border:1px solid rgba(255,68,68,.15);border-radius:6px;text-align:center;"><div style="font-size:10px;color:#888;">本指名</div><div style="font-size:18px;font-weight:700;color:#ff4444;">'+hon+'<span style="font-size:11px;">件</span></div></div>';
  html+='<div style="padding:8px;background:rgba(74,222,128,.06);border:1px solid rgba(74,222,128,.15);border-radius:6px;text-align:center;"><div style="font-size:10px;color:#888;">場内指名</div><div style="font-size:18px;font-weight:700;color:#4ade80;">'+ban+'<span style="font-size:11px;">件</span></div></div>';
  html+='</div>';
}
html+='</div>';
  } else if(mode==="uriage"){
const cid=String(castId);
const records=filtered.filter(h=>(h.items||[]).some(i=>(i.isHonShimei||i.isBanaiShimei)&&String(i.castId)===cid));
const kumi=records.length;
const guests=records.reduce((a,h)=>a+(h.guests||0),0);
const sub=records.reduce((a,h)=>a+(h.subtotal||h.total),0);
const hon=records.filter(h=>(h.items||[]).some(i=>i.isHonShimei&&String(i.castId)===cid)).length;
const ban=records.filter(h=>(h.items||[]).some(i=>i.isBanaiShimei&&String(i.castId)===cid)).length;
const dohan=records.filter(h=>(h.items||[]).some(i=>i.label==="同伴料")).length;
const workHStr=_fmtWorkH(_getShiftMsForCast(castId,filtered));
html+='<div style="border-top:1px solid rgba(255,255,255,.08);padding-top:12px;">';
html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
html+='<span style="font-size:13px;font-weight:700;color:#e8dcc8;">'+castName+'</span>';
html+='<button class="btn" onclick="exportUriageCSV(getFilteredHist(),\''+castId+'\',\''+castName+'\')" style="padding:4px 12px;background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.25);color:#4ade80;border-radius:4px;font-size:11px;">CSV</button>';
html+='</div>';
html+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:6px;">';
html+='<div style="padding:8px;background:rgba(212,160,23,.06);border:1px solid rgba(212,160,23,.15);border-radius:6px;text-align:center;"><div style="font-size:10px;color:#888;">合計小計</div><div style="font-size:14px;font-weight:700;color:#d4a017;">'+pAmt(sub)+'</div></div>';
html+='<div style="padding:8px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:6px;text-align:center;"><div style="font-size:10px;color:#888;">組数</div><div style="font-size:15px;font-weight:700;color:#e8dcc8;">'+kumi+'<span style="font-size:11px;color:#888;">組</span></div></div>';
html+='<div style="padding:8px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:6px;text-align:center;"><div style="font-size:10px;color:#888;">総客数</div><div style="font-size:15px;font-weight:700;color:#e8dcc8;">'+guests+'<span style="font-size:11px;color:#888;">名</span></div></div>';
html+='</div>';
html+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;">';
html+='<div style="padding:8px;background:rgba(255,68,68,.06);border:1px solid rgba(255,68,68,.15);border-radius:6px;text-align:center;"><div style="font-size:10px;color:#888;">本指名</div><div style="font-size:14px;font-weight:700;color:#ff4444;">'+hon+'件</div></div>';
html+='<div style="padding:8px;background:rgba(74,222,128,.06);border:1px solid rgba(74,222,128,.15);border-radius:6px;text-align:center;"><div style="font-size:10px;color:#888;">場内指名</div><div style="font-size:14px;font-weight:700;color:#4ade80;">'+ban+'件</div></div>';
html+='<div style="padding:8px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:6px;text-align:center;"><div style="font-size:10px;color:#888;">同伴</div><div style="font-size:14px;font-weight:700;color:#e8dcc8;">'+dohan+'件</div></div>';
html+='<div style="padding:8px;background:rgba(56,189,248,.06);border:1px solid rgba(56,189,248,.15);border-radius:6px;text-align:center;"><div style="font-size:10px;color:#888;">稼働時間</div><div style="font-size:14px;font-weight:700;color:#38bdf8;">'+workHStr+'h</div></div>';
html+='</div>';
html+='</div>';
  }
  return html;
}
function exportAllShimeiCSV(filtered){
  const bom="\uFEFF";
  const rows=[["キャスト","本指名件数","場内指名件数"]];
  activeRegularCasts().forEach(c=>{
const hon=filtered.filter(h=>(h.items||[]).some(i=>i.isHonShimei&&String(i.castId)===String(c.id))).length;
const ban=filtered.filter(h=>(h.items||[]).some(i=>i.isBanaiShimei&&String(i.castId)===String(c.id))).length;
rows.push([c.name,hon,ban]);
  });
  _dlCSV(bom+rows.map(r=>r.join(",")).join("\n"),"shimei_all.csv");
}
function exportShimeiCastCSV(filtered,castId,castName){
  const hon=filtered.filter(h=>(h.items||[]).some(i=>i.isHonShimei&&String(i.castId)===String(castId))).length;
  const ban=filtered.filter(h=>(h.items||[]).some(i=>i.isBanaiShimei&&String(i.castId)===String(castId))).length;
  const bom="\uFEFF";
  const rows=[["キャスト","本指名件数","場内指名件数"],[castName,hon,ban]];
  _dlCSV(bom+rows.map(r=>r.join(",")).join("\n"),"shimei_"+castName+".csv");
}
function banaiExtensionSalesPhases(items){
  const phases=new Map();
  let currentIds=[];
  (items||[]).forEach(i=>{
    if(i.isBanaiExtension){
      currentIds=[...new Set([...(i.banaiExtCastIds||[]),i.banaiExtCastId,i.castId].filter(x=>x!=null&&x!=="").map(String))];
    }
    if(!currentIds.length||i.isDiscount)return;
    const ids=[...currentIds].sort();
    const key=ids.join("|");
    if(!phases.has(key))phases.set(key,{ids,total:0,backTotal:0});
    const amount=Math.max(0,Number(i.price)||0)*Math.max(1,Number(i.qty)||1);
    if(isBanaiExtensionBackItem(i))phases.get(key).backTotal+=amount;
    else phases.get(key).total+=amount;
  });
  return[...phases.values()];
}
function banaiExtensionSalesForCast(items,castId){
  const cid=String(castId);
  return banaiExtensionSalesPhases(items).reduce((total,phase)=>{
    if(!phase.ids.includes(cid))return total;
    return total+Math.floor(phase.total/phase.ids.length);
  },0);
}
function banaiExtensionBackSalesForCast(items,castId){
  const cid=String(castId);
  return banaiExtensionSalesPhases(items).reduce((total,phase)=>{
    if(!phase.ids.includes(cid))return total;
    return total+Math.floor((phase.backTotal||0)/phase.ids.length);
  },0);
}
function anaBizDateFromMs(ms){
  const d=new Date(Number(ms)||Date.now());
  if(d.getHours()<19)d.setDate(d.getDate()-1);
  return d.toLocaleDateString("sv-SE");
}
function anaTime(ms){
  return ms?new Date(ms).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit",hour12:false}):"";
}
function anaLiquorLabel(item){
  const qty=Math.max(1,Number(item.qty||item.quantity)||1);
  return String(item.label||"")+(qty>1?" x"+qty:"");
}
function anaHasHonCast(rec,cid){
  return(rec.items||[]).some(i=>i.isHonShimei&&String(i.castId)===String(cid));
}
function anaHonShare(rec,cid){
  if(!anaHasHonCast(rec,cid))return 0;
  const honCount=Math.max(1,(rec.items||[]).filter(i=>i.isHonShimei).length);
  return Math.floor((Number(rec.subtotal||rec.total)||0)/honCount);
}
function anaBanaiExtMatch(item,cid){
  return item&&item.isBanaiExtension&&((item.banaiExtCastIds||[]).map(String).includes(String(cid))||(item.banaiExtCastId&&String(item.banaiExtCastId)===String(cid)));
}
function anaBanaiExtensionDetails(items,cid){
  let currentIds=[];
  let sales=0;
  const liquors=[];
  (items||[]).forEach(item=>{
    if(item.isBanaiExtension){
      currentIds=[...new Set([...(item.banaiExtCastIds||[]),item.banaiExtCastId,item.castId].filter(x=>x!=null&&x!=="").map(String))];
    }
    if(!currentIds.length||!currentIds.includes(String(cid))||item.isDiscount)return;
    const shareCount=Math.max(1,currentIds.length);
    const amount=Math.max(0,Number(item.price)||0)*Math.max(1,Number(item.qty)||1);
    if(isBanaiExtensionBackItem(item))liquors.push(anaLiquorLabel(item));
    else sales+=Math.floor(amount/shareCount);
  });
  return{sales,liquors};
}
function anaCastDrinkCounts(items,cid){
  const counts={p2000:0,p3000:0,other:{}};
  (items||[]).forEach(item=>{
    const cat=item.category==="castDrink"||(item.id&&String(item.id).startsWith("cd_"));
    if(!cat||String(item.castId)!==String(cid))return;
    const qty=Math.max(1,Number(item.qty||item.quantity)||1);
    const price=Math.max(0,Number(item.price)||0);
    if(price===2000)counts.p2000+=qty;
    else if(price===3000)counts.p3000+=qty;
    else counts.other[price]=(counts.other[price]||0)+qty;
  });
  return counts;
}
function anaMergeDrinkCounts(target,src){
  target.p2000+=src.p2000;
  target.p3000+=src.p3000;
  Object.entries(src.other).forEach(([price,count])=>{target.other[price]=(target.other[price]||0)+count;});
}
function anaDrinkCountText(counts){
  const parts=["2000円 "+counts.p2000+"杯","3000円 "+counts.p3000+"杯"];
  Object.keys(counts.other).sort((a,b)=>Number(a)-Number(b)).forEach(price=>parts.push((Number(price)?price+"円":"その他")+" "+counts.other[price]+"杯"));
  return parts.join(" / ");
}
function anaFmtWorkMs(ms){
  const totalMin=Math.max(0,Math.round((Number(ms)||0)/60000));
  const h=Math.floor(totalMin/60);
  const m=totalMin%60;
  return h>0?h+"h"+m+"m":m+"m";
}
function anaDetailRange(){
  const from=histFilter.from?new Date(histFilter.from+"T"+(histFilter.fromTime||"19:00")).getTime():null;
  const to=histFilter.to?new Date(histFilter.to+"T"+(histFilter.toTime||"18:59")+":59").getTime():null;
  return{from,to};
}
function anaShiftEndMs(sh){
  return Number(sh.clockOut)||Number(sh._dayEndedAt)||0;
}
function anaShiftIntervalInRange(sh,range){
  const start=Number(sh.clockIn)||0;
  let end=anaShiftEndMs(sh);
  if(!start||!end||!isFinite(start)||!isFinite(end)||end<=start)return null;
  end=Math.min(end,start+MAX_SHIFT_MS);
  const from=range&&range.from?range.from:null;
  const to=range&&range.to?range.to:null;
  const overlapStart=from?Math.max(start,from):start;
  const overlapEnd=to?Math.min(end,to):end;
  if(!isFinite(overlapStart)||!isFinite(overlapEnd)||overlapEnd<=overlapStart)return null;
  return{start:overlapStart,end:overlapEnd};
}
function anaMergedIntervalMs(intervals){
  const sorted=(intervals||[]).filter(i=>i&&i.end>i.start).sort((a,b)=>a.start-b.start);
  let total=0,current=null;
  sorted.forEach(i=>{
    if(!current){current={start:i.start,end:i.end};return;}
    if(i.start<=current.end)current.end=Math.max(current.end,i.end);
    else{total+=current.end-current.start;current={start:i.start,end:i.end};}
  });
  if(current)total+=current.end-current.start;
  return safeDurationMs(total);
}
function anaCastNameKey(name){
  return String(name||"").replace(/\s+/g,"").trim();
}
function anaShiftRowsForCast(castId,castName,filtered){
  const range=anaDetailRange();
  const nameKey=anaCastNameKey(castName);
  const allShifts=Object.values(S.bizDays||{}).filter(day=>day&&day.endedAt).flatMap(d=>Object.values(d.shifts||{}).map(sh=>({...sh,_dayEndedAt:d.endedAt,_dayDate:d.date})));
  const seen=new Set();
  return allShifts.filter(sh=>{
    const idMatched=String(sh.castId)===String(castId);
    const nameMatched=nameKey&&anaCastNameKey(sh.castName)===nameKey;
    if(!idMatched&&!nameMatched)return false;
    const key=sh.id||[sh.castId,sh.clockIn,sh.clockOut].join("_");
    if(seen.has(key))return false;
    seen.add(key);
    return !!anaShiftIntervalInRange(sh,range);
  }).sort((a,b)=>(a.clockIn||0)-(b.clockIn||0));
}
function anaCastDetailRows(filtered,castId,castName){
  const cid=String(castId);
  const days={};
  const ensure=(date)=>days[date]||(days[date]={date,firstIn:null,lastOut:null,hasOpenShift:false,shiftIntervals:[],workMs:0,honCount:0,honSales:0,banaiCount:0,banaiExtSales:0,dohanCount:0,honLiquors:[],banaiLiquors:[],drinkCounts:{p2000:0,p3000:0,other:{}}});
  anaShiftRowsForCast(cid,castName,filtered).forEach(sh=>{
    const range=anaDetailRange();
    const interval=anaShiftIntervalInRange(sh,range);
    if(!interval)return;
    const date=sh._dayDate||anaBizDateFromMs(sh.clockIn);
    const row=ensure(date);
    row.shiftIntervals.push(interval);
    row.firstIn=row.firstIn?Math.min(row.firstIn,interval.start):interval.start;
    row.lastOut=row.lastOut?Math.max(row.lastOut,interval.end):interval.end;
    const clockOut=anaShiftEndMs(sh);
    if(clockOut)row.lastOut=row.lastOut?Math.max(row.lastOut,clockOut):clockOut;
    else row.hasOpenShift=true;
  });
  filtered.forEach(rec=>{
    const items=rec.items||[];
    const date=anaBizDateFromMs(rec.startTime);
    const row=ensure(date);
    const isHon=anaHasHonCast(rec,cid);
    if(isHon){
      row.honCount+=1;
      row.honSales+=anaHonShare(rec,cid);
      if(items.some(i=>i.id==="dh"||i.label==="同伴料"))row.dohanCount+=1;
      items.filter(isBanaiExtensionBackItem).forEach(i=>row.honLiquors.push(anaLiquorLabel(i)));
    }
    row.banaiCount+=items.filter(i=>i.isBanaiShimei&&String(i.castId)===cid).length;
    if(!items.some(i=>i.isHonShimei)&&items.some(i=>anaBanaiExtMatch(i,cid))){
      const det=anaBanaiExtensionDetails(items,cid);
      row.banaiExtSales+=det.sales;
      row.banaiLiquors.push(...det.liquors);
    }
    anaMergeDrinkCounts(row.drinkCounts,anaCastDrinkCounts(items,cid));
  });
  Object.values(days).forEach(row=>{row.workMs=anaMergedIntervalMs(row.shiftIntervals);});
  return Object.values(days).sort((a,b)=>b.date.localeCompare(a.date));
}
function anaCastDetailHtml(filtered,castId,castName){
  const rows=anaCastDetailRows(filtered,castId,castName);
  if(!rows.length)return'<div style="padding:18px;text-align:center;color:#666;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:8px;">対象データなし</div>';
  return rows.map(row=>{
    const total=row.honSales+row.banaiExtSales;
    const honLiquors=[...new Set(row.honLiquors)].join(" / ")||"なし";
    const banaiLiquors=[...new Set(row.banaiLiquors)].join(" / ")||"なし";
    const workH=anaFmtWorkMs(row.workMs);
    const inText=anaTime(row.firstIn)||"-";
    const outText=row.hasOpenShift?"出勤中":(anaTime(row.lastOut)||"-");
    return '<div class="glass" style="border-radius:8px;padding:12px;margin-bottom:10px;">'
      +'<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:10px;"><div style="font-size:15px;font-weight:800;color:#d4a017;">'+row.date+'</div><div style="font-size:14px;font-weight:800;color:#e8dcc8;">合計 '+pAmt(total)+'</div></div>'
      +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px;margin-bottom:10px;">'
      +anaMiniMetric("出勤",inText,"#e8dcc8")+anaMiniMetric("退勤",outText,"#e8dcc8")+anaMiniMetric("勤務",workH,"#38bdf8")
      +anaMiniMetric("本指名",row.honCount+"件","#ff4444")+anaMiniMetric("本指名売上",pAmt(row.honSales),"#d4a017")
      +anaMiniMetric("場内指名",row.banaiCount+"件","#4ade80")+anaMiniMetric("場内延長売上",pAmt(row.banaiExtSales),"#ffa500")
      +anaMiniMetric("同伴",row.dohanCount+"件","#e8dcc8")
      +'</div>'
      +'<div style="font-size:12px;line-height:1.7;color:#bbb;border-top:1px solid rgba(255,255,255,.06);padding-top:8px;">'
      +'<div><span style="color:#888;">ボトル・シャンパン（本指名）</span> '+honLiquors+'</div>'
      +'<div><span style="color:#888;">ボトル・シャンパン（場内延長）</span> '+banaiLiquors+'</div>'
      +'<div><span style="color:#888;">キャストDrink</span> '+anaDrinkCountText(row.drinkCounts)+'</div>'
      +'</div>'
      +'</div>';
  }).join("");
}
function anaMiniMetric(label,value,color){
  return'<div style="padding:8px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:6px;"><div style="font-size:10px;color:#888;margin-bottom:3px;">'+label+'</div><div style="font-size:13px;font-weight:800;color:'+color+';word-break:break-word;">'+value+'</div></div>';
}
function exportUriageCSV(filtered,castId,castName){
  const cid=String(castId);
  const records=filtered.filter(h=>(h.items||[]).some(i=>(i.isHonShimei||i.isBanaiShimei)&&String(i.castId)===cid));
  const honRecs=records.filter(h=>(h.items||[]).some(i=>i.isHonShimei&&String(i.castId)===cid));
  const kumi=records.length;
  const guests=records.reduce((a,h)=>a+(h.guests||0),0);
  // 本指名売上: 同テーブルの本指名人数で均等分配
  const sub=honRecs.reduce((a,h)=>{
const honCount=Math.max(1,(h.items||[]).filter(i=>i.isHonShimei).length);
return a+(h.subtotal||h.total)/honCount;
  },0);
  // 場内延長売上: オールフリーのみ・場内延長以降の小計を対象キャスト数で均等分配
  const _becMatchCSV=(i)=>i.isBanaiExtension&&((i.banaiExtCastIds||[]).map(String).includes(cid)||(i.banaiExtCastId&&String(i.banaiExtCastId)===cid));
  const banaiExtRecs=filtered.filter(h=>(h.items||[]).some(_becMatchCSV)&&!(h.items||[]).some(i=>i.isHonShimei));
  const banaiExtSub=banaiExtRecs.reduce((a,h)=>a+banaiExtensionSalesForCast(h.items,cid),0);
  const banaiExtBack=banaiExtRecs.reduce((a,h)=>a+banaiExtensionBackSalesForCast(h.items,cid),0);
  const hon=honRecs.length;
  const ban=records.filter(h=>(h.items||[]).some(i=>i.isBanaiShimei&&String(i.castId)===cid)).length;
  const banaiExt=banaiExtRecs.length;
  const dohan=records.filter(h=>(h.items||[]).some(i=>i.label==="同伴料")).length;
  const workHStr=_fmtWorkH(_getShiftMsForCast(castId,filtered));
  const bom="\uFEFF";
  const rows=[
["キャスト","本指名小計","場内延長小計","組数","総客数","本指名件数","場内指名件数","場内延長件数","同伴件数","稼働時間(h)"],
[castName,Math.round(sub),Math.round(banaiExtSub),Math.round(banaiExtBack),kumi,guests,hon,ban,banaiExt,dohan,workHStr]
  ];
  rows[0]=["キャスト","本指名小計","場内延長小計","場内延長バック","組数","総客数","本指名件数","場内指名件数","場内延長件数","同伴件数","稼働時間(h)"];
  _dlCSV(bom+rows.map(r=>r.join(",")).join("\n"),"uriage_"+castName+".csv");
}
function exportAssignHistCSV(){
  const allA=Object.values(S.assignments||{}).sort((a,b)=>a.startTime-b.startTime);
  const curFilter=window._assignHistFilter||"all";
  const filtered=curFilter==="all"?allA:allA.filter(a=>a.type===curFilter);
  const sessionMap={};
  filtered.forEach(a=>{
const sid=a.sessionId||("nosid_"+a.startTime);
const key=a.tableId+"::"+sid;
if(!sessionMap[key])sessionMap[key]={tableId:a.tableId,sid,assigns:[]};
sessionMap[key].assigns.push(a);
  });
  const doneSessions=Object.values(sessionMap)
.filter(({tableId,assigns})=>{
  const currentSess=S.sessions[tableId];
  const sessionId=assigns[0].sessionId;
  if(currentSess&&(sessionId===currentSess.startTime||sessionId==null))return false;
  return true;
})
.sort((a,b)=>{
  const ta=a.assigns[0].sessionId||a.assigns[0].startTime;
  const tb=b.assigns[0].sessionId||b.assigns[0].startTime;
  return tb-ta;
});
  const bom="\uFEFF";
  const rows=[["テーブル","備考","入店時刻","キャスト名","タイプ","開始","終了","時間(分)"]];
  doneSessions.forEach(({tableId,assigns})=>{
const t=S.tables.find(t=>t.id===tableId);
const label=t?.label||tableId;
const sessionTs=assigns[0].sessionId||assigns[0].startTime;
const inTime=new Date(sessionTs).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"});
const histRec=(S.history||[]).find(h=>h.tableId===tableId&&h.startTime===assigns[0].sessionId);
const note=histRec?.note||"";
const doneA=assigns.filter(a=>a.endTime).sort((a,b)=>a.startTime-b.startTime);
doneA.forEach(a=>{
  const sT=new Date(a.startTime).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"});
  const eT=new Date(a.endTime).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"});
  const dur=Math.round((a.endTime-a.startTime)/60000);
  const typeLbl=ASSIGN_TYPES[a.type]?.label||a.type;
  rows.push([label,note,inTime,a.castName,typeLbl,sT,eT,dur]);
});
  });
  _dlCSV(bom+rows.map(r=>r.map(v=>'"'+(String(v).replace(/"/g,'""'))+'"').join(",")).join("\n"),"assign_hist.csv");
}
function _dlCSV(csvStr,filename){
  const blob=new Blob([csvStr],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
}
function _xlsxEscape(v){
  return String(v??"").replace(/[<>&"]/g,ch=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[ch]));
}
function _xlsxCol(n){
  let s="";
  while(n>0){n--;s=String.fromCharCode(65+(n%26))+s;n=Math.floor(n/26);}
  return s;
}
function _xlsxTextWidth(v){
  return Array.from(String(v??"")).reduce((sum,ch)=>sum+(/[ -~]/.test(ch)?1:2),0);
}
function _xlsxAutoColWidth(rows,colIdx,minWidth=16){
  const widest=Math.max(minWidth,...(rows||[]).map(row=>_xlsxTextWidth((row||[])[colIdx])));
  return Math.min(255,Math.ceil(widest*1.05+2));
}
function _xlsxColsXml(maxCols,widths=[]){
  const cols=[];
  for(let idx=0;idx<maxCols;idx++){
    const fallback=idx===0?18:16;
    const width=Math.min(255,Math.max(8,Number(widths[idx])||fallback));
    cols.push('<col min="'+(idx+1)+'" max="'+(idx+1)+'" width="'+width+'" customWidth="1"/>');
  }
  return '<cols>'+cols.join("")+'</cols>';
}
function _xlsxSheet(rows,options={}){
  const maxCols=Math.max(1,...(rows||[]).map(r=>(r||[]).length));
  const cols=_xlsxColsXml(maxCols,options.columnWidths||[]);
  const body=rows.map((row,rIdx)=>'<row r="'+(rIdx+1)+'">'+row.map((v,cIdx)=>{
    const ref=_xlsxCol(cIdx+1)+(rIdx+1);
    return '<c r="'+ref+'" t="inlineStr"><is><t>'+_xlsxEscape(v)+'</t></is></c>';
  }).join("")+'</row>').join("");
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    +'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    +'<sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="18"/>'
    +cols
    +'<sheetData>'+body+'</sheetData></worksheet>';
}
function _crc32(bytes){
  let crc=~0;
  for(let i=0;i<bytes.length;i++){
    crc^=bytes[i];
    for(let j=0;j<8;j++)crc=(crc>>>1)^(0xEDB88320&-(crc&1));
  }
  return ~crc>>>0;
}
function _u16(arr,v){arr.push(v&255,(v>>>8)&255);}
function _u32(arr,v){arr.push(v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255);}
function _dosDateTime(){
  const d=new Date();
  return{time:(d.getHours()<<11)|(d.getMinutes()<<5)|Math.floor(d.getSeconds()/2),date:((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate()};
}
function _zipStore(files){
  const enc=new TextEncoder();
  const out=[],central=[];
  let offset=0;
  const dt=_dosDateTime();
  files.forEach(file=>{
    const name=enc.encode(file.name);
    const data=typeof file.data==="string"?enc.encode(file.data):file.data;
    const crc=_crc32(data);
    const local=[];
    _u32(local,0x04034b50);_u16(local,20);_u16(local,0);_u16(local,0);_u16(local,dt.time);_u16(local,dt.date);
    _u32(local,crc);_u32(local,data.length);_u32(local,data.length);_u16(local,name.length);_u16(local,0);
    out.push(...local,...name,...data);
    const cent=[];
    _u32(cent,0x02014b50);_u16(cent,20);_u16(cent,20);_u16(cent,0);_u16(cent,0);_u16(cent,dt.time);_u16(cent,dt.date);
    _u32(cent,crc);_u32(cent,data.length);_u32(cent,data.length);_u16(cent,name.length);_u16(cent,0);_u16(cent,0);_u16(cent,0);_u16(cent,0);_u32(cent,0);_u32(cent,offset);
    central.push(...cent,...name);
    offset=out.length;
  });
  const centralOffset=out.length;
  out.push(...central);
  const end=[];
  _u32(end,0x06054b50);_u16(end,0);_u16(end,0);_u16(end,files.length);_u16(end,files.length);_u32(end,central.length);_u32(end,centralOffset);_u16(end,0);
  out.push(...end);
  return new Uint8Array(out);
}
function _xlsxSheetName(name){
  return _xlsxEscape(String(name||"Data").replace(/[\[\]\*\/\\\?:]/g,"").slice(0,31)||"Data");
}
function _downloadXLSX(rows,filename,sheetName,options={}){
  const safeSheet=_xlsxSheetName(sheetName);
  const files=[
    {name:"[Content_Types].xml",data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'},
    {name:"_rels/.rels",data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
    {name:"xl/workbook.xml",data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="'+safeSheet+'" sheetId="1" r:id="rId1"/></sheets></workbook>'},
    {name:"xl/_rels/workbook.xml.rels",data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'},
    {name:"xl/worksheets/sheet1.xml",data:_xlsxSheet(rows,options)}
  ];
  const blob=new Blob([_zipStore(files)],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
}
function _paymentBreakdownFromHist(hist){
  const out={cashTotal:0,cardTotal:0,cashRows:[],cardRows:[]};
  (hist||[]).forEach(h=>{
    const parts=(h.splits&&h.splits.length)?h.splits:[{method:h.payMethod==="card"?"card":"cash",amount:h.total}];
    parts.forEach(sp=>{
      const method=sp.method==="card"?"card":"cash";
      const amount=Math.max(0,Number(sp.amount)||0);
      const row=[
        new Date(h.startTime||h.endTime||Date.now()).toLocaleString("ja-JP"),
        h.tableLabel||"",
        (h.guests||0)+"名",
        Math.round(amount),
        Math.round(Number(h.total)||0),
        h.note||""
      ];
      if(method==="card"){out.cardTotal+=amount;out.cardRows.push(row);}
      else{out.cashTotal+=amount;out.cashRows.push(row);}
    });
  });
  out.cashTotal=Math.round(out.cashTotal);
  out.cardTotal=Math.round(out.cardTotal);
  return out;
}
function _accountingRowsFromHist(hist){
  const data=_paymentBreakdownFromHist(hist);
  const header=["日時","テーブル","人数","会計金額","伝票合計","備考"];
  return [
    ["会計データ"],
    ["現金会計 合計",data.cashTotal],
    ["カード会計 合計",data.cardTotal],
    [],
    ["現金会計履歴"],
    header,
    ...(data.cashRows.length?data.cashRows:[["履歴なし"]]),
    [],
    ["カード会計履歴"],
    header,
    ...(data.cardRows.length?data.cardRows:[["履歴なし"]])
  ];
}
function _salesDataStatsFromHist(hist){
  const map={};
  const ensure=(id,name)=>{
    const key=String(id||("name:"+name)||"unknown");
    if(!map[key])map[key]={castId:String(id||""),castName:name||"不明",honShimeiSales:0,banaiExtensionSales:0,honCount:0,banaiCount:0,dohanCount:0,champagneWineItems:[],keepBottleItems:[]};
    if((!map[key].castName||map[key].castName==="不明")&&name)map[key].castName=name;
    if(!map[key].champagneWineItems)map[key].champagneWineItems=[];
    if(!map[key].keepBottleItems)map[key].keepBottleItems=[];
    return map[key];
  };
  const liquorCategory=item=>{
    const c=gmsItemCategory(item);
    return c==="champagneWine"||c==="keepBottle"?c:"";
  };
  const liquorAmountLabel=item=>{
    const amount=Math.abs((Number(item.price)||0)*Math.max(1,Number(item.qty||item.quantity)||1));
    return "\u00a5"+fmt(amount);
  };
  const targetNameSuffix=names=>{
    const unique=[...new Set((names||[]).filter(Boolean).map(String))];
    return unique.length>1?"("+unique.join("\u30fb")+")":"";
  };
  const addLiquor=(row,item,targetNames=[])=>{
    const c=liquorCategory(item);
    if(!c)return;
    const label=anaLiquorLabel(item)+" "+liquorAmountLabel(item)+targetNameSuffix(targetNames);
    if(c==="champagneWine")row.champagneWineItems.push(label);
    else row.keepBottleItems.push(label);
  };
  (hist||[]).forEach(h=>{
    const items=h.items||[];
    const honItems=items.filter(i=>i&&i.isHonShimei);
    const uniqueHon=[...new Map(honItems.map(i=>[String(i.castId||itemCastName(i)),i])).values()];
    if(uniqueHon.length){
      const share=Math.floor((Number(h.subtotal||h.total)||0)/uniqueHon.length);
      uniqueHon.forEach(i=>{ensure(i.castId,itemCastName(i)||i.castName).honShimeiSales+=share;});
      honItems.forEach(i=>{ensure(i.castId,itemCastName(i)||i.castName).honCount+=Math.max(1,Number(i.qty)||1);});
      const liquorItems=items.filter(i=>i&&liquorCategory(i));
      const honTargetNames=uniqueHon.map(i=>itemCastName(i)||i.castName||gmsCastName(i.castId,"")).filter(Boolean);
      uniqueHon.forEach(i=>{
        const row=ensure(i.castId,itemCastName(i)||i.castName);
        liquorItems.forEach(item=>addLiquor(row,item,honTargetNames));
      });
      if(items.some(i=>i&&(i.id==="dh"||i.label==="\u540c\u4f34\u6599"))){
        uniqueHon.forEach(i=>{ensure(i.castId,itemCastName(i)||i.castName).dohanCount+=1;});
      }
    }
    items.filter(i=>i&&i.isBanaiShimei).forEach(i=>{
      ensure(i.castId,itemCastName(i)||i.castName).banaiCount+=Math.max(1,Number(i.qty)||1);
    });
    if(!honItems.length){
      banaiExtensionSalesPhases(items).forEach(phase=>{
        const share=Math.floor(((phase.total||0)+(phase.backTotal||0))/Math.max(1,phase.ids.length));
        phase.ids.forEach(id=>{ensure(id,gmsCastName(id,"")).banaiExtensionSales+=share;});
      });
      let currentIds=[];
      items.forEach(item=>{
        if(item&&item.isBanaiExtension){
          currentIds=[...new Set([...(item.banaiExtCastIds||[]),item.banaiExtCastId,item.castId].filter(x=>x!=null&&x!=="").map(String))];
        }
        if(!currentIds.length||!item||item.isDiscount||!liquorCategory(item))return;
        const currentNames=currentIds.map(id=>gmsCastName(id,"")).filter(Boolean);
        currentIds.forEach(id=>addLiquor(ensure(id,gmsCastName(id,"")),item,currentNames));
      });
    }
  });
  return Object.values(map)
    .map(r=>({...r,champagneWineItems:r.champagneWineItems||[],keepBottleItems:r.keepBottleItems||[]}))
    .filter(r=>r.honShimeiSales||r.banaiExtensionSales||r.honCount||r.banaiCount||r.dohanCount||r.champagneWineItems.length||r.keepBottleItems.length)
    .sort((a,b)=>String(a.castName).localeCompare(String(b.castName),"ja-JP"));
}
function _salesDataTotalsFromHist(hist){
  return _salesDataStatsFromHist(hist).reduce((sum,row)=>({
    honShimeiSales:sum.honShimeiSales+Math.round(row.honShimeiSales||0),
    banaiExtensionSales:sum.banaiExtensionSales+Math.round(row.banaiExtensionSales||0),
    honCount:sum.honCount+Math.round(row.honCount||0),
    banaiCount:sum.banaiCount+Math.round(row.banaiCount||0),
    dohanCount:sum.dohanCount+Math.round(row.dohanCount||0)
  }),{honShimeiSales:0,banaiExtensionSales:0,honCount:0,banaiCount:0,dohanCount:0});
}
function _salesDataRowsFromHist(hist){
  const stats=_salesDataStatsFromHist(hist);
  const totals=_salesDataTotalsFromHist(hist);
  const rows=[
    ["キャスト名","本指名売上","場内延長売上","指名本数","場内指名本数","同伴本数"],
    ...stats.map(r=>[r.castName,Math.round(r.honShimeiSales),Math.round(r.banaiExtensionSales),Math.round(r.honCount),Math.round(r.banaiCount),Math.round(r.dohanCount)])
  ];
  rows[0].push("シャンパン・ワイン","キープボトル");
  stats.forEach((r,idx)=>rows[idx+1].push((r.champagneWineItems||[]).join(" / "),(r.keepBottleItems||[]).join(" / ")));
  if(stats.length)rows.push(["全キャスト合計",totals.honShimeiSales,totals.banaiExtensionSales,totals.honCount,totals.banaiCount,totals.dohanCount]);
  if(stats.length)rows[rows.length-1].push("","");
  return rows;
}
function _salesDataColumnWidths(rows){
  const widths=[18,16,16,12,14,12,24,24];
  widths[6]=_xlsxAutoColWidth(rows,6,24);
  widths[7]=_xlsxAutoColWidth(rows,7,24);
  return widths;
}
function _castDrinkRowsFromHist(hist){
  const map={};
  const totals={p2000:0,p3000:0,other:{},all:0};
  (hist||[]).forEach(h=>(h.items||[]).forEach(item=>{
    const isDrink=item?.category==="castDrink"||(item?.id&&String(item.id).startsWith("cd_"));
    if(!isDrink)return;
    const name=String(item.castName||itemCastName(item)||"\u4e0d\u660e");
    const key=String(item.castId||"name:"+name);
    if(!map[key])map[key]={name,p2000:0,p3000:0,other:{}};
    if(map[key].name==="\u4e0d\u660e"&&name!=="\u4e0d\u660e")map[key].name=name;
    const qty=Math.max(1,Number(item.qty||item.quantity)||1);
    const price=Math.max(0,Number(item.price)||0);
    totals.all+=qty;
    if(price===2000){
      map[key].p2000+=qty;
      totals.p2000+=qty;
    }else if(price===3000){
      map[key].p3000+=qty;
      totals.p3000+=qty;
    }else{
      map[key].other[price]=(map[key].other[price]||0)+qty;
      totals.other[price]=(totals.other[price]||0)+qty;
    }
  }));
  const rows=[["\u30ad\u30e3\u30b9\u30c8\u540d","2000\u5186","3000\u5186","\u305d\u306e\u4ed6\u91d1\u984d","\u5408\u8a08\u676f\u6570"]];
  Object.values(map).sort((a,b)=>a.name.localeCompare(b.name,"ja-JP")).forEach(row=>{
    const otherKeys=Object.keys(row.other).sort((a,b)=>Number(a)-Number(b));
    const otherCount=otherKeys.reduce((sum,price)=>sum+row.other[price],0);
    const other=otherKeys.length?otherKeys.map(price=>(Number(price)?String(Number(price))+"\u5186":"\u305d\u306e\u4ed6")+"("+row.other[price]+"\u676f)").join(" / "):"0\u676f";
    rows.push([row.name,row.p2000+"\u676f",row.p3000+"\u676f",other,(row.p2000+row.p3000+otherCount)+"\u676f"]);
  });
  if(rows.length>1){
    const totalOtherKeys=Object.keys(totals.other).sort((a,b)=>Number(a)-Number(b));
    const totalOther=totalOtherKeys.length?totalOtherKeys.map(price=>(Number(price)?String(Number(price))+"\u5186":"\u305d\u306e\u4ed6")+"("+totals.other[price]+"\u676f)").join(" / "):"0\u676f";
    rows.push(["\u5168\u30ad\u30e3\u30b9\u30c8\u5408\u8a08",totals.p2000+"\u676f",totals.p3000+"\u676f",totalOther,totals.all+"\u676f"]);
  }
  return rows;
}
function exportDrinkDataXLSX(){
  const rows=_castDrinkRowsFromHist(S.history||[]);
  if(rows.length<=1){alert("出力するキャストDrinkデータがありません");return;}
  const date=S.activeBizDay||getBizDate();
  _downloadXLSX(rows,"drink_data_"+date+".xlsx","Drink");
}
function exportAccountingDataXLSX(){
  const hist=S.history||[];
  if(!hist.length){alert("出力する会計データがありません");return;}
  const date=S.activeBizDay||getBizDate();
  _downloadXLSX(_accountingRowsFromHist(hist),"accounting_data_"+date+".xlsx","Accounting");
}
function exportSalesDataXLSX(){
  const rows=_salesDataRowsFromHist(S.history||[]);
  if(rows.length<=1){alert("出力する売上データがありません");return;}
  const date=S.activeBizDay||getBizDate();
  _downloadXLSX(rows,"sales_data_"+date+".xlsx","Sales",{columnWidths:_salesDataColumnWidths(rows)});
}

// ===== RECEIPT PRINT END =====

// 概算：指定延長分数でのコスト計算
function freeDrinkLabel(minutes,isExtension){
  if(isExtension===true)return "\u30d5\u30ea\u30fc\u30c9\u30ea\u30f3\u30af\uff08\u5ef6\u9577"+minutes+"\u5206\uff09";
  if(isExtension===false)return "\u30d5\u30ea\u30fc\u30c9\u30ea\u30f3\u30af\u3010\u6982\u7b97"+minutes+"\u5206\u3011";
  return minutes?"\u30d5\u30ea\u30fc\u30c9\u30ea\u30f3\u30af"+minutes+"\u5206":"\u30d5\u30ea\u30fc\u30c9\u30ea\u30f3\u30af0\u5186";
}
function isFreeDrinkItem(i){
  const id=String(i?.id||"");
  const label=String(i?.label||"");
  return !!(i?.isFreeDrink||id==="fd"||id==="fd_add"||id==="freedrink"||id.startsWith("fd_")||label.includes("\u30d5\u30ea\u30fc\u30c9\u30ea\u30f3\u30af"));
}
function hasFreeDrinkItem(s){return (s?.items||[]).some(isFreeDrinkItem);}
function freeDrinkPriceForMinutes(minutes){
  const m=Math.max(30,Number(minutes)||60);
  return Math.ceil(m/30)*1000;
}
function singleChargePrice(){
  const scOpt=(S.menus.options||[]).find(o=>o.id==="sc");
  return Number(scOpt?.price)||2000;
}
function extensionMinutesTotal(s){
  return (s?.items||[]).reduce((sum,i)=>sum+(i.isExtension&&Number(i.extMinutes)>0?Number(i.extMinutes):0),0);
}
function extensionSingleChargeCount(s){
  return (s?.items||[]).filter(i=>i.isExtension&&String(i.id||"").startsWith("sc_")).length;
}
function isSingleChargeExtensionEligible(s){
  const hasSC=(s?.items||[]).some(i=>String(i.label||"").includes("\u30b7\u30f3\u30b0\u30eb\u30c1\u30e3\u30fc\u30b8")&&!i.isExtension);
  const hasAddedGuests=(s?.items||[]).some(i=>i.isSet&&(i.addedGuests||0)>0);
  return !hasAddedGuests&&(s?.guests===1||hasSC);
}
function needsExtensionSingleCharge(s,addMinutes){
  if(!isSingleChargeExtensionEligible(s)||Number(addMinutes)<=0)return false;
  const before=extensionSingleChargeCount(s);
  const after=Math.ceil((extensionMinutesTotal(s)+Number(addMinutes))/60);
  return after>before;
}
function singleChargePriceForMinutes(minutes){
  return Number(minutes)>0?singleChargePrice():0;
}
function calcEstForMinutes(s,extraMinutes){
  const extraItems=[];
  if(extraMinutes>0){
const ext60=S.menus.extensions.find(e=>e.minutes===60);
const ext30=S.menus.extensions.find(e=>e.minutes===30);
if(extraMinutes===60&&ext60){
  extraItems.push({id:"est_ext",label:ext60.label,price:ext60.price,qty:s.guests,isExtension:true});
} else if(extraMinutes===30&&ext30){
  extraItems.push({id:"est_ext",label:ext30.label,price:ext30.price,qty:s.guests,isExtension:true});
} else {
  const base=ext30||ext60;
  if(base){
    const price=Math.round(base.price*(extraMinutes/base.minutes));
    extraItems.push({id:"est_ext",label:"延長"+extraMinutes+"分",price,qty:s.guests,isExtension:true});
  }
}
  }
  const roomType=sessionRoomType(s);
  const roomItem=roomType&&extraMinutes>0?roomChargeItemForMinutes(roomType,extraMinutes,s.guests,{isExtension:true,idPrefix:"estroom"}):null;
  if(roomItem){
    extraItems.push({...roomItem,id:"est_room"});
  }
  if(extraMinutes>0&&hasFreeDrinkItem(s)){
    extraItems.push({id:"est_fd",label:freeDrinkLabel(extraMinutes,false),price:freeDrinkPriceForMinutes(extraMinutes,s),qty:s.guests,isFreeDrink:true,freeDrinkMinutes:extraMinutes});
  }
  // SC: charge once per 60 extension minutes; 30+30 stays one charge.
  if(needsExtensionSingleCharge(s,extraMinutes)){
const scPrice=singleChargePriceForMinutes(extraMinutes);
if(scPrice>0)extraItems.push({id:"est_sc",label:"\u30b7\u30f3\u30b0\u30eb\u30c1\u30e3\u30fc\u30b8\uff08\u6982\u7b97"+extraMinutes+"\u5206\uff09",price:scPrice,qty:1});
  }
  const fake={...s,items:[...s.items,...extraItems.map((x,i)=>({...x,id:"estx_"+i}))]};
  return{...ct(fake),extraItems,extraMinutes,roomType,roomChargeMissing:!!(roomType&&extraMinutes>0&&!roomItem)};
}

function calcEst(){
  const s=S.sessions[at];if(!s)return{total:0,extraItems:[]};
  return calcEstForMinutes(s,estCustomMin||0);
}

function updateEstPreview(){
  const s=S.sessions[at];if(!s)return;
  const customEl=document.getElementById("est-custom-min");
  estCustomMin=customEl?Math.max(0,parseInt(customEl.value||"0",10)||0):0;
  const cur=ct(s);
  const r30=calcEstForMinutes(s,30);
  const r60=calcEstForMinutes(s,60);
  const rCustom=estCustomMin>0?calcEstForMinutes(s,estCustomMin):null;
  const el=document.getElementById("est-preview");if(!el)return;

  // 現在の明細ブロック
  function itemRows(items){
let h="";
items.forEach(i=>{
  const isDisc=i.isDiscount;
  const lb=i.qty>1?i.label+" ×"+i.qty:i.label;
  h+='<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0;color:'+(isDisc?"#ff6b6b":"#bbb")+'">'
    +'<span>'+lb+'</span><span style="color:'+(isDisc?"#ff6b6b":"#d4a017")+';white-space:nowrap;">'+(isDisc?"-":"")+'¥'+fmt(Math.abs(i.price*(i.qty||1)))+'</span></div>';
});
return h;
  }
  // 延長追加分のみの内訳
  function extRows(extraItems){
if(!extraItems||!extraItems.length)return "";
let h='<div style="margin-top:6px;padding:6px 8px;background:rgba(255,165,0,.08);border-radius:4px;border-left:2px solid rgba(255,165,0,.4);">'
  +'<div style="font-size:10px;color:#ffa500;letter-spacing:.08em;margin-bottom:3px;">延長追加分</div>';
extraItems.forEach(i=>{
  const lb=i.qty>1?i.label+" ×"+i.qty:i.label;
  h+='<div style="display:flex;justify-content:space-between;font-size:12px;padding:1px 0;color:#ffa500;">'
    +'<span>'+lb+'</span><span>¥'+fmt(i.price*(i.qty||1))+'</span></div>';
});
h+='</div>';
return h;
  }
  // 合計行
  function totalRow(result,label,col){
const hv=[...s.items,...(result.extraItems||[])].some(i=>i.isVipCharge);
return '<div style="margin-top:6px;padding:8px 0;border-top:1px solid rgba(255,255,255,.1);">'
  +'<div style="display:flex;justify-content:space-between;font-size:11px;color:#666;margin-bottom:2px;">'
  +'<span>税・SC ('+Math.round((result.rate||TAX_RATE)*100)+'%)</span><span>¥'+fmt(result.tax)+'</span></div>'
  +(result.discount>0?'<div style="display:flex;justify-content:space-between;font-size:11px;color:#ff6b6b;margin-bottom:2px;"><span>割引</span><span>-¥'+fmt(result.discount)+'</span></div>':"")
  +'<div style="display:flex;justify-content:space-between;align-items:baseline;">'
  +'<span style="font-size:12px;color:'+col+';">'+label+'</span>'
  +'<span style="font-size:18px;font-weight:700;color:'+col+';">¥'+fmt(result.total)+'</span>'
  +'</div></div>';
  }

  let h='<div style="border-top:1px solid rgba(255,255,255,.1);margin-top:14px;padding-top:14px;">';
  if(r30.roomChargeMissing)h+='<div style="padding:8px 10px;margin-bottom:10px;background:rgba(255,80,80,.08);border:1px solid rgba(255,80,80,.2);border-radius:5px;color:#ff6b6b;font-size:11px;">'+roomTypeLabel(r30.roomType)+'室料が未設定のため、室料を概算に含められません。</div>';
  // 現在のオーダー明細
  h+='<div style="margin-bottom:6px;"><div style="font-size:10px;color:#888;letter-spacing:.08em;margin-bottom:4px;">現在のオーダー</div>';
  h+=itemRows(s.items);
  h+=totalRow(cur,"現在の合計","#d4a017");
  h+='</div>';
  // +30分
  h+='<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.06);">';
  h+=extRows(r30.extraItems);
  h+=totalRow(r30,"+30分延長後","#ffa500");
  h+='</div>';
  // +60分
  h+='<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.06);">';
  h+=extRows(r60.extraItems);
  h+=totalRow(r60,"+60分延長後","#ffd700");
  h+='</div>';
  // カスタム
  if(rCustom&&estCustomMin!==30&&estCustomMin!==60){
h+='<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.06);">';
h+=extRows(rCustom.extraItems);
h+=totalRow(rCustom,"+"+estCustomMin+"分延長後","#a78bfa");
h+='</div>';
  }
  h+='</div>';
  el.innerHTML=h;
}


function rModal(){
  const c=document.getElementById("md");if(!c)return;
  if(!md){c.innerHTML="";return;}
  const s=at?S.sessions[at]:null;
  let h="";
  const isBig=DEV!=="mobile";

  if(md==="firebaseLock"){
h='<div class="mo" onclick="event.stopPropagation()"><div class="mb" onclick="event.stopPropagation()" style="max-width:430px;text-align:center;">'
  +'<div style="font-size:30px;margin-bottom:10px;">!</div>'
  +'<h3 style="font-size:17px;color:#ff6b6b;margin-bottom:12px;">Firebase接続確認中</h3>'
  +'<div style="font-size:13px;color:#aaa;line-height:1.8;margin-bottom:18px;text-align:left;">'+(window._firebaseLockMessage||"会計データ保護のため、保存系操作を停止しています。")+'</div>'
  +(window._fbConnected===true?'<button class="btn gbg" onclick="reloadForFirebaseResume()" style="width:100%;padding:13px;font-size:15px;font-weight:700;border-radius:6px;touch-action:manipulation;">最新化して再開</button>':'<button class="btn" onclick="location.reload()" style="width:100%;padding:13px;font-size:15px;font-weight:700;border-radius:6px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);color:#ddd;touch-action:manipulation;">接続を再確認</button>')
  +'</div></div>';
  }
  else if(md==="sessionConflict"){
h='<div class="mo" onclick="event.stopPropagation()"><div class="mb" onclick="event.stopPropagation()" style="max-width:420px;text-align:center;">'
  +'<div style="font-size:30px;margin-bottom:10px;">!</div>'
  +'<h3 style="font-size:17px;color:#ff6b6b;margin-bottom:12px;">保存を停止しました</h3>'
  +'<div style="font-size:13px;color:#aaa;line-height:1.8;margin-bottom:18px;text-align:left;">'+(window._sessionConflictMessage||"このテーブルは他端末で更新されています。最新状態を確認してください。")+'</div>'
  +'<button class="btn gbg" onclick="closeSessionConflict()" style="width:100%;padding:13px;font-size:15px;font-weight:700;border-radius:6px;touch-action:manipulation;">再読み込みして最新化</button>'
  +'</div></div>';
  }
  else if(md==="restore-conflicts"){
const byDate=window._pendingRestoreByDate||{};
const conflicts=Object.entries(byDate).filter(([,e])=>e.length>1).sort((a,b)=>b[0].localeCompare(a[0]));
let cHtml='';
conflicts.forEach(([date,entries])=>{
  cHtml+='<div style="margin-bottom:14px;padding:12px;background:rgba(56,189,248,.04);border:1px solid rgba(56,189,248,.15);border-radius:6px;">';
  cHtml+='<div style="font-size:13px;font-weight:700;color:#e8dcc8;margin-bottom:8px;">'+date+'</div>';
  entries.forEach(([bkKey,bk])=>{
    const isEdited=!!bk.edited;
    const isChosen=_rcChoices[date]===bkKey;
    const saved=new Date(bk.ts).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
    const histCount=(bk.history||[]).length;
    const sales=(bk.history||[]).reduce((a,h)=>a+(h.total||0),0);
    cHtml+='<button class="btn" data-date="'+date+'" data-bkkey="'+bkKey+'" onclick="_rcChoices[this.dataset.date]=this.dataset.bkkey;rModal()" style="width:100%;text-align:left;padding:10px 12px;margin-bottom:6px;border-radius:5px;background:'+(isChosen?"rgba(56,189,248,.18)":"rgba(255,255,255,.03)")+';border:2px solid '+(isChosen?"#38bdf8":"rgba(255,255,255,.08)")+';color:'+(isChosen?"#38bdf8":"#aaa")+';touch-action:manipulation;cursor:pointer;">'
      +(isChosen?'<span style="font-size:13px;margin-right:6px;">✓</span>':'<span style="font-size:13px;margin-right:6px;opacity:.3;">○</span>')
      +(isEdited?'<span style="font-size:10px;font-weight:700;background:rgba(56,189,248,.2);color:#38bdf8;padding:1px 6px;border-radius:3px;margin-right:6px;">編集済</span>':'<span style="font-size:10px;background:rgba(255,255,255,.08);color:#888;padding:1px 6px;border-radius:3px;margin-right:6px;">元データ</span>')
      +'会計 '+histCount+'件 &nbsp;·&nbsp; ¥'+Number(sales).toLocaleString("ja-JP")+'<span style="font-size:10px;color:#555;margin-left:8px;">保存: '+saved+'</span>'
      +'</button>';
  });
  cHtml+='</div>';
});
h='<div class="mo" onclick="event.stopPropagation()"><div class="mb" onclick="event.stopPropagation()" style="max-width:500px;max-height:90vh;overflow-y:auto;">'
  +'<h3 style="margin-bottom:4px;font-size:16px;color:#38bdf8;">全件復旧 — データ選択</h3>'
  +'<div style="font-size:12px;color:#666;margin-bottom:14px;">同じ営業日のバックアップが複数あります。各日付で復旧に使用するデータを選択してください。</div>'
  +cHtml
  +'<button class="btn gbg" onclick="execRestoreAllWithChoices()" style="width:100%;padding:13px;font-weight:700;font-size:15px;border-radius:6px;touch-action:manipulation;margin-top:4px;">選択したデータで全件復旧</button>'
  +'<button class="btn" onclick="closeM()" style="width:100%;margin-top:8px;padding:9px;font-size:13px;color:#555;background:none;touch-action:manipulation;">キャンセル</button>'
  +'</div></div>';
  }
  else if(md==="deleteSession"&&s){
const tl=S.tables.find(t=>t.id===at)?.label||at;
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:340px;text-align:center;">'
  +'<div style="font-size:30px;margin-bottom:10px;">⚠️</div>'
  +'<h3 style="font-size:16px;color:#ff4444;margin-bottom:14px;">テーブル削除</h3>'
  +'<div style="font-size:14px;color:#888;margin-bottom:8px;">本当に</div>'
  +'<div style="font-size:22px;font-weight:700;color:#ff4444;background:rgba(255,68,68,.12);border:1px solid rgba(255,68,68,.3);border-radius:6px;padding:8px 20px;margin-bottom:8px;letter-spacing:.05em;">'+tl+'</div>'
  +'<div style="font-size:14px;color:#888;margin-bottom:6px;">を削除しますか？</div>'
  +'<div style="font-size:11px;color:#ff4444;margin-bottom:22px;font-weight:700;">この操作は取り消せません</div>'
  +'<div style="display:flex;gap:8px;">'
  +'<button class="btn" onclick="closeM()" style="flex:1;padding:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:6px;font-size:14px;touch-action:manipulation;">キャンセル</button>'
  +'<button class="btn" onclick="execDeleteSession()" style="flex:1;padding:12px;background:rgba(255,30,30,.18);border:1px solid rgba(255,30,30,.4);color:#ff4444;border-radius:6px;font-size:14px;font-weight:700;touch-action:manipulation;">削除する</button>'
  +'</div></div></div>';
  }
  else if(md==="opsMenu"){
const loLbl=S.loMode?"LO（オン中）":"LO";
const loCol=S.loMode?"rgba(255,68,68,.18)":"rgba(255,255,255,.05)";
const loBdr=S.loMode?"rgba(255,68,68,.35)":"rgba(255,255,255,.1)";
const loTxt=S.loMode?"#ff4444":"#e8dcc8";
const prLbl=priceHidden?"¥表示（非表示中）":"¥表示";
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:320px;">'
  +'<h3 style="font-size:15px;color:#d4a017;margin-bottom:16px;">営業メニュー</h3>'
  +'<button class="btn" onclick="closeM();toggleLO()" style="width:100%;padding:14px;margin-bottom:10px;background:'+loCol+';border:1px solid '+loBdr+';color:'+loTxt+';border-radius:6px;font-size:15px;font-weight:700;text-align:left;touch-action:manipulation;">'+loLbl+'</button>'
  +'<button class="btn" onclick="closeM();togglePriceHide()" style="width:100%;padding:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#e8dcc8;border-radius:6px;font-size:15px;font-weight:700;text-align:left;touch-action:manipulation;">'+prLbl+'</button>'
  +'<button class="btn" onclick="closeM()" style="width:100%;margin-top:12px;padding:10px;background:none;border:none;color:#555;font-size:13px;touch-action:manipulation;">閉じる</button>'
  +'</div></div>';
  }
  else if(md==="mgmtMenu"){
const isAdm=sessionStorage.getItem("genesis_admin")==="1";
const admLbl=isAdm?"管理モード（オン中）":"管理モード";
const admCol=isAdm?"rgba(212,160,23,.18)":"rgba(255,255,255,.05)";
const admBdr=isAdm?"rgba(212,160,23,.35)":"rgba(255,255,255,.1)";
const admTxt=isAdm?"#d4a017":"#e8dcc8";
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:320px;">'
  +'<h3 style="font-size:15px;color:#ff6b6b;margin-bottom:16px;">管理メニュー</h3>'
  +'<button class="btn" onclick="closeM();toggleAdminMode()" style="width:100%;padding:14px;margin-bottom:10px;background:'+admCol+';border:1px solid '+admBdr+';color:'+admTxt+';border-radius:6px;font-size:15px;font-weight:700;text-align:left;touch-action:manipulation;">'+admLbl+'</button>'
  +(S.activeBizDay?'<button class="btn" onclick="closeM();om(\'endBizDay\')" style="width:100%;padding:14px;background:rgba(255,80,80,.12);border:1px solid rgba(255,80,80,.3);color:#ff6b6b;border-radius:6px;font-size:15px;font-weight:700;text-align:left;touch-action:manipulation;">営業終了</button>':"")
  +'<button class="btn" onclick="closeM()" style="width:100%;margin-top:12px;padding:10px;background:none;border:none;color:#555;font-size:13px;touch-action:manipulation;">閉じる</button>'
  +'</div></div>';
  }
  else if(md==="loModeOn"){
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:340px;text-align:center;">'
  +'<h3 style="font-size:17px;color:#ff4444;margin-bottom:16px;">ラストオーダーモード</h3>'
  +'<div style="font-size:14px;color:#aaa;margin-bottom:22px;">ラストオーダーモードをオンにしますか？<br><span style="font-size:12px;color:#666;">全テーブルにLO未が表示されます</span></div>'
  +'<div style="display:flex;gap:8px;">'
  +'<button class="btn" onclick="closeM()" style="flex:1;padding:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:6px;font-size:14px;touch-action:manipulation;">キャンセル</button>'
  +'<button class="btn" onclick="execLOStart()" style="flex:1;padding:12px;background:rgba(255,68,68,.15);border:1px solid rgba(255,68,68,.35);color:#ff4444;border-radius:6px;font-size:14px;font-weight:700;touch-action:manipulation;">オンにする</button>'
  +'</div></div></div>';
  }
  else if(md==="loList"){
const activeTbls=S.tables.filter(t=>S.sessions[t.id]);
const pending=activeTbls.filter(t=>S.loStatus[t.id]!=="done");
const done=activeTbls.filter(t=>S.loStatus[t.id]==="done");
let tblHtml='';
pending.forEach(t=>{
  tblHtml+='<button class="btn" data-tid="'+t.id+'" onclick="window._loTableId=this.dataset.tid;md=\'loConfirm\';rModal()" style="width:100%;text-align:left;padding:10px 14px;margin-bottom:6px;background:rgba(255,68,68,.08);border:1px solid rgba(255,68,68,.2);color:#ff4444;border-radius:6px;font-size:15px;font-weight:700;touch-action:manipulation;">'+t.label+'　<span style="font-size:12px;font-weight:400;color:#ff6666;">LO未</span></button>';
});
if(!pending.length)tblHtml='<div style="font-size:13px;color:#4ade80;padding:12px 0;text-align:center;">全テーブルのLOが完了しています</div>';
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:380px;">'
  +'<h3 style="font-size:16px;color:#ff4444;margin-bottom:4px;">LO未テーブル一覧</h3>'
  +'<div style="font-size:12px;color:#666;margin-bottom:14px;">LO未: '+pending.length+'卓　LO完: '+done.length+'卓</div>'
  +tblHtml
  +'<div style="margin-top:14px;display:flex;gap:8px;">'
  +(done.length?'<button class="btn" onclick="md=\'loFix\';rModal()" style="flex:1;padding:10px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.2);color:#38bdf8;border-radius:6px;font-size:13px;touch-action:manipulation;">LO修正</button>':"")
  +'<button class="btn" onclick="execLOEnd()" style="flex:1;padding:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#666;border-radius:6px;font-size:13px;touch-action:manipulation;">LO終了</button>'
  +'<button class="btn" onclick="closeM()" style="flex:1;padding:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:6px;font-size:13px;touch-action:manipulation;">閉じる</button>'
  +'</div></div></div>';
  }
  else if(md==="loConfirm"){
const tbl=S.tables.find(t=>t.id===window._loTableId);
const tl=tbl?tbl.label:window._loTableId;
h='<div class="mo" onclick="md=\'loList\';rModal()"><div class="mb" onclick="event.stopPropagation()" style="max-width:340px;text-align:center;">'
  +'<div style="font-size:14px;color:#888;margin-bottom:8px;">ラストオーダー完了確認</div>'
  +'<div style="font-size:22px;font-weight:700;color:#d4a017;background:rgba(212,160,23,.1);border:1px solid rgba(212,160,23,.25);border-radius:6px;padding:8px 20px;margin-bottom:12px;">'+tl+'</div>'
  +'<div style="font-size:14px;color:#aaa;margin-bottom:22px;">のラストオーダーを完了しますか？</div>'
  +'<div style="display:flex;gap:8px;">'
  +'<button class="btn" onclick="md=\'loList\';rModal()" style="flex:1;padding:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:6px;font-size:14px;touch-action:manipulation;">いいえ</button>'
  +'<button class="btn" onclick="execLOComplete()" style="flex:1;padding:12px;background:rgba(56,189,248,.15);border:1px solid rgba(56,189,248,.3);color:#38bdf8;border-radius:6px;font-size:14px;font-weight:700;touch-action:manipulation;">はい</button>'
  +'</div></div></div>';
  }
  else if(md==="loFix"){
const activeTbls=S.tables.filter(t=>S.sessions[t.id]);
const done=activeTbls.filter(t=>S.loStatus[t.id]==="done");
let tblHtml='';
done.forEach(t=>{
  tblHtml+='<button class="btn" data-tid="'+t.id+'" onclick="execLOUndone(this.dataset.tid)" style="width:100%;text-align:left;padding:10px 14px;margin-bottom:6px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.2);color:#38bdf8;border-radius:6px;font-size:15px;font-weight:700;touch-action:manipulation;">'+t.label+'　<span style="font-size:12px;font-weight:400;">LO完 → LO未に戻す</span></button>';
});
if(!done.length)tblHtml='<div style="font-size:13px;color:#666;padding:12px 0;text-align:center;">LO完了のテーブルはありません</div>';
h='<div class="mo" onclick="md=\'loList\';rModal()"><div class="mb" onclick="event.stopPropagation()" style="max-width:380px;">'
  +'<h3 style="font-size:16px;color:#38bdf8;margin-bottom:14px;">LO修正</h3>'
  +tblHtml
  +'<button class="btn" onclick="md=\'loList\';rModal()" style="width:100%;margin-top:10px;padding:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:6px;font-size:13px;touch-action:manipulation;">戻る</button>'
  +'</div></div>';
  }
  else if(md==="confirm-del"){
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:320px;text-align:center;">'
  +'<div style="font-size:32px;margin-bottom:10px;">⚠️</div>'
  +'<h3 style="font-size:16px;color:#ff6b6b;margin-bottom:10px;">削除の確認</h3>'
  +'<div style="font-size:13px;color:#e8dcc8;margin-bottom:6px;font-weight:600;">「'+(window._delItemLabel||'このアイテム')+'」</div>'
  +'<div style="font-size:13px;color:#888;margin-bottom:22px;">を削除しますか？</div>'
  +'<div style="display:flex;gap:8px;">'
  +'<button class="btn" onclick="closeM()" style="flex:1;padding:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:6px;font-size:14px;touch-action:manipulation;">キャンセル</button>'
  +'<button class="btn" onclick="execDelItem()" style="flex:1;padding:12px;background:rgba(255,80,80,.15);border:1px solid rgba(255,80,80,.3);color:#ff6b6b;border-radius:6px;font-size:14px;font-weight:700;touch-action:manipulation;">削除する</button>'
  +'</div></div></div>';
  }
  else if(md==="co"&&s){
// ステップ1：明細確認
const{subtotal,discount,tax,total,rate}=ct(s);const hv=(s?.items||[]).some(i=>i.isVipCharge);
let rows="";
[...s.items].forEach(i=>{const isDisc=i.isDiscount;rows+='<div class="ir"><span style="color:'+(isDisc?"#ff6b6b":"#bbb")+'">'+(i.qty>1?i.label+" × "+i.qty:i.label)+'</span><span style="color:'+(isDisc?"#ff6b6b":"#d4a017")+'">'+(isDisc?"-":"")+pAmt(Math.abs(i.price*(i.qty||1)))+'</span></div>';});
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:460px;">'
  +'<h3 style="margin-bottom:16px;font-size:16px;color:#d4a017;">会計</h3>'
  +rows
  +'<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.1);">'
  +'<div class="ir"><span style="font-size:12px;color:#888;">小計</span><span>'+pAmt(subtotal)+'</span></div>'
  +(discount>0?'<div class="ir"><span style="font-size:12px;color:#ff6b6b;">割引</span><span style="color:#ff6b6b;">-'+pAmt(discount)+'</span></div>':"")
  +'<div class="ir"><span style="font-size:12px;color:#888;">tax+SC ('+Math.round((rate||TAX_RATE)*100)+'%)</span><span>'+pAmt(tax)+'</span></div>'
  +'<div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;"><span style="font-size:14px;font-weight:700;">合計</span><span style="font-size:24px;font-weight:700;color:#d4a017;">'+pAmt(total)+'</span></div>'
  +'</div>'
  +'<div style="display:flex;gap:6px;margin-top:16px;">'
  +'<button class="btn" onclick="printCheckoutGuest()" style="flex:1;padding:11px 6px;font-size:12px;font-weight:700;border-radius:6px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.25);color:#38bdf8;touch-action:manipulation;">🖨 ゲスト用</button>'
  +'<button class="btn" onclick="printCheckout()" style="flex:1;padding:11px 6px;font-size:12px;font-weight:700;border-radius:6px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);color:#ddd;touch-action:manipulation;">🖨 店舗用</button>'
  +'<button class="btn gbg" onclick="md=\'co2\';rModal()" style="flex:2;padding:11px 8px;font-size:14px;font-weight:700;border-radius:6px;touch-action:manipulation;">会計終了 →</button>'
  +'</div>'
  +'<button class="btn" onclick="closeM()" style="width:100%;margin-top:8px;padding:9px;font-size:13px;color:#555;background:none;">キャンセル</button>'
  +'</div></div>';
  }
  else if(md==="co2"&&s){
const{total}=ct(s);
// splitsが空なら初期化（合計全額・現金）
if(!coState.splits||coState.splits.length===0)
  coState.splits=[{method:"cash",amount:total}];
const splits=coState.splits;
const splitTotal=splits.reduce((a,sp)=>a+(sp.amount||0),0);
// total=0のときは無条件でremaining=0扱い
const remaining=total===0?0:total-splitTotal;
let splitRows="";
splits.forEach((sp,i)=>{
  splitRows+='<div style="display:flex;gap:6px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">';
  splitRows+='<button class="btn" onclick="spSetMethod('+i+',\'cash\')" style="width:52px;padding:8px 4px;border-radius:6px;font-size:11px;font-weight:700;background:'+(sp.method==="cash"?"linear-gradient(135deg,#b8960c,#e8c84a)":"rgba(255,255,255,.06)")+';border:2px solid '+(sp.method==="cash"?"#b8960c":"rgba(255,255,255,.1)")+';color:'+(sp.method==="cash"?"#1a1200":"#666")+';touch-action:manipulation;">現金</button>';
  splitRows+='<button class="btn" onclick="spSetMethod('+i+',\'card\')" style="width:52px;padding:8px 4px;border-radius:6px;font-size:11px;font-weight:700;background:'+(sp.method==="card"?"rgba(56,189,248,.2)":"rgba(255,255,255,.06)")+';border:2px solid '+(sp.method==="card"?"#38bdf8":"rgba(255,255,255,.1)")+';color:'+(sp.method==="card"?"#38bdf8":"#666")+';touch-action:manipulation;">カード</button>';
  splitRows+='<input type="number" inputmode="numeric" class="ip sp-amt" value="'+sp.amount+'" style="width:110px;font-size:16px;font-weight:700;" oninput="spUpdateAmt('+i+',this.value)"/>';
  if(splits.length>1)splitRows+='<button class="btn" onclick="spRemove('+i+')" style="width:28px;height:28px;border-radius:50%;background:rgba(255,80,80,.15);color:#ff6b6b;font-size:14px;touch-action:manipulation;">×</button>';
  splitRows+='</div>';
});
h='<div class="mo" onclick="event.stopPropagation()"><div class="mb" onclick="event.stopPropagation()" style="max-width:460px;">'
  +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">'
  +'<button class="btn" onclick="md=\'co\';coState.splits=[];rModal()" style="padding:6px 10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:4px;font-size:13px;touch-action:manipulation;">← 戻る</button>'
  +'<h3 style="font-size:16px;color:#d4a017;margin:0;">会計終了</h3>'
  +'</div>'
  +'<div style="text-align:center;padding:12px;margin-bottom:16px;border:1px solid rgba(212,160,23,.2);border-radius:8px;background:rgba(212,160,23,.06);">'
  +'<div style="font-size:11px;color:#888;margin-bottom:2px;">合計金額</div>'
  +'<div style="font-size:28px;font-weight:700;color:#d4a017;font-family:monospace;">'+pAmt(total)+'</div>'
  +'</div>'
  +'<div class="st" style="margin-bottom:8px;">支払い内訳 <span style="font-size:11px;color:#666;font-weight:400;">現=現金 カ=カード</span></div>'
  +'<div id="split-rows">'+splitRows+'</div>'
  +'<button class="btn" onclick="spAdd('+total+')" style="width:100%;padding:8px;margin-bottom:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:4px;font-size:13px;touch-action:manipulation;">＋ 支払いを分ける</button>'
  // 残額表示：常にdivを出しておき中身をspUpdateAmtで更新する
  +'<div id="sp-remain" style="text-align:right;font-size:14px;font-weight:700;margin-bottom:10px;padding:8px 12px;border-radius:6px;'
    +(remaining>0
      ?'color:#ff6b6b;background:rgba(255,80,80,.08);border:1px solid rgba(255,80,80,.2);">残り ¥'+fmt(remaining)
      :remaining<0
        ?'color:#ff6b6b;background:rgba(255,80,80,.08);border:1px solid rgba(255,80,80,.2);">超過 ¥'+fmt(-remaining)
        :'color:#4ade80;background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.2);">✓ 過不足なし')
  +'</div>'
  // 確定ボタン：合計が一致している場合のみ活性
  +(remaining===0
    ?'<button id="sp-confirm-btn" class="btn gbg" onclick="checkout()" style="width:100%;padding:14px;font-size:16px;font-weight:700;border-radius:8px;touch-action:manipulation;">✓ 会計終了を確定する</button>'
    :'<button id="sp-confirm-btn" class="btn" disabled style="width:100%;padding:14px;font-size:16px;font-weight:700;border-radius:8px;opacity:.4;cursor:not-allowed;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);color:#666;">金額を合わせてください</button>')
  +'</div></div>';
  }
  else if(md==="disc"&&s){
if(!window._discTarget)window._discTarget='subtotal';
const dt=window._discTarget;
const selSt='padding:8px 16px;border-radius:6px;font-size:13px;font-weight:700;touch-action:manipulation;';
const selA='background:rgba(255,80,80,.25);border:2px solid #ff6b6b;color:#ff6b6b;';
const selI='background:rgba(255,255,255,.05);border:2px solid rgba(255,255,255,.1);color:#555;';
let discs="";
(S.menus.discounts||[]).forEach(d=>{discs+='<button class="btn" data-did="'+d.id+'" onclick="addDiscount(this.dataset.did)" style="padding:12px 16px;text-align:left;background:rgba(255,80,80,.08);border:1px solid rgba(255,80,80,.2);color:#ff6b6b;border-radius:6px;font-size:14px;width:100%;margin-bottom:8px;touch-action:manipulation;">'+d.label+(d.type==="percent"?" ("+d.value+"%)":"")+'</button>';});
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:400px;">'
  +'<h3 style="margin-bottom:12px;font-size:16px;color:#ff6b6b;">割引</h3>'
  // 適用済み割引一覧
  +(()=>{const dItems=(s.items||[]).filter(i=>i.isDiscount);if(!dItems.length)return'';return'<div style="margin-bottom:12px;"><div style="font-size:11px;color:#888;margin-bottom:6px;">適用済み割引</div>'+dItems.map(i=>'<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:rgba(255,80,80,.06);border:1px solid rgba(255,80,80,.15);border-radius:6px;margin-bottom:5px;"><span style="font-size:13px;color:#ff8888;flex:1;">'+i.label+'</span><span style="font-size:13px;color:#ff6b6b;margin:0 10px;">-¥'+fmt(Math.abs(i.price*(i.qty||1)))+'</span><button class="btn" data-iid="'+i.id+'" onclick="remItemDetail(this.dataset.iid)" style="width:26px;height:26px;border-radius:50%;background:rgba(255,80,80,.15);color:#ff6b6b;font-size:14px;flex-shrink:0;touch-action:manipulation;">×</button></div>').join('')+'</div>';})()
  +'<div style="margin-bottom:14px;">'
  +'<div style="font-size:11px;color:#888;margin-bottom:6px;">割引対象</div>'
  +'<div style="display:flex;gap:8px;">'
  +'<button class="btn" onclick="window._discTarget=\'subtotal\';rModal()" style="'+selSt+(dt==='subtotal'?selA:selI)+'flex:1;">小計から</button>'
  +'<button class="btn" onclick="window._discTarget=\'total\';rModal()" style="'+selSt+(dt==='total'?selA:selI)+'flex:1;">合計から</button>'
  +'</div>'
  +(dt==='total'?'<div style="font-size:10px;color:#888;margin-top:5px;">※ 税・SC計算後の合計金額から割引します</div>':'<div style="font-size:10px;color:#888;margin-top:5px;">※ 税・SC計算前の小計から割引します</div>')
  +'</div>'
  +discs
  +'<div style="margin-bottom:8px;"><div class="st" style="margin-bottom:6px;">金額を直接入力</div>'
  +'<div style="display:flex;gap:8px;">'
  +'<input type="number" id="disc-custom" inputmode="numeric" pattern="[0-9]*" class="ip" placeholder="割引金額" style="flex:1;" />'
  +'<button class="btn" onclick="addCustomDiscount()" style="padding:8px 16px;background:rgba(255,80,80,.15);border:1px solid rgba(255,80,80,.3);color:#ff6b6b;border-radius:4px;font-weight:600;font-size:14px;white-space:nowrap;touch-action:manipulation;">適用</button>'
  +'</div></div>'
  +'<button class="btn" onclick="closeM()" style="margin-top:8px;font-size:12px;color:#555;background:none;width:100%;">キャンセル</button>'
  +'</div></div>';
  }
  else if(md==="cu"){
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:360px;">'
  +'<h3 style="margin-bottom:16px;font-size:16px;color:#aaa;">カスタム金額</h3>'
  +'<div class="st" style="margin-bottom:6px;">品名（任意）</div>'
  +'<input class="ip" id="cu-label" placeholder="例：サービス料" autocomplete="off" style="margin-bottom:12px;" />'
  +'<div class="st" style="margin-bottom:6px;">金額 *</div>'
  +'<input type="number" inputmode="numeric" class="ip" id="cu-price" inputmode="numeric" pattern="[0-9]*" placeholder="例：5000" style="margin-bottom:16px;" />'
  +'<button class="btn gbg" onclick="addCustom()" style="width:100%;padding:11px;font-weight:700;font-size:14px;border-radius:4px;touch-action:manipulation;">追加する</button>'
  +'<button class="btn" onclick="closeM()" style="width:100%;margin-top:8px;padding:9px;font-size:13px;color:#555;background:none;">キャンセル</button>'
  +'</div></div>';
  }
  else if(md==="gcu"){
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:360px;">'
  +'<h3 style="margin-bottom:16px;font-size:16px;color:#38bdf8;">カスタム金額（ゲスト）</h3>'
  +'<div class="st" style="margin-bottom:6px;">品名（任意）</div>'
  +'<input class="ip" id="gcu-label" placeholder="例：サービス料" autocomplete="off" style="margin-bottom:12px;" />'
  +'<div class="st" style="margin-bottom:6px;">金額 *</div>'
  +'<input type="number" inputmode="numeric" class="ip" id="gcu-price" pattern="[0-9]*" placeholder="例：5000" style="margin-bottom:16px;" />'
  +'<button class="btn" onclick="addGuestCustom()" style="width:100%;padding:11px;font-weight:700;font-size:14px;border-radius:4px;background:rgba(56,189,248,.2);border:1px solid rgba(56,189,248,.4);color:#38bdf8;touch-action:manipulation;">追加する</button>'
  +'<button class="btn" onclick="closeM()" style="width:100%;margin-top:8px;padding:9px;font-size:13px;color:#555;background:none;">キャンセル</button>'
  +'</div></div>';
  }
  else if(md==="reduce-guests"&&s){
let gbs="";
for(let n=s.guests-1;n>=1;n--){
  gbs+='<button class="btn" onclick="reduceGuests('+n+')" style="width:56px;height:56px;border-radius:6px;font-weight:700;font-size:22px;background:rgba(56,189,248,.1);border:1px solid rgba(56,189,248,.3);color:#38bdf8;touch-action:manipulation;">'+n+'</button>';
}
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:380px;">'
  +'<h3 style="margin-bottom:4px;font-size:16px;color:#38bdf8;">人数削減</h3>'
  +'<div style="font-size:12px;color:#666;margin-bottom:16px;">現在 '+s.guests+'名 → 削減後の人数を選択（既存明細は変更されません）</div>'
  +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">'+gbs+'</div>'
  +'<button class="btn" onclick="closeM()" style="width:100%;padding:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#888;border-radius:4px;font-size:13px;">キャンセル</button>'
  +'</div></div>';
  }
  else if(md==="add-set"&&s){
// 追加人数の状態（nmi流用せず専用変数）
const addN=window._addSetN||1;
let gbs="";
[1,2,3,4,5,6].forEach(n=>{
  gbs+='<button class="btn" data-n="'+n+'" onclick="window._addSetN='+n+';rModal()" style="width:48px;height:48px;border-radius:6px;font-weight:700;font-size:18px;background:'+(addN===n?"linear-gradient(135deg,#b8960c,#e8c84a)":"rgba(255,255,255,.06)")+';border:2px solid '+(addN===n?"#b8960c":"rgba(255,255,255,.1)")+';color:'+(addN===n?"#1a1200":"#e8dcc8")+';touch-action:manipulation;">'+n+'</button>';
});
let setList="";
const _allSets=[...(S.menus.normalSets||[]).map(s=>({...s,_cat:"通常"})),...(S.menus.sets||[]).map(s=>({...s,_cat:"特別"}))];
_allSets.forEach(sm=>{
  setList+='<button class="btn" data-sid="'+sm.id+'" onclick="addSetToSession(this.dataset.sid,window._addSetN||1)" style="text-align:left;padding:12px 14px;border-radius:6px;background:rgba(212,160,23,.1);border:1px solid rgba(212,160,23,.3);color:#e8dcc8;display:flex;justify-content:space-between;width:100%;margin-bottom:8px;touch-action:manipulation;">'
    +'<span style="font-size:14px;">'+sm.label+'<span style="font-size:10px;color:#888;margin-left:6px;">'+sm._cat+'</span></span>'
    +'<span style="color:#d4a017;white-space:nowrap;">¥'+fmt(sm.price*addN)+' ('+addN+'名)</span>'
    +'</button>';
});
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:440px;">'
  +'<h3 style="margin-bottom:4px;font-size:16px;color:#d4a017;">セット追加</h3>'
  +'<div style="font-size:12px;color:#666;margin-bottom:14px;">現在 '+s.guests+'名 → 追加人数を選んでセットを選択</div>'
  +'<div class="st" style="margin-bottom:8px;">追加人数</div>'
  +'<div style="display:flex;gap:8px;margin-bottom:16px;">'+gbs+'</div>'
  +'<div class="st" style="margin-bottom:8px;">セットメニュー</div>'
  +setList
  +'<button class="btn" onclick="window._addSetN=1;closeM()" style="margin-top:8px;width:100%;padding:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#888;border-radius:4px;font-size:13px;">キャンセル</button>'
  +'</div></div>';
  }
  else if(md==="add-hon"&&s){
// 後から本指名追加
const curHon=(s.honShimeis||[]);
let cb="";
sc().forEach(c=>{
  const already=(s?.items||[]).some(i=>i.isHonShimei&&i.castId===c.id);
  cb+='<button class="btn" '+(already?"disabled":"")+' data-cid="'+c.id+'" onclick="addHonShimeiToSession(parseInt(this.dataset.cid))" style="padding:12px 8px;background:'+(already?"rgba(212,160,23,.05)":"rgba(212,160,23,.12)")+';border:1px solid '+(already?"rgba(212,160,23,.15)":"rgba(212,160,23,.35)")+';color:'+(already?"#555":"#d4a017")+';border-radius:6px;font-size:14px;text-align:center;cursor:'+(already?"default":"pointer")+';">'+(already?"✓ ":"")+c.name+'<div style="font-size:10px;margin-top:2px;opacity:.6;">'+(already?"追加済み":"¥"+fmt(HON_SHIMEI_PRICE))+'</div></button>';
});
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:500px;">'
  +'<h3 style="margin-bottom:4px;font-size:16px;color:#d4a017;">本指名を追加</h3>'
  +'<div style="font-size:12px;color:#666;margin-bottom:16px;">¥'+fmt(HON_SHIMEI_PRICE)+'/名</div>'
  +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;max-height:50vh;overflow-y:auto;">'+cb+'</div>'
  +'<button class="btn" onclick="closeM()" style="margin-top:16px;width:100%;padding:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#888;border-radius:4px;font-size:13px;">閉じる</button>'
  +'</div></div>';
  }
  else if(md==="cd"){
// キャスト選択：大型グリッドUI（指名メニューと同じスタイル）
let cb="";
const onIdsCD=getOndutyIds();sc().filter(c=>onIdsCD.has(c.id)).forEach(c=>{
  const sel=cdc===c.id;
  cb+='<button class="btn" data-cid="'+c.id+'" onclick="scc(parseInt(this.dataset.cid))" style="padding:16px 8px;background:'+(sel?"rgba(124,77,255,.3)":"rgba(124,77,255,.1)")+';border:1px solid '+(sel?"#7c4dff":"rgba(124,77,255,.3)")+';color:'+(sel?"#e0cfff":"#a78bfa")+';border-radius:8px;font-size:15px;font-weight:600;text-align:center;touch-action:manipulation;">'
    +(sel?"✓ ":"")+c.name
    +'</button>';
});
let db2="";
S.menus.castDrinks.forEach(d=>{
  db2+='<button class="btn" data-did="'+d.id+'" onclick="addCD('+cdc+',this.dataset.did)" style="padding:16px;text-align:center;background:rgba(124,77,255,.1);border:1px solid rgba(124,77,255,.25);color:#a78bfa;border-radius:8px;font-size:15px;font-weight:600;width:100%;margin-bottom:10px;touch-action:manipulation;">'+d.label+'</button>';
});
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:500px;">'
  +'<h3 style="margin-bottom:16px;font-size:16px;color:#d4a017;">キャストドリンク</h3>'
  +(cds===0
    ?'<div class="st" style="margin-bottom:10px;">キャストを選択</div>'
     +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;max-height:55vh;overflow-y:auto;">'+cb+'</div>'
    :'<div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:14px;padding:6px 14px;background:rgba(124,77,255,.2);border:1px solid rgba(124,77,255,.4);border-radius:20px;">'
     +'<span style="font-size:14px;color:#a78bfa;font-weight:600;">'+S.casts.find(c=>c.id===cdc)?.name+'</span>'
     +'<button class="btn" onclick="cds=0;rModal()" style="background:none;color:#666;font-size:12px;padding:0;">✕</button>'
     +'</div>'
     +'<div class="st" style="margin-bottom:10px;">ドリンクを選択</div>'
     +db2
     +'<div style="display:flex;gap:8px;margin-top:4px;">'
     +'<input type="number" inputmode="numeric" class="ip" id="cdp" inputmode="numeric" placeholder="その他の金額" style="flex:1;font-size:15px;"/>'
     +'<button class="btn gbg" onclick="addCDC()" style="padding:10px 20px;border-radius:6px;font-weight:700;font-size:15px;touch-action:manipulation;">追加</button>'
     +'</div>'
  )
  +'<button class="btn" onclick="closeM()" style="margin-top:16px;width:100%;padding:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#666;border-radius:6px;font-size:13px;">キャンセル</button>'
  +'</div></div>';
  }
  else if(md&&md.startsWith("liquor_")&&s){
// 酒類カテゴリモーダル
const liquorKey=md.replace("liquor_","");
const liquorLabels={champagne:"シャンパン・ワイン",keepBottles:"キープボトル"};
const liquorCols={champagne:"#ffd700",keepBottles:"#f59e0b"};
const items=S.menus[liquorKey]||[];
const lbl=liquorLabels[liquorKey]||liquorKey;
const col=liquorCols[liquorKey]||"#aaa";
let btns="";
items.forEach(item=>{
  btns+='<button class="btn" data-iid="'+item.id+'" onclick="odq(this.dataset.iid)" style="padding:16px 8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);color:#e8dcc8;border-radius:8px;font-size:14px;font-weight:600;text-align:center;touch-action:manipulation;">'+item.label+'<div style="font-size:12px;color:'+col+';margin-top:4px;">¥'+fmt(item.price)+'</div></button>';
});
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:500px;">'
  +'<h3 style="margin-bottom:4px;font-size:18px;color:'+col+';">'+lbl+'</h3>'
  +'<div style="font-size:12px;color:#666;margin-bottom:16px;">設定タブから追加・編集できます</div>'
  +(items.length
    ?'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;max-height:60vh;overflow-y:auto;margin-bottom:16px;">'+btns+'</div>'
    :'<div style="font-size:14px;color:#555;padding:20px;text-align:center;margin-bottom:16px;">メニュー未設定<br><span style="font-size:12px;">設定タブの「酒類」から追加してください</span></div>'
  )
  +'<button class="btn" onclick="closeM()" style="width:100%;padding:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#666;border-radius:6px;font-size:13px;">閉じる</button>'
  +'</div></div>';
  }
  else if(md==="ext"&&s){
// SC: show only extension choices that enter a new 60-minute SC charge block.
const scEligible=isSingleChargeExtensionEligible(s);
let ns='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
S.menus.extensions.forEach(e=>{ns+='<button class="btn" data-eid="'+e.id+'" onclick="addExt2(this.dataset.eid,false)" style="padding:14px 8px;background:rgba(255,165,0,.08);border:1px solid rgba(255,165,0,.25);color:#ffa500;border-radius:6px;text-align:center;touch-action:manipulation;"><div style="font-weight:700;font-size:16px;">'+e.minutes+'分</div><div style="font-size:12px;margin-top:3px;">¥'+fmt(e.price*s.guests)+'</div>'+(s.guests>1?'<div style="font-size:10px;opacity:.5;">¥'+fmt(e.price)+" × "+s.guests+'名</div>':"")+' </button>';});
ns+='</div>';
let ws="";
const scExts=scEligible?S.menus.extensions.filter(e=>needsExtensionSingleCharge(s,e.minutes)):[];
if(scExts.length){
  ws='<div style="margin-top:14px;"><div class="st" style="margin-bottom:8px;">\u0053\u0043\u8fbc\u307f</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
  scExts.forEach(e=>{ws+='<button class="btn" data-eid="'+e.id+'" onclick="addExt2(this.dataset.eid,true)" style="padding:14px 8px;background:rgba(255,165,0,.16);border:1px solid rgba(255,165,0,.45);color:#ffd066;border-radius:6px;text-align:center;touch-action:manipulation;"><div style="font-weight:700;font-size:16px;">'+e.minutes+'\u5206</div><div style="font-size:12px;margin-top:3px;">\u00a5'+fmt(e.price*s.guests+singleChargePrice())+'</div><div style="font-size:10px;opacity:.5;">\u5ef6\u9577+SC</div></button>';});
  ws+='</div></div>';
}
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:400px;"><h3 style="margin-bottom:16px;font-size:16px;color:#ffa500;">延長</h3>'+ns+ws+'<button class="btn" onclick="closeM()" style="margin-top:16px;font-size:12px;color:#555;background:none;width:100%;">キャンセル</button></div></div>';
  }
  else if(md==="room"&&s){
const existingRoom=sessionRoomType(s);
const roomBtn=(type,label,color,bg,border)=>{
  const selected=existingRoom===type;
  return '<button class="btn" onclick="md=\'room-'+type+'\';rModal()" style="padding:22px 10px;background:'+bg+';border:2px solid '+(selected?color:border)+';color:'+color+';border-radius:8px;font-size:17px;font-weight:700;text-align:center;touch-action:manipulation;">'+(selected?'✓ ':'')+label+'<div style="font-size:11px;margin-top:5px;opacity:.7;">'+roomMenuItems(type).length+'件設定</div></button>';
};
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:400px;">'
  +'<h3 style="margin-bottom:5px;font-size:17px;color:#d4a017;">室料</h3>'
  +'<div style="font-size:12px;color:#666;margin-bottom:16px;">室料の種類を選択</div>'
  +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
  +roomBtn("vip","VIP","#a78bfa","rgba(124,77,255,.15)","rgba(124,77,255,.35)")
  +roomBtn("karaoke","カラオケ","#38bdf8","rgba(56,189,248,.1)","rgba(56,189,248,.3)")
  +'</div>'
  +(existingRoom?'<div style="font-size:11px;color:#888;margin-top:12px;">現在: '+roomTypeLabel(existingRoom)+'室料</div>':'')
  +'<button class="btn" onclick="closeM()" style="margin-top:16px;font-size:12px;color:#555;background:none;width:100%;">キャンセル</button>'
  +'</div></div>';
  }
  else if((md==="room-vip"||md==="room-karaoke")&&s){
const roomType=md==="room-karaoke"?"karaoke":"vip";
const roomMenus=roomMenuItems(roomType);
const roomColor=roomType==="karaoke"?"#38bdf8":"#a78bfa";
const roomBg=roomType==="karaoke"?"rgba(56,189,248,.1)":"rgba(124,77,255,.15)";
const roomBorder=roomType==="karaoke"?"rgba(56,189,248,.3)":"rgba(124,77,255,.35)";
let roomButtons="";
roomMenus.forEach(item=>{
  const qty=roomType==="karaoke"?Math.max(1,Number(s.guests)||1):1;
  roomButtons+='<button class="btn" data-room-type="'+roomType+'" data-room-id="'+item.id+'" onclick="addRoomCharge(this.dataset.roomType,this.dataset.roomId)" style="padding:15px 9px;background:'+roomBg+';border:1px solid '+roomBorder+';color:'+roomColor+';border-radius:7px;text-align:center;touch-action:manipulation;"><div style="font-weight:700;font-size:14px;">'+item.label+'</div><div style="font-size:13px;margin-top:5px;">¥'+fmt(item.price*qty)+'</div>'+(roomType==="karaoke"?'<div style="font-size:10px;margin-top:2px;opacity:.65;">¥'+fmt(item.price)+' × '+qty+'名</div>':'')+'</button>';
});
h='<div class="mo" onclick="md=\'room\';rModal()"><div class="mb" onclick="event.stopPropagation()" style="max-width:420px;">'
  +'<h3 style="margin-bottom:5px;font-size:17px;color:'+roomColor+';">'+roomTypeLabel(roomType)+'室料</h3>'
  +'<div style="font-size:12px;color:#666;margin-bottom:16px;">'+(roomType==="karaoke"?s.guests+'名分で計算します':'一組分で計算します')+'</div>'
  +(roomMenus.length?'<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;">'+roomButtons+'</div>':'<div style="padding:22px 10px;text-align:center;color:#666;font-size:13px;border:1px solid rgba(255,255,255,.08);border-radius:7px;">設定タブで'+roomTypeLabel(roomType)+'室料を登録してください</div>')
  +'<button class="btn" onclick="md=\'room\';rModal()" style="margin-top:16px;font-size:12px;color:#777;background:none;width:100%;">← 種類選択へ戻る</button>'
  +'</div></div>';
  }
  else if(md==="fd"&&s){
let fb='<div style="display:grid;grid-template-columns:1fr;gap:8px;">';
FREE_DRINK_OPTIONS.forEach(o=>{const priceText=o.price===0?"\u00a50":"\u00a5"+fmt(o.price)+" / "+o.minutes+"\u5206";fb+='<button class="btn" onclick="selectFreeDrink('+o.minutes+','+o.price+')" style="padding:14px 12px;background:rgba(0,180,255,.1);border:1px solid rgba(0,180,255,.3);color:#38bdf8;border-radius:6px;text-align:left;touch-action:manipulation;"><div style="font-weight:700;font-size:14px;">'+o.label+'</div><div style="font-size:12px;margin-top:4px;color:#8bdcff;">'+priceText+'</div></button>';});
fb+='</div>';
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:380px;"><h3 style="margin-bottom:16px;font-size:16px;color:#38bdf8;">\u30d5\u30ea\u30fc\u30c9\u30ea\u30f3\u30af</h3>'+fb+'<button class="btn" onclick="closeM()" style="margin-top:16px;font-size:12px;color:#555;background:none;width:100%;">\u30ad\u30e3\u30f3\u30bb\u30eb</button></div></div>';
  }
  else if(md==="qty"&&qm){
const btnSzQ=isBig?"50px":"44px";const fszQ=isBig?"18px":"16px";
const qtyUnit=qm.unitLabel||"個";const qtyLabel=qm.qtyLabel||"個数を選択";const qtyConfirm=qm.confirmLabel||"追加する";
let qbs="";[1,2,3,4,5,6,7,8].forEach(n=>{qbs+='<button class="btn" data-qbtn="'+n+'" onclick="updateQtyDisplay('+n+')" style="width:'+btnSzQ+';height:'+btnSzQ+';border-radius:6px;font-weight:700;font-size:'+fszQ+';background:'+(qv===n?"linear-gradient(135deg,#b8960c,#e8c84a)":"rgba(255,255,255,.06)")+';color:'+(qv===n?"#1a1200":"#e8dcc8")+';touch-action:manipulation;">'+n+'</button>';});
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:360px;">'
  +'<h3 style="margin-bottom:16px;font-size:15px;color:#d4a017;">'+qm.label+'</h3>'
  +'<div class="st">'+qtyLabel+'</div>'
  +'<div style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0;">'+qbs+'</div>'
  +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">'
  +'<button class="btn" onclick="updateQtyDisplay(Math.max(1,qv-1))" style="width:44px;height:44px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#e8dcc8;font-size:22px;border-radius:6px;touch-action:manipulation;">−</button>'
  +'<input type="number" inputmode="numeric" min="1" id="qty-inp" class="ip" style="text-align:center;font-size:20px;font-weight:700;" value="'+qv+'" oninput="updateQtyDisplay(this.value)"/>'
  +'<button class="btn" onclick="updateQtyDisplay(qv+1)" style="width:44px;height:44px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#e8dcc8;font-size:22px;border-radius:6px;touch-action:manipulation;">＋</button>'
  +'</div>'
  +'<div id="qty-preview" style="text-align:center;margin-bottom:16px;"><span style="font-size:13px;color:#888;">'+qv+qtyUnit+' × ¥'+fmt(qm.price)+' = </span><span style="font-size:18px;font-weight:700;color:#d4a017;">¥'+fmt(qv*qm.price)+'</span></div>'
  +'<button class="btn gbg" onclick="confQty()" style="width:100%;padding:13px;font-weight:700;font-size:15px;border-radius:6px;touch-action:manipulation;">'+qtyConfirm+'</button>'
  +'<button class="btn" onclick="closeM();qv=1;" style="width:100%;margin-top:8px;padding:9px;font-size:13px;color:#555;background:none;">キャンセル</button>'
  +'</div></div>';
  }
  else if(md==="banai-ext-cast"&&s){
// 場内延長: このテーブルの場内指名キャスト一覧を複数選択
const banaiCids=s.banaiShimeis||[];
let cb="";
banaiCids.forEach(cid=>{
  const c=S.casts.find(c=>c.id===cid);if(!c)return;
  const sel=banaiExtCastIds.includes(cid);
  cb+='<button class="btn" data-cid="'+c.id+'" onclick="toggleBanaiExtCast(parseInt(this.dataset.cid))" style="padding:16px 12px;background:'+(sel?"rgba(255,165,0,.3)":"rgba(255,165,0,.08)")+';border:1px solid '+(sel?"rgba(255,165,0,.8)":"rgba(255,165,0,.3)")+';color:'+(sel?"#ffd066":"#ffa500")+';border-radius:6px;font-size:15px;font-weight:700;text-align:center;touch-action:manipulation;">'+(sel?"✓ ":"")+c.name+'<div style="font-size:10px;opacity:.7;margin-top:4px;">'+(sel?"選択中":"タップで選択")+'</div></button>';
});
if(!cb)cb='<div style="font-size:13px;color:#555;padding:16px;text-align:center;">場内指名キャストなし</div>';
const selCount=banaiExtCastIds.length;
const confirmDisabled=selCount===0;
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:440px;">'
  +'<h3 style="margin-bottom:4px;font-size:16px;color:#ffa500;">場内延長 — キャスト選択</h3>'
  +'<div style="font-size:12px;color:#666;margin-bottom:16px;">延長売上を帰属させるキャストを選択（複数可）</div>'
  +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:14px;">'+cb+'</div>'
  +(selCount>0?'<div style="font-size:12px;color:#ffa500;margin-bottom:10px;padding:6px 10px;background:rgba(255,165,0,.08);border-radius:4px;">'+selCount+'名選択中（延長売上を均等分配）</div>':"")
  +'<button class="btn" onclick="confirmBanaiExtCasts()" '+(confirmDisabled?'disabled style="opacity:.35;cursor:default;"':"")+' style="width:100%;padding:12px;background:rgba(255,165,0,.15);border:1px solid rgba(255,165,0,.4);color:#ffa500;border-radius:6px;font-size:14px;font-weight:700;touch-action:manipulation;">延長時間を選択 →</button>'
  +'<button class="btn" onclick="banaiExtCastIds=[];closeM()" style="width:100%;margin-top:8px;padding:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#888;border-radius:4px;font-size:13px;">キャンセル</button>'
  +'</div></div>';
  }
  else if(md==="banai"&&s){
const al=(s?.items||[]).filter(i=>i.isBanaiShimei);
let alh="";
if(al.length){alh='<div style="margin-bottom:12px;padding:10px 12px;background:rgba(74,222,128,.06);border:1px solid rgba(74,222,128,.15);border-radius:6px;"><div style="font-size:10px;color:#4ade80;letter-spacing:.1em;margin-bottom:6px;">追加済み</div><div style="display:flex;flex-wrap:wrap;gap:6px;">';al.forEach(i=>{alh+='<span style="background:rgba(74,222,128,.15);border:1px solid rgba(74,222,128,.3);border-radius:20px;padding:3px 10px;font-size:12px;color:#4ade80;">'+(S.casts.find(c=>c.id===i.castId)?.name||i.label)+'</span>';});alh+='</div></div>';}
const onIds=getOndutyIds();let cb="";sc().filter(c=>onIds.has(c.id)).forEach(c=>{const isHon=(s?.items||[]).some(i=>i.isHonShimei&&i.castId===c.id);const dn=(s?.items||[]).some(i=>i.isBanaiShimei&&i.castId===c.id);const dsbl=isHon||dn;cb+='<button class="btn" '+(dsbl?"disabled":"data-cid=\""+c.id+"\" onclick=\"event.stopPropagation();addBanai(parseInt(this.dataset.cid))\"")+' style="padding:12px 8px;background:'+(dn?"rgba(74,222,128,.05)":isHon?"rgba(255,255,255,.03)":"rgba(74,222,128,.1)")+';border:1px solid '+(dn?"rgba(74,222,128,.15)":isHon?"rgba(255,255,255,.07)":"rgba(74,222,128,.3)")+';color:'+(dn?"#555":isHon?"#3a3a3a":"#4ade80")+';border-radius:6px;font-size:14px;text-align:center;cursor:'+(dsbl?"default":"pointer")+';touch-action:manipulation;">'+(dn?"✓ ":"")+c.name+(isHon?'<div style="font-size:9px;color:#555;margin-top:2px;">本指名</div>':!dn?'<div style="font-size:10px;color:#4ade8099;margin-top:2px;">¥'+fmt(BANAI_SHIMEI_PRICE)+'</div>':"")+' </button>';});
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:500px;"><h3 style="margin-bottom:4px;font-size:16px;color:#4ade80;">場内指名</h3><div style="font-size:12px;color:#666;margin-bottom:16px;">タップで追加（¥'+fmt(BANAI_SHIMEI_PRICE)+'/名）</div>'+alh+'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;">'+cb+'</div><button class="btn" onclick="closeM()" style="margin-top:16px;width:100%;padding:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#888;border-radius:4px;font-size:13px;">閉じる</button></div></div>';
  }
  else if(md&&String(md).indexOf("ci-")===0){
const tl=S.tables.find(t=>t.id===at)?.label||"";
const titleColor="#d4a017";
const head='<div class="mo" onclick="cancelCheckin()"><div class="mb" onclick="event.stopPropagation()" style="max-width:520px;"><h3 style="font-size:17px;color:'+titleColor+';margin-bottom:4px;">'+tl+' &#12481;&#12455;&#12483;&#12463;&#12452;&#12531;</h3>';
const foot='<button class="btn" '+(checkinBusy?'disabled':'onclick="cancelCheckin()"')+' style="margin-top:12px;width:100%;padding:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#888;border-radius:4px;font-size:13px;touch-action:manipulation;'+(checkinBusy?'opacity:.45;':'')+'">&#12461;&#12515;&#12531;&#12475;&#12523;</button></div></div>';
if(md==="ci-guests"){
  let body='<div style="font-size:12px;color:#666;margin-bottom:14px;">&#20154;&#25968;&#12434;&#36984;&#25246;</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(62px,1fr));gap:8px;">';
  [1,2,3,4,5,6,7,8,9,10,11,12].forEach(n=>{body+='<button class="btn" onclick="ciSetGuests('+n+')" style="height:48px;border-radius:8px;font-size:17px;font-weight:900;background:rgba(212,160,23,.12);border:1px solid rgba(212,160,23,.3);color:#d4a017;touch-action:manipulation;">'+n+'</button>';});
  body+='</div><div style="display:flex;gap:8px;margin-top:10px;"><input id="ci-guests-custom" type="number" inputmode="numeric" min="1" max="99" class="ip" placeholder="&#12381;&#12398;&#20182;" style="flex:1;font-size:16px;"><button class="btn gbg" onclick="ciSetGuests(document.getElementById(\'ci-guests-custom\').value)" style="padding:10px 18px;font-weight:700;border-radius:6px;">OK</button></div>';
  h=head+body+foot;
}else if(md==="ci-set-type"){
  const normalCount=(S.menus.normalSets||[]).length;
  const specialCount=(S.menus.sets||[]).length;
  let body='<div style="font-size:12px;color:#666;margin-bottom:14px;">&#12475;&#12483;&#12488;&#31278;&#21029;&#12434;&#36984;&#25246;</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';
  body+='<button class="btn" onclick="ciSelectSetType(\'normal\')" style="padding:18px 10px;border-radius:8px;background:rgba(212,160,23,.12);border:1px solid rgba(212,160,23,.32);color:#d4a017;font-weight:900;touch-action:manipulation;">&#36890;&#24120;&#12475;&#12483;&#12488;<div style="font-size:11px;color:#888;margin-top:5px;font-weight:500;">'+(normalCount?normalCount+'&#31278;':'&#26410;&#35373;&#23450;')+'</div></button>';
  body+='<button class="btn" onclick="ciSelectSetType(\'special\')" style="padding:18px 10px;border-radius:8px;background:rgba(124,77,255,.12);border:1px solid rgba(124,77,255,.32);color:#a78bfa;font-weight:900;touch-action:manipulation;">&#29305;&#21029;&#12475;&#12483;&#12488;<div style="font-size:11px;color:#888;margin-top:5px;font-weight:500;">'+(specialCount?specialCount+'&#31278;':'&#26410;&#35373;&#23450;')+'</div></button>';
  body+='</div><button class="btn" onclick="ciGo(\'ci-guests\')" style="width:100%;padding:10px;margin-top:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#888;border-radius:4px;">&#25147;&#12427;</button>';
  h=head+body+foot;
}else if(md==="ci-set"){
  const isNormal=ci.setType==="normal";
  const menus=isNormal?(S.menus.normalSets||[]):(S.menus.sets||[]);
  const setLabel=isNormal?'&#36890;&#24120;&#12475;&#12483;&#12488;':'&#29305;&#21029;&#12475;&#12483;&#12488;';
  let body='<div style="font-size:12px;color:#666;margin-bottom:14px;">'+setLabel+'&#12434;&#36984;&#25246;</div><div style="max-height:58vh;overflow-y:auto;">';
  menus.forEach(m=>{body+='<button class="btn" data-sid="'+m.id+'" onclick="ciSelectSet(this.dataset.sid)" style="width:100%;margin-bottom:8px;padding:14px 16px;text-align:left;display:flex;justify-content:space-between;gap:10px;border-radius:6px;background:rgba(212,160,23,.1);border:1px solid rgba(212,160,23,.3);color:#e8dcc8;touch-action:manipulation;"><span>'+m.label+'</span><span style="color:#d4a017;white-space:nowrap;">&#165;'+fmt(m.price)+' / '+m.minutes+'&#20998;</span></button>';});
  if(!menus.length)body+='<div style="font-size:13px;color:#555;padding:18px;text-align:center;">&#12513;&#12491;&#12517;&#12540;&#26410;&#35373;&#23450;</div>';
  body+='</div><button class="btn" onclick="ciGo(\'ci-set-type\')" style="width:100%;padding:10px;margin-top:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#888;border-radius:4px;">&#25147;&#12427;</button>';
  h=head+body+foot;
}else if(md==="ci-time"){
  if(!etv)etv=roundHHMM(5);
  let body='<div style="font-size:12px;color:#666;margin-bottom:14px;">&#20837;&#24215;&#26178;&#21051;&#12434;&#36984;&#25246;</div><div style="display:flex;align-items:center;gap:8px;">';
  body+='<button class="btn" onclick="etv=adjustHHMM(etv||roundHHMM(5),-5);rModal()" style="width:46px;height:46px;font-size:18px;font-weight:900;border-radius:8px;background:rgba(255,255,255,.08);color:#ccc;">-</button>';
  body+='<input type="time" step="300" class="ip" value="'+etv+'" onchange="etv=this.value" style="flex:1;height:46px;font-size:20px;text-align:center;">';
  body+='<button class="btn" onclick="etv=adjustHHMM(etv||roundHHMM(5),5);rModal()" style="width:46px;height:46px;font-size:18px;font-weight:900;border-radius:8px;background:rgba(255,255,255,.08);color:#ccc;">+</button></div>';
  body+='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">';[-30,-15,-10,-5,5,10,15,30].forEach(d=>{body+='<button class="btn" onclick="etv=adjustHHMM(etv||roundHHMM(5),'+d+');rModal()" style="flex:1;min-width:48px;padding:7px 4px;font-size:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#aaa;border-radius:6px;">'+(d>0?'+':'')+d+'</button>';});body+='</div>';
  body+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;"><button class="btn" onclick="ciGo(\'ci-set\')" style="padding:10px;background:rgba(255,255,255,.04);color:#888;border-radius:4px;">&#25147;&#12427;</button><button class="btn gbg" onclick="ciGo(\'ci-hon\')" style="padding:10px;font-weight:700;border-radius:4px;">&#27425;&#12408;</button></div>';
  h=head+body+foot;
}else if(md==="ci-hon"){
  let body='<div style="font-size:12px;color:#666;margin-bottom:14px;">&#26412;&#25351;&#21517;&#12461;&#12515;&#12473;&#12488;&#12434;&#36984;&#25246;&#65288;&#12394;&#12375;&#12391;&#12418;&#21487;&#65289;</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;max-height:50vh;overflow-y:auto;">';
  sc().forEach(c=>{const sel=ci.honShimeis.includes(c.id);body+='<button class="btn" data-cid="'+c.id+'" onclick="ciToggleHon(this.dataset.cid)" style="padding:13px 8px;border-radius:6px;font-size:14px;background:'+(sel?'rgba(212,160,23,.22)':'rgba(124,77,255,.1)')+';border:1px solid '+(sel?'#d4a017':'rgba(124,77,255,.3)')+';color:'+(sel?'#d4a017':'#a78bfa')+';touch-action:manipulation;">'+(sel?'&#10003; ':'')+c.name+'</button>';});
  body+='</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;"><button class="btn" onclick="ciGo(\'ci-time\')" style="padding:10px;background:rgba(255,255,255,.04);color:#888;border-radius:4px;">&#25147;&#12427;</button><button class="btn gbg" onclick="ciAfterHon()" style="padding:10px;font-weight:700;border-radius:4px;">&#27425;&#12408;</button></div>';
  h=head+body+foot;
}else if(md==="ci-douhan"){
  const sel=!!ci.douhan;
  let body='<div style="font-size:12px;color:#666;margin-bottom:14px;">&#21516;&#20276;&#12458;&#12503;&#12471;&#12519;&#12531;&#65288;&#20219;&#24847;&#65289;</div>';
  body+='<button class="btn" onclick="ciSetDouhan(!ci.douhan)" style="width:100%;padding:16px;font-weight:900;border-radius:8px;background:'+(sel?'rgba(212,160,23,.22)':'rgba(255,255,255,.05)')+';border:1px solid '+(sel?'#d4a017':'rgba(255,255,255,.1)')+';color:'+(sel?'#d4a017':'#aaa')+';touch-action:manipulation;">'+(sel?'&#10003; ':'')+'&#21516;&#20276;</button>';
  body+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;"><button class="btn" onclick="ciGo(\'ci-hon\')" style="padding:10px;background:rgba(255,255,255,.04);color:#888;border-radius:4px;">&#25147;&#12427;</button><button class="btn gbg" onclick="ciAfterDouhan()" style="padding:10px;font-weight:700;border-radius:4px;">&#27425;&#12408;</button></div>';
  h=head+body+foot;
}else if(md==="ci-single"){
  const sel=!!ci.single;
  let body='<div style="font-size:12px;color:#666;margin-bottom:14px;">&#12471;&#12531;&#12464;&#12523;&#12481;&#12515;&#12540;&#12472;&#65288;&#20219;&#24847;&#65289;</div>';
  body+='<button class="btn" onclick="ciSetSingle(!ci.single)" style="width:100%;padding:16px;font-weight:900;border-radius:8px;background:'+(sel?'rgba(212,160,23,.22)':'rgba(255,255,255,.05)')+';border:1px solid '+(sel?'#d4a017':'rgba(255,255,255,.1)')+';color:'+(sel?'#d4a017':'#aaa')+';touch-action:manipulation;">'+(sel?'&#10003; ':'')+'&#12471;&#12531;&#12464;&#12523;&#12481;&#12515;&#12540;&#12472;</button>';
  body+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;"><button class="btn" onclick="ciGo(\''+(ci.honShimeis.length?'ci-douhan':'ci-hon')+'\')" style="padding:10px;background:rgba(255,255,255,.04);color:#888;border-radius:4px;">&#25147;&#12427;</button><button class="btn gbg" onclick="ciAfterSingle()" style="padding:10px;font-weight:700;border-radius:4px;">&#27425;&#12408;</button></div>';
  h=head+body+foot;
}else if(md==="ci-note"){
  let body='<div style="font-size:12px;color:#666;margin-bottom:14px;">&#20633;&#32771;&#65288;&#20219;&#24847;&#65289;</div><input id="ci-note-input" class="ip" maxlength="40" value="'+(ci.note||'')+'" placeholder="&#20363;: VIP&#24076;&#26395;&#12394;&#12393;" oninput="ci.note=this.value" style="font-size:15px;margin-bottom:12px;">';
  body+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"><button class="btn" '+(checkinBusy?'disabled':'onclick="ciGo(\''+(ci.guests===1?'ci-single':(ci.honShimeis.length?'ci-douhan':'ci-hon'))+'\')"')+' style="padding:10px;background:rgba(255,255,255,.04);color:#888;border-radius:4px;'+(checkinBusy?'opacity:.45;':'')+'">&#25147;&#12427;</button><button id="ci-start-btn" class="btn gbg" '+(checkinBusy?'disabled':'onclick="startSession()"')+' style="padding:10px;font-weight:900;border-radius:4px;'+(checkinBusy?'opacity:.55;cursor:not-allowed;':'')+'">'+(checkinBusy?'&#20445;&#23384;&#20013;...':'&#20837;&#24215;&#12473;&#12479;&#12540;&#12488;')+'</button></div>';
  h=head+body+foot;
}
  }
    else if(md==="setDetail"&&s){
const items=(s.items||[]).filter(isSetCatItem);
const delSt='width:26px;height:26px;border-radius:50%;background:rgba(255,80,80,.15);color:#ff6b6b;font-size:14px;flex-shrink:0;touch-action:manipulation;';
let rows=items.map(i=>{const lb=i.qty>1?i.label+" × "+i.qty:i.label;return'<div class="ir" style="min-height:36px;gap:4px;"><span style="flex:1;color:#ccc;font-size:13px;line-height:1.4;">'+lb+'</span><div style="display:flex;align-items:center;gap:5px;flex-shrink:0;"><span style="color:#d4a017;font-size:13px;font-weight:600;">¥'+fmt(Math.abs(i.price*(i.qty||1)))+'</span><button class="btn" data-iid="'+i.id+'" onclick="remItemDetail(this.dataset.iid)" style="'+delSt+'">×</button></div></div>';}).join("");
if(!rows)rows='<div style="font-size:12px;color:#444;padding:8px 0;">なし</div>';
const onIds=getOndutyIds();const cols2='repeat(auto-fill,minmax(110px,1fr))';
const _scP=(S.menus.options||[]).find(o=>o.id==="sc")?.price||2000;
let addBtns='<button class="menu-btn" onclick="om(\'add-set\')" style="background:rgba(212,160,23,.12);border-color:rgba(212,160,23,.35);color:#d4a017;">セット追加<br><small>+延長/入替</small></button>';
addBtns+='<button class="menu-btn" onclick="om(\'add-hon\')" style="background:rgba(212,160,23,.12);border-color:rgba(212,160,23,.35);color:#d4a017;">本指名追加<br><small>¥'+fmt(HON_SHIMEI_PRICE)+'</small></button>';
if(onIds.size>0)addBtns+='<button class="menu-btn" onclick="om(\'banai\')" style="background:rgba(80,200,120,.1);border-color:rgba(80,200,120,.3);color:#4ade80;">場内指名<br><small>¥'+fmt(BANAI_SHIMEI_PRICE)+'</small></button>';
addBtns+='<button class="menu-btn" onclick="addSCToSession()" style="background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.15);color:#ccc;">SC追加<br><small>¥'+fmt(_scP)+'</small></button>';
addBtns+='<button class="menu-btn" onclick="tryExt()" style="background:rgba(255,165,0,.1);border-color:rgba(255,165,0,.3);color:#ffa500;">延長<br><small>30/60分</small></button>';
addBtns+='<button class="menu-btn" onclick="om(\'room\')" style="background:rgba(124,77,255,.12);border-color:rgba(124,77,255,.3);color:#a78bfa;">室料<br><small>VIP / カラオケ</small></button>';
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:500px;">'
  +'<h3 style="margin-bottom:12px;font-size:16px;color:#d4a017;">セット</h3>'
  +'<div style="max-height:35vh;overflow-y:auto;margin-bottom:12px;">'+rows+'</div>'
  +'<div class="st" style="margin-bottom:8px;">追加</div>'
  +'<div style="display:grid;grid-template-columns:'+cols2+';gap:8px;margin-bottom:14px;">'+addBtns+'</div>'
  +'<button class="btn" onclick="closeM()" style="width:100%;padding:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#666;border-radius:6px;font-size:13px;">閉じる</button>'
  +'</div></div>';
  }
  else if(md==="guestDetail"&&s){
const items=(s.items||[]).filter(isGuestCatItem);
const delSt='width:26px;height:26px;border-radius:50%;background:rgba(255,80,80,.15);color:#ff6b6b;font-size:14px;flex-shrink:0;touch-action:manipulation;';
let rows=items.map(i=>{const lb=i.qty>1?i.label+" × "+i.qty:i.label;return'<div class="ir" style="min-height:36px;gap:4px;"><span style="flex:1;color:#ccc;font-size:13px;line-height:1.4;">'+lb+'</span><div style="display:flex;align-items:center;gap:5px;flex-shrink:0;"><span style="color:#38bdf8;font-size:13px;font-weight:600;">¥'+fmt(Math.abs(i.price*(i.qty||1)))+'</span><button class="btn" data-iid="'+i.id+'" onclick="remItemDetail(this.dataset.iid)" style="'+delSt+'">×</button></div></div>';}).join("");
if(!rows)rows='<div style="font-size:12px;color:#444;padding:8px 0;">なし</div>';
const cols2='repeat(auto-fill,minmax(110px,1fr))';
let addBtns='<button class="menu-btn" onclick="ofdq()" style="background:rgba(0,180,255,.1);border-color:rgba(0,180,255,.3);color:#38bdf8;">\u30d5\u30ea\u30fc\u30c9\u30ea\u30f3\u30af<br><small>60/30/0\u5186</small></button>';
(S.menus.drinks||[]).forEach(d=>{addBtns+='<button class="menu-btn" data-did="'+d.id+'" onclick="odq(this.dataset.did)">'+d.label+'<br><small>¥'+fmt(d.price)+'</small></button>';});
addBtns+='<button class="menu-btn" onclick="om(\'gcu\')" style="background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.12);color:#aaa;">カスタム<br><small>金額追加</small></button>';
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:500px;">'
  +'<h3 style="margin-bottom:12px;font-size:16px;color:#38bdf8;">ゲストオーダー</h3>'
  +'<div style="max-height:35vh;overflow-y:auto;margin-bottom:12px;">'+rows+'</div>'
  +'<div class="st" style="margin-bottom:8px;">追加</div>'
  +'<div style="display:grid;grid-template-columns:'+cols2+';gap:8px;margin-bottom:14px;">'+addBtns+'</div>'
  +'<button class="btn" onclick="closeM()" style="width:100%;padding:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#666;border-radius:6px;font-size:13px;">閉じる</button>'
  +'</div></div>';
  }
  else if(md==="castDetail"&&s){
const items=(s.items||[]).filter(isCastCatItem);
const delSt='width:26px;height:26px;border-radius:50%;background:rgba(255,80,80,.15);color:#ff6b6b;font-size:14px;flex-shrink:0;touch-action:manipulation;';
let rows=items.map(i=>{const lb=i.qty>1?i.label+" × "+i.qty:i.label;return'<div class="ir" style="min-height:36px;gap:4px;"><span style="flex:1;color:#ccc;font-size:13px;line-height:1.4;">'+lb+'</span><div style="display:flex;align-items:center;gap:5px;flex-shrink:0;"><span style="color:#a78bfa;font-size:13px;font-weight:600;">¥'+fmt(Math.abs(i.price*(i.qty||1)))+'</span><button class="btn" data-iid="'+i.id+'" onclick="remItemDetail(this.dataset.iid)" style="'+delSt+'">×</button></div></div>';}).join("");
if(!rows)rows='<div style="font-size:12px;color:#444;padding:8px 0;">なし</div>';
const onIds=getOndutyIds();const cols2='repeat(auto-fill,minmax(110px,1fr))';
const champItems2=S.menus.champagne||[];
const keepBottleItems=S.menus.keepBottles||[];
const castPresets=S.menus.castCustomItems||[];
let addBtns='<button class="menu-btn" onclick="om(\'liquor_champagne\')" style="background:rgba(255,215,0,.12);border-color:rgba(255,215,0,.35);color:#ffd700;">シャンパン・ワイン<br><small>'+(champItems2.length?champItems2.length+'種':'未設定')+'</small></button>';
addBtns+='<button class="menu-btn" onclick="om(\'liquor_keepBottles\')" style="background:rgba(245,158,11,.12);border-color:rgba(245,158,11,.35);color:#f59e0b;">キープボトル<br><small>'+(keepBottleItems.length?keepBottleItems.length+'種':'未設定')+'</small></button>';
if(onIds.size>0)addBtns+='<button class="menu-btn" onclick="om(\'cd\')" style="background:rgba(124,77,255,.15);border-color:rgba(124,77,255,.35);color:#a78bfa;">キャストDrink<br><small>各種</small></button>';
castPresets.forEach(cp=>{addBtns+='<button class="menu-btn" data-cpid="'+cp.id+'" onclick="addCastCustomItem(this.dataset.cpid)" style="background:rgba(167,139,250,.1);border-color:rgba(167,139,250,.25);color:#c4b5fd;">'+cp.label+'<br><small>¥'+fmt(cp.price)+'</small></button>';});
addBtns+='<button class="menu-btn" onclick="om(\'cu\')" style="background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.12);color:#aaa;">カスタム<br><small>金額追加</small></button>';
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:500px;">'
  +'<h3 style="margin-bottom:12px;font-size:16px;color:#a78bfa;">キャストオーダー</h3>'
  +'<div style="max-height:35vh;overflow-y:auto;margin-bottom:12px;">'+rows+'</div>'
  +'<div class="st" style="margin-bottom:8px;">追加</div>'
  +'<div style="display:grid;grid-template-columns:'+cols2+';gap:8px;margin-bottom:14px;">'+addBtns+'</div>'
  +'<button class="btn" onclick="closeM()" style="width:100%;padding:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#666;border-radius:6px;font-size:13px;">閉じる</button>'
  +'</div></div>';
  }

  else if(md==="et"&&s){
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:360px;">'
  +'<h3 style="margin-bottom:8px;font-size:16px;color:#d4a017;">入店時刻を変更</h3>'
  +'<div style="font-size:12px;color:#888;margin-bottom:12px;">現在: '+new Date(s.startTime).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})+'</div>'
  +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">'
  +'<button class="btn" onclick="etv=adjustHHMM(etv,-5);document.getElementById(\'eti\').value=etv" style="width:48px;height:48px;font-size:20px;font-weight:700;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#ccc;border-radius:8px;touch-action:manipulation;">−</button>'
  +'<input type="time" class="ip" id="eti" step="300" value="'+etv+'" onchange="etv=this.value" style="flex:1;font-size:22px;text-align:center;height:48px;padding:0;"/>'
  +'<button class="btn" onclick="etv=adjustHHMM(etv,5);document.getElementById(\'eti\').value=etv" style="width:48px;height:48px;font-size:20px;font-weight:700;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#ccc;border-radius:8px;touch-action:manipulation;">＋</button>'
  +'</div>'
  +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">'
  +(()=>{let btns="";[-30,-15,-10,-5,5,10,15,30].forEach(d=>{const lbl=(d>0?"+":"")+d+"分";btns+='<button class="btn" onclick="etv=adjustHHMM(etv,'+d+');document.getElementById(\'eti\').value=etv" style="flex:1;min-width:44px;padding:7px 2px;font-size:11px;font-weight:700;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#aaa;border-radius:6px;touch-action:manipulation;">'+lbl+'</button>';});return btns;})()
  +'</div>'
  +'<div style="font-size:11px;color:#666;margin-bottom:14px;">※セット終了予定時刻も自動で更新されます</div>'
  +'<div style="display:flex;gap:10px;">'
  +'<button class="btn gbg" onclick="applyET()" style="flex:1;padding:12px;font-weight:700;font-size:14px;border-radius:4px;touch-action:manipulation;">変更する</button>'
  +'<button class="btn" onclick="closeM()" style="flex:1;padding:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:4px;">キャンセル</button>'
  +'</div></div></div>';
  }
  else if(md==="editpay"){
const eh=S.history.find(x=>x.id===editPayHid);
if(!eh){h='<div class="mo" onclick="closeM()"><div class="mb">エラー</div></div>';}
else{
  // 既存splitsまたはlegacy payMethodから初期値生成
  const initSplits=eh.splits&&eh.splits.length>0
    ?eh.splits
    :[{method:eh.payMethod||"cash",amount:eh.total}];
  let epRows="";
  initSplits.forEach(sp=>{
    epRows+='<div class="editpay-row" data-method="'+(sp.method||"cash")+'" style="display:flex;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">';
    epRows+='<button class="btn ep-method-btn" data-m="cash" onclick="epToggleMethod(this,\'cash\')" style="width:52px;padding:8px 4px;border-radius:6px;font-size:11px;font-weight:700;background:'+(sp.method==="cash"?"linear-gradient(135deg,#b8960c,#e8c84a)":"rgba(255,255,255,.06)")+';border:2px solid '+(sp.method==="cash"?"#b8960c":"rgba(255,255,255,.1)")+';color:'+(sp.method==="cash"?"#1a1200":"#666")+';touch-action:manipulation;">現金</button>';
    epRows+='<button class="btn ep-method-btn" data-m="card" onclick="epToggleMethod(this,\'card\')" style="width:52px;padding:8px 4px;border-radius:6px;font-size:11px;font-weight:700;background:'+(sp.method==="card"?"rgba(56,189,248,.2)":"rgba(255,255,255,.06)")+';border:2px solid '+(sp.method==="card"?"#38bdf8":"rgba(255,255,255,.1)")+';color:'+(sp.method==="card"?"#38bdf8":"#666")+';touch-action:manipulation;">カード</button>';
    epRows+='<input type="number" inputmode="numeric" class="ip editpay-amt" value="'+sp.amount+'" style="width:110px;font-size:16px;font-weight:700;"/>';
    epRows+='<button class="btn" onclick="this.closest(\'.editpay-row\').remove()" style="width:28px;height:28px;border-radius:50%;background:rgba(255,80,80,.15);color:#ff6b6b;font-size:14px;touch-action:manipulation;">×</button>';
    epRows+='</div>';
  });
  h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:460px;">'
    +'<h3 style="margin-bottom:4px;font-size:16px;color:#38bdf8;">支払記録を変更</h3>'
    +'<div style="font-size:12px;color:#666;margin-bottom:14px;">'+eh.tableLabel+' &nbsp;合計 '+pAmt(eh.total)+'</div>'
    +'<div class="st" style="margin-bottom:8px;">支払い内訳 <span style="font-size:11px;color:#666;font-weight:400;">現=現金 カ=カード</span></div>'
    +'<div id="editpay-rows">'+epRows+'</div>'
    +'<button class="btn" onclick="epAddRow()" style="width:100%;padding:8px;margin-bottom:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:4px;font-size:13px;touch-action:manipulation;">＋ 支払いを追加</button>'
    +'<div style="display:flex;gap:8px;">'
    +'<button class="btn gbg" onclick="saveHistPay()" style="flex:2;padding:12px;font-size:14px;font-weight:700;border-radius:6px;touch-action:manipulation;">保存する</button>'
    +'<button class="btn" onclick="closeM()" style="flex:1;padding:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:4px;">キャンセル</button>'
    +'</div></div></div>';
}
  }
  else if(md==="shift"){
// 出勤・退勤登録モーダル
const isIn=shiftMd.mode==="in";
const title=isIn?"出勤登録":"退勤登録";
const onduty=getOnduty();
if(shiftMd.step==="cast"){
  let castBtns="";
  if(isIn){
    // 出勤：未出勤のキャスト一覧
    const onIds=getOndutyIds();
    sc().forEach(c=>{
      const already=onIds.has(c.id);
      castBtns+='<button class="btn" '+(already?"disabled":"")+' data-cid="'+c.id+'" onclick="shiftMd.castId=parseInt(this.dataset.cid);shiftMd.step=\'time\';shiftMd.time=roundHHMM(15);rModal()" style="padding:14px 8px;background:'+(already?"rgba(255,255,255,.02)":"rgba(74,222,128,.08)")+';border:2px solid '+(already?"rgba(255,255,255,.06)":"rgba(74,222,128,.3)")+';color:'+(already?"#444":"#e8dcc8")+';border-radius:8px;font-size:14px;font-weight:700;text-align:center;cursor:'+(already?"not-allowed":"pointer")+';touch-action:manipulation;">'
        +'<div style="font-size:15px;margin-bottom:3px;">'+c.name+'</div>'
        +(already?'<div style="font-size:10px;color:#4ade80;opacity:.8;">✓ 出勤中</div>':'<div style="font-size:10px;color:#4ade8077;">タップして選択</div>')
        +'</button>';
    });
  } else {
    // 退勤：出勤中のキャスト一覧
    if(!onduty.length){
      castBtns='<div style="color:#555;font-size:13px;padding:12px 0;">出勤中のキャストはいません</div>';
    } else {
      onduty.forEach(sh=>{
        const inT=new Date(sh.clockIn).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"});
        castBtns+='<button class="btn" data-sid="'+sh.id+'" onclick="shiftMd.shiftId=this.dataset.sid;shiftMd.step=\'time\';shiftMd.time=roundHHMM(15);rModal()" style="padding:14px 8px;background:rgba(255,80,80,.08);border:2px solid rgba(255,80,80,.3);color:#e8dcc8;border-radius:8px;font-size:14px;font-weight:700;text-align:center;touch-action:manipulation;">'
          +'<div style="font-size:15px;margin-bottom:3px;">'+sh.castName+'</div>'
          +'<div style="font-size:10px;color:#ff6b6b;">'+inT+'〜</div></button>';
      });
    }
  }
  h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:520px;">'
    +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">'
    +'<div style="width:10px;height:10px;border-radius:50%;background:'+(isIn?"#4ade80":"#ff6b6b")+';">'
    +'</div>'
    +'<h3 style="font-size:18px;font-weight:700;color:'+(isIn?"#4ade80":"#ff6b6b")+';">'+title+'</h3>'
    +'</div>'
    +'<div style="font-size:12px;color:#666;margin-bottom:12px;letter-spacing:.05em;">'+(isIn?"出勤するキャストを選択":"退勤するキャストを選択")+'</div>'
    +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;max-height:55vh;overflow-y:auto;">'+castBtns+'</div>'
    +'<button class="btn" onclick="closeM()" style="margin-top:18px;width:100%;padding:11px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#666;border-radius:6px;font-size:13px;">キャンセル</button>'
    +'</div></div>';
} else if(shiftMd.step==="time"){
  const name=isIn
    ?S.casts.find(c=>String(c.id)===String(shiftMd.castId))?.name
    :S.shifts[shiftMd.shiftId]?.castName;
  h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:380px;">'
    +'<h3 style="margin-bottom:4px;font-size:16px;color:'+(isIn?"#4ade80":"#ff6b6b")+';">'+title+'</h3>'
    +'<div style="font-size:15px;font-weight:700;color:#e8dcc8;margin-bottom:16px;">'+(name||"不明")+'</div>'
    +'<div class="st" style="margin-bottom:8px;">'+(isIn?"出勤時刻":"退勤時刻")+'</div>'
    +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">'
    +'<button class="btn" onclick="shiftMd.time=adjustHHMM(shiftMd.time,-15);rModal()" style="width:48px;height:48px;font-size:20px;font-weight:700;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#ccc;border-radius:8px;touch-action:manipulation;">−</button>'
    +'<input type="time" id="shift-time" class="ip" step="900" value="'+shiftMd.time+'" style="flex:1;font-size:22px;text-align:center;height:48px;padding:0;" oninput="shiftMd.time=this.value" onchange="shiftMd.time=this.value"/>'
    +'<button class="btn" onclick="shiftMd.time=adjustHHMM(shiftMd.time,15);rModal()" style="width:48px;height:48px;font-size:20px;font-weight:700;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#ccc;border-radius:8px;touch-action:manipulation;">＋</button>'
    +'</div>'
    +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">'
    +(()=>{let btns="";[-60,-30,-15,15,30,60].forEach(d=>{const lbl=(d>0?"+":"")+d+"分";btns+='<button class="btn" onclick="shiftMd.time=adjustHHMM(shiftMd.time,'+d+');rModal()" style="flex:1;min-width:52px;padding:8px 4px;font-size:12px;font-weight:700;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#aaa;border-radius:6px;touch-action:manipulation;">'+lbl+'</button>';});return btns;})()
    +'</div>'
    +'<div style="display:flex;gap:8px;">'
    +'<button class="btn gbg" onclick="confirmShiftTime()" style="flex:2;padding:13px;font-size:15px;font-weight:700;border-radius:6px;touch-action:manipulation;">登録する</button>'
    +'<button class="btn" onclick="shiftMd.step=\'cast\';rModal()" style="flex:1;padding:13px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:6px;">← 戻る</button>'
    +'</div></div></div>';
} else if(shiftMd.step==="edit"){
  const sh=S.shifts[shiftMd.shiftId];if(!sh){closeM();return;}
  const inHHMM=new Date(sh.clockIn).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}).replace(/:/g,":");
  const outHHMM=sh.clockOut?new Date(sh.clockOut).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}).replace(/:/g,":"):"";
  h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:340px;">'
    +'<h3 style="margin-bottom:4px;font-size:16px;color:#d4a017;">シフト編集</h3>'
    +'<div style="font-size:15px;font-weight:700;color:#e8dcc8;margin-bottom:16px;">'+sh.castName+'</div>'
    +'<div class="st" style="margin-bottom:6px;">出勤時刻</div>'
    +'<input type="time" id="se-in" class="ip" step="900" value="'+inHHMM+'" style="font-size:16px;margin-bottom:12px;width:100%;max-width:200px;display:block;"/>'
    +'<div class="st" style="margin-bottom:6px;">退勤時刻（未退勤の場合は空欄）</div>'
    +'<input type="time" id="se-out" class="ip" step="900" value="'+outHHMM+'" style="font-size:16px;margin-bottom:14px;width:100%;max-width:200px;display:block;"/>'
    +'<div style="display:flex;gap:8px;">'
    +'<button class="btn gbg" onclick="saveShiftEdit()" style="flex:2;padding:12px;font-size:14px;font-weight:700;border-radius:6px;touch-action:manipulation;">保存する</button>'
    +'<button class="btn" onclick="deleteShift(shiftMd.shiftId)" style="flex:1;padding:12px;background:rgba(255,80,80,.12);border:1px solid rgba(255,80,80,.3);color:#ff6b6b;border-radius:6px;font-size:13px;touch-action:manipulation;">削除</button>'
    +'</div>'
    +'<button class="btn" onclick="closeM()" style="width:100%;margin-top:8px;padding:9px;font-size:12px;color:#555;background:none;">キャンセル</button>'
    +'</div></div>';
}
  }
  else if(md==="tsuke"){
// 付け回しモーダル（at=nullのリスト画面からも開ける）
const onIds=getOndutyIds();
if(tsukeMd.step==="cast"){
  let castBtns="";
  sc().forEach(c=>{
    const sh=getShiftByCastId(c.id);
    const isOn=!!sh;
    const status=sh?(sh.status||"waiting"):"none";
    const hasActiveA=Object.values(S.assignments||{}).some(a=>String(a.castId)===String(c.id)&&!a.endTime);
    // 待機中または休憩中のキャストのみ選択可（テーブルについているactiveは不可）
    const canSelect=isOn&&!hasActiveA;
    const statusLbl=!isOn?"未出勤":hasActiveA?"付回中":status==="break"?"休憩中":"待機中";
    const statusCol=!isOn?"#444":hasActiveA?"#a78bfa":status==="break"?"#ffa500":"#4ade80";
    castBtns+='<button class="btn" '+(canSelect?"":"disabled")+' data-cid="'+c.id+'" onclick="tsukeMd.castId=this.dataset.cid;tsukeMd.step=\'type\';rModal()" style="padding:12px 8px;background:'+(canSelect?"rgba(74,222,128,.08)":"rgba(255,255,255,.02)")+';border:1px solid '+(canSelect?"rgba(74,222,128,.25)":"rgba(255,255,255,.06)")+';color:'+(canSelect?"#e8dcc8":"#444")+';border-radius:6px;font-size:14px;font-weight:600;text-align:center;cursor:'+(canSelect?"pointer":"not-allowed")+';touch-action:manipulation;">'
      +c.name
      +'<div style="font-size:10px;margin-top:3px;color:'+statusCol+';">'+statusLbl+'</div>'
      +'</button>';
  });
  h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:500px;">'
    +'<h3 style="margin-bottom:4px;font-size:16px;color:#a78bfa;">付け回し</h3>'
    +'<div style="font-size:12px;color:#666;margin-bottom:16px;">キャストを選択（出勤中のみ選択可）</div>'
    +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;max-height:50vh;overflow-y:auto;">'+castBtns+'</div>'
    +'<button class="btn" onclick="closeM()" style="margin-top:16px;width:100%;padding:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#888;border-radius:4px;font-size:13px;">キャンセル</button>'
    +'</div></div>';
} else if(tsukeMd.step==="type"){
  const cname=S.casts.find(c=>String(c.id)===String(tsukeMd.castId))?.name||"";
  // limitedTypesが未設定（手動フロー等）でtableIdが判明している場合はここで算出
  if(tsukeMd.limitedTypes===undefined&&tsukeMd.castId){
    const _tid=tsukeMd.tableId||at||"";
    if(_tid){
      const _ag=getAutoType(tsukeMd.castId,_tid);
      if(_ag.autoType){tsukeMd.type=_ag.autoType;tsukeMd.step='time';rModal();return;}
      tsukeMd.limitedTypes=_ag.limitedTypes;
    }
  }
  let typeBtns="";
  const _showTypes=tsukeMd.limitedTypes
    ?Object.entries(ASSIGN_TYPES).filter(([k])=>tsukeMd.limitedTypes.includes(k))
    :Object.entries(ASSIGN_TYPES);
  _showTypes.forEach(([key,{label,col}])=>{
    typeBtns+='<button class="btn" onclick="tsukeMd.type=\''+key+'\';tsukeMd.step=\'time\';rModal()" style="flex:1;padding:16px 8px;border-radius:8px;font-size:15px;font-weight:700;background:rgba(0,0,0,.2);border:2px solid '+col+';color:'+col+';text-align:center;touch-action:manipulation;">'+label+'</button>';
  });
  h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:420px;">'
    +'<h3 style="margin-bottom:4px;font-size:16px;color:#a78bfa;">付け回し</h3>'
    +'<div style="font-size:15px;font-weight:700;color:#e8dcc8;margin-bottom:16px;">'+cname+'</div>'
    +'<div class="st" style="margin-bottom:10px;">種別を選択</div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;">'+typeBtns+'</div>'
    +'<button class="btn" onclick="tsukeMd.step=\'cast\';rModal()" style="margin-top:14px;width:100%;padding:9px;color:#888;background:none;font-size:13px;">← 戻る</button>'
    +'</div></div>';
} else if(tsukeMd.step==="time"){
  const cname=S.casts.find(c=>String(c.id)===String(tsukeMd.castId))?.name||"";
  // リスト画面から来た場合はtsukeMd.tableId、注文画面から来た場合はat
  const targetTid=tsukeMd.tableId||at||"";
  const tlbl=ASSIGN_TYPES[tsukeMd.type]?.label||"";
  const tcol=ASSIGN_TYPES[tsukeMd.type]?.col||"#a78bfa";
  if(!tsukeMd.time)tsukeMd.time=roundHHMM(5);
  // テーブル選択UI（リスト画面から来た場合でtableIdが未設定の場合）
  let tblSel="";
  if(!tsukeMd.tableId&&!at){
    const activeTids=S.tables.filter(t=>S.sessions[t.id]);
    tblSel='<div class="st" style="margin-bottom:6px;">テーブルを選択</div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">'
      +activeTids.map(t=>'<button class="btn" data-tid="'+t.id+'" onclick="tsukeMd.tableId=this.dataset.tid;rModal()" style="padding:8px 12px;border-radius:6px;font-size:13px;font-weight:700;background:'+(tsukeMd.tableId===t.id?"rgba(167,139,250,.3)":"rgba(167,139,250,.1)")+';border:1px solid '+(tsukeMd.tableId===t.id?"#a78bfa":"rgba(167,139,250,.3)")+';color:#a78bfa;touch-action:manipulation;">'+t.label+'</button>').join("")
      +'</div>';
  }
  const tname=S.tables.find(t=>t.id===targetTid)?.label||(tblSel?"未選択":"");
  h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:360px;">'
    +'<h3 style="margin-bottom:4px;font-size:16px;color:#a78bfa;">付け回し</h3>'
    +'<div style="margin-bottom:14px;">'
    +'<span style="font-size:15px;font-weight:700;color:#e8dcc8;">'+cname+'</span>'
    +'<span style="font-size:12px;padding:2px 8px;border:1px solid '+tcol+';color:'+tcol+';border-radius:4px;margin-left:8px;">'+tlbl+'</span>'
    +(tname?'<div style="font-size:12px;color:#888;margin-top:4px;">→ '+tname+'</div>':"")
    +'</div>'
    +tblSel
    // Now/時刻指定トグル
    +'<div style="display:flex;gap:8px;margin-bottom:14px;">'
    +'<button class="btn" onclick="tsukeMd.useNow=true;rModal()" style="flex:1;padding:11px;font-size:14px;font-weight:700;border-radius:6px;touch-action:manipulation;background:'+(tsukeMd.useNow?'linear-gradient(135deg,#b8960c,#e8c84a)':'rgba(255,255,255,.06)')+';border:2px solid '+(tsukeMd.useNow?'#b8960c':'rgba(255,255,255,.1)')+';color:'+(tsukeMd.useNow?'#1a1200':'#888')+';">Now</button>'
    +'<button class="btn" onclick="tsukeMd.useNow=false;if(!tsukeMd.time)tsukeMd.time=roundHHMM(5);rModal()" style="flex:1;padding:11px;font-size:14px;font-weight:700;border-radius:6px;touch-action:manipulation;background:'+(!tsukeMd.useNow?'rgba(167,139,250,.2)':'rgba(255,255,255,.06)')+';border:2px solid '+(!tsukeMd.useNow?'#a78bfa':'rgba(255,255,255,.1)')+';color:'+(!tsukeMd.useNow?'#a78bfa':'#888')+';">時刻指定</button>'
    +'</div>'
    +(!tsukeMd.useNow?'<input type="time" id="tsuke-time" class="ip" step="300" value="'+tsukeMd.time+'" style="font-size:16px;margin-bottom:14px;width:100%;max-width:200px;display:block;" oninput="tsukeMd.time=this.value" onchange="tsukeMd.time=this.value"/>':'')
    +(tsukeMd.useNow?'<div style="font-size:12px;color:#888;margin-bottom:14px;padding:8px 12px;background:rgba(212,160,23,.06);border:1px solid rgba(212,160,23,.15);border-radius:6px;">確定した瞬間からカウント開始</div>':'')
    +'<div style="display:flex;gap:8px;">'
    +'<button class="btn gbg" onclick="confirmTsuke()" style="flex:2;padding:13px;font-size:15px;font-weight:700;border-radius:6px;touch-action:manipulation;">確定</button>'
    +'<button class="btn" onclick="tsukeMd.step=\'type\';rModal()" style="flex:1;padding:13px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:6px;">← 戻る</button>'
    +'</div></div></div>';
}
  }
  else if(md&&md.startsWith("loadBizDayConfirm_")){
const dayId=md.replace("loadBizDayConfirm_","");
const day=S.bizDays[dayId];
if(!day){h='<div class="mo" onclick="closeM()"><div class="mb">エラー</div></div>';}
else{
  const sales=(day.history||[]).reduce((a,h2)=>a+(h2.total||0),0);
  const shiftCount=Object.values(day.shifts||{}).length;
  h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:440px;">'
    +'<h3 style="margin-bottom:4px;font-size:18px;color:#38bdf8;">過去データ読み込み</h3>'
    +'<div style="font-size:14px;font-weight:700;color:#e8dcc8;margin-bottom:4px;">'+day.date+'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px;">'
    +'<div style="padding:8px;background:rgba(212,160,23,.06);border:1px solid rgba(212,160,23,.15);border-radius:6px;text-align:center;"><div style="font-size:10px;color:#888;">売上</div><div style="font-size:13px;font-weight:700;color:#d4a017;">'+pAmt(sales)+'</div></div>'
    +'<div style="padding:8px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:6px;text-align:center;"><div style="font-size:10px;color:#888;">会計</div><div style="font-size:13px;font-weight:700;color:#e8dcc8;">'+(day.history||[]).length+'件</div></div>'
    +'<div style="padding:8px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:6px;text-align:center;"><div style="font-size:10px;color:#888;">出勤</div><div style="font-size:13px;font-weight:700;color:#e8dcc8;">'+shiftCount+'名</div></div>'
    +'</div>'
    +'<div style="padding:12px;background:rgba(56,189,248,.05);border:1px solid rgba(56,189,248,.15);border-radius:6px;font-size:12px;color:#888;margin-bottom:20px;line-height:1.8;">'
    +'このデータを読み込むとフロア・リスト・出勤タブが操作できる状態になります。<br>'
    +'「営業終了 → 保存」で上書き保存できます。<br>'
    +'<span style="color:#38bdf8;">元のバックアップは保持されたまま、別データとして保存されます。</span>'
    +'</div>'
    +'<div style="display:flex;gap:8px;">'
    +'<button class="btn" data-ldid="'+dayId+'" onclick="loadBizDayForReEdit(this.dataset.ldid)" style="flex:2;padding:14px;font-size:15px;font-weight:700;border-radius:8px;background:rgba(56,189,248,.15);border:1px solid rgba(56,189,248,.35);color:#38bdf8;touch-action:manipulation;">読み込む</button>'
    +'<button class="btn" onclick="closeM()" style="flex:1;padding:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:8px;">キャンセル</button>'
    +'</div></div></div>';
}
  }
  else if(md&&md.startsWith("editBizDay_")){
const dayId=md.replace("editBizDay_","");
const day=S.bizDays[dayId];
if(!day){closeM();return;}
const isActive=dayId===S.activeBizDay;
// 売上明細の編集（支払変更）
const hist=day.history||[];
let histRows="";
hist.forEach((h,i)=>{
  const payBadge=h.splits&&h.splits.length>0
    ?h.splits.map(sp=>(sp.method==="card"?"カード":"現金")+"¥"+fmt(sp.amount)).join(" ")
    :(h.payMethod==="card"?"カード":"現金")+"¥"+fmt(h.total);
  histRows+='<div class="ir" style="font-size:12px;">'
    +'<span style="color:#bbb;">'+h.tableLabel+' '+h.guests+'名</span>'
    +'<div style="display:flex;align-items:center;gap:8px;">'
    +'<span style="color:#d4a017;">'+pAmt(h.total)+'</span>'
    +'<span style="color:#666;font-size:10px;">'+payBadge+'</span>'
    +(isActive?'':'<button class="btn" data-dayid="'+dayId+'" data-idx="'+i+'" onclick="deleteBizDayHist(this.dataset.dayid,parseInt(this.dataset.idx))" style="padding:2px 7px;background:rgba(255,80,80,.1);border:1px solid rgba(255,80,80,.2);color:#ff6b6b;border-radius:3px;font-size:10px;touch-action:manipulation;">削除</button>')
    +'</div></div>';
});
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:500px;">'
  +'<h3 style="margin-bottom:4px;font-size:16px;color:#d4a017;">営業日編集</h3>'
  +'<div style="font-size:13px;color:#888;margin-bottom:16px;">'+day.date+'</div>'
  // 日付変更
  +(isActive?'':'<div class="st" style="margin-bottom:6px;">日付</div>'
    +'<input type="date" id="edit-biz-date" class="ip" value="'+day.date+'" style="margin-bottom:16px;font-size:16px;"/>')
  // 売上一覧
  +(hist.length?'<div class="st" style="margin-bottom:8px;">売上明細 ('+hist.length+'件)</div>'+histRows:'<div style="font-size:12px;color:#555;margin-bottom:12px;">売上データなし</div>')
  +'<div style="display:flex;gap:8px;margin-top:16px;">'
  +(isActive?'':'<button class="btn gbg" onclick="saveBizDayEdit(\''+dayId+'\')" style="flex:2;padding:12px;font-size:14px;font-weight:700;border-radius:6px;touch-action:manipulation;">保存する</button>')
  +'<button class="btn" onclick="closeM()" style="flex:1;padding:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:6px;">閉じる</button>'
  +'</div></div></div>';
  }
  else if(md&&md.startsWith("deleteBizDay_")){
const dayId=md.replace("deleteBizDay_","");
const day=S.bizDays[dayId];
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:360px;">'
  +'<h3 style="margin-bottom:8px;font-size:16px;">営業日を削除しますか？</h3>'
  +'<div style="font-size:14px;font-weight:700;color:#e8dcc8;margin-bottom:4px;">'+(day?day.date:"")+'</div>'
  +'<div style="font-size:12px;color:#888;margin-bottom:20px;">この営業日のすべてのデータが削除されます。</div>'
  +'<div style="display:flex;gap:8px;">'
  +'<button class="btn" data-dayid="'+dayId+'" onclick="confirmDeleteBizDay(this.dataset.dayid)" style="flex:1;padding:12px;background:rgba(255,80,80,.15);border:1px solid rgba(255,80,80,.3);color:#ff6b6b;border-radius:6px;font-weight:700;touch-action:manipulation;">削除する</button>'
  +'<button class="btn" onclick="closeM()" style="flex:1;padding:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:6px;">キャンセル</button>'
  +'</div></div></div>';
  }
  else if(md==="assignAction"){
// テーブル詳細でキャストをタップした時のアクションモーダル
const a=S.assignments[window._editAid];
if(!a){h='<div class="mo" onclick="closeM()"><div class="mb">エラー</div></div>';}
else{
  const col=ASSIGN_TYPES[a.type]?.col||"#888";
  const lbl=ASSIGN_TYPES[a.type]?.label||a.type;
  const elapsed=Date.now()-(a.attachedAt||a.startTime);
  const sT=new Date(a.startTime).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"});
  h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:380px;">'
    +'<div style="padding:14px;background:rgba(0,0,0,.2);border:1px solid '+col+'55;border-radius:8px;margin-bottom:16px;">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">'
    +'<div><span style="font-size:11px;padding:2px 7px;border:1px solid '+col+';color:'+col+';border-radius:3px;margin-right:8px;">'+lbl+'</span><span style="font-size:16px;font-weight:700;color:#e8dcc8;">'+a.castName+'</span></div>'
    +'<span style="font-size:20px;font-weight:700;font-family:monospace;color:'+col+';">'+ts(elapsed).slice(3)+'</span>'
    +'</div>'
    +'<div style="font-size:11px;color:#666;">開始: '+sT+'</div>'
    +'</div>'
    +'<div style="display:flex;flex-direction:column;gap:8px;">'
    +'<button class="btn" data-aid3b="'+a.id+'" onclick="endAssign(this.dataset.aid3b);closeM()" style="padding:12px;background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.3);color:#4ade80;border-radius:6px;font-size:14px;font-weight:700;touch-action:manipulation;">→ 待機</button>'
    +'<button class="btn" data-cid7b="'+a.castId+'" onclick="moveToBreak(this.dataset.cid7b);closeM()" style="padding:12px;background:rgba(255,165,0,.1);border:1px solid rgba(255,165,0,.3);color:#ffa500;border-radius:6px;font-size:14px;font-weight:700;touch-action:manipulation;">→ 休憩</button>'
    +'<button class="btn" data-mv-aid="'+a.id+'" data-mv-cid="'+a.castId+'" data-mv-cname="'+a.castName+'" data-mv-tid="'+a.tableId+'" onclick="window._moveFromAid=this.dataset.mvAid;window._moveCastId=this.dataset.mvCid;window._moveCastName=this.dataset.mvCname;window._moveFromTableId=this.dataset.mvTid;md=\'moveToTable\';rModal()" style="padding:12px;background:rgba(167,139,250,.1);border:1px solid rgba(167,139,250,.3);color:#a78bfa;border-radius:6px;font-size:14px;font-weight:700;width:100%;touch-action:manipulation;">テーブル移動</button>'
    +'<div style="display:flex;gap:8px;">'
    +'<button class="btn" data-aidct3="'+a.id+'" onclick="openChangeType(this.dataset.aidct3)" style="flex:1;padding:10px;background:rgba(167,139,250,.08);border:1px solid rgba(167,139,250,.2);color:#a78bfa;border-radius:6px;font-size:13px;touch-action:manipulation;">タイプ変更</button>'
    +'<button class="btn" data-eid3="'+a.id+'" onclick="openEditAssignTime(this.dataset.eid3)" style="flex:1;padding:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:6px;font-size:13px;touch-action:manipulation;">時刻変更</button>'
    +'</div>'
    +'<button class="btn" data-chist="'+a.castId+'" onclick="window._historyCastId=this.dataset.chist;md=\'castHistory\';rModal()" style="padding:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:6px;font-size:13px;width:100%;touch-action:manipulation;">このキャストの履歴</button>'
    +'<button class="btn" data-aid4b="'+a.id+'" onclick="deleteAssign(this.dataset.aid4b)" style="padding:10px;background:rgba(255,80,80,.08);border:1px solid rgba(255,80,80,.2);color:#ff6b6b;border-radius:6px;font-size:13px;touch-action:manipulation;width:100%;">削除</button>'
    +'</div>'
    +'<button class="btn" onclick="closeM()" style="width:100%;margin-top:10px;padding:9px;font-size:12px;color:#555;background:none;">閉じる</button>'
    +'</div></div>';
}
  }
  else if(md==="moveToTable"){
const fromTid=window._moveFromTableId;
const fromLabel=S.tables.find(t=>t.id===fromTid)?.label||"";
const activeTables=S.tables.filter(t=>S.sessions[t.id]&&t.id!==fromTid);
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:440px;padding:20px;">'
  +'<h3 style="margin-bottom:4px;font-size:16px;color:#a78bfa;">テーブル移動</h3>'
  +'<div style="font-size:15px;font-weight:700;color:#e8dcc8;margin-bottom:4px;">'+(window._moveCastName||"")+'</div>'
  +(fromLabel?'<div style="font-size:12px;color:#888;margin-bottom:16px;">'+fromLabel+' → 移動先を選択</div>':"")
  +'<div class="st" style="margin-bottom:10px;">テーブルへ付ける</div>'
  +(activeTables.length
    ?'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px;margin-bottom:16px;">'
      +activeTables.map(t=>{const s2=S.sessions[t.id];return '<button class="btn" data-mvtid="'+t.id+'" onclick="execMoveToTable(this.dataset.mvtid)" style="padding:12px 8px;background:rgba(167,139,250,.1);border:2px solid rgba(167,139,250,.3);color:#a78bfa;border-radius:8px;font-size:13px;font-weight:700;text-align:center;touch-action:manipulation;">'+t.label+'<div style="font-size:10px;color:#a78bfa88;margin-top:2px;">'+(s2?.guests||"")+'名</div></button>';}).join("")
      +'</div>'
    :'<div style="font-size:12px;color:#444;margin-bottom:16px;padding:10px;background:rgba(255,255,255,.03);border-radius:6px;text-align:center;">移動先のテーブルなし</div>'
  )
  +'<button class="btn" onclick="closeM()" style="width:100%;padding:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:6px;font-size:13px;touch-action:manipulation;">キャンセル</button>'
  +'</div></div>';
  }
  else if(md==="anaDateSel"){
const periodLabel=histFilter.from||"";
const periodTo=histFilter.to||"";
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:440px;padding:20px;">'
  +'<h3 style="margin-bottom:4px;font-size:16px;color:#d4a017;">売上情報 — 期間選択</h3>'
  +'<div style="font-size:12px;color:#888;margin-bottom:16px;">表示したい期間を選択してください</div>'
  +'<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">'
  +'<input type="date" class="ip" style="flex:1;min-width:120px;" value="'+periodLabel+'" onchange="histFilter.from=this.value;" />'
  +'<span style="color:#555;font-size:12px;">〜</span>'
  +'<input type="date" class="ip" style="flex:1;min-width:120px;" value="'+periodTo+'" onchange="histFilter.to=this.value;" />'
  +'</div>'
  +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">'
  +'<button class="btn" onclick="anaSetMonth()" style="padding:6px 12px;background:rgba(184,150,12,.1);border:1px solid rgba(184,150,12,.2);color:#d4a017;border-radius:4px;font-size:12px;touch-action:manipulation;">当月</button>'
  +'<button class="btn" onclick="anaClrFilter()" style="padding:6px 12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:4px;font-size:12px;touch-action:manipulation;">クリア</button>'
  +'</div>'
  +'<button class="btn gbg" onclick="md=\'anaCastSel\';rModal()" style="width:100%;padding:11px;font-weight:700;font-size:14px;border-radius:6px;touch-action:manipulation;margin-bottom:8px;">次へ（キャスト選択）</button>'
  +'<button class="btn" onclick="closeM()" style="width:100%;padding:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:6px;font-size:13px;touch-action:manipulation;">キャンセル</button>'
  +'</div></div>';
  }
  else if(md==="anaCastSel"){
const isShimei=analysisSt.mode==="shimei";
const modeLabel=isShimei?"指名情報":"売上情報";
const modeColor=isShimei?"#ff6b6b":"#d4a017";
const modeBg=isShimei?"rgba(255,68,68,.08)":"rgba(212,160,23,.08)";
const modeBdr=isShimei?"rgba(255,68,68,.25)":"rgba(212,160,23,.25)";
const castBtns=activeRegularCasts().map(c=>'<button class="btn" onclick="analysisSt.castId=\''+c.id+'\';analysisSt.castName=\''+c.name+'\';md=\''+(isShimei?"anaDetail":"anaActionSel")+'\';rModal()" style="padding:10px 8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#e8dcc8;border-radius:8px;font-size:13px;font-weight:700;text-align:center;touch-action:manipulation;">'+c.name+'</button>').join("");
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:440px;padding:20px;">'
  +'<h3 style="margin-bottom:4px;font-size:16px;color:'+modeColor+';">'+modeLabel+' — キャスト選択</h3>'
  +'<div style="font-size:12px;color:#888;margin-bottom:16px;">分析対象のキャストを選んでください</div>'
  +(isShimei?'<div style="margin-bottom:12px;"><button class="btn" onclick="analysisSt.castId=\'all\';analysisSt.castName=\'全キャスト\';md=\'anaDetail\';rModal()" style="width:100%;padding:11px;background:'+modeBg+';border:1px solid '+modeBdr+';color:'+modeColor+';border-radius:8px;font-size:14px;font-weight:700;touch-action:manipulation;">全キャスト</button></div>':"")
  +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px;margin-bottom:16px;">'
  +castBtns
  +'</div>'
  +(!isShimei?'<button class="btn" onclick="md=\'anaDateSel\';rModal()" style="width:100%;margin-bottom:8px;padding:9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#666;border-radius:6px;font-size:12px;touch-action:manipulation;">← 期間選択に戻る</button>':"")
  +'<button class="btn" onclick="closeM()" style="width:100%;padding:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:6px;font-size:13px;touch-action:manipulation;">キャンセル</button>'
  +'</div></div>';
  }
  else if(md==="anaActionSel"){
const {castName}=analysisSt;
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:420px;padding:20px;">'
  +'<h3 style="margin-bottom:4px;font-size:16px;color:#d4a017;">'+castName+'</h3>'
  +'<div style="font-size:12px;color:#888;margin-bottom:16px;">表示する内容を選択してください</div>'
  +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">'
  +'<button class="btn" onclick="md=\'anaDetail\';rModal()" style="padding:16px 10px;background:rgba(212,160,23,.08);border:1px solid rgba(212,160,23,.25);color:#d4a017;border-radius:8px;font-size:14px;font-weight:800;touch-action:manipulation;">売上</button>'
  +'<button class="btn" onclick="md=\'anaCastInfo\';rModal()" style="padding:16px 10px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.25);color:#38bdf8;border-radius:8px;font-size:14px;font-weight:800;touch-action:manipulation;">詳細情報</button>'
  +'</div>'
  +'<button class="btn" onclick="md=\'anaCastSel\';rModal()" style="width:100%;margin-bottom:8px;padding:9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#666;border-radius:6px;font-size:12px;touch-action:manipulation;">← キャスト選択に戻る</button>'
  +'<button class="btn" onclick="closeM()" style="width:100%;padding:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:6px;font-size:13px;touch-action:manipulation;">閉じる</button>'
  +'</div></div>';
  }
  else if(md==="anaCastInfo"){
const {castId,castName}=analysisSt;
const filtered=getFilteredHist();
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:760px;padding:20px;max-height:84vh;overflow-y:auto;">'
  +'<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;">'
  +'<h3 style="font-size:16px;color:#38bdf8;">詳細情報 — '+castName+'</h3>'
  +'<button class="btn" onclick="md=\'anaActionSel\';rModal()" style="padding:5px 12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#888;border-radius:4px;font-size:12px;touch-action:manipulation;">戻る</button>'
  +'</div>'
  +anaCastDetailHtml(filtered,castId,castName)
  +'<button class="btn" onclick="md=\'anaActionSel\';rModal()" style="width:100%;margin-top:10px;padding:9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#666;border-radius:6px;font-size:12px;touch-action:manipulation;">← 売上 / 詳細情報に戻る</button>'
  +'<button class="btn" onclick="closeM()" style="width:100%;margin-top:6px;padding:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:6px;font-size:13px;touch-action:manipulation;">閉じる</button>'
  +'</div></div>';
  }
  else if(md==="anaDetail"){
const {mode,castId,castName}=analysisSt;
const filtered=getFilteredHist();
const isShimei=mode==="shimei";
const modeColor=isShimei?"#ff6b6b":"#d4a017";
const modeLabel=isShimei?"指名情報":"売上";
let statsHtml="";
let histListHtml="";
let csvCall="";
let relevantRecs=[];
if(isShimei){
  if(castId==="all"){
    statsHtml+='<div style="display:grid;grid-template-columns:1fr auto auto;gap:4px;font-size:11px;color:#555;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.06);margin-bottom:2px;"><span>キャスト</span><span style="text-align:right;">本指名</span><span style="text-align:right;">場内指名</span></div>';
    activeRegularCasts().forEach(c=>{
      const hon=filtered.filter(h=>(h.items||[]).some(i=>i.isHonShimei&&String(i.castId)===String(c.id))).length;
      const ban=filtered.filter(h=>(h.items||[]).some(i=>i.isBanaiShimei&&String(i.castId)===String(c.id))).length;
      if(!hon&&!ban)return;
      statsHtml+='<div style="display:grid;grid-template-columns:1fr auto auto;gap:4px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04);"><span style="font-size:13px;color:#e8dcc8;">'+c.name+'</span><span style="font-size:13px;color:#ff4444;text-align:right;min-width:44px;">'+hon+'件</span><span style="font-size:13px;color:#4ade80;text-align:right;min-width:52px;">'+ban+'件</span></div>';
    });
    relevantRecs=filtered.filter(h=>(h.items||[]).some(i=>i.isHonShimei||i.isBanaiShimei));
    csvCall="exportAllShimeiCSV(getFilteredHist())";
  } else {
    const cid=String(castId);
    const hon=filtered.filter(h=>(h.items||[]).some(i=>i.isHonShimei&&String(i.castId)===cid)).length;
    const ban=filtered.filter(h=>(h.items||[]).some(i=>i.isBanaiShimei&&String(i.castId)===cid)).length;
    statsHtml+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px;">';
    statsHtml+='<div style="padding:10px;background:rgba(255,68,68,.06);border:1px solid rgba(255,68,68,.15);border-radius:6px;text-align:center;"><div style="font-size:10px;color:#888;margin-bottom:2px;">本指名</div><div style="font-size:20px;font-weight:700;color:#ff4444;">'+hon+'<span style="font-size:12px;">件</span></div></div>';
    statsHtml+='<div style="padding:10px;background:rgba(74,222,128,.06);border:1px solid rgba(74,222,128,.15);border-radius:6px;text-align:center;"><div style="font-size:10px;color:#888;margin-bottom:2px;">場内指名</div><div style="font-size:20px;font-weight:700;color:#4ade80;">'+ban+'<span style="font-size:12px;">件</span></div></div>';
    statsHtml+='</div>';
    relevantRecs=filtered.filter(h=>(h.items||[]).some(i=>(i.isHonShimei||i.isBanaiShimei)&&String(i.castId)===cid));
    csvCall="exportShimeiCastCSV(getFilteredHist(),'"+castId+"','"+castName+"')";
  }
} else {
  const cid=String(castId);
  const allRecs=filtered.filter(h=>(h.items||[]).some(i=>(i.isHonShimei||i.isBanaiShimei)&&String(i.castId)===cid));
  // 場内延長: banaiExtCastIds(複数対応)にこのキャストを含むextensionアイテムを持つ履歴
  const _becMatch=(i)=>i.isBanaiExtension&&((i.banaiExtCastIds||[]).map(String).includes(cid)||(i.banaiExtCastId&&String(i.banaiExtCastId)===cid));
  // 場内延長はオールフリー（本指名なし）のテーブルのみ対象
  const banaiExtRecs=filtered.filter(h=>(h.items||[]).some(_becMatch)&&!(h.items||[]).some(i=>i.isHonShimei));
  const honRecs=allRecs.filter(h=>(h.items||[]).some(i=>i.isHonShimei&&String(i.castId)===cid));
  const kumi=allRecs.length;
  const guests=allRecs.reduce((a,h)=>a+(h.guests||0),0);
  // 本指名売上: テーブル小計を同テーブルの本指名人数で均等分配
  const sub=honRecs.reduce((a,h)=>{
    const honCount=Math.max(1,(h.items||[]).filter(i=>i.isHonShimei).length);
    return a+(h.subtotal||h.total)/honCount;
  },0);
  // 場内延長売上: オールフリーのみ・場内延長以降の小計を対象キャスト数で均等分配
  const banaiExtSub=banaiExtRecs.reduce((a,h)=>a+banaiExtensionSalesForCast(h.items,cid),0);
  const banaiExtBack=banaiExtRecs.reduce((a,h)=>a+banaiExtensionBackSalesForCast(h.items,cid),0);
  const hon=honRecs.length;
  const ban=allRecs.filter(h=>(h.items||[]).some(i=>i.isBanaiShimei&&String(i.castId)===cid)).length;
  const banaiExt=banaiExtRecs.length;
  const dohan=allRecs.filter(h=>(h.items||[]).some(i=>i.label==="同伴料")).length;
  const workHStr=_fmtWorkH(_getShiftMsForCast(castId,filtered));
  statsHtml+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-bottom:6px;">';
  statsHtml+='<div style="padding:8px;background:rgba(212,160,23,.06);border:1px solid rgba(212,160,23,.15);border-radius:6px;text-align:center;"><div style="font-size:10px;color:#888;">小計（本指名）</div><div style="font-size:14px;font-weight:700;color:#d4a017;">'+pAmt(Math.round(sub))+'</div></div>';
  statsHtml+='<div style="padding:8px;background:rgba(255,165,0,.06);border:1px solid rgba(255,165,0,.2);border-radius:6px;text-align:center;"><div style="font-size:10px;color:#888;">小計（場内延長）</div><div style="font-size:14px;font-weight:700;color:#ffa500;">'+pAmt(Math.round(banaiExtSub))+'</div></div>';
  statsHtml+='<div style="padding:8px;background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2);border-radius:6px;text-align:center;"><div style="font-size:10px;color:#888;">場延バック</div><div style="font-size:14px;font-weight:700;color:#f59e0b;">'+pAmt(Math.round(banaiExtBack))+'</div></div>';
  statsHtml+='<div style="padding:8px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:6px;text-align:center;"><div style="font-size:10px;color:#888;">組数</div><div style="font-size:15px;font-weight:700;color:#e8dcc8;">'+kumi+'<span style="font-size:11px;color:#888;">組</span></div></div>';
  statsHtml+='</div>';
  statsHtml+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:6px;margin-bottom:4px;">';
  statsHtml+='<div style="padding:8px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:6px;text-align:center;"><div style="font-size:10px;color:#888;">総客数</div><div style="font-size:14px;font-weight:700;color:#e8dcc8;">'+guests+'<span style="font-size:10px;color:#888;">名</span></div></div>';
  statsHtml+='<div style="padding:8px;background:rgba(255,68,68,.06);border:1px solid rgba(255,68,68,.15);border-radius:6px;text-align:center;"><div style="font-size:10px;color:#888;">本指名</div><div style="font-size:14px;font-weight:700;color:#ff4444;">'+hon+'件</div></div>';
  statsHtml+='<div style="padding:8px;background:rgba(74,222,128,.06);border:1px solid rgba(74,222,128,.15);border-radius:6px;text-align:center;"><div style="font-size:10px;color:#888;">場内指名</div><div style="font-size:14px;font-weight:700;color:#4ade80;">'+ban+'件</div></div>';
  statsHtml+='<div style="padding:8px;background:rgba(255,165,0,.06);border:1px solid rgba(255,165,0,.2);border-radius:6px;text-align:center;"><div style="font-size:10px;color:#888;">場内延長</div><div style="font-size:14px;font-weight:700;color:#ffa500;">'+banaiExt+'件</div></div>';
  statsHtml+='<div style="padding:8px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:6px;text-align:center;"><div style="font-size:10px;color:#888;">同伴</div><div style="font-size:14px;font-weight:700;color:#e8dcc8;">'+dohan+'件</div></div>';
  statsHtml+='</div>';
  statsHtml+='<div style="display:grid;grid-template-columns:1fr;gap:6px;margin-bottom:4px;">';
  statsHtml+='<div style="padding:8px;background:rgba(56,189,248,.06);border:1px solid rgba(56,189,248,.15);border-radius:6px;text-align:center;"><div style="font-size:10px;color:#888;">稼働時間</div><div style="font-size:14px;font-weight:700;color:#38bdf8;">'+workHStr+'h</div></div>';
  statsHtml+='</div>';
  // 場内延長のあるレコードも含める
  const allRelevant=[...new Map([...allRecs,...banaiExtRecs].map(r=>[r.id,r])).values()];
  relevantRecs=allRelevant;
  csvCall="exportUriageCSV(getFilteredHist(),'"+castId+"','"+castName+"')";
}
if(relevantRecs.length){
  histListHtml+='<div style="margin-top:12px;border-top:1px solid rgba(255,255,255,.08);padding-top:10px;">';
  histListHtml+='<div style="font-size:11px;color:#666;margin-bottom:8px;">使用履歴 ('+relevantRecs.length+'件)</div>';
  [...relevantRecs].sort((a,b)=>b.startTime-a.startTime).forEach(rec=>{
    const dT=new Date(rec.startTime).toLocaleString("ja-JP",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
    const honN=(rec.items||[]).filter(i=>i.isHonShimei).map(itemCastName).filter(Boolean);
    const banN=(rec.items||[]).filter(i=>i.isBanaiShimei).map(itemCastName).filter(Boolean);
    histListHtml+='<div data-arid="'+rec.id+'" onclick="window._viewHistRec=_findHistRec(Number(this.dataset.arid));window._histDetailBack=\'anaDetail\';if(window._viewHistRec){md=\'viewHistDetail\';rModal();}" style="padding:7px 0;border-bottom:1px solid rgba(255,255,255,.04);display:flex;flex-wrap:wrap;align-items:center;gap:5px;cursor:pointer;">';
    histListHtml+='<span style="font-size:12px;font-weight:700;color:#d4a017;">'+rec.tableLabel+'</span>';
    if(rec.note)histListHtml+='<span style="font-size:11px;color:#ffa500;background:rgba(255,165,0,.1);padding:1px 6px;border-radius:8px;">'+rec.note+'</span>';
    histListHtml+='<span style="font-size:11px;color:#888;">'+dT+'</span>';
    histListHtml+='<span style="font-size:11px;color:#aaa;">'+rec.guests+'名</span>';
    if(honN.length)histListHtml+='<span style="font-size:10px;color:#ff4444;background:rgba(255,68,68,.1);padding:1px 6px;border-radius:8px;">本: '+honN.join("・")+'</span>';
    if(banN.length)histListHtml+='<span style="font-size:10px;color:#4ade80;background:rgba(74,222,128,.1);padding:1px 6px;border-radius:8px;">場: '+banN.join("・")+'</span>';
    histListHtml+='<span style="margin-left:auto;font-size:11px;color:#d4a017aa;">小計 '+pAmt(rec.subtotal||rec.total)+'</span>';
    histListHtml+='<span style="font-size:10px;color:#d4a017;padding:1px 6px;border:1px solid rgba(212,160,23,.3);border-radius:3px;flex-shrink:0;">明細 ▶</span>';
    histListHtml+='</div>';
  });
  histListHtml+='</div>';
}
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:520px;padding:20px;max-height:82vh;overflow-y:auto;">'
  +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
  +'<h3 style="font-size:16px;color:'+modeColor+';">'+modeLabel+(castId==="all"?" (全キャスト)":" — "+castName)+'</h3>'
  +'<button class="btn" onclick="'+csvCall+'" style="padding:5px 14px;background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.25);color:#4ade80;border-radius:4px;font-size:12px;touch-action:manipulation;">CSV</button>'
  +'</div>'
  +statsHtml
  +histListHtml
  +'<button class="btn" onclick="md=\''+(isShimei?'anaCastSel':'anaActionSel')+'\';rModal()" style="width:100%;margin-top:14px;padding:9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#666;border-radius:6px;font-size:12px;touch-action:manipulation;">← 戻る</button>'
  +'<button class="btn" onclick="closeM()" style="width:100%;margin-top:6px;padding:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:6px;font-size:13px;touch-action:manipulation;">閉じる</button>'
  +'</div></div>';
  }
  else if(md==="viewHistDetail"){
const _hr=window._viewHistRec;
if(!_hr){h='<div class="mo" onclick="closeM()"><div class="mb">エラー</div></div>';}
else{
  const dur=Math.round((_hr.endTime-_hr.startTime)/60000);
  const inTime=new Date(_hr.startTime).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"});
  const outTime=new Date(_hr.endTime).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"});
  let itRows="";
  [...(_hr.items||[])].forEach(i=>{const isDisc=i.isDiscount;itRows+='<div class="ir" style="font-size:13px;"><span style="color:'+(isDisc?"#ff6b6b":"#bbb")+'">'+(i.qty>1?i.label+" × "+i.qty:i.label)+'</span><span style="color:'+(isDisc?"#ff6b6b":"#d4a017")+'">'+(isDisc?"-":"")+pAmt(Math.abs(i.price*(i.qty||1)))+'</span></div>';});
  h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:480px;">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px;">'
    +'<div><span style="font-size:16px;font-weight:700;color:#d4a017;">'+_hr.tableLabel+'</span>'
    +(_hr.note?'<span style="font-size:12px;color:#ffa500;margin-left:8px;">'+_hr.note+'</span>':"")
    +'<span style="font-size:13px;color:#aaa;margin-left:8px;">'+_hr.guests+'名</span></div>'
    +'<span style="font-size:12px;color:#888;">'+inTime+'〜'+outTime+' ('+dur+'分)</span>'
    +'</div>'
    +'<div style="margin-bottom:12px;">'+itRows+'</div>'
    +'<div style="border-top:1px solid rgba(255,255,255,.08);padding-top:10px;">'
    +(_hr.discount>0?'<div class="ir" style="font-size:12px;"><span style="color:#888;">小計</span><span>'+pAmt(_hr.subtotal)+'</span></div>'+'<div class="ir" style="font-size:12px;"><span style="color:#ff6b6b;">割引</span><span style="color:#ff6b6b;">-'+pAmt(_hr.discount)+'</span></div>':"")
    +'<div class="ir" style="font-size:12px;"><span style="color:#888;">tax+SC ('+Math.round((_hr.rate||TAX_RATE)*100)+'%)</span><span>'+pAmt(_hr.tax)+'</span></div>'
    +'<div class="ir" style="font-size:15px;font-weight:700;"><span>合計</span><span style="color:#d4a017;">'+pAmt(_hr.total)+'</span></div>'
    +'</div>'
    +(window._histDetailBack?'<button class="btn" onclick="md=\''+window._histDetailBack+'\';rModal()" style="width:100%;margin-top:16px;padding:9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#666;border-radius:6px;font-size:12px;touch-action:manipulation;">← 売上情報に戻る</button>':'')
    +'<button class="btn" onclick="closeM()" style="width:100%;margin-top:'+(window._histDetailBack?'6':'16')+'px;padding:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:6px;font-size:13px;">閉じる</button>'
    +'</div></div>';
}
  }
  else if(md==="castStatus"){
const castId=window._statusCastId;
const sh=getShiftByCastId(castId);
if(!sh){h='<div class="mo" onclick="closeM()"><div class="mb">エラー</div></div>';}
else{
  const status=sh.status||"waiting";
  const statusLbl=status==="break"?"休憩中":"待機中";
  const statusBg=status==="break"?"rgba(255,165,0,.1)":"rgba(74,222,128,.1)";
  const statusCol=status==="break"?"#ffa500":"#4ade80";
  const logs=sh.statusLog||[];
  const lastLog=logs.filter(l=>l.status===status&&!l.endTime).pop();
  const elapsed=lastLog?(Date.now()-lastLog.startTime):(Date.now()-sh.clockIn);
  const inT=new Date(sh.clockIn).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"});
  const activeTables=S.tables.filter(t=>S.sessions[t.id]);
  h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:440px;padding:20px;">'
    // キャスト名・状態
    +'<div style="text-align:center;padding:18px;background:'+statusBg+';border:2px solid '+statusCol+'44;border-radius:12px;margin-bottom:18px;">'
    +'<div style="font-size:24px;font-weight:700;color:#e8dcc8;letter-spacing:.05em;margin-bottom:6px;">'+sh.castName+'</div>'
    +'<div style="font-size:14px;color:'+statusCol+';margin-bottom:10px;">'+statusLbl+'&nbsp;&nbsp;入店: '+inT+'〜</div>'
    +'<div data-modal-timer="'+(lastLog?lastLog.startTime:sh.clockIn)+'" style="font-size:32px;font-family:monospace;font-weight:700;color:'+statusCol+';">'+ts(elapsed).slice(3)+'</div>'
    +'</div>'
    // テーブルへ付ける
    +'<div class="st" style="margin-bottom:10px;">テーブルへ付ける</div>'
    +(activeTables.length
      ?'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px;margin-bottom:16px;">'
        +activeTables.map(t=>{
          const ts2=S.sessions[t.id];
          const guests=ts2?.guests||"";
          return '<button class="btn" data-tid10="'+t.id+'" data-cid10b="'+castId+'" data-cn10b="'+sh.castName+'" onclick="openTsukeAuto(this.dataset.cid10b,this.dataset.cn10b,this.dataset.tid10,null)" style="padding:12px 8px;background:rgba(167,139,250,.1);border:2px solid rgba(167,139,250,.3);color:#a78bfa;border-radius:8px;font-size:13px;font-weight:700;text-align:center;touch-action:manipulation;">'+t.label+'<div style="font-size:10px;color:#a78bfa88;margin-top:2px;">'+guests+'名</div></button>';
        }).join("")
        +'</div>'
      :'<div style="font-size:12px;color:#444;margin-bottom:16px;padding:10px;background:rgba(255,255,255,.03);border-radius:6px;text-align:center;">入店中のテーブルなし</div>'
    )
    // 状態変更
    +'<div class="st" style="margin-bottom:10px;">状態を変更</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">'
    +(status!=="waiting"?'<button class="btn" data-cid10="'+castId+'" onclick="moveToWaiting(this.dataset.cid10);closeM()" style="padding:14px;background:rgba(74,222,128,.12);border:2px solid rgba(74,222,128,.3);color:#4ade80;border-radius:8px;font-size:14px;font-weight:700;touch-action:manipulation;">待機へ</button>':"<div></div>")
    +(status!=="break"?'<button class="btn" data-cid11="'+castId+'" onclick="moveToBreak(this.dataset.cid11);closeM()" style="padding:14px;background:rgba(255,165,0,.1);border:2px solid rgba(255,165,0,.3);color:#ffa500;border-radius:8px;font-size:14px;font-weight:700;touch-action:manipulation;">休憩へ</button>':"<div></div>")
    +'</div>'
    // 退勤登録 or 退勤取消
    +(sh.clockOut
      ?'<button class="btn" data-sid14="'+sh.id+'" onclick="cancelClockOut(this.dataset.sid14)" style="width:100%;padding:14px;background:rgba(74,222,128,.1);border:2px solid rgba(74,222,128,.3);color:#4ade80;border-radius:8px;font-size:15px;font-weight:700;margin-bottom:10px;touch-action:manipulation;">↩ 退勤を取消して出勤に戻す</button>'
      :'<button class="btn" data-sid13="'+sh.id+'" onclick="shiftMd={step:\'time\',mode:\'out\',castId:\''+castId+'\',shiftId:this.dataset.sid13,time:roundHHMM(15)};md=\'shift\';rModal()" style="width:100%;padding:14px;background:rgba(255,80,80,.12);border:2px solid rgba(255,80,80,.35);color:#ff6b6b;border-radius:8px;font-size:15px;font-weight:700;margin-bottom:10px;touch-action:manipulation;">退勤登録</button>'
    )
    +'<button class="btn" data-cid12="'+castId+'" onclick="window._historyCastId=this.dataset.cid12;md=\'castHistory\';rModal()" style="width:100%;padding:11px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:6px;font-size:13px;touch-action:manipulation;">付け回し履歴</button>'
    +'<button class="btn" onclick="closeM()" style="width:100%;margin-top:8px;padding:9px;font-size:12px;color:#555;background:none;">閉じる</button>'
    +'</div></div>';
}
  }
  else if(md==="castHistory"){
const castId=window._historyCastId;
const sh=Object.values(S.shifts||{}).find(sh=>String(sh.castId)===String(castId));
const cname=sh?.castName||S.casts.find(c=>String(c.id)===String(castId))?.name||"不明";
// このキャストの全付け回し履歴（現在の営業日）
const myA=Object.values(S.assignments||{}).filter(a=>String(a.castId)===String(castId)).sort((a,b)=>a.startTime-b.startTime);
// statusLog
const slog=(sh?.statusLog||[]).slice().reverse();
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:420px;">'
  +'<h3 style="margin-bottom:4px;font-size:16px;color:#d4a017;">'+cname+' の履歴</h3>'
  +'<div style="font-size:11px;color:#666;margin-bottom:14px;">本営業日</div>'
  // 付け回し履歴
  +(myA.length?'<div class="st" style="margin-bottom:8px;">付け回し ('+myA.length+'件)</div>'
    +'<div style="max-height:30vh;overflow-y:auto;margin-bottom:14px;">'
    +myA.slice().reverse().map(a=>{
      const col=ASSIGN_TYPES[a.type]?.col||"#888";
      const lbl=ASSIGN_TYPES[a.type]?.label||a.type;
      const sT=new Date(a.startTime).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"});
      const eT=a.endTime?new Date(a.endTime).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}):"継続中";
      const dur=a.endTime?fmtDur(a.endTime-a.startTime):"";
      const tbl=S.tables.find(t=>t.id===a.tableId)?.label||a.tableId;
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05);">'
        +'<div><span style="font-size:10px;padding:1px 5px;border:1px solid '+col+'77;color:'+col+';border-radius:3px;margin-right:6px;">'+lbl+'</span><span style="font-size:12px;color:#bbb;">'+tbl+'</span></div>'
        +'<span style="font-size:11px;color:#555;">'+sT+'〜'+eT+(dur?' ('+dur+')':'')+'</span>'
        +'</div>';
    }).join("")
    +'</div>':'<div style="font-size:12px;color:#444;margin-bottom:14px;">付け回し履歴なし</div>')
  // 待機・休憩ログ
  +(slog.length?'<div class="st" style="margin-bottom:8px;">待機・休憩ログ</div>'
    +'<div style="max-height:20vh;overflow-y:auto;">'
    +slog.map(l=>{
      const col=l.status==="waiting"?"#4ade80":"#ffa500";
      const lbl=l.status==="waiting"?"待機":"休憩";
      const sT=new Date(l.startTime).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"});
      const eT=l.endTime?new Date(l.endTime).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}):"継続中";
      const dur=l.endTime?fmtDur(l.endTime-l.startTime):(fmtDur(Date.now()-l.startTime)+"〜");
      return '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04);">'
        +'<span style="font-size:11px;color:'+col+';">'+lbl+'</span>'
        +'<span style="font-size:11px;color:#555;">'+sT+'〜'+eT+' ('+dur+')</span>'
        +'</div>';
    }).join("")+'</div>':'')
  +'<button class="btn" onclick="closeM()" style="width:100%;margin-top:14px;padding:9px;font-size:12px;color:#555;background:none;">閉じる</button>'
  +'</div></div>';
  }
  else if(md==="changeType"){
const a=S.assignments[window._editAid];
if(!a){h='<div class="mo" onclick="closeM()"><div class="mb">エラー</div></div>';}
else{
  let typeBtns="";
  Object.entries(ASSIGN_TYPES).forEach(([key,{label,col}])=>{
    const isCur=a.type===key;
    typeBtns+='<button class="btn" data-key="'+key+'" data-aid6="'+a.id+'" onclick="changeAssignType(this.dataset.aid6,this.dataset.key)" style="flex:1;padding:14px 8px;border-radius:8px;font-size:14px;font-weight:700;background:'+(isCur?"rgba(0,0,0,.3)":"rgba(0,0,0,.15)")+';border:2px solid '+col+(isCur?""+"88":"")+';color:'+col+';text-align:center;touch-action:manipulation;">'+(isCur?"✓ ":"")+label+'</button>';
  });
  h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:380px;">'
    +'<h3 style="margin-bottom:4px;font-size:16px;color:#a78bfa;">タイプ変更</h3>'
    +'<div style="font-size:14px;font-weight:700;color:#e8dcc8;margin-bottom:16px;">'+a.castName+'</div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;">'+typeBtns+'</div>'
    +'<button class="btn" onclick="closeM()" style="width:100%;margin-top:12px;padding:9px;font-size:12px;color:#555;background:none;">キャンセル</button>'
    +'</div></div>';
}
  }
  else if(md==="editAssignTime"){
const a=S.assignments[window._editAid];
if(!a){h='<div class="mo" onclick="closeM()"><div class="mb">エラー</div></div>';}
else{
  const sHHMM=new Date(a.startTime).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"});
  const eHHMM=a.endTime?new Date(a.endTime).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}):"";
  const col=ASSIGN_TYPES[a.type]?.col||"#888";
  const lbl=ASSIGN_TYPES[a.type]?.label||a.type;
  h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:360px;">'
    +'<h3 style="margin-bottom:4px;font-size:16px;color:#a78bfa;">時刻変更</h3>'
    +'<div style="margin-bottom:14px;"><span style="font-size:11px;padding:2px 7px;border:1px solid '+col+';color:'+col+';border-radius:3px;margin-right:8px;">'+lbl+'</span><span style="font-size:15px;font-weight:700;color:#e8dcc8;">'+a.castName+'</span></div>'
    +'<div class="st" style="margin-bottom:6px;">開始時刻</div>'
    +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">'
    +'<button class="btn" onclick="const el=document.getElementById(\'eat-start\');el.value=adjustHHMM(el.value,-1);" style="width:40px;height:40px;font-size:16px;font-weight:700;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#ccc;border-radius:6px;touch-action:manipulation;">−</button>'
    +'<input type="time" id="eat-start" class="ip" value="'+sHHMM+'" style="flex:1;font-size:16px;text-align:center;height:40px;padding:0;"/>'
    +'<button class="btn" onclick="const el=document.getElementById(\'eat-start\');el.value=adjustHHMM(el.value,1);" style="width:40px;height:40px;font-size:16px;font-weight:700;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#ccc;border-radius:6px;touch-action:manipulation;">＋</button>'
    +'</div>'
    +'<div style="display:flex;gap:5px;margin-bottom:12px;">'
    +([-10,-5,-1,1,5,10].map(d=>'<button class="btn" onclick="const el=document.getElementById(\'eat-start\');el.value=adjustHHMM(el.value,'+d+');" style="flex:1;padding:5px 2px;font-size:11px;font-weight:700;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#aaa;border-radius:5px;touch-action:manipulation;">'+(d>0?"+":"")+d+'</button>').join(""))
    +'</div>'
    +(a.endTime
      ?'<div class="st" style="margin-bottom:6px;">終了時刻</div>'
      +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">'
      +'<button class="btn" onclick="const el=document.getElementById(\'eat-end\');el.value=adjustHHMM(el.value,-1);" style="width:40px;height:40px;font-size:16px;font-weight:700;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#ccc;border-radius:6px;touch-action:manipulation;">−</button>'
      +'<input type="time" id="eat-end" class="ip" value="'+eHHMM+'" style="flex:1;font-size:16px;text-align:center;height:40px;padding:0;"/>'
      +'<button class="btn" onclick="const el=document.getElementById(\'eat-end\');el.value=adjustHHMM(el.value,1);" style="width:40px;height:40px;font-size:16px;font-weight:700;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#ccc;border-radius:6px;touch-action:manipulation;">＋</button>'
      +'</div>'
      +'<div style="display:flex;gap:5px;margin-bottom:14px;">'
      +([-10,-5,-1,1,5,10].map(d=>'<button class="btn" onclick="const el=document.getElementById(\'eat-end\');el.value=adjustHHMM(el.value,'+d+');" style="flex:1;padding:5px 2px;font-size:11px;font-weight:700;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#aaa;border-radius:5px;touch-action:manipulation;">'+(d>0?"+":"")+d+'</button>').join(""))
      +'</div>'
      :"")
    +'<div style="display:flex;gap:8px;">'
    +'<button class="btn gbg" onclick="saveAssignTimeEdit()" style="flex:2;padding:12px;font-size:14px;font-weight:700;border-radius:6px;touch-action:manipulation;">保存する</button>'
    +'<button class="btn" onclick="closeM()" style="flex:1;padding:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:6px;">キャンセル</button>'
    +'</div></div></div>';
}
  }
  else if(md==="startBizDay"){
const todayStr=getBizDate();
const selDate=window._selBizDate||todayStr;
const already=!!S.bizDays[selDate];
const rangeStr=getBizDateRange(selDate);
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:400px;">'
  +'<h3 style="margin-bottom:4px;font-size:18px;color:#d4a017;">営業を開始する</h3>'
  +'<div style="font-size:12px;color:#666;margin-bottom:20px;">営業日を選択してください</div>'
  +'<div class="st" style="margin-bottom:8px;">営業日</div>'
  +'<input type="date" class="ip" id="biz-date-input" value="'+selDate+'" style="font-size:16px;margin-bottom:8px;width:100%;max-width:200px;display:block;" oninput="updateBizDateWarn(this.value);document.getElementById(\'biz-range-note\').textContent=getBizDateRange(this.value)"/>'
  +'<div id="biz-range-note" style="font-size:12px;color:#888;margin-bottom:14px;">'+rangeStr+'</div>'
  +'<div id="biz-date-warn" style="padding:10px 14px;background:rgba(255,165,0,.08);border:1px solid rgba(255,165,0,.25);border-radius:6px;margin-bottom:14px;font-size:13px;color:#ffa500;display:'+(already?"":"none")+';">この日付は記録済みです。開始すると上書きされます。</div>'
  +'<div style="display:flex;gap:8px;">'
  +'<button class="btn gbg" onclick="startBizDay(document.getElementById(\'biz-date-input\').value)" style="flex:2;padding:14px;font-size:15px;font-weight:700;border-radius:8px;touch-action:manipulation;">開始する</button>'
  +'<button class="btn" onclick="window._selBizDate=null;closeM()" style="flex:1;padding:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:8px;">キャンセル</button>'
  +'</div></div></div>';
  }
  else if(md==="endBizDay"){
const active=S.activeBizDay?S.bizDays[S.activeBizDay]:null;
const sales=(S.history||[]).reduce((a,h)=>a+h.total,0);
const pendingSales=Object.values(S.sessions||{}).reduce((a,s)=>a+ct(s).total,0);
const shiftCount=Object.values(S.shifts||{}).length;
const assignCount=Object.values(S.assignments||{}).filter(a=>a.endTime).length;
const openSessions=Object.values(S.sessions||{}).length;
const onduty=getOnduty().sort((a,b)=>(a.clockIn||0)-(b.clockIn||0));
const hasOnduty=onduty.length>0;
h='<div class="mo" onclick="event.stopPropagation()"><div class="mb" onclick="event.stopPropagation()" style="max-width:440px;">'
  +'<h3 style="margin-bottom:4px;font-size:18px;color:#ff6b6b;">営業終了</h3>'
  +'<div style="font-size:13px;color:#888;margin-bottom:'+(active?.isReEdit?"8px":"20px")+'">'+(active?active.date:"")+'</div>'
  +(active?.isReEdit?'<div style="padding:8px 12px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.2);border-radius:5px;font-size:11px;color:#38bdf8;margin-bottom:14px;">過去データ読み込みモード — 保存時に編集済データとして別バックアップが作成されます</div>':"")
  // 本日サマリー
  +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;">'
  +'<div style="padding:12px;background:rgba(74,222,128,.06);border:1px solid rgba(74,222,128,.15);border-radius:8px;text-align:center;"><div style="font-size:10px;color:#888;margin-bottom:4px;">会計済み売上</div><div style="font-size:18px;font-weight:700;color:#4ade80;">'+pAmt(sales)+'</div></div>'
  +(pendingSales>0?'<div style="padding:12px;background:rgba(255,165,0,.06);border:1px solid rgba(255,165,0,.15);border-radius:8px;text-align:center;"><div style="font-size:10px;color:#ff6b6b;margin-bottom:4px;">未会計</div><div style="font-size:18px;font-weight:700;color:#ffa500;">'+pAmt(pendingSales)+'</div></div>':'<div style="padding:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:8px;text-align:center;"><div style="font-size:10px;color:#888;margin-bottom:4px;">出退勤</div><div style="font-size:18px;font-weight:700;color:#bbb;">'+shiftCount+'名</div></div>')
  +'</div>'
  +(openSessions>0?'<div style="padding:10px 14px;background:rgba(255,80,80,.08);border:1px solid rgba(255,80,80,.2);border-radius:6px;margin-bottom:16px;font-size:13px;color:#ff6b6b;">会計未了のテーブルが '+openSessions+' 卓あります</div>':"")
  +(hasOnduty?'<div style="padding:12px 14px;background:rgba(255,80,80,.1);border:1px solid rgba(255,80,80,.3);border-radius:8px;margin-bottom:16px;color:#ff6b6b;"><div style="font-size:13px;font-weight:700;margin-bottom:8px;">未退勤のキャストがいます。営業終了には全員の退勤が必須です。</div><div style="display:flex;flex-direction:column;gap:5px;">'+onduty.map(sh=>'<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;color:#ffd1d1;"><span>'+((sh.castName||"不明"))+'</span><span>出勤 '+new Date(sh.clockIn).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})+'</span></div>').join("")+'</div></div>':"")
  +'<div style="display:flex;gap:8px;">'
  +'<button class="btn" '+(hasOnduty?'disabled':'onclick="endBizDay()"')+' style="flex:2;padding:14px;font-size:15px;font-weight:700;border-radius:8px;background:rgba(255,80,80,.15);border:1px solid rgba(255,80,80,.35);color:#ff6b6b;touch-action:manipulation;'+(hasOnduty?'opacity:.45;cursor:not-allowed;':'')+'">終了して保存する</button>'
  +'<button class="btn" onclick="closeM()" style="flex:1;padding:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:8px;">戻る</button>'
  +'</div></div></div>';
  }
  else if(md==="dh"){
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:340px;"><h3 style="margin-bottom:12px;font-size:16px;">この履歴を削除しますか？</h3><p style="font-size:13px;color:#888;margin-bottom:20px;">削除した履歴は元に戻せません。</p><div style="display:flex;gap:10px;"><button class="btn" onclick="doh()" style="flex:1;padding:10px;background:rgba(255,80,80,.15);border:1px solid rgba(255,80,80,.3);color:#ff6b6b;border-radius:4px;font-weight:600;touch-action:manipulation;">削除する</button><button class="btn" onclick="closeM()" style="flex:1;padding:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#888;border-radius:4px;">キャンセル</button></div></div></div>';
  }
  else if(md==="tc"&&s){
const tl=S.tables.find(t=>t.id===at)?.label||"";
let tbs="";
S.tables.filter(t=>t.id!==at).forEach(t=>{
  const inuse=!!S.sessions[t.id];
  tbs+='<button class="btn" '+(inuse?"disabled":"")+' data-tid="'+t.id+'" onclick="tableChange(this.dataset.tid)" style="padding:14px 10px;text-align:center;background:'+(inuse?"rgba(255,255,255,.02)":"rgba(0,200,255,.08)")+';border:1px solid '+(inuse?"rgba(255,255,255,.05)":"rgba(0,200,255,.25)")+';color:'+(inuse?"#444":"#38bdf8")+';border-radius:6px;font-size:14px;cursor:'+(inuse?"not-allowed":"pointer")+';touch-action:manipulation;">'
    +t.label+(inuse?'<div style="font-size:10px;color:#555;margin-top:3px;">使用中</div>':'<div style="font-size:10px;margin-top:3px;opacity:.6;">移動</div>')+'</button>';
});
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:460px;">'
  +'<h3 style="margin-bottom:4px;font-size:16px;color:#38bdf8;">テーブルチェンジ</h3>'
  +'<div style="font-size:12px;color:#666;margin-bottom:16px;">'+tl+' の内容を別のテーブルへ移動</div>'
  +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;">'+tbs+'</div>'
  +'<button class="btn" onclick="closeM()" style="margin-top:16px;width:100%;padding:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#888;border-radius:4px;font-size:13px;">キャンセル</button>'
  +'</div></div>';
  }
  else if(md==="est"&&s){
h='<div class="mo" onclick="closeM()"><div class="mb" onclick="event.stopPropagation()" style="max-width:420px;">'
  +'<h3 style="margin-bottom:4px;font-size:16px;color:#ffd700;">概算</h3>'
  +'<div style="font-size:12px;color:#666;margin-bottom:16px;">'+S.tables.find(t=>t.id===at)?.label+' · '+s.guests+'名</div>'
  +(sessionRoomType(s)?'<div style="padding:9px 12px;margin-bottom:14px;background:rgba(124,77,255,.08);border:1px solid rgba(124,77,255,.2);border-radius:6px;color:#a78bfa;font-size:12px;">延長概算に'+roomTypeLabel(sessionRoomType(s))+'室料を自動追加</div>':'')
  // カスタム延長入力
  +'<div style="margin-bottom:14px;">'
  +'<div class="st" style="margin-bottom:8px;">カスタム延長（分）</div>'
  +'<div style="display:flex;gap:8px;align-items:center;">'
  +'<input type="number" id="est-custom-min" class="ip" inputmode="numeric" min="0" step="10" placeholder="例: 45" oninput="updateEstPreview()" style="flex:1;font-size:16px;text-align:center;" />'
  +'<span style="color:#666;font-size:13px;white-space:nowrap;">分延長</span>'
  +'</div>'
  +'</div>'
  // プレビュー（モーダル表示後にupdateEstPreviewで動的生成）
  +'<div id="est-preview" style="overflow-y:auto;max-height:45vh;"></div>'
  // ボタン
  +'<div style="display:flex;gap:8px;margin-top:16px;">'
  +'<button class="btn" onclick="printEstimate()" style="flex:1;padding:12px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);color:#ddd;border-radius:6px;font-size:14px;font-weight:600;touch-action:manipulation;">概算印刷</button>'
  +'<button class="btn" onclick="closeM()" style="flex:1;padding:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#888;border-radius:6px;font-size:13px;">閉じる</button>'
  +'</div>'
  +'</div></div>';
// DOMに挿入後すぐにプレビュー更新
c.innerHTML=h;
updateEstPreview();
return;
  }
  c.innerHTML=h;
}

function scc(id){cdc=id;cds=1;rModal();}
function addCDC(){const el=document.getElementById("cdp");const p=parseInt(el?.value||"",10);if(!p||p<=0)return;openCastDrinkQty(cdc,p,"その他 "+fmt(p)+"円");}
function addExt2(id,wsc){const e=S.menus.extensions.find(e=>e.id===id);if(e)addExt(e,wsc);}
function tryExt(){
  banaiExtCastIds=[];
  const s=S.sessions[at];if(!s){om('ext');return;}
  const isAllFree=!(s.honShimeis&&s.honShimeis.length>0);
  const hasBanai=(s.banaiShimeis||[]).length>0;
  if(isAllFree&&hasBanai){om('banai-ext-cast');}else{om('ext');}
}
function toggleBanaiExtCast(cid){
  banaiExtCastIds=banaiExtCastIds.includes(cid)?banaiExtCastIds.filter(id=>id!==cid):[...banaiExtCastIds,cid];
  rModal();
}
function confirmBanaiExtCasts(){if(banaiExtCastIds.length>0)om('ext');}
function addSCToSession(){
  const s=S.sessions[at];if(!s)return;
  const scPrice=(S.menus.options||[]).find(o=>o.id==="sc")?.price||2000;
  s.items=[...s.items,{id:"sc_add_"+Date.now(),label:"シングルチャージ",price:scPrice,qty:1}];
  save("sessions/"+at,S.sessions[at]);closeM();renderOrderPartial();
}
function doh(){S.history=S.history.filter(h=>h.id!==dhi);save("history/"+dhi,null);dhi=null;closeM();render();}

// ===== 出勤・退勤 =====
const ASSIGN_TYPES={hon:{label:"本指名",col:"#ff4444"},free:{label:"フリー",col:"#38bdf8"},help:{label:"ヘルプ",col:"#e8dcc8"},banai:{label:"場内指名",col:"#4ade80"}};
const TYPE_SFX={hon:"本",free:"F",help:"H",banai:"場"};
let shiftMd={step:"cast",mode:"in",castId:null,shiftId:null,time:""};
let tsukeMd={step:"cast",castId:null,type:null,time:"",useNow:true};

function nowHHMM(){const d=new Date();return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");}
// 営業日定義: 19:00～翌18:59。19:00以降は当日、18:59以前は前日が営業日
function getBizDate(){const d=new Date();if(d.getHours()<19){d.setDate(d.getDate()-1);}return d.toLocaleDateString("sv-SE");}
function getBizDateRange(dateStr){
  const d=new Date(dateStr+"T19:00:00");
  const next=new Date(d);next.setDate(next.getDate()+1);
  const fmt=dt=>(dt.getMonth()+1)+"/"+(dt.getDate());
  return fmt(d)+" 19:00 ～ "+fmt(next)+" 18:59";
}
function roundHHMM(stepMin){
  const d=new Date();
  const total=d.getHours()*60+d.getMinutes();
  const rounded=Math.round(total/stepMin)*stepMin;
  const h=Math.floor(rounded/60)%24;const m=rounded%60;
  return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0");
}
function adjustHHMM(hhmm,deltaMins){
  // HH:MM を deltaMins 分増減して返す
  if(!hhmm||!hhmm.includes(":"))hhmm=roundHHMM(1);
  const [h,m]=hhmm.split(":").map(Number);
  let total=h*60+m+deltaMins;
  total=((total%1440)+1440)%1440; // 24時間循環
  return String(Math.floor(total/60)).padStart(2,"0")+":"+String(total%60).padStart(2,"0");
}
function hhmm2ts(hhmm,bizDate){
  if(!hhmm||!hhmm.includes(":"))return Date.now();
  const[h,m]=hhmm.split(":").map(Number);
  const baseBizDate=bizDate||S.activeBizDay||getBizDate();
  const d=new Date(baseBizDate+"T19:00:00");
  if(h>=19)d.setHours(h,m,0,0);
  else{d.setDate(d.getDate()+1);d.setHours(h,m,0,0);}
  return d.getTime();
}
function getOnduty(){
  return Object.values(S.shifts||{}).filter(sh=>!sh.clockOut);
}
function getOndutyIds(){return new Set(getOnduty().map(sh=>sh.castId));}
function getWaitingCasts(){return getOnduty().filter(sh=>(sh.status||"waiting")==="waiting");}
function getBreakCasts(){return getOnduty().filter(sh=>sh.status==="break");}
function getActiveCasts(){return getOnduty().filter(sh=>sh.status==="active");}
function getShiftByCastId(castId){return getOnduty().find(sh=>String(sh.castId)===String(castId));}
function fmtDur(ms){
  ms=safeDurationMs(ms);
  const h=Math.floor(ms/3600000);const m=Math.floor((ms%3600000)/60000);
  return h>0?h+"h"+m+"m":m+"m";
}
const MAX_SHIFT_MS=24*60*60*1000;
function safeDurationMs(ms){
  ms=Number(ms)||0;
  if(!isFinite(ms)||ms<=0)return 0;
  return Math.min(ms,MAX_SHIFT_MS);
}
function safeShiftDurationMs(sh,nowMs){
  if(!sh)return 0;
  const start=Number(sh.clockIn)||0;
  const end=Number(sh.clockOut)||Number(nowMs||Date.now());
  if(!start||!end||!isFinite(start)||!isFinite(end)||end<=start)return 0;
  return safeDurationMs(end-start);
}
function remoteActiveShift(root,castId){
  return Object.values(root.shifts||{}).find(sh=>String(sh.castId)===String(castId)&&!sh.clockOut);
}
function remoteActiveAssign(root,castId,ignoreIds=[]){
  const ignored=ignoreIds.map(String);
  return Object.values(root.assignments||{}).find(a=>String(a.castId)===String(castId)&&!a.endTime&&!ignored.includes(String(a.id)));
}

async function clockIn(castId,time){
  const c=S.casts.find(c=>String(c.id)===String(castId));
  if(!c)return;
  const t=hhmm2ts(time||nowHHMM());
  const sid="sh_"+Date.now()+"_"+Math.random().toString(36).slice(2,7);
  // statusLogは待機・休憩の開始/終了を記録する配列
  const desired={id:sid,castId:c.id,castName:c.name,clockIn:t,clockOut:null,status:"waiting",statusLog:[{status:"waiting",startTime:t,endTime:null}]};
  await withDataOperation("cast:"+castId,async()=>{
    try{
      await guardedCheckedUpdateOptimistic(
        {[FB_ROOT+"/shifts/"+sid]:desired},
        root=>{
          if(remoteActiveShift(root,castId))return{ok:false,message:"このキャストは他端末で既に出勤中です。最新状態を確認してください。"};
          return{ok:true};
        },
        {createRecords:["shifts/"+sid],nodeUpdate:{createRecords:["shifts/"+sid],readActiveShiftCasts:[castId]}}
      );
      sbs(true,"同期済み ✓");closeM();render();
    }catch(e){
      sbs(false,"保存エラー");
      alert(e.userMessage||"出勤保存に失敗しました。最新状態を確認してください。");
    }
  });
}
function shiftWithStatus(shift,newStatus,changedAt=Date.now()){
  if(!shift)return null;
  const sh=cloneData(shift);
  // 現在のstatusLogの最後のエントリを閉じる
  if(!sh.statusLog)sh.statusLog=[];
  const last=sh.statusLog[sh.statusLog.length-1];
  if(last&&!last.endTime)last.endTime=changedAt;
  // 新しいステータスを追加（activeはログ不要）
  if(newStatus==="waiting"||newStatus==="break"){
sh.statusLog.push({status:newStatus,startTime:changedAt,endTime:null});
  }
  sh.status=newStatus;
  return sh;
}
async function clockOut(shiftId,time){
  const current=S.shifts[shiftId];if(!current)return;
  const expected=cloneData(current);
  const desired=cloneData(current);
  desired.clockOut=hhmm2ts(time||nowHHMM());
  // 退勤が出勤より前なら翌日扱い
  if(desired.clockOut<=desired.clockIn)desired.clockOut+=86400000;
  if(desired.clockOut-desired.clockIn>86400000){alert("勤務時間は24時間以内にしてください。");return;}
  await withDataOperation("cast:"+current.castId,async()=>{
    try{
      await guardedCheckedUpdateOptimistic(
        {[FB_ROOT+"/shifts/"+shiftId]:desired},
        root=>{
          const remote=(root.shifts||{})[shiftId];
          if(!remote)return{ok:false,message:"この出勤データは他端末で削除されています。最新状態を確認してください。"};
          if(remote.clockOut)return{ok:false,message:"このキャストは他端末で既に退勤済みです。最新状態を確認してください。"};
          if(remoteActiveAssign(root,current.castId))return{ok:false,message:"付け回し中のため退勤できません。先に付け回しを終了してください。"};
          return{ok:true};
        },
        {expectedRecords:{["shifts/"+shiftId]:expected},nodeUpdate:{expectedRecords:{["shifts/"+shiftId]:expected},readActiveAssignCasts:[current.castId]}}
      );
      sbs(true,"同期済み ✓");closeM();render();
    }catch(e){
      sbs(false,"保存エラー");
      alert(e.userMessage||"退勤保存に失敗しました。最新状態を確認してください。");
    }
  });
}
function saveLocalBackup(){/* localStorageバックアップは廃止、Firebase backup/bizDaysを使用 */}

async function cancelClockOut(shiftId){
  if(!confirm("退勤をキャンセルして出勤状態に戻します。よろしいですか？"))return;
  const current=S.shifts[shiftId];if(!current)return;
  const expected=cloneData(current);
  const desired=cloneData(current);
  delete desired.clockOut;
  // statusをwaitingに戻す
  desired.status="waiting";
  await withDataOperation("cast:"+current.castId,async()=>{
    try{
      await guardedCheckedUpdateOptimistic(
        {[FB_ROOT+"/shifts/"+shiftId]:desired},
        root=>{
          const other=Object.values(root.shifts||{}).find(sh=>String(sh.castId)===String(current.castId)&&String(sh.id)!==String(shiftId)&&!sh.clockOut);
          if(other)return{ok:false,message:"このキャストは別の出勤記録ですでに出勤中です。"};
          return{ok:true};
        },
        {expectedRecords:{["shifts/"+shiftId]:expected},nodeUpdate:{expectedRecords:{["shifts/"+shiftId]:expected},readActiveShiftCasts:[current.castId]}}
      );
      sbs(true,"同期済み ✓");closeM();render();
    }catch(e){
      sbs(false,"保存エラー");
      alert(e.userMessage||"退勤キャンセルの保存に失敗しました。最新状態を確認してください。");
    }
  });
}
function confirmShiftTime(){
  const el=document.getElementById("shift-time");
  const t=(el&&el.value)?el.value:nowHHMM();
  if(shiftMd.mode==="in"){
clockIn(shiftMd.castId,t);
  }else{
clockOut(shiftMd.shiftId,t);
  }
}
function openShiftMd(mode){
  shiftMd={step:"cast",mode,castId:null,shiftId:null,time:roundHHMM(15)};
  md="shift";rModal();
}
function editShift(sid){
  shiftMd.step="edit";shiftMd.shiftId=sid;md="shift";rModal();
}
async function saveShiftEdit(){
  const shiftId=shiftMd.shiftId;
  const current=S.shifts[shiftId];if(!current)return;
  const expected=cloneData(current);
  const desired=cloneData(current);
  const inEl=document.getElementById("se-in");
  const outEl=document.getElementById("se-out");
  if(inEl&&inEl.value)desired.clockIn=hhmm2ts(inEl.value);
  if(outEl&&outEl.value){
desired.clockOut=hhmm2ts(outEl.value);
if(desired.clockOut<=desired.clockIn)desired.clockOut+=86400000;
  }else{desired.clockOut=null;}
  if(desired.clockOut&&desired.clockOut-desired.clockIn>86400000){alert("勤務時間は24時間以内にしてください。");return;}
  await withDataOperation("cast:"+current.castId,async()=>{
    try{
      await guardedCheckedUpdateOptimistic(
        {[FB_ROOT+"/shifts/"+shiftId]:desired},
        root=>{
          const other=Object.values(root.shifts||{}).find(sh=>String(sh.castId)===String(current.castId)&&String(sh.id)!==String(shiftId)&&!sh.clockOut);
          if(!desired.clockOut&&other)return{ok:false,message:"このキャストは別の出勤記録ですでに出勤中です。"};
          if(!current.clockOut&&desired.clockOut&&remoteActiveAssign(root,current.castId))return{ok:false,message:"付け回し中のため退勤時刻を設定できません。先に付け回しを終了してください。"};
          return{ok:true};
        },
        {expectedRecords:{["shifts/"+shiftId]:expected},nodeUpdate:{expectedRecords:{["shifts/"+shiftId]:expected},readActiveShiftCasts:[current.castId],readActiveAssignCasts:[current.castId]}}
      );
      sbs(true,"同期済み ✓");closeM();render();
    }catch(e){
      sbs(false,"保存エラー");
      alert(e.userMessage||"出退勤時刻の保存に失敗しました。最新状態を確認してください。");
    }
  });
}
async function deleteShift(sid){
  const current=S.shifts[sid];if(!current)return;
  if(!confirm("この出退勤記録を削除します。よろしいですか？"))return;
  const expected=cloneData(current);
  await withDataOperation("cast:"+current.castId,async()=>{
    try{
      await guardedCheckedUpdate(
        {[FB_ROOT+"/shifts/"+sid]:null},
        root=>{
          if(!current.clockOut&&remoteActiveAssign(root,current.castId))return{ok:false,message:"付け回し中の出退勤記録は削除できません。"};
          return{ok:true};
        },
        {expectedRecords:{["shifts/"+sid]:expected}}
      );
      sbs(true,"同期済み ✓");closeM();render();
    }catch(e){
      sbs(false,"保存エラー");
      alert(e.userMessage||"出退勤記録の削除に失敗しました。最新状態を確認してください。");
    }
  });
}
function exportShiftCSV(){
  const data=Object.values(S.shifts||{});
  if(!data.length){alert("出勤データがありません");return;}
  const bom="\uFEFF";
  const header=["キャスト名","出勤時刻","退勤時刻","勤務時間"].join(",");
  const rows=data.sort((a,b)=>a.clockIn-b.clockIn).map(sh=>{
const inT=new Date(sh.clockIn).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"});
const outT=sh.clockOut?new Date(sh.clockOut).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"}):"退勤なし";
const dur=sh.clockOut?fmtDur(sh.clockOut-sh.clockIn):"";
return[sh.castName,inT,outT,dur].join(",");
  });
  const csv=bom+header+"\n"+rows.join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const bizDate=S.activeBizDay||getBizDate();
  const a=document.createElement("a");a.href=url;a.download="shift_"+bizDate+".csv";a.click();URL.revokeObjectURL(url);
}

// ===== 付け回し =====
function confirmTsuke(){
  const tableId=tsukeMd.tableId||at;
  if(!tableId){alert("テーブルを選択してください");return;}
  if(!tsukeMd.castId){alert("キャストを選択してください");return;}
  if(!tsukeMd.type){alert("種別を選択してください");return;}
  const useNow=tsukeMd.useNow!==false; // デフォルトtrue
  const prevAssignId=tsukeMd.prevAssignId||null;
  if(useNow){
startAssignNow(tsukeMd.castId,tableId,tsukeMd.type,prevAssignId);
  }else{
const el=document.getElementById("tsuke-time");
const t=(el&&el.value)?el.value:nowHHMM();
startAssign(tsukeMd.castId,tableId,tsukeMd.type,t,prevAssignId);
  }
  tsukeMd={step:"cast",castId:null,type:null,tableId:null,time:"",useNow:true,prevAssignId:null};
}
async function startAssignNow(castId,tableId,type,prevAssignId=null){
  return startAssignAt(castId,tableId,type,Date.now(),prevAssignId);
}
async function startAssign(castId,tableId,type,time,prevAssignId=null){
  return startAssignAt(castId,tableId,type,hhmm2ts(time||nowHHMM()),prevAssignId);
}
async function startAssignAt(castId,tableId,type,startTs,prevAssignId=null){
  if(isPendingCastMove(castId,prevAssignId)){sbs(false,"保存中...");return;}
  const c=S.casts.find(c=>String(c.id)===String(castId));
  if(!c){alert("キャストが見つかりません");return;}
  const localSession=S.sessions[tableId];
  if(!localSession){alert("このテーブルは会計済み、または空席です。");return;}
  const shift=getShiftByCastId(castId);
  if(!shift){alert("出勤していないキャストは付け回しできません。");return;}
  const existing=Object.values(S.assignments||{}).find(a=>String(a.castId)===String(castId)&&!a.endTime&&String(a.id)!==String(prevAssignId||""));
  if(existing){alert(c.name+"は既に"+(S.tables.find(t=>t.id===existing.tableId)?.label||"他テーブル")+"についています");return;}
  const previous=prevAssignId?S.assignments[prevAssignId]:null;
  if(prevAssignId&&(!previous||previous.endTime||String(previous.castId)!==String(castId))){alert("移動元の付け回し情報が最新ではありません。");return;}
  const aid="a_"+Date.now()+"_"+Math.random().toString(36).slice(2,7);
  const desiredAssignment={id:aid,castId:c.id,castName:c.name,tableId,type,startTime:startTs,attachedAt:startTs,endTime:null,sessionId:localSession.startTime};
  const desiredShift=shiftWithStatus(shift,"active",Date.now());
  const desiredPrevious=previous?{...cloneData(previous),endTime:startTs}:null;
  const updates={
    [FB_ROOT+"/assignments/"+aid]:desiredAssignment,
    [FB_ROOT+"/shifts/"+shift.id]:desiredShift
  };
  const expectedRecords={["shifts/"+shift.id]:cloneData(shift)};
  if(desiredPrevious){
    updates[FB_ROOT+"/assignments/"+previous.id]=desiredPrevious;
    expectedRecords["assignments/"+previous.id]=cloneData(previous);
  }
  await withDataOperation("cast:"+castId,async()=>{
    try{
      closeM();
      await guardedCheckedUpdateOptimistic(
        updates,
        root=>{
          const remoteSession=(root.sessions||{})[tableId];
          if(!remoteSession||Number(remoteSession.startTime||0)!==Number(localSession.startTime||0))return{ok:false,message:"対象テーブルは他端末で会計または変更されています。"};
          const remoteShift=(root.shifts||{})[shift.id];
          if(!remoteShift||remoteShift.clockOut)return{ok:false,message:"このキャストは他端末で退勤済みです。"};
          if(remoteActiveAssign(root,castId,[prevAssignId].filter(Boolean)))return{ok:false,message:"このキャストは他端末で既に付け回し中です。"};
          if(prevAssignId){
            const remotePrevious=(root.assignments||{})[prevAssignId];
            if(!remotePrevious||remotePrevious.endTime)return{ok:false,message:"移動元の付け回しは他端末ですでに終了しています。"};
          }
          return{ok:true};
        },
        {expectedRecords,createRecords:["assignments/"+aid],nodeUpdate:{expectedRecords,createRecords:["assignments/"+aid],readPaths:["sessions/"+tableId],readActiveAssignCasts:[castId]}}
      );
      sbs(true,"同期済み ✓");closeM();render();
    }catch(e){
      sbs(false,"保存エラー");
      alert(e.userMessage||"付け回し保存に失敗しました。最新状態を確認してください。");
    }
  });
}
async function changeAssignType(aid,newType){
  if(isPendingAssignment(aid)){sbs(false,"保存中...");return;}
  const current=S.assignments[aid];if(!current)return;
  const expected=cloneData(current);
  const desired={...cloneData(current),type:newType};
  await withDataOperation("assignment:"+aid,async()=>{
    try{
      await guardedRecordSet("assignments",aid,expected,desired);
      sbs(true,"同期済み ✓");closeM();render();
    }catch(e){
      sbs(false,"保存エラー");
      alert(e.userMessage||"付け回し種別の保存に失敗しました。最新状態を確認してください。");
    }
  });
}
function openChangeType(aid){if(isPendingAssignment(aid)){sbs(false,"保存中...");return;}window._editAid=aid;md="changeType";rModal();}
function openCastStatusModal(castId){window._statusCastId=castId;md="castStatus";rModal();}
async function endAssign(aid){
  if(isPendingAssignment(aid)){sbs(false,"保存中...");return;}
  const current=S.assignments[aid];if(!current)return;
  const expected=cloneData(current);
  const now2=Date.now();
  const desired={...cloneData(current),endTime:now2};
  const shift=getShiftByCastId(current.castId);
  const desiredShift=shift?shiftWithStatus(shift,"waiting",now2):null;
  const updates={[FB_ROOT+"/assignments/"+aid]:desired};
  const expectedRecords={["assignments/"+aid]:expected};
  if(desiredShift){
    updates[FB_ROOT+"/shifts/"+shift.id]=desiredShift;
    expectedRecords["shifts/"+shift.id]=cloneData(shift);
  }
  await withDataOperation("cast:"+current.castId,async()=>{
    try{
      closeM();
      await guardedCheckedUpdateOptimistic(updates,root=>{
        const remote=(root.assignments||{})[aid];
        if(!remote)return{ok:false,message:"この付け回しは他端末で削除されています。最新状態を確認してください。"};
        if(remote.endTime)return{ok:false,message:"この付け回しは他端末で既に終了済みです。最新状態を確認してください。"};
        return{ok:true};
      },{expectedRecords,nodeUpdate:{expectedRecords}});
      sbs(true,"同期済み ✓");closeM();render();
    }catch(e){
      sbs(false,"保存エラー");
      alert(e.userMessage||"付け回し終了に失敗しました。最新状態を確認してください。");
    }
  });
}
async function moveToBreak(castId){
  if(isPendingCastMove(castId,null)){sbs(false,"保存中...");return;}
  const now2=Date.now();
  const assignment=Object.values(S.assignments||{}).find(x=>String(x.castId)===String(castId)&&!x.endTime);
  const shift=getShiftByCastId(castId);
  if(!shift){alert("出勤情報が見つかりません。最新状態を確認してください。");return;}
  const desiredShift=shiftWithStatus(shift,"break",now2);
  const updates={[FB_ROOT+"/shifts/"+shift.id]:desiredShift};
  const expectedRecords={["shifts/"+shift.id]:cloneData(shift)};
  if(assignment){
    updates[FB_ROOT+"/assignments/"+assignment.id]={...cloneData(assignment),endTime:now2};
    expectedRecords["assignments/"+assignment.id]=cloneData(assignment);
  }
  await withDataOperation("cast:"+castId,async()=>{
    try{
      closeM();
      await guardedCheckedUpdateOptimistic(updates,root=>{
        const remoteAssignment=remoteActiveAssign(root,castId);
        if(assignment&&(!remoteAssignment||String(remoteAssignment.id)!==String(assignment.id)))return{ok:false,message:"付け回し状態が他端末で変更されています。"};
        if(!assignment&&remoteAssignment)return{ok:false,message:"このキャストは他端末で付け回し中です。"};
        return{ok:true};
      },{expectedRecords,nodeUpdate:{expectedRecords,readActiveAssignCasts:[castId]}});
      sbs(true,"同期済み ✓");closeM();render();
    }catch(e){
      sbs(false,"保存エラー");
      alert(e.userMessage||"休憩への変更に失敗しました。最新状態を確認してください。");
    }
  });
}
async function moveToWaiting(castId){
  if(isPendingCastMove(castId,null)){sbs(false,"保存中...");return;}
  const shift=getShiftByCastId(castId);
  if(!shift){alert("出勤情報が見つかりません。最新状態を確認してください。");return;}
  const desiredShift=shiftWithStatus(shift,"waiting",Date.now());
  const expectedRecords={["shifts/"+shift.id]:cloneData(shift)};
  await withDataOperation("cast:"+castId,async()=>{
    try{
      closeM();
      await guardedCheckedUpdateOptimistic(
        {[FB_ROOT+"/shifts/"+shift.id]:desiredShift},
        root=>remoteActiveAssign(root,castId)
          ?{ok:false,message:"付け回し中のため待機へ変更できません。先に付け回しを終了してください。"}
          :{ok:true},
        {expectedRecords,nodeUpdate:{expectedRecords,readActiveAssignCasts:[castId]}}
      );
      sbs(true,"同期済み ✓");closeM();render();
    }catch(e){
      sbs(false,"保存エラー");
      alert(e.userMessage||"待機への変更に失敗しました。最新状態を確認してください。");
    }
  });
}
async function deleteAssign(aid){
  if(isPendingAssignment(aid)){sbs(false,"保存中...");return;}
  const current=S.assignments[aid];if(!current)return;
  if(!confirm("この付け回し履歴を削除します。よろしいですか？"))return;
  const expected=cloneData(current);
  const wasActive=!current.endTime;
  const shift=wasActive?getShiftByCastId(current.castId):null;
  const updates={[FB_ROOT+"/assignments/"+aid]:null};
  const expectedRecords={["assignments/"+aid]:expected};
  if(shift){
    updates[FB_ROOT+"/shifts/"+shift.id]=shiftWithStatus(shift,"waiting",Date.now());
    expectedRecords["shifts/"+shift.id]=cloneData(shift);
  }
  await withDataOperation("cast:"+current.castId,async()=>{
    try{
      closeM();
      await guardedCheckedUpdateOptimistic(updates,root=>{
        const remote=(root.assignments||{})[aid];
        if(!remote)return{ok:false,message:"この付け回しは他端末で既に削除されています。最新状態を確認してください。"};
        return{ok:true};
      },{expectedRecords});
      sbs(true,"同期済み ✓");closeM();render();
    }catch(e){
      sbs(false,"保存エラー");
      alert(e.userMessage||"付け回し削除に失敗しました。最新状態を確認してください。");
    }
  });
}

// ===== 出勤画面 =====
function rShifts(){
  // S.shiftsは現在の営業日データのみ含むため、追加フィルタリング不要
  const onduty=getOnduty().sort((a,b)=>a.clockIn-b.clockIn);
  const onIds=getOndutyIds();
  const allToday=Object.values(S.shifts||{});
  const done=allToday.filter(sh=>sh.clockOut).sort((a,b)=>b.clockIn-a.clockIn);
  const totalMs=allToday.reduce((a,sh)=>a+safeShiftDurationMs(sh),0);

  let html='<div style="max-width:720px;margin:0 auto;">';
  html+='<h2 style="font-family:Cormorant Garamond,serif;font-size:22px;color:#d4a017;margin-bottom:16px;">出勤管理</h2>';

  // アクションボタン
  html+='<div style="display:flex;gap:10px;margin-bottom:16px;">';
  html+='<button class="btn gbg" onclick="openShiftMd(\'in\')" style="flex:1;padding:14px;font-size:15px;font-weight:700;border-radius:8px;touch-action:manipulation;">出勤登録</button>';
  html+='<button class="btn" onclick="openShiftMd(\'out\')" style="flex:1;padding:14px;font-size:15px;font-weight:700;border-radius:8px;background:rgba(255,80,80,.12);border:1px solid rgba(255,80,80,.3);color:#ff6b6b;touch-action:manipulation;">退勤登録</button>';
  html+='<button class="btn" onclick="exportShiftCSV()" style="padding:14px 16px;background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.25);color:#4ade80;border-radius:8px;font-size:13px;font-weight:600;touch-action:manipulation;">CSV</button>';
  html+='</div>';

  // 出勤中
  html+='<div class="glass" style="border-radius:8px;padding:16px;margin-bottom:14px;">';
  html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">';
  html+='<div class="st">出勤中 ('+onduty.length+'名)</div>';
  html+='<div style="font-size:12px;color:#888;">本日累計: <span style="color:#4ade80;font-weight:700;">'+fmtDur(totalMs)+'</span></div>';
  html+='</div>';
  if(!onduty.length){html+='<div style="font-size:13px;color:#444;padding:8px 0;">出勤中のキャストはいません</div>';}
  else onduty.forEach(sh=>{
const elapsed=safeShiftDurationMs(sh);
const inT=new Date(sh.clockIn).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"});
html+='<div class="ir" style="min-height:40px;">';
html+='<div style="flex:1;">';
html+='<span style="font-size:14px;font-weight:700;color:#e8dcc8;">'+sh.castName+'</span>';
html+='<span style="font-size:11px;color:#888;margin-left:8px;">'+inT+'〜 ('+fmtDur(elapsed)+')</span>';
html+='</div>';
html+='<div style="display:flex;gap:6px;">';
html+='<button class="btn" data-sid="'+sh.id+'" onclick="editShift(this.dataset.sid)" style="padding:4px 10px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#aaa;border-radius:4px;font-size:11px;touch-action:manipulation;">編集</button>';
html+='</div>';
html+='</div>';
  });
  html+='</div>';

  // 退勤済み
  if(done.length){
html+='<div class="glass" style="border-radius:8px;padding:16px;">';
html+='<div class="st" style="margin-bottom:12px;">退勤済み</div>';
done.forEach(sh=>{
  const worked=safeShiftDurationMs(sh);
  const inT=new Date(sh.clockIn).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"});
  const outT=new Date(sh.clockOut).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"});
  html+='<div class="ir" style="font-size:13px;min-height:38px;">';
  html+='<div style="flex:1;">';
  html+='<span style="color:#bbb;font-weight:600;">'+sh.castName+'</span>';
  html+='<span style="color:#666;margin-left:10px;">'+inT+' → '+outT+'</span>';
  html+='<span style="color:#888;margin-left:8px;">('+fmtDur(worked)+')</span>';
  html+='</div>';
  html+='<div style="display:flex;gap:6px;">';
  html+='<button class="btn" data-sid="'+sh.id+'" onclick="cancelClockOut(this.dataset.sid)" style="padding:4px 10px;background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.2);color:#4ade80;border-radius:4px;font-size:11px;touch-action:manipulation;">退勤取消</button>';
  html+='<button class="btn" data-sid="'+sh.id+'" onclick="editShift(this.dataset.sid)" style="padding:4px 8px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#aaa;border-radius:4px;font-size:11px;touch-action:manipulation;">編集</button>';
  html+='</div>';
  html+='</div>';
});
html+='</div>';
  }
  html+='</div>';
  return html;
}

// ===== CLOCK =====
// タイマー要素のみ更新（DOM再構築なし・軽量）
function tickTimers(){
  now=Date.now();
  // 時計
  const clkEl=document.getElementById("clk");
  if(clkEl)clkEl.textContent=new Date(now).toLocaleTimeString("ja-JP");
  // モーダル内タイマー
  if(md){
document.querySelectorAll("[data-modal-timer]").forEach(el=>{
  const start=parseInt(el.dataset.modalTimer);
  if(!isNaN(start))el.textContent=ts(now-start).slice(3);
});
return;
  }
  // フロアオーダーモーダルのタイマー
  const fomTEl=document.getElementById("fom-timer");
  if(fomTEl&&at&&S.sessions[at]){
const _rv=rem(S.sessions[at].setEndTime);
const _urg=_rv!==null&&_rv>0&&_rv<600000;const _ovr=_rv!==null&&_rv<=0;
fomTEl.style.color=_ovr?"#ff4444":_urg?"#ff8c00":"#d4a017";
fomTEl.textContent=_rv===null?"—":_ovr?"- "+ts(-_rv):ts(_rv);
fomTEl.className=(_urg||_ovr?"urg":"");
  }
  // カウントダウンタイマー（テーブルカード）
  document.querySelectorAll("[data-countdown]").forEach(el=>{
const endTime=parseInt(el.dataset.countdown);if(isNaN(endTime))return;
const rv=endTime-now;
const urg=rv<600000&&rv>0;const exp=rv<=0;
const fmt=el.dataset.fmt||"p";
el.textContent=fmt==="r"?(exp?"- "+ts(-rv):"残 "+ts(rv)):(exp?"-"+ts(-rv):ts(rv));
el.style.color=exp?"#ff4444":urg?"#ff6b6b":"#d4a017";
el.classList.toggle("urg",urg||exp);
  });
  // 経過タイマー（アサイン・付け回し）
  document.querySelectorAll("[data-timer]").forEach(el=>{
const start=parseInt(el.dataset.timer);
if(!isNaN(start))el.textContent=ts(now-start).slice(3);
  });
}
setInterval(tickTimers,1000);


// ===== PWA =====
if("serviceWorker"in navigator){navigator.serviceWorker.register("./sw.js").catch(()=>{});}

// ピンチズーム禁止（viewport の user-scalable=no を JS で代替）
document.addEventListener('gesturestart', e=>e.preventDefault(), {passive:false});
document.addEventListener('touchmove', e=>{if(e.touches.length>1)e.preventDefault();}, {passive:false});

// iOS PWA (standalone) キーボード強制フォーカス修正
// position:fixed 要素内の input/textarea をタップしてもキーボードが出ない問題を解消
// ※ iOS は setTimeout 内の focus() をブロックするため必ず同期で呼ぶ
if(navigator.standalone){
  document.addEventListener('touchend', function(e){
const t=e.target;
if(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'){
  if(document.activeElement!==t){
    t.focus(); // 同期呼び出し必須（setTimeout 不可）
  }
}
  });
}

// ===== 管理モード =====
function toggleAdminMode(){
  const isAdmin=sessionStorage.getItem("genesis_admin")==="1";
  if(isAdmin){
// OFFにする
sessionStorage.removeItem("genesis_admin");
if(vw==="settings"){vw="floor";render();}else render();
  }else{
// ONにする（アクセスコード入力）
const code=prompt("管理モードのアクセスコードを入力してください");
if(code==="gen"){
  sessionStorage.setItem("genesis_admin","1");
  render();
}else if(code!==null){
  alert("アクセスコードが違います");
}
  }
}

// ===== BOOT =====
function boot(){
  const app=document.getElementById("app");
  if(app)app.style.display="block";
  const lmsg=document.getElementById("lmsg");
  if(lmsg)lmsg.textContent="Syncing data...";
  const lsub=document.getElementById("lsub");
  if(lsub)lsub.textContent="Please wait until sync completes";
  window._fbFirstSync=false;
  initFB();
}
	function waitFirebaseReadyForBoot(){
	  const lmsg=document.getElementById("lmsg");
	  const lsub=document.getElementById("lsub");
	  const setMsg=(msg,sub)=>{if(lmsg)lmsg.textContent=msg;if(lsub)lsub.textContent=sub||"";};
	  if(window._fbReady){boot();return;}
	  setMsg("Firebaseに接続中...","回線状況により時間がかかる場合があります");
	  window.addEventListener("fbReady",()=>boot(),{once:true});
	  window.addEventListener("fbError",e=>{
	    setMsg("Firebase初期化エラー",(e.detail&&e.detail.message)?e.detail.message:"再読み込みしてください");
	  },{once:true});
	  setTimeout(()=>{if(!window._fbReady)setMsg("Firebase接続に時間がかかっています","このまま待機しています。Wi-Fiが安定しているか確認してください");},10000);
	  setTimeout(()=>{if(!window._fbReady)setMsg("Firebase接続を継続確認中...","まだ接続できていません。必要なら再読み込みしてください");},30000);
	  setTimeout(()=>{if(!window._fbReady)setMsg("Firebase接続未完了","回線確認後、再読み込みしてください");},60000);
	}
	waitFirebaseReadyForBoot();
