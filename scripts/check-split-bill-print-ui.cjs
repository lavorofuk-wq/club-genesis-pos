// Synthetic database and intercepted printers only; never connects to production.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.argv[2]||'playwright');
const {seed}=require('./check-cast-order-attendance-ui.cjs');
const root=path.resolve(__dirname,'..'),output=path.resolve(process.argv[3]||path.join(root,'.codex-artifacts','split-print-ui'));
async function fixture(page,role='cashier'){
  await seed(page,role);
  await page.evaluate(()=>{
    const session=S.sessions.t1;
    Object.assign(session,{guests:4,totalGuests:7,items:[{id:'set',label:'セット',price:15000,qty:4,isSet:true,minutes:60}],adjustedTotal:75700,adjustedTotalBaseSubtotal:60000,adjustedTotalTax:18000});
    window.__qaDatabase.sessions.t1=structuredClone(session);
    window.__qaSoap=[];window.__qaFailPrinter=false;window.__qaBrowserPrint=0;window.__qaPrintedHTML='';
    postEposSoap=async(url,soap)=>{window.__qaSoap.push(soap);if(window.__qaFailPrinter)throw new Error('synthetic printer unavailable');};
    window.print=()=>{window.__qaBrowserPrint++;window.__qaPrintedHTML=document.getElementById('receipt-print-area').innerHTML;};
    at='t1';om('co');
  });
}
async function assertFit(page){
  const issues=await page.locator('#md .mb').evaluate(el=>{
    const rect=el.getBoundingClientRect(),errors=[];
    if(rect.left<0||rect.right>innerWidth+1)errors.push('dialog viewport overflow');
    if(el.scrollWidth>el.clientWidth+1)errors.push('dialog horizontal overflow');
    for(const child of el.querySelectorAll('button,.split-print-total,.split-print-share')){
      if(child.scrollWidth>child.clientWidth+1)errors.push('content overflow: '+child.textContent);
    }
    return errors;
  });
  assert.deepEqual(issues,[]);
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
      const page=await context.newPage(),errors=[];let confirmPrint=true;
      page.on('pageerror',error=>errors.push(error.message));
      page.on('dialog',dialog=>dialog.type()==='confirm'&&!confirmPrint?dialog.dismiss():dialog.accept());
      await page.goto(origin);await fixture(page);
      assert.equal(await page.locator('#md button[onclick="printCheckout()"]' ).count(),0);
      assert.equal(await page.locator('#md button[onclick="printCheckoutGuest()"]' ).count(),1);
      await assertFit(page);await page.screenshot({path:path.join(output,name+'-checkout.png'),fullPage:true});
      const before=await page.evaluate(()=>JSON.stringify({session:S.sessions.t1,totals:ct(S.sessions.t1),payments:coState,db:window.__qaDatabase}));
      await page.getByRole('button',{name:'割勘印刷',exact:true}).click();
      assert.equal(await page.locator('#split-print-people').inputValue(),'4');
      assert.match(await page.locator('#split-print-preview').innerText(),/18,900\s*× 3名[\s\S]*19,000\s*× 1名/);
      await assertFit(page);await page.screenshot({path:path.join(output,name+'-split.png'),fullPage:true});
      await page.locator('#split-print-people').fill('3');
      assert.match(await page.locator('#split-print-preview').innerText(),/25,200\s*× 2名[\s\S]*25,300\s*× 1名/);
      for(const input of ['','0','-1','1.5']){
        await page.locator('#split-print-people').fill(input);
        assert.equal(await page.locator('#split-print-submit').isDisabled(),true);
      }
      await page.locator('#split-print-people').fill('4');
      confirmPrint=false;await page.locator('#split-print-submit').click();
      assert.equal(await page.evaluate(()=>window.__qaSoap.length),0);
      confirmPrint=true;await page.locator('#split-print-submit').click();
      await page.waitForFunction(()=>window.__qaSoap.length===1);
      const soap=await page.evaluate(()=>window.__qaSoap[0]);
      assert.match(soap,/18,900 × 3名/);assert.match(soap,/19,000 × 1名/);
      assert.match(soap,/人数: 4名/);assert.doesNotMatch(soap,/割勘/);
      assert.equal((soap.match(/<cut /g)||[]).length,1);
      const enlarged=await page.evaluate(xml=>{
        const doc=new DOMParser().parseFromString(xml,'text/xml'),lines=[];
        if(doc.querySelector('parsererror'))throw new Error('Invalid printer XML');
        let dh=false,dw=false,em=false,align='left';
        for(const el of doc.getElementsByTagName('text')){
          if(el.hasAttribute('dh'))dh=el.getAttribute('dh')==='true';
          if(el.hasAttribute('dw'))dw=el.getAttribute('dw')==='true';
          if(el.hasAttribute('em'))em=el.getAttribute('em')==='true';
          if(el.hasAttribute('align'))align=el.getAttribute('align');
          if(el.textContent.trim())lines.push({text:el.textContent.trim(),dh,dw,em,align});
        }
        return lines;
      },soap);
      for(const text of ['CLUB GENESIS','¥18,900 × 3名','¥19,000 × 1名']){
        assert.deepEqual(enlarged.find(line=>line.text===text),{text,dh:true,dw:true,em:false,align:text==='CLUB GENESIS'?'center':'left'});
      }
      assert.deepEqual(enlarged.find(line=>line.text==='お一人様あたりの金額'),{text:'お一人様あたりの金額',dh:false,dw:false,em:true,align:'center'});
      assert.match(soap,/お一人様あたりの金額\n<\/text><text em="false"\/><feed line="1"\/><text align="left" dh="true" dw="true"\/>/);
      assert.ok(enlarged.filter(line=>line.text.startsWith('---')).every(line=>!line.dh&&!line.dw));
      await page.evaluate(()=>window.__qaFailPrinter=true);
      await page.locator('#split-print-submit').click();
      await page.waitForFunction(()=>window.__qaBrowserPrint===1);
      const fallback=await page.evaluate(()=>window.__qaPrintedHTML);
      for(const text of ['75,700','18,900','19,000','3名','1名'])assert.ok(fallback.includes(text));
      assert.match(fallback,/人数: 4名/);assert.doesNotMatch(fallback,/割勘/);
      await page.emulateMedia({media:'print'});
      const printLayout=await page.locator('#receipt-print-area').evaluate(el=>{
        const logoSize=getComputedStyle(el.querySelector('.rcp-logo')).fontSize;
        const heading=el.querySelector('.rcp-split-heading'),shares=[...el.querySelectorAll('.rcp-split-share')],rows=[heading,...shares];
        const headingSize=parseFloat(getComputedStyle(heading).fontSize);
        return{count:rows.length,title:heading.textContent,
          headingSmaller:headingSize<parseFloat(logoSize)&&headingSize>=parseFloat(logoSize)*.8,
          amountsUnchanged:shares.every(row=>getComputedStyle(row).fontSize===logoSize),
          spaced:shares[0].firstElementChild.getBoundingClientRect().top-heading.getBoundingClientRect().bottom>=6*96/25.4-1,
          fits:rows.every(row=>row.scrollWidth<=row.clientWidth+1&&[...row.children].every(child=>child.scrollWidth<=child.clientWidth+1))};
      });
      assert.deepEqual(printLayout,{count:3,title:'お一人様あたりの金額',headingSmaller:true,amountsUnchanged:true,spaced:true,fits:true});
      await page.locator('#receipt-print-area').screenshot({path:path.join(output,name+'-receipt.png')});
      await page.emulateMedia({media:'screen'});
      assert.equal(await page.evaluate(()=>JSON.stringify({session:S.sessions.t1,totals:ct(S.sessions.t1),payments:coState,db:window.__qaDatabase})),before);
      assert.equal(await page.evaluate(()=>window.__qaWrites.length),0);
      await page.getByRole('button',{name:'戻る',exact:true}).click();
      await page.evaluate(()=>window.__qaFailPrinter=false);
      await page.locator('#md button[onclick="printCheckoutGuest()"]' ).click();
      assert.match(await page.evaluate(()=>window.__qaSoap.at(-1)),/--- SET ---/);
      await page.getByRole('button',{name:'会計終了 →',exact:true}).click();
      await page.getByRole('button',{name:'会計終了を確定する',exact:false}).click();
      await page.waitForFunction(()=>!checkoutBusy&&S.history.length===1);
      const history=await page.evaluate(()=>S.history[0]);
      assert.equal(history.total,75700);assert.equal(history.subtotal,57700);assert.equal(history.tax,18000);
      assert.equal(history.guests,4);assert.equal(history.totalGuests,7);
      assert.equal(history.isSplitBill,undefined);assert.equal(history.splitPeople,undefined);
      assert.deepEqual(history.splits,[{method:'cash',amount:75700}]);
      assert.match(await page.evaluate(()=>window.__qaSoap.at(-1)),/店 舗 控 え/);
      await page.evaluate(()=>printHistReceipt(S.history[0].id));
      assert.match(await page.evaluate(()=>window.__qaSoap.at(-1)),/店 舗 控 え/);
      await page.evaluate(()=>printHistReceiptGuest(S.history[0].id));
      assert.match(await page.evaluate(()=>window.__qaSoap.at(-1)),/--- SET ---/);
      await fixture(page,'op');
      await page.getByRole('button',{name:'割勘印刷',exact:true}).click();
      await page.evaluate(()=>delete S.sessions.t1.adjustedTotal);
      await page.locator('#split-print-submit').click();
      assert.equal(await page.evaluate(()=>window.__qaSoap.length),0);
      assert.match(await page.locator('#split-print-preview').innerText(),/78,000/);
      await page.locator('#split-print-submit').click();
      assert.equal(await page.evaluate(()=>window.__qaSoap.length),1);
      await page.evaluate(()=>{S.sessions.t1.sessionId='different';});
      await page.locator('#split-print-submit').click();
      assert.equal(await page.locator('#split-print-submit').isDisabled(),true);
      assert.equal(await page.evaluate(()=>window.__qaSoap.length),1);
      await fixture(page,'list');
      await page.evaluate(()=>{openSplitPrint();om('coSplit');printCheckoutSplit();});
      assert.equal(await page.locator('#split-print-submit').count(),0);
      assert.equal(await page.evaluate(()=>window.__qaSoap.length),0);
      assert.deepEqual(errors,[]);
      console.log(name+': preview, editable count, balanced split, Epson/browser print, no writes, checkout/history print, freshness and role guards passed');
      await context.close();
    }
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
