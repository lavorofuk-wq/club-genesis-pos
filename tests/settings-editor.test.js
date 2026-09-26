const {test}=require("node:test");
const assert=require("node:assert/strict");
const {create,validate}=require("../settings-editor.js");
function storage(){
  const map=new Map();
  return{getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key),map};
}
function fixture(overrides={}){
  const state={activeBizDay:"2026-09-27",menus:{drinks:[{id:"d1",label:"水",price:1000}],extensions:[{id:"e1",label:"延長",price:3000,minutes:30}]},tables:[{id:"t1",label:"A",vip:false}],casts:[{id:123,name:"花",castType:"regular",active:true}]};
  const calls=[],events=[],session=storage();
  const adapter={getState:()=>state,getStorageKey:()=>"pos-dev:user-1",getBizDate:()=>"2026-09-27",storage:session,confirm:()=>true,tableBlocked:()=>"",maxTables:30,commit:async draft=>calls.push(draft),onOpen:()=>events.push("open"),onClose:()=>events.push("close"),onChange:()=>events.push("change"),...overrides};
  return{state,calls,events,session,adapter,editor:create(adapter)};
}
const menuEdit={kind:"menu",category:"drinks",id:"d1",action:"edit"};

test("list preserves every menu category and escapes labels without inline editing",()=>{
  const f=fixture();f.state.menus.drinks[0].label='"><img src=x onerror=alert(1)>';
  const markup=f.editor.renderList("menus")+f.editor.renderList("special");
  assert.doesNotMatch(markup,/<input|<img/);
  assert.match(markup,/&lt;img/);
  for(const category of ["normalSets","sets","extensions","vip","karaoke","drinks","castDrinks","champagne","keepBottles","castCustomItems","options"])assert.ok(markup.includes('data-category="'+category+'"'),category);
  assert.match(markup,/id="settings-sync-state"/);
});

test("opening and typing keep confirmed state unchanged, including 0 yen",async()=>{
  const f=fixture();const before=JSON.stringify(f.state);
  assert.equal(f.editor.open(menuEdit),true);
  f.editor.update("price","0");f.editor.update("label","  水 & 氷  ");
  assert.equal(JSON.stringify(f.state),before);
  assert.equal(f.events.filter(event=>event==="change").length,0,"typing does not rerender inputs");
  assert.match(f.editor.renderModal(),/水 &amp; 氷/);
  assert.equal(await f.editor.submit(),true);
  assert.equal(f.calls[0].values.price,0);
  assert.equal(f.calls[0].values.label,"水 & 氷");
  assert.equal(f.calls[0].base.price,1000);
  assert.equal(JSON.stringify(f.state),before,"only adapter may publish confirmed values");
  assert.equal(f.editor.hasDraft(),false);
  assert.equal(f.editor.renderModal(),"");
});

test("save failure keeps values for retry and closes only after success",async()=>{
  let fail=true;const f=fixture({commit:async draft=>{f.calls.push(draft);if(fail)throw new Error("通信エラー");}});
  f.editor.open(menuEdit);f.editor.update("price","1500");
  assert.equal(await f.editor.submit(),false);
  assert.match(f.editor.renderModal(),/value="1500"/);
  assert.match(f.editor.renderModal(),/通信エラー/);
  assert.equal(f.editor.hasDraft(),true);
  assert.ok(!f.events.includes("close"));
  fail=false;
  assert.equal(await f.editor.submit(),true);
  assert.equal(f.calls.length,2);
  assert.equal(f.editor.hasDraft(),false);
  assert.equal(f.events.at(-1),"close");
});

test("pending save blocks duplicate submit, close, edits and replacement",async()=>{
  let resolve;const f=fixture({commit:()=>new Promise(done=>{resolve=done;})});
  f.editor.open(menuEdit);const pending=f.editor.submit();
  assert.equal(f.editor.isBusy(),true);
  assert.equal(await f.editor.submit(),false);
  assert.equal(f.editor.close(),false);
  assert.equal(f.editor.update("price","999"),false);
  assert.equal(f.editor.open({kind:"table",id:"t1",action:"edit"}),false);
  assert.match(f.editor.renderModal(),/fieldset class="se-fields" disabled/);
  resolve(true);assert.equal(await pending,true);assert.equal(f.editor.isBusy(),false);
});

test("validation rejects malformed, negative, decimal and missing numbers but accepts zero",()=>{
  const draft={kind:"menu",category:"drinks",action:"edit",values:{label:"水",price:"0"}};
  assert.deepEqual(validate(draft).errors,{});
  for(const price of ["","-1","1.5","10abc","1e3","Infinity","9007199254740992"]){
    assert.ok(validate({...draft,values:{label:"水",price}}).errors.price,price);
  }
  assert.ok(validate({...draft,values:{label:" ",price:"10"}}).errors.label);
  for(const minutes of ["","0","-3","2.5"])assert.ok(validate({...draft,category:"vip",values:{label:"室料",price:"0",minutes}}).errors.minutes);
  assert.deepEqual(validate({...draft,category:"vip",values:{label:"室料",price:"0",minutes:"30"}}).errors,{});
});

test("validation errors do not call commit or discard the draft",async()=>{
  const f=fixture();f.editor.open({kind:"menu",category:"vip",action:"add"});
  f.editor.update("label","VIP");f.editor.update("price","0");
  assert.equal(await f.editor.submit(),false);
  assert.equal(f.calls.length,0);
  assert.match(f.editor.renderModal(),/分数は1以上/);
  assert.equal(f.editor.hasDraft(),true);
});

test("draft survives reload with its original ID, base and business date",async()=>{
  const f=fixture();f.editor.open({kind:"cast",action:"add",castType:"trial"});
  f.editor.update("name","月");
  const stored=JSON.parse([...f.session.map.values()][0]).draft;
  assert.match(stored.id,/^\d+$/);
  assert.equal(stored.businessDate,"2026-09-27");
  assert.equal(stored.bizDate,"2026-09-27");
  f.editor.close();
  const fresh=create(f.adapter);
  assert.equal(fresh.hasDraft(),true);
  assert.match(fresh.renderList("cast"),/保存していない下書き/);
  fresh.restore();assert.match(fresh.renderModal(),/value="月"/);
  await fresh.submit();
  assert.equal(f.calls[0].id,stored.id);
  assert.equal(f.calls[0].bizDate,stored.bizDate);
  assert.equal(f.session.map.size,0);
});

test("drafts are scoped to user and environment and anonymous restore is disabled",async()=>{
  let identity="pos-dev:user-1";
  const f=fixture({getStorageKey:()=>identity});
  f.editor.open(menuEdit);f.editor.update("price","2000");
  identity="pos-dev:user-2";
  assert.equal(f.editor.hasDraft(),false);
  assert.equal(await f.editor.submit(),false);
  assert.equal(f.calls.length,0);
  identity=null;
  assert.equal(create(f.adapter).restore(),false);
  assert.equal(create(f.adapter).open(menuEdit),false);
  identity="pos-prod:user-1";
  assert.equal(create(f.adapter).hasDraft(),false);
  identity="pos-dev:user-1";
  assert.equal(create(f.adapter).hasDraft(),true);
});

test("corrupt and unavailable session storage do not crash editing",async()=>{
  const f=fixture({storage:{getItem:()=>"{bad",setItem:()=>{throw new Error("quota");},removeItem:()=>{throw new Error("quota");}}});
  assert.equal(f.editor.hasDraft(),false);
  assert.equal(f.editor.open(menuEdit),true);
  f.editor.update("price","1800");
  assert.equal(await f.editor.submit(),true);
  assert.equal(f.calls[0].values.price,1800);
});

test("conflict shows latest versus input and requires explicit choice before retry",async()=>{
  let conflict=true;
  const current={id:"d1",label:"新しい水",price:1200};
  const f=fixture({commit:async draft=>{f.calls.push(draft);if(conflict)throw Object.assign(new Error("他端末で変更"),{code:"SETTINGS_CONFLICT",current});}});
  f.editor.open(menuEdit);f.editor.update("price","1800");
  assert.equal(await f.editor.submit(),false);
  assert.match(f.editor.renderModal(),/最新内容/);
  assert.match(f.editor.renderModal(),/新しい水/);
  assert.match(f.editor.renderModal(),/1800/);
  assert.equal(await f.editor.submit(),false);
  assert.equal(f.calls.length,1,"normal save cannot overwrite a conflicting target");
  conflict=false;
  assert.equal(await f.editor.retryConflict(),true);
  assert.deepEqual(f.calls[1].base,current);
  assert.equal(f.calls[1].values.price,1800);
  assert.equal(f.calls[1].values.label,"水");
});

test("loading current conflict value replaces only the draft and does not save",async()=>{
  const current={id:"d1",label:"新しい水",price:1200};
  const f=fixture({commit:async()=>{throw Object.assign(new Error("conflict"),{code:"SETTINGS_CONFLICT",current});}});
  f.editor.open(menuEdit);f.editor.update("price","1800");await f.editor.submit();
  assert.equal(f.editor.loadCurrent(),true);
  assert.match(f.editor.renderModal(),/value="1200"/);
  assert.match(f.editor.renderModal(),/value="新しい水"/);
  assert.equal(f.state.menus.drinks[0].price,1000);
  assert.ok(f.editor.hasDraft());
});

test("deleted conflict targets cannot be silently recreated",async()=>{
  let calls=0;const f=fixture({commit:async()=>{calls++;throw Object.assign(new Error("削除済み"),{code:"SETTINGS_CONFLICT",current:null});}});
  f.editor.open(menuEdit);await f.editor.submit();
  assert.equal(await f.editor.retryConflict(),false);
  assert.equal(f.editor.loadCurrent(),false);
  assert.equal(calls,1);
  assert.match(f.editor.renderModal(),/この項目は削除されています/);
});

test("occupied table deletion and table count limit are checked again at submit",async()=>{
  let blocked="使用中";
  const f=fixture({tableBlocked:()=>blocked,maxTables:1});
  assert.match(f.editor.renderList("tables"),/disabled/);
  f.editor.open({kind:"table",id:"t1",action:"delete"});
  assert.equal(await f.editor.submit(),false);assert.equal(f.calls.length,0);
  assert.match(f.editor.renderModal(),/使用中のテーブルは削除できません/);
  f.editor.discardDraft();
  f.editor.open({kind:"table",action:"add"});f.editor.update("label","B");
  assert.equal(await f.editor.submit(),false);assert.equal(f.calls.length,0);
  assert.match(f.editor.renderModal(),/最大 1 卓/);
});

test("cancelled replacement retains draft and discard removes it",()=>{
  const f=fixture({confirm:()=>false});
  f.editor.open(menuEdit);f.editor.update("price","1800");
  assert.equal(f.editor.open({kind:"table",id:"t1",action:"edit"}),false);
  assert.match(f.editor.renderModal(),/value="1800"/);
  assert.equal(f.editor.discardDraft(),false);
  f.adapter.confirm=()=>true;
  assert.equal(f.editor.discardDraft(),true);
  assert.equal(f.editor.hasDraft(),false);
});

test("table and menu additions retain stable IDs through failures",async()=>{
  for(const spec of [{kind:"table",action:"add"},{kind:"menu",category:"drinks",action:"add"}]){
    const f=fixture({commit:async draft=>{f.calls.push(draft);throw new Error("offline");}});
    f.editor.open(spec);f.editor.update("label","新規");
    if(spec.kind==="menu")f.editor.update("price","0");
    await f.editor.submit();await f.editor.submit();
    assert.equal(f.calls[0].id,f.calls[1].id);
    assert.match(f.calls[0].id,/_\d+_/);
    assert.equal(f.calls[0].base,null);
  }
});


test("same draft can reopen without discarding stable addition ID",()=>{
  const f=fixture({confirm:()=>{throw new Error("must not ask to replace the same draft");}});
  const spec={kind:"menu",category:"drinks",action:"add"};
  f.editor.open(spec);f.editor.update("label","保存前");f.editor.close();
  const id=JSON.parse([...f.session.map.values()][0]).draft.id;
  assert.equal(f.editor.open(spec),true);
  assert.match(f.editor.renderModal(),/保存前/);
  assert.equal(JSON.parse([...f.session.map.values()][0]).draft.id,id);
});

test("server field errors render inline and discard is disabled during saving",async()=>{
  let release;
  const f=fixture({commit:()=>new Promise((resolve,reject)=>{release=()=>reject(Object.assign(new Error("同じ名前があります"),{field:"label"}));})});
  f.editor.open(menuEdit);
  const pending=f.editor.submit();
  assert.match(f.editor.renderModal(),/onclick="settingsDiscardDraft\(\)" disabled/);
  release();await pending;
  assert.match(f.editor.renderModal(),/aria-describedby="settings-error-label"/);
  assert.match(f.editor.renderModal(),/id="settings-error-label"[^>]*>同じ名前があります/);
});

test("user change hides old fields and discarding never deletes another user's draft",()=>{
  let user="user-a";
  const f=fixture({getStorageKey:()=>user});
  f.editor.open(menuEdit);f.editor.update("label","User A secret");
  user="user-b";
  assert.doesNotMatch(f.editor.renderModal(),/User A secret/);
  assert.equal(f.editor.discardDraft(),true);
  user="user-a";
  const restored=create(f.adapter);assert.equal(restored.hasDraft(),true);restored.restore();
  assert.match(restored.renderModal(),/User A secret/);
});

test("single charge default creates the reserved sc ID and allows zero yen",async()=>{
  const f=fixture();assert.match(f.editor.renderList("menus"),/data-id="sc" data-action="add"/);
  f.editor.open({kind:"menu",category:"options",id:"sc",action:"add"});
  f.editor.update("price","0");await f.editor.submit();
  assert.equal(f.calls[0].id,"sc");assert.equal(f.calls[0].values.price,0);
});

test("modal moves focus to the first field, traps tab, and returns focus after Escape",()=>{
  let handler;const focused=[];
  const opener={isConnected:true,focus:()=>focused.push("opener")};
  const first={dataset:{settingsField:"label"},hidden:false,matches:()=>false,focus:()=>focused.push("field")};
  const last={hidden:false,focus:()=>focused.push("last")};
  const dialog={querySelector:selector=>selector.startsWith("input")?first:null,querySelectorAll:()=>[first,last],contains:node=>[first,last].includes(node),focus:()=>focused.push("dialog")};
  const doc={activeElement:opener,getElementById:()=>dialog,addEventListener:(name,fn)=>{handler=fn;},removeEventListener:()=>{}};
  const f=fixture({document:doc});
  f.editor.open(menuEdit);f.editor.mountModal();assert.equal(focused.at(-1),"field");
  doc.activeElement=last;
  let prevented=false;handler({key:"Tab",preventDefault:()=>{prevented=true;}});
  assert.equal(prevented,true);assert.equal(focused.at(-1),"field");
  handler({key:"Escape",preventDefault:()=>{},stopPropagation:()=>{}});
  assert.equal(f.editor.renderModal(),"");assert.equal(focused.at(-1),"opener");
});


test("cast editor uses the same normalized base as the visible roster",async()=>{
  const raw={id:123,name:"花"};
  const normalized={...raw,active:true,registeredAt:0,sortIndex:0};
  const f=fixture({getVisibleCasts:()=>[normalized]});
  f.state.casts=[raw];
  assert.equal(f.editor.open({kind:"cast",id:"123",action:"edit"}),true);
  f.editor.update("name","花子");
  assert.equal(await f.editor.submit(),true);
  assert.deepEqual(f.calls[0].base,normalized);
  assert.deepEqual(f.state.casts,[raw],"reading the normalized base does not rewrite the confirmed roster");
});

test("session storage failure explains reload risk without blocking save or losing input",async()=>{
  const f=fixture({storage:{getItem:()=>null,setItem:()=>{throw new Error("quota");},removeItem:()=>{}}});
  f.editor.open(menuEdit);f.editor.update("price","1800");
  assert.match(f.editor.renderModal(),/再読み込みすると入力内容が失われます/);
  assert.match(f.editor.renderModal(),/value="1800"/);
  assert.equal(await f.editor.submit(),true);
  assert.equal(f.calls[0].values.price,1800);
});

test("a business-day error recreates the cast draft with its input intact and requires explicit save",async()=>{
  const f=fixture({commit:async draft=>{
    f.calls.push(draft);
    if(f.calls.length===1)throw Object.assign(new Error("営業日が変わりました"),{code:"SETTINGS_BUSINESS_DAY_CHANGED",currentBusinessDate:null,currentBizDate:"2026-09-28"});
  }});
  f.state.activeBizDay=null;
  f.editor.open({kind:"cast",action:"add",castType:"trial"});f.editor.update("name","翌日の体入");
  assert.equal(await f.editor.submit(),false);
  const old=f.calls[0];
  assert.match(f.editor.renderModal(),/settingsRestartForCurrentDay/);
  assert.equal(await f.editor.submit(),false);assert.equal(f.calls.length,1);
  assert.equal(f.editor.restartForCurrentDay(),true);
  assert.equal(f.calls.length,1,"recreating a draft never saves implicitly");
  assert.match(f.editor.renderModal(),/翌日の体入/);
  assert.match(f.editor.renderModal(),/2026-09-28/);
  f.editor.close();const restored=create(f.adapter);assert.equal(restored.restore(),true);
  assert.equal(await restored.submit(),true);
  assert.equal(f.calls[1].values.name,"翌日の体入");assert.equal(f.calls[1].businessDate,null);
  assert.equal(f.calls[1].bizDate,"2026-09-28");assert.notEqual(f.calls[1].id,old.id);
});

test("business-day recreation retains the comparison base of an existing cast",async()=>{
  const f=fixture({commit:async()=>{throw Object.assign(new Error("営業日変更"),{code:"SETTINGS_BUSINESS_DAY_CHANGED",currentBusinessDate:"2026-09-28",currentBizDate:"2026-09-28"});}});
  f.editor.open({kind:"cast",id:"123",action:"edit"});f.editor.update("name","入力した名前");await f.editor.submit();
  f.state.casts[0].name="他端末の名前";
  assert.equal(f.editor.restartForCurrentDay(),true);
  const saved=JSON.parse([...f.session.map.values()][0]).draft;
  assert.equal(saved.base.name,"花","day recreation must not silently approve another device's rename");
  assert.equal(saved.values.name,"入力した名前");assert.equal(saved.id,"123");assert.equal(saved.businessDate,"2026-09-28");
});

test("legacy timed menus can keep missing minutes while new or previously timed menus cannot omit them",async()=>{
  for(const category of ["normalSets","sets","extensions","vip","karaoke"]){
    const f=fixture();f.state.menus[category]=[{id:"legacy",label:"既存",price:2000}];
    f.editor.open({kind:"menu",category,id:"legacy",action:"edit"});f.editor.update("label","編集後");f.editor.update("price","2500");
    assert.match(f.editor.renderModal(),/時間は未設定/);
    assert.equal(await f.editor.submit(),true);assert.equal(Object.hasOwn(f.calls[0].values,"minutes"),false);
    assert.equal(f.calls[0].values.price,2500);
    const draft={kind:"menu",category,action:"add",base:null,values:{label:"新規",price:"1000",minutes:""}};
    assert.ok(validate(draft).errors.minutes);
    draft.action="edit";draft.base={minutes:60};assert.ok(validate(draft).errors.minutes);
    draft.base={};draft.values.minutes="45";assert.equal(validate(draft).values.minutes,45);
  }
});
