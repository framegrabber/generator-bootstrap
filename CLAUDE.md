# CLAUDE.md

Browser-only bootstrap for parametric 3D-print generators. A generator is a folder with a typed definition (params → validate) and a build module (values → parts). Geometry runs in a Web Worker with manifold-3d; the app exports STL or 3MF in a ZIP and previews in Three.js. Everything is client-side.

## Commands

```bash
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build → dist/
npm test         # Vitest unit tests (node env)
npm run e2e      # Playwright smoke on port 5174 (run `npx playwright install chromium` once)
npm run lint     # ESLint flat config over src and tests
npm run new-generator -- <id> "<Name>"   # scaffold src/generators/<id>/
```

CI (`.github/workflows/deploy.yml`) runs lint, unit tests, build, and e2e before deploying to Pages.

Language servers are devDependencies (`typescript-language-server`, and `vscode-langservers-extracted` for ESLint, JSON, CSS, and HTML), so editors and agents find them in `node_modules/.bin`. `.omp/lsp.json` passes the ESLint server its settings under the empty-string section key, because the server reads them via `workspace/configuration` with `section: ""`; without them every diagnostic pull fails on `workingDirectory`.

## Layout

- `src/core/` — pure logic, no React or DOM. `types.ts` (contract), `params.ts` (spec checks, `validateParams`, `isVisible`), `manifold.ts` (WASM singleton, `withScope`, `meshFromManifold`), `geom.ts` (shared shapes: `roundedRect`, `throughHole`, `countersunkHole`), `bounds.ts`, `checks.ts` (`checkResult`: part contract and bed fit), `protocol.ts`.
- `src/generators/` — one folder per generator, found by `import.meta.glob`. `index.ts` holds the registry (`GENERATORS`, sorted by name, first is the default; `findGenerator`). `builds.ts` lazy-loads `<id>/build.ts` and is imported only by the worker. `rounded-tag/` is the example.
- `src/build/` — `run.ts` is the worker pipeline (validate → load build → build → checks); `worker.ts` wires messages; `worker-client.ts` is the coalescing client.
- `src/state/` — `params-store.ts` (zustand), `build-store.ts` (`startBuildSync`, `useBuild`, `canExport`), `view-store.ts` (`fitPending`), `snapshot.ts` (`{generator, values}` shape, `restoreSnapshot`), `persistence.ts` (URL `?p=` and localStorage).
- `src/exporters/` — `export.ts` (`EXPORT_FORMATS`, `exportEntries`), `formats/stl.ts`, `formats/threemf.ts`, `zip.ts` (`bundleZip`, rejects duplicate paths), `filename.ts`, `readme.ts`, `settings.ts` (`app`/`version`-tagged JSON), `download.ts`.
- `src/App.tsx` — root layout. `src/ui/` — `ParamsPanel`, `NumberField`, `ExportButtons`, `Preview`, `fit.ts` (Z-up → Y-up display mapping, view presets), `geometry.ts`.
- `src/app-config.ts` — `APP.name`, `APP.slug` (filenames, settings files, storage key), `PRINT_BED`.
- `tests/unit/` mirrors `src/`. `tests/unit/generators/contract.test.ts` runs for every generator; `helpers.ts` has `buildWith`, `totalVolume`, `signedVolume`. `tests/e2e/smoke.spec.ts` is the full type → download → reload path.

## Generator contract

A generator lives in `src/generators/<id>/`. The folder name must equal `id`; the registry throws otherwise.

- `index.ts` default-exports a `GeneratorDef`: `params` (`number`, `boolean`, `text`, `select` specs), optional `validate`, `migrate` (legacy saves), `exportLabel`. It is loaded on the main thread, so it must not import geometry code.
- `build.ts` default-exports a `GeneratorBuild` `(values, { wasm }) → { parts, warnings?, extraFiles? }`. Only the worker loads it, lazily.
- Param specs may set `group` (fieldset heading), `help`, and `visibleWhen(values)`. Numbers take `min`, `max`, `integer`, `step`, `unit`.
- Generic checks run first: type, finiteness, select options, and maxLength for every param; then integer/min/max for visible number params only. `validate` runs only when they pass, so `num`/`bool`/`str` accessors are safe inside it. Hidden params skip range checks, so `validate` must not rely on them.
- Parts are in print orientation: Z-up, millimetres, resting on z = 0. `name` matches `[A-Za-z0-9_-]+` and is unique. Optional `quantity` (whole number ≥ 1) and `color` (`#rrggbb`).
- `checkResult` turns contract violations (names, metadata, empty meshes) into build errors. Bed overflow and floating parts become warnings.
- Inside `build`, every WASM object goes through `withScope`, which deletes tracked objects on return or throw. The `geom.ts` helpers take `{ wasm, scope }` and track what they create. Copy mesh data out with `meshFromManifold` (it copies, so no WASM heap views escape).
- New generators get the contract tests for free: defaults validate, build without warnings, and every part is closed (positive signed volume).

## Export

- `EXPORT_FORMATS` maps a format id to `files(parts, generatorId) → ZipEntry[]`. Add a format there.
- STL: one file per part, `stl/NN_<name>[_xQ].stl`. 3MF: one `<generatorId>.3mf` with an object per part, a build item per copy laid out along X, and base-material display colours for parts that set `color`.
- Every ZIP also holds the generator's `extraFiles` and a README with visible params, parts × quantity, the reproduce URL, files, and warnings.

## Persistence and restore

- Saved shape is `{generator, values}`. The URL `?p=` takes precedence over localStorage (`generator-params-v1`).
- Writes are debounced (300 ms) and flushed on `pagehide`. Storage and `replaceState` failures are logged and never break editing.
- `restoreSnapshot` never throws. It falls back to defaults for an unknown generator or garbage input, and fills any missing or mistyped value from its default. Unknown keys drop.
- Settings files add `app: APP.slug` and `version`. `parseSettingsFile` rejects foreign apps, missing or newer versions, unknown generators, and non-JSON.

## Build flow

- `startBuildSync` (called from `main.tsx`) validates on every params change and debounces a build. Only the newest change may start a build, and only the newest started build may write its result or error.
- `worker-client` keeps one build in flight and one waiting. A newer request replaces the waiting one, which rejects with `SupersededError`. Worker builds cannot be cancelled. A worker crash rejects the in-flight build and runs the waiting one on a fresh worker.
- Export is enabled only when the result's key matches the current params (`canExport`).

## Preview

- Geometry stays Z-up. The scene wraps contents in `rotation={[-Math.PI/2, 0, 0]}` so the ViewCube and display are Y-up. `toDisplay` in `fit.ts` maps `(x, y, z) → (x, z, −y)`.
- Camera: drei `<CameraControls>` (yomotsu camera-controls). The toolbar offers Fit (`fitToSphere`, keeps the angle) and the Iso/Top/Front/Right presets (`rotateTo` + fit).
- Automatic framing happens only when `fitPending` is set: at startup, on generator switch, and on settings load. It frames the first result built for the current params, never a stale one, and never ordinary rebuilds.
- Parts use `color` or a palette colour. The bed (`PRINT_BED`) is drawn as an outline and grid centred under the model.
- Meshes are flat-shaded: `toNonIndexed()` before `computeVertexNormals()`.

## Rules

- `import type` for type-only imports (`verbatimModuleSyntax`).
- Named types in the module that owns them. Use `ComponentRef<typeof Component>` for drei refs, not `ReturnType<typeof …>`.
- Inline one-expression helpers unless they are reused, exported as a stable concept, used as a callback identity, or a type guard.
- `Record` for small static string-keyed tables; `Set`/`Map` for dynamic or non-string keys.
- `Promise.withResolvers()` over the `new Promise` executor form.
- `NumberField` keeps local string state so users can clear the field or type `5.` without the value snapping back. Don't simplify it to a plain controlled input.
- Don't add a File System Access API path; export and settings use anchor download and `<input type=file>`.
