(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ANALYSIS_DATA=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const inFlightByDatabase=new WeakMap();
  const DEFAULT_TIMEOUT_MS=20000;

  function bound(value){
    if(value==null)return null;
    if(typeof value!=='number'||!Number.isFinite(value)||!Number.isFinite(new Date(value).getTime()))
      throw new Error('集計期間が正しくありません。開始・終了日時を確認してください。');
    return value;
  }
  function businessDate(time){
    const date=new Date(time);
    if(date.getHours()<19)date.setDate(date.getDate()-1);
    if(!Number.isFinite(date.getTime()))throw new Error('集計期間が正しくありません。');
    return String(date.getFullYear()).padStart(4,'0')+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
  }

  function loadDays(options={}){
    let db,root,from,to,timeoutMs,startKey,endKey;
    try{
      ({db,root}=options);
      if(!db||typeof db.ref!=='function')throw new Error('データベースに接続できていません。');
      if(typeof root!=='string'||!root.trim())throw new Error('分析データの取得先が正しくありません。');
      from=bound(options.from);to=bound(options.to);
      if(from!=null&&to!=null&&from>=to)throw new Error('終了日時は開始日時より後を選択してください。');
      timeoutMs=options.timeoutMs??DEFAULT_TIMEOUT_MS;
      if(typeof timeoutMs!=='number'||!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>2147483647)
        throw new Error('分析データの取得待ち時間が正しくありません。');
      startKey=from==null?null:businessDate(from);
      endKey=to==null?null:businessDate(to-1);
    }catch(error){return Promise.reject(error);}

    let byRoot=inFlightByDatabase.get(db);
    if(!byRoot){byRoot=new Map();inFlightByDatabase.set(db,byRoot);}
    let requests=byRoot.get(root);
    if(!requests){requests=new Map();byRoot.set(root,requests);}
    // Distinct selected time ranges stay independent even within the same business day.
    const key=(from==null?'all':String(from))+'|'+(to==null?'all':String(to));
    if(requests.has(key))return requests.get(key);

    let timer;
    const pending=new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(ok,value)=>{
        if(settled)return;
        settled=true;clearTimeout(timer);
        if(ok)resolve(value);else reject(value);
      };
      timer=setTimeout(()=>{
        const error=new Error('分析データの取得がタイムアウトしました。通信状態を確認して再試行してください。');
        error.code='analysis/timeout';
        finish(false,error);
      },timeoutMs);
      try{
        let query=db.ref(root+'/bizDays').orderByKey();
        if(startKey!=null)query=query.startAt(startKey);
        if(endKey!=null)query=query.endAt(endKey);
        Promise.resolve(query.once('value')).then(snapshot=>{
          if(settled)return;
          try{finish(true,snapshot.val()||{});}catch(error){finish(false,error);}
        },error=>finish(false,error));
      }catch(error){finish(false,error);}
    });
    const request=pending.finally(()=>{
      clearTimeout(timer);
      if(requests.get(key)===request)requests.delete(key);
      if(!requests.size&&byRoot.get(root)===requests)byRoot.delete(root);
    });
    requests.set(key,request);
    return request;
  }

  return {loadDays};
});
