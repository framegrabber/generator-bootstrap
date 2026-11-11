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
  - Choices made while building: the portrait plugway through the bottom wall and neck is 13 × 7 with R1 corners (the landscape side opening keeps R2), so even a square-cornered 12.2 × 6.3 plug body passes; the body keeps the offset to the neck it has in landscape, 9 mm forward at the defaults (a first version moved it as little as kept the socket's and the tunnel's walls, which cancelled the Forward params: the user could not move the body back under the head); portrait's seam moves back to 22.5 mm so the right disc clears the button pin holes.
- Found while building the badge: a badge flat in the face plane came out 9 mm thick, because the blended chest leans back about 0.4 mm per mm of height (22°) across the badge. The badge and its recess now lie in a plane fitted to the sampled chest, so it prints under 3 mm thick on its back at the old position.

Status: built in 60a0c4c (grilles), 9340244 (head twist-lock), 0593aba and edc80b7 (chest badge), fcfb67d (portrait). Only the Bambu Studio 2.7.1 CLI import and the preview were checked, not a print.

Portrait follow-up (user, 2026-11-05): the head overhung the back of the body and Forward could not move the body back. Offered a right-angle plug inside the head (neck mid-head, head about 10 mm taller), a straight plug inside the head (about 33 mm taller), or dropping portrait; the user kept the plug in the neck. So only the Forward params were fixed: with the neck 9.7 mm behind the face, a head on top of the body needs a deeper chest, e.g. upper depth 60 moved 10 mm back.

Portrait, second follow-up (user, 2026-11-10): still unhappy with the head-to-body position and the upper body depth it forced; wants the head centred, and suggested a different neck or shoulders. The cause is one constraint: the straight plug is rigid with the head 9.7 mm behind the face, so a neck the head twists about has to stand there. The user chose to give up the twist in portrait (over a right-angle plug inside the head, a head 33 mm taller, or no portrait). Built:

- The body stays exactly where it is in landscape. It carries a neck ring: 8 mm tall, centred on the upper volume, radius 22.4 mm at the defaults (it reaches 1.2 mm in front of the face, since the sleeve's socket needs its wall there), with a 45° cone below it into the torso so the body still prints without support. The head stands 8 mm higher, on the ring.
- The head's neck is a sleeve round the plug that pushes straight down into a socket in the ring, 0.25 mm clearance. It is round toward the face with the 45° point (that side faces the bed), with flat sides and a square back for keying; flats on the round alone overlapped the socket by only 0.3 mm³ at an 8° turn.
- The plug's 13 × 7 opening continues straight down through the body and out of the base, with the 5 mm notch to the back. The round tunnel is gone, since nothing turns in it.
- Choices made without the user: the head is not locked in portrait (it rests in the socket, held by its weight and the plug); the ring is not a param; validation reports a body moved so far back that the ring would stick out more than 2 mm behind the head, and a tunnel that breaks out of the body's front.
- Not checked: whether the cable's far plug passes the 13 × 7 tunnel. A USB-C plug the size of the board-side one does; a USB-A plug does not, so such a cable has to be threaded from below, C plug first.

Portrait, third follow-up (user, 2026-11-11): the ring "doesn't fit the style yet"; asked whether the twist mount could return with the neck hole offset to the front and a bigger upper body, then whether the ring could blend into the body. After a side-by-side of the blended ring, the twist with a 60 mm chest, and the twist with a boxier 48 mm chest, the user said all can be made to work and wants to keep playing with every variant, with wider limits on the body volumes. Built:

- "Head mount" in portrait: neck ring (push on, the default, since it validates and centres the head at the default body) or twist-on (the earlier portrait: neck with hooks on the plug, round tunnel, the body under the plug with Forward and Depth free).
- The ring is part of the body's distance function now, blended into the torso over "Neck ring blend" (default 8 mm, 0 to 30).
- Wider limits: body widths 25 to 140, depths 20 to 120, heights 10 to 120, Forward ±40, upper Offset −60 to 80, Volume blend to 50. Validation, not the limits, reports what does not fit.
- Not decided: which mount stays. Remove the other one, its param, and its tests when the user picks.

Portrait, fourth follow-up (user, 2026-11-11): the neck ring sticks out in front of the head, and a deeper head did not cover it: the torso sat at 0.45 × head depth, so it followed every depth change, and the head only grows backward anyway, while the ring's front is pinned by the plug 1.2 mm in front of the face (3.7 mm past the head's rounded bottom edge at the default 2.5 mm front edge). Built:

- The body hangs on the board now (17.75 mm behind the glass front, the same place as before at the default 45 mm depth), so head Depth no longer moves it. Designs saved with another head depth shift by 0.45 × the difference; the user's own tuning is the only such data.
- "Screen recess" (0 to 10 mm, default 0): the front of the head gets thicker around a deeper window, so the face moves forward over the ring while board, plug, neck, and body stay. 4 mm puts the ring's front 2.8 mm behind the face. It takes room behind the board, so the minimum head depth grows with it, and with the ring mount the head also has to reach back over the ring (depth 50 at recess 4).
- Choice made without the user: a recess rather than a thinner ring. Flattening the ring's front to the face plane would leave 0.45 mm of socket wall.

Chin and defaults (user, 2026-11-11): the user keeps the screen recess low (1 mm) for touch use and wants the chin alone to stand out further. Told that the front half prints face down, so a chin in front of the face leaves the face hanging above the bed, and offered a sharper bottom edge, a glued-on chin piece, or a bevelled window instead; the user chose the true chin, printed with supports. Built:

- "Chin" (0 to 8 mm, default 0): the head's outline pulled forward below the screen, under a 45° ramp starting 2 mm below the window; solid. With it the build warns that head-front rests on the chin and needs supports under the face, and the assembly notes say so.
- New defaults from the user's settings file: portrait, neck ring with blend 2, screen recess 1, head depth 50, corner roundness 30, back roundness 15, lower Forward 0, upper body 56 wide and 56 deep, upper Offset 0. Choice made without the user: no migration for older links; a link that relied on the old defaults now opens with the new ones.

Chin removed, defaults again, shield lettering (user, 2026-11-11): "remove the chin idea, that doesn't work". The Chin param, its shape, warning, and test are gone; saved settings that carry `chin` drop the key on load. New defaults from the user's next settings file: screen recess 2.5 (instead of the chin), head depth 53, corner roundness 35, lower body 80 × 70, upper Offset 5, arms 40° out, 20° forward, 17 wide, shield badge lettered "F". The shield's lettering looked low because of its pointed bottom; it now sits a quarter of the badge box's half height (2 mm at the defaults) above the outline's middle, about over the middle of the shield's area. Choice made without the user: the amount, from the shield's area centre (0.2 of the half height above the outline's middle) rounded up a little; the other shapes stay centred.

Head position (user, 2026-11-11): asked how far the twist mount's neck hole can move forward in the body without changing the body's proportions, then for one value that controls the head's position. Built "Head position" (−30 to 30 mm, default 0): the head moves forward on the body, which keeps its shape and posture. With the twist mount at the defaults it validates up to 7.5 mm, where the socket's wall reaches the front edge of the body's flat top; the 53 mm head then still overhangs the back of the body by about 8 mm. Choice made without the user: the ring mount gets a matching rule, the ring may not stand more than 2 mm in front of the head.
