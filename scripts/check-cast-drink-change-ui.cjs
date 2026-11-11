// Synthetic database only; this script never connects to production services.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.argv[2]||'playwright');
const {seed}=require('./check-cast-order-attendance-ui.cjs');
const root=path.resolve(__dirname,'..'),output=path.resolve(process.argv[3]||path.join(root,'.codex-artifacts','drink-change-ui'));
async function addDrink(page){
  await page.evaluate(()=>{
    const item={id:'cd_qa',category:'castDrink',label:'キャストDrink (出勤キャスト)',castId:1,castName:'出勤キャスト',price:2000,qty:3,
      backTargetCastIds:['1'],backTargetCastNames:['出勤キャスト'],backType:'castDrink',backAllocation:'orderedCast'};
    S.sessions.t1.items.push(item);window.__qaDatabase.sessions.t1=structuredClone(S.sessions.t1);
    at='t1';openFloorDetail('t1');om('castDetail');
  });
}
async function addBanaiFixture(page){
  await page.evaluate(items=>{
    const names=new Map(S.casts.map(c=>[String(c.id),c.name]));
    items.forEach(i=>{
      if(i.castId!=null)i.castName=names.get(String(i.castId));
      if(i.banaiExtCastIds)i.banaiExtCastNames=i.banaiExtCastIds.map(id=>names.get(String(id)));
      if(i.backTargetCastIds)i.backTargetCastNames=i.backTargetCastIds.map(id=>names.get(String(id)));
      if(i.isBanaiShimei)i.label='場内指名 ('+i.castName+')';
    });
    Object.assign(S.sessions.t1,{items,banaiShimeis:[1,3],honShimeis:[],setEndTime:S.sessions.t1.startTime+3*3600000});
    window.__qaDatabase.sessions.t1=structuredClone(S.sessions.t1);
    at='t1';openFloorDetail('t1');om('setDetail');
  },require('../tests/helpers/banai-order-fixture.cjs').items('1','3'));
}
async function checkBanaiEdits(page,name){
  await seed(page,'op');await addBanaiFixture(page);
  const initial=await page.evaluate(()=>({total:ct(S.sessions.t1).total,shifts:S.shifts,assignments:S.assignments}));
  await page.locator('.drink-change-open[data-iid="nom-b"]').click();
  const up=page.getByRole('button',{name:'注文順を1つ前へ',exact:true}),down=page.getByRole('button',{name:'注文順を1つ後へ',exact:true});
  for(let n=0;n<3;n++)await up.click();
  assert.equal(await page.evaluate(()=>castDrinkChangeState.position),2);
  assert.equal(await page.locator('.banai-order-targets').count(),1);
  assert.equal(await page.locator('#drink-edit-save').isDisabled(),true);
  await page.locator('.banai-order-targets [data-cid="1"]').check();
  await page.locator('.banai-order-targets [data-cid="3"]').check();
  assert.match(await page.locator('#drink-edit-preview').innerText(),/34,000 → ¥16,000/);
  assert.match(await page.locator('#drink-edit-preview').innerText(),/15,000 → ¥31,000/);
  assert.match(await page.locator('#drink-edit-preview').innerText(),/bottle1 バック対象/);
  await page.locator('#drink-edit-preview').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,name+'-banai-select.png'),fullPage:true});
  for(const selector of ['.drink-order-tools','#drink-edit-save'])assert.equal(await page.locator(selector).evaluate(el=>{
    const rect=el.getBoundingClientRect(),dialog=el.closest('.mb').getBoundingClientRect();
    return rect.top>=dialog.top&&rect.bottom<=dialog.bottom&&rect.bottom<=innerHeight;
  }),true);
  assert.equal(await page.locator('.drink-edit-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  await down.click();assert.equal(await page.evaluate(()=>Object.keys(castDrinkChangeState.extensions).length),0);
  await up.click();assert.equal(await page.locator('#drink-edit-save').isDisabled(),true);
  await page.locator('.banai-order-targets [data-cid="1"]').check();await page.locator('.banai-order-targets [data-cid="3"]').check();
  await page.locator('#drink-edit-save').click();await page.waitForFunction(()=>!chargeSaveBusy&&md==='setDetail');
  assert.deepEqual(await page.evaluate(()=>S.sessions.t1.items.find(i=>i.id==='bottle1').backTargetCastIds),['1','3']);
  assert.deepEqual(await page.evaluate(()=>S.sessions.t1.items.find(i=>i.id==='cd_a').backTargetCastIds),['1']);
  assert.equal(await page.evaluate(()=>ct(S.sessions.t1).total),initial.total);
  assert.deepEqual(await page.evaluate(()=>S.shifts),initial.shifts);assert.deepEqual(await page.evaluate(()=>S.assignments),initial.assignments);
  await page.locator('.drink-change-open[data-iid="nom-b"]').click();await down.click();
  await page.getByRole('button',{name:'戻る',exact:true}).click();
  assert.equal(await page.evaluate(()=>Object.keys(window.__qaDatabase.banaiOrderChanges['2026-10-04']).length),1);
  const saved=await page.evaluate(()=>window.__qaDatabase);
  await page.reload();await seed(page,'op');
  await page.evaluate(saved=>{
    Object.assign(window.__qaDatabase,saved);S.sessions=structuredClone(saved.sessions);
    vw='list';render();vw='floor';render();at='t1';openFloorDetail('t1');om('setDetail');
  },saved);
  assert.equal(await page.evaluate(()=>S.sessions.t1.items[2].id),'nom-b');
  await page.evaluate(()=>{md='co2';coState={payMethod:'cash',splits:[{method:'cash',amount:ct(S.sessions.t1).total}]};rModal();});
  await page.getByRole('button',{name:'会計終了を確定する',exact:false}).click();await page.waitForFunction(()=>!checkoutBusy&&S.history.length===1);
  assert.equal(await page.evaluate(()=>openBanaiOrderChange('nom-a')),false);
  await page.evaluate(async()=>{openTablePreparation('t1');await answerTablePreparation(true);await restoreHistoryToFloor(S.history[0].id);at='t1';om('setDetail');});
  await page.locator('.drink-change-open[data-iid="nom-a"]').click();
  while(await page.evaluate(()=>castDrinkChangeState.position)<9)await down.click();
  assert.equal(await page.locator('.banai-order-targets').count(),2);
  assert.equal(await page.locator('.banai-order-targets [data-cid="1"]').count(),0);
  await page.locator('.banai-order-targets [data-eid="ext1"][data-cid=""]').check();
  assert.equal(await page.locator('#drink-edit-save').isDisabled(),true);
  await page.locator('.banai-order-targets [data-eid="ext2"][data-cid="3"]').check();
  await page.locator('#drink-edit-preview').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,name+'-banai-restored.png'),fullPage:true});
  await page.locator('#drink-edit-save').click();await page.waitForFunction(()=>!chargeSaveBusy&&md==='setDetail');
  assert.deepEqual(await page.evaluate(()=>S.sessions.t1.items.find(i=>i.id==='bottle1').backTargetCastIds),[]);
  assert.equal(await page.evaluate(()=>ct(S.sessions.t1).total),initial.total);
  await page.evaluate(()=>{md='co2';coState={payMethod:'card',splits:[{method:'card',amount:ct(S.sessions.t1).total}]};rModal();});
  await page.getByRole('button',{name:'会計終了を確定する',exact:false}).click();await page.waitForFunction(()=>!checkoutBusy&&S.history.length===1);
  assert.equal(await page.evaluate(()=>S.history[0].total),initial.total);
  assert.deepEqual(await page.evaluate(()=>gmsCastSales(S.history).map(c=>[c.castId,c.jonaiExtensionSales]).sort()),[['1',0],['3',17000]]);
}
async function checkEdits(page,name){
  await seed(page,'op');await addDrink(page);
  await page.evaluate(()=>{
    const s=S.sessions.t1,drink=s.items[1];
    S.menus.castDrinks.push({id:'d3000',label:'確認Drink 3000',price:3000});
    window.__qaDatabase.menus=structuredClone(S.menus);
    s.banaiShimeis=[1,3];s.honShimeis=[];
    s.items=[s.items[0],{id:'ba',label:'場内指名 A',castId:1,castName:'出勤キャスト',isBanaiShimei:true,price:2000,qty:1},
      {id:'bb',label:'場内指名 B',castId:3,castName:'退勤キャスト',isBanaiShimei:true,price:2000,qty:1},
      {id:'ext-a',groupId:'g-a',label:'延長 A',isExtension:true,extMinutes:60,isBanaiExtension:true,banaiExtCastIds:['1'],price:4000,qty:1},drink,
      {id:'ext-b',groupId:'g-b',label:'延長 B',isExtension:true,extMinutes:60,isBanaiExtension:true,banaiExtCastIds:['3'],price:4000,qty:1},
      {...drink,id:'cd_b',label:'キャストDrink B',castId:3,castName:'退勤キャスト',backTargetCastIds:['3'],backTargetCastNames:['退勤キャスト'],price:1000,qty:1}];
    s.setEndTime+=120*60000;window.__qaDatabase.sessions.t1=structuredClone(s);om('castDetail');
  });
  const open=async mode=>{
    await page.locator('.drink-change-open[data-iid="cd_qa"]').click();
    await page.getByRole('button',{name:mode,exact:true}).click();
  };
  await open('金額変更');
  await page.locator('#md [data-did="d3000"]').click();await page.locator('#drink-edit-qty').fill('4');
  assert.match(await page.locator('#drink-edit-preview').innerText(),/45,500/);
  await page.screenshot({path:path.join(output,name+'-amount.png'),fullPage:true});
  assert.equal(await page.locator('.drink-change-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  await page.locator('#drink-edit-save').click();await page.waitForFunction(()=>!chargeSaveBusy&&S.sessions.t1.items.find(i=>i.id==='cd_qa').qty===4);
  assert.equal(await page.evaluate(()=>ct(S.sessions.t1).total),45500);
  await open('順番変更');assert.equal(await page.locator('#drink-edit-save').isDisabled(),true);
  await page.getByRole('button',{name:'注文順を1つ後へ',exact:true}).click();
  await page.getByRole('button',{name:'注文順を1つ後へ',exact:true}).click();
  assert.match(await page.locator('#drink-edit-preview').innerText(),/16,000 → ¥4,000/);
  assert.match(await page.locator('#drink-edit-preview').innerText(),/5,000 → ¥17,000/);
  await page.screenshot({path:path.join(output,name+'-order.png'),fullPage:true});
  for(const selector of ['.drink-order-tools','#drink-edit-save'])assert.equal(await page.locator(selector).evaluate(el=>{
    const rect=el.getBoundingClientRect(),dialog=el.closest('.mb').getBoundingClientRect();
    return rect.top>=dialog.top&&rect.bottom<=dialog.bottom&&rect.bottom<=innerHeight;
  }),true,'order controls stay in the visible modal');
  await page.locator('#drink-edit-save').click();await page.waitForFunction(()=>!chargeSaveBusy&&S.sessions.t1.items.at(-1).id==='cd_qa');
  assert.equal(await page.evaluate(()=>ct(S.sessions.t1).total),45500);
  await open('金額変更');await page.locator('#drink-edit-price').fill('5000');await page.locator('#drink-edit-qty').fill('2');
  await page.locator('#drink-edit-save').click();await page.waitForFunction(()=>!chargeSaveBusy&&S.sessions.t1.items.at(-1).price===5000);
  assert.equal(await page.evaluate(()=>ct(S.sessions.t1).total),42900);
  await page.evaluate(()=>{S.sessions.t1=JSON.parse(JSON.stringify(window.__qaDatabase.sessions.t1));md='co2';coState={payMethod:'cash',splits:[{method:'cash',amount:ct(S.sessions.t1).total}]};rModal();});
  await page.getByRole('button',{name:'会計終了を確定する',exact:false}).click();await page.waitForFunction(()=>!checkoutBusy&&S.history.length===1);
  assert.equal(await page.evaluate(()=>S.history[0].items.at(-1).id),'cd_qa');assert.equal(await page.evaluate(()=>S.history[0].total),42900);
  await page.evaluate(async()=>{openTablePreparation('t1');await answerTablePreparation(true);await restoreHistoryToFloor(S.history[0].id);at='t1';om('castDetail');});
  await open('金額変更');await page.locator('#drink-edit-price').fill('0');await page.locator('#drink-edit-save').click();
  await page.waitForFunction(()=>!chargeSaveBusy&&S.sessions.t1.items.at(-1).price===0);
  assert.equal(await page.evaluate(()=>S.sessions.t1.items.at(-1).qty),2);
  assert.equal(await page.evaluate(()=>ct(S.sessions.t1).total),29900);
  assert.equal(await page.evaluate(()=>Object.keys(window.__qaDatabase.castDrinkChanges['2026-10-04']).length),4);
}
async function main(){
  fs.mkdirSync(output,{recursive:true});
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');
    let content=fs.readFileSync(file);
    if(path.basename(file)==='index.html')content=content.toString().replace(/<script src="firebase-init[^"]*"><\/script>/g,'').replace(/<link[^>]*https:[^>]*>/g,'');
    res.end(content);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;let browser;
  try{
    browser=await chromium.launch({channel:'chrome',headless:true});
    for(const [name,width,height] of [['desktop',1440,1000],['tablet',768,1024],['mobile',390,844],['small',320,568]]){
      const context=await browser.newContext({viewport:{width,height},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
      await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='confirm'&&d.message().includes('印刷')?d.dismiss():d.accept());
      await page.goto(origin);await seed(page,'op');await addDrink(page);
      assert.equal(await page.locator('.cast-detail-label').evaluate(el=>getComputedStyle(el).color),await page.locator('.mb').last().evaluate(el=>getComputedStyle(el).color),'order text uses the readable theme color');
      await page.screenshot({path:path.join(output,name+'-detail.png'),fullPage:true});
      await page.getByRole('button',{name:'変更',exact:true}).click();
      await page.getByRole('button',{name:'キャスト変更',exact:true}).click();
      const confirm=page.getByRole('button',{name:'キャスト変更を確定',exact:true});
      assert.equal(await confirm.isDisabled(),true);
      await page.locator('#md [data-cid="1"]').click();assert.equal(await confirm.isDisabled(),true);
      await page.getByRole('button',{name:'休み',exact:true}).click();
      assert.equal(await page.locator('#md [data-cid="4"]').count(),0);
      await page.locator('#md [data-cid="2"]').click();
      assert.notEqual(await page.locator('#md [data-cid="2"]').evaluate(el=>getComputedStyle(el).backgroundColor),await page.locator('#md [data-cid="3"]').evaluate(el=>getComputedStyle(el).backgroundColor),'selected cast remains visibly distinct');
      await page.screenshot({path:path.join(output,name+'-select.png'),fullPage:true});
      assert.equal(await page.locator('.drink-change-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
      await confirm.click();
      await page.waitForFunction(()=>!chargeSaveBusy&&S.sessions.t1.items[1].castId===2);
      assert.equal(await page.evaluate(()=>window.__qaWrites.length),1);
      assert.equal(await page.evaluate(()=>ct(S.sessions.t1).total),20800);
      assert.equal(await page.evaluate(()=>S.sessions.t1.items[1].qty),3);
      assert.deepEqual(await page.evaluate(()=>S.sessions.t1.items[1].backTargetCastIds),['2']);
      await page.evaluate(()=>{md='co2';coState={payMethod:'cash',splits:[{method:'cash',amount:ct(S.sessions.t1).total}]};rModal();});
      await page.getByRole('button',{name:'会計終了を確定する',exact:false}).click();
      await page.waitForFunction(()=>!checkoutBusy&&S.history.length===1);
      assert.equal(await page.evaluate(()=>openCastDrinkChange('cd_qa')),false);
      await page.evaluate(()=>om('endBizDay'));
      assert.match(await page.locator('.cast-attendance-warning').innerText(),/会計履歴：確認テーブル 1/);
      assert.match(await page.locator('.cast-attendance-warning').innerText(),/休みキャスト/);
      await page.evaluate(async()=>{closeM();await restoreHistoryToFloor(S.history[0].id);});
      assert.equal(await page.evaluate(()=>!!S.sessions.t1),false,'preparation gate retained');
      await page.evaluate(async()=>{openTablePreparation('t1');await answerTablePreparation(true);});
      await page.evaluate(async()=>{await restoreHistoryToFloor(S.history[0].id);});
      await page.waitForFunction(()=>!!S.sessions.t1);
      await page.evaluate(()=>{at='t1';om('castDetail');});
      await page.getByRole('button',{name:'変更',exact:true}).click();
      await page.getByRole('button',{name:'キャスト変更',exact:true}).click();
      await page.locator('#md [data-cid="1"]').click();await confirm.click();
      await page.waitForFunction(()=>!chargeSaveBusy&&S.sessions.t1.items[1].castId===1);
      assert.equal(await page.evaluate(()=>S.history.length),0);
      await page.evaluate(()=>{md='co2';coState={payMethod:'card',splits:[{method:'card',amount:ct(S.sessions.t1).total}]};rModal();});
      await page.getByRole('button',{name:'会計終了を確定する',exact:false}).click();
      await page.waitForFunction(()=>!checkoutBusy&&S.history.length===1);
      assert.equal(await page.evaluate(()=>S.history[0].items[1].castId),1);
      assert.equal(await page.evaluate(()=>S.history[0].total),20800);
      await checkEdits(page,name);
      await checkBanaiEdits(page,name);
      for(const role of ['cashier','list']){
        await seed(page,role);await addDrink(page);
        assert.equal(await page.getByRole('button',{name:'変更',exact:true}).count(),0);
        await page.evaluate(async()=>{openCastDrinkChange('cd_qa');selectDrinkChangeCast(2);await saveCastDrinkChange();});
        await page.evaluate(async()=>{openCastDrinkEdit('cd_qa');setDrinkChangeMode('price');setDrinkEditField('price','1');await saveCastDrinkChange();setDrinkChangeMode('order');moveDrinkEdit(-1);await saveCastDrinkChange();});
        assert.equal(await page.evaluate(()=>window.__qaWrites.length),0);
        await addBanaiFixture(page);assert.equal(await page.locator('.drink-change-open').count(),0);
        await page.evaluate(async()=>{openBanaiOrderChange('nom-b');moveDrinkEdit(-1);selectBanaiOrderCast('ext1','1',true);await saveCastDrinkChange();});
        assert.equal(await page.evaluate(()=>window.__qaWrites.length),0);
      }
      assert.deepEqual(errors,[]);console.log(name+': drink edits and nomination order, extension reselection, bottle backs, role gates, reload, restore and re-checkout passed');
      await context.close();
    }
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
