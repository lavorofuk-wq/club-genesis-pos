// Usage: node scripts/check-login-ui.cjs <playwright module path> [output directory]
// Serves the real index and firebase-init on loopback. Firebase Auth and the two
// authorization reads are in-memory mocks; no SDK, external API or business data is used.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.argv[2]||'playwright');
const root=path.resolve(__dirname,'..'),output=path.resolve(process.argv[3]||path.join(root,'.codex-artifacts','login-ui-qa'));
function installAuthFixture(){
  const qa=window.__qaAuth={calls:[],reads:[],watches:[],writes:0,persistence:null,exposed:0,offline:0,pending:null};
  let authListener=null,permissions={},listeners=[];
  const snapshot=value=>({val:()=>value});
  const auth={
    currentUser:null,
    async setPersistence(value){qa.persistence=value;},
    onAuthStateChanged(listener){authListener=listener;queueMicrotask(()=>listener(null));return()=>{authListener=null;};},
    signInWithEmailAndPassword(email,password){
      qa.calls.push({email,passwordLength:password.length});
      return new Promise((resolve,reject)=>{qa.pending={resolve,reject};});
    },
    async signOut(){
      sessionStorage.setItem('qa-login-signouts',String(Number(sessionStorage.getItem('qa-login-signouts')||0)+1));
      auth.currentUser=null;if(authListener)await authListener(null);
    }
  };
  const database={
    ref(key){
      if(!/^access\/(authorizedUsers|roles)\/qa-login-user$/.test(key))throw new Error('Unexpected login QA database path: '+key);
      const ref={
        async once(){qa.reads.push(key);return snapshot(permissions[key]);},
        on(event,listener){qa.watches.push(key);listeners.push({key,listener});queueMicrotask(()=>listener(snapshot(permissions[key])));},
        off(event,listener){listeners=listeners.filter(entry=>entry.listener!==listener);},
        set(){qa.writes++;throw new Error('Login QA must not write data');},
        update(){qa.writes++;throw new Error('Login QA must not write data');}
      };return ref;
    },
    goOffline(){qa.offline++;}
  };
  const authFactory=()=>auth;authFactory.Auth={Persistence:{SESSION:'qa-session'}};
  window.firebase={apps:[{}],initializeApp(){throw new Error('Real Firebase initialization must not run');},auth:authFactory,database:()=>database};
  qa.finish=async({error=null,allowed=true,role='cashier'}={})=>{
    const pending=qa.pending;if(!pending)throw new Error('No pending QA sign-in');qa.pending=null;
    if(error){pending.reject({code:error});return;}
    permissions={'access/authorizedUsers/qa-login-user':allowed,'access/roles/qa-login-user':role};
    auth.currentUser={uid:'qa-login-user',email:'qa-login@example.test'};
    pending.resolve({user:auth.currentUser});if(authListener)await authListener(auth.currentUser);
  };
  // Keep the real authentication callback and authorization checks. Stop only the
  // subsequent POS business-data boot, which is outside this isolated login suite.
  window.addEventListener('fbReady',event=>{
    event.stopImmediatePropagation();qa.exposed++;
    document.getElementById('loading').style.display='none';
    document.getElementById('app').style.display='block';
    document.getElementById('m').textContent='QA 認証済み画面（業務データ未接続）';
  });
}
async function checkLayout(page,label){
  await page.mouse.move(0,0);
  const look=await page.locator('#auth-form').evaluate(card=>{
    const gate=document.getElementById('auth-gate'),button=document.getElementById('auth-submit');
    const cs=getComputedStyle(card),gs=getComputedStyle(gate),bs=getComputedStyle(button),b=card.getBoundingClientRect();
    return{card:cs.backgroundColor,cardImage:cs.backgroundImage,radius:cs.borderRadius,font:cs.fontFamily,
      gate:gs.backgroundColor,gateImage:gs.backgroundImage,button:bs.backgroundColor,buttonImage:bs.backgroundImage,
      left:b.left,right:b.right,width:b.width,viewport:innerWidth,
      horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1||gate.scrollWidth>gate.clientWidth+1||card.scrollWidth>card.clientWidth+1};
  });
  assert.equal(look.card,'rgb(255, 255, 255)',label+' white card');
  assert.equal(look.gate,'rgb(238, 240, 242)',label+' neutral background');
  assert.equal(look.button,'rgb(36, 89, 135)',label+' blue login button');
  assert.equal(look.radius,'0px',label+' rectangular card');
  assert.match(look.font,/Meiryo/i,label+' shared Japanese system font');
  for(const property of ['cardImage','gateImage','buttonImage'])assert.equal(look[property],'none',label+' no old gradient: '+property);
  assert.equal(look.horizontalOverflow,false,label+' has no horizontal overflow');
  assert.ok(look.left>=-1&&look.right<=look.viewport+1&&look.width<=391,label+' card fits viewport');
  // A short landscape viewport must scroll, not clip the top or the submit button.
  for(const id of ['auth-title','auth-email','auth-password','auth-submit']){
    const node=page.locator('#'+id);await node.scrollIntoViewIfNeeded();
    const box=await node.boundingBox(),viewport=page.viewportSize();
    assert.ok(box&&box.x>=-1&&box.y>=-1&&box.x+box.width<=viewport.width+1&&box.y+box.height<=viewport.height+1,label+' can reach '+id);
  }
  await page.locator('#auth-email').focus();
}
async function fillAndSubmit(page,{enter=false}={}){
  await page.locator('#auth-email').fill('qa-login@example.test');
  await page.locator('#auth-password').fill('synthetic-password-only');
  if(enter)await page.locator('#auth-password').press('Enter');else await page.locator('#auth-submit').click();
  await page.waitForFunction(()=>!!window.__qaAuth.pending);
  assert.equal(await page.locator('#auth-submit').isDisabled(),true,'pending submit is disabled');
  assert.equal(await page.locator('#auth-email').isDisabled(),true,'pending email is disabled');
  assert.equal(await page.locator('#auth-password').isDisabled(),true,'pending password is disabled');
  assert.equal(await page.locator('#auth-submit').innerText(),'確認中...');
}
async function main(){
  fs.mkdirSync(output,{recursive:true});
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');
    res.setHeader('Cache-Control','no-store');let body=fs.readFileSync(file);
    if(path.basename(file)==='index.html'){
      body=body.toString().replace(/<link[^>]*https:[^>]*>/g,'');
      if(url.searchParams.get('login-ui-mode')==='main')body=body.replace(/<link[^>]*href="commercial-ui\.css[^>]*>/g,'');
    }
    res.end(body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;let browser;
  try{
    browser=await chromium.launch({channel:'chrome',headless:true});
    for(const mode of ['main','dev'])for(const [name,width,height] of [['desktop',1440,1000],['tablet',768,1024],['mobile',390,844],['landscape-short',844,390],['mobile-short',390,568]]){
      const context=await browser.newContext({viewport:{width,height},hasTouch:width<=1024,timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
      await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
      await context.addInitScript(installAuthFixture);
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
      const label=mode+'-'+name;
      await page.goto(origin+'/?login-ui-mode='+mode);await page.locator('#auth-gate').waitFor({state:'visible'});
      assert.equal(await page.locator('#auth-title').innerText(),'スタッフログイン');
      assert.equal(await page.locator('#app').isVisible(),false,'unauthenticated app stays hidden');
      assert.equal(await page.evaluate(()=>window.__qaAuth.persistence),'qa-session');
      assert.equal(await page.evaluate(()=>window.__qaAuth.exposed),0);
      assert.deepEqual(await page.evaluate(()=>window.__qaAuth.reads),[],'signed-out screen reads no database data');
      assert.equal(await page.locator('link[href^="auth.css"]').count(),1,'shared auth stylesheet is loaded exactly once');
      if(mode==='main')assert.equal(await page.locator('link[href^="commercial-ui.css"]').count(),0,'main fixture uses no development theme');
      await checkLayout(page,label);
      await page.screenshot({path:path.join(output,label+'-login.png'),fullPage:true});
      await fillAndSubmit(page,{enter:true});
      assert.deepEqual(await page.evaluate(()=>window.__qaAuth.calls),[{email:'qa-login@example.test',passwordLength:23}],'Enter submits once');
      await page.screenshot({path:path.join(output,label+'-pending.png'),fullPage:true});
      await page.evaluate(()=>window.__qaAuth.finish({error:'auth/invalid-login-credentials'}));
      await page.locator('#auth-error').waitFor({state:'visible'});
      assert.match(await page.locator('#auth-error').innerText(),/メールアドレスまたはパスワードが違います/);
      assert.equal(await page.locator('#auth-submit').isEnabled(),true);await checkLayout(page,label+'-error');
      await page.screenshot({path:path.join(output,label+'-error.png'),fullPage:true});
      await fillAndSubmit(page);await page.evaluate(()=>window.__qaAuth.finish({allowed:false}));
      await page.waitForFunction(()=>document.getElementById('auth-error').textContent.includes('利用権限がありません'));
      assert.equal(await page.locator('#app').isVisible(),false,'unauthorized user stays outside POS');
      assert.equal(await page.evaluate(()=>window.__qaAuth.exposed),0,'unauthorized user receives no database exposure');
      assert.equal(await page.locator('#auth-password').inputValue(),'','successful authentication clears password even without authorization');
      await checkLayout(page,label+'-unauthorized');
      await page.screenshot({path:path.join(output,label+'-unauthorized.png'),fullPage:true});
      await fillAndSubmit(page);await page.evaluate(()=>window.__qaAuth.finish({allowed:true,role:'cashier'}));
      await page.locator('#app').waitFor({state:'visible'});
      assert.equal(await page.locator('#auth-gate').isVisible(),false,'authorized user leaves login');
      assert.deepEqual(await page.evaluate(()=>({ready:window._fbReady,uid:window._posUid,role:window._posRole,exposed:window.__qaAuth.exposed,writes:window.__qaAuth.writes})),{ready:true,uid:'qa-login-user',role:'cashier',exposed:1,writes:0});
      assert.equal(await page.locator('#auth-password').inputValue(),'');
      assert.equal(await page.evaluate(()=>window.__qaAuth.reads.length),4,'only allowlist and role are read for each authenticated user');
      assert.deepEqual(await page.evaluate(()=>window.__qaAuth.watches),['access/authorizedUsers/qa-login-user','access/roles/qa-login-user']);
      await Promise.all([page.waitForEvent('domcontentloaded'),page.locator('#logout-btn').click()]);
      await page.locator('#auth-gate').waitFor({state:'visible'});
      assert.equal(await page.locator('#app').isVisible(),false,'logout returns to protected login screen');
      assert.equal(await page.evaluate(()=>sessionStorage.getItem('qa-login-signouts')),'2','unauthorized rejection and explicit logout both sign out');
      assert.equal(await page.locator('#auth-password').inputValue(),'');
      assert.deepEqual(errors,[],label+' has no browser exceptions');
      console.log(label+': login, Enter, pending, error, authorization, logout and responsive layout passed');
      await context.close();
    }
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
