/* ============================================================================
   NAVIGATION

   Zombies in this mode do exactly one thing — walk at you — but "at you" in a
   nine-room building with locked doors is a pathfinding problem, and a hundred
   of them each running A* is not something a phone should be asked to do.

   So: one grid of waypoints over the rooms, built once at load; one
   breadth-first sweep out from the player's own waypoint, recomputed a few
   times a second; every zombie just walks to the neighbour its node points at.
   The cost of pathing the whole horde is the cost of pathing one of them.

   Edges are built as if every door were already open and then tagged with the
   door they cross, so buying a door reconnects the graph with a boolean rather
   than a rebuild.
   ========================================================================== */
const NAV = {
  x:[], y:[], z:[],        // node positions
  edge:[],                 // edge[i] = array of {n, door}
  next:[],                 // flow field: next node toward the player
  dist:[],                 // hops to the player, Infinity if unreachable
  room:[],                 // room id per node
  cell:new Map(),          // grid key -> node index, for O(1) lookup
  n:0, spacing:2.4,
};

/* Is a capsule-sized volume at this point clear of level geometry?
   `skipDoors` builds the graph as though every door were bought. */
function navFree(x,y,z,skipDoors,rad,yLo,yHi){
  const r = rad===undefined ? .58 : rad;
  const x0=x-r, x1=x+r, z0=z-r, z1=z+r;
  const y0=y+(yLo===undefined?.25:yLo), y1=y+(yHi===undefined?1.55:yHi);
  for(let i=1;i<boxes.length;i++){
    if(skipDoors && boxDoor[i]>=0) continue;
    const b=boxes[i];
    if(x1<=b[0]||x0>=b[3]||y1<=b[1]||y0>=b[4]||z1<=b[2]||z0>=b[5]) continue;
    return false;
  }
  return true;
}
/* Highest surface under a point that is at or below `ymax`. Doors are skipped
   for the same reason edges are built through them: the graph describes the
   building, and which parts of it you have paid for is a separate question.
   A door counted as floor put the top of the grand staircase at the bottom. */
function navGround(x,z,ymax){
  let top=-99;
  for(let i=0;i<boxes.length;i++){
    if(boxDoor[i]>=0) continue;
    const b=boxes[i];
    if(x<b[0]-.02||x>b[3]+.02||z<b[2]-.02||z>b[5]+.02) continue;
    if(b[4]<=ymax && b[4]>top) top=b[4];
  }
  return top;
}
/* Spatial hash for "which waypoint am I standing on". The cell has to be at
   least the node spacing or a 3x3x3 probe steps clean over the neighbouring
   node and returns something metres away — which makes the flow field jump
   between unrelated routes every frame, and a horde that shuffles on the spot
   looking like a pathfinding failure when the pathfinding is fine. Cells hold
   lists, not single indices, because ramp nodes are much denser than the grid. */
const NAV_CS=2.6, NAV_CSY=2.2;
const navKey = (x,y,z) =>
  (Math.floor(x/NAV_CS)+512) + (Math.floor(z/NAV_CS)+512)*2048 + (Math.floor(y/NAV_CSY)+16)*2048*2048;

function navPut(x,y,z,room){
  NAV.x.push(x); NAV.y.push(y); NAV.z.push(z); NAV.room.push(room);
  const k=navKey(x,y,z);
  let c=NAV.cell.get(k);
  if(!c){ c=[]; NAV.cell.set(k,c); }
  c.push(NAV.n);
  NAV.n++;
}
function navBuild(){
  const S2=NAV.spacing;
  for(const key in ROOM){
    const R=ROOM[key];
    for(let x=R.x0+S2*.5; x<R.x1; x+=S2)
      for(let z=R.z0+S2*.5; z<R.z1; z+=S2){
        /* Only the room's own floor, not the top of whatever is standing on
           it. Putting waypoints on the seat backs made a third of the theater
           an island: reachable-looking, connected to nothing. */
        const g=navGround(x, z, R.y+.55);
        if(g<R.y-.15) continue;
        if(!navFree(x,g,z,true)) continue;
        navPut(x,g,z,key);
      }
  }
  /* Ramps get walked rather than sampled on the room grid, because a
     staircase's floor is a different height every metre and the grid was
     dropping the top of every flight. */
  for(const R of RAMPS){
    const along=Math.hypot(R.x1-R.x0, R.z1-R.z0);
    const n=Math.max(2, Math.round(along/(R.step||.9)));
    for(let i=0;i<=n;i++){
      const f=i/n;
      const bx=R.x0+(R.x1-R.x0)*f, bz=R.z0+(R.z1-R.z0)*f;
      for(const side of R.sides){
        const x=bx+R.nx*side, z=bz+R.nz*side;
        const g=navGround(x, z, R.top);
        if(g<-.1) continue;
        /* Clearance from knee height up, and narrow. Testing from ankle height
           makes the next step up count as an obstacle, which rejects every
           node on a staircase except the two ends. */
        if(!navFree(x,g,z,true,.30,.62,1.85)) continue;
        navPut(x,g,z,R.room);
      }
    }
  }
  /* Edges. Grid neighbours within a step and a half, provided the midpoint is
     also clear and the climb is something a walking corpse could manage. */
  const R2=(S2*1.6)**2;
  for(let i=0;i<NAV.n;i++) NAV.edge.push([]);
  for(let i=0;i<NAV.n;i++){
    for(let j=i+1;j<NAV.n;j++){
      const dx=NAV.x[j]-NAV.x[i], dz=NAV.z[j]-NAV.z[i], dy=NAV.y[j]-NAV.y[i];
      const d2=dx*dx+dz*dz;
      if(d2>R2 || d2<.02) continue;
      if(Math.abs(dy)>.92) continue;
      const mx=(NAV.x[i]+NAV.x[j])*.5, mz=(NAV.z[i]+NAV.z[j])*.5, my=Math.max(NAV.y[i],NAV.y[j]);
      if(!navFree(mx,my,mz,true,.42)) continue;
      const dr=edgeDoor(i,j), w=Math.sqrt(d2+dy*dy);
      NAV.edge[i].push({n:j,door:dr,w});
      NAV.edge[j].push({n:i,door:dr,w});
    }
  }
  NAV.next=new Int32Array(NAV.n).fill(-1);
  NAV.dist=new Float32Array(NAV.n).fill(1e9);
  NAV.q=new Int32Array(NAV.n);
}
/* Which door does this edge pass through? Answered by intersecting the actual
   segment with the door's box, not by asking where the midpoint landed —
   whether the midpoint happens to fall inside a 56 cm slab depends on the grid
   phase, and getting it wrong leaves a door that costs money and gates
   nothing. */
function edgeDoor(i,j){
  const ax=NAV.x[i], ay=NAV.y[i]+.9, az=NAV.z[i];
  const dx=NAV.x[j]-ax, dy=(NAV.y[j]+.9)-ay, dz=NAV.z[j]-az;
  const L=Math.hypot(dx,dy,dz)||1;
  const d=[dx/L,dy/L,dz/L], o=[ax,ay,az];
  for(const dr of DOORS){
    for(const bi of dr.boxes){
      const b=boxes[bi];
      const e=[b[0]-.25,b[1]-.25,b[2]-.25,b[3]+.25,b[4]+.25,b[5]+.25];
      const t=rayBox(o,d,e);
      if(t>=0 && t<=L) return dr.id;
    }
  }
  return -1;
}

/* Nearest node to a point. The grid key hits directly almost every time;
   the fallback widens by one cell before giving up and scanning. */
function navNode(x,y,z){
  let best=-1, bd=1e9;
  for(let ox=-1;ox<=1;ox++) for(let oz=-1;oz<=1;oz++) for(let oy=-1;oy<=1;oy++){
    const c=NAV.cell.get(navKey(x+ox*NAV_CS, y+oy*NAV_CSY, z+oz*NAV_CS));
    if(!c) continue;
    for(let q=0;q<c.length;q++){
      const i=c[q];
      const d=(NAV.x[i]-x)**2+(NAV.z[i]-z)**2+(NAV.y[i]-y)**2*4;
      if(d<bd){bd=d;best=i;}
    }
  }
  if(best>=0) return best;
  for(let i=0;i<NAV.n;i++){
    const d=(NAV.x[i]-x)**2+(NAV.z[i]-z)**2+(NAV.y[i]-y)**2*4;
    if(d<bd){bd=d;best=i;}
  }
  return best;
}

/* One sweep out from the player paints the whole building, and everything that
   wants to reach you reads it — the horde paths for the cost of one.

   Dijkstra on real edge lengths rather than breadth-first on hops. On a grid,
   hop count treats a diagonal and a sidestep as equal, so the "shortest" route
   is one of thousands of equally-short staircases and a train visibly zig-zags
   along it. Weighting by metres costs a heap and buys a curve. */
let navRoot=-1;
const navHeap=new Int32Array(4096);
function navFlow(x,y,z){
  const root=navNode(x,y,z);
  if(root<0) return;
  navRoot=root;
  const dist=NAV.dist, next=NAV.next, H=navHeap;
  dist.fill(1e9); next.fill(-1);
  let n=0;
  const push=(v)=>{
    if(n>=H.length) return;
    let i=n++; H[i]=v;
    while(i>0){ const p=(i-1)>>1; if(dist[H[p]]<=dist[H[i]]) break;
      const t=H[p]; H[p]=H[i]; H[i]=t; i=p; }
  };
  const pop=()=>{
    const top=H[0]; H[0]=H[--n];
    let i=0;
    for(;;){ const l=i*2+1, r=l+1; let m=i;
      if(l<n && dist[H[l]]<dist[H[m]]) m=l;
      if(r<n && dist[H[r]]<dist[H[m]]) m=r;
      if(m===i) break;
      const t=H[m]; H[m]=H[i]; H[i]=t; i=m; }
    return top;
  };
  dist[root]=0; push(root);
  while(n>0){
    const c=pop();
    const es=NAV.edge[c], dc=dist[c];
    for(let k=0;k<es.length;k++){
      const e=es[k];
      if(e.door>=0 && !DOORS[e.door].open) continue;
      const nd=dc+e.w;
      if(nd<dist[e.n]){ dist[e.n]=nd; next[e.n]=c; push(e.n); }
    }
  }
}

/* Which rooms are reachable right now — gates where a round is allowed to
   spawn, so opening the alley is what puts zombies in the alley. */
function refreshRooms(){
  for(const k in ROOM) ROOM[k].open=false;
  ROOM.lobby.open=true;
  const adj={};
  for(const d of DOORS){ if(!d.open) continue;
    (adj[d.a]=adj[d.a]||[]).push(d.b); (adj[d.b]=adj[d.b]||[]).push(d.a); }
  /* the theater is joined to the corridor under the balcony for free */
  (adj.under=adj.under||[]).push("theater"); (adj.theater=adj.theater||[]).push("under");
  (adj.theater=adj.theater||[]).push("stage"); (adj.stage=adj.stage||[]).push("theater");
  const q=["lobby"];
  while(q.length){
    const r=q.pop();
    for(const n of (adj[r]||[])) if(!ROOM[n].open){ ROOM[n].open=true; q.push(n); }
  }
  ROOM.pap.open=false;                        // only ever reached by teleporter
}

/* Which room contains a point. Used for spawn gating and for the "you are
   here" line, and it has to prefer the room whose floor is nearest below. */
function roomAt(x,y,z){
  let best=null, bd=1e9;
  for(const k in ROOM){
    const R=ROOM[k];
    if(x<R.x0-.5||x>R.x1+.5||z<R.z0-.5||z>R.z1+.5) continue;
    const d=Math.abs(y-R.y);
    if(d<bd){ bd=d; best=R; }
  }
  return best;
}
