// Usage: node scripts/check-access-ui.cjs <playwright module path> [output directory]
// Serves the real app on loopback with Firebase initialization removed. All data is synthetic,
// external requests and service workers are blocked, and account writes update only an in-memory mock.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.argv[2]||'playwright');
const root=path.resolve(__dirname,'..'),output=path.resolve(process.argv[3]||path.join(root,'.codex-artifacts','access-ui-qa'));
const allowedNav={cashier:['nf','nli','nsh','ns'],list:['nli','nsh'],op:['nf','nli','nsh','nh','nan','ns','nm']};
async function fixture(page,role){
  await page.waitForFunction(()=>typeof rAccountAccess==='function'&&typeof render==='function'&&!!window.PosAccess);
  await page.evaluate(role=>{
    window._posRole=role;window._posUid='qa-'+role;window.FB_ROOT='pos-dev';window.BACKUP_ROOT='backup-dev';
    window.firebase={auth:()=>({currentUser:{uid:window._posUid}})};
    window.__qaAccess={authorizedUsers:{'qa-op':true,'qa-cashier':true,'qa-list':true},roles:{'qa-op':'op','qa-cashier':'cashier','qa-list':'list'}};
    window.__qaReads=[];window.__qaWrites=[];
    window._db={ref(key){
      if(key!=='access')throw new Error('Unexpected QA database path: '+key);
      return {
        async get(){window.__qaReads.push(key);return{val:()=>JSON.parse(JSON.stringify(window.__qaAccess))};},
        async update(values){
          window.__qaWrites.push({key,values:JSON.parse(JSON.stringify(values))});
          for(const [entry,value] of Object.entries(values)){const [group,uid]=entry.split('/');window.__qaAccess[group][uid]=value;}
        }
      };
    }};
    window._fbReady=true;window._fbFirstSync=true;window._fbConnected=true;
    window._posNeedsReloadAfterDisconnect=false;window._posWriteLocked=false;window._posVersionCheckFailed=false;window._posServerAppVersion=APP_VERSION;
    // Release-note behavior has its own UI suite. Keep its automatic dialog out of this permission fixture.
    scheduleReleaseNotes=function(){};
    const time=Date.now(),past=time-7200000;
    S.activeBizDay='2026-10-02';S.bizDays={'2026-10-02':{date:'2026-10-02',startedAt:time-3600000}};
    S.tables=[{id:'t1',label:'QA 卓 1',vip:false},{id:'t2',label:'QA 卓 2',vip:false}];
    S.casts=[{id:101,name:'QA キャスト',active:true,castType:'regular',registeredAt:1,sortIndex:0}];
    S.menus=normalizeMenus({sets:[{id:'s1',label:'QA セット',price:8000,minutes:60}],options:[{id:'sc',label:'シングルチャージ',price:2000}]});
    S.sessions={t1:{tableId:'t1',startTime:time-1800000,setEndTime:time+1800000,guests:1,items:[{id:'s1',label:'QA セット',price:8000,qty:1,isSet:true}],honShimeis:[],banaiShimeis:[],note:'QA 営業中'}};
    S.history=[{id:past,tableId:'t2',startTime:past,endTime:past+1800000,guests:2,total:9876543,subtotal:8000,items:[],note:'QA 過去明細'}];
    S.assignments={a1:{id:'a1',castId:101,castName:'QA キャスト',tableId:'t2',type:'free',startTime:past,endTime:past+1200000,sessionId:past}};
    S.shifts={sh1:{id:'sh1',castId:101,castName:'QA キャスト',clockIn:time-3600000,clockOut:null,status:'waiting',statusLog:[]}};
    S.tablePreparations={};S.castLifecycleLogs={};S.bizDaySummaries={};S.backups={};S.config={};S.loMode=false;S.loStatus={};
    clearAccountAccessState();sessionStorage.removeItem('genesis_admin');
    for(const id of ['loading','auth-gate','version-overlay','offline-overlay','floor-order-modal'])document.getElementById(id).style.display='none';
    document.getElementById('app').style.display='block';document.body.style.overflow='auto';
    vw='home';at=null;md=null;checkoutBusy=false;window.__qaBusiness=JSON.stringify(S);render();
  },role);
}
async function main(){
  fs.mkdirSync(output,{recursive:true});
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');
    res.setHeader('Cache-Control','no-store');let body=fs.readFileSync(file);
    if(path.basename(file)==='index.html')body=body.toString().replace(/<script src="firebase-init[^"]*"><\/script>/g,'').replace(/<link[^>]*https:[^>]*>/g,'');
    res.end(body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;let browser;
  try{
    browser=await chromium.launch({channel:'chrome',headless:true});
    for(const [size,width,height] of [['desktop',1440,1000],['mobile',390,844]])for(const role of ['cashier','list','op']){
      const context=await browser.newContext({viewport:{width,height},hasTouch:size==='mobile',timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
      await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('console',message=>{if(message.type()==='error'&&message.text().startsWith('render error:'))errors.push(message.text());});
      await page.goto(origin);await fixture(page,role);
      assert.deepEqual(await page.locator('#main-nav button:visible').evaluateAll(nodes=>nodes.map(node=>node.id)),allowedNav[role],role+' visible navigation');
      assert.equal(await page.locator('#account-access-btn').isVisible(),role==='op');
      assert.equal(await page.locator('#mgmt-btn').isVisible(),role==='op');
      assert.equal(await page.locator('#ops-btn').isVisible(),role!=='list');
      const home=await page.locator('#m').innerText();
      if(role!=='op'){
        assert.ok(!/会計済み|未収|合計見込み|過去の営業履歴|営業終了|9,876,543/.test(home),'restricted home excludes sales and OP actions');
        assert.deepEqual(await page.locator('.access-home-tabs button').allTextContents(),role==='cashier'?['フロア','リスト','設定','出勤']:['リスト','出勤']);
      }else assert.match(home,/会計済み/);
      await page.screenshot({path:path.join(output,size+'-'+role+'-home.png'),fullPage:true});
      for(const view of role==='cashier'?['history','analysis','admin','histlog','backupDetail','accounts']:role==='list'?['floor','settings','history','analysis','admin','histlog','backupDetail','accounts']:[]){
        await page.evaluate(view=>sv(view),view);assert.equal(await page.evaluate(()=>vw),'home','sv denies '+role+': '+view);
        await page.evaluate(view=>{vw=view;render();},view);
        assert.equal(await page.evaluate(()=>posCanView(vw)),true,'render redirects forbidden direct view');
        await page.evaluate(()=>sv('home'));
      }
      if(role!=='op'){
        const denied=['mgmtMenu','endBizDay','viewHistDetail','deleteSession','anaDateSel','restore-conflicts','loadBizDayConfirm_2026-09-01'];
        if(role==='list')denied.push('startBizDay','settingsEditor','co','co2','opsMenu','ci-guests','est');
        for(const name of denied){
          await page.evaluate(name=>{at='t1';md=name;rModal();},name);
          assert.equal(await page.evaluate(()=>md),null,role+' direct modal denied: '+name);
          assert.equal((await page.locator('#md').innerHTML()).trim(),'');
          await page.evaluate(name=>om(name),name);assert.equal(await page.evaluate(()=>md),null,role+' om denied: '+name);
        }
        await page.evaluate(()=>{at=null;sessionStorage.setItem('genesis_admin','1');updateNav();});
        assert.equal(await page.locator('#nm').isVisible(),false,'sessionStorage admin flag cannot expose management tab');
        await page.evaluate(()=>{sessionStorage.removeItem('genesis_admin');sv('assignHistory');});
        assert.match(await page.locator('#m').innerText(),/付け回し履歴/);
        assert.equal(await page.locator('#m [data-hrid]').count(),0,'list history cannot open invoice details');
        await page.evaluate(()=>sv('tableDetail','t1'));assert.equal(await page.evaluate(()=>vw),'tableDetail');
        assert.match(await page.locator('#m').innerText(),/付ける/);
        await page.evaluate(()=>{openShiftMd('in');});assert.equal(await page.evaluate(()=>md),'shift');
        assert.ok((await page.locator('#md').innerText()).length>0);await page.evaluate(()=>closeM());
        if(role==='list'){
          await page.evaluate(()=>openFloorDetail('t1'));assert.equal(await page.locator('#floor-order-modal').isVisible(),false);
          await page.evaluate(()=>openCheckinWizard('t2'));assert.equal(await page.evaluate(()=>md),null);
        }else{
          await page.evaluate(()=>{sv('settings');});assert.match(await page.locator('#m').innerText(),/設定/);
          await page.evaluate(()=>{sv('floor');openFloorDetail('t1');});assert.equal(await page.locator('#floor-order-modal').isVisible(),true);
          await page.evaluate(()=>closeFloorDetail());
        }
        assert.deepEqual(await page.evaluate(()=>window.__qaReads),[],'restricted browsing performs no private account reads');
        assert.deepEqual(await page.evaluate(()=>window.__qaWrites),[]);
      }else{
        await page.locator('#account-access-btn').click();await page.locator('.aa-list').waitFor();
        assert.equal(await page.evaluate(()=>vw),'accounts');assert.match(await page.locator('#m').innerText(),/アカウント権限/);
        assert.deepEqual(await page.evaluate(()=>window.__qaReads),['access']);
        assert.equal(await page.locator('.aa-actions [data-uid="qa-op"]').count(),0,'self has no edit/revoke actions');
        await page.evaluate(()=>window.scrollTo(0,0));
        await page.screenshot({path:path.join(output,size+'-op-accounts.png'),fullPage:true});
        await page.locator('#account-access-uid').fill('qa-new-list');await page.locator('#account-access-role').selectOption('list');
        await page.locator('.aa-card button[type="submit"]').click();await page.waitForFunction(()=>window.__qaWrites.length===1&&!accountAccessState.saving);
        assert.deepEqual(await page.evaluate(()=>window.__qaWrites[0]),{key:'access',values:{'authorizedUsers/qa-new-list':true,'roles/qa-new-list':'list'}});
        await page.locator('.aa-danger[data-uid="qa-new-list"]').click();await page.waitForFunction(()=>window.__qaWrites.length===2&&!accountAccessState.saving);
        assert.deepEqual(await page.evaluate(()=>window.__qaWrites[1].values),{'authorizedUsers/qa-new-list':false});
        await page.locator('#account-access-uid').fill('qa-op');await page.locator('#account-access-role').selectOption('list');
        await page.locator('.aa-card button[type="submit"]').click();assert.match(await page.locator('#account-access-notice').innerText(),/自分の権限/);
        assert.equal(await page.evaluate(()=>window.__qaWrites.length),2);
        await page.evaluate(()=>window.scrollTo(0,0));
        await page.screenshot({path:path.join(output,size+'-op-accounts-self-guard.png'),fullPage:true});
      }
      assert.equal(await page.evaluate(()=>JSON.stringify(S)===window.__qaBusiness),true,'role UI browsing leaves all business data unchanged');
      await page.evaluate(()=>{at=null;md=null;document.getElementById('floor-order-modal').style.display='none';S.activeBizDay=null;vw='home';render();});
      if(role==='op'){
        await page.locator('#account-access-btn').click();await page.locator('#account-access-title').waitFor({timeout:3000});
        assert.equal(await page.evaluate(()=>vw),'accounts','account manager is available before business starts');
      }else if(role==='cashier'){
        assert.match(await page.locator('#m').innerText(),/現在営業していません/);
        const startButton=page.locator('#m button').filter({hasText:/営業.*開始/});
        assert.equal(await startButton.count(),1,'cashier has one start entry point before business starts');
        await startButton.click();assert.equal(await page.evaluate(()=>md),'startBizDay');
        assert.equal(await page.locator('#biz-date-input').isVisible(),true);
        assert.match(await page.locator('#md').innerText(),/営業を開始する/);
        assert.equal(await page.locator('#m [onclick*="endBizDay"]').count(),0,'cashier still has no end control');
        await page.screenshot({path:path.join(output,size+'-cashier-start.png'),fullPage:true});
        await page.evaluate(()=>closeM());
        await page.evaluate(()=>{md='endBizDay';rModal();});assert.equal(await page.evaluate(()=>md),null);
      }else{
        assert.match(await page.locator('#m').innerText(),/営業開始はキャッシャーまたはOPアカウント/);
        assert.equal(await page.locator('#m [onclick*="startBizDay"]').count(),0);
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,size+' '+role+' fits horizontal viewport');
      const contentOverflow=await page.locator('#m').evaluate(node=>node.scrollWidth>node.clientWidth+1);assert.equal(contentOverflow,false,'main content fits viewport');
      assert.deepEqual(errors,[],size+' '+role+' no browser errors');
      console.log(size+' '+role+': navigation, home, direct view/modal guards, account permissions and layout passed');
      await context.close();
    }
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
