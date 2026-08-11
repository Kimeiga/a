/* ============================================================================
   RENDERER

   Forward, one pass, GGX microfacet specular, per-pixel. The interesting part
   is the lighting model, which changed shape when the map moved indoors.

   Outdoors you have one directional light, so 1/lightDir is a uniform and a
   ray-slab shadow test against the level's own collision boxes costs about
   25 arithmetic ops per box with no divides in the loop. Indoors there is no
   sun. The obvious worry is that a point light makes the shadow ray direction
   vary per pixel, so the reciprocal has to be computed per pixel — but it is
   computed ONCE per pixel, not once per box, so it is three divides added to a
   thousand-op function. Point-light shadows cost what directional ones did.

   What actually had to change is which boxes are in the loop. The arena was 43
   boxes and they all fit in the uniform budget; a nine-room building is closer
   to three hundred. So the caster set is distance-culled: the nearest NB boxes
   to the camera go up each frame, and the rest are carried by fog and by the
   fact that you cannot see them. Shadow-map resolution is worst up close,
   which is exactly where this is cheap and exact — the two techniques fail in
   opposite places, and only one of them is in this file.
   ========================================================================== */
const cv = document.getElementById("gl");
const gl = cv.getContext("webgl",{antialias:true,alpha:false,depth:true,stencil:false,
  powerPreference:"high-performance",preserveDrawingBuffer:false,failIfMajorPerformanceCaveat:false});
if(!gl){
  document.getElementById("title").innerHTML =
    '<h1 style="font-size:22px">NO WEBGL</h1><div class="hint">This browser blocked the graphics context.</div>';
  throw new Error("no webgl");
}

const MAXFU = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)||64;
const NL = 6;                                     // unshadowed fill lights
/* Budget: 2 vectors per caster box, plus 2 per fill light, plus ~17 for
   everything else. Truncating casters degrades gracefully; running out of
   uniforms at link time does not. */
const NB = Math.max(0, Math.min(40, ((MAXFU - (17 + 2*NL)) / 2)|0));
const shadowOK = NB >= 10;

const VS = `
attribute vec3 p; attribute vec3 n; attribute vec3 c; attribute vec3 m;
uniform mat4 mvp, vm, model;
varying vec3 vN, vC, vW, vM; varying float vD;
void main(){
  mat3 M3=mat3(model[0].xyz, model[1].xyz, model[2].xyz);
  vec4 w=model*vec4(p,1.0);
  vW=w.xyz; vN=M3*n; vC=c; vM=m;
  vD=-(vm*w).z;
  gl_Position=mvp*vec4(p,1.0);
}`;

const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#define NB ${Math.max(1,NB)}
#define NL ${NL}
varying vec3 vN, vC, vW, vM; varying float vD;
uniform vec3 fog, eye, ambT, ambB;
uniform vec2 fogr, res;
uniform vec4 tint, key;
uniform vec3 keyCol;
uniform vec4 lp[NL];
uniform vec3 lc[NL];
uniform float alpha, unlit, uRefl, time, shOn, shSoft, nBox, nLit;
uniform sampler2D refl;
uniform vec3 bmin[NB], bmax[NB];

/* Ray vs axis-aligned box, slab form, run against the level's real collision
   boxes. No shadow map means no texels, so no pixelation and no resolution to
   pick; no depth comparison means no bias, so no peter-panning and contacts
   land exactly on the caster. 1/d is three divides for the whole loop. */
float shadowRay(vec3 o, vec3 d, float maxT){
  vec3 linv = 1.0/d;
  float occ=0.0;
  for(int i=0;i<NB;i++){
    if(float(i)>=nBox) break;
    vec3 t1=(bmin[i]-o)*linv, t2=(bmax[i]-o)*linv;
    vec3 lo=min(t1,t2), hi=max(t1,t2);
    float tn=max(max(lo.x,lo.y),lo.z);
    float tf=min(min(hi.x,hi.y),hi.z);
    float a=max(tn,0.025), b=min(tf,maxT);
    if(b>a){
      if(shSoft<0.5) return 0.0;
      /* Chord length through the occluder stands in for penumbra coverage and
         widens with distance from the receiver, the way a real one does. */
      occ=max(occ, smoothstep(0.0, 0.07+0.085*a, b-a));
      if(occ>0.985) break;
    }
  }
  return 1.0-occ;
}
float ggx(float NoH,float a){ float a2=a*a, d=NoH*NoH*(a2-1.0)+1.0; return a2/(3.14159265*d*d); }
float vis(float NoV,float NoL,float a){ float k=a*0.5;
  return 0.25/max((NoV*(1.0-k)+k)*(NoL*(1.0-k)+k),1e-4); }
/* Windowed inverse-square. The radius is where it reaches zero, not where it
   stops mattering, so a light can be culled by radius with no visible seam. */
/* Constant / linear / quadratic, windowed by radius so a light can be culled
   with no visible seam. Pure inverse-square is correct and unusable: at the
   intensity that makes a wall four metres away read, the fitting two metres
   away is a white hole and the far end of the theater is black. The linear
   term is the lie that makes one light cover a room. */
float att(float d, float d2, float r){
  float x=d2/max(r*r,1e-3);
  float w=clamp(1.0-x*x, 0.0, 1.0);
  return w*w/(1.0 + 0.42*d + 0.085*d2);
}
vec3 shade(vec3 N, vec3 V, vec3 L, vec3 C, float rough, float f0, vec3 lcol){
  float NoL=max(dot(N,L),0.0);
  vec3 H=normalize(L+V);
  float NoV=max(dot(N,V),1e-3), NoH=max(dot(N,H),0.0), VoH=max(dot(V,H),0.0);
  float a=rough*rough;
  float F=f0+(1.0-f0)*pow(1.0-VoH,5.0);
  return (C + vec3(ggx(NoH,a)*vis(NoV,NoL,a)*F)) * lcol * NoL;
}

void main(){
  vec3 col;
  if(unlit>0.5){ col=vC; }
  else{
    vec3 GN=normalize(vN);
    vec3 N=GN;
    float rough=clamp(vM.x,0.05,1.0), f0=vM.y, emis=vM.z;
    vec2 uv=gl_FragCoord.xy/res;
    if(uRefl>0.5){
      /* Two crossing wave sets tilt the floor normal. The moving highlight is
         most of what reads as "wet" — more than the reflection is. */
      vec2 q=vW.xz;
      float dx=cos(q.x*1.70+time*0.62)*1.70 + cos((q.x+q.y)*1.05+time*0.34)*1.05;
      float dz=cos(q.y*2.10-time*0.48)*2.10 + cos((q.x+q.y)*1.05+time*0.34)*1.05;
      N=normalize(vec3(-dx*0.013, 1.0, -dz*0.013));
      uv+=vec2(dx,dz)*0.0019;
    }
    vec3 V=normalize(eye-vW);
    col = vC*mix(ambB,ambT,N.y*0.5+0.5);

    /* The key light — nearest and brightest — is the one that casts. */
    vec3 kd=key.xyz-vW;
    float kd2=dot(kd,kd);
    if(kd2 < key.w*key.w){
      float kl=sqrt(kd2);
      vec3 L=kd/kl;
      float sh=(shOn>0.5) ? shadowRay(vW+GN*0.022, L, kl-0.06) : 1.0;
      col += shade(N,V,L,vC,rough,f0, keyCol*(att(kl,kd2,key.w)*sh));
    }
    /* Fill lights. No shadow, no branch: the window in att() already takes
       anything out of range to exactly zero. */
    for(int i=0;i<NL;i++){
      if(float(i)>=nLit) break;
      vec3 d=lp[i].xyz-vW;
      float d2=max(dot(d,d),1e-4);
      float di=inversesqrt(d2);
      col += shade(N,V,d*di, vC, rough, f0, lc[i]*att(d2*di,d2,lp[i].w));
    }
    col += vC*emis;

    if(uRefl>0.5){
      vec2 lim=vec2(0.0025), lim2=vec2(0.9975);
      vec2 px=1.6/res;
      vec3 r =texture2D(refl,clamp(uv,lim,lim2)).rgb;
      r+=texture2D(refl,clamp(uv+px,lim,lim2)).rgb;
      r+=texture2D(refl,clamp(uv-px,lim,lim2)).rgb;
      r/=3.0;
      float NoV2=max(dot(N,V),1e-3);
      float fr=0.05+0.95*pow(1.0-NoV2,3.0);
      col=mix(col,r,clamp(fr*1.18,0.0,0.60));
    }
  }
  col=mix(col,tint.rgb,tint.a);
  float f=clamp((vD-fogr.x)/(fogr.y-fogr.x),0.0,1.0);
  gl_FragColor=vec4(mix(col,fog,f),alpha);
}`;

function compile(t,src){
  const q=gl.createShader(t); gl.shaderSource(q,src); gl.compileShader(q);
  if(!gl.getShaderParameter(q,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(q));
  return q;
}
const prog=gl.createProgram();
gl.attachShader(prog,compile(gl.VERTEX_SHADER,VS));
gl.attachShader(prog,compile(gl.FRAGMENT_SHADER,FS));
gl.linkProgram(prog);
if(!gl.getProgramParameter(prog,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
gl.useProgram(prog);

const A_P=gl.getAttribLocation(prog,"p"), A_N=gl.getAttribLocation(prog,"n"),
      A_C=gl.getAttribLocation(prog,"c"), A_M=gl.getAttribLocation(prog,"m");
const U={};
for(const k of ["mvp","vm","model","fog","fogr","res","tint","alpha","unlit","uRefl","time","eye",
                "ambT","ambB","refl","bmin","bmax","nBox","shOn","shSoft","key","keyCol","lp","lc","nLit"])
  /* Array uniforms: some implementations only resolve the "name[0]" form, and
     uniform3fv(null, ...) fails silently — which once made shadows a complete
     no-op that looked exactly like "shadows do not work". Try both. */
  U[k]=gl.getUniformLocation(prog,k)||gl.getUniformLocation(prog,k+"[0]");
for(const a of [A_P,A_N,A_C,A_M]) gl.enableVertexAttribArray(a);
gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);

const FOGC=[.035,.040,.050];
gl.uniform3fv(U.fog,FOGC); gl.clearColor(FOGC[0],FOGC[1],FOGC[2],1);
gl.uniform3f(U.ambT,.128,.142,.182);     // what the ceiling bounces down
gl.uniform3f(U.ambB,.060,.055,.051);     // what the floor bounces up
gl.uniform1i(U.refl,0);

/* ---------- geometry ------------------------------------------------------
   Vertex layout, 12 floats / 48 bytes: pos(3) normal(3) albedo(3) rough/F0/
   emissive(3). Interleaved, so one vertex is one cache line's worth. */
const FACE=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const QF=[[1,5,6,2],[4,0,3,7],[3,2,6,7],[4,5,1,0],[5,4,7,6],[0,1,2,3]];
/* This winding looks wrong and is correct. The first version wound clockwise
   as seen from outside, so face culling threw away every exterior and drew the
   interiors. Do not "fix" it without re-deriving the cross products. */
const QI=[0,2,1,0,3,2];
function pushBox(v,b,col,rg,f0,em){
  const x0=b[0],y0=b[1],z0=b[2],x1=b[3],y1=b[4],z1=b[5];
  const C=[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];
  const R=rg===undefined?.78:rg, S0=f0===undefined?.04:f0, E=em||0;
  for(let f=0;f<6;f++){
    const n=FACE[f], q=QF[f];
    for(const i of QI){ const c=C[q[i]];
      v.push(c[0],c[1],c[2], n[0],n[1],n[2], col[0],col[1],col[2], R,S0,E); }
  }
}
function pushBoxYaw(v,cx,cy,cz,w,h,d,yaw,col,rg,f0,em){
  const cw=Math.cos(yaw), sw=Math.sin(yaw), hw=w/2, hd=d/2;
  const R=(lx,lz)=>[cx+lx*cw-lz*sw, cz+lx*sw+lz*cw];
  const a=R(-hw,-hd), b=R(hw,-hd), c=R(hw,hd), e=R(-hw,hd);
  const C=[[a[0],cy,a[1]],[b[0],cy,b[1]],[b[0],cy+h,b[1]],[a[0],cy+h,a[1]],
           [e[0],cy,e[1]],[c[0],cy,c[1]],[c[0],cy+h,c[1]],[e[0],cy+h,e[1]]];
  const E=em||0;
  for(let f=0;f<6;f++){
    const nl=FACE[f], nx=nl[0]*cw-nl[2]*sw, nz=nl[0]*sw+nl[2]*cw, q=QF[f];
    for(const i of QI){ const p=C[q[i]];
      v.push(p[0],p[1],p[2], nx,nl[1],nz, col[0],col[1],col[2], rg,f0,E); }
  }
}

/* Level solids. Boxes flagged hidden are collision and shadow only: the buried
   world slab and every floor at y=0, which are drawn as quads instead so that
   nothing rendered ever sits below the mirror plane. */
const mapVerts=[];
for(let i=0;i<boxes.length;i++){
  if(bhide[i]) continue;
  if(boxDoor[i]>=0) continue;                 // doors get their own buffer
  pushBox(mapVerts,boxes[i],bcol[i],bmat[i][0],bmat[i][1],bmat[i][2]);
}
const mapBuf=gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER,mapBuf);
gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mapVerts),gl.STATIC_DRAW);
const mapCount=mapVerts.length/12;

/* Doors, rebuilt whenever one is bought. Small buffer, rebuilt eight times a
   game, so there is no reason to be clever about it. */
const doorBuf=gl.createBuffer();
let doorCount=0;
function rebuildDoors(){
  const v=[];
  for(const d of DOORS){
    if(d.open) continue;
    for(const bi of d.boxes){
      pushBox(v,boxes[bi],bcol[bi],bmat[bi][0],bmat[bi][1],0);
      /* Boards nailed across it, so a locked door reads as locked from across
         the room rather than as a wall you have not noticed yet. */
      const b=boxes[bi], mid=(b[1]+b[4])*.5;
      for(let k=-1;k<=1;k++){
        const y=mid+k*.95;
        if(d.face===0) pushBox(v,[b[0]-.12,y-.16,b[2]+.15,b[3]+.12,y+.16,b[5]-.15],[.30,.20,.12],.9,.04,0);
        else           pushBox(v,[b[0]+.15,y-.16,b[2]-.12,b[3]-.15,y+.16,b[5]+.12],[.30,.20,.12],.9,.04,0);
      }
    }
  }
  gl.bindBuffer(gl.ARRAY_BUFFER,doorBuf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(v),gl.STATIC_DRAW);
  doorCount=v.length/12;
}
rebuildDoors();

/* Emissive trim: drawn and reflected, never a caster. */
const decoVerts=[];
for(const d of deco) pushBox(decoVerts,d[0],[d[1][0],d[1][1],d[1][2]],d[1][3],d[1][4],d[1][5]);
const decoBuf=gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER,decoBuf);
gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(decoVerts),gl.STATIC_DRAW);
const decoCount=decoVerts.length/12;

/* Floors. Lighting is per-pixel now, so tessellation buys nothing but tiles —
   which is worth exactly one thing: a checker in the marble, so the reflection
   has some structure to distort. */
const floorVerts=[], floorRVerts=[];
for(const F of FLOORS){
  const step = F.refl ? 2.4 : 6.0;
  const out = F.refl ? floorRVerts : floorVerts;
  const nx=Math.max(1,Math.round((F.x1-F.x0)/step)), nz=Math.max(1,Math.round((F.z1-F.z0)/step));
  const sx=(F.x1-F.x0)/nx, sz=(F.z1-F.z0)/nz;
  for(let i=0;i<nx;i++) for(let j=0;j<nz;j++){
    const x=F.x0+i*sx, z=F.z0+j*sz;
    const k = F.refl ? ((i+j)&1 ? .78 : 1.06) : (((i*7+j*13)%5)*.035+.92);
    const c=[F.M[0]*k,F.M[1]*k,F.M[2]*k];
    const put=(px,pz)=>out.push(px,F.y,pz, 0,1,0, c[0],c[1],c[2], F.M[3],F.M[4],0);
    put(x,z); put(x+sx,z+sz); put(x+sx,z);
    put(x,z); put(x,z+sz); put(x+sx,z+sz);
  }
}
const floorBuf=gl.createBuffer(), floorRBuf=gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER,floorBuf);
gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(floorVerts),gl.STATIC_DRAW);
gl.bindBuffer(gl.ARRAY_BUFFER,floorRBuf);
gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(floorRVerts),gl.STATIC_DRAW);
const floorCount=floorVerts.length/12, floorRCount=floorRVerts.length/12;

const dynBuf=gl.createBuffer(), lineBuf=gl.createBuffer(), gunBuf=gl.createBuffer();
const flashBuf=gl.createBuffer(), propBuf=gl.createBuffer();

/* ---------- shadow casters ------------------------------------------------
   Every solid box is a candidate; the nearest NB to the camera go up. Ceilings
   are excluded because every light in the building hangs below them, and
   anything whose top is at or under the floor plane is excluded because it can
   only ever occlude itself. */
const ROOFSET=new Set(ROOF);
const CAST=[];
for(let i=1;i<boxes.length;i++){
  if(bhide[i]||ROOFSET.has(i)) continue;
  const b=boxes[i];
  if(b[4]<=.06) continue;
  CAST.push(i);
}
const castC=new Float32Array(CAST.length*4);
for(let k=0;k<CAST.length;k++){
  const b=boxes[CAST[k]];
  castC[k*4]  =(b[0]+b[3])*.5; castC[k*4+1]=(b[1]+b[4])*.5; castC[k*4+2]=(b[2]+b[5])*.5;
  castC[k*4+3]=Math.hypot(b[3]-b[0],b[4]-b[1],b[5]-b[2])*.5;
}
const castKey=new Float32Array(CAST.length);
const castOrd=new Array(CAST.length); for(let i=0;i<CAST.length;i++) castOrd[i]=i;
const sbMin=new Float32Array(Math.max(3,NB*3)), sbMax=new Float32Array(Math.max(3,NB*3));
const DYNSLOTS=Math.min(6,Math.max(0,NB-12));
let castN=0, castTick=0;

function sortCasters(px,py,pz){
  for(let k=0;k<CAST.length;k++){
    const i=k*4;
    const dx=castC[i]-px, dy=castC[i+1]-py, dz=castC[i+2]-pz;
    castKey[k]=Math.sqrt(dx*dx+dy*dy+dz*dz)-castC[i+3];
  }
  castOrd.sort((a,b)=>castKey[a]-castKey[b]);
}
function setBox(i,b){
  sbMin[i*3]=b[0]; sbMin[i*3+1]=b[1]; sbMin[i*3+2]=b[2];
  sbMax[i*3]=b[3]; sbMax[i*3+1]=b[4]; sbMax[i*3+2]=b[5];
}
/* Static half of the set, refreshed on a slow tick: the sort is the only
   O(n log n) thing in the frame and the answer barely changes in 50 ms. */
function refreshCasters(px,py,pz){
  sortCasters(px,py,pz);
  const room=NB-DYNSLOTS;
  let n=0;
  for(let k=0;k<CAST.length && n<room;k++){
    const bi=CAST[castOrd[k]];
    const dr=boxDoor[bi];
    if(dr>=0 && DOORS[dr].open) continue;
    setBox(n++, boxes[bi]);
  }
  castN=n;
}
function uploadCasters(dyn){
  let n=castN;
  for(let i=0;i<dyn.length && n<NB;i++) setBox(n++, dyn[i]);
  gl.uniform3fv(U.bmin,sbMin); gl.uniform3fv(U.bmax,sbMax);
  gl.uniform1f(U.nBox,n);
}

/* ---------- light selection ----------------------------------------------
   Seven of forty, chosen against a point ahead of the camera rather than the
   camera itself: the pixels are in front of you, so the lights that matter are
   the ones lighting what you are looking at, not the ones behind your head. */
const LIGHT_GAIN=7.2;         // fittings are dim numbers; rooms are not
let lightScale=0.70;          // rises when the power lands
const lpArr=new Float32Array(NL*4), lcArr=new Float32Array(NL*3);
const lightOrd=new Array(LIGHTS.length); for(let i=0;i<LIGHTS.length;i++) lightOrd[i]=i;
const lightKey=new Float32Array(LIGHTS.length);
let keyLight=null;
function pickLights(px,py,pz,fx,fy,fz){
  const ax=px+fx*6, ay=py+fy*2.5, az=pz+fz*6;
  for(let i=0;i<LIGHTS.length;i++){
    const L=LIGHTS[i];
    if(L[7]===1 && !game.power){ lightKey[i]=1e9; continue; }
    const d=Math.hypot(L[0]-ax,(L[1]-ay)*.7,L[2]-az);
    /* Score by distance measured in that light's own radius, not in metres.
       Ranked by raw proximity, a 6 m exit sign three metres behind you beats
       the chandelier lighting everything you can see — so the one light that
       casts shadows would be the one contributing nothing, and shadows would
       flicker on and off as you walked past fittings. */
    const bright=Math.max(L[3],Math.max(L[4],L[5]));
    lightKey[i]= d>L[6]+2 ? 1e9 : d/Math.max(1,L[6]*bright);
  }
  lightOrd.sort((a,b)=>lightKey[a]-lightKey[b]);
  const k=LIGHTS[lightOrd[0]];
  if(lightKey[lightOrd[0]]>1e8){
    keyLight=null;
    gl.uniform4f(U.key,0,-99,0,.001); gl.uniform3f(U.keyCol,0,0,0);
  } else {
    keyLight=k;
    const g=lightScale*LIGHT_GAIN*1.22;   // the shadowed light leads; fills follow
    gl.uniform4f(U.key,k[0],k[1],k[2],k[6]);
    gl.uniform3f(U.keyCol,k[3]*g,k[4]*g,k[5]*g);
  }
  let n=0;
  for(let i=1;i<LIGHTS.length && n<NL;i++){
    const j=lightOrd[i];
    if(lightKey[j]>1e8) break;
    const L=LIGHTS[j];
    lpArr[n*4]=L[0]; lpArr[n*4+1]=L[1]; lpArr[n*4+2]=L[2]; lpArr[n*4+3]=L[6];
    const g2=lightScale*LIGHT_GAIN*.84;
    lcArr[n*3]=L[3]*g2; lcArr[n*3+1]=L[4]*g2; lcArr[n*3+2]=L[5]*g2;
    n++;
  }
  for(let i=n;i<NL;i++){ lpArr[i*4+3]=.001; lcArr[i*3]=lcArr[i*3+1]=lcArr[i*3+2]=0; }
  gl.uniform4fv(U.lp,lpArr); gl.uniform3fv(U.lc,lcArr); gl.uniform1f(U.nLit,n);
}

/* ---------- mirror target -------------------------------------------------
   Half resolution IS the roughness blur, and it costs a quarter of the pixels
   instead of adding a blur pass. Raising it makes the marble glassier, which
   is not the same as better. */
let rTex=null,rFbo=null,rDep=null,rW=0,rH=0;
function reflAlloc(w,h){
  rW=Math.max(64,w|0); rH=Math.max(64,h|0);
  if(!rFbo){ rFbo=gl.createFramebuffer(); rTex=gl.createTexture(); rDep=gl.createRenderbuffer(); }
  gl.bindTexture(gl.TEXTURE_2D,rTex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,rW,rH,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.bindRenderbuffer(gl.RENDERBUFFER,rDep);
  gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,rW,rH);
  gl.bindFramebuffer(gl.FRAMEBUFFER,rFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,rTex,0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,rDep);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
}

function bindStride(){
  gl.vertexAttribPointer(A_P,3,gl.FLOAT,false,48,0);
  gl.vertexAttribPointer(A_N,3,gl.FLOAT,false,48,12);
  gl.vertexAttribPointer(A_C,3,gl.FLOAT,false,48,24);
  gl.vertexAttribPointer(A_M,3,gl.FLOAT,false,48,36);
}
function drawArr(buf,arr,mode){
  if(!arr.length) return;
  gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(arr),gl.DYNAMIC_DRAW);
  bindStride();
  gl.drawArrays(mode||gl.TRIANGLES,0,arr.length/12);
}

/* ---------- the per-frame scratch buffer ---------------------------------
   Twenty-six bodies of eight boxes each is sixty thousand floats a frame.
   Array.push would spend a millisecond of the frame just growing an array, so
   the dynamic geometry is written straight into one preallocated Float32Array
   with a cursor, and uploaded as a subarray view with no copy. */
const DYN=new Float32Array(280000);
let dynN=0;
function dynReset(){ dynN=0; }
function wVert(x,y,z,nx,ny,nz,c,rg,f0,em){
  const a=DYN, i=dynN;
  a[i]=x;a[i+1]=y;a[i+2]=z; a[i+3]=nx;a[i+4]=ny;a[i+5]=nz;
  a[i+6]=c[0];a[i+7]=c[1];a[i+8]=c[2]; a[i+9]=rg;a[i+10]=f0;a[i+11]=em;
  dynN=i+12;
}
/* Yaw-rotated box, written directly. Bodies are boxes so the visual and the
   hitbox are the same object — you never shoot a shape that is not there. */
function wBoxYaw(cx,cy,cz,w,h,d,yaw,col,rg,f0,em){
  if(dynN+432>DYN.length) return;
  const cw=Math.cos(yaw), sw=Math.sin(yaw), hw=w/2, hd=d/2;
  const rx=(lx,lz)=>cx+lx*cw-lz*sw, rz=(lx,lz)=>cz+lx*sw+lz*cw;
  const C=[[rx(-hw,-hd),cy,rz(-hw,-hd)],[rx(hw,-hd),cy,rz(hw,-hd)],
           [rx(hw,-hd),cy+h,rz(hw,-hd)],[rx(-hw,-hd),cy+h,rz(-hw,-hd)],
           [rx(-hw,hd),cy,rz(-hw,hd)],[rx(hw,hd),cy,rz(hw,hd)],
           [rx(hw,hd),cy+h,rz(hw,hd)],[rx(-hw,hd),cy+h,rz(-hw,hd)]];
  const E=em||0;
  for(let f=0;f<6;f++){
    const nl=FACE[f], nx=nl[0]*cw-nl[2]*sw, nz=nl[0]*sw+nl[2]*cw, q=QF[f];
    for(let k=0;k<6;k++){ const p=C[q[QI[k]]]; wVert(p[0],p[1],p[2],nx,nl[1],nz,col,rg,f0,E); }
  }
}
function wBox(b,col,rg,f0,em){
  if(dynN+432>DYN.length) return;
  const x0=b[0],y0=b[1],z0=b[2],x1=b[3],y1=b[4],z1=b[5];
  const C=[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];
  const E=em||0;
  for(let f=0;f<6;f++){
    const n=FACE[f], q=QF[f];
    for(let k=0;k<6;k++){ const c=C[q[QI[k]]]; wVert(c[0],c[1],c[2],n[0],n[1],n[2],col,rg,f0,E); }
  }
}
function dynDraw(buf){
  if(!dynN) return;
  gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,DYN.subarray(0,dynN),gl.DYNAMIC_DRAW);
  bindStride();
  gl.drawArrays(gl.TRIANGLES,0,dynN/12);
}
