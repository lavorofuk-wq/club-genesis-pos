// OP-only account permissions. Authentication users are created in Firebase Console.
const ACCOUNT_ACCESS_ROLES=Object.freeze({
  cashier:{label:"キャッシャー",tabs:"フロア・リスト・設定・出勤"},
  list:{label:"リスト",tabs:"リスト・出勤"},
  op:{label:"OP",tabs:"全機能"}
});
let accountAccessState={scope:null,attempted:false,loaded:false,loading:false,saving:false,users:Object.create(null),roles:Object.create(null),uid:"",role:"cashier",error:"",message:"",request:0};
let accountAccessLoadPromise=null;
function accountAccessEscape(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);}
function accountAccessValidUid(uid){return typeof uid==="string"&&uid.length>0&&uid.length<=128&&!/[.#$\[\]\/\s\u0000-\u001f\u007f]/.test(uid);}
function accountAccessKnownRole(role){return Object.prototype.hasOwnProperty.call(ACCOUNT_ACCESS_ROLES,role);}
function accountAccessAllowed(){
  return window._posRole==="op"&&accountAccessValidUid(window._posUid)
    &&(!window.PosAccess?.canView||window.PosAccess.canView(window._posRole,"accounts")===true);
}
function clearAccountAccessState(){
  const request=accountAccessState.request+1;
  accountAccessState={scope:null,attempted:false,loaded:false,loading:false,saving:false,users:Object.create(null),roles:Object.create(null),uid:"",role:"cashier",error:"",message:"",request};
  accountAccessLoadPromise=null;
}
function accountAccessScope(){
  if(!accountAccessAllowed()){clearAccountAccessState();return null;}
  const uid=window._posUid;
  if(accountAccessState.scope!==uid){clearAccountAccessState();accountAccessState.scope=uid;}
  return uid;
}
function refreshAccountAccess(){if(typeof vw!=="undefined"&&vw==="accounts"&&typeof render==="function")render();}
function accountAccessError(error){
  const code=String(error?.code||error?.message||"").toLowerCase();
  if(code.includes("permission")||code.includes("unauthorized"))return "権限を確認できませんでした。OPアカウントでログインし直してください。";
  return "保存先に接続できませんでした。通信状態を確認して、もう一度お試しください。";
}
function accountAccessSameRequest(scope,request){return accountAccessAllowed()&&window._posUid===scope&&accountAccessState.scope===scope&&accountAccessState.request===request;}
async function ensureAccountAccessLoaded(force=false){
  const scope=accountAccessScope();if(!scope)return false;
  if(accountAccessState.saving)return false;
  if(accountAccessState.loading)return accountAccessLoadPromise;
  if(accountAccessState.attempted&&!force)return accountAccessState.loaded;
  accountAccessState.loading=true;accountAccessState.attempted=true;accountAccessState.error="";accountAccessState.message="";
  const request=++accountAccessState.request;
  accountAccessLoadPromise=(async()=>{
    try{
      if(!window._db)throw new Error("database unavailable");
      const snapshot=await window._db.ref("access").get();
      if(!accountAccessSameRequest(scope,request))return false;
      const value=snapshot.val()||{},users=Object.create(null),roles=Object.create(null);
      for(const [uid,allowed] of Object.entries(value.authorizedUsers||{}))if(accountAccessValidUid(uid)&&typeof allowed==="boolean")users[uid]=allowed;
      for(const [uid,role] of Object.entries(value.roles||{}))if(accountAccessValidUid(uid)&&typeof role==="string")roles[uid]=role;
      accountAccessState.users=users;accountAccessState.roles=roles;accountAccessState.loaded=true;
      return true;
    }catch(error){
      if(accountAccessSameRequest(scope,request))accountAccessState.error=accountAccessError(error);
      return false;
    }finally{
      if(accountAccessSameRequest(scope,request)){accountAccessState.loading=false;accountAccessLoadPromise=null;refreshAccountAccess();}
    }
  })();
  refreshAccountAccess();
  return accountAccessLoadPromise;
}
function accountAccessField(field,value){
  if(!accountAccessScope()||accountAccessState.saving)return;
  if(field==="uid")accountAccessState.uid=String(value||"");
  if(field==="role"&&accountAccessKnownRole(value))accountAccessState.role=value;
  accountAccessState.error="";accountAccessState.message="";
  const notice=typeof document!=="undefined"?document.getElementById("account-access-notice"):null;
  if(notice){notice.textContent="";notice.hidden=true;}
}
function editAccountAccess(uid){
  const scope=accountAccessScope();if(!scope||accountAccessState.saving||accountAccessState.loading||uid===scope||!accountAccessValidUid(uid))return false;
  accountAccessState.uid=uid;
  const role=accountAccessState.roles[uid];accountAccessState.role=accountAccessKnownRole(role)?role:"cashier";
  accountAccessState.error="";accountAccessState.message="";refreshAccountAccess();
  const input=typeof document!=="undefined"?document.getElementById("account-access-uid"):null;
  input?.focus();return true;
}
async function saveAccountAccess(){
  const scope=accountAccessScope();if(!scope||accountAccessState.saving||accountAccessState.loading)return false;
  const uidInput=typeof document!=="undefined"?document.getElementById("account-access-uid"):null;
  const roleInput=typeof document!=="undefined"?document.getElementById("account-access-role"):null;
  const uid=uidInput?uidInput.value:accountAccessState.uid,role=roleInput?roleInput.value:accountAccessState.role;
  accountAccessState.uid=uid;accountAccessState.role=role;accountAccessState.error="";accountAccessState.message="";
  if(!accountAccessValidUid(uid))accountAccessState.error="FirebaseのユーザーUIDを入力してください（1〜128文字、空白や . # $ [ ] / は使用できません）。";
  else if(uid===scope)accountAccessState.error="ログイン中の自分の権限は変更できません。";
  else if(!accountAccessKnownRole(role))accountAccessState.error="アカウントの種類を選択してください。";
  if(accountAccessState.error){refreshAccountAccess();return false;}
  return writeAccountAccess(uid,role,true);
}
async function revokeAccountAccess(uid){
  const scope=accountAccessScope();if(!scope||accountAccessState.saving||accountAccessState.loading)return false;
  accountAccessState.error="";accountAccessState.message="";
  if(!accountAccessValidUid(uid))accountAccessState.error="ユーザーUIDが正しくありません。";
  else if(uid===scope)accountAccessState.error="ログイン中の自分の利用権限は停止できません。";
  else if(accountAccessState.users[uid]!==true)return false;
  if(accountAccessState.error){refreshAccountAccess();return false;}
  return writeAccountAccess(uid,accountAccessState.roles[uid],false);
}
async function writeAccountAccess(uid,role,allowed){
  const scope=accountAccessScope();
  if(!scope||accountAccessState.saving||accountAccessState.loading||!accountAccessValidUid(uid)||uid===scope||typeof allowed!=="boolean"||allowed&&!accountAccessKnownRole(role))return false;
  accountAccessState.saving=true;accountAccessState.error="";accountAccessState.message="";
  const request=++accountAccessState.request;
  refreshAccountAccess();
  try{
    if(!window._db)throw new Error("database unavailable");
    const updates={["authorizedUsers/"+uid]:allowed};
    if(allowed)updates["roles/"+uid]=role;
    await window._db.ref("access").update(updates);
    if(!accountAccessSameRequest(scope,request))return false;
    accountAccessState.users[uid]=allowed;
    if(allowed)accountAccessState.roles[uid]=role;
    accountAccessState.message=allowed?"アカウントの権限を保存しました。": "アカウントの利用を停止しました。";
    return true;
  }catch(error){
    if(accountAccessSameRequest(scope,request))accountAccessState.error=accountAccessError(error);
    return false;
  }finally{
    if(accountAccessSameRequest(scope,request)){accountAccessState.saving=false;refreshAccountAccess();}
  }
}
function rAccountAccess(){
  const scope=accountAccessScope();
  if(!scope)return '<section class="aa-shell"><p class="aa-notice aa-error" role="alert">この画面はOPアカウントのみ利用できます。</p></section>';
  const state=accountAccessState,busy=state.loading||state.saving,disabled=busy?" disabled":"",escape=accountAccessEscape;
  const entries=[...new Set([...Object.keys(state.users),...Object.keys(state.roles)])].sort((a,b)=>a===scope?-1:b===scope?1:a.localeCompare(b));
  const notice=state.error||state.message;
  let html='<section class="aa-shell" aria-labelledby="account-access-title"><div class="aa-heading"><div><h2 id="account-access-title">アカウント権限</h2><p>アカウントごとに使用できるタブを指定します。</p></div><button type="button" class="aa-button" onclick="ensureAccountAccessLoaded(true)"'+disabled+'>再読み込み</button></div>';
  html+='<div class="aa-card"><h3>利用するアカウントを登録・変更</h3><p class="aa-help"><a href="https://console.firebase.google.com/project/club-genesis-5cba7/authentication/users" target="_blank" rel="noopener noreferrer">Firebase Authenticationでアカウントを作成</a>し、ユーザーUIDを入力してください。パスワードの入力は不要です。</p>';
  html+='<form onsubmit="event.preventDefault();saveAccountAccess()"><fieldset'+disabled+'><label for="account-access-uid">ユーザーUID</label><input id="account-access-uid" name="uid" type="text" maxlength="128" autocomplete="off" autocapitalize="none" spellcheck="false" value="'+escape(state.uid)+'" oninput="accountAccessField(\'uid\',this.value)" required><label for="account-access-role">アカウントの種類</label><select id="account-access-role" name="role" onchange="accountAccessField(\'role\',this.value)">';
  for(const [role,value] of Object.entries(ACCOUNT_ACCESS_ROLES))html+='<option value="'+role+'"'+(state.role===role?' selected':'')+'>'+value.label+' — '+value.tabs+'</option>';
  html+='</select><button type="submit" class="aa-button aa-primary">'+(state.saving?'保存中…':'保存して利用を許可')+'</button></fieldset></form>';
  html+='<p class="aa-help">ログイン中の自分の権限は変更・停止できません。利用停止後もFirebaseのアカウントは残ります。</p></div>';
  html+='<p id="account-access-notice" class="aa-notice'+(state.error?' aa-error':'')+'" role="'+(state.error?'alert':'status')+'"'+(notice?'':' hidden')+'>'+escape(notice)+'</p>';
  html+='<div class="aa-card"><h3>登録済みアカウント</h3>';
  if(state.loading)html+='<p class="aa-help" role="status">権限を読み込み中…</p>';
  else if(!state.loaded)html+='<p class="aa-help">'+(state.attempted?'一覧を読み込めませんでした。「再読み込み」で再試行してください。':'一覧を読み込んでください。')+'</p>';
  else if(!entries.length)html+='<p class="aa-help">登録されたアカウントはありません。</p>';
  else{
    html+='<ul class="aa-list">';
    for(const uid of entries){
      const self=uid===scope,role=state.roles[uid],knownRole=accountAccessKnownRole(role),enabled=state.users[uid]===true&&knownRole;
      const status=enabled?'利用可':state.users[uid]===true?'権限未設定':'利用停止中';
      html+='<li class="aa-row"><div class="aa-account"><div class="aa-account-title"><strong>'+escape(knownRole?ACCOUNT_ACCESS_ROLES[role].label:'未設定')+'</strong><span class="aa-badge'+(enabled?' aa-enabled':'')+'">'+status+'</span>'+(self?'<span class="aa-self">ログイン中</span>':'')+'</div><code>'+escape(uid)+'</code><p>'+escape(knownRole?ACCOUNT_ACCESS_ROLES[role].tabs:'アカウントの種類を設定してください')+'</p></div><div class="aa-actions">';
      if(!self){
        html+='<button type="button" class="aa-button" data-uid="'+escape(uid)+'" onclick="editAccountAccess(this.dataset.uid)"'+disabled+'>変更</button>';
        if(state.users[uid]===true)html+='<button type="button" class="aa-button aa-danger" data-uid="'+escape(uid)+'" onclick="revokeAccountAccess(this.dataset.uid)"'+disabled+'>利用停止</button>';
      }
      html+='</div></li>';
    }
    html+='</ul>';
  }
  return html+'</div></section>';
}
