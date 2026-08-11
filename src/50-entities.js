/* ============================================================================
   ENEMIES

   Seven kinds, and every difference between them is a different answer to the
   same question: how do you close the distance?

     walker   walks.  The baseline, and eighty percent of every round.
     runner   runs.   Same thing, no longer ignorable.
     crawler  scuttles low, and bursts into Nova-6 gas when you shoot it —
              which kills its own kind, so a crawler is a trap you can aim.
     hound    four legs, faster than you are, arrives in whole rounds.
     screecher flies. The ground stops being where you should be looking.
     spitter  stops at range and shoots. Cover starts to matter.
     panzer   armoured, slow, shoots, and takes a magazine to bring down.

   They all read the same flow field, so the horde paths for the cost of one.
   ========================================================================== */
const zoms=[], projs=[], clouds=[], drops=[], gibs=[], tracers=[], rings=[], sparks=[];

const me={
  p:[START[0],START[1],START[2]], v:[0,0,0], yaw:Math.PI, pitch:0, ground:true,
  rad:T.radius, hgt:T.height,
  hp:T.hp, hurtT:0, dead:0, downed:0,
  slots:[makeSlot("m1911")], cur:0, maxSlots:2,
  cool:0, reloading:0, reloadOf:-1, shot:0, idle:0, rcvY:0, rcvP:0, burst:0,
  knifeCd:0, nades:2, nadeCd:0,
  perks:{}, points:T.startPts, kills:0, headshots:0, downs:0,
  sprint:0, stepT:0, gasT:0, teleT:0, papT:0, insta:0, dbl:0,
  bob:0, node:-1,
};
function curSlot(){ return me.slots[me.cur] || me.slots[0]; }
function bodyBox(z){ const k=KIND[z.kind]; const r=k.r*.86;
  return [z.p[0]-r, z.p[1]+k.h*.30, z.p[2]-r*.62, z.p[0]+r, z.p[1]+k.h*.86, z.p[2]+r*.62]; }
function headBox(z){ const k=KIND[z.kind]; const r=k.r*.52;
  return [z.p[0]-r, z.p[1]+k.h*.86, z.p[2]-r, z.p[0]+r, z.p[1]+k.h*1.06, z.p[2]+r]; }
function legBox(z){ const k=KIND[z.kind]; const r=k.r*.72;
  return [z.p[0]-r, z.p[1], z.p[2]-r*.7, z.p[0]+r, z.p[1]+k.h*.30, z.p[2]+r*.7]; }
function eyeOf(e){ return [e.p[0], e.p[1]+(e.hgt?T.eye:1.3), e.p[2]]; }
function zEye(z){ const k=KIND[z.kind]; return [z.p[0], z.p[1]+k.h*.9, z.p[2]]; }

/* ---------- spawning ------------------------------------------------------
   Zombies come through the barricades of rooms you have opened, biased toward
   the ones near you but never right on top of you: a round should arrive, not
   appear. */
function pickBarrier(){
  let best=null, bs=-1e9;
  for(const b of BARRIERS){
    if(!ROOM[b.room].open) continue;
    const d=Math.hypot(b.x-me.p[0], b.z-me.p[2]);
    if(d<6) continue;
    const s = -Math.abs(d-15) + rnd()*9;
    if(s>bs){ bs=s; best=b; }
  }
  if(best) return best;
  for(const b of BARRIERS) if(ROOM[b.room].open) return b;
  return BARRIERS[0];
}
function spawnZom(kind){
  const b=pickBarrier(), k=KIND[kind];
  let z=null;
  for(const q of zoms) if(!q.alive){ z=q; break; }
  if(!z){ z={}; zoms.push(z); }
  const hp = k.hp * roundHealth();
  z.alive=1; z.kind=kind; z.p=[b.sx, b.y||0, b.sz]; z.v=[0,0,0];
  z.rad=k.r; z.hgt=k.h; z.fly=k.fly?1:0;
  z.hp=hp; z.maxhp=hp; z.yaw=Math.atan2(b.dir[0],-b.dir[1]);
  z.state="enter"; z.t=k.fly?.45:1.15; z.node=-1; z.nodeT=rnd()*.3;
  z.atk=0; z.gait=rnd()*TAU; z.fire=rrange(.4,1.4); z.moan=rrange(1,6);
  z.hitT=0; z.bx=b.ix; z.bz=b.iz; z.hop=0; z.dmgTaken=0; z.lostT=0; z.bestFlat=1e9; z.bestNav=1e9;
  z.spd = k.spd * roundSpeed() * rrange(.92,1.08);
  return z;
}

/* ---------- pathing -------------------------------------------------------
   One BFS out from the player paints every waypoint with the direction home.
   A zombie reads its own node and walks at the neighbour that node points to,
   unless it can simply see you, in which case it walks at you. */
let flowT=0, flowNode=-1;
function updateFlow(dt){
  flowT-=dt;
  const n=navNode(me.p[0],me.p[1],me.p[2]);
  if(flowT<=0 || n!==flowNode){ flowNode=n; flowT=.28; navFlow(me.p[0],me.p[1],me.p[2]); }
}
function zomTarget(z,dt){
  const e=zEye(z), pe=eyeOf(me);
  const dx=me.p[0]-z.p[0], dz=me.p[2]-z.p[2];
  const flat=Math.hypot(dx,dz);
  z.see = me.dead<=0 && flat<26 && los(e,pe);
  if(z.see && flat<30) return [dx/(flat||1), dz/(flat||1), flat];
  /* Pick a point to walk at, three times a second. The waypoints describe the
     building; they do not describe the perk machine standing in the lane
     between two of them, and a body is not standing on a waypoint — it is
     somewhere between four of them. So the target is chosen by what can
     actually be seen from where the body is:

       - the node after next, if it is close and in the clear: a train follows
         a curve instead of a staircase;
       - otherwise the next node;
       - and if even that is behind something, the body's OWN node first,
         which by construction is a spot with room to stand in.

     That last case is what unsticks a horde jammed against a vending machine:
     it backs off to open floor and comes round. */
  z.nodeT-=dt;
  if(z.nodeT<=0 || z.node<0){
    z.nodeT=.30;
    /* A flyer is metres above the floor, and the waypoints are on it, so it
       has to look itself up by its shadow or it snaps to whatever happens to
       be closest in three dimensions. */
    const ny = z.fly ? groundAt(z.p[0], z.p[1], z.p[2]) : z.p[1];
    z.node=navNode(z.p[0],ny,z.p[2]);
    const nx=z.node>=0 ? NAV.next[z.node] : -1;
    if(nx<0) z.tgt=null;
    else{
      const from=[z.p[0], z.p[1]+.85, z.p[2]];
      const at=(i)=>[NAV.x[i], NAV.y[i]+.85, NAV.z[i]];
      let t=at(nx);
      const nx2=NAV.next[nx];
      if(nx2>=0 && Math.hypot(NAV.x[nx2]-z.p[0],NAV.z[nx2]-z.p[2])<6 && los(from,at(nx2))) t=at(nx2);
      else if(!los(from,t)) t=at(z.node);
      z.tgt=t;
    }
  }
  if(!z.tgt) return [dx/(flat||1), dz/(flat||1), flat];   // no route: shuffle at them
  const ox=z.tgt[0]-z.p[0], oz=z.tgt[2]-z.p[2], L=Math.hypot(ox,oz);
  if(L<.25) return [dx/(flat||1), dz/(flat||1), flat];
  return [ox/L, oz/L, flat];
}
/* Keep them out of each other. Without this a train collapses into one point
   and reads as a single very confusing zombie. */
function separate(z,dt){
  let sx=0, sz=0;
  for(const o of zoms){
    if(o===z||!o.alive||o.state==="die") continue;
    const dx=z.p[0]-o.p[0], dz=z.p[2]-o.p[2];
    const d2=dx*dx+dz*dz, r=(z.rad+o.rad)*.95;
    if(d2>r*r||d2<1e-5) continue;
    const d=Math.sqrt(d2), k=(r-d)/r;
    sx+=dx/d*k; sz+=dz/d*k;
  }
  z.p[0]+=sx*dt*5.2; z.p[2]+=sz*dt*5.2;
}

function zomTick(z,dt){
  const k=KIND[z.kind];
  if(z.state==="die"){
    z.t-=dt;
    z.p[1]=Math.max(0,z.p[1]-dt*2.2);
    if(z.t<=0) z.alive=0;
    return;
  }
  if(z.hitT>0) z.hitT-=dt;
  /* Climbing in through the boards. It is also the window in which you can
     shoot it for free, which is where a lot of early points come from. */
  if(z.state==="enter"){
    z.t-=dt;
    const f=1-Math.max(0,z.t)/(k.fly?.45:1.15);
    z.p[0]+= (z.bx-z.p[0])*Math.min(1,dt*3.4);
    z.p[2]+= (z.bz-z.p[2])*Math.min(1,dt*3.4);
    if(k.fly) z.p[1]=1.2+f*.8;
    if(z.t<=0){ z.state="walk"; z.p[0]=z.bx; z.p[2]=z.bz; }
    return;
  }
  /* Moaning, which is how you know where they are when you cannot see them. */
  z.moan-=dt;
  if(z.moan<=0){
    z.moan=rrange(3.2,8.5);
    const v=dvol(z.p, k.fly?.10:.13, 30);
    if(v>.008){ if(k.fire) howl(v*1.4); else moan(v, z.kind==="crawler"?1.6:z.kind==="panzer"?.55:1); }
  }

  const tg=zomTarget(z,dt);
  const dirx=tg[0], dirz=tg[1], flat=tg[2];

  /* Left behind? Come back in through a different window. A round ends when
     the last one dies, so a single body wedged in geometry on the far side of
     the map is not a cosmetic bug — it is a game that never continues. */
/* Track BOTH how far away it is and how far it still has to walk, and treat
     progress on either as progress. The first version switched between the two
     depending on whether it could see you, which changes the units mid-flight:
     the number jumps, "no progress" fires on a zombie that is walking perfectly
     well, and every slow kind gets teleported back to a window before it can
     ever reach you. */
  const nd = (z.node>=0 && NAV.dist[z.node]<1e8) ? NAV.dist[z.node] : 1e9;
  let gaining=false;
  if(flat < (z.bestFlat||1e9)-.5){ z.bestFlat=flat; gaining=true; }
  if(nd   < (z.bestNav ||1e9)-.5){ z.bestNav =nd;   gaining=true; }
  if(gaining) z.lostT=0;
  else { z.lostT=(z.lostT||0)+dt;
    if(z.lostT>18 && flat>5){
      const b=pickBarrier();
      z.p[0]=b.sx; z.p[1]=b.y||0; z.p[2]=b.sz; z.v=[0,0,0];
      z.bx=b.ix; z.bz=b.iz; z.state="enter"; z.t=KIND[z.kind].fly?.45:.9;
      z.lostT=0; z.bestFlat=1e9; z.bestNav=1e9; z.node=-1;
      return;
    }
  }
  /* Local avoidance. The waypoint graph knows the building; it does not know
     that a perk machine is standing in the lane between two waypoints. When a
     body has been pushing into something for a third of a second it starts
     sliding sideways along it, and commits to a side for a second and a half
     so it does not dither in the corner. Without this the whole horde piles up
     on the first vending machine between it and you. */
  let mx=dirx, mz=dirz;
  if(z.stall>0){
    const s=z.side||1, w=Math.min(1, z.stall*2.2);
    mx = dirx*(1-w*.9) - dirz*s*w;
    mz = dirz*(1-w*.9) + dirx*s*w;
    const L=Math.hypot(mx,mz)||1; mx/=L; mz/=L;
  }
  z.yaw += angWrap(Math.atan2(dirx,-dirz)-z.yaw) * Math.min(1,dt*7);

  /* --- ranged kinds stand off and shoot instead of closing --- */
  if(k.ranged){
    z.fire-=dt;
    const want = z.kind==="panzer" ? 9 : 12;
    let mv = flat>want+2 ? 1 : flat<want-3 ? -.6 : 0;
    if(z.see && z.fire<=0 && flat<k.reach){
      z.fire = z.kind==="panzer" ? rrange(1.5,2.4) : rrange(2.0,3.2);
      z.shootT=.42;                                    // telegraph before it fires
    }
    if(z.shootT>0){
      mv=0;
      z.shootT-=dt;
      if(z.shootT<=0 && z.see){
        const e=zEye(z), pe=eyeOf(me);
        const d=[pe[0]-e[0],pe[1]-e[1],pe[2]-e[2]];
        const L=Math.hypot(d[0],d[1],d[2])||1;
        const sp = z.kind==="panzer" ? .035 : .055;
        projs.push({p:[e[0],e[1],e[2]],
          v:[(d[0]/L+rrange(-sp,sp))*(z.kind==="panzer"?26:19),
             (d[1]/L+rrange(-sp,sp)+.06)*(z.kind==="panzer"?26:19),
             (d[2]/L+rrange(-sp,sp))*(z.kind==="panzer"?26:19)],
          t:2.6, dmg:k.dmg, r:z.kind==="panzer"?2.2:1.5, foe:1,
          col: z.kind==="panzer" ? [1,.55,.12] : [.55,1,.30]});
        sfxZap(dvol(z.p,.16,30));
      }
    }
    accelerate(z, mx*mv, mz*mv, dt, z.spd*Math.abs(mv), T.accel/T.speed);
  } else if(k.fly){
    /* Screechers hold a hover height above whatever is under them, climb when
       something is in the way — they are the one thing here that can go over a
       barricade rather than through it — and dive the last two metres. */
    const gh=Math.max(groundAt(z.p[0], z.p[1]+.4, z.p[2]),
                      groundAt(z.p[0]+dirx*1.4, z.p[1]+3.0, z.p[2]+dirz*1.4));
    const want = flat<3.4 ? me.p[1]+T.eye-.35
                          : gh + 2.2 + (z.climb||0) + Math.sin(z.gait*.7)*.42;
    z.v[1]+= ((want-z.p[1])*4.4 - z.v[1]) * Math.min(1,dt*5);
    accelerate(z, mx, mz, dt, z.spd, T.accel/T.speed);
  } else {
    accelerate(z, mx, mz, dt, z.spd, T.accel/T.speed);
    /* Hounds bound rather than walk, which is most of what makes them read as
       dogs from the far end of a dark theater. */
    if(k.fire && z.ground && rnd()<dt*1.6){ z.v[1]=5.2; }
  }

  if(z.ground||z.fly){
    const s=Math.hypot(z.v[0],z.v[2]), drop=s*T.friction*dt;
    if(s>0){ const f=Math.max(0,s-drop)/s; z.v[0]*=f; z.v[2]*=f; }
  }
  /* Capture the intent BEFORE the collision pass. resolve() zeroes velocity on
     whatever axis it blocked, so asking "how fast did it want to go" after the
     move reports nearly zero for exactly the body that is stuck — which is the
     one case this is trying to detect. Same trap as the stair climb. */
  const bx0=z.p[0], bz0=z.p[2], askX=z.v[0], askZ=z.v[2];
  step(z,dt);
  separate(z,dt);
  const got=Math.hypot(z.p[0]-bx0, z.p[2]-bz0);
  const asked=Math.hypot(askX,askZ)*dt;
  const jammed = asked>.002 && got<asked*.72;
  if(k.fly){
    /* Not getting anywhere? Go up. It unwinds on its own once it is over. */
    z.climb = jammed ? Math.min(3.2,(z.climb||0)+dt*4.0) : Math.max(0,(z.climb||0)-dt*1.6);
  }
  z.sideT=(z.sideT||0)-dt;
  if(jammed){
    if(z.sideT<=0){ z.side = rnd()<.5?1:-1; z.sideT=1.5; }
    z.stall=Math.min(1.2,(z.stall||0)+dt*2.4);
  } else z.stall=Math.max(0,(z.stall||0)-dt*2.2);
  z.gait += dt*(3.2+Math.hypot(z.v[0],z.v[2])*1.5);

  /* --- melee --- */
  if(!k.ranged){
    z.atk-=dt;
    const reach = k.reach + (k.fly?.4:0);
    const dy=Math.abs((z.p[1]+k.h*.5)-(me.p[1]+.9));
    if(flat<reach && dy<1.9 && me.dead<=0 && z.state==="walk"){
      if(z.atk<=0){ z.atk=1.05; z.swing=.34; }
    }
    if(z.swing>0){
      z.swing-=dt;
      if(z.swing<=0 && flat<reach+.4 && me.dead<=0){
        hurtPlayer(k.dmg);
        sfxFlesh(.22);
      }
    }
  }
}

/* ---------- damage and death ---------------------------------------------- */
function damageZom(z,amt,head,pts,fromKnife){
  if(!z.alive||z.state==="die") return 0;
  const k=KIND[z.kind];
  /* A Panzer's plate turns most of a magazine; its head does not. */
  if(k.armor && !head) amt*=.42;
  if(me.insta>0 && !k.boss) amt=1e9;
  z.hp-=amt; z.hitT=.09; z.dmgTaken+=amt;
  let got=0;
  if(z.hp<=0){
    killZom(z, head, fromKnife);
    got = fromKnife?T.ptKnife : head?T.ptHead : T.ptBody;
    got = Math.round(got*k.pts);
  } else if(pts!==false){
    got = T.ptHit;
  }
  if(got) addPoints(got);
  return got;
}
function killZom(z,head,knife){
  const k=KIND[z.kind];
  z.state="die"; z.t=.55; z.hp=0;
  me.kills++; if(head) me.headshots++;
  game.left=Math.max(0,game.left-1);
  sfxFlesh(dvol(z.p,.26,28));
  gibBurst(z.p[0], z.p[1]+k.h*.55, z.p[2], head?9:6, k.col);
  /* A crawler killed by bullets bursts. Killed by a blade or a blast it just
     falls over, which is the whole reason to carry a knife. */
  if(k.gas && !knife) gasCloud(z.p[0], z.p[1]+.3, z.p[2]);
  if(k.boss){ spawnDrop(z.p[0],z.p[1],z.p[2],"ammo"); banner("PANZER DOWN",""); }
  else maybeDrop(z.p[0],z.p[1],z.p[2]);
}
function gasCloud(x,y,z){
  clouds.push({x,y:Math.max(.2,y),z, r:.6, R:3.4, t:6.5, T:6.5});
  sfxBoom(dvol([x,y,z],.30,26),true);
}
function gibBurst(x,y,z,n,col){
  for(let i=0;i<n;i++) gibs.push({p:[x,y,z],
    v:[rrange(-3.4,3.4), rrange(1.2,5.0), rrange(-3.4,3.4)],
    t:.85, col});
}

/* ---------- projectiles ---------------------------------------------------- */
function projTick(dt){
  for(let i=projs.length-1;i>=0;i--){
    const q=projs[i];
    q.t-=dt;
    q.v[1]-=(q.grav===undefined?11:q.grav)*dt;
    const nx=q.p[0]+q.v[0]*dt, ny=q.p[1]+q.v[1]*dt, nz=q.p[2]+q.v[2]*dt;
    const d=[nx-q.p[0],ny-q.p[1],nz-q.p[2]];
    const L=Math.hypot(d[0],d[1],d[2])||1;
    const t=castMap(q.p,[d[0]/L,d[1]/L,d[2]/L],L);
    let hit = t<L;
    let hitZ=null;
    if(!q.foe){
      for(const z of zoms){
        if(!z.alive||z.state==="die") continue;
        const tb=rayBox(q.p,[d[0]/L,d[1]/L,d[2]/L],bodyBox(z));
        if(tb>=0&&tb<L){ hit=true; hitZ=z; break; }
      }
    } else if(me.dead<=0){
      const b=[me.p[0]-.4,me.p[1],me.p[2]-.4,me.p[0]+.4,me.p[1]+T.height,me.p[2]+.4];
      const tb=rayBox(q.p,[d[0]/L,d[1]/L,d[2]/L],b);
      if(tb>=0&&tb<L){ hit=true; }
    }
    q.p[0]=nx; q.p[1]=ny; q.p[2]=nz;
    if(hit||q.t<=0||q.p[1]<0){
      if(q.foe){
        ring(q.p[0],Math.max(.1,q.p[1]),q.p[2],.3,q.r*1.6,.4,q.col);
        sfxBoom(dvol(q.p,.22,26));
        const dd=Math.hypot(me.p[0]-q.p[0],(me.p[1]+.9)-q.p[1],me.p[2]-q.p[2]);
        if(dd<q.r+.7) hurtPlayer(q.dmg*(1-dd/(q.r+.9)));
      } else {
        explode(q.p[0],q.p[1],q.p[2],q.r,q.dmg,q.self||0,q.col);
      }
      projs.splice(i,1);
    }
  }
}
function explode(x,y,z,r,dmg,self,col){
  ring(x,Math.max(.08,groundAt(x,y+.4,z)+.06),z,.4,r*1.5,.5,col||[1,.72,.25]);
  ring(x,Math.max(.08,y),z,r*.4,r*1.05,.32,col||[1,.42,.18]);
  sfxBoom(dvol([x,y,z],.55,40));
  gibBurst(x,y,z,7,[1,.6,.25]);
  for(const q of zoms){
    if(!q.alive||q.state==="die") continue;
    const d=Math.hypot(q.p[0]-x,(q.p[1]+.8)-y,q.p[2]-z);
    if(d<=r) damageZom(q, dmg*(1-.5*d/r), false, true, true);
  }
  if(self>0 && me.dead<=0){
    const d=Math.hypot(me.p[0]-x,(me.p[1]+.9)-y,me.p[2]-z);
    if(d<=r) hurtPlayer(self*(1-d/r));
  }
}

/* ---------- effects -------------------------------------------------------- */
function tracer(a,b,c,life){ tracers.push({a,b,c:c||[1,.86,.42],t:life||.05,T:life||.05}); }
function ring(x,y,z,r0,r1,life,c){ rings.push({x,y,z,r0,r1,t:life,T:life,c:c||[1,.8,.3]}); }
function spark(p,n,col){
  for(let i=0;i<n;i++) sparks.push({p:[p[0],p[1],p[2]],
    v:[rrange(-2,2),rrange(0,3),rrange(-2,2)], t:.28, col:col||[1,.78,.35]});
}
function fxTick(dt){
  for(let i=tracers.length-1;i>=0;i--){ tracers[i].t-=dt; if(tracers[i].t<=0) tracers.splice(i,1); }
  for(let i=rings.length-1;i>=0;i--){ rings[i].t-=dt; if(rings[i].t<=0) rings.splice(i,1); }
  for(let i=sparks.length-1;i>=0;i--){ const s=sparks[i]; s.t-=dt;
    s.v[1]-=26*dt; s.p[0]+=s.v[0]*dt; s.p[1]+=s.v[1]*dt; s.p[2]+=s.v[2]*dt;
    if(s.t<=0) sparks.splice(i,1); }
  for(let i=gibs.length-1;i>=0;i--){ const g=gibs[i]; g.t-=dt;
    g.v[1]-=19*dt; g.p[0]+=g.v[0]*dt; g.p[1]+=g.v[1]*dt; g.p[2]+=g.v[2]*dt;
    if(g.p[1]<.05){ g.p[1]=.05; g.v[0]*=.4; g.v[2]*=.4; g.v[1]=0; }
    if(g.t<=0) gibs.splice(i,1); }
  /* Nova gas: it hurts you and it kills them, which makes a crawler the
     cheapest weapon on the map if you drop it somewhere useful. */
  for(let i=clouds.length-1;i>=0;i--){
    const c=clouds[i]; c.t-=dt;
    c.r = c.R*Math.min(1,(c.T-c.t)/.7);
    for(const z of zoms){
      if(!z.alive||z.state==="die"||KIND[z.kind].gas||KIND[z.kind].boss) continue;
      if(Math.hypot(z.p[0]-c.x,z.p[2]-c.z)<c.r && Math.abs(z.p[1]-c.y)<2.2)
        damageZom(z, 260*dt, false, false, true);
    }
    if(me.dead<=0 && Math.hypot(me.p[0]-c.x,me.p[2]-c.z)<c.r && Math.abs(me.p[1]+.9-c.y)<2.2){
      me.gasT=Math.max(me.gasT,1.4);
      hurtPlayer(9*dt, true);
    }
    if(c.t<=0) clouds.splice(i,1);
  }
}
