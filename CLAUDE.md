# CLAUDE.md

Starter kit for browser-only parametric 3D-print generators. Each generator is a folder: a typed definition (params, validation) and a build module (values → printable parts). Geometry runs in a Web Worker with manifold-3d. The app previews in Three.js and exports STL or 3MF in a ZIP. Everything is client-side; there is no backend.

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

## Starting a new project from this base

Work through these once, in order, when the user starts their own app:

1. **Name the app.** Set `APP.name` and `APP.slug` in `src/app-config.ts`, the `<title>` in `index.html`, and `name` in `package.json`. The slug prefixes ZIP and settings filenames, the localStorage key (`<slug>-params-v1`), and the `app` field of settings files, so changing it later orphans saved state and old settings files. Update the `generator-` prefix in the filename regex in `tests/e2e/smoke.spec.ts` to the new slug.
2. **Set the printer.** `PRINT_BED` in `src/app-config.ts` drives the preview's bed outline and the "does not fit" warnings.
3. **Create the first generator.** `npm run new-generator -- <id> "<Name>"`, then follow "Writing a generator" below. `src/generators/rounded-tag/` is the worked reference: groups, `visibleWhen`, cross-field `validate`, a geometry helper, and a part `quantity`.
4. **Choose the default generator.** The default is the first generator sorted by `name`. `tests/e2e/smoke.spec.ts` drives the default generator: it fills the `Width` and `Height` fields and expects `stl/01_tag.stl`. When the default changes, rewrite the smoke test against the new default's labels and part names.
5. **Remove the example when it is no longer useful.** Delete `src/generators/rounded-tag/` and `tests/unit/generators/rounded-tag.test.ts`. Nothing else depends on it: infrastructure tests use the test-only `FIXTURE` generator in `tests/unit/fixtures.ts`.
6. **Deploy.** Pushing to `main` deploys through the workflow; in the repository's Pages settings, set the source to "GitHub Actions". `vite.config.ts` uses `base: "./"`, so the app works under a project subpath.

## Where to change things

| Goal | Change | Leave alone |
|---|---|---|
| New generator | `npm run new-generator`, then `src/generators/<id>/index.ts` and `build.ts` | the registry; generators are discovered by folder |
| Params, labels, defaults, grouping, validation | the generator's `index.ts` | `ParamsPanel` (it renders any spec) |
| Geometry | the generator's `build.ts` | — |
| Shape reused by two or more generators | add a helper to `src/core/geom.ts`, with a volume test in `tests/unit/core/geom.test.ts` | — |
| Renamed or removed param key, existing links must keep working | the generator's `migrate` | `restoreSnapshot` |
| New param kind (e.g. colour picker) | `ParamSpec` in `src/core/types.ts`, `matchesSpec` (and range checks) in `src/core/params.ts`, `ParamField` in `src/ui/ParamsPanel.tsx`, value formatting in `src/exporters/readme.ts` | — |
| New export format | a writer in `src/exporters/formats/`, an entry in `EXPORT_FORMATS` in `src/exporters/export.ts`, a test in `tests/unit/exporters/` | `ExportButtons` (it lists `EXPORT_FORMATS`) |
| Extra files in the ZIP (instructions, BOM) | return `extraFiles` from the generator's build | the exporters |
| Rules every part must follow, bed checks | `src/core/checks.ts`, `PRINT_BED` | — |
| Preview look: lights, palette, bed, view presets | `src/ui/Preview.tsx`, `VIEW_PRESETS` in `src/ui/fit.ts` | the Z-up → Y-up wrapper (see Preview) |
| Sidebar layout and styling | `src/App.tsx`, `src/ui/styles.css` | — |
| App name, storage key, filenames | `src/app-config.ts` | hard-coded strings elsewhere |
| Build scheduling, debounce, worker protocol | `src/state/build-store.ts`, `src/build/worker-client.ts`, `src/build/run.ts` | rarely needed; these have race tests in `tests/unit/state/build-store.test.ts` and `tests/unit/build/worker-client.test.ts` |

## Writing a generator

A generator lives in `src/generators/<id>/`; the folder name must equal `id` (the registry throws otherwise). It is picked up automatically, and `tests/unit/generators/contract.test.ts` covers it without any test code: defaults validate, the default build passes the part checks with no warnings, and every part is closed (positive signed volume).

**`index.ts`** default-exports a `GeneratorDef` (`src/core/types.ts`). It is loaded on the main thread, so it must not import `manifold.ts`, `geom.ts`, or its own `build.ts`.

- `params`: `number`, `boolean`, `text`, and `select` specs. Every spec takes `key`, `label`, `default`, and optionally `group` (fieldset heading), `help` (hint under the field), and `visibleWhen(values)`. Numbers add `unit`, `min`, `max`, `integer`, and `step`; text adds `maxLength`; select adds `options`.
- `validate(values)`: cross-field rules, returning `{ key, message }` issues (`key: null` for a general issue). It runs only after the generic checks pass, so `num`, `bool`, and `str` from `src/core/params.ts` are safe inside it. Hidden params skip range checks, so guard any rule that reads one with the same condition as its `visibleWhen` (see `hole` in `rounded-tag`).
- `exportLabel(values)`: short label for the ZIP filename, e.g. `"40x25"`.
- `migrate(raw)`: rewrites old saved values (renamed keys) before defaults fill in. Add it the moment a released param key changes; links in exported READMEs and users' URLs carry the old keys.

**`build.ts`** default-exports a `GeneratorBuild`: `(values, { wasm }) → { parts, warnings?, extraFiles? }`. Only the worker loads it, on first use.

- Wrap all geometry in `withScope((scope) => …)` and pass every WASM object you create through `scope.track(…)`. This includes intermediates of chained calls: `a.subtract(b).extrude(2)` leaks the `subtract` result. Track each step, or use the `geom.ts` helpers, which track what they create. Manifold and CrossSection objects are not garbage-collected.
- Return meshes with `meshFromManifold(manifold)` inside the scope; it copies the data out of the WASM heap.
- Parts must be in print orientation: Z-up, millimetres, lying on z = 0. Give each a unique `name` matching `[A-Za-z0-9_-]+`. Set `quantity` for copies (3MF places each copy, STL puts `_xN` in the filename) and `color` (`#rrggbb`) for the preview and 3MF.
- Throw for impossible geometry (e.g. an empty result); the message is shown to the user. Return `warnings` for printable-but-questionable output; they appear in the sidebar and the README.
- manifold-3d docs: https://manifoldcad.org/docs/jsapi/ (`CrossSection.square/circle`, `.offset`, `.extrude`, `.revolve`; `Manifold.cube/cylinder/sphere`, `.translate`, `.rotate` in degrees, `.add`, `.subtract`, `.intersect`, `Manifold.union([...])`, `.isEmpty()`).

**Tests** go in `tests/unit/generators/<id>.test.ts`. Use the helpers in `tests/unit/generators/helpers.ts`: `buildWith(id, overrides)` runs the real worker pipeline, `totalVolume` and `signedVolume` let you compare against a closed-form volume, and `paramsFor` gives defaults plus overrides. Test each `validate` rule at its boundary and one geometric property per feature (a hole removes πr²t, a fillet removes (4 − π)r²t). See `tests/unit/generators/rounded-tag.test.ts`.

## Layout

- `src/core/` — pure logic, no React or DOM. `types.ts` (contract), `params.ts` (spec checks, `validateParams`, `isVisible`, accessors), `manifold.ts` (WASM singleton, `withScope`, `meshFromManifold`), `geom.ts` (`roundedRect`, `throughHole`, `countersunkHole`), `bounds.ts`, `checks.ts` (`checkResult`: part contract and bed fit), `protocol.ts`.
- `src/generators/` — one folder per generator. `index.ts` is the registry (`GENERATORS` sorted by name, `findGenerator`). `builds.ts` lazy-loads `<id>/build.ts` and is imported only by the worker.
- `src/build/` — `run.ts` is the worker pipeline (validate → load build → build → checks); `worker.ts` wires messages; `worker-client.ts` is the coalescing client.
- `src/state/` — `params-store.ts` (zustand), `build-store.ts` (`startBuildSync`, `useBuild`, `canExport`), `view-store.ts` (`fitPending`), `snapshot.ts` (`{generator, values}`, `restoreSnapshot`), `persistence.ts` (URL `?p=` and localStorage).
- `src/exporters/` — `export.ts` (`EXPORT_FORMATS`, `exportEntries`), `formats/stl.ts`, `formats/threemf.ts`, `zip.ts`, `filename.ts`, `readme.ts`, `settings.ts`, `download.ts`.
- `src/App.tsx` — root layout. `src/ui/` — `ParamsPanel`, `NumberField`, `ExportButtons`, `Preview`, `fit.ts`, `geometry.ts`, `styles.css`.
- `src/app-config.ts` — `APP.name`, `APP.slug`, `PRINT_BED`.
- `scripts/new-generator.mjs` — the scaffold.
- `tests/unit/` mirrors `src/`. `tests/unit/fixtures.ts` holds `FIXTURE`, a test-only generator, and `fixtureRegistry`, which replaces the global registry via `vi.mock`. Tests of shared infrastructure (state, persistence, settings, export) use it, never a real generator, so they keep passing when the app's generators change; follow that rule when adding such tests. `tests/e2e/smoke.spec.ts` covers type → build → download → reload.

## How it works

**Validation.** Generic checks run first: type, finiteness, select options, and `maxLength` for every param, then `integer`/`min`/`max` for visible number params. The generator's `validate` runs only when those pass. The worker validates again before building.

**Build flow.** `startBuildSync` (called from `main.tsx`) validates on every params change and debounces a build. Only the newest change may start a build, and only the newest started build may write its result or error. `worker-client` keeps one build in flight and one waiting; a newer request replaces the waiting one, which rejects with `SupersededError`. Worker builds cannot be cancelled. A worker crash rejects the in-flight build and runs the waiting one on a fresh worker. After building, `run.ts` applies `checkResult`: contract violations fail the build, bed overflow and floating parts become warnings.

**Export.** Enabled only when the shown result was built from the current params (`canExport`). STL writes one file per part, `stl/NN_<name>[_xQ].stl`. 3MF writes one `<generatorId>.3mf` with an object per part, a build item per copy laid out along X, and display colours for parts with `color`. Every ZIP also holds the generator's `extraFiles` and a README with the visible params, parts × quantity, a reproduce URL, the file list, and warnings.

**Persistence.** The saved shape is `{generator, values}`. The URL `?p=` wins over localStorage. Writes are debounced (300 ms) and flushed on `pagehide`; storage and `replaceState` failures are logged and never break editing. `restoreSnapshot` never throws: an unknown generator or garbage input gives defaults, missing or mistyped values take their default, unknown keys drop. Settings files add `app: APP.slug` and `version`; `parseSettingsFile` rejects foreign apps, missing or newer versions, unknown generators, and non-JSON.

**Preview.** Geometry stays Z-up. The scene wraps parts in `rotation={[-Math.PI/2, 0, 0]}` so drei's ViewCube and the display are Y-up; `toDisplay` in `fit.ts` maps `(x, y, z) → (x, z, −y)`. The camera is drei `<CameraControls>`: Fit keeps the angle (`fitToSphere`), Iso/Top/Front/Right rotate then fit. The camera frames automatically only when `fitPending` is set (startup, generator switch, settings load), and only on a result built for the current params, never on ordinary rebuilds. Parts are flat-shaded (`toNonIndexed()` before `computeVertexNormals()`); the bed is drawn centred under the model.

## Rules

- `import type` for type-only imports (`verbatimModuleSyntax`).
- Named types in the module that owns them. Use `ComponentRef<typeof Component>` for drei refs, not `ReturnType<typeof …>`.
- Inline one-expression helpers unless they are reused, exported as a stable concept, used as a callback identity, or a type guard.
- `Record` for small static string-keyed tables; `Set`/`Map` for dynamic or non-string keys.
- `Promise.withResolvers()` over the `new Promise` executor form.
- `NumberField` keeps local string state so users can clear the field or type `5.` without the value snapping back. Don't simplify it to a plain controlled input.
- Don't add a File System Access API path; export and settings use anchor download and `<input type=file>`.
- Don't add a backend or network calls; the app must work as static files.

## Tooling

Language servers are devDependencies (`typescript-language-server`, and `vscode-langservers-extracted` for ESLint, JSON, CSS, and HTML), so editors and agents find them in `node_modules/.bin`. `.omp/lsp.json` passes the ESLint server its settings under the empty-string section key, because the server reads them via `workspace/configuration` with `section: ""`; without them every diagnostic pull fails on `workingDirectory`. `AGENTS.md` is a symlink to this file for agents that read that name.
