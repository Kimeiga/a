/* Boot, link, and prove the level is actually navigable. This is the test that
   catches the class of bug you cannot see: a uniform that silently failed to
   resolve, a room with no waypoints in it, a door nothing connects through. */
import { boot } from "./dom.mjs";

const { K, GL } = boot({});
let fails = 0;
const ok = (name, cond, extra = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "  ok  " : "FAIL  "}${name}${extra ? "  " + extra : ""}`);
};

console.log("\n— shader + uniforms —");
ok("program links", GL.getProgramParameter(K.prog, GL.LINK_STATUS));
const bootErr = GL.getError();   // read once: getError CLEARS the flag
ok("no GL error at boot", bootErr === 0, "err=0x" + bootErr.toString(16));
for (const u of ["mvp", "vm", "model", "key", "keyCol", "lp", "lc", "nLit", "bmin", "bmax", "nBox", "shOn"])
  ok(`uniform ${u} resolves`, K.U[u] != null);
ok("shadow budget usable", K.shadowOK, `NB=${K.NB}`);

console.log("\n— level —");
ok("boxes built", K.boxes.length > 150, K.boxes.length + " boxes");
ok("all rendered geometry is at or above y=0",
   K.boxes.every((b, i) => b[1] >= -0.001 || i === 0 || b[4] <= 0.001),
   "(mirror pass needs no clip plane)");
ok("nav graph built", K.NAV.n > 200, K.NAV.n + " nodes");
const perRoom = {};
for (const r of K.NAV.room) perRoom[r] = (perRoom[r] || 0) + 1;
for (const id in K.ROOM) ok(`room "${id}" has waypoints`, (perRoom[id] || 0) >= 4, (perRoom[id] || 0) + "");

console.log("\n— reachability —");
/* Open every door, then flow from the spawn and confirm every room is
   reachable. A room with no route is a room zombies never arrive in. */
for (const d of K.DOORS) d.open = true;
K.navFlow(K.me.p[0], K.me.p[1], K.me.p[2]);
const reached = {};
for (let i = 0; i < K.NAV.n; i++) if (K.NAV.dist[i] < 1e8) reached[K.NAV.room[i]] = (reached[K.NAV.room[i]] || 0) + 1;
for (const id in K.ROOM) {
  if (id === "pap") continue;   // teleporter only, by design
  ok(`"${id}" reachable on foot`, (reached[id] || 0) >= 3, (reached[id] || 0) + "/" + (perRoom[id] || 0));
}
/* And with doors shut, only the lobby should be. */
for (const d of K.DOORS) d.open = false;
K.navFlow(K.me.p[0], K.me.p[1], K.me.p[2]);
let outside = 0;
for (let i = 0; i < K.NAV.n; i++)
  if (K.NAV.dist[i] < 1e8 && K.NAV.room[i] !== "lobby") outside++;
ok("doors actually seal the lobby", outside === 0, outside + " nodes leak");

console.log("\n— is the building sealed? —");
/* Probing the geometry is guesswork; walking into it is not. Drop a body on a
   sample of waypoints, shove it outward at sprint speed for two seconds using
   the same step() the game uses, and see whether it is still in the building.
   The first version of this test probed 75 cm outside each room edge, which is
   past a 40 cm wall, so it reported every room as full of holes. */
{
  const escaped = new Map();
  for (let i = 0; i < K.NAV.n; i += 3) {
    const rid = K.NAV.room[i], R = K.ROOM[rid];
    const cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2;
    for (let a = 0; a < 8; a++) {
      const ang = a / 8 * Math.PI * 2;
      const e = { p: [K.NAV.x[i], K.NAV.y[i] + 0.05, K.NAV.z[i]], v: [0, 0, 0],
                  rad: K.T.radius, hgt: K.T.height, ground: true };
      for (let f = 0; f < 90; f++) {
        e.v[0] = Math.cos(ang) * 8; e.v[2] = Math.sin(ang) * 8;
        K.step(e, 1 / 60);
      }
      const at = K.roomAt(e.p[0], e.p[1], e.p[2]);
      const inside = at && e.p[0] > at.x0 - 1.2 && e.p[0] < at.x1 + 1.2 &&
                           e.p[2] > at.z0 - 1.2 && e.p[2] < at.z1 + 1.2;
      if (!inside) {
        const k = rid;
        if (!escaped.has(k)) escaped.set(k, `from (${K.NAV.x[i].toFixed(1)},${K.NAV.z[i].toFixed(1)}) heading ${(ang * 57.3) | 0}° ended (${e.p[0].toFixed(1)},${e.p[1].toFixed(1)},${e.p[2].toFixed(1)})`);
      }
    }
  }
  for (const id in K.ROOM)
    ok(`nothing walks out of "${id}"`, !escaped.has(id), escaped.get(id) || "");
}

console.log("\n— barricades —");
for (const b of K.BARRIERS) {
  const n = K.navNode(b.ix, b.y || 0, b.iz);
  const d = Math.hypot(K.NAV.x[n] - b.ix, K.NAV.z[n] - b.iz);
  ok(`barrier in ${b.room} @${b.x},${b.z} has a waypoint`, d < 3.2, d.toFixed(2) + "m");
}

console.log("\n— interactables —");
/* Sitting in the right room is not enough: you have to be able to stand close
   enough to buy it. A wall gun chalked halfway up a staircase is in the right
   room and 1.4 m under the step you would be standing on, so its prompt never
   appears and the economy quietly loses a weapon. */
for (const u of K.USABLES) {
  const R = K.roomAt(u.x, u.y, u.z);
  ok(`${u.t}:${u.name} sits in ${u.room}`, R && R.id === u.room, R ? R.id : "nowhere");
  /* A player can stand anywhere, not only on a waypoint, so sample the real
     standable area at 25 cm and score it exactly the way the prompt does. */
  let best = 1e9, spots = 0;
  for (let dx = -u.rad; dx <= u.rad; dx += 0.25)
    for (let dz = -u.rad; dz <= u.rad; dz += 0.25) {
      const x = u.x + dx, z = u.z + dz;
      const gy = K.groundAt(x, u.y + 1.4, z);
      const e = { p: [x, gy, z], v: [0, 0, 0], rad: K.T.radius, hgt: K.T.height };
      if (!K.clearAt(e)) continue;
      const near = K.navNode(x, gy, z);
      if (Math.hypot(K.NAV.x[near] - x, K.NAV.z[near] - z) > 2.6) continue;   // and connected
      const score = Math.hypot(dx, dz) + Math.abs(u.y - gy) * 1.4;
      if (score < best) best = score;
      if (score < u.rad) spots++;
    }
  ok(`${u.t}:${u.name} can be stood next to`, spots >= 3,
     `${spots} standable spots, closest scores ${best.toFixed(2)} against radius ${u.rad}`);
}
/* And no two of them may shadow each other. There is one prompt on screen, so
   if standing at the MP40 offers you Double Tap, the MP40 does not exist. */
K.game.papT = 999;   // Pack-A-Punch is deliberately invisible outside its window
for (const u of K.USABLES) {
  let won = false, saw = "";
  for (let a = 0; a < 16 && !won; a++)
    /* Sample out to most of the prompt radius: the Pack-A-Punch anchor is the
       centre of the machine, so every ring inside 1.5 m is inside the machine. */
    for (const r of [u.rad * 0.4, u.rad * 0.62, u.rad * 0.86]) {
      const ang = a / 16 * Math.PI * 2;
      const x = u.x + Math.cos(ang) * r, z = u.z + Math.sin(ang) * r;
      const gy = K.groundAt(x, u.y + 1.4, z);
      const e = { p: [x, gy, z], v: [0, 0, 0], rad: K.T.radius, hgt: K.T.height };
      if (!K.clearAt(e)) continue;
      K.me.p = [x, gy, z];
      const p = K.nearestUse();
      if (!p) continue;
      saw = p.name;
      if ((p.u && p.u.id === u.id)) { won = true; break; }
    }
  ok(`${u.t}:${u.name} is the prompt when you stand at it`, won, won ? "" : "got " + (saw || "nothing"));
}
K.game.papT = 0;


console.log(fails ? `\n${fails} FAILURES\n` : "\nall good\n");
process.exit(fails ? 1 : 0);
