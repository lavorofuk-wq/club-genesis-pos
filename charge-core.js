(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.PosChargeCore=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const scLabel='\u30b7\u30f3\u30b0\u30eb\u30c1\u30e3\u30fc\u30b8';
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
  const items=s=>(s?.items||[]).filter(Boolean);
  const isParent=i=>!!i?.isExtension&&Number(i.extMinutes)>0;
  const isSC=i=>!!i&&(i.chargeRole==='single'||String(i.label||'').includes(scLabel));
  function roomType(i){
    if(i?.roomType==='karaoke'||i?.isKaraokeCharge||String(i?.label||'').includes('\u30ab\u30e9\u30aa\u30b1\u5ba4\u6599'))return 'karaoke';
    return i?.roomType==='vip'||i?.isVipCharge?'vip':'';
  }
  const isRoom=i=>!!roomType(i);
  const key=i=>String(i.groupId||i.id||'');
  function groups(s){
    let start=0;
    return items(s).filter(isParent).map(parent=>{
      const end=start+Number(parent.extMinutes),group={parent,id:key(parent),start,end,first:Math.floor(start/60),last:Math.ceil(end/60)-1};
      start=end;return group;
    });
  }
  function target(s,id){
    if(id==='base')return null;
    const group=groups(s).find(g=>g.id===String(id));
    if(!group)throw new Error('charge-target-missing');
    return group;
  }
  function targetItems(s,id){return items(s).filter(i=>id==='base'?!i.groupId&&!i.isExtension:String(i.groupId||'')===String(id));}
  function baseRoomType(s){return own(s,'baseRoomType')?s.baseRoomType:roomType(targetItems(s,'base').find(isRoom));}
  function defaultRoomType(s){
    const last=groups(s).slice(-1)[0];
    if(!last)return baseRoomType(s)||'';
    if(own(last.parent,'roomTypeSelection'))return last.parent.roomTypeSelection;
    return roomType(targetItems(s,last.id).find(isRoom))||baseRoomType(s)||'';
  }
  function availableRoomType(s){
    return defaultRoomType(s)||groups(s).map(g=>g.parent.roomTypeHint||g.parent.roomTypeSelection).filter(Boolean).slice(-1)[0]||
      roomType(items(s).filter(isRoom).slice(-1)[0])||s.baseRoomTypeHint||s.baseRoomType||'';
  }
  function eligible(s){return Number(s?.guests)===1||targetItems(s,'base').some(isSC);}
  function defaultSC(s){return Number(s?.guests)===1&&(own(s,'singleChargeDefault')?s.singleChargeDefault:targetItems(s,'base').some(isSC));}
  function unresolvedSC(s){return items(s).filter(i=>isSC(i)&&!i.chargeRole&&!i.groupId&&String(i.id||'').startsWith('sc_add_'));}
  function blockState(s){
    const paid=new Set(),waived=new Set(),byItem=new Map(),conflicts=[];
    for(const group of groups(s)){
      const fees=targetItems(s,group.id).filter(isSC);
      for(const fee of fees){
        const blocks=[];
        if(Number.isInteger(fee.scBlockOffset)){
          const preferred=Math.min(group.last,group.first+Math.max(0,fee.scBlockOffset));
          let block=preferred;
          if(paid.has(block)){
            block=-1;
            for(let b=group.first;b<=group.last;b++)if(!paid.has(b)){block=b;break;}
          }
          if(block<0){conflicts.push(fee.id);blocks.push(preferred);}else blocks.push(block);
        }
        else{
          // Legacy automatic fees have a proven group, but no recorded block.
          let count=Math.max(1,Number(fee.qty)||1);
          for(let b=group.first;b<=group.last&&count>0;b++)if(!paid.has(b)){blocks.push(b);count--;}
          if(count>0)conflicts.push(fee.id);
        }
        blocks.forEach(b=>paid.add(b));byItem.set(fee.id,blocks);
      }
      (group.parent.scWaivedOffsets||[]).forEach(offset=>waived.add(Math.min(group.last,group.first+Math.max(0,Number(offset)||0))));
      if(group.parent.singleChargeIncluded===false||!own(group.parent,'singleChargeIncluded')){
        // Never recover an unrecorded/waived legacy fee during a later extension.
        for(let b=group.first;b<=group.last;b++)if(!paid.has(b))waived.add(b);
      }
    }
    return {paid,waived,byItem,conflicts};
  }
  function nextSCOffsets(s,minutes){
    const count=Number(minutes);
    if(!eligible(s)||!Number.isFinite(count)||count<=0)return [];
    const start=groups(s).slice(-1)[0]?.end||0,first=Math.floor(start/60),last=Math.ceil((start+count)/60)-1;
    const {paid,waived}=blockState(s),offsets=[];
    for(let b=first;b<=last;b++)if(!paid.has(b)&&!waived.has(b))offsets.push(b-first);
    return offsets;
  }
  function manualSCOffsets(s,id){
    const group=target(s,id);
    if(!group)return targetItems(s,'base').some(isSC)?[]:[0];
    const {paid}=blockState(s),offsets=[];
    for(let b=group.first;b<=group.last;b++)if(!paid.has(b))offsets.push(b-group.first);
    return offsets;
  }
  function attach(s,id,added){
    const group=target(s,id);
    if(group)group.parent.groupId=group.id;
    const scoped=added.map(i=>({...i,...(group?{groupId:group.id,isExtension:true,
      ...(group.parent.isBanaiExtension?{isBanaiExtension:true,banaiExtCastIds:[...(group.parent.banaiExtCastIds||[])],banaiExtCastNames:[...(group.parent.banaiExtCastNames||[])]}:{})}:{})}));
    let index;
    if(group){
      index=s.items.findIndex(i=>i.id===group.parent.id)+1;
      while(index<s.items.length&&String(s.items[index]?.groupId||'')===group.id)index++;
    }else{index=s.items.findIndex(isParent);if(index<0)index=s.items.length;}
    s.items.splice(index,0,...scoped);
    return scoped;
  }
  function addSC(s,id,makeFee,legacyId){
    const group=target(s,id),legacy=legacyId?unresolvedSC(s).find(i=>i.id===legacyId):null;
    if(legacyId&&!legacy)throw new Error('charge-target-missing');
    if(legacy&&Number(legacy.qty||1)!==1)throw new Error('charge-legacy-quantity');
    if(legacy)s.items=s.items.filter(i=>i.id!==legacy.id);
    const offsets=manualSCOffsets(s,id);
    if(!offsets.length)throw new Error('charge-duplicate');
    const added=(legacy?offsets.slice(0,1):offsets).map(offset=>({... (legacy||makeFee(offset)),chargeRole:'single',...(group?{scBlockOffset:offset}:{})}));
    attach(s,id,added);
    if(!group)s.singleChargeDefault=true;
    else group.parent.scWaivedOffsets=(group.parent.scWaivedOffsets||[]).filter(o=>!added.some(i=>i.scBlockOffset===o));
    return added;
  }
  function addRoom(s,id,fee){
    const group=target(s,id);
    if(targetItems(s,id).some(isRoom))throw new Error('charge-duplicate');
    attach(s,id,[{...fee,chargeRole:'room',isRoomExtension:!!group}]);
    if(group){group.parent.roomTypeSelection=roomType(fee);group.parent.roomTypeHint=roomType(fee);}
    else{s.baseRoomType=roomType(fee);s.baseRoomTypeHint=roomType(fee);}
  }
  function remove(s,id){
    const item=items(s).find(i=>i.id===id);if(!item)throw new Error('charge-target-missing');
    if(isParent(item)){
      s.items=s.items.filter(i=>i.id!==id&&(!item.groupId||i.groupId!==item.groupId));
      if(s.setEndTime)s.setEndTime-=Number(item.extMinutes)*60000;
    }else{
      const group=item.groupId?groups(s).find(g=>g.id===String(item.groupId)):null;
      if(isSC(item)&&group){
        const blocks=blockState(s).byItem.get(item.id)||[];
        group.parent.scWaivedOffsets=[...new Set([...(group.parent.scWaivedOffsets||[]),...blocks.map(b=>b-group.first)])];
      }
      s.items=s.items.filter(i=>i.id!==id);
      if(isRoom(item)){
        if(group){group.parent.roomTypeSelection=roomType(targetItems(s,group.id).find(isRoom));group.parent.roomTypeHint=roomType(item);}
        else if(!item.isExtension){s.baseRoomType=roomType(targetItems(s,'base').find(isRoom));s.baseRoomTypeHint=roomType(item);}
      }
    }
    return s;
  }
  return {isParent,isSC,isRoom,roomType,groups,target,targetItems,defaultRoomType,availableRoomType,
    eligible,defaultSC,unresolvedSC,blockState,nextSCOffsets,manualSCOffsets,attach,addSC,addRoom,remove};
});
