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
  function targetIndex(session,itemId){
    const items=session?.items||[],matches=items.filter(item=>String(item.id)===String(itemId));
    if(matches.length!==1||!isDrink(matches[0]))throw new Error("drink-target-missing");
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
    if(!Number.isInteger(position)||position<0||position>=session.items.length)throw new Error("drink-position-invalid");
    const desired=JSON.parse(JSON.stringify(session)),[item]=desired.items.splice(index,1);
    desired.items.splice(position,0,item);
    return desired;
  }
  return{isDrink,change,targetIndex,reprice,reorder};
});
