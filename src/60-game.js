/* ============================================================================
   THE GAME — rounds, points, and everything you can spend them on.

   Zombies is an economy, and the economy is the difficulty curve. You are
   given a pistol and a locked building, and the only way out is to shoot
   things enough times to afford the next door. Hits pay ten, a body kill
   sixty, a headshot a hundred — which is why shooting a zombie four times and
   then killing it is worth more than killing it once, and why the mode teaches
   you to be economical with a weapon you would rather be spraying.
   ========================================================================== */
const game={
  state:"attract",              // attract | playing | over
  round:0, left:0, toSpawn:0, spawnT:0, breakT:0,
  power:false, boxUses:0, boxOpenT:0, prizeT:0, prize:null,
  link:0, papT:0, papReturn:null, teleCd:0,
  turret:0, turretT:0, alive:0, best:0, t:0,
  hint:"", hintT:0,
};

/* Published curve: 150 at round one, a hundred a round through nine, then a
   multiplier. Treyarch uses 1.1 with four players' worth of damage in the
   room; alone, 1.15 is what keeps round thirty from taking ten minutes. */
function roundHealth(){
  const r=game.round;
  let h=T.hp0+T.hpStep*(r-1);
  if(r>9) h=(T.hp0+T.hpStep*8)*Math.pow(T.hpMul,r-9);
  return h;
}
function roundSpeed(){ return clamp(.62+game.round*.055, .62, 1.55); }
function roundCount(){
  const r=game.round;
  return Math.min(Math.round(5+r*2.6+r*r*.06), 44);
}
function isDogRound(r){ return r===5 || r===11 || (r>11 && (r-11)%7===0); }
function isPanzerRound(r){ return r>=13 && (r-13)%6===0; }

/* What a round is made of. The mix is the difficulty, more than the numbers:
   round six stops being walkers, round eight starts exploding, and round ten
   starts shooting back. */
function rollKind(){
  const r=game.round;
  if(isDogRound(r)) return "hound";
  const x=rnd();
  let p=0;
  if(r>=10 && (p+=.10) > x) return "spitter";
  if(r>=7  && (p+=.11) > x) return "flyer";
  if(r>=8  && (p+=.14) > x) return "crawler";
  const runnerP = clamp((r-3)*.09, 0, .78);
  return rnd()<runnerP ? "runner" : "walker";
}

function startRound(){
  game.round++;
  game.left=roundCount();
  game.toSpawn=game.left;
  game.spawnT=isDogRound(game.round)?1.6:.6;
  game.breakT=0;
  if(isPanzerRound(game.round)){ game.toSpawn++; game.left++; game.panzerDue=true; }
  el.rnd.classList.remove("flash"); void el.rnd.offsetWidth; el.rnd.classList.add("flash");
  el.rndN.textContent=game.round;
  sfxRound();
  if(isDogRound(game.round)) banner("HOUNDS","they are faster than you");
  else if(isPanzerRound(game.round)) banner("ROUND "+game.round,"something heavy is coming");
  else banner("ROUND "+game.round,"");
  game.best=Math.max(game.best,game.round);
}
function roundTick(dt){
  if(game.state!=="playing") return;
  if(game.round===0){ startRound(); return; }
  const aliveN=zoms.reduce((a,z)=>a+(z.alive&&z.state!=="die"?1:0),0);
  game.alive=aliveN;
  if(game.toSpawn>0){
    game.spawnT-=dt;
    const cap=Math.min(T.maxAlive, isDogRound(game.round)?10:T.maxAlive);
    if(game.spawnT<=0 && aliveN<cap){
      if(game.panzerDue && game.toSpawn<=1){ spawnZom("panzer"); game.panzerDue=false; }
      else spawnZom(rollKind());
      game.toSpawn--;
      game.spawnT=Math.max(T.spawnGapMin, T.spawnGap0*Math.pow(.92,game.round))*rrange(.7,1.3);
    }
  } else if(aliveN===0 && game.left<=0){
    game.breakT+=dt;
    if(game.breakT>=T.roundBreak) startRound();
  }
}

/* ---------- points --------------------------------------------------------- */
function addPoints(n){
  if(me.dbl>0) n*=2;
  n=Math.round(n);
  me.points+=n;
  flyPoints(n);
  el.ptsN.textContent=me.points;
}
function spend(n){
  if(me.points<n){ deny(); return false; }
  me.points-=n; el.ptsN.textContent=me.points; return true;
}

/* ---------- interaction ---------------------------------------------------
   One prompt, one button. Everything you can buy answers the same question —
   what is the nearest thing in range that I could pay for — so the entire
   economy fits behind a single contextual key. */
function nearestUse(){
  const px=me.p[0], py=me.p[1], pz=me.p[2];
  let best=null, bd=1e9;
  const test=(o,d,r)=>{ if(d<r && d<bd){ bd=d; best=o; } };

  for(const d of DOORS){
    if(d.open) continue;
    const dd=Math.hypot(d.x-px, d.z-pz) + Math.abs(d.mid[1]-py)*1.4;
    test({t:"door",d,cost:d.cost,name:d.label,sub:"opens the "+ROOM[d.b].name.toLowerCase()}, dd, 3.4);
  }
  for(const u of USABLES){
    if(u.t==="pap" && game.papT<=0) continue;
    if(u.t==="box" && mbox.moving>0) continue;
    const dd=Math.hypot(u.x-px, u.z-pz) + Math.abs(u.y-py)*1.4;
    test({t:u.t,u,cost:u.cost,name:u.name,sub:u.sub||""}, dd, u.rad);
  }
  for(const b of BARRIERS){
    if(b.boards>=b.max) continue;
    if(!ROOM[b.room].open) continue;
    const dd=Math.hypot(b.x-px,b.z-pz)+Math.abs((b.y||0)-py)*1.4;
    test({t:"repair",b,cost:0,name:"REPAIR BARRICADE",sub:"+"+T.ptRepair+" a board"}, dd, 2.6);
  }
  if(!best) return null;

  /* Decorate with the state that decides whether the prompt is gold or red. */
  const o=best;
  if(o.t==="perk"){
    if(me.perks[o.u.key]) return {...o, name:o.u.name, sub:"already have it", cost:0, dead:1};
    if(!game.power) return {...o, sub:"needs the power on", cost:0, dead:1};
    if(Object.keys(me.perks).length>=4) return {...o, sub:"four perks is the limit", cost:0, dead:1};
  }
  if(o.t==="wall"){
    const W=WEAPONS[o.u.key];
    const owned=me.slots.find(s=>s.key===o.u.key);
    if(owned) return {...o, cost:W.ammo||250, sub:"refill the reserve", ammo:1};
    return {...o, sub:"take it off the wall"};
  }
  if(o.t==="box"){
    if(game.prize) return {...o, name:"TAKE "+wstat(game.prize).n, cost:0, sub:"or leave it"};
    if(game.boxOpenT>0) return {...o, name:"...", cost:0, dead:1, sub:""};
    return {...o, cost:game.fireSale>0?10:T.costBox, sub:"nine hundred and fifty, or a bear"};
  }
  if(o.t==="power") return {...o, sub: game.power?"already on":"turn it on", dead:game.power?1:0};
  if(o.t==="mainframe"){
    if(!game.power) return {...o, sub:"needs the power on", dead:1};
    if(game.link>0) return {...o, name:"LINKED", sub:"get to the stage", dead:1};
    return {...o, sub:"link it, then use the stage"};
  }
  if(o.t==="teleporter"){
    if(!game.power) return {...o, sub:"needs the power on", dead:1};
    if(game.teleCd>0) return {...o, sub:"cooling down", dead:1};
    if(game.link<=0) return {...o, sub:"link the mainframe first", dead:1};
    return {...o, sub:"to the projector room"};
  }
  if(o.t==="pap") return {...o, sub:"upgrade what you are holding"};
  if(o.t==="trap"){
    if(!game.power) return {...o, sub:"needs the power on", dead:1};
    if(o.u.on>0) return {...o, sub:"running", dead:1};
    if(o.u.cd>0) return {...o, sub:"recharging", dead:1};
  }
  if(o.t==="turret"){
    if(!game.power) return {...o, sub:"needs the power on", dead:1};
    if(game.turret>0) return {...o, sub:"running", dead:1};
  }
  if(o.t==="nades") return {...o, sub:"four frags"};
  return o;
}

function doUse(){
  const o=nearestUse();
  if(!o||o.dead){ if(o) deny(); return; }
  if(o.cost>0 && !spend(o.cost)) return;

  switch(o.t){
    case "door":
      o.d.open=true;
      rebuildDoors(); refreshRooms(); navFlow(me.p[0],me.p[1],me.p[2]);
      sfxBoom(.22); jingle([330,440,554],.13);
      banner(o.d.label,"opened");
      break;
    case "repair": {
      const b=o.b; b.boards=Math.min(b.max,b.boards+1); addPoints(T.ptRepair);
      sfxClick(.2,1500);
      break; }
    case "perk": {
      const P=PERKS[o.u.key];
      me.perks[o.u.key]=1;
      if(o.u.key==="mule"){ me.maxSlots=3; }
      if(o.u.key==="jug") me.hp=Math.min(T.hp*T.jugMul, me.hp+T.hp);
      jingle([392,494,587,784],.18);
      banner(P.n, P.why);
      paintPerks();
      break; }
    case "wall": {
      const W=WEAPONS[o.u.key];
      if(o.ammo){
        const s=me.slots.find(s=>s.key===o.u.key);
        s.res=wstat(s).resMax; sfxClick(.2,1200); banner("AMMO","reserve full");
      } else {
        giveWeapon(o.u.key);
        banner(W.n,"off the wall");
      }
      break; }
    case "nades":
      me.nades=Math.min(T.nadeMax, me.nades+4); sfxClick(.2,900); banner("FRAGS","x"+me.nades);
      break;
    case "box":
      if(game.prize){ giveWeapon(game.prize.key); banner(wstat(game.prize).n,"taken"); game.prize=null; }
      else openBox();
      break;
    case "power": powerOn(); break;
    case "mainframe":
      game.link=T.teleLink; sfxTele(.3);
      banner("MAINFRAME LINKED", T.teleLink+" seconds to the stage");
      break;
    case "teleporter": teleport(); break;
    case "pap": packAPunch(); break;
    case "trap":
      o.u.on=30; sfxZap(.35); banner("TRAP LIVE","thirty seconds");
      break;
    case "turret":
      game.turret=30; game.turretT=0; sfxClick(.3,700); banner("TURRET","thirty seconds");
      break;
  }
}

function giveWeapon(key){
  const have=me.slots.findIndex(s=>s.key===key);
  if(have>=0){ me.slots[have].res=wstat(me.slots[have]).resMax; return; }
  if(me.slots.length<me.maxSlots){ me.slots.push(makeSlot(key)); me.cur=me.slots.length-1; }
  else me.slots[me.cur]=makeSlot(key);
  me.reloading=0; me.shot=0; me.cool=.25;
  sfxClick(.24,800);
  paintWeapon();
}

/* ---------- the mystery box ------------------------------------------------
   Nine hundred and fifty points for a weapon you did not choose. The bear is
   what makes it a gamble rather than a shop: after enough uses the box leaves,
   and it takes your nine hundred and fifty with it. */
function openBox(){
  game.boxOpenT=3.0;
  mbox.rolling=1;
  game.boxUses++;
  jingle([523,659,784,1047,784,659],.10,"sine");
}
function boxTick(dt){
  if(game.boxOpenT>0){
    game.boxOpenT-=dt;
    if(game.boxOpenT<=0){
      mbox.rolling=0;
      /* The bear gets likelier the longer the box has stayed put. */
      const p=clamp((game.boxUses-3)/(T.boxMoves+2), 0, .55);
      if(rnd()<p){
        game.prize=null; mbox.moving=3.2; game.boxUses=0;
        jingle([880,740,622,494,392],.16,"sine");
        banner("TEDDY BEAR","the box has moved");
      } else {
        let tot=0; for(const e of BOX_POOL) tot+=e[1];
        let r=rnd()*tot, key=BOX_POOL[0][0];
        for(const e of BOX_POOL){ r-=e[1]; if(r<=0){ key=e[0]; break; } }
        game.prize=makeSlot(key); game.prizeT=8;
        const W=WEAPONS[key];
        if(key==="raygun"||key==="thunder"){ jingle([523,659,784,1047,1319],.22); banner(W.n,"you got lucky"); }
      }
    }
  }
  /* Taking it is handled by doUse, like every other prompt. It only expires
     here — walk away and the box keeps it. */
  if(game.prize){
    game.prizeT-=dt;
    if(game.prizeT<=0) game.prize=null;
  }
  if(mbox.moving>0){
    mbox.moving-=dt;
    if(mbox.moving<=0){
      let i=mbox.spot;
      /* only move to a room you can actually reach */
      for(let k=0;k<24;k++){ const j=(rnd()*BOX_SPOTS.length)|0;
        if(j!==mbox.spot && ROOM[BOX_SPOTS[j].room].open){ i=j; break; } }
      placeBox(i);
      banner("THE BOX IS IN THE "+ROOM[mbox.room].name.toUpperCase(),"");
    }
  }
}

function powerOn(){
  game.power=true;
  lightScale=1.05;
  sfxPower();
  banner("POWER ON","perks, traps and the teleporter");
}
function teleport(){
  game.link=0; game.teleCd=T.teleCd;
  game.papReturn=[-9.6,0,-13.6];
  me.p=[54,0,53.6]; me.v=[0,0,0]; me.yaw=Math.PI*1.5;
  game.papT=T.papTime;
  sfxTele(.45);
  banner("PROJECTOR ROOM", T.papTime+" seconds");
}
function teleBack(){
  const r=game.papReturn||[-9.6,0,-13.6];
  me.p=[r[0],r[1],r[2]]; me.v=[0,0,0]; me.yaw=Math.PI*.5;
  game.papT=0; sfxTele(.45);
  banner("BACK IN THE LOBBY","");
}
function packAPunch(){
  const s=curSlot();
  if(s.pap){ deny(); banner("ALREADY UPGRADED",""); me.points+=T.costPaP; el.ptsN.textContent=me.points; return; }
  s.pap=1;
  const st=wstat(s);
  s.mag=st.mag; s.res=st.resMax;
  jingle([392,523,659,784,1047],.22);
  banner(st.n,"packed a punch");
  paintWeapon();
}

/* ---------- power-ups -----------------------------------------------------
   They drop rarely and they are the only thing in the mode that is free, so
   the round you get a Max Ammo is the round you stop being careful. */
const DROP_KINDS=[["ammo",26],["insta",17],["dbl",20],["nuke",13],["carp",12],["sale",8]];
function maybeDrop(x,y,z){
  if(rnd()>T.dropChance) return;
  let tot=0; for(const d of DROP_KINDS) tot+=d[1];
  let r=rnd()*tot, k=DROP_KINDS[0][0];
  for(const d of DROP_KINDS){ r-=d[1]; if(r<=0){ k=d[0]; break; } }
  spawnDrop(x,y,z,k);
}
function spawnDrop(x,y,z,kind){
  drops.push({x,y:groundAt(x,y+.5,z)+.55,z,kind,t:T.dropLife,spin:0});
}
const DROPINFO={
  ammo:{n:"MAX AMMO", c:[1,.85,.25]}, insta:{n:"INSTA-KILL", c:[1,.25,.25]},
  dbl:{n:"DOUBLE POINTS", c:[.35,.75,1]}, nuke:{n:"NUKE", c:[.55,1,.35]},
  carp:{n:"CARPENTER", c:[.85,.60,.30]}, sale:{n:"FIRE SALE", c:[1,.45,.85]},
};
function dropTick(dt){
  for(let i=drops.length-1;i>=0;i--){
    const d=drops[i]; d.t-=dt; d.spin+=dt*2.4;
    if(me.dead<=0 && Math.hypot(d.x-me.p[0],d.z-me.p[2])<1.9 && Math.abs(d.y-me.p[1]-.8)<1.7){
      takeDrop(d.kind); drops.splice(i,1); continue;
    }
    if(d.t<=0) drops.splice(i,1);
  }
  me.insta=Math.max(0,me.insta-dt);
  me.dbl=Math.max(0,me.dbl-dt);
  game.fireSale=Math.max(0,(game.fireSale||0)-dt);
}
function takeDrop(kind){
  const I=DROPINFO[kind];
  jingle([659,880,1175],.2);
  powerBanner(I.n);
  switch(kind){
    case "ammo": for(const s of me.slots) s.res=wstat(s).resMax; me.nades=T.nadeMax; break;
    case "insta": me.insta=T.dropDur; break;
    case "dbl": me.dbl=T.dropDur; break;
    case "nuke": {
      let n=0;
      for(const z of zoms) if(z.alive&&z.state!=="die"&&!KIND[z.kind].boss){ killZom(z,false,true); n++; }
      addPoints(400); sfxBoom(.6,true);
      break; }
    case "carp": for(const b of BARRIERS) b.boards=b.max; addPoints(200); break;
    case "sale": game.fireSale=T.dropDur; break;
  }
}

/* ---------- traps and the turret ------------------------------------------ */
function trapTick(dt){
  for(const u of USABLES){
    if(u.t!=="trap") continue;
    if(u.cd>0) u.cd-=dt;
    if(u.on<=0) continue;
    u.on-=dt;
    if(u.on<=0){ u.cd=18; continue; }
    const V=u.vol;
    for(const z of zoms){
      if(!z.alive||z.state==="die") continue;
      if(z.p[0]>V[0]&&z.p[0]<V[3]&&z.p[2]>V[2]&&z.p[2]<V[5]&&z.p[1]<V[4])
        damageZom(z, 4000, false, true, true);
    }
    if(rnd()<dt*7) sfxZap(dvol([u.x,u.y,u.z],.10,24));
  }
  if(game.turret>0){
    game.turret-=dt; game.turretT-=dt;
    if(game.turretT<=0){
      game.turretT=.11;
      const o=[-11.4,3.2,21.6];
      let best=null,bd=1e9;
      for(const z of zoms){
        if(!z.alive||z.state==="die") continue;
        const c=[z.p[0],z.p[1]+KIND[z.kind].h*.6,z.p[2]];
        const d=Math.hypot(c[0]-o[0],c[1]-o[1],c[2]-o[2]);
        if(d<bd&&d<34&&los(o,c)){ bd=d; best=z; }
      }
      if(best){
        const c=[best.p[0],best.p[1]+KIND[best.kind].h*.6,best.p[2]];
        tracer(o,c,[1,.8,.4],.05);
        damageZom(best, 190, false, true, false);
        gunshot("lmg", dvol(o,.10,34));
      }
    }
  }
}

/* ---------- combat --------------------------------------------------------- */
function bestTarget(maxDeg){
  const e=eyeOf(me), f=fwd(me.yaw,me.pitch);
  let best=null, ba=maxDeg*Math.PI/180;
  for(const z of zoms){
    if(!z.alive||z.state==="die") continue;
    const k=KIND[z.kind];
    const c=[z.p[0], z.p[1]+k.h*.62, z.p[2]];
    const d=[c[0]-e[0],c[1]-e[1],c[2]-e[2]], L=Math.hypot(d[0],d[1],d[2]);
    if(L>42) continue;
    const ang=Math.acos(clamp((d[0]*f[0]+d[1]*f[1]+d[2]*f[2])/L,-1,1));
    if(ang<ba && los(e,c)){ ba=ang; best={z,ang,dist:L,c}; }
  }
  return best;
}
function reload(){
  const s=curSlot(), st=wstat(s);
  if(me.reloading>0||s.mag>=st.mag||s.res<=0||me.dead>0) return;
  me.reloading = st.reload * (me.perks.speed?.5:1);
  me.reloadOf = me.cur;
  sfxClick(.18,900);
}
function swapWeapon(){
  if(me.slots.length<2||me.dead>0) return;
  me.cur=(me.cur+1)%me.slots.length;
  me.reloading=0; me.cool=.35; me.shot=0;
  sfxClick(.18,600);
  paintWeapon();
}
function fireLine(spreadDeg){
  const f=fwd(me.yaw,me.pitch);
  if(!spreadDeg) return f;
  /* Shotguns are the one place a cone is honest, because the cone IS the
     weapon. Everything else leaves on the exact line the dot is on. */
  const b=basis(me.yaw,me.pitch);
  const a=rnd()*TAU, r=Math.sqrt(rnd())*spreadDeg*Math.PI/180;
  const sx=Math.cos(a)*r, sy=Math.sin(a)*r;
  const d=[f[0]+b[1][0]*sx+b[2][0]*sy, f[1]+b[1][1]*sx+b[2][1]*sy, f[2]+b[1][2]*sx+b[2][2]*sy];
  const L=Math.hypot(d[0],d[1],d[2]);
  return [d[0]/L,d[1]/L,d[2]/L];
}
function hitscan(e,d,dmg,hs,range){
  let t=castMap(e,d,range||90), z=null, part=0;
  for(const q of zoms){
    if(!q.alive||q.state==="die") continue;
    const th=rayBox(e,d,headBox(q)); if(th>=0&&th<t){ t=th; z=q; part=2; }
    const tb=rayBox(e,d,bodyBox(q)); if(tb>=0&&tb<t){ t=tb; z=q; part=1; }
    const tl=rayBox(e,d,legBox(q));  if(tl>=0&&tl<t){ t=tl; z=q; part=0; }
  }
  const end=[e[0]+d[0]*t, e[1]+d[1]*t, e[2]+d[2]*t];
  if(z){
    const head=part===2;
    damageZom(z, dmg*(head?hs:1), head, true, false);
    spark(end, head?6:3, [.55,.10,.12]);
    sfxHit(head); flashHit(head);
  } else spark(end,2,[1,.8,.4]);
  return end;
}
function shoot(){
  if(me.dead>0||me.reloading>0||me.cool>0||game.state!=="playing") return;
  const s=curSlot(), st=wstat(s);
  if(s.mag<=0){ reload(); return; }
  s.mag--;
  const rate = st.rpm*(me.perks.dtap?1.33:1);
  me.cool = 60/rate;
  const e=eyeOf(me);
  const rc=recoilOf(st.kind, me.shot++); me.idle=0;
  me.pitch=clamp(me.pitch+rc[0],-1.45,1.45); me.yaw+=rc[1];
  me.rcvP+=rc[0]; me.rcvY+=rc[1];
  vmo.kick=1; vmo.flash=.045;
  const b=basis(me.yaw,me.pitch);
  const muzzle=[e[0]+b[1][0]*.17+b[2][0]*-.14+b[0][0]*.8,
                e[1]+b[1][1]*.17+b[2][1]*-.14+b[0][1]*.8,
                e[2]+b[1][2]*.17+b[2][2]*-.14+b[0][2]*.8];
  const dmg = st.dmg*(me.perks.dtap?1.2:1);

  if(st.kind==="ray"){
    const d=fireLine(0);
    projs.push({p:[muzzle[0],muzzle[1],muzzle[2]],
      v:[d[0]*42,d[1]*42,d[2]*42], t:2.2, dmg:st.splashDmg, r:st.splash,
      self:st.self, grav:0, col:[.35,1,.45], direct:dmg});
    raygun(.30);
  } else if(st.kind==="thunder"){
    /* The Thundergun does not shoot. It removes everything in a cone, which
       is the only correct answer to a round you have already lost. */
    thundershot(.55);
    const f=fwd(me.yaw,me.pitch);
    const cosT=Math.cos(st.cone*Math.PI/180);
    for(const q of zoms){
      if(!q.alive||q.state==="die") continue;
      const k=KIND[q.kind];
      const c=[q.p[0],q.p[1]+k.h*.5,q.p[2]];
      const d=[c[0]-e[0],c[1]-e[1],c[2]-e[2]], L=Math.hypot(d[0],d[1],d[2]);
      if(L>st.range) continue;
      if((d[0]*f[0]+d[1]*f[1]+d[2]*f[2])/L < cosT) continue;
      if(!los(e,c)) continue;
      q.v[0]+=d[0]/L*22; q.v[1]+=7; q.v[2]+=d[2]/L*22;
      damageZom(q, dmg, false, true, false);
    }
    ring(e[0]+f[0]*3, e[1], e[2]+f[2]*3, .5, 7, .35, [.6,.85,1]);
  } else {
    for(let i=0;i<st.pellets;i++){
      const d=fireLine(st.pellets>1?st.spread:0);
      const end=hitscan(e,d,dmg,st.hs);
      if(i===0||st.pellets<=2) tracer(muzzle,end);
    }
    gunshot(st.kind, .30);
  }
  if(st.burst) me.burst=st.burst-1;
}
function knife(){
  if(me.knifeCd>0||me.dead>0) return;
  me.knifeCd=T.knifeCd; vmo.knife=1;
  sfxClick(.12,3000);
  const e=eyeOf(me), f=fwd(me.yaw,me.pitch);
  let best=null,bd=1e9;
  for(const z of zoms){
    if(!z.alive||z.state==="die") continue;
    const k=KIND[z.kind];
    const c=[z.p[0],z.p[1]+k.h*.55,z.p[2]];
    const d=[c[0]-e[0],c[1]-e[1],c[2]-e[2]], L=Math.hypot(d[0],d[1],d[2]);
    if(L>T.knifeRange) continue;
    if((d[0]*f[0]+d[1]*f[1]+d[2]*f[2])/L < .55) continue;
    if(L<bd){ bd=L; best=z; }
  }
  if(best){ damageZom(best, T.knifeDmg, false, true, true); sfxFlesh(.24); flashHit(false); }
}
function throwNade(){
  if(me.nades<=0||me.dead>0||me.nadeCd>0) return;
  me.nades--; me.nadeCd=.7;
  const e=eyeOf(me), d=fwd(me.yaw,me.pitch);
  projs.push({p:[e[0]+d[0]*.5,e[1]+d[1]*.5,e[2]+d[2]*.5],
    v:[d[0]*17,d[1]*17+3.2,d[2]*17], t:T.nadeFuse, dmg:T.nadeDmg, r:T.nadeR,
    self:40, col:[1,.7,.25]});
  sfxClick(.14,700);
}

/* ---------- player damage and death ---------------------------------------- */
function hurtPlayer(n,silent){
  if(me.dead>0||game.state!=="playing") return;
  if(me.papT>0) return;                            // untouchable in the projector room
  if(me.perks.jug) n/=T.jugMul;
  me.hp-=n; me.hurtT=T.regenDelay;
  if(!silent) sfxPain();
  el.vig.style.boxShadow="inset 0 0 "+(60+90*(1-me.hp/T.hp))+"px rgba(150,8,20,"+
    clamp(.20+ .75*(1-me.hp/T.hp),.2,.95)+")";
  if(me.hp<=0) downPlayer();
}
function downPlayer(){
  me.hp=0;
  if(me.perks.revive && !me.usedRevive){
    me.usedRevive=1; delete me.perks.revive; paintPerks();
    me.hp=T.hp*.6; me.dead=0;
    me.slots=[makeSlot("m1911")]; me.cur=0;
    banner("YOU GOT BACK UP","quick revive is gone");
    jingle([392,494,587],.2);
    return;
  }
  me.dead=1; me.downs++;
  game.state="over";
  document.body.classList.remove("playing");
  el.ovR.textContent=game.round;
  el.ovS.innerHTML="<b>"+me.kills+"</b> killed &middot; <b>"+me.headshots+"</b> headshots &middot; <b>"+
    me.points+"</b> points left on the floor";
  overS.classList.remove("hide");
  running=false;
  sfxBoom(.5,true);
}
function healTick(dt){
  if(me.dead>0) return;
  if(me.hurtT>0){ me.hurtT-=dt; return; }
  const max=T.hp*(me.perks.jug?T.jugMul:1);
  if(me.hp<max){
    me.hp=Math.min(max, me.hp+T.regen*dt*(max/T.hp));
    el.vig.style.boxShadow= me.hp>=max*.98 ? "inset 0 0 0 rgba(150,8,20,0)" :
      "inset 0 0 "+(60+90*(1-me.hp/max))+"px rgba(150,8,20,"+clamp(.20+.75*(1-me.hp/max),0,.95)+")";
  }
}
