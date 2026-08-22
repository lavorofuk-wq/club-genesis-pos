const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const app=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const helperSource=app.slice(app.indexOf("function roomTypeFromItem"),app.indexOf("function addExt"));
const context={
  S:{menus:{
    vip:[
      {id:"v60",label:"VIP室料 60分",price:30000,minutes:60},
      {id:"v30",label:"VIP室料延長 30分",price:15000,minutes:30}
    ],
    karaoke:[
      {id:"k60",label:"カラオケ室料 60分",price:2000,minutes:60},
      {id:"k30",label:"カラオケ室料延長 30分",price:1000,minutes:30}
    ]
  }}
};
vm.createContext(context);
vm.runInContext(helperSource,context);

const vip=context.roomChargeItem("vip",context.S.menus.vip[0],5);
assert.strictEqual(vip.qty,1);
assert.strictEqual(vip.price,30000);
assert.strictEqual(vip.category,"vipRoom");
assert.strictEqual(vip.isVipCharge,true);

const karaoke=context.roomChargeItem("karaoke",context.S.menus.karaoke[0],5);
assert.strictEqual(karaoke.qty,5);
assert.strictEqual(karaoke.price,2000);
assert.strictEqual(karaoke.price*karaoke.qty,10000);
assert.strictEqual(karaoke.category,"karaokeRoom");
assert.strictEqual(karaoke.isKaraokeCharge,true);

const karaokeExtension=context.roomChargeItemForMinutes("karaoke",30,5,{isExtension:true});
assert.strictEqual(karaokeExtension.qty,5);
assert.strictEqual(karaokeExtension.price,1000);
assert.strictEqual(karaokeExtension.isRoomExtension,true);
assert.strictEqual(karaokeExtension.isExtension,true);

context.S.menus.karaoke=[{id:"k60",label:"カラオケ室料 60分",price:2000,minutes:60}];
const scaledExtension=context.roomChargeItemForMinutes("karaoke",30,5,{isExtension:true});
assert.strictEqual(scaledExtension.price,1000);
assert.strictEqual(scaledExtension.qty,5);

assert.strictEqual(context.sessionRoomType({items:[{isVipCharge:true}]}),"vip");
assert.strictEqual(context.sessionRoomType({items:[{isRoomCharge:true,roomType:"karaoke"}]}),"karaoke");

const extensionBlock=app.slice(app.indexOf("function addExt"),app.indexOf("function addRoomCharge"));
assert.match(extensionBlock,/roomChargeItemForMinutes\(roomType,ext\.minutes,s\.guests/);
assert.match(extensionBlock,/if\(extRoom\)ni\.push/);

const estimateBlock=app.slice(app.indexOf("function calcEstForMinutes"),app.indexOf("function rModal"));
assert.match(estimateBlock,/roomChargeItemForMinutes\(roomType,extraMinutes,s\.guests/);
assert.doesNotMatch(estimateBlock,/est-vip|useVip/);

assert.match(app,/\["karaoke","カラオケ室料（1名単価）",true\]/);
assert.match(app,/室料<br><small>VIP \/ カラオケ<\/small>/);
assert.match(app,/category:type==="karaoke"\?"karaokeRoom":"vipRoom"/);
assert.match(app,/\(k==="vip"\|\|k==="karaoke"\).*室料の分数を入力してください/);
assert.match(app,/missingRoom[\s\S]*室料が未設定のため概算を印刷できません/);

console.log("room charge tests passed");
