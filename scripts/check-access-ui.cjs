// Usage: node scripts/check-access-ui.cjs <playwright module path> [output directory]
// Serves the real app on loopback with Firebase initialization removed. All data is synthetic,
// external requests and service workers are blocked, and account writes update only an in-memory mock.
// Data-tab action tests spy on persistence/print/download boundaries without sending or changing data.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.argv[2]||'playwright');
const root=path.resolve(__dirname,'..'),output=path.resolve(process.argv[3]||path.join(root,'.codex-artifacts','access-ui-qa'));
const allowedNav={cashier:['nf','nli','nsh','nh','ns'],list:['nli','nsh'],op:['nf','nli','nsh','nh','nan','ns','nm']};
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
    S.history=[{id:past,tableId:'t2',tableLabel:'QA 卓 2',startTime:past,endTime:past+1800000,guests:2,total:9876543,subtotal:8000,tax:0,payMethod:'cash',items:[{id:'qa-drink',label:'QA Drink',price:2000,qty:1,castId:101,castName:'QA キャスト',category:'castDrink'},{id:'qa-hon',label:'QA 本指名',price:1000,qty:1,castId:101,castName:'QA キャスト',isHonShimei:true}],note:'QA 過去明細'}];
    S.assignments={a1:{id:'a1',castId:101,castName:'QA キャスト',tableId:'t2',type:'free',startTime:past,endTime:past+1200000,sessionId:past}};
    S.shifts={sh1:{id:'sh1',castId:101,castName:'QA キャスト',clockIn:time-3600000,clockOut:null,status:'waiting',statusLog:[]}};
    S.tablePreparations={};S.castLifecycleLogs={};S.bizDaySummaries={};S.backups={};S.config={};S.loMode=false;S.loStatus={};
    clearAccountAccessState();sessionStorage.removeItem('genesis_admin');
    for(const id of ['loading','auth-gate','version-overlay','offline-overlay','floor-order-modal'])document.getElementById(id).style.display='none';
    document.getElementById('app').style.display='block';document.body.style.overflow='auto';
    vw='home';at=null;md=null;checkoutBusy=false;window.__qaBusiness=JSON.stringify(S);render();
  },role);
}
async function checkDataAccess(page,role,size){
  const before=await page.evaluate(()=>({reads:window.__qaReads.length,writes:window.__qaWrites.length,state:JSON.stringify(S)}));
  await page.evaluate(()=>{closeM();at=null;sv('home');});
  if(role==='list'){
    assert.equal(await page.locator('#nh').isVisible(),false);
    await page.evaluate(()=>sv('history'));assert.equal(await page.evaluate(()=>vw),'home');
    await page.evaluate(()=>{editHistPay(S.history[0].id);});assert.equal(await page.evaluate(()=>md),null);
    await page.evaluate(()=>{window._viewHistRec=S.history[0];om('viewHistDetail');});assert.equal(await page.evaluate(()=>md),null);
    return;
  }
  if(role==='cashier')await page.locator('.access-home-tabs button').filter({hasText:/^データ$/}).click();
  else await page.locator('#nh').click();
  assert.equal(await page.evaluate(()=>vw),'history');
  assert.match(await page.locator('#m').innerText(),/会計履歴/);
  for(const label of ['会計済み','未収（進行中）','合計見込み','会計データ','売上データ','ドリンクデータ'])assert.ok((await page.locator('#m').innerText()).includes(label),label);
  assert.match(await page.locator('#m').innerText(),/9,876,543/);
  await page.locator('.hist-header').click();assert.equal(await page.locator('.hist-body').count(),1);
  await page.evaluate(()=>{window.scrollTo(0,0);sbs(true,'同期済み ✓');});
  await page.screenshot({path:path.join(output,size+'-'+role+'-data.png'),fullPage:true});
  await page.evaluate(()=>{
    window.__qaData={prints:[],exports:[],updates:[],restores:[],opened:[]};
    window.__qaDataOriginal={eposPrint,_downloadXLSX,guardedHistoryRecordUpdate,guardedRestoreHistoryToFloor,openFloorDetail,confirm:window.confirm};
    window.confirm=()=>true;
    eposPrint=(record,reprint)=>window.__qaData.prints.push({record,reprint});
    _downloadXLSX=(rows,filename,sheet)=>window.__qaData.exports.push({rows,filename,sheet});
    guardedHistoryRecordUpdate=async(expected,desired)=>{window.__qaData.updates.push({expected,desired});};
    guardedRestoreHistoryToFloor=async(expected)=>{window.__qaData.restores.push(expected);return{session:{tableId:expected.tableId},skippedAssignments:0};};
    openFloorDetail=id=>window.__qaData.opened.push(id);
  });
  try{
    await page.locator('[data-phidg]').click();await page.locator('[data-phids]').click();
    assert.deepEqual(await page.evaluate(()=>window.__qaData.prints.map(p=>!!p.record.isGuest)),[true,false],'receipt dispatch retains guest/store variants');
    for(const fn of ['exportAccountingDataXLSX','exportSalesDataXLSX','exportDrinkDataXLSX'])await page.locator('#m [onclick="'+fn+'()"]' ).click();
    assert.deepEqual(await page.evaluate(()=>window.__qaData.exports.map(item=>item.sheet)),['Accounting','Sales','Drink']);
    assert.equal(await page.evaluate(()=>window.__qaData.exports.every(item=>item.rows.length>1&&item.filename.endsWith('2026-10-02.xlsx'))),true);
    await page.locator('[data-ehid]').click();assert.equal(await page.evaluate(()=>md),'editpay');
    assert.match(await page.locator('#md').innerText(),/支払記録を変更/);
    await page.locator('#md .ep-method-btn[data-m="card"]').click();
    await page.locator('#md [onclick="saveHistPay()"]' ).click();
    await page.waitForFunction(()=>window.__qaData.updates.length===1&&md===null);
    assert.equal(await page.evaluate(()=>window.__qaData.updates[0].desired.payMethod),'card');
    await page.locator('[data-dhid]').click();assert.equal(await page.evaluate(()=>md),'dh');
    await page.locator('#md [onclick="doh()"]' ).click();
    await page.waitForFunction(()=>window.__qaData.updates.length===2&&md===null);
    assert.equal(await page.evaluate(()=>window.__qaData.updates[1].desired),null,'delete reaches the existing guarded writer');
    await page.evaluate(()=>sv('assignHistory'));
    await page.locator('#m [data-hrid]').click();assert.equal(await page.evaluate(()=>md),'viewHistDetail');
    assert.match(await page.locator('#md').innerText(),/QA 過去明細/);
    await page.locator('#md [data-rhid]').click();
    await page.waitForFunction(()=>window.__qaData.opened.length===1);
    assert.equal(await page.evaluate(()=>vw),'floor');
    assert.equal(await page.evaluate(()=>window.__qaData.restores[0].tableId),'t2');
  }finally{
    await page.evaluate(()=>{
      ({eposPrint,_downloadXLSX,guardedHistoryRecordUpdate,guardedRestoreHistoryToFloor,openFloorDetail}=window.__qaDataOriginal);
      window.confirm=window.__qaDataOriginal.confirm;delete window.__qaDataOriginal;
      at=null;closeM();sv('home');
    });
  }
  assert.deepEqual(await page.evaluate(()=>({reads:window.__qaReads.length,writes:window.__qaWrites.length,state:JSON.stringify(S)})),before,'data actions use only spies and leave business data unchanged');
}
async function checkClosedDataAccess(page,role){
  await page.evaluate(()=>{at=null;closeM();sv('home');});
  assert.equal(await page.locator('#nh').isVisible(),false,role+' hides data tab while closed');
  assert.equal(await page.locator('#m [onclick="sv(\'history\')"]').count(),0,role+' hides closed data shortcut');
  await page.evaluate(()=>sv('history'));assert.equal(await page.evaluate(()=>vw),'home');
  await page.evaluate(()=>{vw='history';render();});assert.equal(await page.evaluate(()=>vw),'home');
  await page.evaluate(()=>editHistPay(S.history[0].id));assert.equal(await page.evaluate(()=>md),null,'closed payment editing is blocked');
  await page.evaluate(()=>{window._viewHistRec=S.history[0];window._histDetailBack=null;om('viewHistDetail');});
  assert.equal(await page.evaluate(()=>md),role==='op'?'viewHistDetail':null,'only OP may inspect archived invoice details when closed');
  await page.evaluate(()=>closeM());
}
async function checkAttendanceLifecycle(page,role,size){
  await page.evaluate(()=>{at=null;md=null;vw='home';render();});
  assert.equal(await page.locator('#nsh').isVisible(),false,role+' hides attendance tab while closed');
  assert.equal(await page.locator('#m [onclick="sv(\'shifts\')"]').count(),0,role+' hides closed attendance home shortcut');
  assert.equal(await page.locator('#m [onclick="sv(\'floor\')"], #m [onclick="sv(\'list\')"]').count(),0,role+' hides closed operational shortcuts');
  await page.evaluate(()=>sv('shifts'));assert.equal(await page.evaluate(()=>vw),'home','closed direct navigation stays at home');
  await page.evaluate(()=>{vw='shifts';render();});assert.equal(await page.evaluate(()=>vw),'home','closed direct view is rejected');
  assert.doesNotMatch(await page.evaluate(()=>rShifts()),/onclick="(?:openShiftMd|editShift|cancelClockOut|exportShiftCSV)/);
  const closed=await page.evaluate(async()=>{
    const before=JSON.stringify(S),writeCount=window.__qaWrites.length,originalConfirm=window.confirm;let confirmations=0;
    window.confirm=()=>{confirmations++;return true;};
    try{
      openShiftMd('in');openShiftMd('out');editShift('sh1');
      await clockIn(101,'21:00');await clockOut('sh1','22:00');
      await cancelClockOut('sh1');await deleteShift('sh1');
      shiftMd={step:'edit',mode:'in',castId:101,shiftId:'sh1',time:'21:00',bizDayId:'2026-10-02'};
      await saveShiftEdit();confirmShiftTime();
      md='shift';rModal();
      return{unchanged:JSON.stringify(S)===before,writes:window.__qaWrites.length-writeCount,confirmations,modal:md};
    }finally{window.confirm=originalConfirm;}
  });
  assert.deepEqual(closed,{unchanged:true,writes:0,confirmations:0,modal:null},role+' closed direct calls are harmless');
  await page.screenshot({path:path.join(output,size+'-'+role+'-closed-attendance.png'),fullPage:true});
  // Simulate realtime activeBizDay events, never a real database write. Archive subscription
  // is irrelevant to these synthetic events and is already covered by the sync unit suite.
  async function changeDay(day){
    await page.evaluate(day=>{
      const subscribe=subscribeActiveBizDayRecord;subscribeActiveBizDayRecord=()=>{};
      try{applyPosCoreValue(window._db,'activeBizDay',day);}finally{subscribeActiveBizDayRecord=subscribe;}
    },day);
  }
  await changeDay('2026-10-02');
  await page.waitForFunction(()=>posCanView('shifts')&&document.getElementById('nsh').style.display!=='none');
  assert.equal(await page.locator('#nh').isVisible(),role!=='list','business opening restores only authorized data tabs');
  if(role!=='list'){
    for(const name of ['editpay','viewHistDetail']){
      await page.evaluate(name=>{sv('history');if(name==='editpay')editHistPay(S.history[0].id);else{window._viewHistRec=S.history[0];window._histDetailBack=null;om(name);}},name);
      assert.equal(await page.evaluate(()=>md),name);
      await changeDay('2026-10-03');
      assert.equal(await page.evaluate(()=>md),null,'day switch closes '+name);
      assert.equal(await page.evaluate(()=>vw===posDefaultView()),true,'day switch leaves stale data view');
      assert.equal(await page.evaluate(()=>editPayHid),null,'day switch clears payment editor identity');
      assert.equal(await page.evaluate(()=>window._viewHistRec==null),true,'day switch clears selected invoice');
      await changeDay('2026-10-02');
    }
  }
  await page.evaluate(()=>sv('shifts'));assert.equal(await page.evaluate(()=>vw),'shifts');
  assert.match(await page.locator('#m').innerText(),/出勤登録/);
  await page.evaluate(()=>openCastStatusModal(101));
  await page.locator('#md [data-sid13="sh1"]').click();
  assert.equal(await page.evaluate(()=>md),'shift','cast status can still open the clock-out shortcut');
  assert.equal(await page.evaluate(()=>shiftMd.bizDayId),'2026-10-02','inline clock-out shortcut binds its business day');
  await page.evaluate(()=>closeM());
  await page.evaluate(()=>openShiftMd('in'));
  assert.equal(await page.evaluate(()=>shiftMd.bizDayId),'2026-10-02');
  assert.equal(await page.evaluate(()=>md),'shift');
  await changeDay('2026-10-03');
  assert.equal(await page.evaluate(()=>md),null,'a different business day closes the attendance dialog');
  assert.equal(await page.evaluate(()=>vw===posDefaultView()),true,'a different business day leaves the stale attendance page');
  assert.notEqual(await page.evaluate(()=>shiftMd.bizDayId),'2026-10-02','old business-day dialog data is cleared');
  assert.equal(await page.locator('#md').innerHTML(),'','changed-day modal contents are removed');
  await page.evaluate(()=>{sv('home');openShiftMd('in');});
  assert.equal(await page.evaluate(()=>shiftMd.bizDayId),'2026-10-03');
  await changeDay(null);
  assert.equal(await page.evaluate(()=>md),null,'remote closure closes attendance dialog even from home');
  assert.equal(await page.evaluate(()=>vw),'home');
  assert.equal(await page.locator('#nsh').isVisible(),false,'remote closure immediately updates the navigation');
  await page.evaluate(()=>{const before=window.__qaWrites.length;confirmShiftTime();if(window.__qaWrites.length!==before)throw new Error('Closed stale dialog submitted a write');});
  await changeDay('2026-10-03');await page.evaluate(()=>{sv('shifts');openShiftMd('out');});
  await changeDay(null);
  assert.equal(await page.evaluate(()=>vw),'home','remote closure returns an attendance page home');
  assert.equal(await page.evaluate(()=>md),null);
  if(role!=='list'){
    // Business-day synchronization must refresh hidden navigation even while the
    // settings editor deliberately avoids a complete page rerender.
    await page.evaluate(()=>sv('settings'));await changeDay('2026-10-03');
    assert.equal(await page.locator('#nsh').isVisible(),true,'opening while in settings enables attendance');
    await changeDay(null);assert.equal(await page.locator('#nsh').isVisible(),false,'closing while in settings disables attendance');
  }
  await page.evaluate(()=>{sv('home');render();});
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
        assert.deepEqual(await page.locator('.access-home-tabs button').allTextContents(),role==='cashier'?['フロア','リスト','設定','出勤','データ']:['リスト','出勤']);
      }else assert.match(home,/会計済み/);
      await page.screenshot({path:path.join(output,size+'-'+role+'-home.png'),fullPage:true});
      for(const view of role==='cashier'?['analysis','admin','histlog','backupDetail','accounts']:role==='list'?['floor','settings','history','analysis','admin','histlog','backupDetail','accounts']:[]){
        await page.evaluate(view=>sv(view),view);assert.equal(await page.evaluate(()=>vw),'home','sv denies '+role+': '+view);
        await page.evaluate(view=>{vw=view;render();},view);
        assert.equal(await page.evaluate(()=>posCanView(vw)),true,'render redirects forbidden direct view');
        await page.evaluate(()=>sv('home'));
      }
      if(role!=='op'){
        const denied=['mgmtMenu','endBizDay','deleteSession','anaDateSel','restore-conflicts','loadBizDayConfirm_2026-09-01'];
        if(role==='list')denied.push('startBizDay','settingsEditor','co','co2','opsMenu','ci-guests','est','editpay','viewHistDetail');
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
        assert.equal(await page.locator('#m [data-hrid]').count(),role==='cashier'?1:0,'invoice details follow data tab permission');
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
      await checkDataAccess(page,role,size);
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
      await checkClosedDataAccess(page,role);
      await checkAttendanceLifecycle(page,role,size);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,size+' '+role+' fits horizontal viewport');
      const contentOverflow=await page.locator('#m').evaluate(node=>node.scrollWidth>node.clientWidth+1);assert.equal(contentOverflow,false,'main content fits viewport');
      assert.deepEqual(errors,[],size+' '+role+' no browser errors');
      console.log(size+' '+role+': navigation, data tab actions, direct view/modal guards, account permissions, closed attendance/data, remote day transitions and layout passed');
      await context.close();
    }
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
