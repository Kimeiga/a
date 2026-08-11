/* ============================================================================
   LIGHTS

   The renderer this grew out of had one directional sun, which is the right
   answer for an arena with no roof and the wrong answer for a cinema. Indoors
   there is no single direction that light comes from: there are fittings, and
   the room is dark between them. So the sun is gone and this is the list.

   Only the nearest seven are ever evaluated for a pixel, chosen per frame
   against a point six metres in front of the camera — biased toward what you
   are looking at rather than what you are standing in, because that is where
   the pixels are. Anything further away is carried by its own emissive and by
   fog, which is also why every fitting in the level is an emissive box.

     [x, y, z, r, g, b, radius, flags]   flag 1 = needs the power on
   ========================================================================== */
const LIGHTS = [
  /* lobby — two chandeliers, wall sconces, and the shell hole in the roof.
     The hole is the only light you own before the power, and it is cold, so
     the moment the power lands the whole room turns warm. */
  [-6.5, 6.2,-16.5,  1.00,.78,.50, 16, 0],
  [-0.5, 6.2, -8.0,  1.00,.78,.50, 16, 0],
  [-1.75,8.2, -6.5,  0.42,.58,.95, 17, 0],
  [-10.2,3.1,-12.5,  0.90,.68,.42,  8, 1],
  [-10.2,3.1, -7.4,  0.90,.68,.42,  8, 1],
  [-5.0, 4.1, -3.4,  0.28,.95,.44,  6, 0],   // exit sign
  [-9.4, 1.3, -5.2,  1.00,.20,.22,  5, 1],   // Quick Revive machine

  /* under the balcony + upper hall */
  [-2.2, 3.5, -2.7,  0.95,.72,.44,  8, 0],
  [-7.0, 7.0, -2.7,  0.95,.72,.44, 10, 1],
  [ 2.0, 7.0, -2.7,  0.95,.72,.44, 10, 1],
  [-3.0, 8.3,  1.3,  0.55,.72,.95, 14, 1],
  [-9.4, 5.7,  1.0,  1.00,.72,.16,  5, 1],   // Double Tap

  /* theater — the chandelier does the heavy lifting, the follow spots come on
     with the power, and the footlights make the stage read as a stage. */
  [-4.8, 8.3, 13.2,  1.05,.84,.55, 28, 0],   // the theater has to be trainable in
  [-9.2,12.2, 10.3,  0.62,.80,1.00,20, 1],
  [-1.6,12.2, 10.3,  0.62,.80,1.00,20, 1],
  [-7.0, 1.5, 18.7,  1.00,.76,.42, 13, 1],   // footlights
  [-14.5,3.5,  8.0,  0.95,.72,.44,  9, 0],
  [-14.5,3.5, 16.0,  0.95,.72,.44,  9, 0],
  [ 4.4, 3.5,  8.0,  0.95,.72,.44,  9, 0],
  [ 4.4, 3.5, 16.0,  0.95,.72,.44,  9, 0],
  [-13.2,1.3, 15.6,  1.00,.18,.20,  6, 1],   // Juggernog

  /* foyer + dressing rooms */
  [ 11.0,5.8,  7.2,  1.00,.80,.50, 21, 0],
  [ 11.0,3.6, -3.0,  0.95,.76,.48, 13, 0],
  [ 20.2,3.4, -1.0,  0.95,.72,.44,  9, 0],
  [  5.6,3.4,  8.0,  0.95,.72,.44,  9, 0],
  [ 11.0,4.7, 16.8,  1.00,.82,.56, 15, 0],
  [ 18.2,2.7, 18.0,  1.00,.84,.62, 11, 0],
  [  5.6,3.2, 23.0,  0.95,.74,.46,  9, 0],
  [  6.5,1.3, 15.0,  0.30,1.0,.36,   6, 1],  // Speed Cola

  /* alley — cold sky bounce, two wall lamps, and a fire in a barrel */
  [-22.0,9.0, 15.0,  0.30,.44,.78, 26, 0],
  [-28.2,4.7, 11.6,  0.55,.74,1.00,12, 0],
  [-15.5,4.7, 21.6,  0.55,.74,1.00,12, 0],
  [-18.6,1.3, 14.0,  1.00,.46,.14, 10, 0],
  [-27.2,1.3, 24.6,  1.00,.45,.85,  6, 1],   // Stamin-Up

  /* power room */
  [-28.4,3.5,-10.4,  0.55,.72,1.00,17, 0],
  /* Emergency light over the switch. Dim, red, never gated — it is the only
     thing telling you where the power is before you have any. */
  [-12.4,2.2,  1.6,  1.00,.20,.14, 11, 0],
  [-18.0,4.3,  2.4,  0.55,.72,1.00,14, 1],
  [-26.9,0.9,-16.6,  0.42,.62,.90,  7, 0],
  [-12.8,1.3,-19.2,  0.65,.42,1.00, 6, 1],   // Mule Kick

  /* projector room */
  [ 47.8,1.1, 46.8,  1.00,.90,.70, 15, 0],
  [ 47.8,1.1, 53.2,  1.00,.90,.70, 15, 0],
  [ 54.0,1.5, 48.8,  0.35,.74,1.00,12, 0],
];
/* Radii are generous because the falloff is windowed inverse-square: the
   radius is where it reaches zero, not where it stops mattering. */
