(function(){
  const SDKS=[
    "https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js",
    "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js"
  ];
  const cfg={apiKey:"AIzaSyD_7XgXow1D-cp-TNsbqitjMzJCGD5DE64",authDomain:"club-genesis-5cba7.firebaseapp.com",databaseURL:"https://club-genesis-5cba7-default-rtdb.asia-southeast1.firebasedatabase.app",projectId:"club-genesis-5cba7",storageBucket:"club-genesis-5cba7.firebasestorage.app",messagingSenderId:"591051426146",appId:"1:591051426146:web:08a486510b89d6be0e443b"};
  const accountingCfg={apiKey:"AIzaSyBX0LqE5XKywU8ERzJl738SQq2QUuCsDQ8",authDomain:"club-genesis-accountin.firebaseapp.com",projectId:"club-genesis-accountin",storageBucket:"club-genesis-accountin.firebasestorage.app",messagingSenderId:"1086890949782",appId:"1:1086890949782:web:d9425cd2157adea94a16b7"};

  function setLoading(msg,sub){
    const lmsg=document.getElementById("lmsg");
    const lsub=document.getElementById("lsub");
    if(lmsg)lmsg.textContent=msg;
    if(lsub&&sub)lsub.textContent=sub;
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
    if(window.firebase&&firebase.database&&firebase.firestore)return;
    for(const src of SDKS){
      await loadScript(src,15000);
    }
    if(!window.firebase||!firebase.database||!firebase.firestore)throw new Error("Firebase SDK is unavailable");
  }
  async function init(){
    try{
      setLoading("Firebase SDKを読み込み中...","ネットワークを確認しています");
      await ensureFirebaseSdk();
      setLoading("Firebaseに接続中...","初期化しています");
      if(!firebase.apps.length)firebase.initializeApp(cfg);
      const _fbDb=firebase.database();
      window._db=_fbDb;
      const _fsDb=firebase.firestore();
      window._fs=_fsDb;
      const _accountingApp=firebase.apps.find(a=>a.name==="accounting")||firebase.initializeApp(accountingCfg,"accounting");
      const _accountingFsDb=firebase.firestore(_accountingApp);
      window._accountingFs=_accountingFsDb;
      window._closingProjectId=accountingCfg.projectId;
      const isProd=window.location.hostname==="club-genesis-pos.vercel.app";
      window.FB_ROOT=isProd?"pos":"pos-dev";
      window._fbRoot=window.FB_ROOT;
      window.BACKUP_ROOT=isProd?"backup":"backup-dev";
      window._backupRoot=window.BACKUP_ROOT;
      window.CLOSING_ROOT=isProd?"dailyClosings":"dailyClosings-dev";
      window._closingRoot=window.CLOSING_ROOT;
      window._serverTimestamp=function(){return firebase.firestore.FieldValue.serverTimestamp();};
      window._ref=function(db,path){return db.ref(path);};
      window._set=function(ref,val){return ref.set(val);};
      window._on=function(ref,cb,err){ref.on("value",cb,err);};
      window._fbReady=true;
      window.dispatchEvent(new Event("fbReady"));
    }catch(e){
      console.error("Firebase init failed",e);
      window._fbInitError=e;
      setLoading("Firebase初期化エラー","ネットワークまたはFirebase SDKの読み込みを確認してください");
      window.dispatchEvent(new CustomEvent("fbError",{detail:e}));
    }
  }
  init();
})();
