function items(a='a',b='b'){
  const ext=(id,castId,castName)=>({id,groupId:id,isExtension:true,isBanaiExtension:true,extMinutes:60,chargeRole:'extension',label:'Extension '+id,price:4000,qty:1,banaiExtCastIds:[castId],banaiExtCastNames:[castName]});
  const bottle=(id,price,castId,castName)=>({id,category:'keepBottle',label:id,price,qty:1,castId,castName,backTargetCastIds:[castId],backTargetCastNames:[castName],backType:'keepBottle',backAllocation:'single'});
  return [
    {id:'set',isSet:true,label:'Set',price:10000,qty:1,minutes:60},
    {id:'nom-a',isBanaiShimei:true,castId:a,castName:'A',label:'Banai A',price:2000,qty:1},
    ext('ext1',a,'A'),
    {...ext('sc1',a,'A'),groupId:'ext1',extMinutes:0,chargeRole:'single',label:'SC',price:1000},
    {...ext('room1',a,'A'),groupId:'ext1',extMinutes:0,chargeRole:'room',isVipCharge:true,label:'VIP',price:3000},
    {id:'cd_a',category:'castDrink',castId:a,castName:'A',label:'Drink A',price:2000,qty:2,backType:'castDrink',backAllocation:'orderedCast',backTargetCastIds:[a],backTargetCastNames:['A']},
    bottle('bottle1',20000,a,'A'),
    {id:'nom-b',isBanaiShimei:true,castId:b,castName:'B',label:'Banai B',price:2000,qty:1},
    ext('ext2',b,'B'),bottle('bottle2',10000,b,'B'),
    {id:'guest',category:'guestDrink',label:'Guest',price:1000,qty:1}
  ];
}
module.exports={items};
