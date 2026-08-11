/* ============================================================================
   RENDER

   Order matters here. The mirror pass has to run first because the marble
   samples it; the marble has to be the last opaque thing for the same reason;
   the viewmodel gets its own projection over a cleared depth buffer so it can
   never intersect the level.
   ========================================================================== */
const pm=new Float32Array(16), vm=new Float32Array(16), mvp=new Float32Array(16);
const vmR=new Float32Array(16), mvpR=new Float32Array(16), mI=new Float32Array(16);
const gpm=new Float32Array(16), mvpG=new Float32Array(16);
const mA=new Float32Array(16), mB=new Float32Array(16), mC=new Float32Array(16);
let tNow=0;

/* ---------- bodies --------------------------------------------------------
   Each kind is eight or so boxes placed in its own local frame. The hitbox is
   a box and the body is boxes, so you never shoot a shape that is not there —
   which matters more in this mode than in any other, because you are asking
   for headshots on something that is one metre away and moving. */
function zomColor(z){
  const k=KIND[z.kind];
  if(z.hitT>0) return [1,.86,.80];
  const f = z.state==="die" ? .45 : (.72+.28*(z.hp/z.maxhp));
  return [k.col[0]*f, k.col[1]*f, k.col[2]*f];
}
function pushZom(z){
  const k=KIND[z.kind], c=zomColor(z), eye=k.eye;
  const cw=Math.cos(z.yaw), sw=Math.sin(z.yaw);
  const X=(lx,lz)=>z.p[0]+lx*cw-lz*sw, Z=(lx,lz)=>z.p[2]+lx*sw+lz*cw;
  const y=z.p[1], g=Math.sin(z.gait), g2=Math.cos(z.gait);
  const part=(lx,ly,lz,w,h,d,col,rg,f0,em)=>
    wBoxYaw(X(lx,lz), y+ly, Z(lx,lz), w,h,d, z.yaw, col||c, rg===undefined?.94:rg, f0===undefined?.04:f0, em||0);
  const swing = z.state==="die" ? 0 : 1;
  const lean  = z.swing>0 ? .12 : 0;

  if(z.kind==="hound"){
    part(0,.30,g*.06, .30,.44,.86, c);                    // body
    part(0,.52,-.46, .26,.28,.30, c);                     // head
    part(-.02,.62,-.60,.05,.05,.05, eye,.9,.04,1.6);
    part(.10,.62,-.60, .05,.05,.05, eye,.9,.04,1.6);
    for(const s of [-1,1]) for(const f of [-1,1]){
      const ph=(s*f>0? g : -g)*.22*swing;
      part(s*.15,0,f*.30+ph, .11,.34,.13, c);
    }
    part(0,.42,.50, .07,.07,.34, c);                      // tail
    return;
  }
  if(z.kind==="flyer"){
    /* Wings beat fast enough that the flap is the read, not the body. */
    const flap=Math.sin(z.gait*4.2)*.30;
    part(0,.20,0, .34,.46,.42, c);
    part(0,.58,-.10, .28,.26,.28, c);
    part(-.05,.66,-.22,.06,.06,.05, eye,.9,.04,1.8);
    part(.05,.66,-.22, .06,.06,.05, eye,.9,.04,1.8);
    for(const s of [-1,1]) part(s*.52,.36+flap*s*0+flap,.02, .70,.05,.40, c,.96,.04,0);
    part(0,.06,.24, .10,.16,.34, c);
    return;
  }
  if(z.kind==="crawler"){
    part(0,.20,0, .50,.34,.62, c);
    part(0,.30,-.42, .30,.28,.30, c);
    part(-.07,.40,-.54,.06,.06,.05, eye,.9,.04,1.9);
    part(.07,.40,-.54, .06,.06,.05, eye,.9,.04,1.9);
    /* the gas sacs, which are also what you are aiming at */
    part(-.24,.30,.14, .20,.20,.20, [.35,.85,.28],.85,.04,.55);
    part(.24,.30,.14, .20,.20,.20, [.35,.85,.28],.85,.04,.55);
    for(const s of [-1,1]) for(const f of [-1,1]){
      const ph=(s*f>0? g : -g)*.26*swing;
      part(s*.28,0,f*.22+ph, .12,.24,.36, c);
    }
    return;
  }
  if(z.kind==="panzer"){
    const h=k.h;
    part(0,h*.34,0, .86,h*.46,.60, c);                    // torso
    part(0,h*.80,0, .96,h*.12,.68, [.42,.44,.48],.34,.55);// shoulder yoke
    part(0,h*.84,-.06, .34,h*.16,.34, c);                 // head
    part(-.09,h*.90,-.22,.07,.07,.06, eye,.9,.04,2.0);
    part(.09,h*.90,-.22, .07,.07,.06, eye,.9,.04,2.0);
    part(-.62,h*.52,-.10, .30,h*.34,.30, [.40,.42,.46],.34,.55);
    /* the arm it shoots with, raised while it winds up */
    const up = z.shootT>0 ? .28 : 0;
    part(.60,h*.44+up,-.18, .34,h*.22,.54, [.40,.42,.46],.32,.56);
    if(z.shootT>0) part(.60,h*.50+up,-.50, .18,.18,.18, [1,.6,.2],.9,.04,2.2);
    for(const s of [-1,1]) part(s*.26,0,g*s*.16*swing, .30,h*.36,.34, c);
    return;
  }
  /* the humanoids: walker, runner, spitter */
  const h=k.h, fat = z.kind==="spitter" ? 1.22 : 1;
  part(0,h*.30,lean*.2, .52*fat,h*.42,.34*fat, c);        // torso
  part(0,h*.72,-.02, .40*fat,h*.14,.30*fat, c);           // chest
  part(0,h*.86,-.02, .30,h*.16,.30, c);                   // head
  part(-.08,h*.92,-.16,.055,.055,.05, eye,.9,.04,1.7);
  part(.08,h*.92,-.16, .055,.055,.05, eye,.9,.04,1.7);
  if(z.kind==="spitter"){
    part(0,h*.30,-.26, .34,h*.26,.20, [.35,.80,.42],.85,.04,.42);   // the sac
    part(0,h*.84,-.24, .16,.14,.16, [.45,.95,.45],.9,.04,z.shootT>0?1.8:.5);
  }
  /* Arms out front for a walker, pumping for a runner, and thrown forward
     during a swing so a wind-up is visible before it lands. */
  const reach = z.kind==="runner" ? -g*.30 : -.26;
  const rise  = z.swing>0 ? .16 : 0;
  for(const s of [-1,1]){
    const f = z.kind==="runner" ? (s>0? g:-g)*.26 : reach;
    part(s*.34*fat, h*.42+rise, f-.12, .16,h*.36,.20, c);
  }
  for(const s of [-1,1]){
    const ph=(s>0? g : -g)*.24*swing;
    part(s*.15, 0, ph, .19,h*.32,.22, c);
  }
}

function drawEnemies(){
  dynReset();
  for(const z of zoms){ if(z.alive) pushZom(z); }
  /* props share the buffer: one upload, one draw call for everything alive */
  pushProps();
  dynDraw(dynBuf);
}

/* ---------- props ---------------------------------------------------------- */
function pushProps(){
  /* the mystery box */
  const b=mbox;
  if(mbox.moving<=0){
    const lid = game.boxOpenT>0||game.prize ? .55 : 0;
    wBox([b.x-.75,b.y,b.z-.5, b.x+.75,b.y+.62,b.z+.5],[.24,.16,.09],.88,.04,0);
    wBoxYaw(b.x,b.y+.62+lid*.30,b.z,1.56,.10,1.06, lid*.9, [.32,.22,.12],.85,.04,0);
    wBox([b.x-.78,b.y+.56,b.z-.53, b.x+.78,b.y+.64,b.z+.53],[.42,.33,.14],.30,.60,0);
    if(game.boxOpenT>0||game.prize){
      const k=[1,.86,.42];
      wBox([b.x-.34,b.y+.66,b.z-.24, b.x+.34,b.y+2.6,b.z+.24],k,.9,.04,1.05);
    }
    if(game.prize){
      /* the weapon hangs over the box until you take it */
      const sp=game.t*2.2, yy=b.y+1.15+Math.sin(game.t*2)*.06;
      wBoxYaw(b.x,yy,b.z, .13,.13,.95, sp, [.30,.32,.36],.30,.55,.35);
      wBoxYaw(b.x,yy-.18,b.z, .11,.20,.22, sp, [.22,.20,.18],.6,.05,.25);
    }
  } else {
    const t=1-mbox.moving/3.2, yy=b.y+.5+t*3.4;
    wBoxYaw(b.x,yy,b.z, .42,.46,.34, game.t*4, [.62,.36,.16],.92,.04,.4);
    wBoxYaw(b.x,yy+.46,b.z, .30,.28,.26, game.t*4, [.68,.42,.20],.92,.04,.4);
  }
  /* power-ups */
  for(const d of drops){
    const I=DROPINFO[d.kind];
    const fade = d.t<4 ? (Math.sin(d.t*14)>0?1:.15) : 1;
    const s=.26, yy=d.y+Math.sin(game.t*3+d.spin)*.10;
    wBoxYaw(d.x,yy,d.z, s,s,s, d.spin, I.c, .9,.04, 1.9*fade);
    wBoxYaw(d.x,yy-.02,d.z, s*1.5,.03,s*1.5, -d.spin*.7, I.c, .9,.04, 1.2*fade);
  }
  /* barricades: one plank per board left, so the state is readable at range */
  for(const B of BARRIERS){
    if(!ROOM[B.room].open && B.boards>=B.max) continue;
    for(let i=0;i<B.boards;i++){
      const yy=(B.y||0)+.35+i*.42;
      const w=1.9, t=.07;
      const tilt=((i*37)%9-4)*.02;
      if(B.dir[0]!==0) wBoxYaw(B.x,yy,B.z, .16,.15,w, tilt, [.34,.23,.13],.9,.04,0);
      else             wBoxYaw(B.x,yy,B.z, w,.15,.16, tilt, [.34,.23,.13],.9,.04,0);
    }
  }
  /* Nova gas, as a handful of translucent puffs. Cheap, and green enough. */
  for(const c of clouds){
    const a=Math.min(1,c.t/1.2);
    for(let i=0;i<5;i++){
      const ang=i/5*TAU+game.t*.4, rr=c.r*.62;
      wBoxYaw(c.x+Math.cos(ang)*rr, c.y-.2+Math.sin(game.t+i)*.12, c.z+Math.sin(ang)*rr,
              c.r*1.0,c.r*.9,c.r*1.0, ang, [.24*a,.62*a,.16*a], .95,.04, .30*a);
    }
  }
  /* live traps arc between their posts */
  for(const u of USABLES){
    if(u.t!=="trap"||u.on<=0) continue;
    const V=u.vol;
    for(let i=0;i<5;i++){
      const f=(i+.5)/5, x=V[0]+(V[3]-V[0])*f, z=V[2]+(V[5]-V[2])*f;
      const yy=V[1]+.4+Math.abs(Math.sin(game.t*22+i))*2.2;
      wBox([x-.06,V[1]+.1,z-.06,x+.06,yy,z+.06],[.55,.85,1],.9,.04,2.0);
    }
  }
}

function pushLine(a,ax,ay,az,bx,by,bz,c){
  a.push(ax,ay,az, 0,1,0, c[0],c[1],c[2], 1,0,1);
  a.push(bx,by,bz, 0,1,0, c[0],c[1],c[2], 1,0,1);
}
function drawLines(){
  const a=[];
  for(const t of tracers){
    const k=t.t/t.T, c=[t.c[0]*k,t.c[1]*k,t.c[2]*k];
    pushLine(a,t.a[0],t.a[1],t.a[2],t.b[0],t.b[1],t.b[2],c);
  }
  for(const s of sparks){
    const k=Math.max(0,s.t/.28);
    pushLine(a,s.p[0],s.p[1],s.p[2],
             s.p[0]-s.v[0]*.02,s.p[1]-s.v[1]*.02,s.p[2]-s.v[2]*.02,
             [s.col[0]*k,s.col[1]*k,s.col[2]*k]);
  }
  for(const g of gibs){
    const k=Math.max(0,g.t/.85)*.8;
    pushLine(a,g.p[0],g.p[1],g.p[2],g.p[0]-g.v[0]*.03,g.p[1]-g.v[1]*.03,g.p[2]-g.v[2]*.03,
             [g.col[0]*k*2.2,g.col[1]*k,g.col[2]*k]);
  }
  for(const r of rings){
    const k=1-r.t/r.T, rad=r.r0+(r.r1-r.r0)*k, f=1-k, N=26;
    const c=[r.c[0]*f,r.c[1]*f,r.c[2]*f];
    for(let i=0;i<N;i++){
      const a0=i/N*TAU, a1=(i+1)/N*TAU;
      pushLine(a,r.x+Math.cos(a0)*rad,r.y,r.z+Math.sin(a0)*rad,
                 r.x+Math.cos(a1)*rad,r.y,r.z+Math.sin(a1)*rad,c);
    }
  }
  for(const q of projs){
    pushLine(a,q.p[0],q.p[1],q.p[2],q.p[0]-q.v[0]*.02,q.p[1]-q.v[1]*.02,q.p[2]-q.v[2]*.02,q.col);
    pushLine(a,q.p[0]-.09,q.p[1],q.p[2],q.p[0]+.09,q.p[1],q.p[2],q.col);
    pushLine(a,q.p[0],q.p[1]-.09,q.p[2],q.p[0],q.p[1]+.09,q.p[2],q.col);
  }
  /* the mainframe link, drawn as a line you can follow to the stage */
  if(game.link>0){
    const A=[-9.6,1.9,-15.6], B2=[-7,1.4,22.4];
    const N=22, f=(game.t*1.4)%1;
    for(let i=0;i<N;i++){
      const t0=i/N, t1=(i+.45)/N;
      const c=[.2,.85,1.0];
      const p0=[A[0]+(B2[0]-A[0])*t0, 3.2+Math.sin(t0*3.1+game.t*2)*.5, A[2]+(B2[2]-A[2])*t0];
      const p1=[A[0]+(B2[0]-A[0])*t1, 3.2+Math.sin(t1*3.1+game.t*2)*.5, A[2]+(B2[2]-A[2])*t1];
      if(((t0+f)%.34)<.17) pushLine(a,p0[0],p0[1],p0[2],p1[0],p1[1],p1[2],c);
    }
  }
  drawArr(lineBuf,a,gl.LINES);
}

/* ---------- attract camera ------------------------------------------------
   Before you tap, the camera walks the map. It is the cheapest possible
   tutorial: by the time you press play you have already seen the lobby, the
   staircase, the theater and the alley, and you know roughly where they are. */
const camA=[0,0,0], camL=[0,0,0];
function attractCam(t){
  const n=CAM_PATH.length, s=t*.085, i=Math.floor(s)%n, f=s-Math.floor(s);
  const a=CAM_PATH[i], b=CAM_PATH[(i+1)%n];
  const e=f*f*(3-2*f);
  for(let k=0;k<3;k++){
    camA[k]=a.p[k]+(b.p[k]-a.p[k])*e;
    camL[k]=a.l[k]+(b.l[k]-a.l[k])*e;
  }
  const dx=camL[0]-camA[0], dy=camL[1]-camA[1], dz=camL[2]-camA[2];
  return {p:camA, yaw:Math.atan2(dx,-dz), pitch:Math.atan2(dy,Math.hypot(dx,dz))};
}

function setCam(mvpM,vmM,eyeP){
  gl.uniformMatrix4fv(U.mvp,false,mvpM);
  gl.uniformMatrix4fv(U.vm,false,vmM);
  idm(mI); gl.uniformMatrix4fv(U.model,false,mI);
  gl.uniform3fv(U.eye,eyeP);
}
function drawSolids(mirror){
  gl.cullFace(mirror?gl.FRONT:gl.BACK);
  gl.bindBuffer(gl.ARRAY_BUFFER,mapBuf); bindStride();
  gl.drawArrays(gl.TRIANGLES,0,mapCount);
  if(doorCount){ gl.bindBuffer(gl.ARRAY_BUFFER,doorBuf); bindStride();
    gl.drawArrays(gl.TRIANGLES,0,doorCount); }
  gl.bindBuffer(gl.ARRAY_BUFFER,decoBuf); bindStride();
  gl.drawArrays(gl.TRIANGLES,0,decoCount);
  if(floorCount){ gl.bindBuffer(gl.ARRAY_BUFFER,floorBuf); bindStride();
    gl.drawArrays(gl.TRIANGLES,0,floorCount); }
  dynDraw(dynBuf);
  gl.cullFace(gl.BACK);
}
function drawFX(){
  gl.enable(gl.BLEND); gl.depthMask(false); gl.uniform1f(U.unlit,1);
  drawLines();
  gl.uniform1f(U.unlit,0); gl.depthMask(true); gl.disable(gl.BLEND);
}

const dynCast=[];
function render(){
  const asp=cv.width/Math.max(1,cv.height);
  perspective(pm,S.fov,asp,.055,190);

  let ex,ey,ez,yaw,pitch;
  if(game.state==="attract"){
    const c=attractCam(tNow);
    ex=c.p[0]; ey=c.p[1]; ez=c.p[2]; yaw=c.yaw; pitch=c.pitch;
  } else {
    const e=eyeOf(me);
    const bobY = Math.sin(vmo.bob*2)*.014*vmo.spd;
    ex=e[0]; ey=e[1]+bobY; ez=e[2]; yaw=me.yaw; pitch=me.pitch;
  }
  const f=fwd(yaw,pitch);

  gl.uniform1f(U.time,tNow);
  gl.uniform1f(U.alpha,1); gl.uniform4f(U.tint,0,0,0,0);
  gl.uniform1f(U.unlit,0); gl.uniform1f(U.uRefl,0);
  pickLights(ex,ey,ez,f[0],f[1],f[2]);

  /* Shadow casters: the static half on a slow tick because the sort is the
     only n log n thing in the frame and the answer barely moves in 50 ms; the
     bodies every frame, because contact shadows under a zombie a metre away
     are most of what tells you it is a metre away. */
  const useSh=S.shad&&shadowOK&&keyLight;
  if(useSh){
    castTick-=1;
    if(castTick<=0){ castTick=4; refreshCasters(ex,ey,ez); }
    dynCast.length=0;
    for(const z of zoms){
      if(!z.alive||z.state==="die") continue;
      if(dynCast.length>=DYNSLOTS) break;
      if(Math.hypot(z.p[0]-ex,z.p[2]-ez)>13) continue;
      dynCast.push(bodyBox(z));
    }
    uploadCasters(dynCast);
  }
  gl.uniform1f(U.shOn,useSh?1:0);
  gl.uniform1f(U.shSoft,S.gfx>=2?1:0);

  drawEnemies();                                   // fills dynBuf once per frame

  /* Mirror pass. Negating the y column of the view matrix is exactly V·S, the
     reflection through y=0, so the reflected image lands on the same pixel the
     marble will sample and the lookup is gl_FragCoord with no extra maths.
     S has a negative determinant, so winding reverses: cull FRONT. */
  if(S.refl && rFbo && floorRCount){
    viewM(vmR,ex,ey,ez,yaw,pitch);
    vmR[4]=-vmR[4]; vmR[5]=-vmR[5]; vmR[6]=-vmR[6];
    mul(mvpR,pm,vmR);
    gl.bindFramebuffer(gl.FRAMEBUFFER,rFbo);
    gl.viewport(0,0,rW,rH);
    gl.uniform2f(U.res,rW,rH);
    gl.uniform2f(U.fogr,34,150);                   // barely fog the mirror
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    setCam(mvpR,vmR,[ex,-ey,ez]);
    drawSolids(true);
    drawFX();
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }

  gl.uniform2f(U.fogr,15,60);
  viewM(vm,ex,ey,ez,yaw,pitch);
  mul(mvp,pm,vm);
  gl.viewport(0,0,cv.width,cv.height);
  gl.uniform2f(U.res,cv.width,cv.height);
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  setCam(mvp,vm,[ex,ey,ez]);
  drawSolids(false);

  /* the marble is the last opaque thing, because it reads the mirror */
  if(floorRCount){
    if(rTex){ gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,rTex); }
    gl.uniform1f(U.uRefl,S.refl?1:0);
    gl.bindBuffer(gl.ARRAY_BUFFER,floorRBuf); bindStride();
    gl.drawArrays(gl.TRIANGLES,0,floorRCount);
    gl.uniform1f(U.uRefl,0);
  }

  drawFX();

  /* Viewmodel: its own 62-degree projection so the FOV slider cannot distort
     it, a cleared depth buffer so it never intersects the level, and its own
     camera-space key light because world-space shadow rays would be nonsense
     for geometry that does not live in the world. */
  if(game.state==="playing" && me.dead<=0){
    gl.clear(gl.DEPTH_BUFFER_BIT);
    perspective(gpm,62,asp,.014,4);
    const s=curSlot(), st=wstat(s);
    const rp=me.reloading>0 ? Math.sin((1-me.reloading/(st.reload*(me.perks.speed?.5:1)))*Math.PI) : 0;
    const kn=vmo.knife;
    const sp=vmo.spd||0;
    rotY(mA,.052+vmo.sx*.16-kn*.55); rotX(mB,vmo.kick*.20-rp*.55+kn*.5);
    mul(mC,mA,mB); rotZ(mB,rp*.5-kn*.6); mul(mA,mC,mB);
    mA[12]= .155 - vmo.sx*.030 + Math.sin(vmo.bob)*.006*sp - kn*.10;
    mA[13]=-.160 - vmo.sy*.026 + Math.cos(vmo.bob*2)*.005*sp - rp*.14 - vmo.kick*.012 - kn*.05;
    mA[14]=-.020 + vmo.kick*.050 + kn*.16;
    mul(mvpG,gpm,mA);
    gl.uniformMatrix4fv(U.mvp,false,mvpG);
    gl.uniformMatrix4fv(U.model,false,mA);
    idm(mB); gl.uniformMatrix4fv(U.vm,false,mB);
    gl.uniform3f(U.eye,0,0,0);
    gl.uniform1f(U.shOn,0);
    gl.uniform2f(U.fogr,1e4,2e4);
    gl.uniform4f(U.key,.55,.75,.35,9);             // a key light in camera space
    gl.uniform3f(U.keyCol,3.1,2.9,2.6);
    gl.uniform1f(U.nLit,0);
    const G=gunGeom(st.kind, s.pap);
    gl.bindBuffer(gl.ARRAY_BUFFER,G.buf); bindStride();
    gl.drawArrays(gl.TRIANGLES,0,G.count);
    if(vmo.flash>0){
      gl.enable(gl.BLEND); gl.depthMask(false); gl.uniform1f(U.unlit,1);
      gl.uniform1f(U.alpha,vmo.flash/.045*.85);
      gl.bindBuffer(gl.ARRAY_BUFFER,flashGeom.buf); bindStride();
      gl.drawArrays(gl.TRIANGLES,0,flashGeom.count);
      gl.uniform1f(U.alpha,1); gl.uniform1f(U.unlit,0);
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
  }
}
