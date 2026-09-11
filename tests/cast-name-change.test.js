const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const app=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const start=app.indexOf("function castNameItemValue");
const end=app.indexOf("async function remoteHistoryEntry",start);
assert.ok(start>=0&&end>start,"名前変更の参照更新処理を抽出できる");
const context={
  cloneData:value=>value==null?null:JSON.parse(JSON.stringify(value)),
  stableJson:value=>JSON.stringify(value),
  normalizeCasts:list=>(list||[]).map((cast,index)=>({...cast,active:cast.active!==false,registeredAt:cast.registeredAt||0,sortIndex:cast.sortIndex??index})),
  String,Array,Object,JSON
};
vm.createContext(context);
vm.runInContext(app.slice(start,end),context);
const plain=value=>JSON.parse(JSON.stringify(value));

const businessDate="2026-09-11";
const lunaId="1789127986881";

const registered={
  casts:[{id:lunaId,name:"仮名",castType:"trial",trialBizDay:businessDate}],
  castLifecycleLogs:{[businessDate]:{enteredCasts:[],exitedCasts:[],trialCasts:[{castId:lunaId,castName:"仮名",castType:"trial"}]}},
  sessions:{},shifts:{},assignments:{},history:[]
};
const renameBeforeOrder=context.castNameChangePlan(registered,lunaId,"ルナ",businessDate);
assert.strictEqual(renameBeforeOrder.casts[0].id,lunaId,"登録時のIDを変更しない");
assert.strictEqual(renameBeforeOrder.casts[0].name,"ルナ","登録後・注文前の名前変更をマスタへ反映");
assert.strictEqual(renameBeforeOrder.lifecycle[businessDate].trialCasts[0].castName,"ルナ","登録後・注文前の名前変更を体入記録へ反映");
const orderedAfterRename=context.castNameItemValue({id:"cd1",castId:lunaId,castName:renameBeforeOrder.casts[0].name,backTargetCastIds:[lunaId],backTargetCastNames:[renameBeforeOrder.casts[0].name]},lunaId,"ルナ").value;
assert.deepStrictEqual(plain([orderedAfterRename.castId,orderedAfterRename.castName,orderedAfterRename.backTargetCastIds,orderedAfterRename.backTargetCastNames]),[lunaId,"ルナ",[lunaId],["ルナ"]],"登録→名前変更→注文で同じID・名前を使う");

const orderedBeforeRename={
  casts:[{id:lunaId,name:"仮名",castType:"trial",trialBizDay:businessDate},{id:"other",name:"ルナ",castType:"regular"}],
  castLifecycleLogs:{[businessDate]:{enteredCasts:[],exitedCasts:[],trialCasts:[{castId:lunaId,castName:"仮名",castType:"trial"}]}},
  sessions:{t1:{id:"session",items:[{id:"cd1",castId:lunaId,castName:"仮名",backTargetCastIds:[lunaId],backTargetCastNames:["仮名"]}]}},
  shifts:{sh1:{id:"sh1",castId:lunaId,castName:"仮名"}},
  assignments:{as1:{id:"as1",castId:lunaId,castName:"仮名"}},
  history:[{id:"h1",items:[{id:"bs1",castId:lunaId,castName:"仮名",isBanaiShimei:true},{id:"cd2",castId:lunaId,castName:"仮名",backTargetCastIds:[lunaId],backTargetCastNames:["仮名"]}]}]
};
const renameAfterOrder=context.castNameChangePlan(orderedBeforeRename,lunaId,"ルナ",businessDate);
assert.strictEqual(renameAfterOrder.casts[0].id,lunaId,"注文後の名前変更でもIDを維持");
assert.strictEqual(renameAfterOrder.casts[1].id,"other","同名の別IDを統合しない");
assert.strictEqual(renameAfterOrder.casts[1].name,"ルナ","同名の別人を変更しない");
assert.strictEqual(renameAfterOrder.sessions.t1.items[0].castName,"ルナ");
assert.deepStrictEqual(plain(renameAfterOrder.sessions.t1.items[0].backTargetCastNames),["ルナ"]);
assert.strictEqual(renameAfterOrder.shifts.sh1.castName,"ルナ");
assert.strictEqual(renameAfterOrder.assignments.as1.castName,"ルナ");
assert(renameAfterOrder.history[0].items.every(item=>item.castName==="ルナ"),"会計済み明細も同日の明示的な名前変更へ揃える");
assert.deepStrictEqual(plain(renameAfterOrder.changed),{sessions:["t1"],shifts:["sh1"],assignments:["as1"],history:[0]},"変更対象だけを保存する");

const renameSource=app.slice(app.indexOf("async function guardedCastNameChange"),app.indexOf("function hasVisibleCastName"));
assert.match(renameSource,/guardedCheckedNodeUpdate\(updates,null,\{expectedRecords,expectedActiveBizDay:businessDate\}\)/,"同日の参照レコードと名簿を競合検知付きで保存する");
assert.match(renameSource,/async function ucn[\s\S]*await guardedCastNameChange\(id,n\)/,"設定画面の名前変更が整合保存経路を使う");
assert.doesNotMatch(renameSource,/save\("casts"/,"名前だけを単独保存する旧経路へ戻さない");

console.log("cast name change propagation tests passed");
