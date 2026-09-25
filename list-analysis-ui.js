// リスト分析の選択画面・集計表示・A4印刷。元データの更新は行わない。
let listAnalysisState={from:"",to:"",castId:null,castName:"",report:null,error:"",initialized:false};
function listAnalysisEscape(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);}
function listAnalysisRange(){
  const {from,to}=listAnalysisState;
  const start=from?new Date(from+"T19:00:00").getTime():null;
  const end=to?new Date(to+"T19:00:00"):null;
  if(end)end.setDate(end.getDate()+1);
  return{from:start,to:end?end.getTime():null};
}
function listAnalysisDays(){
  // 営業中・再編集中の営業日は保存済みスナップショットも集計しない。
  return Object.entries(S.bizDays||{}).filter(([id,day])=>day&&Number(day.endedAt)>0&&id!==S.activeBizDay).map(([id,day])=>({...day,id,date:day.date||id}));
}
function listAnalysisSetMonth(){
  const date=S.activeBizDay||getBizDate();
  listAnalysisState.from=date.slice(0,7)+"-01";listAnalysisState.to=date;listAnalysisState.error="";
  rModal();
}
function openListAnalysis(){
  md="anaListDate";
  if(!listAnalysisState.initialized){listAnalysisState.initialized=true;listAnalysisSetMonth();}
  else rModal();
}
function listAnalysisNext(){
  const range=listAnalysisRange();
  if((range.from!=null&&!Number.isFinite(range.from))||(range.to!=null&&!Number.isFinite(range.to))||(range.from!=null&&range.to!=null&&range.from>=range.to)){
    listAnalysisState.error="終了営業日は開始営業日以降を選択してください。";rModal();return;
  }
  listAnalysisState.error="";md="anaListCast";rModal();
}
function listAnalysisCasts(){
  const casts=new Map();
  const add=(id,name)=>{if(id!=null&&id!==""&&!casts.has(String(id)))casts.set(String(id),{id:String(id),name:String(name||id)});};
  // 過去の履歴から候補を復元せず、現在の在籍名簿だけを使用する。
  allCasts().filter(c=>c&&c.active!==false&&normalizeCastType(c.castType,c.isTrial,c.status)!=="trial").forEach(c=>add(c.id,c.name));
  return [...casts.values()];
}
function selectListAnalysisCast(castId){
  const cast=listAnalysisCasts().find(c=>c.id===String(castId));if(!cast)return;
  listAnalysisState.castId=cast.id;listAnalysisState.castName=cast.name;
  refreshListAnalysis();
}
function refreshListAnalysis(){
  const atTime=Date.now(),range=listAnalysisRange();
  const report=LIST_ANALYSIS.buildReport({days:listAnalysisDays(),castId:listAnalysisState.castId,...range,
    extensionSales:(record,cid)=>banaiExtensionSalesForCast(record.items||[],cid,record.subtotal)});
  listAnalysisState.report={...report,castName:listAnalysisState.castName,from:listAnalysisState.from,to:listAnalysisState.to,createdAt:atTime};
  md="anaListDetail";rModal();
}
function listAnalysisDuration(ms){
  if(ms==null)return"—";
  const minutes=Math.max(0,Math.round(Number(ms)/60000)||0);
  return Math.floor(minutes/60)+"時間"+String(minutes%60).padStart(2,"0")+"分";
}
function listAnalysisAverage(value,unit){return value==null?"—":Number(value).toLocaleString("ja-JP",{minimumFractionDigits:1,maximumFractionDigits:1})+unit;}
function listAnalysisPeriod(report){return(report.from||"開始指定なし")+" 〜 "+(report.to||"終了指定なし")+"（営業日）";}
function listAnalysisReportHtml(report){
  const esc=listAnalysisEscape,types=[["hon","本指名"],["banai","場内指名"],["free","フリー"]];
  const money=n=>esc(pAmt(n));
  const ratio=report.extensionRate==null?"—":listAnalysisAverage(report.extensionRate,"%");
  const metric=(label,value,note="")=>'<div class="la-metric"><span>'+label+'</span><strong>'+value+'</strong>'+(note?'<small>'+note+'</small>':"")+'</div>';
  const countNote=(row,type)=>(row.unresolvedVisitTypes||[]).includes(type)?'<small>来店不明の記録あり</small>':"";
  const rows=types.map(([type,label])=>{const t=report.types[type];return '<tr><th scope="row"><span class="la-dot la-'+type+'"></span>'+label+'</th><td><b>'+t.count+'</b> 回'+countNote(report,type)+'</td><td>'+listAnalysisDuration(t.ms)+'</td><td>'+listAnalysisAverage(t.averageCount," 回")+'</td><td>'+listAnalysisDuration(t.averageMs)+'</td></tr>';}).join("");
  const daily=(report.days||[]).map(day=>'<tr><th scope="row">'+esc(day.date)+'</th>'+types.map(([type])=>'<td>'+day.types[type].count+'回'+countNote(day,type)+'<small>'+listAnalysisDuration(day.types[type].ms)+'</small></td>').join("")+'<td>'+listAnalysisDuration(day.waitingMs)+'</td><td>'+day.extensionCount+'回<small>'+money(day.extensionSales)+'</small></td></tr>').join("");
  const noData=!(report.days||[]).length;
  return '<article class="la-report">'
    +'<div class="la-report-head"><div><div class="la-brand">CLUB GENESIS / ANALYSIS</div><h1>リスト情報</h1></div><div class="la-report-date">作成日時<br>'+esc(new Date(report.createdAt).toLocaleString("ja-JP",{hour12:false}))+'</div></div>'
    +'<div class="la-identity"><h2>'+esc(report.castName)+'</h2><p>'+esc(listAnalysisPeriod(report))+'</p></div>'
    +(noData?'<p class="la-empty">選択した期間のリスト・出勤・場内延長データはありません。</p>':"")
    +'<div class="la-summary">'+metric("出勤日数",report.attendanceDays+'<em> 日</em>',"同一営業日は1日で集計")+metric("勤務時間",listAnalysisDuration(report.workMs))+metric("待機時間",listAnalysisDuration(report.waitingMs),"1出勤日平均 "+listAnalysisDuration(report.attendanceDays?report.waitingMs/report.attendanceDays:null))+'</div>'
    +'<section class="la-block"><h3>接客実績 <small>平均は出勤 '+report.attendanceDays+' 日あたり</small></h3><div class="la-table-scroll"><table class="la-table"><thead><tr><th scope="col">種別</th><th scope="col">回数</th><th scope="col">合計時間</th><th scope="col">平均回数 / 日</th><th scope="col">平均時間 / 日</th></tr></thead><tbody>'+rows+'</tbody></table></div></section>'
    +'<section class="la-block"><h3>場内延長</h3><div class="la-summary">'+metric("延長回数",report.extensionCount+'<em> 回</em>',"延長した来店卓数 "+report.extensionTables+" 卓")+metric("場内延長売上",money(report.extensionSales))+metric("場内指名に対する延長割合",ratio,"延長 "+report.extensionTables+" 卓 ÷ 場内指名 "+report.types.banai.count+" 卓")+'</div></section>'
    +'<aside class="la-notes"><p>回数：同じ来店テーブルは各種別1回。会計後の別のお客様は別の来店として数えます。フリー→場内指名はそれぞれ1回。再着席の時間は合算します。</p><p>平均：合計 ÷ 出勤日数。待機は休憩・接客時間を除きます。時間は分単位に四捨五入します。</p><p>場内延長：回数は延長操作数、割合は延長した来店卓数 ÷ 場内指名についた来店卓数。同じ来店で複数回延長しても割合の分子は1卓です。売上は売上情報と同じ配分（延長後の注文を含む小計）を使用し、本指名のあるテーブルは対象外です。分母0は「—」で表示します。</p><p>営業終了済みのデータのみ対象。対象時間は各営業日19:00〜翌18:59です。</p>'
    +(report.legacyTypeAssignments?'<p class="la-caution">種別変更履歴のない過去の付け回し '+report.legacyTypeAssignments+' 件は、保存されている種別で集計しています。変更前の回数・時間は復元できません。</p>':"")
    +(report.missingWaitingDays?'<p class="la-caution">待機ログがない営業日が '+report.missingWaitingDays+' 日あります。その日の未記録の待機時間は集計に含みません。</p>':"")
    +(report.unresolvedVisitAssignments?'<p class="la-caution">来店を特定できない付け回し '+report.unresolvedVisitAssignments+' 件は時間のみ集計し、回数には含めていません。該当種別の平均回数と、場内指名の回数が不明な場合の延長割合は算出していません。</p>':"")
    +(!report.attendanceDays&&!noData?'<p class="la-caution">対象の出勤記録がないため、出勤日数あたりの平均は算出できません。</p>':"")+'</aside>'
    +(daily?'<section class="la-block la-daily"><h3>営業日別の内訳</h3><div class="la-table-scroll"><table class="la-table"><thead><tr><th scope="col">営業日</th><th scope="col">本指名</th><th scope="col">場内指名</th><th scope="col">フリー</th><th scope="col">待機時間</th><th scope="col">場内延長 / 売上</th></tr></thead><tbody>'+daily+'</tbody></table></div></section>':"")
    +'</article>';
}
function listAnalysisModalHtml(kind){
  const st=listAnalysisState,esc=listAnalysisEscape;
  const button=(label,action,primary=false)=>'<button class="btn la-button'+(primary?' la-primary':'')+'" onclick="'+action+'">'+label+'</button>';
  let body="";
  if(kind==="anaListDate"){
    body='<h3>リスト情報 — 期間選択</h3><p class="la-description">集計したい開始・終了営業日を選択してください。</p><div class="la-date-fields"><label>開始営業日<input type="date" class="ip" value="'+esc(st.from)+'" onchange="listAnalysisState.from=this.value" /></label><label>終了営業日<input type="date" class="ip" value="'+esc(st.to)+'" onchange="listAnalysisState.to=this.value" /></label></div><p class="la-hint">営業終了済みのみ。各営業日19:00〜翌18:59の記録を対象にします。</p><div class="la-actions">'+button("当月","listAnalysisSetMonth()")+button("全期間","listAnalysisState.from='';listAnalysisState.to='';listAnalysisState.error='';rModal()")+'</div>'+(st.error?'<p class="la-error" role="alert">'+esc(st.error)+'</p>':"")+'<div class="la-footer">'+button("次へ（キャスト選択）","listAnalysisNext()",true)+button("キャンセル","closeM()")+'</div>';
  }else if(kind==="anaListCast"){
    const casts=listAnalysisCasts();
    body='<h3>リスト情報 — キャスト選択</h3><p class="la-description">'+esc(listAnalysisPeriod(st))+'</p><div class="la-casts">'+casts.map(c=>'<button class="btn la-button" data-cast-id="'+esc(c.id)+'" onclick="selectListAnalysisCast(this.dataset.castId)">'+esc(c.name)+'</button>').join("")+'</div>'+(!casts.length?'<p class="la-empty">対象キャストがいません。</p>':"")+'<div class="la-footer">'+button("← 期間選択に戻る","md='anaListDate';rModal()")+button("閉じる","closeM()")+'</div>';
  }else{
    if(!st.report)return"";
    body='<div class="la-toolbar">'+button("← キャスト選択","md='anaListCast';rModal()")+button("最新の情報に更新","refreshListAnalysis()")+button("A4印刷 / PDF保存","printListAnalysis()",true)+'</div>'+listAnalysisReportHtml(st.report)+'<div class="la-footer">'+button("閉じる","closeM()")+'</div>';
  }
  return '<div class="mo" onclick="closeM()"><div class="mb la-modal'+(kind==="anaListDetail"?' la-wide':'')+'" role="dialog" aria-modal="true" aria-label="リスト情報" onclick="event.stopPropagation()">'+body+'</div></div>';
}
function listAnalysisPrintHtml(report,cssUrl){
  const esc=listAnalysisEscape;
  return '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc('リスト情報_'+report.castName+'_'+(report.from||'全期間')+'_'+(report.to||''))+'</title><link rel="stylesheet" href="'+esc(cssUrl)+'"></head><body class="la-print-page"><div class="la-print-controls"><button class="la-button la-primary" onclick="window.print()">A4印刷 / PDF保存</button><span>用紙：A4・縦 ／ PDFに保存する場合は印刷先を「PDFに保存」に変更</span></div>'+listAnalysisReportHtml(report)+'</body></html>';
}
function printListAnalysis(){
  const report=listAnalysisState.report;if(!report)return;
  const popup=window.open("","_blank");
  if(!popup){alert("印刷画面を開けませんでした。このサイトのポップアップを許可して、再度印刷ボタンを押してください。");return;}
  popup.document.open();
  popup.document.write(listAnalysisPrintHtml(report,new URL("list-analysis.css?v="+APP_VERSION,document.baseURI).href));
  popup.addEventListener("load",()=>{popup.focus();popup.print();},{once:true});
  popup.document.close();
}
