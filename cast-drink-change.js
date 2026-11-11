(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.PosCastDrinkChange=api;
})(typeof window!=="undefined"?window:globalThis,function(){
  function isDrink(item){
    if(!item||item.isDiscount||item.isSet||item.isExtension||item.isHonShimei||item.isBanaiShimei||item.isBanaiExtension||item.isRoomCharge||item.isFreeDrink)return false;
    return item.category?item.category==="castDrink":String(item.id||"").startsWith("cd_");
  }
  function change(session,itemId,cast){
    const items=session?.items||[],matches=items.filter(item=>String(item.id)===String(itemId));
    if(matches.length!==1||!isDrink(matches[0]))throw new Error("drink-target-missing");
    if(cast?.id==null||!String(cast.id)||!String(cast.name||"").trim())throw new Error("drink-cast-missing");
    if(String(matches[0].castId)===String(cast.id))throw new Error("drink-cast-unchanged");
    const desired=JSON.parse(JSON.stringify(session)),index=items.indexOf(matches[0]);
    // Keep the array position: extension sales attribution depends on order.
    desired.items[index]={...desired.items[index],category:"castDrink",label:"キャストDrink ("+cast.name+")",
      castId:cast.id,castName:cast.name,backTargetCastIds:[String(cast.id)],backTargetCastNames:[cast.name],
      backType:"castDrink",backAllocation:"orderedCast"};
    return desired;
  }
  function isBanai(item){
    return !!item?.isBanaiShimei&&!item.isHonShimei&&!item.isExtension&&!item.isDiscount&&item.castId!=null&&String(item.castId)!=="";
  }
  function targetIndex(session,itemId,kind){
    const items=session?.items||[],matches=items.filter(item=>String(item.id)===String(itemId));
    if(matches.length!==1||!(kind==="banai"?isBanai:isDrink)(matches[0]))throw new Error("drink-target-missing");
    return items.indexOf(matches[0]);
  }
  function reprice(session,itemId,selection){
    const index=targetIndex(session,itemId),price=Number(selection.price),qty=Number(selection.qty);
    if(Object.prototype.hasOwnProperty.call(session,"adjustedTotal"))throw new Error("drink-discount");
    if(!["number","string"].includes(typeof selection.price)||String(selection.price).trim()===""||!Number.isSafeInteger(price)||price<0||price>10000000)throw new Error("drink-price-invalid");
    if(!["number","string"].includes(typeof selection.qty)||String(selection.qty).trim()===""||!Number.isSafeInteger(qty)||qty<1||qty>999)throw new Error("drink-qty-invalid");
    const desired=JSON.parse(JSON.stringify(session)),item=desired.items[index];
    item.price=price;item.qty=qty;
    if(selection.menuLabel!=null){
      item.drinkLabel=String(selection.menuLabel);
      if(selection.menuId)item.drinkMenuId=String(selection.menuId);else delete item.drinkMenuId;
    }
    if(JSON.stringify(item)===JSON.stringify(session.items[index]))throw new Error("drink-unchanged");
    return desired;
  }
  function reorder(session,itemId,position){
    const index=targetIndex(session,itemId);
    return move(session,index,position);
  }
  function move(session,index,position){
    if(!Number.isInteger(position)||position<0||position>=session.items.length)throw new Error("drink-position-invalid");
    const desired=JSON.parse(JSON.stringify(session)),[item]=desired.items.splice(index,1);
    desired.items.splice(position,0,item);
    return desired;
  }
  const ids=values=>[...new Set(values.filter(id=>id!=null&&id!=="").map(String))];
  const targets=item=>ids([...(item.banaiExtCastIds||[]),item.banaiExtCastId,item.castId]);
  const sameIds=(a,b)=>a.length===b.length&&a.every(id=>b.includes(id));
  function extensionGroups(items){
    const groups=[],byGroup=new Map();let last=null,current=[];
    items.forEach((item,index)=>{
      if(item.isBanaiExtension)current=targets(item);
      const child=item.chargeRole==="single"||item.chargeRole==="room"||item.isRoomCharge||item.isVipCharge||item.isKaraokeCharge||item.isRoomExtension||String(item.label||"").includes("シングルチャージ");
      const parent=(item.isExtension||item.isBanaiExtension)&&!child&&!item.isFreeDrink&&!item.isSet;
      if(parent){
        const key=String(item.groupId||item.id);
        if(byGroup.has(key))throw new Error("banai-group-invalid");
        last={id:String(item.id),key,index,label:item.label||"延長",number:groups.length+1,beforeIds:[...current],members:[index]};
        groups.push(last);byGroup.set(key,last);
      }else if(item.groupId){
        const group=byGroup.get(String(item.groupId));
        if(!group||group!==last)throw new Error("banai-group-invalid");
        group.members.push(index);
        if(item.isBanaiExtension&&!sameIds(targets(item),group.beforeIds))throw new Error("banai-group-invalid");
      }else if(child&&(item.isExtension||item.isBanaiExtension)){
        if(!last)throw new Error("banai-group-invalid");
        if(item.isBanaiExtension&&!sameIds(targets(item),last.beforeIds))throw new Error("banai-group-invalid");
        last.members.push(index);
      }
    });
    return{groups};
  }
  function banaiPlan(session,itemId,position){
    const index=targetIndex(session,itemId,"banai"),original=session.items;
    if(original.some(i=>!i?.id)||new Set(original.map(i=>String(i.id))).size!==original.length)throw new Error("banai-group-invalid");
    const nominations=original.filter(isBanai);
    if(new Set(nominations.map(i=>String(i.castId))).size!==nominations.length)throw new Error("banai-group-invalid");
    const desired=move(session,index,position),{groups}=extensionGroups(original);
    const hasHon=original.some(i=>i.isHonShimei);
    const affected=[];
    for(const group of groups){
      const nextIndex=desired.items.findIndex(i=>String(i.id)===group.id);
      let blockEnd=group.index;
      while(group.members.includes(blockEnd+1))blockEnd++;
      const last=desired.items.findIndex(i=>String(i.id)===String(original[blockEnd].id));
      if(position>nextIndex&&position<last)throw new Error("banai-group-split");
      if(!hasHon&&((index<group.index)!==(position<nextIndex))){
        affected.push({...group,candidates:desired.items.slice(0,nextIndex).filter(isBanai).map(i=>({id:String(i.castId),name:String(i.castName||"")}))});
      }
    }
    return{session:desired,extensions:affected};
  }
  function nextBanaiPosition(session,itemId,position,delta){
    if(![-1,1].includes(delta))return position;
    for(let next=position+delta;next>=0&&next<session.items.length;next+=delta){
      try{banaiPlan(session,itemId,next);return next;}catch(error){if(error.message!=="banai-group-split")throw error;}
    }
    return position;
  }
  function reorderBanai(session,itemId,position,selections,categoryOf){
    const plan=banaiPlan(session,itemId,position),desired=plan.session,selected=new Map();
    for(const group of plan.extensions){
      const choice=selections?.[group.id];
      if(!Array.isArray(choice))throw new Error("banai-selection-required");
      const chosen=ids(choice);
      if(choice.length!==chosen.length||chosen.some(id=>!group.candidates.some(c=>c.id===id)))throw new Error("banai-selection-invalid");
      selected.set(group.id,chosen);
    }
    const names=new Map();
    session.items.forEach(i=>{
      if(i.castId!=null&&i.castName)names.set(String(i.castId),String(i.castName));
      (i.banaiExtCastIds||[]).forEach((id,n)=>{if(i.banaiExtCastNames?.[n]&&!names.has(String(id)))names.set(String(id),String(i.banaiExtCastNames[n]));});
      (i.backTargetCastIds||[]).forEach((id,n)=>{if(i.backTargetCastNames?.[n]&&!names.has(String(id)))names.set(String(id),String(i.backTargetCastNames[n]));});
    });
    // Rewrite a complete extension group, including copied SC/room boundaries.
    // Restore the original allocation at the next unaffected extension boundary.
    const {groups}=extensionGroups(session.items),updates=new Map();
    let current=[];
    for(const group of groups){
      const chosen=selected.get(group.id)||group.beforeIds;
      const parent=session.items[group.index],atBoundary=parent.isBanaiExtension?targets(parent):current;
      if(selected.has(group.id)||!sameIds(atBoundary,chosen)){
        for(const index of group.members){
          const old=session.items[index];
          if(index===group.index||old.isBanaiExtension)updates.set(String(old.id),chosen);
        }
      }
      current=chosen;
    }
    desired.items.forEach(item=>{
      const chosen=updates.get(String(item.id));if(!chosen)return;
      item.isBanaiExtension=true;item.banaiExtCastIds=[...chosen];item.banaiExtCastNames=chosen.map(id=>names.get(id)||"");
      delete item.banaiExtCastId;delete item.castId;delete item.castName;
    });
    const eligible=items=>{
      const hon=ids(items.filter(i=>i.isHonShimei).map(i=>i.castId)),result=new Map();let active=[];
      items.forEach(item=>{if(item.isBanaiExtension)active=targets(item);result.set(String(item.id),hon.length?hon:[...active]);});
      return result;
    };
    const before=eligible(session.items),after=eligible(desired.items);
    desired.items.forEach(item=>{
      const category=categoryOf(item);
      if(!["champagneWine","keepBottle"].includes(category)||Number(item.price)*Math.max(1,Number(item.qty)||1)<1)return;
      const chosen=after.get(String(item.id));
      if(sameIds(before.get(String(item.id)),chosen))return;
      item.castId=chosen[0]||"";item.castName=names.get(chosen[0])||"";
      item.backTargetCastIds=[...chosen];item.backTargetCastNames=chosen.map(id=>names.get(id)||"");
      item.backType=chosen.length?category:"";item.backAllocation=chosen.length>1?"equal":chosen.length?"single":"";
    });
    return desired;
  }
  return{isDrink,isBanai,change,targetIndex,reprice,reorder,banaiPlan,nextBanaiPosition,reorderBanai};
});
