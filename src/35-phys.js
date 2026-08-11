/* ---------- collision & rays ---------------------------------------------
   Every solid in the world is an AABB, so a bullet is a slab test against a
   flat list and a body is three one-axis pushes. Doors are in the same list
   and simply stop being tested once they are bought. */
function solid(i){ const d=boxDoor[i]; return d<0 || !DOORS[d].open; }

function castMap(o,d,max){
  let best=max;
  for(let i=0;i<boxes.length;i++){
    if(!solid(i)) continue;
    const t=rayBox(o,d,boxes[i]);
    if(t>=0&&t<best) best=t;
  }
  return best;
}
function los(a,b){
  const d=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];
  const L=Math.hypot(d[0],d[1],d[2]); if(L<.01) return true;
  d[0]/=L; d[1]/=L; d[2]/=L;
  return castMap(a,d,L) >= L-.06;
}
/* Push out along one axis at a time, taking whichever side is nearer. Doing it
   per axis is what lets a 20 cm step be climbed for free: the vertical pass
   lands you on top of it before the horizontal pass can wedge you. */
function resolve(e,axis){
  const r=e.rad||T.radius, h=e.hgt||T.height;
  const pmin=[e.p[0]-r,e.p[1],e.p[2]-r], pmax=[e.p[0]+r,e.p[1]+h,e.p[2]+r];
  for(let i=0;i<boxes.length;i++){
    if(!solid(i)) continue;
    const b=boxes[i];
    if(pmax[0]<=b[0]||pmin[0]>=b[3]||pmax[1]<=b[1]||pmin[1]>=b[4]||pmax[2]<=b[2]||pmin[2]>=b[5]) continue;
    const lo=b[axis+3]-pmin[axis], hi=pmax[axis]-b[axis];
    /* Only push along this axis if this axis is where the overlap is shallowest.
       Without the check, a body already embedded in a thin slab — a closed door
       is 56 cm of z and five metres of x — gets resolved along the wrong axis
       and is fired out of the side of the building. The overlap was not caused
       by moving on this axis, so this axis is not where to undo it. */
    const px=Math.min(pmax[0]-b[0], b[3]-pmin[0]);
    const py=Math.min(pmax[1]-b[1], b[4]-pmin[1]);
    const pz=Math.min(pmax[2]-b[2], b[5]-pmin[2]);
    const mine=axis===0?px:axis===1?py:pz;
    if(mine > Math.min(px,Math.min(py,pz))+1e-4) continue;
    if(lo<hi){ e.p[axis]+=lo; if(axis===1){e.v[1]=0;e.ground=true;} else e.v[axis]=0; }
    else     { e.p[axis]-=hi; if(axis===1){e.v[1]=0;} else e.v[axis]=0; }
    pmin[axis]=e.p[axis]-(axis===1?0:r); pmax[axis]=e.p[axis]+(axis===1?h:r);
  }
}
/* Is the entity's own volume clear right now? */
function clearAt(e){
  const r=e.rad||T.radius, h=e.hgt||T.height;
  const x0=e.p[0]-r, x1=e.p[0]+r, z0=e.p[2]-r, z1=e.p[2]+r, y0=e.p[1]+.02, y1=e.p[1]+h;
  for(let i=0;i<boxes.length;i++){
    if(!solid(i)) continue;
    const b=boxes[i];
    if(x1<=b[0]||x0>=b[3]||y1<=b[1]||y0>=b[4]||z1<=b[2]||z0>=b[5]) continue;
    return false;
  }
  return true;
}
/* Move, and if a shin-high step got in the way, lift over it and move again.
   The subtlety that cost an afternoon: the retry has to be decided from the
   movement you INTENDED, captured before the collision pass, because resolve()
   zeroes the velocity on the axis it blocked. Testing the post-collision
   velocity means a body pressed against a stair reads as "barely trying to
   move" and never triggers the climb — so every zombie in the game piles up at
   the bottom of the staircase and the round can never end. */
function step(e,dt){
  e.ground=false;
  const ox=e.p[0], oy=e.p[1], oz=e.p[2];
  const dx=e.v[0]*dt, dz=e.v[2]*dt;
  const want=Math.hypot(dx,dz);
  const vx=e.v[0], vz=e.v[2];
  e.p[0]+=dx; resolve(e,0);
  e.p[2]+=dz; resolve(e,2);
  let got=Math.hypot(e.p[0]-ox, e.p[2]-oz);
  /* The threshold is deliberately tiny. A body pressed against a riser has
     had its velocity zeroed every frame, so the movement it is asking for is
     millimetres — which is exactly the case that needs the climb. */
  if(!e.fly && want>.0006 && got<want*.75){
    /* Comfortably over a 27 cm riser, nowhere near a 82 cm seat back or a
       1.15 m barricade — which is the difference between navigable and silly.
       Set these below the riser height and everything piles up at the bottom
       of the stairs looking like a pathfinding bug. */
    for(const lift of [.38,.70]){
      const sx=e.p[0], sy=e.p[1], sz=e.p[2];
      e.p[0]=ox; e.p[1]=oy+lift; e.p[2]=oz;
      if(clearAt(e)){
        e.p[0]+=dx; resolve(e,0);
        e.p[2]+=dz; resolve(e,2);
        const g2=Math.hypot(e.p[0]-ox, e.p[2]-oz);
        if(g2>got+.002){ e.v[0]=vx; e.v[2]=vz; got=g2; break; }
      }
      e.p[0]=sx; e.p[1]=sy; e.p[2]=sz;
    }
  }
  if(!e.fly){
    e.v[1]-=T.gravity*dt;
    e.p[1]+=e.v[1]*dt; resolve(e,1);
    if(e.p[1]<0){ e.p[1]=0; e.v[1]=0; e.ground=true; }
  } else {
    e.p[1]+=e.v[1]*dt; resolve(e,1);
    if(e.p[1]<0){ e.p[1]=0; e.v[1]=0; }
  }
}
function accelerate(e,wx,wz,dt,cap,rate){
  const cur=e.v[0]*wx+e.v[2]*wz, add=cap-cur;
  if(add<=0) return;
  const a=Math.min(rate*dt*cap,add);
  e.v[0]+=wx*a; e.v[2]+=wz*a;
}
/* Height of the floor under a point, used to drop power-ups and place effects
   on whatever surface is actually there rather than on y=0. */
function groundAt(x,y,z){
  let top=0;
  for(let i=0;i<boxes.length;i++){
    if(!solid(i)) continue;
    const b=boxes[i];
    if(x<b[0]||x>b[3]||z<b[2]||z>b[5]) continue;
    if(b[4]<=y+.4 && b[4]>top) top=b[4];
  }
  return top;
}
