// Synthetic database only. External requests and service workers are blocked.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.argv[2]||'playwright');
const root=path.resolve(__dirname,'..'),output=path.resolve(process.argv[3]||path.join(root,'.codex-artifacts','cast-attendance-ui'));
async function seed(page,role){
  await page.waitForFunction(()=>typeof endBizDay==='function'&&!!window.PosCastOrderAttendance);
  await page.evaluate(role=>{
    window._posRole=role;window._posUid='qa-'+role;window.FB_ROOT='pos-dev';window.BACKUP_ROOT='backup-dev';
    window.firebase={auth:()=>({currentUser:{uid:window._posUid}})};
    window._fbReady=true;window._fbFirstSync=true;window._fbConnected=true;window._posServerAppVersion=APP_VERSION;
    scheduleReleaseNotes=()=>{};
    scopedAtomicValidationVersion=614400;tableChangeAtomicValidationVersion=614300;bizDayAtomicValidationVersion=614100;
    const start=Date.parse('2026-10-04T20:00:00+09:00');
    S.activeBizDay='2026-10-04';
    S.bizDays={'2026-10-04':{id:'2026-10-04',date:'2026-10-04',startedAt:start,_rev:1}};
    S.bizDaySummaries={};S.castLifecycleLogs={};S.tablePreparations={};S.history=[];S.assignments={};
    S.tables=[{id:'t1',label:'確認テーブル 1'},{id:'t2',label:'確認テーブル 2'}];
    S.casts=normalizeCasts([{id:1,name:'出勤キャスト',active:true},{id:2,name:'休みキャスト',active:true},{id:3,name:'退勤キャスト',active:true},{id:4,name:'退店キャスト',active:false}]);
    S.shifts={on:{id:'on',castId:1,castName:'出勤キャスト',clockIn:start,_rev:1},out:{id:'out',castId:3,castName:'退勤キャスト',clockIn:start,clockOut:start+3600000,_rev:1}};
    S.menus=normalizeMenus({sets:[{id:'set',label:'セット',price:10000,minutes:60}],castDrinks:[{id:'cd2',label:'確認Drink',price:2000}]});
    S.sessions={t1:markSessionGuard({tableId:'t1',sessionId:'qa-session',startTime:start,setEndTime:start+3600000,guests:1,items:[{id:'set',label:'セット',price:10000,qty:1,isSet:true,minutes:60}],_rev:1})};
    const db=structuredClone({tables:S.tables,casts:S.casts,activeBizDay:S.activeBizDay,bizDays:S.bizDays,history:{},sessions:S.sessions,shifts:S.shifts,assignments:{},tablePreparations:{},_bizDayRevisions:{'2026-10-04':1}});
    window.__qaDatabase=db;window.__qaWrites=[];
    const parts=p=>p.replace(/^pos-dev\//,'').split('/').filter(Boolean);
    const get=p=>parts(p).reduce((node,key)=>node?.[key],db);
    const put=(p,value)=>{
      const keys=parts(p),last=keys.pop(),parent=keys.reduce((node,key)=>node[key]||(node[key]={}),db);
      if(value==null)delete parent[last];else parent[last]=structuredClone(value);
    };
    window._db={ref(key){let field,filter;return{
      orderByChild(value){field=value;return this;},equalTo(value){filter=value;return this;},
      async get(){let value=get(key);if(field)value=Object.fromEntries(Object.entries(value||{}).filter(([,row])=>row[field]===filter));return{val:()=>value==null?null:structuredClone(value)};},
      async once(){return this.get();},
      async update(updates){window.__qaWrites.push(structuredClone(updates));for(const [p,value] of Object.entries(updates))if(p.startsWith('pos-dev/'))put(p,value);},
      async transaction(callback){const value=callback(structuredClone(get(key)||null));if(value===undefined)return{committed:false};put(key,value);window.__qaWrites.push({[key]:structuredClone(value)});return{committed:true,snapshot:{val:()=>structuredClone(value)}};}
    };}};
    for(const id of ['loading','auth-gate','version-overlay','offline-overlay','floor-order-modal'])document.getElementById(id).style.display='none';
    document.getElementById('app').style.display='block';vw=posDefaultView();md=null;at=null;render();
  },role);
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
      page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.type()==='confirm'?dialog.dismiss():dialog.accept());
      await page.goto(origin);await seed(page,'op');
      await page.evaluate(()=>{at='t1';om('cd');});
      assert.equal(await page.locator('#md [data-cid="1"]').count(),1);
      assert.equal(await page.locator('#md [data-cid="2"]').count(),0);
      await page.getByRole('button',{name:'休み',exact:true}).click();
      assert.equal(await page.locator('#md [data-cid="1"]').count(),0);
      assert.equal(await page.locator('#md [data-cid="3"]').count(),1);
      assert.equal(await page.locator('#md [data-cid="4"]').count(),0);
      await page.screenshot({path:path.join(output,name+'-rest-drink.png'),fullPage:true});
      await page.locator('#md [data-cid="2"]').click();
      await page.getByRole('button',{name:'確認Drink',exact:true}).click();
      await page.locator('#qty-inp').fill('2');
      await page.getByRole('button',{name:'オーダーする',exact:false}).click();
      await page.waitForFunction(()=>window.__qaDatabase.sessions.t1.items.some(i=>i.category==='castDrink'));
      await page.evaluate(()=>om('banai'));
      await page.getByRole('button',{name:'休み',exact:true}).click();
      await page.screenshot({path:path.join(output,name+'-rest-banai.png'),fullPage:true});
      await page.locator('#md [data-cid="2"]').click();
      await page.waitForFunction(()=>window.__qaDatabase.sessions.t1.items.some(i=>i.isBanaiShimei));
      assert.equal(await page.evaluate(()=>!!getShiftByCastId(2)),false);
      assert.equal(await page.evaluate(()=>Object.keys(S.assignments).length),0);
      await page.evaluate(()=>{md='co2';coState={payMethod:'cash',splits:[{method:'cash',amount:ct(S.sessions.t1).total}]};rModal();});
      await page.getByRole('button',{name:'会計終了を確定する',exact:false}).click();
      await page.waitForFunction(()=>!checkoutBusy&&S.history.length===1);
      assert.equal(await page.evaluate(()=>S.history[0].total),20800);
      await page.evaluate(()=>{
        S.shifts.on.clockOut=S.shifts.on.clockIn+3600000;window.__qaDatabase.shifts.on=structuredClone(S.shifts.on);
        om('endBizDay');
      });
      const warning=page.locator('.cast-attendance-warning');
      assert.match(await warning.innerText(),/会計履歴：確認テーブル 1/);
      assert.match(await warning.innerText(),/休みキャスト/);
      assert.match(await warning.innerText(),/キャストDrink・場内指名/);
      assert.equal(await page.getByRole('button',{name:'終了して保存する',exact:true}).isDisabled(),true);
      assert.equal(await warning.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
      await page.screenshot({path:path.join(output,name+'-warning.png'),fullPage:true});
      const writes=await page.evaluate(()=>window.__qaWrites.length);
      await page.evaluate(()=>endBizDay());
      assert.equal(await page.evaluate(()=>window.__qaWrites.length),writes);
      await page.evaluate(async()=>{
        await clockIn(2,'21:00');await clockOut(getShiftByCastId(2).id,'22:00');om('endBizDay');
      });
      assert.equal(await warning.count(),0);
      assert.equal(await page.getByRole('button',{name:'終了して保存する',exact:true}).isDisabled(),false);
      await page.getByRole('button',{name:'終了して保存する',exact:true}).click();
      await page.waitForFunction(()=>!bizDayBusy&&!S.activeBizDay);
      assert.equal(await page.evaluate(()=>S.bizDays['2026-10-04'].history[0].total),20800);
      for(const role of ['cashier','list']){
        await seed(page,role);
        await page.evaluate(()=>{at='t1';om('cd');});
        assert.equal(await page.getByRole('button',{name:'休み',exact:true}).count(),0);
        await page.evaluate(async()=>{toggleOffDutyCastSelection();scc(2);openCastDrinkQty(2,2000,'不正追加');await addBanai(2);});
        assert.equal(await page.evaluate(()=>window.__qaWrites.length),0);
        assert.equal(await page.evaluate(()=>S.sessions.t1.items.length),1);
        if(role==='cashier'){
          await page.evaluate(()=>om('banai'));
          assert.equal(await page.getByRole('button',{name:'休み',exact:true}).count(),0);
        }
      }
      assert.deepEqual(errors,[]);
      console.log(name+': OP off-duty orders, checkout, warning, attendance resolution, end save and non-OP denial passed');
      await context.close();
    }
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
