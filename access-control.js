(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.PosAccess=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const ROLE_TABS=Object.freeze({
    cashier:Object.freeze(["floor","list","settings","shifts"]),
    list:Object.freeze(["list","shifts"]),
    op:Object.freeze(["floor","list","settings","shifts","history","analysis","admin","accounts"])
  });
  const LABELS=Object.freeze({cashier:"キャッシャー",list:"リスト",op:"OP"});
  const EXTRA_VIEWS=Object.freeze({tableDetail:"list",assignHistory:"list",histlog:"admin",backupDetail:"admin"});
  const SHARED_READ=new Set(["appVersion","casts","castLifecycleLogs","menus","tables","sessions","tablePreparations","history","shifts","assignments","activeBizDay","loMode","loStatus","_capabilities","_writeGate","_scopedOperation","_tableAssignmentRevisions","_castAssignmentRevisions","_castShiftRevisions","_shiftDeleteOperations"]);
  const CASHIER_EXTRA=new Set(["config","_settingsRevisions","_settingsWriteMeta","_tableChangeOperations","_banaiOperations"]);
  const LIST_WRITE=new Set(["assignments","shifts","tablePreparations","_writeGate","_scopedOperation","_tableAssignmentRevisions","_castAssignmentRevisions","_castShiftRevisions","_shiftDeleteOperations"]);
  const CASHIER_WRITE=new Set([...LIST_WRITE,...CASHIER_EXTRA,"sessions","history","tables","casts","castLifecycleLogs","menus","loMode","loStatus"]);
  function normalizeRole(value){return typeof value==="string"&&Object.prototype.hasOwnProperty.call(ROLE_TABS,value)?value:null;}
  function tabs(role){return normalizeRole(role)?ROLE_TABS[role].slice():[];}
  function label(role){return normalizeRole(role)?LABELS[role]:"権限未設定";}
  function canView(role,view){
    if(!normalizeRole(role)||typeof view!=="string")return false;
    if(view==="home")return true;
    const tab=Object.prototype.hasOwnProperty.call(EXTRA_VIEWS,view)?EXTRA_VIEWS[view]:view;
    return ROLE_TABS[role].includes(tab);
  }
  // This describes role scope; server rules additionally validate each write.
  function parsePath(path){
    if(typeof path!=="string"||/[.#$\[\]\\]/.test(path))return null;
    const normalized=path.replace(/^\/+|\/+$/g,"");
    const parts=normalized?normalized.split("/"):[];
    if(parts.some(part=>part===""))return null;
    const first=parts[0];
    if(first==="access")return null;
    if(first==="backup"||first==="backup-dev")return{backup:true,node:parts[1]||""};
    if(first==="pos"||first==="pos-dev")parts.shift();
    return{backup:false,node:parts[0]||""};
  }
  function canReadPath(role,path){
    if(!normalizeRole(role))return false;
    const parsed=parsePath(path);
    if(!parsed)return false;
    if(role==="op")return true;
    if(parsed.backup||!parsed.node)return false;
    return SHARED_READ.has(parsed.node)||(role==="cashier"&&CASHIER_EXTRA.has(parsed.node));
  }
  function canWritePath(role,path){
    if(!normalizeRole(role))return false;
    const parsed=parsePath(path);
    if(!parsed)return false;
    if(role==="op")return true;
    if(parsed.backup||!parsed.node)return false;
    return(role==="cashier"?CASHIER_WRITE:LIST_WRITE).has(parsed.node);
  }
  return Object.freeze({normalizeRole,tabs,canView,label,canReadPath,canWritePath});
});
