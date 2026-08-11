/* ============================================================================
   THE MAP — Kino der Toten, compressed.

   The real thing is a bombed-out German cinema: you start in the lobby, buy
   your way up the stairs, through the foyer and the dressing rooms, and into
   the theater, which is the big open room everyone actually plays. The power
   switch is off in a back room, the Pack-A-Punch is only reachable by the
   teleporter on the stage, and the Mystery Box moves.

   This is that map at about 60% scale with the dead ends removed, because a
   thumbstick is slower than a controller and a phone screen is small. What is
   kept is the shape that makes it good: one enormous room you can run circles
   in, a ring of smaller rooms around it so a train can be led anywhere, and a
   balcony that lets you look down on the floor you were just running.

   Everything is an axis-aligned box. That one decision pays three times: it
   makes collision a compare, hitscan a slab test, and shadows analytic.
   ========================================================================== */

/* box:  minima and maxima directly, because architecture is easier to think
   about as "this wall runs from here to here" than as centre plus size.  */
const boxes = [], bcol = [], bmat = [], deco = [], FLOORS = [];
const boxDoor = [], bhide = [];         // door id per box (-1 = level); collide-only

function box(x0,z0,x1,z1,y0,y1,M,door){
  boxes.push([Math.min(x0,x1),y0,Math.min(z0,z1),Math.max(x0,x1),y1,Math.max(z0,z1)]);
  bcol.push([M[0],M[1],M[2]]); bmat.push([M[3],M[4],M[5]||0]);
  boxDoor.push(door===undefined?-1:door); bhide.push(0);
  return boxes.length-1;
}
/* Drawn, reflected, lit — but not a collider, not a bullet stop, not a caster.
   Trim and light fittings live here so they cost nothing but triangles. */
function dbox(x0,z0,x1,z1,y0,y1,M){
  deco.push([[Math.min(x0,x1),y0,Math.min(z0,z1),Math.max(x0,x1),y1,Math.max(z0,z1)],M]);
}

/* Materials: [r,g,b, roughness, F0, emissive]. F0 .04 is a dielectric, .4+
   reads as metal. Emissive above 1 clamps to white on an 8-bit target, which
   is exactly how the eye reads "this is a light". */
const PLASTER = [.30,.285,.26, .86,.04];
const PLASTER2= [.24,.225,.21, .88,.04];
const MARBLE  = [.115,.115,.125,.16,.05];
const CARPET  = [.155,.055,.062,.95,.03];
const WOOD    = [.155,.105,.070,.72,.04];
const WOOD2   = [.105,.070,.048,.78,.04];
const BRICK   = [.185,.155,.140,.92,.04];
const ASPHALT = [.075,.078,.085,.30,.05];
const METAL   = [.34,.355,.385,.30,.55];
const IRON    = [.155,.16,.175,.44,.48];
const CURTAIN = [.235,.038,.055,.94,.03];
const GILT    = [.52,.40,.16, .28,.60];
const CONCRETE= [.20,.205,.21, .90,.04];
const SEAT    = [.115,.038,.048,.92,.03];
const PLANK   = [.26,.175,.105,.86,.04];   // boarded-up door
const SCREEN  = [.60,.60,.58, .70,.04];

/* Emissive fittings. Values above 1 blow out to white, so 1.6 and 4.0 look the
   same in the core and differ only in how far the glow bleeds via the lights. */
const L_WARM  = [1.0,.80,.50, .9,.04, 1.85];
const L_COLD  = [.62,.80,1.0, .9,.04, 1.55];
const L_EXIT  = [.25,1.0,.42, .9,.04, 1.70];
const L_FIRE  = [1.0,.46,.14, .9,.04, 2.10];

/* ---------- rooms ---------------------------------------------------------
   A room is a rectangle plus a floor height. Rooms gate zombie spawning and
   are what a door connects; the nav graph is built inside and between them. */
const ROOM = {};
function room(id,x0,z0,x1,z1,y,name){ ROOM[id]={id,x0,z0,x1,z1,y,name,open:false}; return ROOM[id]; }
room("lobby",  -11,-21,   5, -3, 0,   "Lobby");
room("under",  -11, -3,   5,  3, 0,   "Under the balcony");
room("upper",  -11, -3,   5,  3, 4.4, "Upper hall");
room("theater",-15,  3,   5, 25, 0,   "Theater");
room("stage",  -13, 19,  -1, 25, 1.3, "Stage");
room("foyer",    5, -7,  21, 11, 0,   "Foyer");
room("dress",    5, 11,  19, 25, 0,   "Dressing rooms");
room("alley",  -29,  3, -15, 27, 0,   "Alley");
room("power",  -29,-21, -11,  3, 0,   "Power room");
room("pap",     44, 44,  58, 56, 0,   "Projector room");
ROOM.lobby.open = true;               // you start with exactly one room
ROOM.under.open = false;

/* ---------- doors ---------------------------------------------------------
   A door is a price, a pair of rooms, and the boxes that vanish when you pay.
   Nav edges through it stay severed until then, so a train cannot walk through
   a door you have not bought — which is the entire reason doors are the
   difficulty curve in this mode. */
const DOORS = [
  {id:0, cost:750,  a:"lobby",  b:"upper",  x:3,    y:.6, z:-15.5, label:"STAIRWAY",      face:2},
  {id:1, cost:1000, a:"lobby",  b:"under",  x:-5,   y:.6, z:-3,    label:"THEATER DOORS", face:2},
  {id:2, cost:1000, a:"upper",  b:"foyer",  x:5,    y:5.0, z:1,    label:"FOYER",         face:0},
  {id:3, cost:1250, a:"foyer",  b:"dress",  x:11,   y:.6, z:11,    label:"DRESSING ROOMS",face:2},
  {id:4, cost:1250, a:"dress",  b:"theater",x:5,    y:.6,  z:22,   label:"STAGE DOOR",    face:0},
  {id:5, cost:1250, a:"theater",b:"alley",  x:-15,  y:.6, z:20,    label:"ALLEY",         face:0},
  {id:6, cost:1000, a:"alley",  b:"power",  x:-23,  y:.6, z:3,     label:"GENERATOR ROOM",face:2},
  {id:7, cost:1750, a:"power",  b:"lobby",  x:-11,  y:.6, z:-15,   label:"POWER ROOM",    face:0},
];
for(const d of DOORS){ d.open=false; d.boxes=[]; }
/* under -> theater is free: once you are through the theater doors the big
   room is yours. The corridor exists to make the entrance feel like one. */

/* ---------- level construction ------------------------------------------- */
/* Buried collision slab. Never drawn, so nothing exists below y=0 and the
   mirror pass needs no clip plane. Index 0 by convention. */
bhide[box(-40,-30, 70, 60, -1.2, 0, CONCRETE)] = 1;

const ROOF = [];   // boxes that are ceilings: culled from the shadow set last
function wallX(x,z0,z1,y0,y1,M,t,door){ return box(x-(t||.4)/2,z0,x+(t||.4)/2,z1,y0,y1,M,door); }
function wallZ(z,x0,x1,y0,y1,M,t,door){ return box(x0,z-(t||.4)/2,x1,z+(t||.4)/2,y0,y1,M,door); }
/* A floor at y=0 is a collider you never see the sides of, so it is not drawn
   as a box — it is drawn as a tessellated quad exactly on the plane. That
   keeps every rendered vertex at or above y=0, which is what lets the mirror
   pass work with no clip plane. Floors above 0 are ordinary boxes. */
function slab(x0,z0,x1,z1,y,t,M,refl){
  const i=box(x0,z0,x1,z1,y-(t||.3),y,M);
  if(y<.01){ bhide[i]=1; FLOORS.push({x0,z0,x1,z1,y,M,refl:refl?1:0}); }
  return i;
}
function ceil(x0,z0,x1,z1,y,M){ const i=box(x0,z0,x1,z1,y,y+.5,M||PLASTER2); ROOF.push(i); return i; }
/* A flight of stairs as a stack of steps. Steps, not ramps, because AABB
   collision resolves a step for free and a ramp needs a whole new case. */
function stairs(x0,z0,x1,z1,y0,y1,n,axis,M){
  for(let i=0;i<n;i++){
    const f=i/n, g=(i+1)/n, h=y0+(y1-y0)*g;
    if(axis===0) box(x0+(x1-x0)*f, z0, x0+(x1-x0)*g, z1, 0, h, M);
    else         box(x0, z0+(z1-z0)*f, x1, z0+(z1-z0)*g, 0, h, M);
  }
}

(function buildLobby(){
  const R=ROOM.lobby;
  slab(-11,-21,5,-3, 0, .3, MARBLE, 1);          // marble is the reflective floor
  /* Perimeter. The lobby is nine metres to a coffered ceiling with a shell
     hole punched through the middle — that hole is the only daylight in the
     building and it is what makes the marble worth reflecting. */
  wallZ(-21,-11.4,5.4, 0,9, PLASTER);
  wallX(-11,-21,-17.2, 0,9, PLASTER);          // west wall, gap = door 7
  wallX(-11,-12.8,-3, 0,9, PLASTER);
  wallX(-11,-3,3, 0,5, PLASTER);              // continues past the lobby, walling off the power room
  wallX(5,-21,-3, 0,9, PLASTER);               // solid: the staircase is inside it
  wallZ(-3,-11.4,-6.6, 0,4.4, PLASTER);        // north wall under the balcony
  wallZ(-3,-3.4,5.4, 0,4.4, PLASTER);          // gap x -6.6..-3.4 = door 1
  /* Coffered ceiling with a hole over the middle of the room. */
  ceil(-11,-21,5,-9.5, 9); ceil(-11,-3.5,5,-3, 9);
  ceil(-11,-9.5,-4.5,-3.5, 9); ceil(1,-9.5,5,-3.5, 9);
  dbox(-4.5,-9.5,1,-3.5, 8.9,9.1, [.05,.06,.08,.9,.04]);   // sky through the hole
  /* You can see the sky through the shell hole; nothing can leave through it.
     A screecher that climbs when it is blocked will otherwise find the hole,
     go through it, and spend the rest of the round on the roof. */
  bhide[box(-4.5,-9.5,1,-3.5, 9.4,9.9, PLASTER2)] = 1;

  /* Box office, the counter you spawn behind. */
  box(-10,-19.6,-4.6,-17.6, 0,1.15, WOOD);
  dbox(-10.1,-19.7,-4.5,-17.5, 1.15,1.28, GILT);
  box(-10,-19.6,-9.4,-17.6, 1.15,3.2, WOOD2);
  /* Grand staircase: east wall, climbing north to the balcony. */
  stairs(1,-15,5,-3.0, 0,4.4, 16, 1, MARBLE);   // 27 cm risers: a stair, not a ledge
  /* Bannister, waist high and following the flight, not a wall. */
  for(let i=0;i<16;i++){
    const z0=-15+12*i/16, z1=-15+12*(i+1)/16, h=4.4*(i+1)/16;
    box(.6,z0,1,z1, 0,h+1.02, WOOD2);
    dbox(.55,z0,1.05,z1, h+1.02,h+1.14, GILT);
  }
  /* Two columns, which double as the thing you break line of sight behind. */
  for(const cx of [-8.2,2.2]) for(const cz of [-16.5,-6.5]){
    if(cx>0&&cz<-10) continue;
    box(cx-.55,cz-.55,cx+.55,cz+.55, 0,9, PLASTER2);
    dbox(cx-.68,cz-.68,cx+.68,cz+.68, 3.9,4.06, GILT);
  }
  /* Lights: two chandeliers and the wall sconces. */
  for(const p of [[-6.5,-16.5],[-.5,-8.0]]){
    dbox(p[0]-1.15,p[1]-1.15,p[0]+1.15,p[1]+1.15, 6.5,6.72, L_WARM);
    dbox(p[0]-.08,p[1]-.08,p[0]+.08,p[1]+.08, 6.72,9, IRON);
  }
  dbox(-10.85,-13.5,-10.7,-11.5, 3.0,3.3, L_WARM);
  dbox(-10.85,-8.4,-10.7,-6.4, 3.0,3.3, L_WARM);
  dbox(-6.9,-3.25,-3.1,-3.1, 4.05,4.3, L_EXIT);     // exit sign over the doors
})();

(function buildUnderAndUpper(){
  /* The strip between the lobby and the theater: floor at 0, ceiling at 4.4,
     because the upper hall's floor is its ceiling. Walking under a balcony to
     get into the big room is most of why the big room feels big. */
  slab(-11,-3,5,3, 0,.3, MARBLE, 1);
  wallX(-11,-3,3, 0,4.4, PLASTER);
  wallX(5,-3,3, 0,4.4, PLASTER);
  /* upper floor doubles as the corridor ceiling */
  const f=box(-11,-3,5,3, 4.1,4.4, WOOD2); ROOF.push(f);
  wallZ(3,-15.4,-8.6, 0,4.4, PLASTER);       // theater side: a wide arch
  wallZ(3,-1.4,5.4, 0,4.4, PLASTER);
  dbox(-8.6,2.85,-1.4,3.15, 4.0,4.28, GILT);
  dbox(-3.2,-2.9,-1.2,-2.75, 3.4,3.7, L_WARM);

  /* Upper hall, 4.4 m up. Its north edge is an open balcony over the theater —
     the one place you can watch a train form from above. */
  wallZ(-3,-11.4,0.8, 4.4,9, PLASTER);        // gap x .8..5.4 is where the stairs arrive
  wallX(-11,-3,3, 4.4,9, PLASTER);
  wallX(5,-3,-.6, 4.4,9, PLASTER);           // gap z -.6..3.4 = door 2
  wallX(5,3.4,3, 4.4,9, PLASTER);
  box(-11,2.6,5,3, 4.4,5.35, IRON);          // balcony rail over the theater
  dbox(-11,2.55,5,3.05, 5.35,5.5, GILT);
  ceil(-11,-3,5,3, 9);
  dbox(-8,-2.85,-6,-2.7, 7.0,7.3, L_WARM);
  dbox(1,-2.85,3,-2.7, 7.0,7.3, L_WARM);
  dbox(-11,1.2,5,1.35, 8.2,8.5, L_COLD);
})();

(function buildTheater(){
  /* The reason the map is good. Twenty by twenty-two metres of floor with a
     ring of clear space around the seating, which is exactly the shape you
     need to gather a whole round into one train behind you. */
  slab(-15,3,5,25, 0,.3, CARPET);
  wallX(-15,3,17.8, 0,13, PLASTER);          // west wall, gap = door 5
  wallX(-15,22.2,25, 0,13, PLASTER);
  wallX(5,3,25, 0,13, PLASTER);
  wallZ(25,-15.4,-13.4, 0,13, PLASTER);      // north wall; the stage sits in it
  wallZ(25,-1,5.4, 0,13, PLASTER);
  wallZ(25,-13.4,-1, 0,13, PLASTER2);        // behind the screen. The curtains
                                             // start at y=1.3 and are not a wall.
  ceil(-15,3,5,25, 13);
  /* Seating: eight rows of low benches you can shoot over and vault around,
     split by a centre aisle so the room reads as a theater and not a field. */
  for(let r=0;r<7;r++){
    const z=6.4+r*1.55, y=.30+r*.16;
    box(-12.4,z,-7.8,z+.62, 0,y+.52, SEAT);
    box(-2.6,z,2.0,z+.62, 0,y+.52, SEAT);
    dbox(-12.4,z-.02,-7.8,z+.64, y+.52,y+.60, WOOD2);
    dbox(-2.6,z-.02,2.0,z+.64, y+.62-.02,y+.60, WOOD2);
  }
  /* Proscenium arch and the stage. */
  box(-13.4,18.7,-12.6,19.5, 0,13, PLASTER2);
  box(-1.8,18.7,-1,19.5, 0,13, PLASTER2);
  dbox(-13.6,18.6,-.8,19.6, 9.4,10.0, GILT);
  /* Steps up to the deck, one flight each side of centre. Without them the
     stage is a 1.3 m ledge and nothing — you included — can get onto it. */
  stairs(-11.2,17.2,-8.8,19.0, 0,1.30, 5, 1, WOOD);
  stairs(-5.2,17.2,-2.8,19.0, 0,1.30, 5, 1, WOOD);
  slab(-13,19,-1,25, 1.3,1.3, WOOD);         // the stage deck
  box(-13,18.8,-1,19.0, 0,1.3, WOOD2);       // stage front
  dbox(-13,18.72,-1,18.98, 1.18,1.32, GILT);
  /* Curtains, half open, hiding the back of the stage. */
  box(-13,24.4,-9.6,25, 1.3,11.5, CURTAIN);
  box(-4.4,24.4,-1,25, 1.3,11.5, CURTAIN);
  dbox(-9.6,24.5,-4.4,24.9, 9.8,11.5, CURTAIN);
  dbox(-9.5,24.45,-4.5,24.6, 1.3,9.8, SCREEN);   // the cinema screen behind
  /* Footlights along the stage lip and two follow spots in the ceiling. */
  for(let i=0;i<7;i++) dbox(-12.4+i*1.7,18.66,-11.6+i*1.7,18.8, 1.06,1.2, L_WARM);
  dbox(-9.5,10,-8.9,10.6, 12.2,12.6, L_COLD);
  dbox(-1.9,10,-1.3,10.6, 12.2,12.6, L_COLD);
  /* The chandelier. Big, low enough to light the floor, high enough to run
     under, and it is what the marble in the lobby never gets to reflect. */
  dbox(-6.4,11.6,-3.2,14.8, 8.4,8.75, L_WARM);
  dbox(-5.0,13.0,-4.6,13.4, 8.75,13, IRON);
  dbox(-6.9,11.1,-2.7,15.3, 8.75,9.0, GILT);
  /* Under-balcony strip lights so the south end is not a black hole. */
  dbox(-14.85,7,-14.7,9, 3.4,3.7, L_WARM);
  dbox(-14.85,15,-14.7,17, 3.4,3.7, L_WARM);
  dbox(4.7,7,4.85,9, 3.4,3.7, L_WARM);
  dbox(4.7,15,4.85,17, 3.4,3.7, L_WARM);
  dbox(-15.2,17.7,-14.8,17.85, 2.5,2.8, L_EXIT);
})();

(function buildFoyer(){
  slab(5,-7,21,11, 0,.3, MARBLE, 1);
  wallZ(-7,4.6,21.4, 0,6.5, PLASTER);
  wallX(21,-7,11, 0,6.5, PLASTER);
  wallZ(11,4.6,8.6, 0,6.5, PLASTER);          // gap x 8.6..13.4 = door 3
  wallZ(11,13.4,21.4, 0,6.5, PLASTER);
  wallX(5,-7,-1.4, 0,6.5, PLASTER);           // gap z -1.4..3.4 = the stair
  /* x=5 north of z=3 belongs to the theater wall; drawing it twice here
     put two coplanar faces in the same place and they fought. */
  ceil(5,-7,21,11, 6.5);
  /* Stair down from the upper hall. Descends east, so the door at the top
     opens onto a landing rather than straight onto a drop. */
  stairs(13.2,-1.2,5.2,3.2, 0,4.4, 15, 0, MARBLE);   // high at x=5, down to the foyer floor
  box(5.2,-1.4,14.2,-1.2, 0,4.9, PLASTER2);
  box(5.2,3.2,14.2,3.4, 0,4.9, PLASTER2);
  /* Ticket desk and a couple of pillars for cover. */
  box(16.4,-5.4,20.4,-3.6, 0,1.1, WOOD);
  dbox(16.3,-5.5,20.5,-3.5, 1.1,1.22, GILT);
  for(const p of [[8.6,7.4],[17.6,7.4]]){
    box(p[0]-.5,p[1]-.5,p[0]+.5,p[1]+.5, 0,6.5, PLASTER2);
    dbox(p[0]-.62,p[1]-.62,p[0]+.62,p[1]+.62, 3.4,3.56, GILT);
  }
  dbox(9.4,5.6,12.6,8.8, 5.9,6.1, L_WARM);
  dbox(20.7,-2,20.85,0, 3.2,3.5, L_WARM);
  dbox(5.15,7,5.3,9, 3.2,3.5, L_WARM);
  dbox(8.7,10.75,12.3,10.9, 4.05,4.3, L_EXIT);
})();

(function buildDressing(){
  slab(5,11,19,25, 0,.3, WOOD);
  wallZ(25,4.6,19.4, 0,5, PLASTER2);
  wallX(19,11,25, 0,5, PLASTER2);
  wallX(5,11,19.6, 0,5, PLASTER2);            // gap z 19.6..24.4 = door 4
  wallX(5,24.4,25, 0,5, PLASTER2);
  ceil(5,11,19,25, 5);
  /* Two rows of dressing tables with bulb-lit mirrors — the warmest, tightest
     room on the map, and the one you least want to get caught in. */
  for(let i=0;i<3;i++){
    const z=13.4+i*3.6;
    box(17.2,z,18.8,z+2.2, 0,.95, WOOD2);
    dbox(18.82,z,18.94,z+2.2, .95,2.65, [.55,.56,.60,.10,.55]);   // mirror glass
    for(let k=0;k<4;k++) dbox(18.7,z+.2+k*.6,18.84,z+.36+k*.6, 2.66,2.8, L_WARM);
  }
  box(5.6,12.2,7.4,13.6, 0,1.9, WOOD2);       // wardrobe
  box(5.6,20.6,7.0,23.4, 0,2.1, WOOD2);
  box(11.4,17.4,13.0,19.0, 0,.9, WOOD);       // trunk in the middle of the floor
  dbox(11.3,17.3,13.1,19.1, .9,1.0, IRON);
  dbox(9.6,15.4,12.4,18.2, 4.7,4.86, L_WARM);
  dbox(5.15,22,5.3,24, 3.0,3.3, L_WARM);
})();

(function buildAlley(){
  /* Outdoors. No ceiling, so this is the only place the sky is overhead, and
     the palette flips from warm tungsten to cold blue. */
  slab(-29,3,-15,27, 0,.3, ASPHALT);
  wallX(-29,3,27, 0,11, BRICK);
  wallX(-15,25,27, 0,13, BRICK);             // theater already owns x=-15 up to z=25
  wallZ(27,-29.4,-14.6, 0,11, BRICK);
  wallZ(3,-29.4,-25.4, 0,11, BRICK);          // gap x -25.4..-20.6 = door 6
  wallZ(3,-20.6,-14.6, 0,11, BRICK);
  /* Fire-escape stack and some dumpsters: cover, and the only vertical thing
     out here for a flyer to come over. */
  box(-28.6,8,-25.4,8.4, 3.2,3.5, IRON);
  box(-28.6,8,-28.2,14, 0,3.5, IRON);
  box(-28.6,13.6,-25.4,14, 3.2,3.5, IRON);
  box(-27.4,17.4,-24.6,20.2, 0,1.5, IRON);
  box(-22.6,22.6,-19.4,25.0, 0,1.4, IRON);
  box(-21.4,6.6,-18.6,8.6, 0,1.25, WOOD2);
  /* A burning barrel and two wall lamps. */
  box(-19.2,13.4,-18.0,14.6, 0,1.0, IRON);
  dbox(-19.15,13.45,-18.05,14.55, 1.0,1.35, L_FIRE);
  dbox(-28.75,10.6,-28.6,12.6, 4.6,4.9, L_COLD);
  dbox(-15.3,20.6,-15.15,22.6, 4.6,4.9, L_COLD);
  dbox(-24.9,3.15,-21.1,3.3, 3.3,3.55, L_EXIT);
})();

(function buildPower(){
  slab(-29,-21,-11,3, 0,.3, CONCRETE);
  wallZ(-21,-29.4,-10.6, 0,5, BRICK);
  wallX(-29,-21,3, 0,5, BRICK);
  wallX(-11,-21,-17.4, 0,5, BRICK);           // gap z -17.4..-12.6 = door 7
  wallZ(3,-15.4,-10.6, 0,5, BRICK);          // backs onto the theater
  ceil(-29,-21,-11,3, 5);
  /* Generator hall: transformers, pipework, and the switch itself on the far
     wall so you have to walk the length of the room in the dark to reach it. */
  for(let i=0;i<3;i++){
    const z=-18+i*5.2;
    box(-28.4,z,-25.4,z+2.6, 0,2.3, IRON);
    dbox(-28.5,z-.1,-25.3,z+2.7, 2.3,2.45, METAL);
    dbox(-25.35,z+.6,-25.2,z+2.0, .8,1.0, L_COLD);
  }
  box(-22.6,-20.6,-21.4,3, 4.1,4.5, IRON);    // conduit run along the ceiling
  box(-17.4,-8.4,-14.6,-5.6, 0,1.7, IRON);
  box(-13.8,-2.6,-11.4,-1.0, 0,2.4, IRON);
  dbox(-28.9,-11.4,-28.75,-9.4, 3.4,3.7, L_COLD);
  dbox(-20,2.7,-16,2.85, 4.2,4.5, L_COLD);
})();

(function buildPaP(){
  /* The projector room. Off in its own corner of the world, reachable only by
     the teleporter, and lit by the machine and the projector beam. */
  slab(44,44,58,56, 0,.3, WOOD2);
  wallZ(44,43.6,58.4, 0,5.5, PLASTER2);
  wallZ(56,43.6,58.4, 0,5.5, PLASTER2);
  wallX(44,44,56, 0,5.5, PLASTER2);
  wallX(58,44,56, 0,5.5, PLASTER2);
  ceil(44,44,58,56, 5.5);
  box(45.2,45.2,47.6,48.4, 0,1.5, IRON);      // the projectors themselves
  box(45.2,51.6,47.6,54.8, 0,1.5, IRON);
  dbox(47.6,46.2,47.9,47.4, .8,1.2, L_WARM);
  dbox(47.6,52.6,47.9,53.8, .8,1.2, L_WARM);
  dbox(47.9,46.5,57.9,47.1, .95,1.05, [1,.92,.72,.9,.04,1.4]);   // beams
  dbox(47.9,52.9,57.9,53.5, .95,1.05, [1,.92,.72,.9,.04,1.4]);
  box(52.4,49.0,55.6,51.6, 0,2.0, IRON);      // the machine
  dbox(52.3,48.9,55.7,51.7, 2.0,2.16, GILT);
  dbox(52.5,48.85,55.5,49.0, .5,1.7, [.30,.72,1.0,.9,.04,1.9]);
  dbox(44.15,49,44.3,51, 3.4,3.7, L_COLD);
})();

/* ---------- doors as geometry --------------------------------------------
   Each door is a slab of boarded planks that fills its opening. Buying it
   deletes the boxes and reconnects the nav graph. */
function makeDoor(d){
  const R=ROOM[d.b], A=ROOM[d.a];
  const y0 = d.y-.6, y1 = d.y-.6+4.4;
  if(d.face===0){ /* opening in a wall of constant x */
    d.boxes.push(box(d.x-.28,d.z-2.4,d.x+.28,d.z+2.4, y0,y1, PLANK, d.id));
  } else {        /* opening in a wall of constant z */
    d.boxes.push(box(d.x-2.4,d.z-.28,d.x+2.4,d.z+.28, y0,y1, PLANK, d.id));
  }
  d.mid=[d.x, y0, d.z];
}
for(const d of DOORS) makeDoor(d);

/* Door 0 is a rubble pile at the foot of the stairs, not a door: same effect,
   and it explains why a staircase in a lobby costs money. */

/* ---------- ramps ---------------------------------------------------------
   Anywhere the floor height changes along a run. The nav grid samples a room
   at its own floor height, which is right for a room and useless for a
   staircase, so these get walked instead. */
const RAMPS = [
  /* the grand staircase, lobby up to the balcony */
  {room:"lobby", x0:3, z0:-15.6, x1:3, z1:-3.1, nx:1.2, nz:0, sides:[-1,1], top:5.2, step:.85},
  /* the flight down from the upper hall into the foyer */
  {room:"foyer", x0:5.6, z0:1, x1:14.2, z1:1, nx:0, nz:1.1, sides:[-1,1], top:5.2, step:.75},
  /* the two flights onto the stage. Short, steep, and sampled finely, because
     a 32 cm riser every 45 cm is right at the limit of what one edge can span. */
  {room:"theater", x0:-10, z0:16.9, x1:-10, z1:19.6, nx:1.0, nz:0, sides:[-1,1], top:1.9, step:.5},
  {room:"theater", x0:-4, z0:16.9, x1:-4, z1:19.6, nx:1.0, nz:0, sides:[-1,1], top:1.9, step:.5},
];

/* ---------- barricades ----------------------------------------------------
   Where they come from. Each is a boarded window with a spawn point just
   outside it, so a round arrives through the walls of whatever rooms you have
   opened rather than materialising in front of you. */
const BARRIERS = [
  {room:"lobby",  x:-11, z:-15.8, dir:[1,0],  y:0},
  {room:"lobby",  x:-11, z:-7.4,  dir:[1,0],  y:0},
  {room:"lobby",  x:-3,  z:-21,   dir:[0,1],  y:0},
  {room:"lobby",  x:5,   z:-18.0, dir:[-1,0], y:0},
  {room:"theater",x:-15, z:6.4,   dir:[1,0],  y:0},
  {room:"theater",x:-15, z:13.2,  dir:[1,0],  y:0},
  {room:"theater",x:5,   z:9.0,   dir:[-1,0], y:0},
  {room:"theater",x:5,   z:16.4,  dir:[-1,0], y:0},
  {room:"theater",x:-8.6,z:3,     dir:[0,1],  y:0},
  {room:"foyer",  x:21,  z:-3.4,  dir:[-1,0], y:0},
  {room:"foyer",  x:21,  z:6.6,   dir:[-1,0], y:0},
  {room:"foyer",  x:13,  z:-7,    dir:[0,1],  y:0},
  {room:"dress",  x:19,  z:14.6,  dir:[-1,0], y:0},
  {room:"dress",  x:12,  z:25,    dir:[0,-1], y:0},
  {room:"alley",  x:-29, z:11.4,  dir:[1,0],  y:0},
  {room:"alley",  x:-29, z:21.6,  dir:[1,0],  y:0},
  {room:"alley",  x:-22, z:27,    dir:[0,-1], y:0},
  {room:"power",  x:-29, z:0.5,   dir:[1,0],  y:0},
  {room:"power",  x:-20, z:-21,   dir:[0,1],  y:0},
  {room:"upper",  x:-11, z:0,     dir:[1,0],  y:4.4},
  {room:"upper",  x:5,   z:-1.6,  dir:[-1,0], y:4.4},
];
for(const b of BARRIERS){
  b.boards = 6; b.max = 6; b.t = 0;
  /* The spawn sits a metre and a half outside the wall, so a zombie is
     visibly climbing in rather than appearing. */
  b.sx = b.x - b.dir[0]*1.6; b.sz = b.z - b.dir[1]*1.6;
  b.ix = b.x + b.dir[0]*1.5; b.iz = b.z + b.dir[1]*1.5;   // inside step-off
}

/* ---------- interactables ------------------------------------------------
   Everything you can spend points on, in one list, because the prompt on
   screen is just "the nearest of these you can afford". */
const USABLES = [];
function usable(o){ o.id=USABLES.length; USABLES.push(o); return o; }

/* perk machines */
function perkMachine(key,x,z,y,yaw,r){
  const P=PERKS[key];
  const c=[P.col[0]*.30,P.col[1]*.30,P.col[2]*.30,.55,.06];
  const w=.62, d=.52;
  box(x-w,z-d,x+w,z+d, y,y+2.15, c);
  dbox(x-w*.82,z-d-.06,x+w*.82,z-d+.02, y+.75,y+1.75, [P.col[0],P.col[1],P.col[2],.9,.04,1.75]);
  dbox(x-w-.05,z-d-.05,x+w+.05,z+d+.05, y+2.15,y+2.3, [P.col[0]*.6,P.col[1]*.6,P.col[2]*.6,.5,.5,1.2]);
  return usable({t:"perk",key,x,y,z,room:r,cost:P.cost,name:P.n,sub:P.why,rad:2.1,power:1});
}
perkMachine("revive", -10.1,-5.2, 0, 0, "lobby");
perkMachine("dtap",   -10.1, 1.0, 4.4, 0, "upper");
perkMachine("jug",    -14.1, 15.6, 0, 0, "theater");
perkMachine("speed",   5.85, 15.0, 0, 0, "dress");
perkMachine("stam",  -27.2, 25.9, 0, 0, "alley");
perkMachine("mule",  -12.4, -19.9, 0, 0, "power");

/* wall weapons: a chalk outline of the gun on the plaster, exactly as in the
   game, so you learn where they are by silhouette and not by reading. */
function wallGun(key,x,z,y,r,face){
  const W=WEAPONS[key];
  const c=[.72,.70,.64, .95,.04, .35];
  if(face===0) dbox(x-.06,z-.62,x+.06,z+.62, y+1.15,y+1.42, c);
  else         dbox(x-.62,z-.06,x+.62,z+.06, y+1.15,y+1.42, c);
  return usable({t:"wall",key,x,y,z,room:r,cost:W.wall,name:W.n,rad:2.0});
}
wallGun("m14",      4.55,-16.6, 0, "lobby", 0);   // south of the staircase, or it is inside it
wallGun("olympia", -10.55,-10.4,0, "lobby", 0);
wallGun("mp40",     -4.0, -2.75, 4.4,"upper",1);   // far side of the hall from Double Tap
wallGun("m16",     -28.55,-4.0, 0, "power", 0);
wallGun("stakeout", 20.55, 2.0, 0, "foyer", 0);
usable({t:"nades", x:1.6,y:0,z:-20.55, room:"lobby", cost:250, name:"FRAG x4", rad:2.0});
dbox(.9,-20.62,2.3,-20.5, 1.15,1.5, [.72,.70,.64,.95,.04,.35]);

/* the power switch */
usable({t:"power", x:-11.6,y:0,z:2.2, room:"power", cost:0, name:"MAIN POWER", rad:2.4});
box(-12.0,1.7,-11.4,2.7, .9,2.3, IRON);
dbox(-11.42,1.9,-11.3,2.5, 1.3,1.8, [1,.22,.16,.9,.04,1.6]);
dbox(-12.6,1.4,-12.2,2.2, 3.0,3.24, [1,.22,.16,.9,.04,1.9]);   // emergency lamp

/* the mainframe in the lobby and the teleporter pad on the stage */
usable({t:"mainframe", x:-9.6,y:0,z:-15.6, room:"lobby", cost:0, name:"MAINFRAME", rad:2.4});
box(-10.4,-16.6,-8.8,-14.6, 0,1.9, IRON);
dbox(-10.45,-16.65,-8.75,-14.55, 1.9,2.05, METAL);
dbox(-8.78,-16.2,-8.66,-15.0, .8,1.5, [.30,.72,1.0,.9,.04,1.5]);

usable({t:"teleporter", x:-7,y:1.3,z:22.4, room:"stage", cost:0, name:"TELEPORTER", rad:2.6});
dbox(-9,20.4,-5,24.4, 1.3,1.38, [.14,.30,.40,.35,.35, .30]);
for(const s of [[-9,20.4,-8.7,24.4],[-5.3,20.4,-5,24.4],[-9,20.4,-5,20.7],[-9,24.1,-5,24.4]])
  dbox(s[0],s[1],s[2],s[3], 1.38,1.5, [.30,.72,1.0,.9,.04,1.4]);

usable({t:"pap", x:54,y:0,z:50.3, room:"pap", cost:T.costPaP, name:"PACK-A-PUNCH", rad:2.8});

/* the stage turret, straight off Kino's podium */
usable({t:"turret", x:-11.4,y:1.3,z:21.6, room:"stage", cost:T.costTurret, name:"TURRET", rad:2.2});
box(-11.9,21.1,-10.9,22.1, 1.3,2.25, IRON);
dbox(-11.95,21.05,-10.85,22.15, 2.25,2.4, METAL);

/* electric traps: two doorways you can electrify for thirty seconds */
function trapAt(x,z,y,r,x0,z0,x1,z1){
  const u=usable({t:"trap",x,y,z,room:r,cost:T.costTrap,name:"ELECTRIC TRAP",rad:2.2,
                  vol:[x0,y,z0,x1,y+3.2,z1], on:0, cd:0});
  box(x-.3,z-.3,x+.3,z+.3, y+.6,y+1.6, IRON);
  return u;
}
trapAt(-5.2,3.6, 0, "theater", -8.8,2.8,-1.2,4.4);
trapAt(-16.0,20.4,0, "alley",  -17.6,17.6,-13.4,22.4);

/* mystery box spots. The box lives at one at a time and the bear moves it. */
const BOX_SPOTS = [
  {x:-2.4, y:0,   z:-17.4, room:"lobby"},
  {x:-9.4, y:0,   z:9.4,   room:"theater"},
  {x:-6.6, y:1.3, z:23.2,  room:"stage"},
  {x:16.6, y:0,   z:-4.6,  room:"foyer"},
  {x:9.4,  y:0,   z:21.6,  room:"dress"},
  {x:-24.6,y:0,   z:15.4,  room:"alley"},
  {x:-25.6,y:0,   z:-3.0,  room:"power"},
];
const mbox = usable({t:"box", x:0,y:0,z:0, room:"lobby", cost:T.costBox, name:"MYSTERY BOX", rad:2.4,
                     spot:0, uses:0, open:0, rolling:0, prize:null, moving:0});
function placeBox(i){ const s=BOX_SPOTS[i]; mbox.spot=i; mbox.x=s.x; mbox.y=s.y; mbox.z=s.z; mbox.room=s.room; }
placeBox(0);

/* ---------- spawn + camera path ------------------------------------------ */
const START = [-6.4, 0, -12.6];
/* The attract camera flies this loop before you tap, which is also a decent
   description of the map: lobby, up the stairs, over the seats, the stage,
   the alley, back. */
const CAM_PATH = [
  {p:[-6.0, 2.2,-18.0], l:[-4.0, 1.4,-6.0]},
  {p:[ 2.0, 5.6,-10.0], l:[-8.0, 1.2,-14.0]},
  {p:[-3.0, 6.4,  1.0], l:[-6.0, 2.0, 16.0]},
  {p:[-6.0, 3.0, 12.0], l:[-7.0, 3.0, 24.0]},
  {p:[-7.0, 6.0, 22.0], l:[-6.0, 1.0,  6.0]},
  {p:[-22.0,3.4, 20.0], l:[-24.0,1.2,  8.0]},
  {p:[-20.0,2.4, -8.0], l:[-14.0,1.6,-18.0]},
  {p:[ 12.0,2.6,  4.0], l:[ 8.0, 1.4, 16.0]},
];
