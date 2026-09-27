// Usage: node scripts/check-release-notes-ui.cjs <playwright module path> [output directory]
// Runs the actual app on loopback. Firebase initialization, external requests and SW are blocked.
// Synthetic app versions are served from memory; source files and business data are never changed.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.argv[2]||'playwright');
const root=path.resolve(__dirname,'..'),output=path.resolve(process.argv[3]||path.join(root,'.codex-artifacts','release-notes-inbox-qa'));
async function fixture(page,{uid='qa-release',scope='pos-dev',ready=true}={}){
  await page.waitForFunction(()=>typeof maybeShowReleaseNotes==='function'&&!!window.PosReleaseNotes);
  await page.evaluate(({uid,scope,ready})=>{
    window.__qaIdentity=uid;window.FB_ROOT=scope;
    window.firebase={auth:()=>({currentUser:window.__qaIdentity?{uid:window.__qaIdentity}:null})};
    window.__qaDatabaseCalls=0;window.__qaSeenWrites=[];
    const originalSetItem=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){if(String(key).startsWith('genesis_release_notes_seen_v1:'))window.__qaSeenWrites.push({key,value});return originalSetItem.call(this,key,value);};
    window._db={ref(){window.__qaDatabaseCalls++;throw new Error('Release notes must not access the database');}};
    window._fbReady=true;window._fbFirstSync=ready;window._fbConnected=ready;window._posNeedsReloadAfterDisconnect=false;
    window._posWriteLocked=false;window._posVersionCheckFailed=false;window._posServerAppVersion=APP_VERSION;
    S.activeBizDay=null;S.sessions={};S.tablePreparations={};S.shifts={};S.assignments={};S.history=[];
    S.casts=[{id:101,name:'確認キャスト',active:true,castType:'regular',registeredAt:1,sortIndex:0}];
    S.castLifecycleLogs={};S.tables=[{id:'t1',label:'テーブル 1',vip:false}];
    S.menus=normalizeMenus({sets:[{id:'s1',label:'確認セット',price:8000,minutes:60}],options:[{id:'sc',label:'シングルチャージ',price:2000}]});
    for(const id of ['loading','auth-gate','version-overlay','offline-overlay']){const el=document.getElementById(id);if(el)el.style.display='none';}
    document.getElementById('app').style.display='block';document.body.style.overflow='auto';
    vw='home';at=null;md=null;checkoutBusy=false;
    window.__qaBusiness=JSON.stringify(S);render();
  },{uid,scope,ready});
}
async function main(){
  fs.mkdirSync(output,{recursive:true});
  const baseVersion=fs.readFileSync(path.join(root,'app.js'),'utf8').match(/const APP_VERSION=["']([^"']+)["']/)[1];
  const versionParts=baseVersion.split('.');versionParts[versionParts.length-1]=String(Number(versionParts.at(-1))+1);
  const nextVersion=versionParts.join('.');let servedVersion=baseVersion;
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');
    res.setHeader('Cache-Control','no-store');
    let body=fs.readFileSync(file);
    if(path.basename(file)==='index.html')body=body.toString().replace(/<script src="firebase-init[^"]*"><\/script>/g,'').replace(/<link[^>]*https:[^>]*>/g,'');
    if(['app.js','release-notes.js','index.html'].includes(path.basename(file)))body=body.toString().split(baseVersion).join(servedVersion);
    res.end(body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;let browser;
  try{
    browser=await chromium.launch({channel:'chrome',headless:true});
    for(const [name,width,height] of [['desktop',1440,1000],['tablet',768,1024],['mobile',390,844],['landscape-short',844,390],['mobile-short',390,568]]){
      servedVersion=baseVersion;
      const context=await browser.newContext({viewport:{width,height},hasTouch:width<=1024,timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
      await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
      const dialog=()=>page.locator('#release-notes-dialog');
      const acknowledge=()=>dialog().locator('[data-release-notes-action="acknowledge"]');
      const headerVersion=()=>page.locator('#release-notes-button');
      const unseen=async label=>assert.equal(await dialog().count(),0,label);
      const seenRecord=()=>page.evaluate(()=>JSON.parse(localStorage.getItem(PosReleaseNotes.storageKey(FB_ROOT+':'+window.__qaIdentity))));
      const unchanged=async()=>{assert.equal(await page.evaluate(()=>JSON.stringify(S)===window.__qaBusiness),true,'release notes must not change business data');assert.equal(await page.evaluate(()=>window.__qaDatabaseCalls),0,'release notes must not read/write Firebase');};
      const detail=()=>dialog().locator('.rn-content .rn-entry');
      const tab=view=>dialog().locator('[data-release-notes-view="'+view+'"]');
      const entryData=version=>page.evaluate(version=>PosReleaseNotes.history.find(entry=>entry.version===version),version);
      async function assertDetail(entry){
        assert.equal(await detail().count(),1,'render only the selected entry');
        assert.equal((await detail().locator('h3').innerText()).trim(),entry.title);
        assert.ok((await detail().locator('.rn-version').innerText()).includes(entry.version));
        assert.deepEqual((await detail().locator('.rn-changes li').allTextContents()).map(text=>text.trim()),entry.changes);
      }
      async function selectVersion(version){
        const entry=await entryData(version),item=dialog().locator('.rn-list-button').filter({hasText:entry.title});
        assert.equal(await item.count(),1,'list contains the selected release');
        const index=await item.getAttribute('data-release-notes-entry');
        if(width<=700){
          assert.equal(await dialog().locator('.rn-sidebar').isVisible(),false);
          await dialog().locator('#release-notes-select').focus();await dialog().locator('#release-notes-select').selectOption(index);
          assert.equal(await dialog().locator('#release-notes-select').evaluate(el=>el===document.activeElement),true,'mobile selection retains focus');
        }else{
          assert.equal(await dialog().locator('.rn-mobile-picker').isVisible(),false);
          await item.click();
          assert.equal(await dialog().locator('.rn-list-button[aria-current="true"]').evaluate(el=>el===document.activeElement),true,'list selection retains focus');
        }
        assert.equal(await dialog().locator('.rn-list-button[aria-current="true"]').count(),1);
        await assertDetail(entry);
        assert.equal(await dialog().locator('.rn-content').evaluate(el=>el.scrollTop),0,'switching entries resets detail scroll');
      }
      async function assertGeometry(){
        const result=await dialog().evaluate(el=>{
          const rect=node=>{const b=node.getBoundingClientRect();return{x:b.x,y:b.y,right:b.right,bottom:b.bottom};};
          const content=el.querySelector('.rn-content');
          return{dialog:rect(el),confirm:rect(el.querySelector('.rn-confirm')),close:rect(el.querySelector('[data-release-notes-action="dismiss"]')),contentHeight:content.clientHeight,overflow:content.scrollWidth>content.clientWidth+1};
        });
        for(const key of ['dialog','confirm','close']){const b=result[key];assert.ok(b.x>=-1&&b.y>=-1&&b.right<=width+1&&b.bottom<=height+1,key+' fits '+name);}
        assert.ok(result.contentHeight>=40,'detail keeps a usable scroll area');
        assert.equal(result.overflow,false,'detail fits horizontally');
      }
      async function assertFocusLoop(){
        const controls=dialog().locator('button:visible:not(:disabled), select:visible:not(:disabled), [tabindex="0"]:visible');
        const count=await controls.count();assert.ok(count>=4);await controls.first().focus();
        for(let i=1;i<count;i++){await page.keyboard.press('Tab');assert.equal(await controls.nth(i).evaluate(el=>el===document.activeElement),true,'Tab reaches visible control '+i);}
        await page.keyboard.press('Tab');assert.equal(await controls.first().evaluate(el=>el===document.activeElement),true,'Tab wraps to first visible control');
        await page.keyboard.press('Shift+Tab');assert.equal(await controls.last().evaluate(el=>el===document.activeElement),true,'Shift+Tab wraps to last visible control');
      }
      await page.goto(origin);await fixture(page,{uid:null,ready:false});
      await page.evaluate(()=>maybeShowReleaseNotes());await unseen('not before authentication');
      await page.evaluate(()=>{window.__qaIdentity='qa-release';window._fbConnected=true;maybeShowReleaseNotes();});await unseen('not before initial sync');
      await page.evaluate(()=>{window._fbFirstSync=true;window._fbConnected=false;maybeShowReleaseNotes();});await unseen('not while offline');
      await page.evaluate(()=>{window._fbConnected=true;vw='settings';render();maybeShowReleaseNotes();});await unseen('settings is not a safe automatic display point');
      await page.evaluate(()=>{vw='home';checkoutBusy=true;render();maybeShowReleaseNotes();});await unseen('not during checkout');
      await page.evaluate(()=>{checkoutBusy=false;md='opsMenu';rModal();maybeShowReleaseNotes();});await unseen('do not replace another modal');
      assert.equal(await page.evaluate(()=>md),'opsMenu');
      await page.evaluate(()=>{vw='settings';closeM();sv('home');});
      await dialog().waitFor();assert.ok((await dialog().innerText()).includes(baseVersion));
      assert.equal(await dialog().getAttribute('aria-modal'),'true');
      await page.waitForFunction(()=>document.getElementById('release-notes-dialog').contains(document.activeElement));
      assert.equal(await page.evaluate(()=>getComputedStyle(document.body).overflow),'hidden','lock background scrolling');
      await assertGeometry();await assertFocusLoop();await assertDetail(await entryData(baseVersion));
      assert.equal(await tab('updates').getAttribute('aria-pressed'),'true');
      assert.equal(await dialog().locator('.rn-list-button').count(),1,'first launch starts with the current update only');
      assert.equal(await dialog().locator('#release-notes-select option').count(),1);
      await page.screenshot({path:path.join(output,name+'-initial.png'),fullPage:true});

      await tab('history').click();assert.equal(await tab('history').getAttribute('aria-pressed'),'true');
      const historyCount=await page.evaluate(()=>PosReleaseNotes.history.filter(entry=>PosReleaseNotes.compareVersions(entry.version,APP_VERSION)<=0).length);
      assert.equal(await dialog().locator('.rn-list-button').count(),historyCount,'history exposes all releases through the current version');
      assert.equal(await dialog().locator('#release-notes-select option').count(),historyCount);
      if(name==='desktop')await page.screenshot({path:path.join(output,'desktop-overview.png'),fullPage:true});
      await assertFocusLoop();await selectVersion('6.152.1');
      await page.screenshot({path:path.join(output,name+'-history.png'),fullPage:true});
      const canScroll=await dialog().locator('.rn-content').evaluate(el=>el.scrollHeight>el.clientHeight+1);
      if(canScroll){await dialog().locator('.rn-content').focus();await page.keyboard.press('ArrowDown');await page.waitForFunction(()=>document.querySelector('#release-notes-dialog .rn-content').scrollTop>0);}
      const scroll=await dialog().locator('.rn-content').evaluate(el=>{el.scrollTop=el.scrollHeight;return{needed:el.scrollHeight>el.clientHeight+1,moved:el.scrollTop>0};});
      if(height<=568)assert.equal(scroll.needed,true,'long selected note scrolls on short screens');
      if(scroll.needed)assert.equal(scroll.moved,true);
      await assertGeometry();await page.screenshot({path:path.join(output,name+'-history-bottom.png'),fullPage:true});
      await selectVersion('6.152');await tab('updates').click();await assertDetail(await entryData(baseVersion));
      assert.equal(await dialog().locator('.rn-list-button').count(),1);
      await tab('history').click();await selectVersion('6.152.1');
      assert.equal(await seenRecord(),null,'view and selection changes must not acknowledge');
      assert.equal(await page.evaluate(()=>window.__qaSeenWrites.length),0,'navigation must not write the seen record');
      assert.equal(await acknowledge().isVisible(),true);
      await page.evaluate(()=>{window._fbConnected=false;document.getElementById('offline-overlay').style.display='flex';});
      await page.keyboard.press('Escape');assert.equal(await dialog().count(),1,'offline overlay suppresses release note keyboard handling');
      assert.equal(await seenRecord(),null,'blocked Escape must not acknowledge the notes');
      await page.evaluate(()=>{window._fbConnected=true;document.getElementById('offline-overlay').style.display='none';});
      await acknowledge().click();await dialog().waitFor({state:'hidden'});
      assert.equal((await seenRecord()).version,baseVersion,'acknowledging an older selected note records the opened current version');
      assert.equal(await page.evaluate(()=>window.__qaSeenWrites.length),1);
      assert.equal(await page.evaluate(()=>getComputedStyle(document.body).overflow),'auto','restore prior scrolling');
      await page.evaluate(()=>maybeShowReleaseNotes());await unseen('do not repeat acknowledged version');await unchanged();

      await page.reload();await fixture(page);await page.evaluate(()=>maybeShowReleaseNotes());await unseen('acknowledgement survives reload');
      assert.equal(await headerVersion().count(),1,'header exposes one version button');
      await headerVersion().click();await dialog().waitFor();await page.keyboard.press('Escape');await dialog().waitFor({state:'hidden'});
      assert.equal(await headerVersion().evaluate(el=>el===document.activeElement),true,'return focus to version button');
      assert.equal((await seenRecord()).version,baseVersion);
      await headerVersion().click();await dialog().waitFor();
      assert.equal(await tab('history').getAttribute('aria-pressed'),'true','manual open starts in history');
      assert.equal(await dialog().locator('.rn-list-button').count(),historyCount);
      const storedBeforeNavigation=await seenRecord();await selectVersion('6.152');await assertGeometry();
      assert.deepEqual(await seenRecord(),storedBeforeNavigation,'history navigation does not rewrite acknowledgement');
      await page.screenshot({path:path.join(output,name+'-manual.png'),fullPage:true});
      await dialog().locator('[data-release-notes-action="dismiss"]').click();await dialog().waitFor({state:'hidden'});
      await unchanged();

      await page.reload();await fixture(page,{uid:'qa-release-other'});await page.evaluate(()=>maybeShowReleaseNotes());await dialog().waitFor();
      await acknowledge().click();assert.equal((await seenRecord()).version,baseVersion);await unchanged();
      await page.reload();await fixture(page,{scope:'pos'});await page.evaluate(()=>maybeShowReleaseNotes());await dialog().waitFor();
      await acknowledge().click();assert.equal((await seenRecord()).version,baseVersion);await unchanged();
      await page.reload();await fixture(page);await page.evaluate(()=>maybeShowReleaseNotes());await unseen('original user and scope stay acknowledged');

      servedVersion=nextVersion;await page.reload();await fixture(page);await page.evaluate(()=>maybeShowReleaseNotes());await dialog().waitFor();
      assert.ok((await dialog().innerText()).includes(nextVersion),'new version displays new notes');
      await page.keyboard.press('Escape');await dialog().waitFor({state:'hidden'});assert.equal((await seenRecord()).version,nextVersion);
      await page.reload();await fixture(page);await page.evaluate(()=>maybeShowReleaseNotes());await unseen('Escape persists acknowledgement for updated version');
      await unchanged();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'page fits viewport');
      assert.deepEqual(errors,[]);
      console.log(name+': initial display, auth/sync/offline/checkout/modal deferral, scope/user/version isolation, reload, manual reopen, list/select detail navigation, acknowledgement boundaries, Escape, visible focus loop and short-screen scrolling passed');
      await context.close();
    }
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
