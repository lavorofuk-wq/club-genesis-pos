(function(){
  function setLoading(msg,sub){
    var lmsg=document.getElementById("lmsg");
    var lsub=document.getElementById("lsub");
    if(lmsg)lmsg.textContent=msg;
    if(lsub)lsub.textContent=sub||"";
  }
  function unsupported(reason){
    window._posUnsupported=true;
    setLoading("この端末ではPOSを開けません",reason+"。OSまたはブラウザを更新してください。");
  }
  try{
    new Function("var o={a:{b:1}};return o?.a?.b ?? 0;");
    if(!window.Promise||!window.fetch||!window.Map||!window.Set||!Object.values||!Object.entries||!Array.prototype.find){
      unsupported("必要なブラウザ機能が不足しています");
      return;
    }
  }catch(e){
    unsupported("古いSafari/ブラウザでは現在のPOSに対応していません");
    return;
  }
  window.addEventListener("error",function(e){
    if(window._fbReady||window._fbInitError)return;
    var src=(e.filename||"").split("/").pop();
    if(src==="app.js"||src==="closing.js"||src==="firebase-init.js"){
      setLoading("POS読み込みエラー","端末のキャッシュ削除またはOS/ブラウザ更新を行ってください。");
    }
  });
  window.addEventListener("load",function(){
    setTimeout(function(){
      if(!window._posUnsupported&&!window._fbReady&&!window._fbInitError){
        setLoading("Firebase接続を継続確認中...","Wi-FiまたはFirebase接続を確認してください。");
      }
    },30000);
  });
})();
