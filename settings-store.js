(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PosSettingsStore=api;
})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  const categories=new Set(['normalSets','sets','extensions','vip','karaoke','drinks','castDrinks','options','champagne','keepBottles','castCustomItems']);
  const timed=new Set(['normalSets','sets','extensions','vip','karaoke']);
  const clone=value=>value==null?null:JSON.parse(JSON.stringify(value));
  function comparable(value){
    if(value==null||typeof value!=='object')return value??null;
    const next={};
    Object.keys(value).sort().forEach(key=>{const child=comparable(value[key]);if(child!==null)next[key]=child;});
    return Object.keys(next).length?next:null;
  }
  const same=(a,b)=>JSON.stringify(comparable(a))===JSON.stringify(comparable(b));
  function invalid(message,field){return Object.assign(new Error(message),{code:'SETTINGS_VALIDATION',userMessage:message,field});}
  function conflict(current){return Object.assign(new Error('settings item changed'),{code:'SETTINGS_CONFLICT',_txConflict:true,current:clone(current),userMessage:current?'この項目は他端末で変更されました。最新の内容を確認してください。':'この項目は他端末で削除されています。入力内容を確認してください。'});}
  function integer(value,field,label,minimum){
    const text=String(value??'').trim(),number=Number(text);
    if(!/^\d+$/.test(text)||!Number.isSafeInteger(number)||number<minimum)throw invalid(label+'は'+minimum+'以上の整数で入力してください。',field);
    return number;
  }
  function plan(draft,rootValue,maxTables=30){
    const d=clone(draft),path=d.kind==='menu'?'menus':d.kind==='table'?'tables':null;
    if(!path||!['edit','add','delete'].includes(d.action))throw invalid('編集内容を確認してください。');
    if(path==='menus'&&!categories.has(d.category))throw invalid('メニュー分類が正しくありません。');
    const id=String(d.id||'');
    if(!id||/[.#$\[\]\/]/.test(id))throw invalid('項目IDが正しくありません。');
    const next=clone(rootValue)||(path==='menus'?{}:[]);
    const list=path==='menus'?(next[d.category]||[]):next;
    if(!Array.isArray(list))throw invalid('設定の形式を確認できません。管理者に連絡してください。');
    const index=list.findIndex(row=>String(row.id)===id),current=index<0?null:list[index];
    const values=d.values||{};
    let desired;
    if(d.action!=='delete'){
      const label=String(values.label??'').trim();
      if(!label)throw invalid('名前を入力してください。','label');
      desired={...(current||d.base||{}),id:current?.id??id,label};
      if(path==='menus'){
        if(d.category==='options'&&(id!=='sc'||!['edit','add'].includes(d.action)))throw invalid('この固定料金は変更できません。');
        const price=integer(values.price,'price','料金',0);
        if(desired.type==='percent')desired.value=price;else desired.price=price;
        if(timed.has(d.category))desired.minutes=integer(values.minutes,'minutes','時間',1);
      }else desired.vip=values.vip===true;
    }else if(path==='menus'&&d.category==='options')throw invalid('この固定料金は削除できません。');
    if(d.action==='add'){
      if(current){if(same(current,desired))return{path,next,updates:{},unchanged:true};throw conflict(current);}
      if(path==='tables'&&list.length>=maxTables)throw invalid('テーブル数は最大 '+maxTables+' 卓です。');
    }else{
      if(!current){if(d.action==='delete')return{path,next,updates:{},unchanged:true};throw conflict(null);}
      if(!same(current,d.base))throw conflict(current);
    }
    const prefix=path==='menus'?'menus/'+d.category:'tables',updates={};
    if(d.action==='edit'){
      list[index]=desired;updates[prefix+'/'+index]=desired;
    }else{
      if(d.action==='delete')list.splice(index,1);else list.push(desired);
      updates[prefix]=list.length?list:null;
    }
    if(path==='menus')next[d.category]=list;
    return{path,next,updates,unchanged:false};
  }
  function create(adapter){
    let busy=false;
    async function commit(draft){
      if(busy)throw invalid('設定を保存中です。完了までお待ちください。');
      busy=true;
      const path=draft.kind==='menu'?'menus':'tables';
      adapter.onState?.(path,'saving');
      try{
        let snapshot=await adapter.readSnapshot(path);
        for(let attempt=0;attempt<3;attempt++){
          const change=plan(draft,snapshot.value,adapter.maxTables||30);
          try{
            if(!change.unchanged)await adapter.write(change,snapshot);
          }catch(error){
            if(!adapter.isRaceError?.(error))throw error;
            const latest=await adapter.readSnapshot(path);
            if(Number(latest.revision)===Number(snapshot.revision))throw error;
            plan(draft,latest.value,adapter.maxTables||30);
            if(attempt===2)throw Object.assign(new Error('settings busy'),{code:'SETTINGS_BUSY',userMessage:'他端末の更新が続いています。少し待って保存し直してください。'});
            snapshot=latest;continue;
          }
          let confirmed=change.next;
          try{confirmed=(await adapter.readSnapshot(path)).value;}catch(_readError){}
          adapter.apply(path,confirmed);
          adapter.onState?.(path,'saved');
          return true;
        }
      }catch(error){adapter.onState?.(path,'error',error);throw error;}
      finally{busy=false;}
    }
    return{commit,isBusy:()=>busy};
  }
  return{create,plan,same,conflict,invalid};
});
