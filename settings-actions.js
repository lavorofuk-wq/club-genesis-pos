// Settings UI adapter. Drafts live in the editor; S contains acknowledged business data only.
let settingsEditorInstance=null,settingsStoreInstance=null,settingsCommitBusy=false;
function settingsStorageKey(){
  try{
    const uid=window.firebase?.auth?.().currentUser?.uid;
    return uid?"genesis_settings_draft_v1:"+FB_ROOT+":"+uid:null;
  }catch(error){return null;}
}
function getSettingsEditor(){
  if(!settingsEditorInstance)settingsEditorInstance=window.PosSettingsEditor.create({
    getState:()=>S,getTab:()=>stab,getVisibleCasts:()=>sc(),getBizDate:()=>currentCastBizDate(),
    commit:commitSettingsDraft,getStorageKey:settingsStorageKey,
    storage:window.sessionStorage,confirm:message=>confirm(message),maxTables:MAX_TABLE_COUNT,
    syncView:()=>settingsSyncView(),
    tableBlocked:id=>tablePreparationPending(id)?"会計終了済":S.sessions[id]?"使用中":"",
    onOpen:()=>{md="settingsEditor";rModal();},
    onChange:()=>{if(md==="settingsEditor")rModal();},
    onClose:()=>{if(md==="settingsEditor")md=null;settingsClearResolvedErrors();render();rModal();}
  });
  return settingsEditorInstance;
}
function settingsOpen(data){if(settingsCommitBusy)return;getSettingsEditor().open({...data});}
function settingsField(field,value){getSettingsEditor().update(field,value);}
function settingsSubmit(){return getSettingsEditor().submit();}
function settingsClose(){return getSettingsEditor().close();}
function settingsRestoreDraft(){return getSettingsEditor().restore();}
function settingsDiscardDraft(){return getSettingsEditor().discardDraft();}
function settingsLoadCurrent(){return getSettingsEditor().loadCurrent();}
function settingsRetryConflict(){return getSettingsEditor().retryConflict();}
function settingsRestartForCurrentDay(){return getSettingsEditor().restartForCurrentDay();}
function settingsClearResolvedErrors(){
  if(settingsEditorInstance?.hasDraft())return;
  Object.values(settingSaveStates).forEach(state=>{if(!state.running&&state.requestedVersion===state.savedVersion&&state.status==="error")setSettingSaveStatus(state.path,"saved","");});
}
function settingsSaving(){return settingsCommitBusy||!!settingsEditorInstance?.isBusy();}
function settingsRequireReady(){
  if(requireFirebaseReady({silent:true}))return;
  const code=clientUpdateRequired()?"SETTINGS_UPDATE_REQUIRED":"SETTINGS_OFFLINE";
  throw Object.assign(new Error(code),{code,userMessage:clientUpdateRequired()
    ?"新しいバージョンへの更新が必要です。下書きを保持してページを再読み込みしてください。"
    :window._posNeedsReloadAfterDisconnect?"接続が切断されたため保存を停止しています。下書きを保持してページを再読み込みしてください。"
    :"接続を確認できないため保存していません。入力内容を残しています。接続状態を確認してください。"});
}
function settingsOperationState(path,status,error){
  const state=settingSaveState(path);
  state.running=status==="saving";
  if(status!=="saving")settleSettingWaiters(state,state.requestedVersion,error||null);
  // Modal retries carry their own base and desired values; never replay a failed intent implicitly.
  state.requestedVersion=state.savedVersion;
  if(status==="saving")state.lastRemoteValue=undefined;
  setSettingSaveStatus(path,status,error?settingSaveError(error).userMessage:"");
}
function settingsApplyConfirmed(path,value){
  if(path==="menus")S.menus=normalizeMenus(value||{});
  else if(path==="tables")S.tables=cloneData(value)||[];
  else if(path==="casts")S.casts=cloneData(value)||[];
  else if(path==="config")S.config=cloneData(value)||{};
  updateRemoteHash(path,value);
  const state=settingSaveState(path);
  state.confirmedHash=settingValueHash(value);
  state.latest=cloneData(value);
  state.lastRemoteValue=undefined;
}
async function settingsReadSnapshot(path){
  settingsRequireReady();
  const revision=Number((await window._db.ref(FB_ROOT+"/_settingsRevisions/"+path).get()).val())||0;
  const value=(await window._db.ref(FB_ROOT+"/"+path).get()).val();
  return{revision,value};
}
function getSettingsStore(){
  if(!settingsStoreInstance)settingsStoreInstance=window.PosSettingsStore.create({
    maxTables:MAX_TABLE_COUNT,readSnapshot:settingsReadSnapshot,apply:settingsApplyConfirmed,
    onState:settingsOperationState,isRaceError:isFirebasePermissionDenied,
    async write(change,snapshot){
      settingsRequireReady();
      const revision=snapshot.revision+1,nonce=Date.now()+"_"+Math.random().toString(36).slice(2);
      const previousIndices=change.path==="tables"?await tableSettingsProof(snapshot.value,change.next):null;
      const values={...change.updates,
        ["_settingsRevisions/"+change.path]:revision,
        ["_settingsWriteMeta/"+change.path]:{revision,version:_verNum(APP_VERSION),nonce,updatedAt:Date.now(),...(previousIndices?{previousIndices}:{})}
      };
      await guardedRootUpdate(values);
    }
  });
  return settingsStoreInstance;
}
async function settingsReadRoster(draft){
  settingsRequireReady();
  const id=String(draft.id||""),paths=["activeBizDay","_settingsRevisions/castRoster"];
  if(draft.action==="depart")paths.push("_castShiftRevisions/"+id,"_castAssignmentRevisions/"+id);
  const root=await readScopedPaths(paths);
  const [casts,logs]=await Promise.all(["casts","castLifecycleLogs"].map(path=>window._db.ref(FB_ROOT+"/"+path).get()));
  root.casts=casts.val()||[];root.castLifecycleLogs=logs.val()||{};
  if(!Array.isArray(root.casts))throw window.PosSettingsStore.invalid("名簿の形式を確認できません。");
  return root;
}
function settingsConfirmRoster(root){
  settingsApplyConfirmed("casts",root.casts||[]);
  S.castLifecycleLogs=cloneData(root.castLifecycleLogs)||{};
  updateRemoteHash("castLifecycleLogs",S.castLifecycleLogs);
  settingSaveState("casts").confirmedLifecycleHash=settingValueHash(S.castLifecycleLogs);
  settingSaveState("casts").lastRemoteLifecycle=undefined;
}
async function commitSettingsCast(draft){
  const d=cloneData(draft),id=String(d.id||""),action=d.action;
  if(!id||/[.#$\[\]\/]/.test(id)||!["add","edit","depart"].includes(action))throw window.PosSettingsStore.invalid("キャストの編集内容を確認してください。");
  let root=await settingsReadRoster(d);
  const currentBusinessDate=root.activeBizDay||null,currentBizDate=currentBusinessDate||getBizDate();
  if(currentBusinessDate!==(d.businessDate||null)||d.bizDate!==currentBizDate)throw Object.assign(new Error("business day changed"),{
    code:"SETTINGS_BUSINESS_DAY_CHANGED",currentBusinessDate,currentBizDate,
    userMessage:"営業日が変わりました。入力内容を保持して現在の営業日の下書きを作り直し、内容を確認して保存してください。"
  });
  const current=normalizeCasts(root.casts).find(c=>String(c.id)===id)||null;
  const name=String(d.values?.name??d.values?.label??"").trim();
  if(action!=="depart"&&!name)throw window.PosSettingsStore.invalid("キャスト名を入力してください。","name");
  if(action==="depart"&&!current){
    const departed=Object.values(root.castLifecycleLogs).some(log=>[...(log.exitedCasts||[]),...(log.trialCasts||[])].some(row=>String(row.castId)===id&&(row.exitedAt||row.trialEndedAt)));
    if(departed){settingsConfirmRoster(root);return true;}
  }
  if(action!=="add"&&!window.PosSettingsStore.same(current,d.base))throw window.PosSettingsStore.conflict(current);
  if(action==="add"&&current){
    if(current.name===name&&current.castType===(d.castType==="trial"?"trial":"regular")){settingsConfirmRoster(root);return true;}
    throw window.PosSettingsStore.conflict(current);
  }
  if(action!=="add"&&!current)throw window.PosSettingsStore.conflict(null);
  const biz=currentBizDate;
  if(action!=="depart"&&normalizeCasts(root.casts).some(c=>String(c.id)!==id&&c.active!==false&&(c.castType!=="trial"||c.trialBizDay===biz)&&String(c.name||"").trim()===name)){
    throw window.PosSettingsStore.invalid("在籍中または当日体入に同じ名前のキャストがいます。","name");
  }
  settingsConfirmRoster(root);
  if(action==="edit"){
    // This existing operation also renames references on the current business day atomically.
    const state=settingSaveState("casts");
    state.running=false;state.requestedVersion=state.savedVersion;state.status="saved";
    await guardedCastNameChange(id,name,{expectedActiveBizDay:d.businessDate||null,expectedCast:current});
    try{settingsConfirmRoster(await settingsReadRoster(d));}catch(_readError){}
    return true;
  }
  settingsOperationState("casts","saving");
  const next=normalizeCasts(root.casts),lifecycle=cloneData(root.castLifecycleLogs)||{};
  if(action==="add"){
    const castId=Number(id),ts=Date.now();
    if(!Number.isSafeInteger(castId)||castId<=0)throw window.PosSettingsStore.invalid("キャストIDを確認できません。新しく登録してください。");
    const sortIndex=next.reduce((maximum,c)=>Math.max(maximum,Number(c.sortIndex)||0),-1)+1;
    const trial=d.castType==="trial";
    const cast={id:castId,name,castType:trial?"trial":"regular",active:true,registeredAt:ts,sortIndex,
      ...(trial?{trialRegisteredAt:ts,trialBizDay:biz}:{enteredAt:ts,enteredBizDay:biz})};
    next.push(cast);
    upsertLifecycleIn(lifecycle,biz,trial?"trialCasts":"enteredCasts",castSnapshot(cast,trial?{trialBizDay:biz,trialRegisteredAt:ts,trialEndedAt:null}:{enteredAt:ts}),"castId");
  }else{
    const [shifts,assignments]=await Promise.all([readRemoteActiveShiftsForCast(id),readRemoteActiveAssignmentsForCast(id)]);
    if(Object.keys(shifts).length||Object.keys(assignments).length)throw window.PosSettingsStore.invalid("出勤中・付け回し中のキャストは退店できません。先に退勤と付け回し終了を完了してください。");
    next.splice(next.findIndex(c=>String(c.id)===id),1);
    const ts=Date.now(),trial=current.castType==="trial",day=trial?(current.trialBizDay||biz):biz;
    upsertLifecycleIn(lifecycle,day,trial?"trialCasts":"exitedCasts",castSnapshot(current,trial
      ?{trialBizDay:day,trialRegisteredAt:current.trialRegisteredAt||current.registeredAt||null,trialEndedAt:ts}:{exitedAt:ts}),"castId");
  }
  const revision=(Number(root._settingsRevisions?.castRoster)||0)+1;
  const values={
    casts:next.length?next:null,castLifecycleLogs:lifecycle,
    "_settingsRevisions/castRoster":revision,
    "_settingsWriteMeta/castRoster":{revision,version:_verNum(APP_VERSION),nonce:Date.now()+"_"+Math.random().toString(36).slice(2),updatedAt:Date.now()}
  };
  const updates={};Object.entries(values).forEach(([path,value])=>updates[FB_ROOT+"/"+path]=value);
  await guardedScopedCommit(root,updates,{
    expectedActiveBizDay:root.activeBizDay||null,
    counterPaths:action==="depart"?["_castShiftRevisions/"+id,"_castAssignmentRevisions/"+id]:[]
  });
  root.casts=next;root.castLifecycleLogs=lifecycle;
  // Read the latest confirmed roster, if another device committed immediately after this one.
  try{const latest=await settingsReadRoster(d);root.casts=latest.casts;root.castLifecycleLogs=latest.castLifecycleLogs;}catch(_readError){}
  settingsConfirmRoster(root);
  return true;
}
async function commitSettingsDraft(draft){
  if(settingsCommitBusy)throw window.PosSettingsStore.invalid("設定を保存中です。完了までお待ちください。");
  settingsRequireReady();
  settingsCommitBusy=true;
  const path=draft.kind==="cast"?"casts":draft.kind==="table"?"tables":"menus";
  try{
    const old=settingSaveState(path);
    if(old.running||old.requestedVersion>old.savedVersion)await waitForSettingSaveQueue(path);
    const result=draft.kind==="cast"?await commitSettingsCast(draft):await getSettingsStore().commit(draft);
    settingsOperationState(path,"saved");
    return result;
  }catch(error){
    if(path==="casts"){
      // Refresh only after the write has settled; buffered Firebase events may
      // contain an optimistic value from our rejected attempt. Keep the draft.
      try{settingsConfirmRoster(await settingsReadRoster(draft));}catch(_readError){}
    }
    error=settingSaveError(error);
    if((error._txConflict||error.settingKind==="conflict")&&!error.code)error.code="SETTINGS_CONFLICT";
    if(error.code==="SETTINGS_CONFLICT"&&!Object.prototype.hasOwnProperty.call(error,"current")){
      try{
        const value=(await window._db.ref(FB_ROOT+"/"+path).get()).val();
        const list=path==="casts"?normalizeCasts(value||[]):path==="tables"?(value||[]):value?.[draft.category]||[];
        error.current=cloneData(list.find(item=>String(item.id)===String(draft.id))||null);
      }catch(_readError){}
    }
    settingsOperationState(path,"error",error);
    console.warn("settings save failed",{path,action:draft.action,kind:error.settingKind,code:error.code||null});
    throw error;
  }finally{settingsCommitBusy=false;}
}
