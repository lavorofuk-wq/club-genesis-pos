// リスト分析の選択画面・集計表示・A4印刷。元データの更新は行わない。
let listAnalysisState={from:"",to:"",castId:null,castName:"",report:null,days:null,error:"",initialized:false,loading:false,requestId:0};
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
  const days=listAnalysisState.days===null?S.bizDays:listAnalysisState.days;
  return Object.entries(days||{}).filter(([id,day])=>day&&Number(day.endedAt)>0&&id!==S.activeBizDay).map(([id,day])=>({...day,id,date:day.date||id}));
}
function cancelListAnalysisLoad(){
  listAnalysisState.requestId++;listAnalysisState.loading=false;listAnalysisState.error="";
}
function closeListAnalysis(){cancelListAnalysisLoad();closeM();}
function listAnalysisBack(kind){cancelListAnalysisLoad();md=kind;rModal();}
function listAnalysisSetDate(field,value){
  cancelListAnalysisLoad();listAnalysisState[field]=value;listAnalysisState.days={};rModal();
}
function listAnalysisAllDates(){
  cancelListAnalysisLoad();listAnalysisState.from="";listAnalysisState.to="";listAnalysisState.days={};rModal();
}
function listAnalysisSetMonth(){
  cancelListAnalysisLoad();listAnalysisState.days={};
  const date=S.activeBizDay||getBizDate();
  listAnalysisState.from=date.slice(0,7)+"-01";listAnalysisState.to=date;listAnalysisState.error="";
  rModal();
}
function openListAnalysis(){
  cancelListAnalysisLoad();listAnalysisState.days={};
  md="anaListDate";
  if(!listAnalysisState.initialized){listAnalysisState.initialized=true;listAnalysisSetMonth();}
  else rModal();
}
async function listAnalysisLoadDays(kind,onLoaded){
  const st=listAnalysisState;if(st.loading||md!==kind||vw!=="analysis")return false;
  const requestId=++st.requestId,from=st.from,to=st.to,castId=st.castId,range=listAnalysisRange();
  const current=()=>st.requestId===requestId&&md===kind&&vw==="analysis"&&st.from===from&&st.to===to&&st.castId===castId;
  st.loading=true;st.error="";
  if(kind==="anaListDate")st.days={};
  rModal();
  try{
    const days=await ANALYSIS_DATA.loadDays({db:window._db,root:FB_ROOT,...range});
    if(!current())return false;
    st.days=days;st.loading=false;onLoaded();return true;
  }catch(error){
    if(!current())return false;
    st.error=kind==="anaListDetail"?"最新データを取得できませんでした。前回の集計を表示しています。接続状態を確認して、再度更新してください。":"データを取得できませんでした。接続状態を確認して、再度お試しください。";
    st.loading=false;rModal();return false;
  }finally{
    if(st.requestId===requestId)st.loading=false;
  }
}
async function listAnalysisNext(){
  if(listAnalysisState.loading||md!=="anaListDate")return false;
  const range=listAnalysisRange();
  if((range.from!=null&&!Number.isFinite(range.from))||(range.to!=null&&!Number.isFinite(range.to))||(range.from!=null&&range.to!=null&&range.from>=range.to)){
    listAnalysisState.error="終了営業日は開始営業日以降を選択してください。";rModal();return;
  }
  return listAnalysisLoadDays("anaListDate",()=>{md="anaListCast";rModal();});
}
async function reloadListAnalysis(){
  if(!listAnalysisState.report)return false;
  return listAnalysisLoadDays("anaListDetail",refreshListAnalysis);
}
function listAnalysisCasts(){
  const casts=new Map();
  const add=(id,name)=>{if(id!=null&&id!==""&&!casts.has(String(id)))casts.set(String(id),{id:String(id),name:String(name||id)});};
  // 過去の履歴から候補を復元せず、現在の在籍名簿だけを使用する。
  allCasts().filter(c=>c&&c.active!==false&&normalizeCastType(c.castType,c.isTrial,c.status)!=="trial").forEach(c=>add(c.id,c.name));
  return [...casts.values()];
}
function selectListAnalysisCast(castId){
  if(listAnalysisState.loading||listAnalysisState.error)return;
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
function listAnalysisReportHtml(report,{print=false}={}){
  const esc=listAnalysisEscape,types=[["hon","本指名"],["banai","場内指名"],["free","フリー"]];
  const money=n=>esc(pAmt(n));
  const ratio=report.extensionRate==null?"—":listAnalysisAverage(report.extensionRate,"%");
  const metric=(label,value,note="")=>'<div class="la-metric"><span>'+label+'</span><strong>'+value+'</strong>'+(note?'<small>'+note+'</small>':"")+'</div>';
  const countNote=(row,type)=>(row.unresolvedVisitTypes||[]).includes(type)?'<small>来店不明の記録あり</small>':"";
  const rows=types.map(([type,label])=>{const t=report.types[type];return '<tr><th scope="row"><span class="la-dot la-'+type+'"></span>'+label+'</th><td><b>'+t.count+'</b> 回'+countNote(report,type)+'</td><td>'+listAnalysisAverage(t.averageCount," 回")+'</td><td>'+listAnalysisDuration(t.averageMs)+'</td></tr>';}).join("");
  const noData=!(report.days||[]).length;
  return '<article class="la-report">'
    +'<div class="la-report-head"><div><div class="la-brand">CLUB GENESIS / ANALYSIS</div><h1>リスト情報</h1></div><div class="la-report-date">作成日時<br>'+esc(new Date(report.createdAt).toLocaleString("ja-JP",{hour12:false}))+'</div></div>'
    +'<div class="la-identity"><h2>'+esc(report.castName)+'</h2><p>'+esc(listAnalysisPeriod(report))+'</p></div>'
    +(noData?'<p class="la-empty">選択した期間のリスト・場内延長データはありません。</p>':"")
    +'<section class="la-block"><h3>接客実績 <small>表の平均は1出勤日あたり</small></h3><div class="la-table-scroll"><table class="la-table"><thead><tr><th scope="col">種別</th><th scope="col">回数</th><th scope="col">平均回数 / 日</th><th scope="col">平均時間 / 日</th></tr></thead><tbody>'+rows+'</tbody></table></div><div class="la-contact-summary">'+metric("フリーの平均時間",listAnalysisDuration(report.freeAverage?.averageMs),print?"1来店卓あたり":"1来店卓あたり・合算5分以下を除外")+metric("場内率",listAnalysisAverage(report.banaiRate,"%"),"場内指名 "+report.types.banai.count+" 卓 ÷ フリー "+report.types.free.count+" 卓")+'</div></section>'
    +'<section class="la-block"><h3>場内延長</h3><div class="la-summary">'+metric("延長回数",report.extensionCount+'<em> 回</em>',"延長した来店卓数 "+report.extensionTables+" 卓")+metric("場内延長売上",money(report.extensionSales))+metric("場内指名に対する延長割合",ratio,"フリーテーブルの場内延長 "+report.extensionTables+" 卓 ÷ フリーテーブルの場内指名 "+report.extensionEligibleTables+" 卓")+'</div></section>'
    +(!print?'<aside class="la-notes"><p>回数：同じ来店テーブルは各種別1回。会計後の別のお客様は別の来店として数えます。フリー→場内指名はそれぞれ1回。再着席の時間は合算します。</p><p>表の平均：合計 ÷ 出勤日数。フリーの平均時間：同じ来店卓のフリー時間を合算し、5分を超える卓の合計時間 ÷ 対象卓数。5分以下の卓も表の回数・日平均には含みます。時間は分単位に四捨五入します。</p><p>場内率：場内指名についた来店卓数 ÷ フリーについた来店卓数。最初から場内指名の卓も含みます。フリーが0卓、またはフリー・場内指名の来店を特定できない場合は「—」で表示します。</p><p>場内延長：回数は延長操作数、割合はフリーテーブルで場内延長した来店卓数 ÷ フリーテーブルで場内指名についた来店卓数。本指名のある来店は、延長の回数・売上・割合の分子と分母すべてから除外します。同じ来店で複数回延長しても割合の分子は1卓です。売上は売上情報と同じ配分（延長後の注文を含む小計）を使用します。分母0は「—」で表示します。</p><p>営業終了済みのデータのみ対象。対象時間は各営業日19:00〜翌18:59です。</p>'
    +(report.legacyTypeAssignments?'<p class="la-caution">種別変更履歴のない過去の付け回し '+report.legacyTypeAssignments+' 件は、保存されている種別で集計しています。変更前の回数・時間は復元できません。</p>':"")
    +(report.unresolvedVisitAssignments?'<p class="la-caution">来店を特定できない付け回し '+report.unresolvedVisitAssignments+' 件は時間のみ集計し、回数には含めていません。該当種別の平均回数は算出していません。</p>':"")
    +(report.unresolvedExtensionAssignments?'<p class="la-caution">会計・注文履歴から本指名の有無を確認できない場内指名の付け回しが '+report.unresolvedExtensionAssignments+' 件あるため、場内指名に対する延長割合は算出していません。</p>':"")
    +(report.unresolvedExtensionVisits?'<p class="la-caution">延長した来店の場内指名の付け回しを確認できない記録が '+report.unresolvedExtensionVisits+' 卓あるため、場内指名に対する延長割合は算出していません。</p>':"")
    +((report.unresolvedVisitTypes||[]).includes("free")?'<p class="la-caution">フリーの来店を特定できない記録があるため、フリーの平均時間は算出していません。</p>':"")
    +(!report.attendanceDays&&!noData?'<p class="la-caution">対象の出勤記録がないため、出勤日数あたりの平均は算出できません。</p>':"")+'</aside>':"")
    +'</article>';
}
function listAnalysisModalHtml(kind){
  const st=listAnalysisState,esc=listAnalysisEscape;
  const button=(label,action,primary=false,disabled=false)=>'<button class="btn la-button'+(primary?' la-primary':'')+'" onclick="'+action+'"'+(disabled?' disabled':'')+'>'+label+'</button>';
  const status=(st.loading?'<p class="la-hint" role="status">選択した期間のデータを読み込み中...</p>':"")+(st.error?'<p class="la-error" role="alert">'+esc(st.error)+'</p>':"");
  let body="";
  if(kind==="anaListDate"){
    body='<h3>リスト情報 — 期間選択</h3><p class="la-description">集計したい開始・終了営業日を選択してください。</p><div class="la-date-fields"><label>開始営業日<input type="date" class="ip" value="'+esc(st.from)+'" onchange="listAnalysisSetDate(\'from\',this.value)"'+(st.loading?' disabled':'')+' /></label><label>終了営業日<input type="date" class="ip" value="'+esc(st.to)+'" onchange="listAnalysisSetDate(\'to\',this.value)"'+(st.loading?' disabled':'')+' /></label></div><p class="la-hint">営業終了済みのみ。各営業日19:00〜翌18:59の記録を対象にします。</p><div class="la-actions">'+button("当月","listAnalysisSetMonth()",false,st.loading)+button("全期間","listAnalysisAllDates()",false,st.loading)+'</div>'+status+'<div class="la-footer">'+button(st.loading?"読み込み中...":"次へ（キャスト選択）","listAnalysisNext()",true,st.loading)+button("キャンセル","closeListAnalysis()")+'</div>';
  }else if(kind==="anaListCast"){
    const casts=listAnalysisCasts();
    body='<h3>リスト情報 — キャスト選択</h3><p class="la-description">'+esc(listAnalysisPeriod(st))+'</p><div class="la-casts">'+casts.map(c=>'<button class="btn la-button" data-cast-id="'+esc(c.id)+'" onclick="selectListAnalysisCast(this.dataset.castId)">'+esc(c.name)+'</button>').join("")+'</div>'+(!casts.length?'<p class="la-empty">対象キャストがいません。</p>':"")+'<div class="la-footer">'+button("← 期間選択に戻る","listAnalysisBack('anaListDate')")+button("閉じる","closeListAnalysis()")+'</div>';
  }else{
    if(!st.report)return"";
    body='<div class="la-toolbar">'+button("← キャスト選択","listAnalysisBack('anaListCast')")+button(st.loading?"更新中...":"最新の情報に更新","reloadListAnalysis()",false,st.loading)+button("A4印刷 / PDF保存","printListAnalysis()",true)+'</div>'+status+listAnalysisReportHtml(st.report)+'<div class="la-footer">'+button("閉じる","closeListAnalysis()")+'</div>';
  }
  return '<div class="mo" onclick="closeListAnalysis()"><div class="mb la-modal'+(kind==="anaListDetail"?' la-wide':'')+'" role="dialog" aria-modal="true" aria-label="リスト情報" onclick="event.stopPropagation()">'+body+'</div></div>';
}
function listAnalysisPrintHtml(report,cssUrl){
  const esc=listAnalysisEscape;
  return '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc('リスト情報_'+report.castName+'_'+(report.from||'全期間')+'_'+(report.to||''))+'</title><link rel="stylesheet" href="'+esc(cssUrl)+'"></head><body class="la-print-page"><div class="la-print-controls"><button class="la-button la-primary" onclick="window.print()">A4印刷 / PDF保存</button><span>用紙：A4・縦 ／ PDFに保存する場合は印刷先を「PDFに保存」に変更</span></div>'+listAnalysisReportHtml(report,{print:true})+'</body></html>';
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
