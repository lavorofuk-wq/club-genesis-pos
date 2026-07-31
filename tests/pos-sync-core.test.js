const assert=require("assert");
const sync=require("../sync-core.js");

assert.strictEqual(sync.revision(null),0);
assert.strictEqual(sync.revision({_rev:3}),3);
assert.strictEqual(sync.sameRecord({id:"a1",_rev:2},{id:"a1",_rev:2}),true);
assert.strictEqual(sync.sameRecord({id:"a1",_rev:3},{id:"a1",_rev:2}),false);
assert.strictEqual(sync.sameRecord({id:"a2",_rev:2},{id:"a1",_rev:2}),false);
assert.strictEqual(sync.canCreate(null,{id:"a1"}),true);
assert.strictEqual(sync.canCreate({id:"a1"},{id:"a1"}),false);

const next=sync.nextRecord(
  {id:"a1",_rev:4,_nodeWriteNonce:"old"},
  {id:"a1",type:"hon",_rev:4,_nodeWriteNonce:"old"},
  6109,
  "new"
);
assert.strictEqual(next._rev,5);
assert.strictEqual(next._nodeWriteVersion,6109);
assert.strictEqual(next._nodeWriteNonce,"new");
assert.strictEqual(next.type,"hon");

console.log("pos-sync-core tests passed");
