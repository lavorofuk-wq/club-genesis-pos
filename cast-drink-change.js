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
  return{isDrink,change};
});
