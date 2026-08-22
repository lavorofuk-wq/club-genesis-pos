const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const app=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const source=app.slice(app.indexOf("function sessionGrossSubtotal"),app.indexOf("function isV(id)"));
const context={
  TAX_RATE:.30,
  TOTAL_ROUND_UNIT:100,
  roundCharge:value=>Math.ceil(Math.max(0,Number(value)||0)/100)*100
};
vm.createContext(context);
vm.runInContext(source,context);

const normal=context.ct({items:[{price:10000,qty:1}]});
assert.deepStrictEqual(
  {subtotal:normal.subtotal,tax:normal.tax,total:normal.total,discount:normal.discount},
  {subtotal:10000,tax:3000,total:13000,discount:0}
);

const adjusted=context.ct({
  items:[{price:10000,qty:1}],
  adjustedTotal:10000,
  adjustedTotalBaseSubtotal:10000
});
assert.deepStrictEqual(
  {
    grossSubtotal:adjusted.grossSubtotal,
    subtotal:adjusted.subtotal,
    tax:adjusted.tax,
    total:adjusted.total,
    discount:adjusted.discount,
    discountMode:adjusted.discountMode
  },
  {grossSubtotal:10000,subtotal:7692,tax:2308,total:10000,discount:2308,discountMode:"finalTotal"}
);

const stale=context.ct({
  items:[{price:10000,qty:1}],
  adjustedTotal:10000,
  adjustedTotalBaseSubtotal:9000
});
assert.strictEqual(stale.discountMode,"");
assert.strictEqual(stale.total,13000);

const legacy=context.ct({
  items:[{price:10000,qty:1},{price:1000,qty:1,isDiscount:true}],
  adjustedTotal:10400,
  adjustedTotalBaseSubtotal:10000
});
assert.strictEqual(legacy.grossSubtotal,10000);
assert.strictEqual(legacy.subtotal,8000);
assert.strictEqual(legacy.tax,2400);
assert.strictEqual(legacy.total,10400);

const free=context.ct({
  items:[{price:10000,qty:1}],
  adjustedTotal:0,
  adjustedTotalBaseSubtotal:10000
});
assert.strictEqual(free.subtotal,0);
assert.strictEqual(free.tax,0);
assert.strictEqual(free.total,0);
assert.strictEqual(free.discount,10000);

assert.strictEqual(context.recordSalesScale([{price:10000,qty:1}],7692),.7692);

console.log("discounted total calculation guards passed");
