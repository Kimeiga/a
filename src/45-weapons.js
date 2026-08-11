/* ============================================================================
   WEAPONS

   Twelve guns, no meshes. Each shape is a recipe of ten or so boxes in camera
   space — x right, y up, -z forward, origin at the hand — and the differences
   between an M1911 and an RPK are entirely in the numbers. A rigged, textured
   weapon set is 300 KB before you have fired it; this is about forty lines and
   it still reads instantly, because silhouette is what you actually see of a
   viewmodel and silhouette is cheap.

   Pack-A-Punch re-tints the same recipe and bolts a glowing core into it,
   which is exactly what Pack-A-Punch does.
   ========================================================================== */
const GUNMAT = {
  steel:[.26,.27,.30, .32,.55], dark:[.12,.13,.15, .30,.58],
  poly: [.15,.15,.16, .74,.04], wood:[.20,.13,.075,.62,.05],
  brass:[.52,.40,.16, .26,.62], glow:[.30,.85,1.0, .90,.04, 1.9],
  green:[.30,1.0,.42, .90,.04, 1.8], hot:[1.0,.55,.15, .90,.04, 1.9],
  papA: [.10,.14,.20, .24,.62], papB:[.16,.42,.55, .30,.60],
};
/* [x0,y0,z0, x1,y1,z1, material] — camera space, metres. */
const GUNSHAPE = {
  pistol:[
    [-.026,-.018,-.300, .026,.052,.020,"steel"],
    [-.012,-.006,-.360, .012,.030,-.300,"dark"],
    [-.018,-.130,-.150, .018,-.014,-.070,"dark"],
    [-.020,-.120,-.030, .020,-.010,.055,"poly"],
    [-.022,-.020,.020, .022,.044,.090,"steel"],
    [-.008,.052,-.290, .008,.064,-.250,"dark"],
  ],
  rifle:[
    [-.028,-.020,-.350, .028,.056,.030,"steel"],
    [-.025,-.031,-.545, .025,.031,-.350,"poly"],
    [-.010,-.009,-.720, .010,.013,-.545,"dark"],
    [-.017,.056,-.265, .017,.072,-.115,"dark"],
    [-.027,.072,-.226, .027,.114,-.176,"dark"],
    [-.023,-.155,-.215, .023,-.020,-.120,"poly"],
    [-.022,-.136,-.048, .022,-.018,.040,"poly"],
    [-.025,-.018,.026, .025,.048,.180,"wood"],
    [-.013,-.014,-.760, .013,.016,-.720,"steel"],
  ],
  smg:[
    [-.027,-.019,-.310, .027,.050,.026,"dark"],
    [-.021,-.026,-.470, .021,.026,-.310,"steel"],
    [-.009,-.008,-.610, .009,.011,-.470,"dark"],
    [-.021,-.230,-.205, .021,-.018,-.130,"steel"],
    [-.021,-.130,-.040, .021,-.016,.044,"poly"],
    [-.010,-.006,.030, .010,.036,.200,"steel"],
    [-.030,-.004,.180, .030,.034,.210,"steel"],
    [-.008,.050,-.300, .008,.062,-.262,"dark"],
  ],
  shotgun:[
    [-.030,-.022,-.290, .030,.050,.050,"wood"],
    [-.026,-.030,-.660, .026,.006,-.290,"dark"],
    [-.026,.008,-.660, .026,.044,-.290,"dark"],
    [-.034,-.062,-.470, .034,-.030,-.300,"wood"],
    [-.022,-.132,-.040, .022,-.016,.046,"wood"],
    [-.026,-.016,.046, .026,.048,.200,"wood"],
    [-.009,.048,-.640, .009,.060,-.600,"steel"],
  ],
  lmg:[
    [-.032,-.024,-.360, .032,.062,.040,"dark"],
    [-.026,-.032,-.560, .026,.032,-.360,"steel"],
    [-.011,-.010,-.790, .011,.014,-.560,"dark"],
    [-.052,-.150,-.230, .052,-.020,-.110,"steel"],
    [-.024,-.140,-.046, .024,-.018,.044,"poly"],
    [-.026,-.020,.030, .026,.052,.215,"wood"],
    [-.019,.062,-.300, .019,.078,-.140,"dark"],
    [-.014,-.098,-.560, .014,-.030,-.520,"steel"],
    [-.010,.078,-.290, .010,.092,-.250,"dark"],
  ],
  ray:[
    [-.042,-.026,-.300, .042,.062,.040,"papA"],
    [-.030,-.034,-.430, .030,.042,-.300,"dark"],
    [-.020,-.020,-.520, .020,.026,-.430,"steel"],
    [-.024,-.128,-.052, .024,-.016,.044,"dark"],
    [-.033,.062,-.250, .033,.088,-.120,"green"],
    [-.020,-.030,-.560, .020,.022,-.520,"green"],
    [-.045,-.010,-.180, .045,.030,-.120,"green"],
  ],
  thunder:[
    [-.046,-.028,-.290, .046,.066,.050,"steel"],
    [-.026,-.130,-.050, .026,-.016,.046,"dark"],
    [-.030,-.020,.046, .030,.054,.190,"dark"],
    [-.062,-.046,-.560, .062,.082,-.290,"dark"],
    [-.020,-.020,-.640, .020,.020,-.560,"steel"],
    [-.056,.006,-.640, -.024,.046,-.560,"steel"],
    [ .024,.006,-.640, .056,.046,-.560,"steel"],
    [-.020,-.046,-.640, .020,-.008,-.560,"steel"],
    [-.052,.070,-.420, .052,.086,-.320,"glow"],
  ],
};
const gunCache={};
function gunGeom(kind,pap){
  const k=kind+(pap?"+":"");
  if(gunCache[k]) return gunCache[k];
  const v=[];
  for(const part of GUNSHAPE[kind]||GUNSHAPE.rifle){
    let m=GUNMAT[part[6]]||GUNMAT.steel;
    if(pap){
      /* Pack-A-Punch: everything metal goes blue-black, everything already
         glowing goes hotter, and one strip is added that was not there. */
      if(part[6]==="wood"||part[6]==="poly") m=GUNMAT.papA;
      else if(part[6]==="steel"||part[6]==="dark") m=GUNMAT.papB;
    }
    pushBox(v,[part[0],part[1],part[2],part[3],part[4],part[5]],
            [m[0],m[1],m[2]],m[3],m[4],m[5]||0);
  }
  if(pap){
    const g=GUNMAT.glow;
    pushBox(v,[-.030,-.026,-.318,.030,-.014,-.070],[g[0],g[1],g[2]],g[3],g[4],g[5]);
    pushBox(v,[-.032,.050,-.150,.032,.058,-.060],[g[0],g[1],g[2]],g[3],g[4],g[5]);
  }
  const buf=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(v),gl.STATIC_DRAW);
  return gunCache[k]={buf,count:v.length/12};
}
/* Muzzle flash: three crossed cards at the barrel, scaled to the gun. */
const flashGeom=(function(){
  const v=[];
  for(const f of [[[-.075,-.008,-.900],[.075,.008,-.700]],
                  [[-.008,-.075,-.900],[.008,.075,-.700]],
                  [[-.032,-.032,-1.02],[.032,.032,-.820]]])
    pushBox(v,[f[0][0],f[0][1],f[0][2],f[1][0],f[1][1],f[1][2]],[1,.90,.55],1,0,0);
  const buf=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(v),gl.STATIC_DRAW);
  return {buf,count:v.length/12};
})();

/* ---------- runtime weapon state ------------------------------------------
   A slot is a key plus its own ammo and its own upgrade state, because
   Pack-A-Punching your MP40 must not upgrade the pistol in the other slot. */
function makeSlot(key,full){
  const W=WEAPONS[key];
  return {key, mag:W.mag, res: full===undefined?W.res:full, pap:0};
}
function wstat(slot){
  const W=WEAPONS[slot.key];
  const p=slot.pap;
  return {
    n: p? (W.pap||("UPGRADED "+W.n)) : W.n,
    dmg: W.dmg * (p?2.5:1),
    rpm: W.rpm,
    mag: Math.round(W.mag*(p?2:1)),
    resMax: Math.round(W.res*(p?1.5:1)),
    hs: W.hs, reload: W.reload, kind: W.kind,
    pellets: W.pellets||1, spread: W.spread||0, burst: W.burst||0,
    splash: W.splash||0, splashDmg:(W.splashDmg||0)*(p?2.5:1), self:W.self||0,
    cone: W.cone||0, range: W.range||0,
  };
}
/* Fixed recoil pattern, no random cone anywhere. Every round leaves on the
   exact line the dot is on; what climbs is the camera, and it climbs the same
   way every time, so a long burst is learnable instead of a dice roll. */
function recoilOf(kind,i){
  const s = kind==="lmg"?1.25 : kind==="smg"?.78 : kind==="pistol"?.7 : kind==="shotgun"?2.3 : 1;
  const v = (i<3 ? .0048+i*.0014 : i<10 ? .0100 : .0070) * s;
  const h = (Math.sin(i*.55)*.0025 + Math.sin(i*.17)*.0017) * s;
  return [v,h];
}
