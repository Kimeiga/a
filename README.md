# Kino der Toten

A wave-defense zombies shooter for mobile web. **One HTML file, no dependencies,
no assets, no external requests.** Hand-rolled WebGL1, procedural geometry,
procedural audio, ~68 KB gzipped, one HTTP request.

It is a compressed recreation of Call of Duty's *Kino der Toten* — the bombed-out
German cinema — with the systems that make that mode work: a points economy you
spend on doors, a mystery box that moves, perk machines behind a power switch,
and a teleporter to Pack-A-Punch.

## Playing

Tap (or click) to start; before that the camera walks the map.

- **Touch** — dynamic left stick, origin follows your thumb past the rim. The
  big right trigger fires *and* doubles as the aim-drag origin: start a drag on
  it and you shoot while you aim; touch anywhere else on the right and you aim
  for free. A second trigger sits on the left edge. Buy, reload, swap, knife,
  grenade and jump are on the right column; the buy button only appears when
  there is something to buy. Push the stick all the way forward to sprint.
- **Desktop** — WASD, mouse, `F` buy, `R` reload, `Q` swap, `V` knife, `G` frag,
  `Shift` sprint, `Esc` pauses.

Points are the whole game: `10` a hit, `60` a body kill, `100` a headshot,
`130` a knife kill. Doors cost 750–1750, perks 500–4000, the box 950,
Pack-A-Punch 5000.

## The map

```
                        ALLEY  (open sky, Stamin-Up, fire trap)
                          |
   POWER ROOM  ---------- + ---------- THEATER + STAGE ---- DRESSING ROOMS
   (switch, M16,          |            (Juggernog, box,     (Speed Cola)
    Mule Kick)            |             teleporter, turret)      |
        |                 |                   |                  |
        +-------------- LOBBY -------- UNDER THE BALCONY      FOYER
                    (spawn, Quick                            (Stakeout)
                     Revive, M14,          UPPER HALL
                     Olympia, frags,       (Double Tap, MP40)
                     mainframe)
```

Eight buyable doors, twenty-one barricades, a mystery box that rotates between
seven spots, six perks, five wall weapons, twelve weapons in the box pool
including the Ray Gun and the Thundergun.

## Enemies

| | |
|---|---|
| **Walker** | walks. Eighty percent of every round. |
| **Runner** | same thing, faster, from round four. |
| **Nova crawler** | scuttles low and bursts into Nova-6 gas, which kills its own kind — a crawler is a trap you can aim. Round eight. |
| **Hellhound** | four legs, faster than you, arrives in whole rounds. |
| **Screecher** | flies, and climbs over anything in its way. |
| **Spitter** | stops at twelve metres and shoots. Round ten. |
| **Panzer** | armoured, slow, shoots, takes a magazine. Round thirteen, then every six. |

## Build

```bash
node build.mjs          # -> index.html          198 KB raw, 68 KB gzipped
node build.mjs --min    # -> dist/index.html     117 KB raw, 43 KB gzipped
```

The build exists so a 4,000-line program can live in editable pieces while
still shipping as one request. `index.html` is the readable artefact — the
comments are most of its bulk and they are the point. `dist/index.html` is the
same program with the prose taken out, and it is what gets deployed.

Both are tested: `MINIFIED=1` runs either suite against the minified bundle,
and the run is identical round for round, because the simulation is seeded and
fixed-step.

## Tests

The whole game boots headlessly in Node against a real WebGL context
(`headless-gl` → ANGLE, under Xvfb), which is the only way to catch the class of
bug that is invisible by eye.

```bash
npm install gl
xvfb-run -a --server-args="-screen 0 640x480x24" node test/smoke.mjs   # level + nav invariants
xvfb-run -a --server-args="-screen 0 640x480x24" node test/play.mjs    # a bot plays it
```

`smoke.mjs` asserts the things that are silently false otherwise: every room is
reachable on foot, the doors actually seal, nothing can walk out of the
building, every buyable thing can be stood next to, and no two prompts shadow
each other.

`play.mjs` drives the real inputs — the same yaw, stick, trigger and buy button
a thumb would — through a survival run, then walks the whole Zombies loop
explicitly: every door, the power, every perk, every wall gun, the box, the
mainframe, the teleporter, Pack-A-Punch and back. It finishes with differential
render tests and scene-luminance statistics, because "it looks flat" and "it
looks broken" have the same symptom and only a number tells them apart.

Both suites found real bugs — see the commit history.
