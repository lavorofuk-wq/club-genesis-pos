// Usage: node scripts/check-settings-modal-ui.cjs <playwright module path> [output directory]
// Actual app on loopback, Firebase initializer removed, external requests and SW blocked.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.argv[2]||'playwright');
const root=path.resolve(__dirname,'..'),output=path.resolve(process.argv[3]||path.join(root,'.codex-artifacts','settings-modal-qa'));
async function fixture(page){
  await page.waitForFunction(()=>typeof getSettingsEditor==='function');
  await page.evaluate(()=>{
    S.activeBizDay=null;S.sessions={};S.tablePreparations={};S.shifts={};S.assignments={};S.history=[];
    S.casts=[{id:101,name:'確認キャスト',active:true,castType:'regular',registeredAt:1,sortIndex:0}];
    S.castLifecycleLogs={};S.tables=[{id:'t1',label:'テーブル 1',vip:false},{id:'t2',label:'テーブル 2',vip:false}];
    S.menus={sets:[{id:'s1',label:'確認セット',price:8000,minutes:60}],options:[{id:'sc',label:'シングルチャージ',price:2000}],drinks:[]};
    window.firebase={auth:()=>({currentUser:{uid:'qa-settings'}})};window.FB_ROOT='pos-dev';
    scopedAtomicValidationVersion=614400;tableChangeAtomicValidationVersion=614300;
    const db=structuredClone({activeBizDay:null,menus:S.menus,tables:S.tables,casts:S.casts,castLifecycleLogs:{},sessions:{},tablePreparations:{},shifts:{},assignments:{},history:{},_settingsRevisions:{menus:0,tables:0,castRoster:0}});
    window.__qaDatabase=db;window.__qaWrites=[];window.__qaAttempts=0;window.__qaFail=false;window.__qaHold=false;window.__qaRelease=null;
    const keys=p=>p.replace(/^pos-dev\//,'').split('/').filter(Boolean),get=p=>keys(p).reduce((node,key)=>node?.[key],db);
    const put=(p,value)=>{const parts=keys(p),last=parts.pop(),parent=parts.reduce((node,key)=>node[key]||(node[key]={}),db);if(value==null)delete parent[last];else parent[last]=structuredClone(value);};
    window._db={ref:key=>({
      orderByChild(field){this.field=field;return this;},equalTo(value){this.filter=value;return this;},
      async get(){let value=get(key);if(this.field)value=Object.fromEntries(Object.entries(value||{}).filter(([,row])=>row[this.field]===this.filter));const copy=value==null?null:structuredClone(value);return{val:()=>copy};},
      async once(){return this.get();},
      async update(updates){
        window.__qaAttempts++;if(window.__qaHold)await new Promise(resolve=>{window.__qaRelease=resolve;});
        if(window.__qaFail)throw Object.assign(new Error('simulated connection failure'),{code:'NETWORK_ERROR'});
        window.__qaWrites.push(structuredClone(updates));Object.entries(updates).forEach(([p,value])=>{if(p.startsWith('pos-dev/'))put(p,value);});
      }
    })};
    window._fbFirstSync=true;window._fbConnected=true;window._posNeedsReloadAfterDisconnect=false;
    for(const name of ['menus','tables','casts','castLifecycleLogs'])updateRemoteHash(name,db[name]);
    for(const id of ['loading','auth-gate','version-overlay','offline-overlay']){const el=document.getElementById(id);if(el)el.style.display='none';}
    document.getElementById('app').style.display='block';stab='menus';vw='settings';render();
  });
}
async function main(){
  fs.mkdirSync(output,{recursive:true});
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');
    let body=fs.readFileSync(file);
    if(path.basename(file)==='index.html')body=body.toString().replace(/<script src="firebase-init[^"]*"><\/script>/g,'').replace(/<link[^>]*https:[^>]*>/g,'');
    res.end(body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;let browser;
  try{
    browser=await chromium.launch({channel:'chrome',headless:true});
    for(const [name,width,height] of [['desktop',1440,1000],['tablet',768,1024],['mobile',390,844]]){
      const context=await browser.newContext({viewport:{width,height},hasTouch:width<=1024,timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
      await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
      await page.goto(origin);await fixture(page);
      const edit=()=>page.locator('[data-kind="menu"][data-category="sets"][data-id="s1"][data-action="edit"]');
      const dialog=()=>page.locator('#settings-editor-dialog'),submit=()=>dialog().locator('button[type="submit"]'),field=name=>page.locator('#settings-field-'+name);
      await edit().click();await field('price').fill('9000');
      assert.equal(await page.evaluate(()=>S.menus.sets[0].price),8000,'typing must not change business prices');
      await field('minutes').fill('0');await submit().click();assert.equal(await field('minutes').getAttribute('aria-invalid'),'true');
      assert.equal(await page.evaluate(()=>window.__qaAttempts),0,'validation must not write');
      await field('minutes').fill('60');await page.evaluate(()=>{window.__qaHold=true;window.__qaFail=true;});await submit().click();
      await page.waitForFunction(()=>window.__qaRelease!==null);
      assert.equal(await dialog().getAttribute('aria-busy'),'true');assert.equal(await dialog().getByRole('button',{name:'閉じる',exact:true}).isDisabled(),true);
      await page.evaluate(()=>{settingsSubmit();settingsClose();});assert.equal(await dialog().count(),1);
      assert.equal(await page.evaluate(()=>window.__qaAttempts),1,'duplicate submit must not write');
      assert.equal(await page.evaluate(()=>S.menus.sets[0].price),8000,'pending save must not change business prices');
      await page.evaluate(()=>{window.__qaHold=false;window.__qaRelease();});await page.getByRole('alert').waitFor();
      assert.equal(await field('price').inputValue(),'9000');assert.equal(await page.evaluate(()=>S.menus.sets[0].price),8000);
      await page.screenshot({path:path.join(output,name+'-save-failed.png'),fullPage:true});
      await page.evaluate(()=>{window.__qaFail=false;});await submit().click();await dialog().waitFor({state:'hidden'});
      assert.equal(await page.evaluate(()=>S.menus.sets[0].price),9000);assert.equal(await page.evaluate(()=>window.__qaWrites.length),1);
      await edit().click();await field('price').fill('9500');
      await page.evaluate(()=>{window.__qaDatabase.menus.sets[0].price=9100;window.__qaDatabase._settingsRevisions.menus++;});
      await submit().click();await page.getByRole('region',{name:'他端末との変更内容の比較'}).waitFor();
      assert.equal(await page.evaluate(()=>window.__qaWrites.length),1);
      assert.ok((await page.locator('.se-diff').innerText()).includes('9100'));assert.ok((await page.locator('.se-diff').innerText()).includes('9500'));
      await page.screenshot({path:path.join(output,name+'-conflict.png'),fullPage:true});
      await page.getByRole('button',{name:'入力内容で保存を再試行',exact:true}).click();await dialog().waitFor({state:'hidden'});
      assert.equal(await page.evaluate(()=>S.menus.sets[0].price),9500);
      await edit().click();await field('price').fill('9700');await page.evaluate(()=>handlePosSyncRender(true));
      assert.equal(await page.evaluate(()=>vw),'settings','pre-opening sync must keep settings visible');assert.equal(await field('price').inputValue(),'9700');
      await page.reload();await fixture(page);
      await page.getByRole('button',{name:'編集を再開',exact:true}).click();assert.equal(await field('price').inputValue(),'9700');
      await dialog().getByRole('button',{name:'閉じる',exact:true}).click();await page.getByRole('button',{name:'破棄',exact:true}).click();
      await page.getByRole('button',{name:'テーブル',exact:true}).click();
      await page.locator('[data-kind="table"][data-id="t1"][data-action="edit"]').click();await field('label').fill('改装テーブル');
      await page.locator('[data-settings-field="vip"]').check();await submit().click();await dialog().waitFor({state:'hidden'});
      assert.equal(await page.evaluate(()=>S.tables[0].label),'改装テーブル');assert.equal(await page.evaluate(()=>S.tables[0].vip),true);
      await page.evaluate(()=>{S.tablePreparations.t1={tableId:'t1'};render();});
      assert.equal(await page.locator('[data-kind="table"][data-id="t1"][data-action="delete"]').isDisabled(),true);
      await page.getByRole('button',{name:'キャスト',exact:true}).click();await page.getByRole('button',{name:'入店登録',exact:true}).click();
      await field('name').fill('追加キャスト');await page.evaluate(()=>{window.__qaFail=true;});await submit().click();await page.getByRole('alert').waitFor();
      assert.equal(await page.evaluate(()=>S.casts.length),1,'failed registration must not change roster');
      await page.evaluate(()=>{window.__qaFail=false;});await submit().click();await dialog().waitFor({state:'hidden'});
      assert.equal(await page.evaluate(()=>S.casts.length),2);assert.equal(await page.evaluate(()=>S.casts[1].name),'追加キャスト');
      await page.screenshot({path:path.join(output,name+'-settings.png'),fullPage:true});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'settings must fit viewport');
      assert.deepEqual(errors,[]);console.log(name+': validation, pending/failed/successful save, conflict, draft reload, table edit, protected deletion, cast add passed');
      await context.close();
    }
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
