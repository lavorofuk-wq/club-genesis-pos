(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PosReleaseNotes=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const history=Object.freeze([
    {version:'6.153.2',kind:'ui',title:'アップデートのお知らせをリニューアル',changes:[
      'バージョンがひと目でわかる告知バナーを追加しました。',
      '変更内容に番号と種類を付け、過去の更新も読みやすくしました。'
    ]},
    {version:'6.153.1',kind:'ui',title:'更新通知の表示を調整',changes:[
      '更新内容と履歴の画面を、POSと同じ白背景・青いボタンに統一しました。'
    ]},
    {version:'6.153',kind:'feature',title:'更新内容のお知らせを追加',changes:[
      '新しいバージョンを読み込んだ後、初回に更新内容を表示します。',
      '確認済みのお知らせは同じブラウザ・アカウントでは繰り返し表示せず、バージョン表示から更新履歴を開けます。'
    ]},
    {version:'6.152.1',kind:'fix',title:'設定保存と既存伝票の互換性を修正',changes:[
      '設定の保存に失敗したときは入力を保持し、他端末で確定した最新の設定を反映します。',
      '営業日が変わったキャスト登録の下書きは、そのまま保存せず現在の営業日で確認し直せます。',
      '時間が未設定の旧メニューは、時間を変えずに名前や料金を編集できます。',
      'メニューから削除した商品も、既存伝票の画面とレシートに表示します。',
      '0円のキャストDrinkを注文できるようにしました。',
      'キャスト改名と注文・出退勤などの同時更新で、未保存の注文が混入したり新しい内容が戻ったりする問題を修正しました。'
    ]},
    {version:'6.152',kind:'feature',title:'設定画面を編集モーダルに刷新',changes:[
      '料金・テーブル・キャストは編集画面で内容を確認してから保存する方式になりました。',
      '編集中の下書きを確定済みの設定から分離し、保存失敗後も入力を残して再試行できます。',
      '他端末との変更の競合は差分を表示し、最新内容の読み込みや保存の再試行を選べます。',
      '同じタブを再読み込みした後も下書きを復元でき、0円の料金も明示的に保存できます。'
    ]}
  ].map(entry=>Object.freeze({...entry,changes:Object.freeze(entry.changes)})));
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const version=value=>typeof value==='string'?value.trim():'';
  function compareVersions(left,right){
    left=version(left);right=version(right);
    if(left===right)return 0;
    if(!/^\d+(?:\.\d+)*$/.test(left)||!/^\d+(?:\.\d+)*$/.test(right))return null;
    const a=left.split('.').map(Number),b=right.split('.').map(Number);
    if([...a,...b].some(value=>!Number.isSafeInteger(value)))return null;
    for(let i=0;i<Math.max(a.length,b.length);i++){
      if((a[i]||0)!==(b[i]||0))return(a[i]||0)>(b[i]||0)?1:-1;
    }
    return 0;
  }
  const storageKey=scope=>'genesis_release_notes_seen_v1:'+scope;
  const fallback=current=>({version:current,title:'新しいバージョンに更新されました',changes:['最新のバージョンを読み込みました。操作を始める前にバージョンをご確認ください。']});
  function create(adapter){
    const doc=adapter.document||(typeof document!=='undefined'?document:null),memorySeen=new Map();
    let opened=null,previousFocus=null,removeListeners=null,bodyOverflow=null;
    function canInteract(){try{return adapter.canInteract?.()!==false;}catch(_error){return false;}}
    function lockScroll(){if(bodyOverflow===null&&doc?.body?.style){bodyOverflow=doc.body.style.overflow;doc.body.style.overflow='hidden';}}
    function unlockScroll(){if(bodyOverflow!==null&&doc?.body?.style)doc.body.style.overflow=bodyOverflow;bodyOverflow=null;}
    function scope(){try{const value=adapter.getScope();return typeof value==='string'&&value.trim()?value:null;}catch(_error){return null;}}
    function currentVersion(){try{return version(adapter.getVersion());}catch(_error){return '';}}
    function latest(left,right){if(!left)return right;if(!right)return left;return compareVersions(right,left)===1?right:left;}
    function seen(key){
      if(!key)return '';
      let stored='';
      try{const parsed=JSON.parse(adapter.storage?.getItem(storageKey(key))||'null');stored=version(parsed?.version);}catch(_error){}
      const result=latest(memorySeen.get(key)||'',stored);
      if(result)memorySeen.set(key,result);
      return result;
    }
    function needsAttention(){
      const key=scope(),current=currentVersion();if(!key||!current)return false;
      const known=seen(key);return !known||compareVersions(current,known)===1||(compareVersions(current,known)===null&&current!==known);
    }
    function entriesFor(current,known,manual){
      const currentEntry=history.find(entry=>compareVersions(entry.version,current)===0)||fallback(current);
      if(!manual&&!known)return[currentEntry];
      const entries=history.filter(entry=>{
        const upper=compareVersions(entry.version,current);return(upper===0||upper===-1)&&(manual||compareVersions(entry.version,known)===1);
      });
      if(!entries.some(entry=>compareVersions(entry.version,current)===0))entries.unshift(currentEntry);
      return entries;
    }
    function clearListeners(){if(removeListeners)removeListeners();removeListeners=null;}
    function open(options={}){
      const manual=options.manual===true,current=currentVersion(),key=scope();
      if(!current||(!manual&&!needsAttention()))return false;
      clearListeners();
      const active=doc?.activeElement;
      if(!opened||!doc?.getElementById('release-notes-dialog')?.contains?.(active))previousFocus=active||null;
      opened={scope:key,version:current,manual,entries:entriesFor(current,seen(key),manual)};
      lockScroll();adapter.onOpen?.();return true;
    }
    function recordSeen(snapshot){
      if(!snapshot.scope||snapshot.scope!==scope())return;
      const existing=seen(snapshot.scope),order=compareVersions(snapshot.version,existing);
      if(existing&&(order===-1||order===0))return;
      memorySeen.set(snapshot.scope,snapshot.version);
      try{adapter.storage?.setItem(storageKey(snapshot.scope),JSON.stringify({version:snapshot.version,seenAt:Date.now()}));}catch(_error){}
    }
    function acknowledge(){
      if(!opened||!canInteract())return false;
      const snapshot=opened;recordSeen(snapshot);opened=null;clearListeners();
      unlockScroll();adapter.onClose?.();
      const target=previousFocus?.isConnected===false?(previousFocus.id?doc?.getElementById(previousFocus.id):null):previousFocus;
      previousFocus=null;
      try{target?.focus?.({preventScroll:true});}catch(_error){}
      return true;
    }
    function renderModal(){
      if(!opened)return '';
      const manual=opened.manual,kindLabels={feature:'機能追加',fix:'不具合修正',ui:'表示改善'};
      return '<div class="rn-overlay"><section id="release-notes-dialog" class="rn-dialog" role="dialog" aria-modal="true" aria-labelledby="release-notes-title" tabindex="-1">'
        +'<div class="rn-header"><div class="rn-header-copy"><span class="rn-channel" lang="en">INFORMATION</span><h2 id="release-notes-title">'+(manual?'更新履歴':'今回の更新内容')+'</h2></div><button type="button" class="rn-close" data-release-notes-action="dismiss" aria-label="閉じる（確認済みにする）">×</button></div>'
        +'<div class="rn-content"><div class="rn-banner"><p class="rn-banner-label" lang="en">PATCH NOTES</p><p class="rn-banner-version"><span>Ver</span>'+escape(opened.version)+'</p><p class="rn-banner-note">'+(manual?'これまでのアップデート内容を確認できます。':'アップデートが完了しました。')+'</p></div>'
        +'<div class="rn-feed"><div class="rn-feed-head"><span lang="en">UPDATE LOG</span><span>'+opened.entries.length+'件の更新</span></div>'
        +opened.entries.map((entry,index)=>'<article class="rn-entry" aria-labelledby="release-note-'+index+'"><div class="rn-entry-meta"><p class="rn-version">Ver'+escape(entry.version)+'</p><span class="rn-kind" data-kind="'+escape(entry.kind||'update')+'">'+escape(kindLabels[entry.kind]||'更新')+'</span></div><h3 id="release-note-'+index+'">'+escape(entry.title)+'</h3><ol class="rn-changes">'+entry.changes.map(change=>'<li><span>'+escape(change)+'</span></li>').join('')+'</ol></article>').join('')
        +'</div></div><footer class="rn-footer">'+(manual?'':'<p>更新履歴は画面上部のバージョン番号から開けます。</p>')+'<button type="button" class="btn gbg rn-confirm" data-release-notes-action="acknowledge">確認しました<span class="rn-confirm-arrow" aria-hidden="true">→</span></button></footer></section></div>';
    }
    function mountModal(){
      clearListeners();
      const dialog=doc?.getElementById('release-notes-dialog');if(!opened||!dialog)return false;
      const focusable=()=>Array.from(dialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')).filter(el=>!el.hidden&&el.getAttribute?.('aria-hidden')!=='true');
      const live=()=>opened&&doc.getElementById('release-notes-dialog')===dialog&&canInteract();
      const keydown=event=>{
        if(!live())return;
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();acknowledge();return;}
        if(event.key!=='Tab')return;
        const items=focusable(),first=items[0],last=items[items.length-1],active=doc.activeElement;
        if(!first){event.preventDefault();dialog.focus();return;}
        if(!items.includes(active)||(event.shiftKey&&active===first)||(!event.shiftKey&&active===last)){
          event.preventDefault();(event.shiftKey?last:first).focus();
        }
      };
      const click=event=>{
        if(!live())return;
        const button=event.target?.closest?.('[data-release-notes-action]');
        if(!button||!dialog.contains(button))return;
        if(['acknowledge','dismiss'].includes(button.dataset.releaseNotesAction)){event.preventDefault();acknowledge();}
      };
      doc.addEventListener('keydown',keydown,true);dialog.addEventListener('click',click);
      removeListeners=()=>{doc.removeEventListener('keydown',keydown,true);dialog.removeEventListener('click',click);};
      const active=doc.activeElement;
      if(canInteract()&&!dialog.contains(active))(dialog.querySelector('[data-release-notes-action="acknowledge"]')||dialog).focus();
      return true;
    }
    return{needsAttention,open,renderModal,mountModal,acknowledge,isOpen:()=>!!opened,dismiss:acknowledge};
  }
  return{history,compareVersions,storageKey,create};
});
