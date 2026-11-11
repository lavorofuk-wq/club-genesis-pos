// Usage: node scripts/check-app-update-ui.cjs <playwright module path> [output directory]
// Real app on loopback with synthetic state. Firebase boot, external requests,
// service workers and persistence are blocked; update notifications are simulated.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.argv[2]||'playwright');
const root=path.resolve(__dirname,'..'),output=path.resolve(process.argv[3]||path.join(root,'.codex-artifacts','app-update-ui'));
async function fixture(page){
  await page.waitForFunction(()=>typeof finishInitialPosSyncPath==='function'&&typeof handleServiceWorkerUpdate==='function');
  await page.evaluate(()=>{
    window._posRole='op';window._posUid='qa-update';window.FB_ROOT='pos-dev';window.BACKUP_ROOT='backup-dev';
    window.firebase={auth:()=>({currentUser:{uid:'qa-update'}})};
    window.__qaDatabaseCalls=0;window.__qaStorageWrites=[];
    window._db={ref(){window.__qaDatabaseCalls++;throw new Error('UI update checks must not access the database');}};
    const originalSetItem=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){window.__qaStorageWrites.push(String(key));return originalSetItem.call(this,key,value);};
    window._fbReady=true;window._fbFirstSync=false;window._fbConnected=true;
    window._posNeedsReloadAfterDisconnect=false;window._posWriteLocked=false;window._posVersionCheckFailed=false;
    window._posServerAppVersion=APP_VERSION;window._posServiceWorkerVersion=null;
    S.activeBizDay=null;S.sessions={};S.tablePreparations={};S.history=[];S.shifts={};S.assignments={};
    S.bizDays={};S.bizDaySummaries={};S.backups={};S.castLifecycleLogs={};S.config={};S.loMode=false;S.loStatus={};
    S.casts=[];S.tables=[{id:'t1',label:'QA テーブル'}];
    S.menus=normalizeMenus({sets:[{id:'s1',label:'QA セット',price:8000,minutes:60}]});
    for(const id of ['auth-gate','version-overlay','offline-overlay','floor-order-modal'])document.getElementById(id).style.display='none';
    document.getElementById('app').style.display='block';document.getElementById('loading').style.display='flex';
    document.body.style.overflow='auto';vw='home';at=null;md=null;checkoutBusy=false;
    initialPosSyncPending=new Set(['appVersion','sessions']);window.__qaBusiness=JSON.stringify(S);
  });
}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,40))));}
async function assertNoModal(page,label){
  await settle(page);
  assert.equal(await page.evaluate(()=>md),null,label+' has no automatic modal');
  assert.equal((await page.locator('#md').innerHTML()).trim(),'',label+' leaves the modal host empty');
  assert.notEqual(await page.evaluate(()=>getComputedStyle(document.body).overflow),'hidden',label+' leaves page scrolling enabled');
}
async function main(){
  fs.mkdirSync(output,{recursive:true});
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');
    res.setHeader('Cache-Control','no-store');let content=fs.readFileSync(file);
    if(path.basename(file)==='index.html')content=content.toString().replace(/<script src="firebase-init[^"]*"><\/script>/g,'').replace(/<link[^>]*https:[^>]*>/g,'');
    res.end(content);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;let browser;
  try{
    browser=await chromium.launch({channel:'chrome',headless:true});
    for(const [name,width,height] of [['desktop',1440,1000],['tablet',768,1024],['mobile',390,844],['small',320,568]]){
      const context=await browser.newContext({viewport:{width,height},hasTouch:width<=1024,timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
      await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
      const page=await context.newPage(),errors=[],failedAssets=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('console',message=>{if(message.type()==='error'&&message.text().startsWith('render error:'))errors.push(message.text());});
      page.on('response',response=>{if(response.status()>=400&&new URL(response.url()).origin===origin)failedAssets.push(response.url());});
      await page.goto(origin);await fixture(page);
      await assertNoModal(page,'before initial sync');
      await page.evaluate(()=>finishInitialPosSyncPath('appVersion'));
      assert.equal(await page.evaluate(()=>window._fbFirstSync),false,'wait for all initial paths');
      await page.evaluate(()=>finishInitialPosSyncPath('sessions'));
      assert.equal(await page.evaluate(()=>window._fbFirstSync),true);
      assert.equal(await page.locator('#loading').isVisible(),false);
      assert.equal(await page.evaluate(()=>vw),'home');await assertNoModal(page,'after initial sync');
      const version=await page.evaluate(()=>APP_VERSION),next=version.split('.');next[next.length-1]=String(Number(next.at(-1))+1);
      const versionNode=page.locator('#app-version');
      assert.equal(await versionNode.innerText(),'Ver'+version);
      assert.deepEqual(await versionNode.evaluate(el=>({tag:el.tagName,click:el.getAttribute('onclick'),role:el.getAttribute('role'),tabIndex:el.tabIndex})),{tag:'SPAN',click:null,role:null,tabIndex:-1},'version is a noninteractive label');
      await versionNode.click();await assertNoModal(page,'version click');
      await page.evaluate(()=>{render();window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
      await assertNoModal(page,'render and page activation');
      await page.evaluate(()=>om('sessionConflict'));assert.equal(await page.evaluate(()=>md),'sessionConflict');
      assert.match(await page.locator('#md').innerText(),/保存を停止しました/);
      await page.evaluate(()=>closeM());await assertNoModal(page,'closing a business dialog');
      await page.screenshot({path:path.join(output,name+'-home.png'),fullPage:true});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'home fits '+name);
      assert.deepEqual(await page.evaluate(()=>({state:JSON.stringify(S)===window.__qaBusiness,reads:window.__qaDatabaseCalls,storage:window.__qaStorageWrites})),{state:true,reads:0,storage:[]},'sync/render/dialog checks do not mutate business data or storage');
      assert.equal(await page.evaluate(version=>handleServiceWorkerUpdate({type:'SW_UPDATED',version}),version),false,'same worker version is ignored');
      assert.equal(await page.evaluate(()=>handleServiceWorkerUpdate({type:'SW_UPDATED',version:'invalid'})),false);
      assert.equal(await page.locator('#version-overlay').isVisible(),false);
      await page.evaluate(nextVersion=>{window._fbFirstSync=false;handleServiceWorkerUpdate({type:'SW_UPDATED',version:nextVersion});},next.join('.'));
      assert.equal(await page.locator('#version-overlay').isVisible(),false,'worker update waits for initial synchronization');
      await page.evaluate(()=>{initialPosSyncPending=new Set(['appVersion']);finishInitialPosSyncPath('appVersion');});
      assert.equal(await page.locator('#version-overlay').isVisible(),true,'new worker still blocks the old client after sync');
      assert.equal(await page.evaluate(()=>requireFirebaseReady({silent:true})),false,'old client cannot write');
      assert.equal(await page.locator('#version-overlay button').isVisible(),true,'reload remains reachable');
      await page.screenshot({path:path.join(output,name+'-update-required.png'),fullPage:true});
      await page.reload();await fixture(page);
      await page.evaluate(nextVersion=>{rememberServerAppVersion(nextVersion);finishInitialPosSyncPath('appVersion');finishInitialPosSyncPath('sessions');},next.join('.'));
      assert.equal(await page.locator('#version-overlay').isVisible(),true,'server version independently requires reload');
      assert.equal(await page.evaluate(()=>requireFirebaseReady({silent:true})),false);
      assert.equal(await page.evaluate(()=>window.__qaDatabaseCalls),0);
      assert.deepEqual(errors,[],name+' has no browser exceptions');assert.deepEqual(failedAssets,[],name+' has no missing local assets');
      console.log(name+': static version, initial sync, modal closure, focus, data safety and worker/server update lock passed');
      await context.close();
    }
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
