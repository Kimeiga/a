/* ---------- math ---------------------------------------------------------- */
const clamp = (v,a,b) => v<a ? a : v>b ? b : v;
const DOWN = [0,-1,0];
const TAU = 6.283185307;
/* One seeded generator for everything the sim touches, so a replay of the same
   inputs is the same game and a headless test can assert on outcomes. */
let _seed = 0x2f6e2b1;
function rnd(){ _seed ^= _seed<<13; _seed ^= _seed>>>17; _seed ^= _seed<<5; return (_seed>>>0)/4294967296; }
function rndSeed(s){ _seed = (s|0) || 1; }
const rrange = (a,b) => a + (b-a)*rnd();
const pick = (a) => a[(rnd()*a.length)|0];

function perspective(o,fov,asp,n,f){
  const t = 1/Math.tan(fov*Math.PI/360);
  o[0]=t/asp; o[1]=o[2]=o[3]=o[4]=0; o[5]=t; o[6]=o[7]=o[8]=o[9]=0;
  o[10]=(f+n)/(n-f); o[11]=-1; o[12]=o[13]=0; o[14]=2*f*n/(n-f); o[15]=0;
}
function viewM(o,ex,ey,ez,yaw,pitch){
  const cp=Math.cos(pitch), sp=Math.sin(pitch), cy=Math.cos(yaw), sy=Math.sin(yaw);
  const fx=sy*cp, fy=sp, fz=-cy*cp;
  const rx=cy, ry=0, rz=sy;
  const ux=-sy*sp, uy=cp, uz=cy*sp;
  o[0]=rx; o[4]=ry; o[8]=rz;    o[12]=-(rx*ex+ry*ey+rz*ez);
  o[1]=ux; o[5]=uy; o[9]=uz;    o[13]=-(ux*ex+uy*ey+uz*ez);
  o[2]=-fx;o[6]=-fy;o[10]=-fz;  o[14]=fx*ex+fy*ey+fz*ez;
  o[3]=0;  o[7]=0;  o[11]=0;    o[15]=1;
}
function mul(o,a,b){
  for(let c=0;c<4;c++) for(let r=0;r<4;r++){
    let s=0; for(let k=0;k<4;k++) s+=a[r+k*4]*b[k+c*4];
    o[r+c*4]=s;
  }
}
function fwd(yaw,pitch){ const cp=Math.cos(pitch); return [Math.sin(yaw)*cp, Math.sin(pitch), -Math.cos(yaw)*cp]; }
function basis(yaw,pitch){
  const f=fwd(yaw,pitch), r=[Math.cos(yaw),0,Math.sin(yaw)];
  return [f, r, [r[1]*f[2]-r[2]*f[1], r[2]*f[0]-r[0]*f[2], r[0]*f[1]-r[1]*f[0]]];
}
function idm(o){ o.set([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); }
function rotX(o,a){ const c=Math.cos(a),s=Math.sin(a); o.set([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]); }
function rotY(o,a){ const c=Math.cos(a),s=Math.sin(a); o.set([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]); }
function rotZ(o,a){ const c=Math.cos(a),s=Math.sin(a); o.set([c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]); }
function angWrap(a){ while(a>Math.PI)a-=TAU; while(a<-Math.PI)a+=TAU; return a; }

/* Ray vs axis-aligned box, slab form: for each axis find where the ray crosses
   that axis's two planes, keep the latest entry and the earliest exit. If it
   leaves after it enters, it hit. Returns entry distance, or -1. */
function rayBox(o,d,b){
  let tn=0, tf=1e9;
  for(let a=0;a<3;a++){
    if(Math.abs(d[a])<1e-7){ if(o[a]<b[a]||o[a]>b[a+3]) return -1; continue; }
    let t1=(b[a]-o[a])/d[a], t2=(b[a+3]-o[a])/d[a];
    if(t1>t2){ const t=t1; t1=t2; t2=t; }
    if(t1>tn) tn=t1;
    if(t2<tf) tf=t2;
    if(tn>tf) return -1;
  }
  return tn;
}
const dist2 = (a,b) => (a[0]-b[0])**2 + (a[2]-b[2])**2;
const len2 = (x,z) => Math.sqrt(x*x+z*z);
