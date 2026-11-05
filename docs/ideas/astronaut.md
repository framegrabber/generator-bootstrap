# Screen astronaut

A sitting astronaut whose face is the Waveshare ESP32-S3-Touch-LCD-2.8, styled after Creative Chance's Deskimon: a few basic blocks (flat-fronted pillow head, domed torso, slab arms, rounded-box feet) joined with small fillets so each block stays readable.

## Decisions (user, 2026-10-20)

- New generator, starting with the astronaut, no backpack.
- Constrained to the 2.8" board for now: the head is sized from the board's glass, plug room, and stack; the user adds margins, not absolute sizes.
- Two iterations:
  1. **Look development** (this one): every proportion is a param (head margins, depth, corner and back roundness; a lower and an upper torso volume, each with width, depth, height, roundness, and forward offset, plus the blend between them and the joint softness; arm length, angles, thickness, width, roundness; foot length, toe-out, size, spread, roundness). Parts are solid, coloured previews in one assembly. The two stacked volumes replaced a first torso of a rounded box, dome, and belly (user request: control the shape better). The defaults are the user's tuned shape (settings file of 2026-10-20): a 45 mm deep head with little back rounding, a wide ellipsoid lower body (70 × 60 × 45) under a narrower chest raised 10 mm, the maximum volume blend (25), nearly crisp limb joints (1), and arms 35° out and 15° forward.
  2. **Printable**: hollow head split into front and back halves at the board stack's depth, closed by the "triangle": two split bosses on the seam capped by the helmet discs, plus the split neck stem in the body's socket; a tongue on the front half keys the seam. Prototyped in `/tmp/proto/triangle.ts` (throwaway); weak spot is the seam far from the triangle (bunny: lower side corners, robot: top edge middle).

## Choices made without the user

- Name "Screen astronaut" (id `astronaut`): it sorts after "Display dog", so the default generator and its e2e test stay unchanged.
- Screen orientation was a param in iteration 1 (landscape or portrait). Iteration 2 dropped portrait: USB-C down would run the plug into the neck, which neither the stem nor the socket can pass.
- Body defaults are Deskimon's body measured from its builder meshes, scaled by the square root of the face-area ratio (1.37).

### Iteration 2 (printable), choices made without the user

- The seam is not always at the head's middle: with USB-C on the right side 9.7 mm behind the face, a disc centred at the middle (y = 20.3 for the 45 mm head) would cover the plug opening, so the seam moves back until the right disc clears it (y = 26.2 with the R11.5 discs). Discs stay centred in height, as in the look.
- Bosses and stem have a lemon profile (circle plus 45° points toward ±y) instead of a round one with a snap bead: a round boss split along the seam has its curved side facing the bed in both halves' print poses. The discs first pressed on with 0.15 mm clearance and nothing held them; see "Twist-lock discs" below.
- The back half prints on its back (the flat middle of a 20 % back rounding), not on its seam: printed seam down, its flat back would be an 80 mm unsupported ceiling.
- No separate spacer: the back half's posts end in sockets that sit directly on the board's standoff tips.
- Speakers lie flat on the back wall in fences with a lead gap, grille holes behind; the battery lies loose between the posts.
- Board buttons get Ø1.6 pin holes through the top (a paperclip), as on the display characters; printed plungers were not added.
- The antenna and the helmet-disc toggle were removed: an antenna on a disc would print as an unsupported horizontal rod, and without discs nothing holds the head halves together.
- The chest patch prints in place with the body (two colours); the screen and eyes are preview-only stand-ins (`standIns`, new in `GeneratorResult`).

Status: iteration 1 in commits 4f86958, 2640e9a, c9079c1, eff426a; iteration 2 (printable) in 57ed511 and ac58cee.

## Twist-lock discs (user, 2026-10-24)

The discs have to lock on to hold the head halves together. A first try (e2669fb, reverted in c43b8b7) turned each boss half's lemon point into a snap finger: the user rejected it as impractical to print (0.5 mm slots and thin fingers) and asked for a twist lock or a coarse screw. A screw needs a round thread on the boss, and the split boss has to stay lemon-shaped to print, so this is a quarter-turn twist lock with nothing thin or springy.

- Each lemon point carries a rigid hook at the boss's tip: a square turned 45° standing 1.5 mm out of the point, flat for 0.8 mm behind the tip face, then a 45° back face down into the lemon. All its faces are vertical or 45° in the halves' print poses.
- The disc's bore is round (0.2 mm over the points) so the disc turns on the lemon, with two keyways the hooks slide down. The groove they turn in is the hook's own path swept in 14 steps: 70° clockwise seen from outside, to a stop. Choices made without the user: clockwise to lock, like a screw; 70°, so the keyway clears the hook by about 30° when locked; 0.25 mm clearance round the hooks.
- Along the turn the groove's 45° ceiling rises 0.8 mm toward the head (about a 5° helix, below PLA's friction angle). The turn draws the disc onto the head, and the 45° contact pushes both hooks toward the axis, which presses the halves together at the seam. At the stop the ceiling touches the hooks with no clearance and no interference. Snugness then comes from print tolerance, so a disc may turn back loose.
- The disc must keep wall round the groove, so the radius param's minimum rose from 5 to 11 mm (`MIN_DISC_RADIUS`). Below 7.3 mm the old lemon bore already cut through the disc.
- Untested on hardware: how tight the stop is, and whether a disc turns loose by itself.

## After the first print (user, 2026-11-05)

The user printed the astronaut and asked for four changes.

- **Speaker grilles centred on the back.** They were 2.9 mm right of centre: the speakers were centred between the board's standoff columns rather than on the head, and odd hex rows had an extra column on the right. Fixed in 60a0c4c.
- **The head twist-locks onto the body**, using the discs' mechanism (`TWIST`). User: the head rests on a flat body top (no 3 mm recess; a rectangle cannot turn in a rectangular recess). Choices made without the user:
  - The neck moves wholly onto the front half instead of being split by the seam. A split lemon neck at the seam (26 mm back, set by the right disc clearing the USB-C opening) would only keep its socket's back wall in the body's 31 mm deep top if it shrank from R7 to R5, and portrait needs the neck somewhere other than the seam anyway.
  - The neck is round with one 45° point, toward the face, cut flat at the circle's radius; the point faces the bed when head-front prints face down, and the flat is a short bridge. Hooks sit on the front and back, as on the bosses.
  - The head turns the same way as the discs relative to its socket, by the same 70°.
- **The chest patch prints separately.** User: a flat badge glued into a recess, face up on the bed, with a choice of shape and optional raised lettering. Choices made without the user:
  - Shapes: rounded rectangle (as before), circle, hexagon, shield, all inside the old patch's 0.8 × upper-width by 0.22 × torso-height box.
  - The recess has a flat floor at least 1 mm deep everywhere, 0.2 mm of clearance round the badge; the badge stands 0.6 mm proud at its highest point.
  - Lettering is a single line, 0.8 mm tall in its own colour (an assembly with the badge), its cap height scaled to fit the badge. The text is empty by default, so the default model has no lettering.
  - The in-place patch is gone (the user did not ask to keep it). The `chestPatch` key keeps its meaning (patch or not), so it needs no migration.
- **Portrait comes back**, offered as "Landscape (USB-C right)" or "Portrait (USB-C down)". In portrait the cable goes through the body. User decisions:
  - The straight plug goes down into the neck, and the neck twists into the body. The neck is centred on the plug, 9.7 mm behind the face, so the head turns about that point.
  - The neck has to hold the 13 × 7 plug opening, so it is R9 and its socket reaches in front of the face. The body moves forward under the head as far as that needs (about 8.5 mm at the defaults), and the head overhangs the back more. The user chose this over a head about 33 mm taller.
  - A tunnel runs from the socket out through the base, with a notch under the base for the cable. It is round and wide enough for the plug to turn 70° below the neck, so the cable's far plug threads through it too.
  - Plug and cable: 25 mm straight plug (port face to the end of the strain relief) and a 4 mm cable, user's placeholders until measured. Choice made without the user: the round tunnel makes the plug's length irrelevant, so neither is a param; the notch is 5 mm.
  - Landscape keeps the USB-C opening in the right side and has no tunnel.
  - Portrait turns the board as in iteration 1 (module right edge on the face's left). The buttons' pin holes then go out through the right side, so the seam moves back until the right disc clears them, as it does for the landscape USB-C opening.
  - Choices made while building: the portrait plugway through the bottom wall and neck is 13 × 7 with R1 corners (the landscape side opening keeps R2), so even a square-cornered 12.2 × 6.3 plug body passes; the body moves forward in 0.5 mm steps, as little as keeps the socket's and the tunnel's walls, which is 8 mm at the defaults; portrait's seam moves back to 22.5 mm so the right disc clears the button pin holes.
