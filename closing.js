// ===== 締め作業 =====
function clDates(){
  const ds=new Set(Object.keys(S.bizDays||{}));
  if(S.activeBizDay)ds.add(S.activeBizDay);
  if(!ds.size)ds.add(getBizDate());
  return [...ds].sort((a,b)=>b.localeCompare(a));
}
function clDefaultDate(){return closingState.date||S.activeBizDay||clDates()[0]||getBizDate();}
function clDayData(date){
  if(date===S.activeBizDay)return{date,history:S.history||[],shifts:S.shifts||{},assignments:S.assignments||{},active:true};
  const d=(S.bizDays||{})[date]||{};
  return{date,history:d.history||[],shifts:d.shifts||{},assignments:d.assignments||{},active:false};
}
function clHHMM(ms){return ms?new Date(Math.round(ms/60000)*60000).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit",hour12:false}):"";}
function clSeedCastWork(day){
  return Object.values(day.shifts||{}).sort((a,b)=>(a.clockIn||0)-(b.clockIn||0)).map(sh=>({castId:String(sh.castId||""),castName:sh.castName||"",startTime:clHHMM(sh.clockIn),endTime:clHHMM(sh.clockOut||Date.now()),breakMinutes:0}));
}
function clForm(date){
  if(!closingState.forms[date]){
    const day=clDayData(date);
    closingState.forms[date]={closedBy:"",castWork:clSeedCastWork(day)};
  }
  return closingState.forms[date];
}
function clMinutes(t){if(!/^\d{2}:\d{2}$/.test(t||""))return null;const[h,m]=t.split(":").map(Number);return h>=0&&h<=23&&m>=0&&m<=59?h*60+m:null;}
function clHours(start,end,breakMinutes){const s=clMinutes(start),e0=clMinutes(end);if(s==null||e0==null)return 0;let e=e0;if(e<s)e+=1440;return Math.round((Math.max(0,e-s-(parseInt(breakMinutes)||0))/60)*100)/100;}
function clInt(v){return Math.max(0,Math.floor(Number(v)||0));}
function clPaymentTotals(hist){
  let cash=0,card=0;
  (hist||[]).forEach(h=>{
    if(h.splits&&h.splits.length){h.splits.forEach(sp=>{if(sp.method==="card")card+=clInt(sp.amount);else cash+=clInt(sp.amount);});}
    else if(h.payMethod==="card")card+=clInt(h.total);else cash+=clInt(h.total);
  });
  return{cash,card};
}
function clCastSales(hist){
  const map={};
  const ensure=(id,name)=>{const k=String(id||name||"unknown");if(!map[k])map[k]={castId:String(id||""),castName:name||"",honShimeiSales:0,jonaiExtensionSales:0,drinkSales:0,totalAttributedSales:0};return map[k];};
  (hist||[]).forEach(h=>{
    const items=h.items||[];
    const hon=[...new Map(items.filter(i=>i.isHonShimei&&i.castId!=null).map(i=>[String(i.castId),i])).values()];
    if(hon.length){
      const share=Math.floor(clInt(h.subtotal||h.total)/hon.length);
      hon.forEach(i=>{const c=S.casts.find(c=>String(c.id)===String(i.castId));ensure(i.castId,c?.name||String(i.label||"").replace(/^.*\(/,"").replace(/\).*$/,"")).honShimeiSales+=share;});
    }else{
      items.filter(i=>i.isBanaiExtension).forEach(i=>{
        const ids=(i.banaiExtCastIds||[i.banaiExtCastId,i.castId]).filter(x=>x!=null);
        const names=i.banaiExtCastNames||[];
        if(!ids.length)return;
        const share=Math.floor(clInt((i.price||0)*(i.qty||1))/ids.length);
        ids.forEach((id,idx)=>{const c=S.casts.find(c=>String(c.id)===String(id));ensure(id,c?.name||names[idx]||"").jonaiExtensionSales+=share;});
      });
    }
    items.filter(i=>String(i.id||"").startsWith("cd_")&&i.castId!=null).forEach(i=>{const c=S.casts.find(c=>String(c.id)===String(i.castId));ensure(i.castId,c?.name||"").drinkSales+=clInt((i.price||0)*(i.qty||1));});
  });
  return Object.values(map).map(r=>({...r,totalAttributedSales:r.honShimeiSales+r.jonaiExtensionSales+r.drinkSales})).sort((a,b)=>b.totalAttributedSales-a.totalAttributedSales);
}
function clCastLifecycle(date,type){
  const key=type==="entered"?"enteredBizDay":"exitedBizDay";
  const atKey=type==="entered"?"enteredAt":"exitedAt";
  const casts=(typeof allCasts==="function"?allCasts():(S.casts||[]));
  return casts.filter(c=>c&&c.castType!=="trial"&&c[key]===date).map(c=>({
    castId:String(c.id||""),
    internalNo:Number(c.internalNo)||0,
    castName:c.name||"",
    [atKey]:c[atKey]||null
  })).sort((a,b)=>(a.internalNo||0)-(b.internalNo||0));
}
function clTrialCasts(date){
  const casts=(typeof allCasts==="function"?allCasts():(S.casts||[]));
  return casts.filter(c=>c&&c.castType==="trial"&&c.trialBizDay===date).map(c=>({
    castId:String(c.id||""),
    internalNo:Number(c.internalNo)||0,
    castName:c.name||"",
    trialBizDay:c.trialBizDay||date,
    trialRegisteredAt:c.trialRegisteredAt||c.registeredAt||null,
    trialEndedAt:c.trialEndedAt||null
  })).sort((a,b)=>(a.internalNo||0)-(b.internalNo||0));
}
function clSummary(date){
  const day=clDayData(date),hist=day.history||[],pay=clPaymentTotals(hist);
  const totalSales=hist.reduce((a,h)=>a+clInt(h.total),0);
  const totalCustomers=hist.reduce((a,h)=>a+clInt(h.guests),0);
  return{day,hist,
    sales:{totalSales,cashSales:pay.cash,cardSales:pay.card,discountTotal:hist.reduce((a,h)=>a+clInt(h.discount),0),taxServiceTotal:hist.reduce((a,h)=>a+clInt(h.tax),0)},
    customers:{groupCount:hist.length,totalCustomers,customerUnitPrice:totalCustomers?Math.floor(totalSales/totalCustomers):0},
    nominations:{honShimeiCount:hist.reduce((a,h)=>a+(h.items||[]).filter(i=>i.isHonShimei).length,0),jonaiCount:hist.reduce((a,h)=>a+(h.items||[]).filter(i=>i.isBanaiShimei).length,0)},
    castSales:clCastSales(hist)};
}
function clInput(section,idx,field,val){const f=clForm(clDefaultDate());f[section][idx][field]=val;if(section==="castWork")render();}
function clSetDate(v){closingState.date=v;clForm(v);render();}
function clSetClosedBy(v){clForm(clDefaultDate()).closedBy=v;}
function clBuildPayload(date){
  const sum=clSummary(date),form=clForm(date);
  const castWork=form.castWork.map(r=>({castId:String(r.castId||""),castName:r.castName||"",startTime:r.startTime||"",endTime:r.endTime||"",breakMinutes:clInt(r.breakMinutes),hours:clHours(r.startTime,r.endTime,r.breakMinutes)}));
  return{businessDate:date,status:"submitted",sales:sum.sales,customers:sum.customers,nominations:sum.nominations,castSales:sum.castSales,enteredCasts:clCastLifecycle(date,"entered"),exitedCasts:clCastLifecycle(date,"exited"),trialCasts:clTrialCasts(date),castWork,
    source:{posVersion:APP_VERSION,closedBy:form.closedBy||"POS",closedAt:window._serverTimestamp?window._serverTimestamp():new Date(),updatedAt:window._serverTimestamp?window._serverTimestamp():new Date()}};
}
function clValidate(date,payload){
  const errs=[];if(!date)errs.push("営業日が未選択です");if(date>getBizDate())errs.push("未来日は締めできません");
  payload.castWork.forEach(w=>{if(w.hours<0||w.hours>24)errs.push((w.castName||"勤務")+"の勤務時間が0〜24時間外です");});
  return errs;
}
function clConfirmSubmit(){const date=clDefaultDate();closingState.date=date;const payload=clBuildPayload(date);const errs=clValidate(date,payload);if(errs.length){alert(errs.join("\n"));return;}window._closingPayload=payload;md="closingConfirm";rModal();}
async function clSubmit(){
  const payload=window._closingPayload;if(!payload||closingState.submitting)return;
  const closingDb=window._accountingFs||window._fs;
  if(!closingDb){alert("Firestoreが初期化されていません");return;}
  closingState.submitting=true;rModal();
  try{await closingDb.collection(CLOSING_ROOT).doc(payload.businessDate).set(payload,{merge:true});if(window._fs&&window._fs!==closingDb){window._fs.collection(CLOSING_ROOT).doc(payload.businessDate).set(payload,{merge:true}).catch(e=>console.warn("local closing backup failed",e));}closingState.submitted[payload.businessDate]={status:"submitted",savedAt:Date.now()};sbs(true,"締め保存済み ✓");closeM();render();}
  catch(e){
    console.error("closing submit error",e);
    const denied=e&&(e.code==="permission-denied"||/insufficient permissions/i.test(e.message||""));
    const path=(window._closingProjectId?window._closingProjectId+"/":"")+CLOSING_ROOT+"/"+payload.businessDate;
    alert(denied?"締め保存先の権限がありません。\n経理FirebaseのFirestoreルールで「"+CLOSING_ROOT+"」への書き込み許可を確認してください。\n保存先: "+path:"締め保存に失敗しました: "+e.message);
    closingState.submitting=false;rModal();
  }
  closingState.submitting=false;
}
function exportClosingCSV(){
  const date=clDefaultDate(),p=clBuildPayload(date),lines=[];
  lines.push(["営業日",p.businessDate],["ステータス",p.status]);
  Object.entries(p.sales).forEach(([k,v])=>lines.push(["sales."+k,v]));
  Object.entries(p.customers).forEach(([k,v])=>lines.push(["customers."+k,v]));
  Object.entries(p.nominations).forEach(([k,v])=>lines.push(["nominations."+k,v]));
  lines.push([],["castId","castName","honShimeiSales","jonaiExtensionSales","drinkSales","totalAttributedSales"]);
  p.castSales.forEach(r=>lines.push([r.castId,r.castName,r.honShimeiSales,r.jonaiExtensionSales,r.drinkSales,r.totalAttributedSales]));
  lines.push([],["enteredCasts"],["internalNo","castId","castName","enteredAt"]);
  p.enteredCasts.forEach(r=>lines.push([r.internalNo,r.castId,r.castName,r.enteredAt]));
  lines.push([],["exitedCasts"],["internalNo","castId","castName","exitedAt"]);
  p.exitedCasts.forEach(r=>lines.push([r.internalNo,r.castId,r.castName,r.exitedAt]));
  lines.push([],["trialCasts"],["internalNo","castId","castName","trialBizDay","trialRegisteredAt"]);
  p.trialCasts.forEach(r=>lines.push([r.internalNo,r.castId,r.castName,r.trialBizDay,r.trialRegisteredAt]));
  _dlCSV("\uFEFF"+lines.map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\n"),"closing_"+date+".csv");
}
function rClosing(){
  const dates=clDates(),date=clDefaultDate();closingState.date=date;const form=clForm(date),sum=clSummary(date),p=clBuildPayload(date),locked=!!closingState.submitted[date];
  let html='<div style="max-width:980px;margin:0 auto;">';
  html+='<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;"><h2 style="font-family:Cormorant Garamond,serif;font-size:22px;color:#d4a017;">締め作業</h2><button class="btn" onclick="exportClosingCSV()" style="padding:8px 14px;background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.25);color:#4ade80;border-radius:6px;font-size:12px;font-weight:700;">CSV</button></div>';
  html+='<div class="glass" style="border-radius:8px;padding:14px;margin-bottom:14px;"><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><div><div class="st">営業日</div><select class="ip" onchange="clSetDate(this.value)">'+dates.map(d=>'<option value="'+d+'" '+(d===date?"selected":"")+'>'+d+(d===S.activeBizDay?"（営業中）":"")+'</option>').join("")+'</select></div><div><div class="st">締め担当</div><input class="ip" value="'+(form.closedBy||"")+'" oninput="clSetClosedBy(this.value)" placeholder="担当者名"/></div></div>'+(locked?'<div style="margin-top:10px;color:#4ade80;font-size:12px;">この営業日は店舗締め済みです。再確定するとFirestoreを上書きします。</div>':"")+'</div>';
  html+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:14px;">'+[['総売上',sum.sales.totalSales],['現金',sum.sales.cashSales],['カード',sum.sales.cardSales],['割引',sum.sales.discountTotal],['税/SC',sum.sales.taxServiceTotal],['組数',sum.customers.groupCount],['総客数',sum.customers.totalCustomers],['客単価',sum.customers.customerUnitPrice]].map(([l,v])=>'<div class="glass" style="padding:12px;border-radius:8px;"><div style="font-size:10px;color:#888;margin-bottom:4px;">'+l+'</div><div style="font-size:18px;font-weight:700;color:#d4a017;">'+(typeof v==="number"&&l!=="組数"&&l!=="総客数"?'¥'+fmt(v):fmt(v))+'</div></div>').join("")+'</div>';
  html+='<div class="glass" style="border-radius:8px;padding:14px;margin-bottom:14px;"><div class="st">会計済みテーブル</div>'+(sum.hist.length?sum.hist.map(h=>'<div class="ir"><span>'+h.tableLabel+' / '+(h.guests||0)+'名</span><span>'+pAmt(h.total)+'</span></div>').join(""):'<div style="color:#555;font-size:13px;">会計済みデータなし</div>')+'</div>';
  html+='<div class="glass" style="border-radius:8px;padding:14px;margin-bottom:14px;"><div class="st">指名集計</div><div style="display:flex;gap:16px;color:#e8dcc8;"><span>本指名 '+sum.nominations.honShimeiCount+'件</span><span>場内指名 '+sum.nominations.jonaiCount+'件</span></div></div>';
  html+='<div class="glass" style="border-radius:8px;padding:14px;margin-bottom:14px;"><div class="st">キャスト別売上</div>'+(sum.castSales.length?sum.castSales.map(r=>'<div class="ir"><span>'+r.castName+'</span><span>本 '+pAmt(r.honShimeiSales)+' / 場延 '+pAmt(r.jonaiExtensionSales)+' / D '+pAmt(r.drinkSales)+' / 計 '+pAmt(r.totalAttributedSales)+'</span></div>').join(""):'<div style="color:#555;font-size:13px;">対象データなし</div>')+'</div>';
  html+='<div class="glass" style="border-radius:8px;padding:14px;margin-bottom:14px;"><div class="st">入退店キャスト</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
    +'<div><div style="font-size:11px;color:#4ade80;margin-bottom:6px;">入店</div>'+(p.enteredCasts.length?p.enteredCasts.map(c=>'<div class="ir"><span>No.'+String(c.internalNo).padStart(3,"0")+'</span><span>'+c.castName+'</span></div>').join(""):'<div style="color:#555;font-size:13px;">なし</div>')+'</div>'
    +'<div><div style="font-size:11px;color:#ff6b6b;margin-bottom:6px;">退店</div>'+(p.exitedCasts.length?p.exitedCasts.map(c=>'<div class="ir"><span>No.'+String(c.internalNo).padStart(3,"0")+'</span><span>'+c.castName+'</span></div>').join(""):'<div style="color:#555;font-size:13px;">なし</div>')+'</div>'
    +'</div>'
    +'<div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.06);"><div style="font-size:11px;color:#38bdf8;margin-bottom:6px;">体入</div>'+(p.trialCasts.length?p.trialCasts.map(c=>'<div class="ir"><span>No.'+String(c.internalNo).padStart(3,"0")+'</span><span>'+c.castName+'</span></div>').join(""):'<div style="color:#555;font-size:13px;">なし</div>')+'</div>'
    +'</div>';
  html+='<div class="glass" style="border-radius:8px;padding:14px;margin-bottom:14px;"><div class="st">キャスト勤務</div>'+form.castWork.map((r,i)=>'<div style="display:grid;grid-template-columns:1.2fr .8fr .8fr .7fr .6fr;gap:6px;margin-bottom:8px;"><input class="ip" value="'+(r.castName||"")+'" oninput="clInput(\'castWork\','+i+',\'castName\',this.value)"/><input class="ip" type="time" value="'+(r.startTime||"")+'" oninput="clInput(\'castWork\','+i+',\'startTime\',this.value)"/><input class="ip" type="time" value="'+(r.endTime||"")+'" oninput="clInput(\'castWork\','+i+',\'endTime\',this.value)"/><input class="ip" type="number" value="'+clInt(r.breakMinutes)+'" oninput="clInput(\'castWork\','+i+',\'breakMinutes\',this.value)"/><div style="padding:8px;color:#38bdf8;">'+clHours(r.startTime,r.endTime,r.breakMinutes)+'h</div></div>').join("")+'</div>';
  html+='<button class="btn gbg" '+(closingState.submitting?"disabled":"")+' onclick="clConfirmSubmit()" style="width:100%;padding:16px;font-size:17px;font-weight:700;border-radius:8px;touch-action:manipulation;'+(closingState.submitting?"opacity:.5;":"")+'">締め確定</button></div>';
  return html;
}
