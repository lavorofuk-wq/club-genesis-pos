const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.join(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

test("POS boot is gated by Firebase Authentication and an explicit UID allowlist",()=>{
  const init=read("firebase-init.js");
  assert.match(init,/firebase-auth-compat\.js/);
  assert.match(init,/Auth\.Persistence\.SESSION/);
  assert.match(init,/signInWithEmailAndPassword/);
  assert.match(init,/access\/authorizedUsers\//);
  assert.match(init,/snap\.val\(\)===true/);
  assert.ok(init.indexOf("isAuthorized(db,user)")<init.indexOf("exposeDatabase(db)"));
});

test("database rules deny by default and require an allowlisted authenticated UID",()=>{
  const rules=JSON.parse(read("database.rules.json"));
  assert.equal(rules.rules[".read"],false);
  assert.equal(rules.rules[".write"],false);
  for(const key of ["pos","pos-dev","backup","backup-dev"]){
    assert.match(rules.rules[key][".read"],/auth != null/);
    assert.match(rules.rules[key][".read"],/authorizedUsers/);
  }
  assert.equal(rules.rules.access.authorizedUsers["$uid"][".write"],false);
});

test("login form does not offer public account registration",()=>{
  const html=read("index.html");
  assert.match(html,/id="auth-form"/);
  assert.match(html,/autocomplete="current-password"/);
  assert.doesNotMatch(html,/新規登録|アカウント作成|signUp/i);
});
