(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PosReleaseNotes=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const history=Object.freeze([
    {version:'6.157.2',kind:'fix',title:'ログイン画面の新UIを統一',changes:[
      '本番のログイン画面を、白と青を基調としたスタッフログイン画面に統一しました。',
      '旧ログイン画面の装飾と重複したスタイル定義を削除し、画面サイズが小さい端末でも入力欄とボタンを操作できるようにしました。',
      'アカウント認証、利用権限、営業データの保存方法は変更していません。'
    ]},
    {version:'6.157.1',kind:'fix',title:'営業前の出勤登録を禁止',changes:[
      '営業していない間は、出勤タブと出勤・退勤の登録や編集を利用できないよう修正しました。',
      '他端末で営業終了・営業日切替が行われた場合、古い出勤入力画面を閉じ、別の営業日への誤登録を防ぎます。',
      '出勤画面で不要な過去営業日の読み込みを行わず、現在の出勤情報だけを表示するよう改善しました。'
    ]},
    {version:'6.157',kind:'feature',title:'キャッシャーの営業開始に対応',changes:[
      'キャッシャーのホームに「営業を開始する」ボタンを追加しました。',
      'キャッシャーは未登録の営業日を開始できます。営業終了と保存済み営業日の上書きは引き続きOP限定です。'
    ]},
    {version:'6.156',kind:'feature',title:'アカウントごとのタブ利用権限',changes:[
      'キャッシャーはフロア・リスト・設定・出勤、リスト担当はリスト・出勤、OPは全機能を利用できます。',
      'OP専用の「アカウント権限」画面で、作成済みアカウントのUIDと役割を登録できます。',
      '権限に応じて画面とデータアクセスを制限し、権限変更後は再ログインを求めます。'
    ]},
    {version:'6.155.3',kind:'fix',title:'ホームの会計済み売上を修正',changes:[
      'ホームの会計済み金額が、営業中の最新の会計履歴を反映するよう修正しました。',
      '合計見込みにも会計済み売上を正しく含めます。会計金額や保存済みデータは変更しません。'
    ]},
    {version:'6.155.2',kind:'ui',title:'業務画面の表示を統一',changes:[
      '四角い枠、グレーの見出し、青い選択タブを基調とした業務画面に統一しました。',
      'ホームの売上集計を罫線で区切り、画面見出しを日本語に揃えました。'
    ]},
    {version:'6.155.1',kind:'ui',title:'画面デザインを整理',changes:[
      '配色・文字の強弱・区切り線を統一し、ホーム・フロア・ログイン・設定画面の装飾を整理しました。',
      '計算・会計・データ保存の処理は変更していません。'
    ]},
    {version:'6.155',kind:'feature',title:'会計終了済のセット時刻・超過時間',changes:[
      'フロア・リストの会計終了済テーブルに、セット開始時刻と延長を含むセット終了時刻を表示します。',
      'セット終了時刻からの超過時間を、テーブル準備が完了するまで更新します。'
    ]},
    {version:'6.154',kind:'feature',title:'お知らせを一覧から選べるようにしました',changes:[
      '「今回の更新」と「更新履歴」を切り替え、お知らせを一覧から選んで読めるようにしました。',
      'スマートフォンでは選択欄からお知らせを切り替えられます。'
    ]},
    {version:'6.153.3',kind:'ui',title:'お知らせ画面の装飾を整理',changes:[
      '英字見出しと大きなバージョン表示を省き、変更内容を中心に表示するようにしました。',
      '更新履歴のカード枠と項目番号を外し、区切り線と箇条書きに変更しました。'
    ]},
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
    const kindLabels={feature:'機能追加',fix:'不具合修正',ui:'表示改善'};
    let opened=null,previousFocus=null,removeListeners=null,bodyOverflow=null,focusMemory='';
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
    function entries(){return opened?(opened.view==='history'?opened.history:opened.updates):[];}
    function clearListeners(){if(removeListeners)removeListeners();removeListeners=null;}
    function open(options={}){
      const manual=options.manual===true,current=currentVersion(),key=scope();
      if(!current||(!manual&&!needsAttention()))return false;
      clearListeners();
      const active=doc?.activeElement;
      if(!opened||!doc?.getElementById('release-notes-dialog')?.contains?.(active))previousFocus=active||null;
      const known=seen(key);
      opened={scope:key,version:current,manual,view:manual?'history':'updates',selected:0,
        updates:entriesFor(current,known,false),history:entriesFor(current,known,true)};
      focusMemory='';lockScroll();adapter.onOpen?.();return true;
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
      const snapshot=opened;recordSeen(snapshot);opened=null;clearListeners();focusMemory='';
      unlockScroll();adapter.onClose?.();
      const target=previousFocus?.isConnected===false?(previousFocus.id?doc?.getElementById(previousFocus.id):null):previousFocus;
      previousFocus=null;
      try{target?.focus?.({preventScroll:true});}catch(_error){}
      return true;
    }
    function listMarkup(){return entries().map((entry,index)=>'<button type="button" class="rn-list-button" data-release-notes-entry="'+index+'" aria-current="'+(index===opened.selected)+'" aria-controls="release-notes-detail"><span class="rn-list-version">Ver'+escape(entry.version)+'</span><span class="rn-list-title">'+escape(entry.title)+'</span><span class="rn-list-kind">'+escape(kindLabels[entry.kind]||'更新')+'</span></button>').join('');}
    function optionsMarkup(){return entries().map((entry,index)=>'<option value="'+index+'"'+(index===opened.selected?' selected':'')+'>Ver'+escape(entry.version)+'　'+escape(entry.title)+'</option>').join('');}
    function detailMarkup(){
      const entry=entries()[opened.selected];
      return '<article id="release-notes-detail" class="rn-entry" aria-labelledby="release-note-heading"><div class="rn-entry-meta"><p class="rn-version">Ver'+escape(entry.version)+'</p><span class="rn-kind">'+escape(kindLabels[entry.kind]||'更新')+'</span></div><h3 id="release-note-heading">'+escape(entry.title)+'</h3><ul class="rn-changes">'+entry.changes.map(change=>'<li>'+escape(change)+'</li>').join('')+'</ul></article>';
    }
    function renderModal(){
      if(!opened)return '';
      return '<div class="rn-overlay"><section id="release-notes-dialog" class="rn-dialog" role="dialog" aria-modal="true" aria-labelledby="release-notes-title" tabindex="-1">'
        +'<div class="rn-header"><h2 id="release-notes-title">お知らせ</h2><button type="button" class="rn-close" data-release-notes-action="dismiss" aria-label="閉じる（確認済みにする）">×</button></div>'
        +'<div class="rn-toolbar" role="group" aria-label="お知らせの表示内容"><button type="button" class="rn-tab" data-release-notes-view="updates" title="今回の更新内容" aria-pressed="'+(opened.view==='updates')+'" aria-controls="release-notes-panel">今回の更新</button><button type="button" class="rn-tab" data-release-notes-view="history" aria-pressed="'+(opened.view==='history')+'" aria-controls="release-notes-panel">更新履歴</button></div>'
        +'<div id="release-notes-panel" class="rn-layout"><nav class="rn-sidebar" aria-label="お知らせ一覧"><p class="rn-sidebar-label">お知らせ一覧</p><div class="rn-list">'+listMarkup()+'</div></nav>'
        +'<div class="rn-mobile-picker"><label for="release-notes-select">お知らせを選択</label><select id="release-notes-select" aria-controls="release-notes-detail">'+optionsMarkup()+'</select></div>'
        +'<div id="release-notes-content" class="rn-content" tabindex="0" role="region" aria-labelledby="release-note-heading">'+detailMarkup()+'</div></div>'
        +'<footer class="rn-footer"><button type="button" class="rn-confirm" data-release-notes-action="acknowledge">確認しました</button></footer></section></div>';
    }
    function visible(element){
      if(!element||element.hidden||element.getAttribute?.('aria-hidden')==='true'||element.closest?.('[hidden], [aria-hidden="true"]'))return false;
      const style=doc?.defaultView?.getComputedStyle?.(element);
      if(style&&(style.display==='none'||style.visibility==='hidden'))return false;
      return typeof element.getClientRects!=='function'||element.getClientRects().length>0;
    }
    function focusSelector(element){
      if(element?.id==='release-notes-select')return '#release-notes-select';
      if(element?.id==='release-notes-content')return '#release-notes-content';
      const data=element?.dataset||{};
      if(['updates','history'].includes(data.releaseNotesView))return '[data-release-notes-view="'+data.releaseNotesView+'"]';
      if(/^\d+$/.test(data.releaseNotesEntry||''))return '[data-release-notes-entry="'+data.releaseNotesEntry+'"]';
      if(['acknowledge','dismiss'].includes(data.releaseNotesAction))return '[data-release-notes-action="'+data.releaseNotesAction+'"]';
      return '';
    }
    function refreshDialog(rebuildList){
      const dialog=doc?.getElementById('release-notes-dialog');if(!opened||!dialog||!canInteract())return;
      const active=doc.activeElement,hadFocus=dialog.contains(active),wanted=focusSelector(active);
      dialog.querySelectorAll('[data-release-notes-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.releaseNotesView===opened.view)));
      const list=dialog.querySelector('.rn-list'),select=dialog.querySelector('#release-notes-select');
      if(rebuildList){if(list)list.innerHTML=listMarkup();if(select)select.innerHTML=optionsMarkup();}
      dialog.querySelectorAll('[data-release-notes-entry]').forEach(button=>button.setAttribute('aria-current',String(Number(button.dataset.releaseNotesEntry)===opened.selected)));
      if(select)select.value=String(opened.selected);
      const content=dialog.querySelector('.rn-content');if(content){content.innerHTML=detailMarkup();content.scrollTop=0;}
      if(hadFocus&&(!dialog.contains(active)||!visible(active))){
        const restore=wanted?dialog.querySelector(wanted):null;
        const target=visible(restore)?restore:dialog.querySelector('[data-release-notes-view="'+opened.view+'"]');
        if(visible(target))target.focus({preventScroll:true});
      }
    }
    function setView(view){
      if(!opened||!canInteract()||!['updates','history'].includes(view))return false;
      if(opened.view===view)return true;
      opened.view=view;opened.selected=0;refreshDialog(true);return true;
    }
    function selectEntry(index){
      if(!opened||!canInteract()||!['number','string'].includes(typeof index)||String(index).trim()==='')return false;
      const next=Number(index);if(!Number.isInteger(next)||next<0||next>=entries().length)return false;
      if(opened.selected===next)return true;
      opened.selected=next;refreshDialog(false);return true;
    }
    function mountModal(){
      clearListeners();
      const dialog=doc?.getElementById('release-notes-dialog');if(!opened||!dialog)return false;
      const focusable=()=>Array.from(dialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')).filter(visible);
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
        const button=event.target?.closest?.('[data-release-notes-action], [data-release-notes-view], [data-release-notes-entry]');
        if(!button||!dialog.contains(button))return;
        const data=button.dataset;
        if(['acknowledge','dismiss'].includes(data.releaseNotesAction)){event.preventDefault();acknowledge();}
        else if(data.releaseNotesView!==undefined){event.preventDefault();setView(data.releaseNotesView);}
        else if(data.releaseNotesEntry!==undefined){event.preventDefault();selectEntry(data.releaseNotesEntry);}
      };
      const change=event=>{if(live()&&event.target?.id==='release-notes-select'&&dialog.contains(event.target))selectEntry(event.target.value);};
      const focusin=event=>{if(live()){const selector=focusSelector(event.target);if(selector)focusMemory=selector;}};
      doc.addEventListener('keydown',keydown,true);dialog.addEventListener('click',click);dialog.addEventListener('change',change);dialog.addEventListener('focusin',focusin);
      removeListeners=()=>{doc.removeEventListener('keydown',keydown,true);dialog.removeEventListener('click',click);dialog.removeEventListener('change',change);dialog.removeEventListener('focusin',focusin);};
      const active=doc.activeElement;
      if(canInteract()&&(!dialog.contains(active)||!visible(active))){
        const remembered=focusMemory?dialog.querySelector(focusMemory):null;
        (visible(remembered)?remembered:dialog.querySelector('[data-release-notes-action="acknowledge"]')||dialog).focus({preventScroll:true});
      }
      return true;
    }
    return{needsAttention,open,renderModal,mountModal,setView,selectEntry,acknowledge,isOpen:()=>!!opened,dismiss:acknowledge};
  }
  return{history,compareVersions,storageKey,create};
});
