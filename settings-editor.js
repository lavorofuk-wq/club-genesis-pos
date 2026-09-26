(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.PosSettingsEditor=api;
})(typeof window!=="undefined"?window:null,function(){
  "use strict";
  const SECTIONS={
    menus:[["normalSets","通常セットメニュー"],["sets","特別セットメニュー"],["extensions","延長メニュー"],["vip","VIP室料"],["karaoke","カラオケ室料（1名単価）"],["drinks","ゲストオーダー（ドリンク）"],["castDrinks","キャストDrink"]],
    special:[["drinks","ゲストオーダー（GUEST）"],["castDrinks","キャストDrink（CAST）"],["champagne","シャンパン・ワイン"],["keepBottles","キープボトル"],["castCustomItems","プリセット品名（CAST）"]]
  };
  const TIMED=new Set(["normalSets","sets","extensions","vip","karaoke"]);
  const CATEGORIES=new Set([...SECTIONS.menus,...SECTIONS.special].map(row=>row[0]).concat("options"));
  const clone=value=>value==null?null:JSON.parse(JSON.stringify(value));
  const esc=value=>String(value==null?"":value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const money=value=>Number(value||0).toLocaleString("ja-JP");
  const titleFor=draft=>draft.kind==="cast"?"キャスト":draft.kind==="table"?"テーブル":([...SECTIONS.menus,...SECTIONS.special].find(row=>row[0]===draft.category)?.[1]||"シングルチャージ");
  function validDescriptor(draft){
    return draft&&["menu","table","cast"].includes(draft.kind)&&["add","edit","delete","depart"].includes(draft.action)
      &&(draft.kind!=="menu"||CATEGORIES.has(draft.category))
      &&(draft.action!=="depart"||draft.kind==="cast")&&(draft.action!=="delete"||draft.kind!=="cast")
      &&(draft.kind!=="cast"||!draft.castType||["regular","trial"].includes(draft.castType));
  }
  function valuesFor(draft,item){
    item=item||{};
    if(draft.kind==="cast")return{name:String(item.name||"")};
    if(draft.kind==="table")return{label:String(item.label||""),vip:!!item.vip};
    const values={label:String(item.label||(draft.category==="options"?"シングルチャージ":"")),price:String(item.type==="percent"?(item.value??""):(item.price??""))};
    if(TIMED.has(draft.category))values.minutes=String(item.minutes??"");
    return values;
  }
  function validate(draft){
    const errors={},values=clone(draft.values)||{};
    if(!validDescriptor(draft))return{errors:{form:"編集対象が正しくありません。下書きを破棄して開き直してください。"},values};
    if(draft.action==="delete"||draft.action==="depart")return{errors,values};
    const field=draft.kind==="cast"?"name":"label";
    values[field]=String(values[field]||"").trim();
    if(!values[field])errors[field]="名前を入力してください。";
    if(draft.kind==="menu"){
      const price=String(values.price??"").trim();
      if(!/^\d+$/.test(price)||!Number.isSafeInteger(Number(price)))errors.price="金額は0以上の整数で入力してください。";
      else values.price=Number(price);
      if(TIMED.has(draft.category)){
        const minutes=String(values.minutes??"").trim();
        if(!/^\d+$/.test(minutes)||!Number.isSafeInteger(Number(minutes))||Number(minutes)<=0)errors.minutes="分数は1以上の整数で入力してください。";
        else values.minutes=Number(minutes);
      }
    }
    if(draft.kind==="table")values.vip=!!values.vip;
    return{errors,values};
  }
  function create(adapter){
    let draft=null,opened=false,busy=false,errors={},message="",conflict=null,scope=null,returnFocus=null,focusField=null,saveFailed=false,storageWarning="";
    const doc=adapter.document||(typeof document!=="undefined"?document:null);
    const notify=()=>adapter.onChange?.();
    function key(){const identity=adapter.getStorageKey?.();return identity?"genesis.settings.draft.v1:"+String(identity):null;}
    function readDraft(){
      const storageKey=key();if(!storageKey)return null;
      try{
        const saved=JSON.parse(adapter.storage?.getItem(storageKey)||"null");
        return saved?.version===1&&validDescriptor(saved.draft)&&saved.draft.values&&typeof saved.draft.values==="object"?clone(saved.draft):null;
      }catch(error){return null;}
    }
    function persist(){
      if(!draft||!scope||scope!==key())return;
      try{
        if(!adapter.storage)throw new Error("Draft storage unavailable");
        adapter.storage.setItem(scope,JSON.stringify({version:1,draft,updatedAt:Date.now()}));storageWarning="";
      }catch(error){storageWarning="下書きをこのタブに保存できません。再読み込みすると入力内容が失われます。";}
    }
    function removeStored(){try{if(scope)adapter.storage?.removeItem(scope);}catch(error){}}
    function findTarget(spec){
      const state=adapter.getState();
      const rows=spec.kind==="menu"?(state.menus?.[spec.category]||[]):spec.kind==="table"?(state.tables||[]):(adapter.getVisibleCasts?.()||state.casts||[]);
      return rows.find(item=>String(item.id)===String(spec.id))||null;
    }
    function safeScope(){
      if(scope&&scope===key())return true;
      message="ログイン情報が変わりました。編集を閉じて開き直してください。";notify();return false;
    }
    function onKey(event){
      if(!opened)return;
      const dialog=doc?.getElementById("settings-editor-dialog");if(!dialog)return;
      if(event.key==="Escape"){event.preventDefault();event.stopPropagation();if(!busy)close();return;}
      if(event.key!=="Tab")return;
      const nodes=Array.from(dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(node=>!node.hidden);
      const first=nodes[0]||dialog,last=nodes[nodes.length-1]||dialog;
      if(!dialog.contains(doc.activeElement)){event.preventDefault();first.focus();}
      else if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first.focus();}
    }
    function activate(){
      opened=true;returnFocus=doc?.activeElement||null;
      doc?.removeEventListener?.("keydown",onKey,true);doc?.addEventListener?.("keydown",onKey,true);
      adapter.onOpen?.();
    }
    function open(spec){
      if(busy||!validDescriptor(spec)||!key())return false;
      const prior=draft&&scope===key()?draft:readDraft();
      if(prior){
        const same=["kind","category","action"].every(field=>String(prior[field]||"")===String(spec[field]||""))&&(spec.action==="add"&&!spec.id||String(prior.id)===String(spec.id))&&(spec.kind!=="cast"||spec.action!=="add"||prior.castType===(spec.castType||"regular"));
        if(same){draft=prior;scope=key();errors={};message="";conflict=null;saveFailed=false;activate();return true;}
        if(adapter.confirm&&!adapter.confirm("保存していない下書きがあります。破棄して別の項目を編集しますか？"))return false;
      }
      const base=spec.action==="add"?null:clone(findTarget(spec));
      if(spec.action!=="add"&&!base)return false;
      let id=spec.id==null?"":String(spec.id);
      if(spec.action==="add"&&!id)id=spec.kind==="cast"?String(Date.now()):(spec.category||spec.kind)+"_"+Date.now()+"_"+Math.random().toString(36).slice(2,8);
      draft={kind:spec.kind,category:spec.category||"",id,action:spec.action,base,castType:spec.castType||base?.castType||"regular",businessDate:adapter.getState().activeBizDay||null,bizDate:adapter.getBizDate?.()||null,values:{}};
      draft.values=valuesFor(draft,base);scope=key();errors={};message="";conflict=null;saveFailed=false;persist();activate();return true;
    }
    function update(field,value){
      if(!opened||busy||!draft||!safeScope())return false;
      if(!Object.prototype.hasOwnProperty.call(draft.values,field))return false;
      draft.values[field]=field==="vip"?(value===true||value==="true"):String(value??"");
      delete errors[field];persist();return true;
    }
    function restore(){
      if(busy)return false;
      const saved=draft&&scope===key()?draft:readDraft();if(!saved)return false;
      draft=saved;scope=key();errors={};message="";conflict=null;saveFailed=false;activate();return true;
    }
    function finishClose(){
      opened=false;doc?.removeEventListener?.("keydown",onKey,true);adapter.onClose?.();
      const previous=returnFocus;returnFocus=null;
      if(previous?.isConnected)previous.focus();
      else if(previous?.dataset&&doc){
        const match=Array.from(doc.querySelectorAll('[data-kind][data-action]')).find(button=>["kind","category","id","action","castType"].every(field=>String(button.dataset[field]||"")===String(previous.dataset[field]||"")));
        (match||doc.querySelector('[data-stab].ac'))?.focus();
      }
    }
    function close(){if(busy)return false;persist();finishClose();return true;}
    function discardDraft(){
      if(busy)return false;
      if(adapter.confirm&&!adapter.confirm("保存していない入力内容を破棄しますか？"))return false;
      scope=key();removeStored();draft=null;errors={};message="";conflict=null;saveFailed=false;
      if(opened)finishClose();else adapter.onClose?.();return true;
    }
    async function submit(){
      if(!opened||!draft||busy||!safeScope())return false;
      if(conflict){message="最新内容を確認し、下の操作を選んでください。";notify();return false;}
      const checked=validate(draft);errors=checked.errors;
      if(draft.kind==="table"&&draft.action==="delete"){
        const blocked=adapter.tableBlocked?.(draft.id);if(blocked)errors.form=blocked+"のテーブルは削除できません。";
      }
      if(draft.kind==="table"&&draft.action==="add"&&(adapter.getState().tables||[]).length>=(adapter.maxTables||30))errors.form="テーブル数は最大 "+(adapter.maxTables||30)+" 卓です。";
      if(Object.keys(errors).length){focusField=Object.keys(errors)[0];notify();return false;}
      busy=true;message="";saveFailed=false;persist();notify();
      try{
        const result=await adapter.commit({...clone(draft),values:checked.values});
        if(result===false)throw new Error("保存できませんでした。入力内容を確認して再試行してください。");
        removeStored();draft=null;errors={};message="";conflict=null;saveFailed=false;busy=false;finishClose();return true;
      }catch(error){
        busy=false;saveFailed=true;message=error.userMessage||error.message||"保存できませんでした。入力内容は保持されています。";
        if(error.field&&Object.prototype.hasOwnProperty.call(draft.values,error.field)){errors[error.field]=message;focusField=error.field;}
        if(error.code==="SETTINGS_CONFLICT")conflict={current:clone(error.current)};
        persist();notify();return false;
      }
    }
    function loadCurrent(){
      if(busy||!draft||!conflict||!safeScope())return false;
      if(!conflict.current){message="この項目は削除されています。下書きを破棄して一覧を確認してください。";notify();return false;}
      draft.base=clone(conflict.current);draft.values=valuesFor(draft,conflict.current);conflict=null;saveFailed=false;message="最新内容を読み込みました。必要な変更を入力してください。";errors={};persist();notify();return true;
    }
    function retryConflict(){
      if(busy||!draft||!conflict||!safeScope())return Promise.resolve(false);
      if(!conflict.current&&draft.action!=="add"){message="この項目は削除されています。下書きを破棄して一覧を確認してください。";notify();return Promise.resolve(false);}
      draft.base=clone(conflict.current);conflict=null;message="";persist();return submit();
    }
    function attrs(spec){return Object.entries(spec).filter(([,value])=>value!=null).map(([name,value])=>' data-'+name.replace(/[A-Z]/g,char=>"-"+char.toLowerCase())+'="'+esc(value)+'"').join("");}
    function openButton(label,spec,options={}){
      return '<button type="button" class="se-button '+(options.danger?'se-danger':options.primary?'se-primary':'')+'"'+attrs(spec)+' onclick="settingsOpen(this.dataset)"'+(options.disabled?' disabled':'')+'>'+esc(label)+'</button>';
    }
    function row(kind,item,category){
      const name=kind==="cast"?item.name:item.label;
      let detail=kind==="menu"?(item.type==="percent"?String(item.value)+"%":"¥"+money(item.price))+(item.minutes!=null?" / "+item.minutes+"分":""):kind==="table"?(item.vip?"VIP":"通常卓"):(item.castType==="trial"?"体入 · "+(item.trialBizDay||""):"在籍");
      const blocked=kind==="table"?adapter.tableBlocked?.(String(item.id)):"";
      if(blocked)detail+=" · "+blocked;
      const spec={kind,category,id:item.id};
      return '<li class="se-row"><div class="se-row-content"><span class="se-row-name">'+esc(name)+'</span><span class="se-row-detail">'+esc(detail)+'</span></div><div class="se-actions">'+openButton("編集",{...spec,action:"edit"})+(category==="options"?"":openButton(kind==="cast"?"退店":"削除",{...spec,action:kind==="cast"?"depart":"delete"},{danger:true,disabled:!!blocked}))+'</div></li>';
    }
    function menuSection(category,label){
      const items=(adapter.getState().menus?.[category]||[]).filter(item=>category!=="options"||String(item.id)==="sc");
      const add=category==="options"?(items.length?"":openButton("単価を設定",{kind:"menu",category,id:"sc",action:"add"})):openButton("＋ 追加",{kind:"menu",category,action:"add"});
      return '<section class="se-section"><div class="se-section-head"><h3>'+esc(label)+'</h3>'+add+'</div>'+(items.length?'<ul class="se-list">'+items.map(item=>row("menu",item,category)).join("")+'</ul>':'<p class="se-empty">'+(category==="options"?'未設定（標準単価 ¥2,000）':'まだ登録されていません。')+'</p>')+'</section>';
    }
    function renderList(tab){
      const state=adapter.getState(),view=adapter.syncView?.()||{status:"saved",text:"設定は同期済み ✓"};
      let html='<div class="se-shell"><div class="se-page-head"><h2>設定</h2><p>項目を選んで編集し、保存すると全端末に反映されます。</p></div><div id="settings-sync-state" class="se-status" role="status" data-status="'+esc(view.status)+'">'+esc(view.text)+'</div>';
      if(hasDraft())html+='<aside class="se-draft-banner"><div><strong>保存していない下書きがあります</strong><p>このタブで入力した内容を復元できます。</p></div><div class="se-actions"><button type="button" class="se-button" onclick="settingsRestoreDraft()">編集を再開</button><button type="button" class="se-button se-danger" onclick="settingsDiscardDraft()">破棄</button></div></aside>';
      html+='<nav class="se-tabs" aria-label="設定カテゴリ">'+[["cast","キャスト"],["menus","メニュー料金"],["special","特殊メニュー"],["tables","テーブル"]].map(([id,label])=>'<button type="button" class="se-tab '+(tab===id?'ac':'')+'" data-stab="'+id+'" aria-current="'+(tab===id?'page':'false')+'" onclick="sst(this.dataset.stab)">'+label+'</button>').join("")+'</nav>';
      if(tab==="menus"||tab==="special"){
        html+=SECTIONS[tab].map(([category,label])=>menuSection(category,label)).join("");
        if(tab==="menus")html+=menuSection("options","シングルチャージ単価");
      }else if(tab==="tables"){
        const tables=state.tables||[],limit=adapter.maxTables||30;
        html+='<section class="se-section"><div class="se-section-head"><h3>テーブル <span class="se-count">'+tables.length+' / '+limit+'卓</span></h3>'+openButton("＋ 追加",{kind:"table",action:"add"},{disabled:tables.length>=limit})+'</div><p class="se-note">使用中・会計終了後の準備待ちの卓は削除できません。</p>'+(tables.length?'<ul class="se-list">'+tables.map(item=>row("table",item)).join("")+'</ul>':'<p class="se-empty">テーブルを追加してください。</p>')+'</section>';
      }else{
        const biz=adapter.getBizDate?.()||state.activeBizDay||"";
        const casts=adapter.getVisibleCasts?.()||(state.casts||[]).filter(item=>item.active!==false&&(item.castType!=="trial"||item.trialBizDay===biz)).slice().sort((a,b)=>(Number(a.sortIndex)||0)-(Number(b.sortIndex)||0));
        html+='<section class="se-section"><div class="se-section-head"><h3>キャスト名簿（入店順）</h3></div><p class="se-note">退店したキャストはPOS名簿から削除され、GMS側で管理します。</p><div class="se-add-actions">'+openButton("入店登録",{kind:"cast",action:"add",castType:"regular"},{primary:true})+openButton("体入登録",{kind:"cast",action:"add",castType:"trial"})+'</div>'+(casts.length?'<ul class="se-list">'+casts.map(item=>row("cast",item)).join("")+'</ul>':'<p class="se-empty">キャストを登録してください。</p>')+'</section>';
      }
      return html+'</div>';
    }
    function field(name,label,type){
      return '<label class="se-field" for="settings-field-'+name+'"><span>'+esc(label)+'</span><input id="settings-field-'+name+'" data-settings-field="'+name+'" type="'+(type||"text")+'"'+(type==='number'?' inputmode="numeric" min="'+(name==="minutes"?'1':'0')+'" step="1"':'')+' value="'+esc(draft.values[name])+'" oninput="settingsField(\''+name+'\',this.value)"'+(errors[name]?' aria-invalid="true" aria-describedby="settings-error-'+name+'"':'')+' autocomplete="off"><span id="settings-error-'+name+'" class="se-field-error">'+esc(errors[name]||"")+'</span></label>';
    }
    function conflictMarkup(){
      if(!conflict)return"";
      const current=conflict.current?valuesFor(draft,conflict.current):null;
      let html='<section class="se-conflict" aria-label="他端末との変更内容の比較"><h3>他端末で内容が変更されています</h3>';
      if(current){
        html+='<div class="se-diff"><div class="se-diff-head">項目</div><div class="se-diff-head">最新内容</div><div class="se-diff-head">入力内容</div>';
        const labels={name:"名前",label:"名前",price:"金額",minutes:"分数",vip:"VIP"};
        Object.keys(draft.values).forEach(name=>{const display=value=>name==="vip"?(value?"VIP":"通常卓"):value;html+='<div>'+esc(labels[name]||name)+'</div><div>'+esc(display(current[name]))+'</div><div>'+esc(display(draft.values[name]))+'</div>';});
        html+='</div><div class="se-conflict-actions"><button type="button" class="se-button" onclick="settingsLoadCurrent()">最新内容を読み込む</button><button type="button" class="se-button se-primary" onclick="settingsRetryConflict()">入力内容で保存を再試行</button></div><p class="se-note">再試行すると、表示された最新内容を基準に入力内容を保存します。</p>';
      }else html+='<p>この項目は削除されています。下書きを破棄して一覧を確認してください。</p>';
      return html+'</section>';
    }
    function renderModal(){
      if(!opened||!draft)return"";
      if(scope!==key())return '<div class="se-overlay"><section id="settings-editor-dialog" class="se-dialog" role="dialog" aria-modal="true" aria-label="ログイン情報の変更" tabindex="-1"><p>ログイン情報が変わりました。編集を閉じて開き直してください。</p><button type="button" class="se-button" onclick="settingsClose()">閉じる</button></section></div>';
      const currentFocus=doc?.activeElement;if(!focusField&&currentFocus?.dataset?.settingsField)focusField=currentFocus.dataset.settingsField;
      const destructive=draft.action==="delete"||draft.action==="depart";
      const action=draft.action==="add"?(draft.kind==="cast"?(draft.castType==="trial"?"体入登録":"入店登録"):"追加"):draft.action==="edit"?"編集":draft.action==="depart"?"退店":"削除";
      let html='<div class="se-overlay"><section id="settings-editor-dialog" class="se-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-editor-title" tabindex="-1" aria-busy="'+busy+'"><div class="se-dialog-head"><div><p class="se-eyebrow">'+esc(titleFor(draft))+'</p><h2 id="settings-editor-title">'+esc(action)+'</h2></div><button type="button" class="se-button se-close" aria-label="閉じる（下書きを保持）" onclick="settingsClose()"'+(busy?' disabled':'')+'>×</button></div><form onsubmit="event.preventDefault();settingsSubmit()" novalidate><fieldset class="se-fields"'+(busy?' disabled':'')+'>';
      if(destructive)html+='<div class="se-delete-summary"><strong>'+esc(draft.base?.name||draft.base?.label||"")+'</strong><p>'+esc(draft.action==="depart"?'このキャストを退店し、名簿から削除します。出勤中・付け回し中の場合は退店できません。':'この項目を削除します。保存済みの会計明細は変更されません。')+'</p></div>';
      else if(draft.kind==="cast")html+=field("name","キャスト名");
      else if(draft.kind==="table")html+=field("label","テーブル名")+'<label class="se-checkbox"><input type="checkbox" data-settings-field="vip"'+(draft.values.vip?' checked':'')+' onchange="settingsField(\'vip\',this.checked)"><span>VIPテーブル</span></label>';
      else html+=field("label","メニュー名")+field("price",draft.base?.type==="percent"?"割合（%）":"金額（円）","number")+(TIMED.has(draft.category)?field("minutes","時間（分）","number"):"");
      html+='</fieldset>'+(errors.form?'<p class="se-message se-error" role="alert">'+esc(errors.form)+'</p>':"")+(message?'<p class="se-message '+(saveFailed&&!conflict?'se-error':'')+'" role="alert">'+esc(message)+'</p>':"")+conflictMarkup();
      html+=(storageWarning?'<p class="se-message" role="status">'+esc(storageWarning)+'</p>':"");
      html+='<div class="se-discard-action"><button type="button" class="se-button se-danger" onclick="settingsDiscardDraft()"'+(busy?' disabled':'')+'>変更を破棄</button></div><div class="se-dialog-footer"><button type="button" class="se-button" onclick="settingsClose()"'+(busy?' disabled':'')+'>閉じる</button><button type="submit" class="se-button '+(destructive?'se-danger-fill':'se-primary')+'"'+(busy||conflict?' disabled':'')+'>'+(busy?'保存中…':destructive?action+'する':saveFailed?'保存を再試行':'保存する')+'</button></div><p class="se-footer-note" role="status">'+(busy?'保存完了までお待ちください。':'閉じても下書きはこのタブに保持されます。')+'</p></form></section></div>';
      return html;
    }
    function mountModal(){
      if(!opened)return;
      const dialog=doc?.getElementById("settings-editor-dialog");if(!dialog)return;
      const target=(focusField?dialog.querySelector('[data-settings-field="'+focusField+'"]'):null)||dialog.querySelector('input:not(:disabled)')||dialog.querySelector('button:not(:disabled)')||dialog;
      if(!target.matches?.(":disabled"))target.focus();else dialog.focus();focusField=null;
    }
    function hasDraft(){return !!(draft&&scope===key()||readDraft());}
    return{renderList,open,renderModal,mountModal,update,submit,close,restore,discardDraft,loadCurrent,retryConflict,isBusy:()=>busy,hasDraft};
  }
  return{create,validate,escapeHtml:esc};
});
