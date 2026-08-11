/* ============================================================================
   KINO DER TOTEN — a wave-defense zombies shooter for mobile web.

   One HTML file, no dependencies, no assets, no external requests. Hand-rolled
   WebGL1, procedural geometry, procedural audio. The simulation is a fixed
   60 Hz step so frame rate never changes what happens.

   The renderer descends from an arena FPS lit by a single sun. This map is an
   interior, so the sun is gone: rooms are lit by point lights, and the one
   nearest light casts real shadows by ray-marching the level's own collision
   boxes. See 30-gl.js for why that costs about what a directional light did.
   ========================================================================== */

/* ---------- gameplay tuning ---------------------------------------------- */
const T = {
  /* player capsule + movement. Zombies moves faster than an arena shooter
     because the only defence is distance. */
  eye: 1.58, height: 1.78, radius: .36,
  speed: 5.0, sprint: 7.4, accel: 62, friction: 12, airAccel: 9,
  gravity: 23, jump: 6.4,
  hp: 100, regen: 12, regenDelay: 2.4,       // Zombies regenerates; there is no medkit
  jugMul: 2.5,                                // Juggernog: 2 hits -> 5

  /* the economy, straight from Black Ops */
  ptHit: 10, ptBody: 60, ptHead: 100, ptKnife: 130, ptRepair: 10,
  startPts: 500,

  /* round pacing. Health is the published curve: 150 at round 1, +100 a round
     through 9, then x1.15 a round. Treyarch uses 1.1; the extra 5% keeps a
     one-player game from stalling out around round 30 with no co-op damage. */
  hp0: 150, hpStep: 100, hpMul: 1.15,
  spawnGap0: 2.2, spawnGapMin: .34,           // seconds between spawns, by round
  maxAlive: 26,                               // hard cap so a phone never chokes
  roundBreak: 4.0,

  /* melee + grenades */
  knifeDmg: 300, knifeRange: 2.6, knifeCd: .62,
  nadeDmg: 480, nadeR: 5.2, nadeFuse: 2.4, nadeMax: 4,

  /* prices */
  costBox: 950, costPaP: 5000, costTurret: 1500, costTrap: 1000,
  boxMoves: 8,                                // uses before the teddy bear shows
  papTime: 32,                                // seconds in the projector room
  teleLink: 12,                               // mainframe link window
  teleCd: 60,

  /* power-ups */
  dropChance: .022, dropLife: 22, dropDur: 30,
};

/* ---------- user settings (in memory only) -------------------------------- */
const S = {
  sens: 27, msens: 55, assist: 15, fov: 84,
  res: 0,                 // 0 = auto (frame-time driven), else a fixed scale
  mirror: 0, gfx: 2, refl: 1, shad: 1, fire: "auto", autorun: 1,
};

/* ---------- weapons -------------------------------------------------------
   Every gun is a row of numbers plus a shape recipe. The viewmodel is built
   from the recipe at load, so twelve distinct-looking weapons cost twelve
   lines instead of twelve meshes.
     dmg      body damage at any range (Zombies weapons do not fall off)
     rpm      rounds/min. 0 for a manual action.
     mag/res  magazine and reserve
     hs       headshot multiplier
     pellets  >1 makes it a shotgun, spread in degrees
     reload   seconds
     kind     shape recipe id
     pap      Pack-A-Punch name                                              */
const WEAPONS = {
  m1911:   {n:"M1911",       dmg:40,  rpm:400, mag:8,  res:32,  hs:2.0, reload:1.5, kind:"pistol", pap:"MUSTANG & SALLY", wall:0},
  m14:     {n:"M14",         dmg:100, rpm:400, mag:8,  res:120, hs:2.5, reload:2.1, kind:"rifle",  pap:"MNESIA", wall:500, ammo:250},
  olympia: {n:"OLYMPIA",     dmg:110, rpm:180, mag:2,  res:60,  hs:1.6, reload:2.4, kind:"shotgun",pellets:8, spread:5.5, pap:"HADES", wall:500, ammo:250},
  mp40:    {n:"MP40",        dmg:70,  rpm:900, mag:32, res:192, hs:2.0, reload:2.0, kind:"smg",    pap:"THE AFTERBURNER", wall:1000, ammo:500},
  stakeout:{n:"STAKEOUT",    dmg:100, rpm:220, mag:6,  res:72,  hs:1.5, reload:3.0, kind:"shotgun",pellets:8, spread:6.5, pap:"RAID", wall:1200, ammo:600},
  m16:     {n:"M16",         dmg:110, rpm:750, mag:30, res:180, hs:2.5, reload:2.3, kind:"rifle",  burst:3, pap:"SKULLCRUSHER", wall:1200, ammo:600},
  ak74u:   {n:"AK74u",       dmg:85,  rpm:790, mag:30, res:210, hs:2.2, reload:2.2, kind:"smg",    pap:"AK74fu2"},
  commando:{n:"COMMANDO",    dmg:110, rpm:750, mag:30, res:240, hs:2.4, reload:2.6, kind:"rifle",  pap:"PREDATOR"},
  rpk:     {n:"RPK",         dmg:125, rpm:700, mag:75, res:300, hs:2.3, reload:4.0, kind:"lmg",    pap:"R115 RESONATOR"},
  hs10:    {n:"HS10",        dmg:120, rpm:270, mag:6,  res:72,  hs:1.5, reload:3.2, kind:"shotgun",pellets:9, spread:5.0, pap:"TYPHOID & MARY"},
  raygun:  {n:"RAY GUN",     dmg:1000,rpm:280, mag:20, res:160, hs:1.0, reload:2.4, kind:"ray",    splash:2.9, splashDmg:450, self:60, pap:"PORTER'S X2 RAY GUN"},
  thunder: {n:"THUNDERGUN",  dmg:6000,rpm:60,  mag:2,  res:12,  hs:1.0, reload:3.0, kind:"thunder",cone:34, range:16, pap:"ZEUS CANNON"},
};
/* What the Mystery Box can hand you, and how often. The wonder weapons are
   rare on purpose: pulling a Thundergun should be the story of the run. */
const BOX_POOL = [
  ["m14",7],["olympia",6],["mp40",9],["stakeout",7],["m16",8],
  ["ak74u",10],["commando",9],["rpk",8],["hs10",8],["m1911",3],
  ["raygun",2],["thunder",1.4],
];

/* ---------- perks ---------------------------------------------------------
   Colour is the machine's emissive tint and the HUD chip, exactly as in the
   game: you learn the map by the colour of the light in each room. */
const PERKS = {
  jug:   {n:"JUGGERNOG",  s:"J", cost:2500, col:[1.0,.18,.20], why:"take five hits, not two"},
  speed: {n:"SPEED COLA", s:"S", cost:3000, col:[.30,1.0,.36], why:"reload twice as fast"},
  dtap:  {n:"DOUBLE TAP", s:"D", cost:2000, col:[1.0,.72,.16], why:"fire rate and damage up"},
  revive:{n:"QUICK REVIVE",s:"Q",cost:500,  col:[.35,.72,1.0], why:"get back up once"},
  stam:  {n:"STAMIN-UP",  s:"U", cost:2000, col:[1.0,.45,.85], why:"move faster, forever"},
  mule:  {n:"MULE KICK",  s:"M", cost:4000, col:[.65,.42,1.0], why:"carry a third weapon"},
};

/* ---------- enemies -------------------------------------------------------
   Seven kinds, and the differences are all in how they close distance:
   walk, run, crawl, sprint on four legs, fly, or stop and shoot.            */
const KIND = {
  walker:  {hp:1.00, spd:1.55, dmg:22, reach:1.5, r:.42, h:1.85, pts:1,   col:[.34,.40,.30], eye:[.75,.16,.12]},
  runner:  {hp:1.00, spd:3.05, dmg:22, reach:1.5, r:.40, h:1.80, pts:1,   col:[.42,.33,.26], eye:[1.0,.22,.10]},
  crawler: {hp:.55,  spd:2.55, dmg:14, reach:1.4, r:.44, h:.78,  pts:1.2, col:[.30,.44,.24], eye:[.55,1.0,.20], gas:1},
  hound:   {hp:.72,  spd:4.35, dmg:26, reach:1.6, r:.40, h:.98,  pts:1.5, col:[.16,.14,.15], eye:[1.0,.42,.06], fire:1},
  flyer:   {hp:.48,  spd:3.30, dmg:16, reach:1.7, r:.42, h:.85,  pts:1.6, col:[.30,.26,.38], eye:[.55,.85,1.0], fly:1},
  spitter: {hp:.90,  spd:1.35, dmg:20, reach:22,  r:.44, h:1.80, pts:1.8, col:[.22,.40,.34], eye:[.60,1.0,.35], ranged:1},
  panzer:  {hp:11.0, spd:1.85, dmg:34, reach:20,  r:.72, h:2.25, pts:6,   col:[.30,.31,.34], eye:[1.0,.55,.10], ranged:1, boss:1, armor:1},
};
