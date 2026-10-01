const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../..');
const policy=fs.readFileSync(path.join(root,'access-control.js'),'utf8');
const ui=fs.readFileSync(path.join(root,'access-ui.js'),'utf8');

// Existing business tests run as an explicitly authenticated OP. Load the real
// policy and UI helpers so these fixtures cannot bypass production permission checks.
function installAccessRuntime(context,{role='op',uid='fixture-op'}={}){
  if(!vm.isContext(context))vm.createContext(context);
  context.window=context.window||{};
  vm.runInContext(policy,context,{filename:'access-control.js'});
  context.window.PosAccess=context.PosAccess;
  context.window._posRole=role;
  context.window._posUid=uid;
  vm.runInContext(ui,context,{filename:'access-ui.js'});
  return context;
}
module.exports={installAccessRuntime};
