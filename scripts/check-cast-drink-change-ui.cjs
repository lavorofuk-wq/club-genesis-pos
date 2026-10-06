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
      page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
      await page.goto(origin);await seed(page,'op');await addDrink(page);
      await page.screenshot({path:path.join(output,name+'-detail.png'),fullPage:true});
      await page.getByRole('button',{name:'担当変更',exact:true}).click();
      const confirm=page.getByRole('button',{name:'担当変更を確定',exact:true});
      assert.equal(await confirm.isDisabled(),true);
      await page.locator('#md [data-cid="1"]').click();assert.equal(await confirm.isDisabled(),true);
      await page.getByRole('button',{name:'休み',exact:true}).click();
      assert.equal(await page.locator('#md [data-cid="4"]').count(),0);
      await page.locator('#md [data-cid="2"]').click();
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
      await page.getByRole('button',{name:'担当変更',exact:true}).click();
      await page.locator('#md [data-cid="1"]').click();await confirm.click();
      await page.waitForFunction(()=>!chargeSaveBusy&&S.sessions.t1.items[1].castId===1);
      assert.equal(await page.evaluate(()=>S.history.length),0);
      await page.evaluate(()=>{md='co2';coState={payMethod:'card',splits:[{method:'card',amount:ct(S.sessions.t1).total}]};rModal();});
      await page.getByRole('button',{name:'会計終了を確定する',exact:false}).click();
      await page.waitForFunction(()=>!checkoutBusy&&S.history.length===1);
      assert.equal(await page.evaluate(()=>S.history[0].items[1].castId),1);
      assert.equal(await page.evaluate(()=>S.history[0].total),20800);
      for(const role of ['cashier','list']){
        await seed(page,role);await addDrink(page);
        assert.equal(await page.getByRole('button',{name:'担当変更',exact:true}).count(),0);
        await page.evaluate(async()=>{openCastDrinkChange('cd_qa');selectDrinkChangeCast(2);await saveCastDrinkChange();});
        assert.equal(await page.evaluate(()=>window.__qaWrites.length),0);
      }
      assert.deepEqual(errors,[]);console.log(name+': role gating, save, totals, attendance warning, preparation gate, restore, reassign and re-checkout passed');
      await context.close();
    }
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
