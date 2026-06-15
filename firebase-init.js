const cfg={apiKey:"AIzaSyD_7XgXow1D-cp-TNsbqitjMzJCGD5DE64",authDomain:"club-genesis-5cba7.firebaseapp.com",databaseURL:"https://club-genesis-5cba7-default-rtdb.asia-southeast1.firebasedatabase.app",projectId:"club-genesis-5cba7",storageBucket:"club-genesis-5cba7.firebasestorage.app",messagingSenderId:"591051426146",appId:"1:591051426146:web:08a486510b89d6be0e443b"};
firebase.initializeApp(cfg);
const _fbDb=firebase.database();
window._db=_fbDb;
// 本番(club-genesis-pos.vercel.app): 'pos' / 開発環境: 'pos-dev'
const FB_ROOT = window.location.hostname === 'club-genesis-pos.vercel.app' ? 'pos' : 'pos-dev';
window._fbRoot = FB_ROOT;
// 本番: 'backup' / 開発環境: 'backup-dev'
const BACKUP_ROOT = window.location.hostname === 'club-genesis-pos.vercel.app' ? 'backup' : 'backup-dev';
window._backupRoot = BACKUP_ROOT;
window._ref=function(db,path){return db.ref(path);};
window._set=function(ref,val){return ref.set(val);};
window._on=function(ref,cb,err){ref.on("value",cb,err);};
window._fbReady=true;
window.dispatchEvent(new Event("fbReady"));