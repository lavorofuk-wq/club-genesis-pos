// Usage: node scripts/check-table-preparation-ui.cjs <playwright module path> [output directory]
// Serves the real UI with an in-memory database; all external requests are blocked.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require(process.argv[2]||'playwright');
const root=path.resolve(__dirname,'..');
const output=path.resolve(process.argv[3]||path.join(root,'.codex-artifacts','table-preparation-qa'));

async function main(){
  fs.mkdirSync(output,{recursive:true});
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');
    let content=fs.readFileSync(file);
    if(path.basename(file)==='index.html')content=content.toString().replace(/<script src="firebase-init[^"]*"><\/script>/g,'').replace(/<link[^>]*https:[^>]*>/g,'');
    res.end(content);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  let browser;
  try{
    browser=await chromium.launch({channel:'chrome',headless:true});
    for(const [name,width,height] of [['desktop',1440,1000],['tablet',768,1024],['mobile',390,844]]){
      const context=await browser.newContext({viewport:{width,height},hasTouch:width<=1024,timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
      await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
      const page=await context.newPage(),errors=[],alerts=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('dialog',async dialog=>{
        if(dialog.type()==='confirm')await dialog.dismiss();
        else{alerts.push(dialog.message());await dialog.accept();}
      });
      await page.goto(origin);
      await page.waitForFunction(()=>typeof checkout==='function');
      await page.evaluate(()=>{
        const start=Date.now()-1800000;
        S.tables=[{id:'t1',label:'テーブル 1'},{id:'t2',label:'テーブル 2'},{id:'t3',label:'テーブル 3'},{id:'t4',label:'テーブル 4'},{id:'t5',label:'テーブル 5'},{id:'va',label:'VIP-A',vip:true}];
        S.activeBizDay='2026-09-27';S.tablePreparations={};S.history=[];S.shifts={};S.assignments={};
        S.sessions={t1:{tableId:'t1',sessionId:'qa-visit',startTime:start,setEndTime:start+3600000,guests:2,_rev:1,items:[{id:'set',label:'セット料金',isSet:true,price:25000,qty:2,minutes:60}]}};
        window.FB_ROOT='pos-dev';scopedAtomicValidationVersion=614400;tableChangeAtomicValidationVersion=614300;
        const database=structuredClone({tables:S.tables,sessions:S.sessions,tablePreparations:{},history:{},shifts:{},assignments:{},activeBizDay:S.activeBizDay});
        updateRemoteHash('tables',database.tables);
        window.__qaDatabase=database;window.__qaWrites=[];window.__qaFail=false;
        const parts=p=>p.replace(/^pos-dev\//,'').split('/').filter(Boolean);
        const get=p=>parts(p).reduce((node,key)=>node?.[key],database);
        const put=(p,value)=>{
          const keys=parts(p),last=keys.pop(),parent=keys.reduce((node,key)=>node[key]||(node[key]={}),database);
          if(value==null)delete parent[last];else parent[last]=structuredClone(value);
        };
        window._db={ref:key=>({
          orderByChild(field){this.field=field;return this;},equalTo(value){this.filter=value;return this;},
          async get(){
            let value=get(key);
            if(this.field)value=Object.fromEntries(Object.entries(value||{}).filter(([,row])=>row[this.field]===this.filter));
            return{val:()=>value==null?null:structuredClone(value)};
          },
          async once(){return this.get();},
          async update(updates){
            if(window.__qaFail)throw new Error('simulated connection failure');
            window.__qaWrites.push(structuredClone(updates));
            Object.entries(updates).forEach(([p,value])=>{if(p.startsWith('pos-dev/'))put(p,value);});
          }
        })};
        window._fbFirstSync=true;window._fbConnected=true;
        for(const id of ['loading','auth-gate','version-overlay','offline-overlay']){const node=document.getElementById(id);if(node)node.style.display='none';}
        document.getElementById('app').style.display='block';
        vw='floor';render();
        at='t1';md='co2';coState={payMethod:'cash',splits:[{method:'cash',amount:65000}]};rModal();
      });
      await page.getByRole('button',{name:'会計終了を確定する',exact:false}).click();
      await page.waitForFunction(()=>!checkoutBusy&&!!S.tablePreparations.t1);
      assert.equal(await page.locator('.floor-table-card[data-tid="t1"] .table-preparation-status').innerText(),'会計終了済');
      assert.equal(await page.evaluate(()=>S.history[0].total),65000);
      assert.equal(await page.evaluate(()=>window.__qaWrites.length),1);
      await page.screenshot({path:path.join(output,name+'-floor.png'),fullPage:true});
      await page.evaluate(()=>{stab='tables';sv('settings');});
      assert.equal(await page.getByRole('button',{name:'会計終了済',exact:true}).isDisabled(),true);
      await page.screenshot({path:path.join(output,name+'-settings-pending.png'),fullPage:true});
      await page.evaluate(()=>sv('floor'));
      await page.locator('.floor-table-card[data-tid="t1"]').click();
      assert.equal(await page.getByRole('dialog').getByRole('heading').innerText(),'テーブル準備は完了していますか？');
      await page.screenshot({path:path.join(output,name+'-confirmation.png'),fullPage:true});
      await page.getByRole('button',{name:'いいえ',exact:true}).click();
      assert.deepEqual(alerts,['完了後にチェックイン可能です。']);
      assert.equal(await page.evaluate(()=>vw),'floor');
      assert.equal(await page.locator('.table-preparation-status').count(),1);
      await page.getByRole('button',{name:'リスト',exact:true}).click();
      assert.equal(await page.locator('#dz-tbl-t1 .table-preparation-status').innerText(),'会計終了済');
      await page.screenshot({path:path.join(output,name+'-list.png'),fullPage:true});
      const overflow=await page.locator('.table-preparation-status').evaluate(node=>node.scrollWidth>node.clientWidth+1);
      assert.equal(overflow,false);
      await page.locator('#dz-tbl-t1').click();
      await page.evaluate(()=>{window.__qaFail=true;});
      await page.getByRole('button',{name:'はい',exact:true}).click();
      await page.getByRole('alert').waitFor();
      assert.equal(await page.evaluate(()=>!!S.tablePreparations.t1),true);
      await page.evaluate(()=>{window.__qaFail=false;});
      await page.getByRole('button',{name:'はい',exact:true}).click();
      await page.waitForFunction(()=>!tablePreparationBusy&&!S.tablePreparations.t1);
      assert.equal(await page.evaluate(()=>vw),'floor');
      assert.equal(await page.locator('.table-preparation-status').count(),0);
      assert.ok((await page.locator('.floor-table-card[data-tid="t1"]').innerText()).includes('空席'));
      await page.getByRole('button',{name:'リスト',exact:true}).click();
      assert.ok((await page.locator('#dz-tbl-t1').innerText()).includes('空席'));
      assert.equal(await page.evaluate(()=>window.__qaWrites.length),2);
      assert.equal(await page.evaluate(()=>S.history[0].total),65000);
      await page.evaluate(()=>{stab='tables';sv('settings');window.__qaFail=true;});
      await page.locator('button[data-tid="t1"][onclick^="dta"]').click();
      await page.waitForFunction(()=>!tableDeleteBusy);
      assert.equal(await page.evaluate(()=>S.tables.some(t=>t.id==='t1')),true);
      await page.evaluate(()=>{window.__qaFail=false;});
      await page.locator('button[data-tid="t1"][onclick^="dta"]').click();
      await page.waitForFunction(()=>!tableDeleteBusy&&!S.tables.some(t=>t.id==='t1'));
      assert.equal(await page.evaluate(()=>S.history[0].total),65000);
      await page.screenshot({path:path.join(output,name+'-settings-deleted.png'),fullPage:true});
      await page.evaluate(()=>{
        window._fbFirstSync=false;initialPosSyncPending=new Set(['appVersion','sessions']);
        applyPosCoreValue(window._db,'appVersion','99.0');
        finishInitialPosSyncPath('sessions');
      });
      assert.equal(await page.locator('#version-overlay').isVisible(),true);
      assert.equal(await page.locator('#version-overlay').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(255, 255, 255)');
      assert.equal(await page.locator('#version-overlay').evaluate(node=>node.scrollWidth>node.clientWidth+1),false);
      assert.equal(await page.evaluate(()=>requireFirebaseReady({silent:true})),false);
      await page.screenshot({path:path.join(output,name+'-version-required.png'),fullPage:true});
      assert.deepEqual(errors,[]);
      console.log(name+': checkout, floor/list readiness, protected settings, failed/successful deletion, initial version lock: passed');
      await context.close();
    }
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
