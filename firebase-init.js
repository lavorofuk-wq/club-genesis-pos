(function(){
  const SDKS=[
    "https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js",
    "https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js"
  ];
  const cfg={apiKey:"AIzaSyD_7XgXow1D-cp-TNsbqitjMzJCGD5DE64",authDomain:"club-genesis-5cba7.firebaseapp.com",databaseURL:"https://club-genesis-5cba7-default-rtdb.asia-southeast1.firebasedatabase.app",projectId:"club-genesis-5cba7",storageBucket:"club-genesis-5cba7.firebasestorage.app",messagingSenderId:"591051426146",appId:"1:591051426146:web:08a486510b89d6be0e443b"};

  function setLoading(msg,sub){
    const lmsg=document.getElementById("lmsg");
    const lsub=document.getElementById("lsub");
    if(lmsg)lmsg.textContent=msg;
    if(lsub&&sub!==undefined)lsub.textContent=sub;
  }
  function domReady(){
    if(document.readyState!=="loading")return Promise.resolve();
    return new Promise(resolve=>document.addEventListener("DOMContentLoaded",resolve,{once:true}));
  }
  function loadScript(src,timeoutMs){
    return new Promise((resolve,reject)=>{
      if([].some.call(document.scripts,s=>s.src===src&&s.dataset.ready==="1"))return resolve();
      const existing=[].find.call(document.scripts,s=>s.src===src);
      const s=document.createElement("script");
      let done=false;
      const finish=(err)=>{
        if(done)return;
        done=true;
        clearTimeout(timer);
        if(err)reject(err);else{s.dataset.ready="1";resolve();}
      };
      const timer=setTimeout(()=>finish(new Error("SDK load timeout: "+src)),timeoutMs||12000);
      s.onload=()=>finish();
      s.onerror=()=>finish(new Error("SDK load failed: "+src));
      s.src=existing?(src+(src.includes("?")?"&":"?")+"retry="+Date.now()):src;
      s.async=false;
      document.head.appendChild(s);
    });
  }
  async function ensureFirebaseSdk(){
    if(window.firebase&&firebase.auth&&firebase.database)return;
    for(const src of SDKS)await loadScript(src,15000);
    if(!window.firebase||!firebase.auth||!firebase.database)throw new Error("Firebase SDK is unavailable");
  }
  function authMessage(error){
    const code=error&&error.code;
    if(code==="auth/invalid-email")return "メールアドレスの形式を確認してください";
    if(code==="auth/user-disabled")return "このアカウントは無効になっています";
    if(code==="auth/too-many-requests")return "試行回数が多すぎます。時間をおいて再度お試しください";
    if(code==="auth/network-request-failed")return "ネットワーク接続を確認してください";
    if(code==="auth/invalid-login-credentials"||code==="auth/user-not-found"||code==="auth/wrong-password")return "メールアドレスまたはパスワードが違います";
    return "ログインできませんでした。入力内容と通信環境を確認してください";
  }
  function showLogin(message){
    const gate=document.getElementById("auth-gate");
    const loading=document.getElementById("loading");
    const err=document.getElementById("auth-error");
    if(loading)loading.style.display="none";
    if(gate)gate.style.display="flex";
    if(err){err.textContent=message||"";err.style.display=message?"block":"none";}
    const email=document.getElementById("auth-email");
    if(email)setTimeout(()=>email.focus(),0);
  }
  function hideLogin(){
    const gate=document.getElementById("auth-gate");
    if(gate)gate.style.display="none";
    const loading=document.getElementById("loading");
    if(loading)loading.style.display="flex";
  }
  function setLoginBusy(busy){
    const button=document.getElementById("auth-submit");
    const email=document.getElementById("auth-email");
    const password=document.getElementById("auth-password");
    if(button){button.disabled=busy;button.textContent=busy?"確認中...":"ログイン";}
    if(email)email.disabled=busy;
    if(password)password.disabled=busy;
  }
  function bindLogin(auth){
    const form=document.getElementById("auth-form");
    if(!form||form.dataset.bound==="1")return;
    form.dataset.bound="1";
    form.addEventListener("submit",async event=>{
      event.preventDefault();
      const email=document.getElementById("auth-email");
      const password=document.getElementById("auth-password");
      const err=document.getElementById("auth-error");
      if(err)err.style.display="none";
      setLoginBusy(true);
      try{
        await auth.signInWithEmailAndPassword((email.value||"").trim(),password.value||"");
        password.value="";
      }catch(error){
        showLogin(authMessage(error));
      }finally{
        setLoginBusy(false);
      }
    });
  }
  async function isAuthorized(db,user){
    const snap=await db.ref("access/authorizedUsers/"+user.uid).once("value");
    return snap.val()===true;
  }
  function exposeDatabase(db){
    window._db=db;
    const isProd=window.location.hostname==="club-genesis-pos.vercel.app";
    window.FB_ROOT=isProd?"pos":"pos-dev";
    window._fbRoot=window.FB_ROOT;
    window.BACKUP_ROOT=isProd?"backup":"backup-dev";
    window._backupRoot=window.BACKUP_ROOT;
    window._ref=function(database,path){return database.ref(path);};
    window._set=function(ref,val){return ref.set(val);};
    window._on=function(ref,cb,err){ref.on("value",cb,err);};
    window._fbReady=true;
    window.dispatchEvent(new Event("fbReady"));
  }
  async function init(){
    try{
      setLoading("認証機能を読み込み中...","ネットワークを確認しています");
      await ensureFirebaseSdk();
      await domReady();
      setLoading("ログイン状態を確認中...","認証情報を安全に確認しています");
      if(!firebase.apps.length)firebase.initializeApp(cfg);
      const auth=firebase.auth();
      const db=firebase.database();
      await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
      bindLogin(auth);
      window.posSignOut=async function(){
        try{await auth.signOut();}finally{window.location.reload();}
      };
      let authorizing=false;
      auth.onAuthStateChanged(async user=>{
        if(window._fbReady&&!user){window.location.reload();return;}
        if(!user){showLogin("");return;}
        if(authorizing||window._fbReady)return;
        authorizing=true;
        hideLogin();
        setLoading("アクセス権限を確認中...","許可されたアカウントか確認しています");
        try{
          if(!await isAuthorized(db,user)){
            await auth.signOut();
            showLogin("このアカウントにはPOSの利用権限がありません");
            return;
          }
          exposeDatabase(db);
        }catch(error){
          console.error("Authorization check failed",error);
          try{await auth.signOut();}catch(_signOutError){}
          showLogin("アクセス権限を確認できませんでした。管理者に連絡してください");
        }finally{
          authorizing=false;
        }
      },error=>{
        console.error("Auth state check failed",error);
        showLogin(authMessage(error));
      });
    }catch(e){
      console.error("Firebase init failed",e);
      window._fbInitError=e;
      await domReady();
      setLoading("認証機能の初期化エラー","ネットワークまたはFirebase SDKの読み込みを確認してください");
      window.dispatchEvent(new CustomEvent("fbError",{detail:e}));
    }
  }
  init();
})();
