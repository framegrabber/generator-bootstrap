# Display dog generator

Status: implemented (commits 4309da7, a2730bf). Deviations from the plan below:
- The battery sits in the head, flat behind the display, where the all-in-one boards already put the electronics. The body is solid (slicer infill) with no battery cavity, so no neck passage is needed.
- `earTilt` was dropped. A tilted ear leaves the split plane: half-ears stop lying flat and the inner-ear accent shrank to dots.
- Alignment pins became holes on both halves for 1.75 mm filament dowels. Both halves print on the split face, so neither can carry a pin.
- The "ear thickness ≥ 1.2 mm" check is enforced by construction (ear tip radius 1.2 mm, half-thickness ≥ 0.225 × width) instead of by validation.
- `sdf.ts` is pure math and main-thread safe, not worker-only: `validate` samples the head SDF to check the battery fits.
- The preview shading change was not needed: at default detail the flat-shaded preview shows no visible facets.
- Meshing cost needed work: culling shapes by bounding box, `Math.sqrt` instead of `Math.hypot`, and a 1 mm default edge brought the default build from 6.3 s to about 1.7 s in Node and about 3 s in the browser.
- Bambu Studio 2.7.1 CLI: in-place accents load as object "face" with head-front on filament 1 and nose and inner ears on filament 2; glue-on accents load as separate objects on filament 2. Not yet sliced or printed.

## Problem Statement
How might we let people who own a small round display (or an ESP32 board with one built in) generate a cute, printable dog enclosure that is sized to their hardware, shaped by a handful of character params, and assembles without glue or support material?

## Recommended Direction
One generator, `display-dog`, built from signed-distance functions meshed with `Manifold.levelSet`, the approach proven by the spikes (`/tmp/robot-spike/dog.mjs`, `robot.mjs`, `robot2.mjs`): head and torso ellipsoids, ears, snout, legs and tail smooth-blended (`smin`), hollowed by subtracting a second level set of the head and torso only, inset by the wall thickness. Appendages stay solid, so ears and tails never get walls too thin to print. Display window, module pocket, USB-C opening and neck ring are ordinary manifold booleans afterwards. SDF primitives and `smin` go into a shared `src/core/sdf.ts` (worker-only), with closed-form volume tests like `geom.ts`.

**The display drives the size.** The user picks a display; its outline and thickness set a flat face pad (round for round displays) plus `faceMargin`, and the head grows to fit. Character params are proportions on top of that. A dog the screen doesn't fit cannot be generated, which avoids the spike's loose-bezel failure (pocket wider than the flat face).

**The head splits front/back through the ears' mid-plane.** The front half carries the face, window, module pocket, snout and the front half of each ear; the back half carries the rest. Both print on the split face with no supports: each half-ear lies flat on the bed. The module drops into the front half from behind. The two halves are aligned by pins and held together by the neck: the body's friction ring clamps the head's neck collar, which spans both halves. The body prints upright on its flat base.

**ESP32 all-in-one boards move the electronics into the head.** The board sits behind the screen, so the body cavity only holds a battery, and the USB-C opening goes in the head at the edge the board's port faces (`usbEdge`: left, right or top; down points into the neck and is unreachable). Display content can be rotated in firmware, so rotating the board physically costs nothing.

**Accents** (nose, inner ears) are selectable: multi-colour in place (parts sharing coordinates in one `assembly`, for AMS printers; the inner ear sits on the half-ear's top face, so it prints in place) or glue-on (separate parts with locating recesses).

### Display catalogue

| Value | Visible area | Outline | Source |
|---|---|---|---|
| `gc9a01-module` | Ø32.4 | 38 × 45.5 × 4.5 mm (round panel on a board with a pin tab) | [datasheet](https://cdn.shopify.com/s/files/1/1509/1638/files/1_28inchTFT_datasheet.pdf?v=1691389826) |
| `waveshare-s3-lcd-128` | Ø32.4 | board R18.25, USB-C tab 18.37 wide × 5.48 proud; **11 mm thick (estimate)**: panel + PCB + the 1.27 mm female headers on the back | [wiki](https://www.waveshare.com/wiki/ESP32-S3-LCD-1.28) |
| `waveshare-s3-touch-lcd-128` | Ø33.4 | glass Ø38.51, 40.36 tall with FPC tab, board R18.75, USB-C 9.92 wide; **8 mm thick (estimate)**: touch glass + panel + PCB + USB-C, no headers | [wiki](https://www.waveshare.com/wiki/ESP32-S3-Touch-LCD-1.28) |
| `custom` | round or rect, user dimensions | user outline + thickness: the volume the rest is built around | — |

Thicknesses marked estimate are catalogue constants, replaced when someone measures a board. The pocket adds 0.3 mm clearance per side on top of every outline.

### Parameters

| Group | Param | Kind | Notes |
|---|---|---|---|
| Display | `display` | select | catalogue above |
| | `customShape` | select | round / rect; `custom` only |
| | `customDiameter` or `customWidth`, `customHeight`, `customCorner` | number | module outline |
| | `customViewDiameter` or `customViewWidth`, `customViewHeight` | number | visible window |
| | `customThickness` | number | glass front to board back |
| | `usbEdge` | select | left / right / top; all-in-one boards only |
| Shape | `faceMargin` | number | shell around the display; sets head size |
| | `headDepth` | number % | of head width; floored by display thickness + walls |
| | `bodySize` | number % | of head |
| | `softness` | number | blend radius |
| Dog | `earStyle` | select | pointy / round / floppy / none |
| | `earLength`, `earWidth`, `earSpread`, `earTilt` | number | hidden for `none` |
| | `snout` | number | 0 = none |
| | `frontLegs` | boolean | |
| | `tail` | select | none / stub / curl up / wag to one side |
| Print | `wall` | number | |
| | `neckFit` | number | friction-ring clearance |
| | `battery` | select (+ numbers for custom) | none / `402030` / `502030` / `503035` / custom; sizes the body cavity (see below) |
| | `accentMode` | select | in place (AMS) / glue-on |
| | `bodyColor`, `accentColor` | color | |
| | `detail` | select | draft / fine mesh edge length |

### Battery sizes

LiPo pouch names encode thickness (0.1 mm), width and length in mm. Capacities are typical, not guaranteed.

| Value | Pouch (T × W × L) | Typical capacity | Cavity reserved |
|---|---|---|---|
| `none` | — | — | no battery cavity; USB-powered |
| `402030` | 4 × 20 × 30 mm | ~200 mAh | 5.5 × 22 × 34 mm |
| `502030` | 5 × 20 × 30 mm | ~250 mAh | 6.5 × 22 × 34 mm |
| `503035` | 5 × 30 × 35 mm | ~500 mAh | 6.5 × 32 × 39 mm |
| `custom` | user T × W × L | — | T + 1.5, W + 2, L + 4 |

Cavity = pouch + 1.5 mm on thickness (swelling), + 2 mm on width, + 4 mm on length (protection PCB and leads usually sit at one end). Default `502030`. `503035` may only fit at larger `bodySize`; `validate` reports it.

### Validation and checks
- Display module plus wall fits the flat face pad (by construction, plus a `validate` guard for custom sizes).
- Battery box fits the body cavity: sample its corners and edges against the inner SDF, require ≥ wall.
- Ear thickness at the thinnest point ≥ 1.2 mm.
- Every part decomposes to exactly one body (the spikes produced loose tail tips, snout slices and a floating bezel ring until tuned).
- Head halves: the split plane leaves the whole module pocket in the front half.

## Key Assumptions to Validate
- [ ] Builds stay interactive: spikes took ~3 s at 0.8 mm edge length in Node. Test: time a default build in the worker in Chromium; `detail: draft` targets ≤ 1 s.
- [ ] Splitting through the ear mid-plane prints both half-ears flat without supports for every `earTilt` in range. Test: Bambu Studio CLI slice of front and back halves at min/max tilt; check support volume.
- [ ] The neck friction ring holds both head halves and the body together without glue at a printable clearance. Test: physical print of a tolerance coupon at 3 clearances.
- [ ] Waveshare board thicknesses (11 and 8 mm are guesses) and USB-C depth. Test: caliper or STEP file; update the catalogue constants.
- [ ] In-place inner-ear inlays slice as one multi-material object with the accent on filament 2. Test: Bambu Studio CLI, read `model_settings.config`.
- [ ] Inset level set gives a wall within ±0.3 mm of `wall` in blended regions (smin is not an exact distance). Test: unit test sampling wall thickness on the built shell.
- [ ] Preview looks smooth enough: the preview currently flat-shades every triangle. Test: screenshot at default detail; if faceted, add angle-based smooth normals in `Preview.tsx`.

## MVP Scope
In:
- `src/core/sdf.ts`: sphere, ellipsoid, capsule, round cone, round box, round cylinder, `smin`, with volume tests.
- `display-dog` generator: the parameter table above, the three catalogue displays plus custom round/rect, front/back head split through the ear plane, alignment pins, neck friction ring, body with battery cavity, USB-C opening per `usbEdge`, accents in both modes.
- Validation rules at their boundaries; single-body check per part.
- README note per part on print orientation.
- Smooth preview shading if the screenshot check shows facets.

## Not Doing (and Why)
- Species presets (cat, bear, bunny): the codebase has no preset mechanism; ear styles already cover cat/fox/bear shapes.
- Rectangular catalogue displays (ST7789, OLED, LilyGO T-Display): custom rect covers them; add catalogue entries on demand.
- Other poses, standing or lying dogs: one sitting pose keeps the param count sane.
- Screw or magnet joints: friction ring chosen; magnets can be added as another `join` option later.
- Speaker grilles, buttons, sensors: hardware varies too much; custom holes are a separate feature.
- Uploading a sculpted mesh: non-manifold meshes need repair; revisit if users ask.
- Chest lettering: possible with `textOutline`, but on a curved surface it needs projection; later.

## Open Questions
- None blocking. Thickness and battery figures are estimates; replace them after the first build with real hardware.
