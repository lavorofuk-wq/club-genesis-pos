(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.PosCastOrderAttendance=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  function missingOrders(history,shifts,sessions={},tables=[],casts=[]){
    const attended=new Set(Object.values(shifts||{}).filter(sh=>{
      const time=Number(sh?.clockIn);
      return sh?.castId!=null&&Number.isFinite(time)&&time>0;
    }).map(sh=>String(sh.castId)));
    const records=[...Object.values(history||{}).map(record=>({record,source:"history"})),...Object.entries(sessions||{}).map(([tableId,record])=>({record:{...record,tableId},source:"session"}))];
    return records.flatMap(({record,source})=>{
      const missing=new Map();
      (record.items||[]).forEach(item=>{
        const kind=item?.isBanaiShimei?"場内指名":item?.category==="castDrink"||item?.backType==="castDrink"||String(item?.id||"").startsWith("cd_")?"キャストDrink":null;
        if(!kind)return;
        const ids=item.castId!=null&&String(item.castId)!==""?[String(item.castId)]:kind==="キャストDrink"&&Array.isArray(item.backTargetCastIds)&&item.backTargetCastIds.length?item.backTargetCastIds.map(String):[""];
        [...new Set(ids)].forEach(castId=>{
          if(castId&&attended.has(castId))return;
          if(!missing.has(castId))missing.set(castId,{
            source,historyId:source==="history"?String(record.id):"",tableId:String(record.tableId||""),
            tableLabel:record.tableLabel||tables.find(table=>String(table.id)===String(record.tableId))?.label||record.tableId||"不明なテーブル",
            startTime:Number(record.startTime)||0,castId,
            castName:casts.find(cast=>String(cast.id)===castId)?.name||item.castName||"キャスト未設定",kinds:[]
          });
          const entry=missing.get(castId);
          if(!entry.kinds.includes(kind))entry.kinds.push(kind);
        });
      });
      return [...missing.values()];
    });
  }
  return Object.freeze({missingOrders});
});
