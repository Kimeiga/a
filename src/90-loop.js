/* ============================================================================
   LOOP, LIFECYCLE, SETTINGS

   Fixed 60 Hz accumulator: render as often as the device likes, simulate at a
   rate that never changes. The one adaptive thing in here is resolution, and
   it is adaptive because a phone throttles thirty to forty percent after three
   to five minutes and a shooter that runs at sixty and then sags to forty is
   worse than one that holds forty-five, since frame-time consistency is a
   gameplay property when you are aiming.
   ========================================================================== */
const startS=document.getElementById("title"), optsS=document.getElementById("opts");
const pauseS=document.getElementById("pause"), overS=document.getElementById("over");
const helpS=document.getElementById("help");

const STEP=1/60;
let acc=0, last=0, running=false, frameAvg=16.7, resHold=0;

function adaptRes(dt){
  if(S.res!==0) return;
  frameAvg += (Math.min(dt,.1)*1000 - frameAvg) * .05;
  resHold-=dt;
  if(resHold>0) return;
  const native=window.devicePixelRatio||1;
  if(frameAvg>23 && dprCap>0.75){        // sagging: give back pixels
    dprCap=Math.max(.75, dprCap-.15); resHold=2.5; layout();
  } else if(frameAvg<13.5 && dprCap<Math.min(2,native)){
    dprCap=Math.min(Math.min(2,native), dprCap+.1); resHold=4; layout();
  }
}

function frame(now){
  requestAnimationFrame(frame);
  if(!last) last=now;
  let dt=(now-last)/1000; last=now; tNow=now*.001;
  if(dt>.25) dt=.25;                     // came back from the background
  if(!running && game.state!=="attract") return;
  if(game.state==="attract"){ render(); return; }
  acc+=dt;
  let n=0;
  while(acc>=STEP && n<6){ simulate(STEP); acc-=STEP; n++; }
  if(n===6) acc=0;
  render(); hud(dt); adaptRes(dt);
}

/* ---------- starting and restarting ---------------------------------------- */
function resetGame(){
  rndSeed(Date.now()&0x7fffffff);
  zoms.length=0; projs.length=0; clouds.length=0; drops.length=0;
  gibs.length=0; tracers.length=0; rings.length=0; sparks.length=0;
  for(const d of DOORS) d.open=false;
  for(const b of BARRIERS) b.boards=b.max;
  for(const u of USABLES){ if(u.t==="trap"){ u.on=0; u.cd=0; } }
  rebuildDoors(); refreshRooms();
  placeBox(0);
  Object.assign(game,{state:"playing",round:0,left:0,toSpawn:0,spawnT:0,breakT:0,
    power:false,boxUses:0,boxOpenT:0,prizeT:0,prize:null,link:0,papT:0,papReturn:null,
    teleCd:0,turret:0,turretT:0,alive:0,t:0,fireSale:0,panzerDue:false});
  lightScale=.70;
  me.p=[START[0],START[1],START[2]]; me.v=[0,0,0]; me.yaw=Math.PI*.02; me.pitch=0;
  me.hp=T.hp; me.hurtT=0; me.dead=0; me.usedRevive=0;
  me.slots=[makeSlot("m1911")]; me.cur=0; me.maxSlots=2;
  me.cool=0; me.reloading=0; me.shot=0; me.idle=0; me.rcvY=0; me.rcvP=0; me.burst=0;
  me.knifeCd=0; me.nades=2; me.nadeCd=0; me.perks={}; me.points=T.startPts;
  me.kills=0; me.headshots=0; me.insta=0; me.dbl=0; me.gasT=0;
  el.ptsN.textContent=me.points; el.rndN.textContent="0";
  el.vig.style.boxShadow="inset 0 0 0 rgba(150,8,20,0)";
  paintPerks(); paintWeapon();
  navFlow(me.p[0],me.p[1],me.p[2]);
  document.body.classList.add("playing");
}
function begin(){
  audioInit();
  startS.classList.add("hide");
  overS.classList.add("hide");
  resetGame();
  running=true; last=0; layout();
  if(mode==="desk") lockPointer();
}
startS.addEventListener("click",()=>{ setMode(mode||"touch"); begin(); });
startS.addEventListener("pointerdown",e=>{ if(e.pointerType==="touch") setMode("touch"); });
document.getElementById("again").addEventListener("click",()=>{ overS.classList.add("hide"); begin(); });

/* ---------- lifecycle ------------------------------------------------------ */
addEventListener("resize",layout);
if(window.visualViewport) visualViewport.addEventListener("resize",layout);
addEventListener("orientationchange",()=>setTimeout(layout,120));
document.addEventListener("visibilitychange",()=>{
  if(document.hidden){ running=false; return; }
  if(game.state!=="playing") return;
  if(!optsS.classList.contains("hide")||!pauseS.classList.contains("hide")) return;
  if(mode==="desk"&&!locked()){ pauseS.classList.remove("hide"); return; }
  last=0; running=true;
});
/* Losing the cursor mid-round pauses, instead of letting a round farm you. */
document.addEventListener("pointerlockchange",()=>{
  if(locked()){
    pauseS.classList.add("hide");
    if(game.state==="playing"&&optsS.classList.contains("hide")){ last=0; running=true; }
    return;
  }
  firingR=false; firingL=false;
  if(mode==="desk"&&game.state==="playing"&&optsS.classList.contains("hide")&&overS.classList.contains("hide")){
    pauseS.classList.remove("hide"); running=false;
  }
});
cv.addEventListener("webglcontextlost",e=>{ e.preventDefault(); running=false;
  banner("CONTEXT LOST","reload to continue"); });

/* ---------- settings ------------------------------------------------------- */
function seg(id,get,set){
  const box=document.getElementById(id);
  const paint=()=>[...box.children].forEach(b=>b.classList.toggle("sel",b.dataset.v===String(get())));
  box.addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return;
    set(b.dataset.v); paint(); layout(); });
  paint(); return paint;
}
seg("segFire",()=>S.fire,v=>S.fire=v);
seg("segRes",()=>S.res,v=>{ S.res=parseFloat(v); if(S.res===0) dprCap=1.5; });
function applyGfx(){ S.refl=S.gfx>=2?1:0; S.shad=S.gfx>=1?1:0; }
seg("segGfx",()=>S.gfx,v=>{ S.gfx=parseInt(v); applyGfx(); });
applyGfx();
seg("segMir",()=>S.mirror,v=>S.mirror=parseInt(v));
seg("segRun",()=>S.autorun,v=>S.autorun=parseInt(v));
function slider(id,vid,get,set,fmt){
  const s=document.getElementById(id), v=document.getElementById(vid);
  if(!s) return;
  s.value=get(); v.textContent=fmt(get());
  s.addEventListener("input",()=>{ set(parseFloat(s.value)); v.textContent=fmt(get()); });
}
slider("sSens","vSens",()=>S.sens,v=>S.sens=v,v=>(v*.01).toFixed(2)+" °/px");
slider("sAssist","vAssist",()=>S.assist,v=>S.assist=v,v=>v===0?"off":v+"%");
slider("sFov","vFov",()=>S.fov,v=>S.fov=v,v=>v+"°");
slider("sMs","vMs",()=>S.msens,v=>S.msens=v,v=>(v/55).toFixed(2)+"×");
function syncOpts(){
  const a=document.getElementById("sAssist"), av=document.getElementById("vAssist");
  if(a){ a.value=S.assist; av.textContent=S.assist===0?"off":S.assist+"%"; }
}
function closeOpts(){
  optsS.classList.add("hide"); layout();
  if(game.state!=="playing") return;
  if(mode==="desk"){ lockPointer(); if(!locked()) pauseS.classList.remove("hide"); else { running=true; last=0; } }
  else { running=true; last=0; }
}
function openOpts(){
  optsS.classList.remove("hide"); running=false;
  ptr.clear(); firingL=firingR=false; stick.ax=stick.az=stick.mag=0;
  el.stick.style.opacity=0;
  for(const n of [el.fireL,el.fireR,el.reload,el.swap,el.knife,el.nade,el.use]) n.classList.remove("on");
}
document.getElementById("gear").addEventListener("click",openOpts);
document.getElementById("close").addEventListener("click",closeOpts);
document.getElementById("resume").addEventListener("click",lockPointer);
document.getElementById("popts").addEventListener("click",()=>{
  pauseS.classList.add("hide"); optsS.classList.remove("hide"); running=false; });
pauseS.addEventListener("click",e=>{ if(e.target===pauseS) lockPointer(); });
optsS.addEventListener("click",e=>{ if(e.target===optsS) closeOpts(); });
document.getElementById("helpBtn").addEventListener("click",()=>{
  optsS.classList.add("hide"); helpS.classList.remove("hide"); });
document.getElementById("helpClose").addEventListener("click",()=>{
  helpS.classList.add("hide"); optsS.classList.remove("hide"); });

/* ---------- boot ----------------------------------------------------------- */
navBuild();
refreshRooms();
navFlow(me.p[0],me.p[1],me.p[2]);
setMode((window.matchMedia&&matchMedia("(pointer: fine)").matches&&!navigator.maxTouchPoints)?"desk":"touch");
layout();
paintWeapon();
requestAnimationFrame(frame);

/* The headless harness reaches in here to drive frames and assert on state.
   It is the only reason anything in this file is reachable from outside. */
if(typeof globalThis!=="undefined") globalThis.__kino={
  T,S,game,me,zoms,gl,cv,NAV,ROOM,DOORS,USABLES,BARRIERS,LIGHTS,KIND,WEAPONS,PERKS,boxes,
  simulate,render,hud,layout,begin,resetGame,spawnZom,doUse,shoot,reload,knife,throwNade,
  nearestUse,navNode,navFlow,roomAt,giveWeapon,wstat,curSlot,powerOn,packAPunch,swapWeapon,
  startRound,addPoints,openBox,mbox,prog,U,NB,shadowOK,drops,clouds,projs,rndSeed,
  bodyBox,headBox,roundHealth,roundCount,takeDrop,step,castMap,los,clearAt,groundAt,makeSlot,
  /* The harness drives the same inputs a thumb would, rather than writing to
     the player's velocity, so what it exercises is the game and not a mock. */
  keys, stick,
  setFire(v){ firingR=!!v; },
  tapUse(){ useTapped=true; },
  setTime(t){ tNow=t; },
  setState(v){ game.state=v; },
  set state(v){ game.state=v; }, get state(){ return game.state; },
};
