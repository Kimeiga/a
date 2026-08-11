/* ============================================================================
   SIMULATION — one fixed 60 Hz step.

   Everything that changes the world happens in here and nowhere else, at a
   fixed rate, so the frame rate never changes what happens. A phone that
   throttles to 40 fps plays the same game as a laptop at 144.
   ========================================================================== */
const vmo={kick:0,flash:0,bob:0,sx:0,sy:0,pyaw:0,ppitch:0,spd:0,knife:0,swap:0};
let sprintT=0;

function playerMove(dt){
  let ax=stick.ax, az=stick.az;
  if(keys.KeyW) az-=1; if(keys.KeyS) az+=1;
  if(keys.KeyA) ax-=1; if(keys.KeyD) ax+=1;
  const m=Math.hypot(ax,az);

  /* Auto-sprint. Holding a thumbstick to the rim is the touch equivalent of
     pressing shift, and asking for one more button here would cost more than
     it bought. Any other verb cancels it, exactly like the real thing. */
  const wantRun = mode==="desk" ? !!keys.ShiftLeft
                : (S.autorun && stick.mag>.93 && az<-.55);
  if(wantRun && m>.5 && !firingR && !firingL && me.reloading<=0) sprintT+=dt; else sprintT=0;
  const running2 = sprintT>.30;
  el.stick.classList.toggle("run",running2);

  const stam = me.perks.stam ? 1.09 : 1;
  const cap = (running2 ? T.sprint : T.speed) * stam;
  if(m>0){
    const n=Math.min(1,m), ux=ax/m, uz=az/m;
    const fx=Math.sin(me.yaw), fz=-Math.cos(me.yaw), rx=Math.cos(me.yaw), rz=Math.sin(me.yaw);
    const wx=rx*ux+fx*(-uz), wz=rz*ux+fz*(-uz);
    const wl=Math.hypot(wx,wz)||1;
    accelerate(me, wx/wl, wz/wl, dt, cap*n, (me.ground?T.accel:T.airAccel)/T.speed);
  }
  if(me.ground){
    const s=Math.hypot(me.v[0],me.v[2]), drop=s*T.friction*dt;
    if(s>0){ const k=Math.max(0,s-drop)/s; me.v[0]*=k; me.v[2]*=k; }
    if(jumpQ||keys.Space){ me.v[1]=T.jump; me.ground=false; }
  }
  jumpQ=false;
  step(me,dt);

  /* Footsteps, which are half of knowing how fast you are actually moving. */
  const spd=Math.hypot(me.v[0],me.v[2]);
  if(me.ground&&spd>1.2){
    me.stepT-=dt*spd;
    if(me.stepT<=0){ me.stepT=2.6; sfxStep(.045+spd*.004); }
  }
}

function aimAssist(dt){
  if(S.assist<=0) return;
  const tg=bestTarget(4.5);
  if(!tg) return;
  const k=S.assist/100;
  const e=eyeOf(me), d=[tg.c[0]-e[0],tg.c[1]-e[1],tg.c[2]-e[2]];
  const wantYaw=Math.atan2(d[0],-d[2]);
  const wantPit=Math.atan2(d[1],Math.hypot(d[0],d[2]));
  const dy=angWrap(wantYaw-me.yaw);
  const pull=(firingR||firingL)?1:.32;
  me.yaw  += clamp(dy,-.13,.13)*k*pull*dt*1.15;
  me.pitch = clamp(me.pitch + clamp(wantPit-me.pitch,-.10,.10)*k*pull*dt*1.15, -1.45,1.45);
}

function weaponTick(dt){
  const s=curSlot(), st=wstat(s);
  me.cool=Math.max(0,me.cool-dt);
  me.knifeCd=Math.max(0,me.knifeCd-dt);
  me.nadeCd=Math.max(0,me.nadeCd-dt);
  me.idle+=dt;
  if(me.idle>.35) me.shot=0;
  /* Recoil settles back to where you were actually aiming. The threshold has
     to sit clear of the fire interval or recovery fires between every pair of
     rounds and quietly claws back a tenth of the climb. */
  if(me.idle>.17){
    const k=Math.min(1,dt*6.5);
    me.pitch=clamp(me.pitch-me.rcvP*k,-1.45,1.45); me.yaw-=me.rcvY*k;
    me.rcvP*=1-k; me.rcvY*=1-k;
  }
  if(me.reloading>0){
    me.reloading-=dt;
    if(me.reloading<=0){
      const sl=me.slots[me.reloadOf]||s, stx=wstat(sl);
      const need=stx.mag-sl.mag, take=Math.min(need, sl.res);
      sl.mag+=take; sl.res-=take;
      sfxClick(.2,1400);
    }
  }
  let wantFire=firingL||firingR;
  if(S.fire==="target"){ const tg=bestTarget(2.4); if(tg) wantFire=true; }
  if(oneShot){ wantFire=true; oneShot=false; }
  if(me.burst>0 && me.cool<=0){ me.burst--; shoot(); }
  else if(wantFire){
    if(st.burst){ if(me.cool<=0){ shoot(); } }
    else shoot();
  }
  if(s.mag<=0 && s.res>0 && me.reloading<=0) reload();

  /* viewmodel: bob from speed, sway from look velocity, kick from firing */
  const spd=Math.hypot(me.v[0],me.v[2])/T.speed;
  vmo.bob+=dt*(4+spd*13);
  const dyaw=angWrap(me.yaw-vmo.pyaw)/dt, dpit=(me.pitch-vmo.ppitch)/dt;
  vmo.pyaw=me.yaw; vmo.ppitch=me.pitch;
  const kk=Math.min(1,dt*9);
  vmo.sx+=(clamp(dyaw*.07,-1,1)-vmo.sx)*kk;
  vmo.sy+=(clamp(dpit*.07,-1,1)-vmo.sy)*kk;
  vmo.kick=Math.max(0,vmo.kick-dt*7.5);
  vmo.flash=Math.max(0,vmo.flash-dt);
  vmo.knife=Math.max(0,vmo.knife-dt*3.2);
  vmo.spd=spd;
}

function simulate(dt){
  game.t+=dt;
  if(game.state==="playing" && me.dead<=0){
    playerMove(dt);
    aimAssist(dt);
    weaponTick(dt);
    healTick(dt);
    if(useTapped) doUse();
    me.gasT=Math.max(0,me.gasT-dt);
  }
  updateFlow(dt);
  roundTick(dt);
  for(const z of zoms) if(z.alive) zomTick(z,dt);
  projTick(dt);
  fxTick(dt);
  dropTick(dt);
  trapTick(dt);
  boxTick(dt);

  /* the projector room is on a clock, and it puts you back where you started */
  if(game.papT>0){ game.papT-=dt; if(game.papT<=0) teleBack(); }
  if(game.link>0) game.link-=dt;
  if(game.teleCd>0) game.teleCd-=dt;
  if(hitT>0){ hitT-=dt; if(hitT<=0) el.hitmark.style.opacity=0; }
  if(banT>0){ banT-=dt; if(banT<=0) el.banner.style.opacity=0; }
  if(pwT>0){ pwT-=dt; if(pwT<=0) el.pwrup.style.opacity=0; }
  if(flyT>0){ flyT-=dt; if(flyT<=0) el.ptsFly.style.opacity=0; }
  useTapped=false;
}
