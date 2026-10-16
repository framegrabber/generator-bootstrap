# Agent guide (CLAUDE.md; AGENTS.md links here)

Starter kit for browser-only parametric 3D-print generators. Each generator is a folder: a typed definition (params, validation) and a build module (values → printable parts). Geometry runs in a Web Worker with manifold-3d. The app previews in Three.js and exports a ZIP with a 3MF and STL files. Everything is client-side; there is no backend.

Most work in a project built on this base happens in `src/generators/<id>/`. The rest of `src/` is shared infrastructure that rarely needs to change. Read "Where to change things" before editing outside a generator folder.

## Commands

```bash
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build → dist/
npm test         # Vitest unit tests (node env)
npm run e2e      # Playwright smoke on port 5174 (run `npx playwright install chromium` once)
npm run lint     # ESLint flat config over src and tests
npm run new-generator -- <id> "<Name>"   # scaffold src/generators/<id>/
```

Before calling any change done, run `npm run lint`, `npm test`, and `npm run build` (the build runs `tsc -b` across app, test, and config projects). Run `npm run e2e` when the UI, the default generator, export, or persistence changed. CI (`.github/workflows/deploy.yml`) runs all four and then deploys `dist/` to GitHub Pages.

## Working method

What worked in earlier sessions on this repo. Follow it unless the user asks otherwise.

**Plan, then build in slices.**
- For a new feature with open questions, run the `idea-refine` skill (`.claude/skills/`) and write the one-pager to `docs/ideas/<name>.md`. Get the user's answers before building; record their decisions in the doc and commit it. When the feature lands, add a `Status:` line with the implementing commits and any deviation from the plan (see `docs/ideas/lettering.md`).
- Build in slices that each pass lint, tests, and build, and commit each one. Commit messages say what changed and why, including findings a reader could not get from the diff (e.g. "opentype.js shaping throws on Inter's GSUB").
- Update this file in the same change as the code it describes. Stale guidance here costs the next session more than missing guidance.
- When the user is away and asks you to keep going, make the conservative choice, write it down in the commit or the idea doc, and list every such choice in the final summary.

**Spike unfamiliar libraries before designing on them.** Write a throwaway test (`tests/unit/zz-*.test.ts`) that exercises the exact call, run it, then delete it. This surfaced every library surprise so far: opentype.js text shaping crashing on Inter, Inter's kerning being unreadable, and Vitest's `?url` imports not being fetchable. Read the dependency's source in `node_modules` (or upstream) instead of guessing; the slicer behaviour below came from Bambu Studio's `src/libslic3r/Format/bbs_3mf.cpp`.

**Verify slicer output in a real slicer.** The user prints with Bambu Studio (2.7.1, `/Applications/BambuStudio.app`). What the slicer shows is ground truth; a 3MF that unit tests accept can still load badly. To check without the GUI:
1. A throwaway test writes the file: `writeFile("/tmp/probe/x.3mf", new Uint8Array(await partsTo3mf((await buildWith("name-tag", {...})).parts, "App")))`.
2. `/Applications/BambuStudio.app/Contents/MacOS/BambuStudio --outputdir /tmp/probe/out --export-3mf out.3mf /tmp/probe/x.3mf`. The output dir must be absolute; a relative one exits with code 243 and writes nothing.
3. Read `Metadata/model_settings.config` in the output to see object names, part names, and filament (`extruder`) assignments as Bambu understood them.

PrusaSlicer is not installed. Its importer is `src/libslic3r/Format/3mf.cpp`; `raw.githubusercontent.com` 404s on `master` for that path, so fetch it at a release tag such as `version_2.9.2`.

**Look at the UI, not just the tests.**
- Screenshots with WebGL: launch Playwright's Chromium with `--use-gl=angle --use-angle=swiftshader` (`playwright.config.ts` does this for e2e). Without it, headless Chromium's software WebGL redraws a large preview so slowly that it starves the main thread: the dog's ZIP export took 53 s instead of 1.3 s. A build has finished when `button.primary` (Download ZIP) is enabled, so wait for that instead of sleeping.
- Test the production build the way GitHub Pages serves it: copy `dist/` into a subfolder (`/tmp/pages/app/`), serve the parent with `python3 -m http.server`, and open `/app/`. This catches worker asset URLs that work in dev but break under `base: "./"`. Watch for failed requests and console errors.
- In Bun scripts, import JSZip from `jszip/dist/jszip.min.js`; the package entry needs Node's `setimmediate`.

**Tests that catch real bugs.**
- Geometry: compare against closed-form volumes or bounds (`signedVolume`, `boundsOf`), not snapshots.
- When adding a guard (newest-wins, validation boundary), invert it, run the suite, and restore it. If the suite stays green, the test is missing. This found the untested newest-wins guard in the build scheduler.
- e2e finds fields with `getByLabel`. Fields use a separate `<label htmlFor>`; a label wrapping a textarea or select puts the control's current value into its accessible name and breaks those lookups.
- `playwright.config.ts` reuses a server already listening on port 5174 outside CI. Stop stale dev servers before trusting a local e2e run.

**Formatting.** Prettier is configured (`.prettierrc`) but not enforced, and several files are not Prettier-clean. Run `npx prettier --write` on the files you changed only; `npm run format` rewrites unrelated files and buries the real diff.

## Starting a new project from this base

Work through these once, in order, when the user starts their own app:

1. **Name the app.** Set `APP.name` and `APP.slug` in `src/app-config.ts`, the `<title>` in `index.html`, and `name` in `package.json`. The slug prefixes ZIP and settings filenames, the localStorage key (`<slug>-params-v1`), and the `app` field of settings files, so changing it later orphans saved state and old settings files. Update the `generator-` prefix in the filename regex in `tests/e2e/smoke.spec.ts` to the new slug.
2. **Set the printer.** `PRINT_BED` in `src/app-config.ts` drives the preview's bed outline and the "does not fit" warnings.
3. **Create the first generator.** `npm run new-generator -- <id> "<Name>"`, then follow "Writing a generator" below. Four worked references: `src/generators/rounded-tag/` (groups, `visibleWhen`, cross-field `validate`, a geometry helper, a part `quantity`), `src/generators/name-tag/` (fonts, multi-line text, colour params, and an assembly of two coloured parts), and `src/generators/display-dog/` (organic shapes from signed distance functions, a hollow split shell, hardware catalogue, validation that samples the shape, in-place or glue-on accents, `extraFiles`), and `src/generators/display-robot/` (the same kit with skin accents that cross the head split).
4. **Choose the default generator.** The default is the first generator sorted by `name`, currently "Display dog". `tests/e2e/smoke.spec.ts` drives the default through build and export (it picks floppy ears and expects the dog's part files, including `whole.stl`); the two name-tag tests select "name-tag" first, fill `Text` and `Letter height`, and upload a font. When the default changes, rewrite the first test against the new default's labels and part names.
5. **Remove the examples when they are no longer useful.** Delete `src/generators/<id>/` and `tests/unit/generators/<id>.test.ts` for `rounded-tag`, `name-tag`, `display-dog`, and `display-robot`. Nothing else depends on them: infrastructure tests use the test-only `FIXTURE` generator in `tests/unit/fixtures.ts`. Keep `src/fonts/` and `src/core/text.ts` if any generator may want lettering, `src/core/sdf.ts` if any may want organic shapes, and `src/characters/` if any may be a display character; they cost nothing until a build uses them.
6. **Deploy.** Pushing to `main` deploys through the workflow; in the repository's Pages settings, set the source to "GitHub Actions". `vite.config.ts` uses `base: "./"`, so the app works under a project subpath.

## Where to change things

| Goal | Change | Leave alone |
|---|---|---|
| New generator | `npm run new-generator`, then `src/generators/<id>/index.ts` and `build.ts` | the registry; generators are discovered by folder |
| Params, labels, defaults, grouping, validation | the generator's `index.ts` | `ParamsPanel` (it renders any spec) |
| Geometry | the generator's `build.ts` | — |
| Shape reused by two or more generators | add a helper to `src/core/geom.ts`, with a volume test in `tests/unit/core/geom.test.ts` | — |
| Organic shapes (blended, hollowed) | distance functions from `src/core/sdf.ts`, meshed with `solidFromSdf` in `src/core/geom.ts` (see `display-dog/layout.ts`) | — |
| Another display character (cat, bear, ...) | a generator folder whose layout calls `headSize` and `characterLayout`, blends its shapes onto `headCoreSdf` with `blendTerms`, and builds with `buildCharacter` (see `display-robot`, the smaller example) | `src/characters/`; the dog's and robot's tests guard it |
| Renamed or removed param key, existing links must keep working | the generator's `migrate` | `restoreSnapshot` |
| New param kind | `ParamSpec` in `src/core/types.ts`, `matchesSpec` (and range checks) in `src/core/params.ts`, `ParamField` in `src/ui/ParamsPanel.tsx`, value formatting in `src/exporters/readme.ts` | — |
| Lettering in a generator | a `font` param plus `loadFont` and `textOutline` in `build.ts` (see `name-tag`) | `src/fonts/load.ts` |
| Bundle another font | the static `.ttf` and its licence in `src/fonts/files/`, an entry in `BUNDLED_FONTS` (`src/fonts/bundled.ts`), its URL in `BUNDLED_FILES` (`src/fonts/load.ts`) | variable fonts: opentype.js flattens some to skeleton outlines |
| Parts printed together (multi-colour) | give them the same `assembly` on `Part` | the exporters and checks; they already group by assembly |
| Show parts put together, show where the model is cut | set `assembled` (a print-to-assembled `Mat4` from `src/core/mat4.ts`) on each part and return `cutPlanes` (see `display-dog/build.ts`) | `Preview`; it adds the Assembled / Print layout and Cut planes toggles when a result uses them |
| New export format | a writer in `src/exporters/formats/`, an entry (README note plus `files`) in `MESH_FORMATS` in `src/exporters/export.ts`, a test in `tests/unit/exporters/` | `ExportButtons`; every ZIP contains every format, users never choose |
| Extra files in the ZIP (instructions, BOM) | return `extraFiles` from the generator's build | the exporters |
| Rules every part must follow, bed checks | `src/core/checks.ts`, `PRINT_BED` | — |
| Preview look: lights, palette, bed, view presets | `src/ui/Preview.tsx`, `VIEW_PRESETS` in `src/ui/fit.ts` | the Z-up → Y-up wrapper (see Preview) |
| Sidebar layout and styling | `src/App.tsx`, `src/ui/styles.css` | — |
| App name, storage key, filenames | `src/app-config.ts` | hard-coded strings elsewhere |
| Build scheduling, debounce, worker protocol | `src/state/build-store.ts`, `src/build/worker-client.ts`, `src/build/run.ts` | rarely needed; these have race tests in `tests/unit/state/build-store.test.ts` and `tests/unit/build/worker-client.test.ts` |

## Writing a generator

A generator lives in `src/generators/<id>/`; the folder name must equal `id` (the registry throws otherwise). It is picked up automatically, and `tests/unit/generators/contract.test.ts` covers it without any test code: defaults validate, the default build passes the part checks with no warnings, and every part is closed (positive signed volume).

**`index.ts`** default-exports a `GeneratorDef` (`src/core/types.ts`). It is loaded on the main thread, so it must not import `manifold.ts`, `geom.ts`, or its own `build.ts`.

- `params`: `number`, `boolean`, `text`, `select`, `color`, and `font` specs. Every spec takes `key`, `label`, `default`, and optionally `group` (fieldset heading), `help` (hint under the field), and `visibleWhen(values)`. Numbers add `unit`, `min`, `max`, `integer`, and `step`; text adds `maxLength` and `multiline` (a textarea; values may contain `\n`); select adds `options`. A colour value is `#rrggbb`. A font value is `bundled:<id>` or `upload:<sha256>`; default to `DEFAULT_FONT` from `src/fonts/bundled.ts`.
- `validate(values)`: cross-field rules, returning `{ key, message }` issues (`key: null` for a general issue). It runs only after the generic checks pass, so `num`, `bool`, and `str` from `src/core/params.ts` are safe inside it. Hidden params skip range checks, so guard any rule that reads one with the same condition as its `visibleWhen` (see `hole` in `rounded-tag`).
- `exportLabel(values)`: short label for the ZIP filename, e.g. `"40x25"`.
- `migrate(raw)`: rewrites old saved values (renamed keys) before defaults fill in. Add it the moment a released param key changes; links in exported READMEs and users' URLs carry the old keys.

**`build.ts`** default-exports a `GeneratorBuild`: `(values, { wasm }) → { parts, warnings?, extraFiles? }`. Only the worker loads it, on first use.

- Wrap all geometry in `withScope((scope) => …)` and pass every WASM object you create through `scope.track(…)`. This includes intermediates of chained calls: `a.subtract(b).extrude(2)` leaks the `subtract` result. Track each step, or use the `geom.ts` helpers, which track what they create. Manifold and CrossSection objects are not garbage-collected.
- Return meshes with `meshFromManifold(manifold)` inside the scope; it copies the data out of the WASM heap.
- Parts must be in print orientation: Z-up, millimetres, a standalone part lying on z = 0. Give each a unique `name` matching `[A-Za-z0-9_-]+`; slicers show it, so name the shape ("plate", "text", "lid"), not the generator. Set `quantity` for copies (3MF places each copy, STL puts `-xN` in the filename) and `color` (`#rrggbb`) for the preview and 3MF. Each distinct colour becomes its own filament in Bambu Studio and OrcaSlicer.
- Parts that print together in place, such as a plate and its second-colour text, share an `assembly` name. They keep their coordinates; only the group as a whole must rest on z = 0, and its parts must share one quantity. 3MF writes the group as one multi-part object; STL writes `<assembly>-<part>[-xQ].stl` per part with shared coordinates.
- Multi-part models: give each piece `assembled`, the inverse of the transform that moved it into its print pose (`invertRigid` from `src/core/mat4.ts`), and the preview can show them put together. Leave it off a part that would overlap the pieces there, such as a whole-model print exported next to them. Return `cutPlanes` (four corners of a rectangle in the assembled frame, so any orientation works) to draw the cuts. Lay the print poses out side by side along x yourself; the preview draws parts at their coordinates, and the 3MF re-lays them out anyway.
- Lettering: `const font = await loadFont(str(values, "font"))` (from `src/fonts/load.ts`, cached per worker), then `textOutline({ wasm, scope }, font, { text, capHeight, lineSpacing, align })` (from `src/core/text.ts`) returns a tracked CrossSection: first baseline at y = 0, capital letters exactly `capHeight` mm tall, x = 0 at the left edge, centre, or right edge. Extrude it, or subtract it as a recess. Missing uploaded fonts and text without visible characters throw with a user-facing message.
- Throw for impossible geometry (e.g. an empty result); the message is shown to the user. Return `warnings` for printable-but-questionable output; they appear in the sidebar and the README.
- Organic shapes: write a signed distance function (negative inside) from `src/core/sdf.ts` primitives joined with `smoothUnion`, and mesh it with `solidFromSdf(geom, sdf, bounds, edgeLength, inset?)`. Run time is the SDF called at every grid point (millions of calls), so it grows with the bounds' volume and with 1/edgeLength³: keep bounds tight, expose mesh detail as a param, write primitives without temporary arrays or `Math.hypot`, and skip shapes whose box is too far to change a `smoothUnion` (`blendTerms` and `CULL_FACTOR` in `src/characters/kit.ts`). `inset` > 0 meshes the surface moved inward, which hollows a shell when subtracted. Cuts through thin curved regions leave sub-mm³ crumbs at coarse detail; `display-dog` drops pieces under 1 mm³ and warns on a second real piece. Warn rather than throw for anything the user fixes by moving something in the preview: a failed build keeps the previous result on screen, so the cut planes would not move. `sdf.ts` is pure math, so `index.ts` may import it to validate against the actual shape.
- manifold-3d docs: https://manifoldcad.org/docs/jsapi/ (`CrossSection.square/circle`, `.offset`, `.extrude`, `.revolve`; `Manifold.cube/cylinder/sphere`, `.translate`, `.rotate` in degrees, `.add`, `.subtract`, `.intersect`, `Manifold.union([...])`, `.isEmpty()`).

**Tests** go in `tests/unit/generators/<id>.test.ts`. Use the helpers in `tests/unit/generators/helpers.ts`: `buildWith(id, overrides)` runs the real worker pipeline, `totalVolume` and `signedVolume` let you compare against a closed-form volume, and `paramsFor` gives defaults plus overrides. Test each `validate` rule at its boundary and one geometric property per feature (a hole removes πr²t, a fillet removes (4 − π)r²t). See `tests/unit/generators/rounded-tag.test.ts`.

## Layout

- `src/core/` — pure logic, no React or DOM. `types.ts` (contract), `params.ts` (spec checks, `validateParams`, `isVisible`, accessors), `manifold.ts` (WASM singleton, `withScope`, `meshFromManifold`), `geom.ts` (`roundedRect`, `throughHole`, `countersunkHole`, `solidFromSdf`), `sdf.ts` (signed distance primitives, `smoothUnion`, box helpers; main-thread safe), `text.ts` (`textOutline`, worker-only), `assembly.ts` (`printGroups`), `bounds.ts`, `checks.ts` (`checkResult`: part contract and bed fit per print group), `protocol.ts`.
- `src/fonts/` — `bundled.ts` (`BUNDLED_FONTS`, `DEFAULT_FONT`, `parseFontRef`; main-thread safe), `library.ts` (uploaded fonts in IndexedDB via idb-keyval, keyed by SHA-256), `load.ts` (`loadFont`, worker-only), `files/` (Inter Regular and its OFL licence).
- `src/generators/` — one folder per generator. `index.ts` is the registry (`GENERATORS` sorted by name, `findGenerator`). `builds.ts` lazy-loads `<id>/build.ts` and is imported only by the worker.
- `src/generators/display-dog/` — `layout.ts` (params → the dog's anatomy and SDF on top of the kit's `CharacterLayout`), `index.ts`, `build.ts` (nose and inner-ear accents). Frame (shared with the robot): Z up, face toward −Y, head split at y = `split.y`; neck cut through (0, 0, `neck.z`), tilted about x by `neck.tilt` degrees (positive raises the front; `neckNormal`, `neckHeightAt`), with the peg, socket, and hollow floor following its normal. Both cuts are optional params. Ears, snout, legs, and tail are sized against `neck.anatomyZ` (the default cut height), so moving the cut never reshapes the dog. Ears sit on the head's real surface (`surfaceAlong`). With a speaker board, the ears grow (width and length together, up to 3.5×) until `seatInEar` finds a seat where the pocket, its walls, and the grille fit in ear and head: pointy and round ears hold the speaker flat across the split, grille forward, lead down the ear; floppy ears grille outward, lead straight into the head. The inner-ear accent then ends at the pocket's front face, so it is the grille wall. The ear params are minimums; there is no "no ears" option (`migrate` maps it to pointy). Pieces: `head-front`/`head-back`/`body` (both cuts), `head`/`body`, `front`/`back`, or `dog` (no cuts), plus `whole`, the uncut dog, whenever there is a cut. Halves print on the split face, the body on its base.
- `src/characters/` — the display-character kit, shared by `display-dog` and `display-robot`. `hardware.ts` (display and battery catalogue, `selectedModule`, `selectedBattery`, `turnEdge`, `toFace`, `displayParams` including the USB-C plug size, `batteryParams`, `validateDisplay`, `migrateDisplay`; main-thread safe). A `DisplayModule` is described in its own frame: u right, v toward the port edge, origin at the centre of the visible area; it carries the outline's offset from the visible area, the USB-C depth behind the glass front and offset along the edge, the free room the hollow keeps past each edge (cable plugs, a memory card), side buttons, each of which gets a Ø1.6 mm pin hole straight out through the shell (`pinHoles` in the layout), standoffs, and speakers. A board with standoffs gets a printed `spacer` part (tubes with sockets over the standoff tips, joined by a frame just in front of the head split; it prints lying on the frame), and the back half gets posts flush with its split face that press the spacer when the head closes; the battery is placed clear of tubes, posts, and frame. `speakers.ts` (main-thread safe): `SpeakerSeat` (centre, grille `normal`, long-side `up`, lead channel), `speakerPocket` (box plus clearance, R6 corners), `pocketFits` (walls around the pocket inside the solid, grille opening to the air), `channelLength`, `grillePoints`. A character picks seats and passes them to `characterLayout`; the kit cuts each pocket, a hex grille through the wall in front, and a 7 × 4.5 mm channel into the hollow (the 4-pin plug passes), and `validateCharacter` keeps the head split through every pocket so each half holds half a speaker. The dowel bosses turn away from the spacer's frame and the pockets. "USB-C faces" turns the module frame onto the face, so a rectangular board lies landscape for left or right; the face pad is centred on the visible area, and a rectangular display gets a rounded-box head instead of an ellipsoid. `kit.ts` (`headSize`: head and face from the display, with the module's `footprint` and `room` per face edge; `headCoreFor`, `usbPlugY` for characters placing features before their layout exists; `characterLayout`: cuts, dowel bosses placed on the real surface by `surfaceAlong`, port, pin holes, spacer, speaker seats; `headCoreSdf`, `blendTerms` with `CULL_FACTOR`, `placeBattery`, `validateCharacter`, `headParams`, `cutParams`, `printParams`; main-thread safe), `assemble.ts` (worker: `buildCharacter` hollows the head, cuts the face openings, adds joints, cuts the body and the accents along the same planes, lays out print poses, adds `whole`, the spacer, and the cut planes; `skinAccent` colours the outer 1.2 mm of any surface inside a region). A character supplies its outer SDF and its accent solids. Accents are clipped to the finished shell and cut with the pieces; each piece's fragments join its in-place assembly: `face` (front or uncut head), `rear` (back), `torso` (body). An accent split across pieces is named `<accent>-front`/`-back`/`-body`. Glue-on needs every accent to have `flatAt` and to stay on one piece (the dog's do; the robot offers in place or none).
- `src/generators/display-robot/` — `layout.ts` (torso, ear pods, antenna or sprout, arms, legs). With a speaker board the pods hold the speakers, grille outward, lead straight into the head; they grow until the pocket fits and stay on the split, moving back only as far as a side USB-C opening in front of them needs, and a speaker board needs pods (validation). Without speakers and with USB-C on a side, the pods move to the port's depth so the cable exits through the ear. `index.ts`, `build.ts` (accents: antenna tip as a solid region, ear pods and chest badge as skins; the pod skin is the grille wall).
- `src/build/` — `run.ts` is the worker pipeline (validate → load build → build → checks); `worker.ts` wires messages; `worker-client.ts` is the coalescing client.
- `src/state/` — `params-store.ts` (zustand), `build-store.ts` (`startBuildSync`, `useBuild`, `canExport`), `view-store.ts` (`fitPending`, `layout`, `showCuts`), `snapshot.ts` (`{generator, values}`, `restoreSnapshot`, `snapshotQuery`, `querySnapshot`), `persistence.ts` (URL and localStorage).
- `src/exporters/` — `export.ts` (`MESH_FORMATS`, `exportEntries`), `formats/stl.ts`, `formats/threemf.ts` (`modelXml`, `bambuModelSettingsXml`, `filamentNumbers`, `partsTo3mf`), `zip.ts`, `filename.ts`, `readme.ts`, `settings.ts`, `download.ts` (`downloadBlob`, `pickFile`).
- `src/App.tsx` — root layout. `src/ui/` — `ParamsPanel`, `NumberField`, `FontField` (bundled and uploaded fonts, upload/remove), `ExportButtons`, `Preview`, `fit.ts`, `geometry.ts`, `styles.css`.
- `src/app-config.ts` — `APP.name`, `APP.slug`, `PRINT_BED`.
- `scripts/new-generator.mjs` — the scaffold.
- `tests/unit/` mirrors `src/`. `tests/unit/fixtures.ts` holds `FIXTURE`, a test-only generator, and `fixtureRegistry`, which replaces the global registry via `vi.mock`. Tests of shared infrastructure (state, persistence, settings, export) use it, never a real generator, so they keep passing when the app's generators change; follow that rule when adding such tests. `tests/unit/setup.ts` serves `/src/...` asset URLs (such as the bundled font) from disk, because Node's fetch cannot load Vite's root-relative URLs. Font library tests use `fake-indexeddb`. `tests/e2e/smoke.spec.ts` covers the default dog's build and export, name-tag type → build → download → reload, and a font upload.

## How it works

**Validation.** Generic checks run first: type, finiteness, select options, and `maxLength` for every param, then `integer`/`min`/`max` for visible number params. The generator's `validate` runs only when those pass. The worker validates again before building.

**Build flow.** `startBuildSync` (called from `main.tsx`) validates on every params change and debounces a build. Only the newest change may start a build, and only the newest started build may write its result or error. `worker-client` keeps one build in flight and one waiting; a newer request replaces the waiting one, which rejects with `SupersededError`. Worker builds cannot be cancelled. A worker crash rejects the in-flight build and runs the waiting one on a fresh worker. After building, `run.ts` applies `checkResult`: contract violations fail the build, bed overflow and floating parts become warnings.

**Export.** Enabled only when the shown result was built from the current params (`canExport`). Every ZIP holds all `MESH_FORMATS` (3MF and STL), the generator's `extraFiles`, and a README with the visible params (fonts by name or hash), parts × quantity with filament number and colour, a note per format on which file to use, a reproduce URL, the file list, and warnings. Both formats work per print group (`printGroups`): a standalone part or an assembly.

- STL files sit flat at the ZIP root next to the 3MF: `<name>[-xQ].stl` per standalone part and `<assembly>-<part>[-xQ].stl` per assembly part, with shared coordinates. Part names are unique, so no numbering or folders are needed.
- 3MF writes one `<generatorId>.3mf`: a mesh object per part (with a base-material display colour if it has `color`), one component object per copy of each print group, and a build item per component object laid out along X. Each copy is its own object because Bambu Studio splits multi-instance objects from other apps and drops their per-part settings.
- `Metadata/model_settings.config` in the 3MF is Bambu Studio's and OrcaSlicer's per-object settings: object name, and per part its name and filament (`extruder`). Without it Bambu names parts after the object ("tag", "tag_2") and puts every part on filament 1. Filaments come from `filamentNumbers`: each distinct colour in order of first appearance is the next filament; uncoloured parts use filament 1. Bambu reads this file even when the 3MF was not written by Bambu. Verified with the Bambu Studio 2.7.1 CLI: `BambuStudio --outputdir <abs dir> --export-3mf out.3mf in.3mf`, then read `Metadata/model_settings.config` in the output. PrusaSlicer ignores this file; it loads each component as a separate object at the same position (from reading its 3MF importer, not tested).

**Fonts.** A font param holds a string, so URLs, settings files, and migration treat it like any other value. The worker resolves it: bundled fonts by a Vite `?url` asset URL, uploads from IndexedDB, parsed with opentype.js and cached. Uploads exist only in the browser that stored them; a link naming one elsewhere shows "missing" in the picker and fails the build with an "upload it again" message. Layout is per glyph with `charToGlyph`, because opentype.js 2.0's text shaping throws on Inter's GSUB table. Kerning comes from `getKerningValue`, which reads `kern` tables and plain GPOS pair lookups; Inter keeps its kerning in GPOS extension lookups, so Inter renders unkerned. opentype.js loads only in the worker, in the lazily loaded build chunk.

**Persistence.** The saved shape is `{generator, values}`. URLs are readable query parameters: `?g=<generator>` plus `key=value` only for values that differ from their default, or whose param sets `alwaysInLink` (`snapshotQuery`), so a default robot is `?g=display-robot&display=waveshare-s3-touch-lcd-28`; `querySnapshot` reads each value back by its param kind and still reads the original `?p=<json>` links found in older READMEs. Leaving defaults out means a link follows a default that changes later; mark a param `alwaysInLink` before changing its default, and give the generator a `migrate` that fills in the old default for links without it (the display characters' `display` does both: `migrateDisplay` in `hardware.ts` maps links without `display` to the 1.28" touch board, the default before the 2.8" board). Param keys must not be `g` or `p`. The URL wins over localStorage. Writes are debounced (300 ms) and flushed on `pagehide`; storage and `replaceState` failures are logged and never break editing. `restoreSnapshot` never throws: an unknown generator or garbage input gives defaults, missing or mistyped values take their default, unknown keys drop. Settings files add `app: APP.slug` and `version`; `parseSettingsFile` rejects foreign apps, missing or newer versions, unknown generators, and non-JSON.

**Preview.** Geometry stays Z-up. The scene wraps parts in `rotation={[-Math.PI/2, 0, 0]}` so drei's ViewCube and the display are Y-up; `toDisplay` in `fit.ts` maps `(x, y, z) → (x, z, −y)`. The camera is drei `<CameraControls>`: Fit keeps the angle (`fitToSphere`), Iso/Top/Front/Right rotate then fit. The camera frames automatically only when `fitPending` is set (startup, generator switch, settings load, layout switch), and only on a result built for the current params, never on ordinary rebuilds. When any part has `assembled`, the toolbar offers Assembled (the default: only parts with `assembled`, each moved by its matrix) and Print layout (every part as exported); the result's `cutPlanes` show as translucent orange rectangles in the assembled view, toggled by Cut planes. Both are session-only (`view-store`). Parts are flat-shaded (`toNonIndexed()` before `computeVertexNormals()`); the bed is drawn centred under the model.

## Rules

- `import type` for type-only imports (`verbatimModuleSyntax`).
- Named types in the module that owns them. Use `ComponentRef<typeof Component>` for drei refs, not `ReturnType<typeof …>`.
- Inline one-expression helpers unless they are reused, exported as a stable concept, used as a callback identity, or a type guard.
- `Record` for small static string-keyed tables; `Set`/`Map` for dynamic or non-string keys.
- `Promise.withResolvers()` over the `new Promise` executor form.
- `NumberField` keeps local string state so users can clear the field or type `5.` without the value snapping back. Don't simplify it to a plain controlled input.
- Don't add a File System Access API path; export and settings use anchor download and `<input type=file>`.
- Don't add a backend or network calls; the app must work as static files.
- No `any` and no inline casts for member access (`(x as { a: T }).a`); narrow with `in`/`typeof`. A cast to a select param's option union is fine with a one-line comment (see `align` in `name-tag/build.ts`).
- Static imports only. Dynamic `import()` belongs in the registry's `import.meta.glob` and in `vi.mock` factories, which are hoisted above static imports.
- Errors thrown from a `catch` carry `{ cause }` (ESLint `preserve-caught-error`).
- Export decisions follow the user's preference: every ZIP contains every format (no format picker), file names are short and flat, and part names describe the shape.

## Known gaps

Open items from earlier sessions; check here before re-investigating.

- Bambu Studio puts the text part on filament 2 but does not add a second filament slot to the project; the user adds it by hand. Writing `Metadata/project_settings.config` would add it, but that file also carries printer and filament presets and could override the user's.
- PrusaSlicer and OrcaSlicer imports are untested. PrusaSlicer ignores `model_settings.config` and should load each part as a separate object in place (from its source).
- Inter renders unkerned: opentype.js cannot read the GPOS extension lookups that hold Inter's kerning.
- Name tag through-cuts leave letter middles (O, A, B) as loose islands; the build warns. Stencil bridges are not implemented.
- The worker caches parsed fonts for the session, so a removed upload keeps rendering until reload. Harmless: the picker switches back to Inter.
- Nothing has been printed yet; the two-colour 3MF has only been checked through the Bambu Studio CLI.
- Display dog: the Waveshare board thicknesses (11 and 8 mm) are guesses, and the dog has not been printed; only the Bambu Studio CLI import was checked. The neck fit, dowel holes, and pocket clearance are untested on real hardware.
- Display dog: cut position and neck tilt are numeric fields; there is no dragging a plane in the preview, and the head split cannot rotate. A cut through a thin feature only warns, and the stray piece is exported as part of its piece.
- Display dog and robot: the battery is only checked to fit behind the display; nothing holds it in place (with the 2.8" board it lies inside the spacer's frame, still loose).
- Display robot: not printed; only the Bambu Studio CLI import was checked (objects face, rear, torso, whole; accents on filament 2).
- 2.8" board (`waveshare-s3-touch-lcd-28`): dimensions come from the vendor STEP model, so they are better than the 1.28" estimates, but nothing has been printed. Untested on hardware: the R6 speaker pocket corners (the speaker's own radius is unknown), whether a paperclip reaches the buttons through the Ø1.6 pin holes, whether the spacer clamps the board without rattling, and the 13 × 7 mm plug opening (sized for the user's 12.2 × 6.3 plug). Pointy speaker ears grow large (about 65 × 48 mm with default params).

## Related repo

`../lightbox` (lightbox letter generator) is where the font pipeline came from: `src/geometry/flatten.ts`, `scale.ts`, `layout.ts`, `src/fonts/`. Its exports put each shape in its own folder because a lightbox has many separate shells; this repo's generators produce few parts, so STL files stay flat. Port ideas from it deliberately, not wholesale.

## Tooling

Language servers are devDependencies (`typescript-language-server`, and `vscode-langservers-extracted` for ESLint, JSON, CSS, and HTML), so editors and agents find them in `node_modules/.bin`. `.omp/lsp.json` passes the ESLint server its settings under the empty-string section key, because the server reads them via `workspace/configuration` with `section: ""`; without them every diagnostic pull fails on `workingDirectory`. `AGENTS.md` is a symlink to this file for agents that read that name.
