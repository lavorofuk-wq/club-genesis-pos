// Synthetic database only. External requests and service workers are blocked.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.argv[2]||'playwright');
const {seed}=require('./check-cast-order-attendance-ui.cjs');
const root=path.resolve(__dirname,'..'),output=path.resolve(process.argv[3]||path.join(root,'.codex-artifacts','set-guest-ui'));
async function setup(page,role){
  await seed(page,role);
  await page.evaluate(()=>{
    S.menus.sets=[{id:'set',label:'Set 60',price:10000,minutes:60},{id:'set90',label:'Set 90',price:15000,minutes:90}];
    S.menus.normalSets=[];S.menus.extensions=[{id:'ext60',label:'Extension 60',price:8000,minutes:60}];
    const s=S.sessions.t1;s.guests=3;s.totalGuests=3;s.items[0].qty=3;s.items[0].label='Set 60';
    window.__qaDatabase.sessions.t1=structuredClone(s);at='t1';openFloorDetail('t1');om('setDetail');
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
      const page=await context.newPage(),errors=[],alerts=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{
        if(d.type()==='confirm')return d.message().includes('フロアへ復活')?d.accept():d.dismiss();
        alerts.push(d.message());return d.accept();
      });
      await page.goto(origin);await setup(page,'cashier');
      await page.getByRole('button',{name:'Set 60の料金訂正',exact:true}).click();
      assert.equal(await page.locator('#set-price-menu option[value="custom"]').count(),0);
      await page.locator('#set-price-menu').selectOption('set90');
      await page.locator('#set-price-reason').fill('初回メニュー選択の訂正');
      assert.match(await page.locator('#set-price-preview').innerText(),/58,500.*21:30/);
      await page.screenshot({path:path.join(output,name+'-price.png'),fullPage:true});
      assert.equal(await page.locator('.set-price-modal').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
      await page.locator('#set-price-save').click();
      await page.waitForFunction(()=>!chargeSaveBusy&&S.sessions.t1.items[0].minutes===90);
      await page.evaluate(()=>tryExt());
      await page.locator('#extension-guests').fill('2');
      assert.match(await page.locator('.charge-extension').innerText(),/16,000/);
      assert.equal(await page.locator('#extension-guests').evaluate(el=>document.activeElement===el),true);
      await page.screenshot({path:path.join(output,name+'-extension.png'),fullPage:true});
      await page.locator('[data-eid="ext60"]').click();
      await page.waitForFunction(()=>!chargeSaveBusy&&S.sessions.t1.guests===2,null,{timeout:5000});
      assert.deepEqual(await page.evaluate(()=>({current:S.sessions.t1.guests,total:S.sessions.t1.totalGuests,qty:S.sessions.t1.items[0].qty})),{current:2,total:3,qty:3});
      assert.match(await page.evaluate(()=>rFloor()),/2名/);
      await page.evaluate(()=>{closeFloorDetail();sv('list');});
      assert.match(await page.locator('#list-root').innerText(),/現在の客数\s*2名/);
      await page.evaluate(()=>{sv('floor');at='t1';openFloorDetail('t1');});
      await page.evaluate(()=>om('add-set'));
      await page.locator('#md [data-sid="set90"]').click();
      await page.waitForFunction(()=>!chargeSaveBusy&&S.sessions.t1.guests===3);
      assert.equal(await page.evaluate(()=>S.sessions.t1.totalGuests),4);
      assert.equal(await page.evaluate(()=>ct(S.sessions.t1).total),98800);
      assert.equal(await page.evaluate(()=>new Date(S.sessions.t1.setEndTime).toISOString()),'2026-10-04T13:30:00.000Z');
      await page.evaluate(()=>{S.sessions.t1=JSON.parse(JSON.stringify(window.__qaDatabase.sessions.t1));om('setDetail');});
      await page.screenshot({path:path.join(output,name+'-detail.png'),fullPage:true});
      assert.equal(await page.locator('#md .mb').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
      assert.match(await page.locator('.set-change-history').innerText(),/3件/);
      await page.evaluate(()=>{md='co2';coState={payMethod:'cash',splits:[{method:'cash',amount:ct(S.sessions.t1).total}]};rModal();});
      await page.getByRole('button',{name:'会計終了を確定する',exact:false}).click();
      await page.waitForFunction(()=>!checkoutBusy&&S.history.length===1);
      assert.deepEqual(await page.evaluate(()=>({current:S.history[0].guests,total:S.history[0].totalGuests,audit:S.history[0].setChanges.length})),{current:3,total:4,audit:3});
      await page.evaluate(()=>{window._viewHistRec=S.history[0];md='viewHistDetail';rModal();});
      assert.equal(await page.locator('.set-change-history').count(),1);
      await page.evaluate(async()=>{closeM();openTablePreparation('t1');await answerTablePreparation(true);await restoreHistoryToFloor(S.history[0].id);});
      await page.waitForFunction(()=>!!S.sessions.t1);
      assert.equal(await page.evaluate(()=>S.sessions.t1.totalGuests),4);
      assert.equal(await page.evaluate(()=>S.sessions.t1.items[0].minutes),90);
      assert.equal(await page.evaluate(()=>ct(S.sessions.t1).total),98800);
      await page.evaluate(()=>{at='t1';om('setDetail');});
      await page.getByRole('button',{name:'Set 90の料金訂正',exact:true}).first().click();
      await page.locator('#set-price-menu').selectOption('set');await page.locator('#set-price-reason').fill('復活後の訂正');
      await page.locator('#set-price-save').click();await page.waitForFunction(()=>!chargeSaveBusy&&S.sessions.t1.items[0].minutes===60);
      assert.equal(await page.evaluate(()=>ct(S.sessions.t1).total),79300);
      assert.equal(await page.evaluate(()=>S.sessions.t1.totalGuests),4);
      assert.equal(await page.evaluate(()=>new Date(S.sessions.t1.setEndTime).toISOString()),'2026-10-04T13:00:00.000Z');
      await setup(page,'op');await page.getByRole('button',{name:'Set 60の料金訂正',exact:true}).click();
      await page.locator('#set-price-menu').selectOption('custom');
      await page.locator('#set-price-value').fill('7000');await page.locator('#set-price-reason').fill('指定額');
      await page.locator('#set-price-save').click();await page.waitForFunction(()=>!chargeSaveBusy&&S.sessions.t1.items[0].price===7000);
      await setup(page,'list');
      await page.evaluate(async()=>{openSetPrice('set');await addSetToSession('set',1);tryExt();});
      assert.equal(await page.evaluate(()=>window.__qaWrites.length),0);
      assert.deepEqual(errors,[]);assert.deepEqual(alerts,[]);
      console.log(name+': correction, extension count, join, reload, checkout, history, restore and role checks passed');
      await context.close();
    }
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
