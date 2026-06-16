const cfg={apiKey:"AIzaSyD_7XgXow1D-cp-TNsbqitjMzJCGD5DE64",authDomain:"club-genesis-5cba7.firebaseapp.com",databaseURL:"https://club-genesis-5cba7-default-rtdb.asia-southeast1.firebasedatabase.app",projectId:"club-genesis-5cba7",storageBucket:"club-genesis-5cba7.firebasestorage.app",messagingSenderId:"591051426146",appId:"1:591051426146:web:08a486510b89d6be0e443b"};
firebase.initializeApp(cfg);
const _fbDb=firebase.database();
window._db=_fbDb;
const _fsDb=firebase.firestore();
window._fs=_fsDb;
const accountingCfg={apiKey:"AIzaSyBX0LqE5XKywU8ERzJl738SQq2QUuCsDQ8",authDomain:"club-genesis-accountin.firebaseapp.com",projectId:"club-genesis-accountin",storageBucket:"club-genesis-accountin.firebasestorage.app",messagingSenderId:"1086890949782",appId:"1:1086890949782:web:d9425cd2157adea94a16b7"};
const _accountingApp=firebase.initializeApp(accountingCfg,"accounting");
const _accountingFsDb=firebase.firestore(_accountingApp);
window._accountingFs=_accountingFsDb;
window._closingProjectId=accountingCfg.projectId;
// 本番(club-genesis-pos.vercel.app): 'pos' / 開発環境: 'pos-dev'
const FB_ROOT = window.location.hostname === 'club-genesis-pos.vercel.app' ? 'pos' : 'pos-dev';
window._fbRoot = FB_ROOT;
// 本番: 'backup' / 開発環境: 'backup-dev'
const BACKUP_ROOT = window.location.hostname === 'club-genesis-pos.vercel.app' ? 'backup' : 'backup-dev';
window._backupRoot = BACKUP_ROOT;
// 本番: dailyClosings / 開発環境: dailyClosings-dev
const CLOSING_ROOT = window.location.hostname === 'club-genesis-pos.vercel.app' ? 'dailyClosings' : 'dailyClosings-dev';
window._closingRoot = CLOSING_ROOT;
window._serverTimestamp=function(){return firebase.firestore.FieldValue.serverTimestamp();};
window._ref=function(db,path){return db.ref(path);};
window._set=function(ref,val){return ref.set(val);};
window._on=function(ref,cb,err){ref.on("value",cb,err);};
window._fbReady=true;
window.dispatchEvent(new Event("fbReady"));
