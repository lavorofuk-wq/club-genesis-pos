const assert=require("assert");
const fs=require("fs");
const path=require("path");

const app=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const printing=app.slice(app.indexOf("// ===== ePOS PRINT ====="),app.indexOf("// ===== データ分析 ====="));

assert.match(printing,/function showEposPrintError\(ip,port,e,data,isEstimate\)/);
assert.match(printing,/confirm\("Epsonレシートプリンターに接続できませんでした/);
assert.match(printing,/if\(useNormalPrint\)printReceiptFallback\(data,isEstimate\)/);
assert.doesNotMatch(printing,/通常印刷には切り替えません/);
assert.match(printing,/showEposPrintError\(ip,port,e,data,isEstimate\)/);
assert.doesNotMatch(app,/window\.epson/);
assert.doesNotMatch(app,/buildEposCommands/);
assert.match(app,/success=\["'\]false/);
assert.match(app,/Epson印刷エラー/);

console.log("print fallback tests passed");
