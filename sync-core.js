(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.PosSyncCore=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  function revision(record){
    return Number(record&&record._rev)||0;
  }

  function sameRecord(remote,expected){
    if(!remote||!expected)return remote===expected;
    if(remote.id!=null&&expected.id!=null&&String(remote.id)!==String(expected.id))return false;
    return revision(remote)===revision(expected);
  }

  function nextRecord(remote,desired,version,nonce){
    return{
      ...desired,
      _rev:revision(remote)+1,
      _nodeWriteVersion:Number(version)||0,
      _nodeWriteNonce:String(nonce||"")
    };
  }

  function canCreate(remote,expected){
    return !remote&&revision(expected)===0;
  }

  return Object.freeze({revision,sameRecord,nextRecord,canCreate});
});
