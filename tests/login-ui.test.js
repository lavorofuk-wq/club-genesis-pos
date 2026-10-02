const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('index.html');

test('staff login uses the shared current UI without the legacy login heading',()=>{
  assert.match(html,/<h1\b[^>]*id="auth-title"[^>]*>スタッフログイン<\/h1>/);
  assert.doesNotMatch(html,/POS LOGIN/);
  assert.match(html,/<div\b[^>]*id="auth-gate"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="auth-title"[^>]*style="display:none;"/);
  assert.match(html,/<div\b[^>]*id="app"[^>]*style="display:none;"/);
});

test('the login stylesheet and service-worker cache use the current release version',()=>{
  const app=read('app.js');
  const version=app.match(/const APP_VERSION="([^"]+)"/)[1];
  const links=[...html.matchAll(/<link\b[^>]*href="auth\.css\?v=([^"]+)"[^>]*>/g)];
  assert.equal(links.length,1,'one shared login stylesheet');
  assert.equal(links[0][1],version);
  assert.match(links[0][0],/rel="stylesheet"/);
  const sw=read('sw.js');
  assert.ok(sw.includes("'./auth.css?v="+version+"'"),'login style is available in the current offline cache');
  assert.equal(sw.match(/const RELEASE_VERSION\s*=\s*'([^']+)'/)[1],version);
});

test('legacy base and development override styles no longer define login selectors',()=>{
  const loginSelector=/#auth-(?:gate|submit|error)\b|\.auth-(?:card|brand)\b/;
  assert.doesNotMatch(read('styles.css'),loginSelector);
  const commercial=path.join(root,'commercial-ui.css');
  if(fs.existsSync(commercial))assert.doesNotMatch(fs.readFileSync(commercial,'utf8'),loginSelector);
});

test('the standalone login style owns the complete light login form and narrow-screen layout',()=>{
  const css=read('auth.css');
  for(const selector of ['#auth-gate','.auth-card','.auth-brand','.auth-card h1','.auth-card p','.auth-card label','.auth-card input','#auth-error','#auth-submit','.auth-card small']){
    assert.ok(css.includes(selector),selector+' remains styled after legacy code removal');
  }
  assert.match(css,/background\s*:\s*#(?:fff\b|ffffff\b)/i);
  assert.match(css,/color\s*:\s*#(?:222\b|222222\b|214e75\b)/i);
  assert.match(css,/font-size\s*:\s*16px/,'inputs remain large enough to avoid mobile focus zoom');
  assert.match(css,/width\s*:\s*(?:min\(|100%)/);
  assert.match(css,/overflow(?:-y)?\s*:\s*auto/,'login remains reachable with a short mobile viewport');
  assert.match(css,/#auth-submit:disabled/,'authentication busy feedback remains visible');
  assert.match(css,/:focus(?:-visible)?/,'keyboard focus remains visible');
  assert.doesNotMatch(css,/Cormorant|radial-gradient|linear-gradient|#(?:d4a017|b8960c|e8c84a|08080b|0d0d11)\b/i);
});

test('current authentication DOM hooks and accessible credential fields are preserved',()=>{
  const init=read('firebase-init.js');
  const ids=new Set([...init.matchAll(/getElementById\("(auth-[^"]+)"\)/g)].map(match=>match[1]));
  for(const id of ids){
    assert.equal(html.split('id="'+id+'"').length-1,1,id+' must remain a unique authentication hook');
  }
  for(const [id,type,autocomplete] of [['auth-email','email','username'],['auth-password','password','current-password']]){
    const field=html.match(new RegExp('<input\\b[^>]*id="'+id+'"[^>]*>'));
    assert.ok(field,id+' input exists');
    assert.ok(field[0].includes('type="'+type+'"'));
    assert.ok(field[0].includes('autocomplete="'+autocomplete+'"'));
    assert.match(field[0],/\brequired\b/);
    assert.ok(html.includes('<label for="'+id+'">'));
  }
  assert.match(html,/<div\b[^>]*id="auth-error"[^>]*role="alert"/);
  assert.match(html,/<button\b[^>]*id="auth-submit"[^>]*type="submit"/);
});

test('a login appearance update retains session authentication and role authorization',()=>{
  const init=read('firebase-init.js');
  assert.match(init,/Auth\.Persistence\.SESSION/);
  assert.match(init,/signInWithEmailAndPassword/);
  assert.match(init,/access\/authorizedUsers\//);
  assert.match(init,/access\/roles\//);
  assert.match(init,/allowed\.val\(\)===true\?window\.PosAccess\.normalizeRole\(role\.val\(\)\):null/);
  assert.match(init,/await readAuthorization\(db,user\)/);
  assert.doesNotMatch(init,/createUserWithEmailAndPassword|signInAnonymously/);
  assert.doesNotMatch(html,/新規登録|アカウント作成|signUp/i);
});
