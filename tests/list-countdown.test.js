const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');
function source(from,to){
  const start=app.indexOf(from),end=app.indexOf(to,start+from.length);
  assert.ok(start>=0&&end>start,from+' extraction boundary');
  return app.slice(start,end);
}
function countdown(fmt){
  const classes=new Set();
  return{
    dataset:{fmt,countdown:'2000000'},style:{},textContent:'',
    classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)}
  };
}

test('list timer CSS does not override shared countdown colors or blinking',()=>{
  const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(match=>match[1].includes('.list-countdown'));
  assert.ok(rules.length>0);
  for(const [,selector,body] of rules){
    assert.doesNotMatch(body,/(?:^|;)\s*(?:color|opacity|animation(?:-[a-z-]+)?)\s*:/,selector);
  }
  assert.match(css,/\.urg\{[^}]*color:#ff6b6b!important;[^}]*animation:blink 1s infinite/);
});

test('floor and list ticks have identical colors and warning boundaries',()=>{
  const floor=countdown('p'),list=countdown('r');
  let clock=0;
  const ctx={
    now:0,Date:{now:()=>clock},md:null,at:null,S:{sessions:{}},
    ts:value=>String(value),
    document:{getElementById:()=>null,querySelectorAll:selector=>selector==='[data-countdown]'?[floor,list]:[]}
  };
  vm.createContext(ctx);
  vm.runInContext(source('function tickTimers(){','setInterval(tickTimers'),ctx);
  for(const [remaining,color,urgent] of [
    [1200000,'#d4a017',false],[600000,'#d4a017',false],
    [599999,'#ff6b6b',true],[1,'#ff6b6b',true],
    [0,'#ff4444',true],[-60000,'#ff4444',true],
    [1800000,'#d4a017',false]
  ]){
    clock=2000000-remaining;
    ctx.tickTimers();
    assert.equal(floor.style.color,color);
    assert.equal(list.style.color,floor.style.color);
    assert.equal(floor.classList.contains('urg'),urgent);
    assert.equal(list.classList.contains('urg'),urgent);
  }
});

test('both initial renders attach the same warning class and countdown updater',()=>{
  const ctx={
    now:10000000,DEV:'pc',Date,
    S:{tables:[{id:'t1',label:'T1'}],sessions:{},assignments:{}},
    rem:end=>end?end-ctx.now:null,ts:value=>String(value),isV:()=>false,itemCastName:()=>'',
    getWaitingCasts:()=>[],getBreakCasts:()=>[],getOnduty:()=>[],
    floorGridLayout:()=>({fit:false,cols:'1fr',gap:'12px'})
  };
  vm.createContext(ctx);
  vm.runInContext(source('function rFloor(){','function castChip('),ctx);
  for(const remaining of [1200000,600000,599999,0,-60000]){
    ctx.S.sessions.t1={startTime:1,setEndTime:ctx.now+remaining,guests:1,items:[]};
    const floor=ctx.rFloor(),list=ctx.rList();
    const urgent=remaining<600000;
    assert.match(floor,/data-countdown="\d+" data-fmt="p"/);
    assert.match(list,/data-countdown="\d+" data-fmt="r"/);
    assert.equal(/class="urg"/.test(floor),urgent);
    assert.equal(/class="list-countdown urg"/.test(list),urgent);
  }
});
