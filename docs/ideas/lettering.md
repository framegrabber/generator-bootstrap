# Lettering for generators

Status: implemented (commits dbe61ae, acb6dbb). Deviation: Inter renders without kerning, because opentype.js cannot read the GPOS extension lookups that hold Inter's kerning; uploaded fonts with `kern` tables or plain GPOS pairs are kerned.

## Problem Statement
How might we let any generator add lettering (embedded, raised, or cut out, in a colour the user picks) with one call in `build.ts`, without generator authors handling font files, while end users can also use their own fonts?

## Recommended Direction
Port lightbox's font pipeline (`src/geometry/flatten.ts`, `scale.ts`, `layout.ts`, `src/fonts/*`) into a shared, worker-side `textOutline(geom, { font, text, capHeight, lineSpacing, align })` that returns a manifold `CrossSection`. Text is laid out with kerning, sized so cap height equals `capHeight` mm, and supports line breaks with left, centre, or right alignment.

One font ships with the app: **Inter Regular** (SIL OFL 1.1, static weight, legible at small sizes, already the lightbox test fixture). Users add others by upload. Fonts are a param kind (`kind: "font"`) whose value is a string: `bundled:inter` or `upload:<sha256>`. The worker resolves bytes itself, the bundled font through a Vite asset URL and uploads from IndexedDB, and caches parsed fonts. Because the value is a plain string, URL persistence, settings files, migration, and the README work unchanged, and opentype.js stays out of the main bundle.

Text colour is a user param, so the base gains a `color` param kind (value `#rrggbb`, rendered as a native colour input, no preset swatches). The generator passes it to the text part's `color`, which the preview and the 3MF export already use.

Coloured text has to stay in place on the plate, so `Part` gains an optional `assembly` name. Parts in one assembly keep their coordinates, are bed-checked as a group (the group, not each part, must rest on z = 0), and export as one multi-part object in 3MF. In STL, each assembly gets its own folder, `stl/NN_<assembly>/<part>.stl`, with all its files sharing coordinates so a slicer lines them up on import; parts without an assembly keep `stl/NN_<name>[_xQ].stl`.

The first consumer is a name tag/keychain generator with three text modes:

| Mode | Tag | Text part | Params shown |
|---|---|---|---|
| Embedded | text-shaped recess of depth `d` cut into the top | fills the recess, top flush with the tag, own colour, same assembly | inlay depth, text colour |
| Raised | unchanged | sits on the top surface, height `h`, own colour, same assembly | raised height, text colour |
| Cut out | text subtracted to depth `d` (engraved); `d` = thickness cuts through | none | cut depth |

Mode is a `select`; each mode's params use `visibleWhen`. `validate` keeps inlay and cut depth below the tag thickness, except that cut depth may equal thickness for a through-cut.

## Key Assumptions to Validate
- [ ] A Vite `?url` import of the bundled `.ttf` is fetchable from the module worker in dev and in the `base: "./"` build. Test: fetch it in the worker in both modes.
- [ ] idb-keyval reads IndexedDB inside the worker with the same store the main thread writes. Test: write on the main thread, read in the worker, in Chromium (e2e) and Safari.
- [ ] Slicers (PrusaSlicer, Bambu Studio, Orca) import a 3MF object with two coloured sub-meshes as one multi-material object, and two STLs sharing coordinates line up. Test: open an embedded and a raised export in at least one slicer.
- [ ] Embedded mode prints cleanly: the text part and recess share exact outlines (same CrossSection), so there is no gap or overlap a slicer would reject. Test: unit test that tag + text volume equals the plain tag volume.
- [ ] Inter's flattened outlines produce valid CrossSections for A–Z, a–z, 0–9 and common punctuation. Test: unit test over every glyph.
- [ ] Text at 6–10 mm cap height prints legibly in all three modes with the default bezier tolerance. Test: one physical print per mode.

## MVP Scope
In:
- `textOutline` helper (flatten, cap-height scale, kerning, multi-line, alignment) with tests on Inter.
- Param kinds `font` and `color`; multi-line `text` param (`multiline: true`); font picker for the bundled font plus uploads.
- `assembly` on `Part`; group-aware `checkResult`; 3MF writes each assembly as one object with per-part colours; STL writes each assembly into its own folder; preview unchanged (parts already render in place).
- Name tag generator: text, font, cap height, alignment, plate padding/corner radius/thickness, mode (embedded / raised / cut out) with its depth or height, text colour, plate colour, keyring hole.
- Upload library: port lightbox's IndexedDB index (`font:<sha>` bytes plus `font-index`), upload and remove in the picker, clear worker error when an `upload:` font is missing on this device.

## Not Doing (and Why)
- More bundled fonts: one keeps `dist/` small; uploads cover the rest.
- Stencil bridges: a through-cut loses the middles of O, A, B; bridging them is a separate geometry problem. The README warns when cut depth equals thickness.
- Stroke-thickness warnings: needs a per-glyph erosion check; not needed to prove the feature.
- SVG/logo import: same 2D pipeline, different parser; add when a generator needs it.
- Text on curves or curved surfaces: different layout and projection problem.
- Variable fonts: opentype.js flattens some to skeleton outlines (lightbox's Montserrat issue); uploads of variable fonts may look wrong and are not fixed here.
- Embedding uploaded fonts in URLs or settings files: font files are far too large for URLs; missing fonts error clearly instead.
- Per-glyph fallback for characters the font lacks: render `.notdef` and leave it.

## Open Questions
- None blocking. Revisit the Not Doing list after the first physical prints.
