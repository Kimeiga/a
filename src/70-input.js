/* ============================================================================
   CONTROLS

   Rendering has right answers. Touch controls have trade-offs, and the
   trade-offs are the design. Screen space is the scarce resource: every
   control eats pixels you are trying to see through, and this mode needs more
   verbs than an arena shooter did — buy, swap, knife, grenade — so the ones
   that are not always relevant are not always there.

   Two rules carry most of it. The stick spawns wherever your thumb lands and
   its origin follows past the rim, so you never run out of travel mid-turn.
   And the trigger is a real hit target that doubles as the aim origin: start
   the drag on it and you fire and aim in one gesture, touch anywhere else on
   the right and you aim for free. The first version fired from the whole right
   half, which meant looking always spent a bullet.
   ========================================================================== */
const el={
  stick:document.getElementById("stick"), knob:document.querySelector("#stick i"),
  fireL:document.getElementById("fireL"), fireR:document.getElementById("bFireR"),
  jump:document.getElementById("bJump"), reload:document.getElementById("bReload"),
  swap:document.getElementById("bSwap"), knife:document.getElementById("bKnife"),
  nade:document.getElementById("bNade"), use:document.getElementById("bUse"),
  nadeN:document.getElementById("nadeN"),
  ammo:document.getElementById("ammo"), mag:document.getElementById("mag"), res:document.getElementById("res"),
  wname:document.getElementById("wname"), nades:document.getElementById("nades"),
  cross:document.getElementById("cross"), hitmark:document.getElementById("hitmark"),
  ptsN:document.getElementById("ptsN"), ptsFly:document.getElementById("ptsFly"),
  perks:document.getElementById("perks"), rnd:document.getElementById("rnd"), rndN:document.getElementById("rndN"),
  left:document.getElementById("left"), diag:document.getElementById("diag"),
  vig:document.getElementById("vig"), gas:document.getElementById("gas"),
  banner:document.getElementById("banner"), bt:document.getElementById("bt"), bs:document.getElementById("bs"),
  pwrup:document.getElementById("pwrup"), pwt:document.getElementById("pwt"),
  use2:document.getElementById("use"), useT:document.getElementById("useT"), useS:document.getElementById("useS"),
  keyhud:document.getElementById("keyhud"), ovR:document.getElementById("ovR"), ovS:document.getElementById("ovS"),
};
const pad=document.getElementById("pad");
let W=0,H=0,DPR=1,dprCap=1.5;
const zones={};
function mx(x){ return S.mirror ? W-x : x; }

function layout(){
  W=window.innerWidth; H=window.innerHeight;
  const st=getComputedStyle(document.getElementById("ui"));
  const padL=parseFloat(st.paddingLeft)||0, padR=parseFloat(st.paddingRight)||0, padB=parseFloat(st.paddingBottom)||0;
  const L=padL+10, R=W-padR-10, Bm=H-padB-10;

  const fr=Math.round(clamp(H*.095,30,42));   // trigger
  const sr=Math.round(clamp(H*.055,17,24));   // satellites
  const colX=R-sr-4, gap=sr*2+9;
  const tx=colX-sr-fr-12, ty=Bm-fr-20;

  zones.fireR ={x:mx(tx),           y:ty,                r:fr};
  zones.jump  ={x:mx(colX),         y:Bm-sr-6,           r:sr};
  zones.reload={x:mx(colX),         y:Bm-sr-6-gap,       r:sr};
  zones.swap  ={x:mx(colX),         y:Bm-sr-6-gap*2,     r:sr};
  zones.knife ={x:mx(tx-fr-sr-6),   y:Bm-sr-8,           r:sr};
  zones.nade  ={x:mx(tx-fr-sr+2),   y:Bm-sr-8-gap,       r:sr};
  zones.use   ={x:mx(tx),           y:ty-fr-sr-12,       r:Math.round(sr*1.22)};
  zones.fireL ={x:mx(L+sr+14),      y:Math.round(H*.52), r:Math.round(fr*.76)};
  zones.stickZone={x0:S.mirror?W*.55:0, x1:S.mirror?W:W*.45, y0:H*.26, y1:H};
  zones.lookZone ={x0:S.mirror?0:W*.45, x1:S.mirror?W*.45:W, y0:0, y1:H};

  const place=(node,z)=>{node.style.left=(z.x-z.r)+"px"; node.style.top=(z.y-z.r)+"px";
    node.style.width=node.style.height=(z.r*2)+"px";};
  place(el.fireR,zones.fireR); place(el.jump,zones.jump); place(el.reload,zones.reload);
  place(el.swap,zones.swap); place(el.knife,zones.knife); place(el.nade,zones.nade);
  place(el.use,zones.use); place(el.fireL,zones.fireL);
  el.ammo.style.left=(mx(tx)-70)+"px"; el.ammo.style.width="140px";
  el.ammo.style.top=(mode==="desk"?Bm-76:ty-fr-46)+"px";
  el.nades.style.left=(mx(tx)-70)+"px"; el.nades.style.width="140px";
  el.nades.style.textAlign="center";
  el.nades.style.top=(mode==="desk"?Bm-30:ty-fr-64)+"px";
  el.use2.style.bottom=(mode==="desk"?"20%":(H-(ty-fr-sr-46))/H*100+"%");

  /* DPR: an iPhone at native is three million pixels on a palm-sized screen.
     Capping it is the single highest-leverage dial on mobile web, and Auto
     moves the cap from the frame time rather than from a guess. */
  const native=window.devicePixelRatio||1;
  const cap = S.res===0 ? dprCap : S.res===2 ? native : S.res===1 ? 1.5 : .8;
  DPR=Math.max(.5, Math.min(native, cap));
  cv.width=Math.round(W*DPR); cv.height=Math.round(H*DPR);
  gl.viewport(0,0,cv.width,cv.height);
  reflAlloc(cv.width*.5, cv.height*.5);
}
function inCircle(x,y,z){ return (x-z.x)**2+(y-z.y)**2 <= (z.r*1.16)**2; }

const ptr=new Map();
let stick={ax:0,az:0,mag:0}, firingR=false, firingL=false, jumpQ=false, oneShot=false;
let useTapped=false, useHeld=false, sprintQ=false;

function roleAt(x,y){
  if(!el.use.classList.contains("hidden") && inCircle(x,y,zones.use)) return "use";
  if(inCircle(x,y,zones.jump))   return "jump";
  if(inCircle(x,y,zones.reload)) return "reload";
  if(inCircle(x,y,zones.swap))   return "swap";
  if(inCircle(x,y,zones.knife))  return "knife";
  if(inCircle(x,y,zones.nade))   return "nade";
  if(inCircle(x,y,zones.fireL))  return "fireL";
  if(inCircle(x,y,zones.fireR))  return "firelook";
  const sz=zones.stickZone;
  if(x>=sz.x0&&x<=sz.x1&&y>=sz.y0) return "stick";
  const lz=zones.lookZone;
  if(x>=lz.x0&&x<=lz.x1) return "look";
  return null;
}
function down(id,x,y){
  audioInit();
  const role=roleAt(x,y); if(!role) return;
  ptr.set(id,{role,x,y,ox:x,oy:y,t0:performance.now(),moved:0});
  if(role==="stick"){ el.stick.style.opacity=1; el.stick.style.left=(x-56)+"px"; el.stick.style.top=(y-56)+"px"; }
  if(role==="fireL"){ firingL=true; el.fireL.classList.add("on"); }
  if(role==="jump"){ jumpQ=true; el.jump.classList.add("on"); }
  if(role==="reload"){ reload(); el.reload.classList.add("on"); }
  if(role==="swap"){ swapWeapon(); el.swap.classList.add("on"); }
  if(role==="knife"){ knife(); el.knife.classList.add("on"); }
  if(role==="nade"){ throwNade(); el.nade.classList.add("on"); }
  if(role==="use"){ useTapped=true; useHeld=true; el.use.classList.add("on"); }
  if(role==="firelook"){
    if(S.fire==="semi") oneShot=true; else firingR=true;
    el.fireR.classList.add("on");
  }
}
function move(id,x,y){
  const t=ptr.get(id); if(!t) return;
  const dx=x-t.x, dy=y-t.y;
  t.moved+=Math.abs(dx)+Math.abs(dy); t.x=x; t.y=y;
  if(t.role==="look"||t.role==="firelook"){
    const k=S.sens*.01;
    me.yaw  += dx*k*Math.PI/180;
    me.pitch = clamp(me.pitch - dy*k*Math.PI/180, -1.45, 1.45);
  } else if(t.role==="stick"){
    let ox=parseFloat(el.stick.style.left)+56, oy=parseFloat(el.stick.style.top)+56;
    let vx=x-ox, vy=y-oy, d=Math.hypot(vx,vy);
    const R=52;
    if(d>R){                                   // the origin follows the thumb
      ox+=vx*(1-R/d); oy+=vy*(1-R/d);
      el.stick.style.left=(ox-56)+"px"; el.stick.style.top=(oy-56)+"px";
      vx=x-ox; vy=y-oy; d=R;
    }
    const dz=7, m=d<dz?0:Math.min(1,(d-dz)/(R-dz));
    const a=Math.atan2(vy,vx);
    el.knob.style.transform=`translate(${Math.cos(a)*d}px,${Math.sin(a)*d}px)`;
    stick.ax=Math.cos(a)*m; stick.az=Math.sin(a)*m; stick.mag=m;
  }
}
function up(id){
  const t=ptr.get(id); if(!t) return; ptr.delete(id);
  if(t.role==="stick"){ el.stick.style.opacity=0; el.stick.classList.remove("run");
    stick.ax=stick.az=stick.mag=0; el.knob.style.transform=""; }
  if(t.role==="fireL"){ firingL=false; el.fireL.classList.remove("on"); }
  if(t.role==="jump"){ el.jump.classList.remove("on"); }
  if(t.role==="reload"){ el.reload.classList.remove("on"); }
  if(t.role==="swap"){ el.swap.classList.remove("on"); }
  if(t.role==="knife"){ el.knife.classList.remove("on"); }
  if(t.role==="nade"){ el.nade.classList.remove("on"); }
  if(t.role==="use"){ useHeld=false; el.use.classList.remove("on"); }
  if(t.role==="firelook"){ firingR=false; el.fireR.classList.remove("on"); }
}

/* ---------- input mode ----------------------------------------------------
   Decided by the input actually used, not by sniffing the device, so a
   touchscreen laptop or a tablet with a trackpad lands in the right place and
   can switch mid-session. */
let mode="";
function setMode(m){
  if(mode===m) return;
  mode=m;
  document.body.classList.toggle("desk",m==="desk");
  if(m==="desk") S.assist=0;
  syncOpts(); layout();
}
pad.addEventListener("pointerdown",e=>{
  if(e.pointerType!=="touch"){ setMode("desk"); return; }
  setMode("touch");
  pad.setPointerCapture&&pad.setPointerCapture(e.pointerId);
  down(e.pointerId,e.clientX,e.clientY); e.preventDefault();
},{passive:false});
pad.addEventListener("pointermove",e=>{ if(e.pointerType!=="touch") return;
  move(e.pointerId,e.clientX,e.clientY); e.preventDefault(); },{passive:false});
pad.addEventListener("pointerup",e=>{ if(e.pointerType!=="touch") return;
  up(e.pointerId); e.preventDefault(); },{passive:false});
pad.addEventListener("pointercancel",e=>up(e.pointerId));
document.addEventListener("gesturestart",e=>e.preventDefault());
document.addEventListener("contextmenu",e=>e.preventDefault());
document.addEventListener("dblclick",e=>e.preventDefault());

/* ---------- desktop -------------------------------------------------------- */
const keys={};
const locked=()=>document.pointerLockElement===cv;
function lockPointer(){
  if(locked()||!cv.requestPointerLock) return;
  const r=cv.requestPointerLock();
  if(r&&r.catch) r.catch(()=>{});       // Chrome briefly refuses right after Esc
}
const DKEY={KeyW:1,KeyA:1,KeyS:1,KeyD:1,Space:1,KeyR:1,KeyF:1,KeyE:1,KeyQ:1,KeyV:1,KeyG:1,ShiftLeft:1};
addEventListener("keydown",e=>{
  if(DKEY[e.code]) setMode("desk");
  if(e.repeat) return;
  keys[e.code]=1;
  if(e.code==="Space") e.preventDefault();
  if(e.code==="KeyR") reload();
  if(e.code==="KeyQ") swapWeapon();
  if(e.code==="KeyV") knife();
  if(e.code==="KeyG") throwNade();
  if(e.code==="KeyF"||e.code==="KeyE"){ useTapped=true; useHeld=true; }
});
addEventListener("keyup",e=>{
  keys[e.code]=0;
  if(e.code==="KeyF"||e.code==="KeyE") useHeld=false;
});
addEventListener("mousemove",e=>{
  if(!locked()) return;
  const k=S.msens*.00004;
  me.yaw+=e.movementX*k;
  me.pitch=clamp(me.pitch-e.movementY*k,-1.45,1.45);
});
addEventListener("mousedown",e=>{
  if(mode!=="desk") return;
  audioInit();
  if(!locked()){ lockPointer(); return; }
  if(e.button===0){ if(S.fire==="semi") oneShot=true; else firingR=true; }
  if(e.button===2) knife();
});
addEventListener("mouseup",e=>{ if(e.button===0) firingR=false; });
addEventListener("wheel",e=>{ if(mode==="desk"&&locked()) swapWeapon(); },{passive:true});
