# CLAUDE.md

Browser-only bootstrap for parametric 3D-print generators. A generator is a typed definition (params → validate → build → parts). Geometry runs in a Web Worker with manifold-3d; the app exports binary STL files in a ZIP and previews in Three.js. Everything is client-side.

## Commands

```bash
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build → dist/
npm test         # Vitest unit tests (node env)
npm run e2e      # Playwright smoke on port 5174 (run `npx playwright install chromium` once)
npm run lint     # ESLint flat config over src and tests
```

## Layout

- `src/core/` — pure logic, no React or DOM. `types.ts` (contract), `params.ts` (spec checks, `validateParams`), `manifold.ts` (WASM singleton, `withScope`, `meshFromManifold`), `stl.ts`, `protocol.ts`.
- `src/generators/` — `index.ts` registry (`GENERATORS`, `findGenerator`); one folder per generator. `rounded-tag/` is the example.
- `src/build/` — `worker.ts` runs `build` off the main thread; `worker-client.ts` is the request/response client.
- `src/state/` — `params-store.ts` (zustand), `snapshot.ts` (`{generator, values}` shape, `restoreSnapshot`), `persistence.ts` (URL `?p=` and localStorage).
- `src/exporters/` — `zip.ts` (`bundleZip`, rejects duplicate paths), `filename.ts`, `readme.ts`, `settings.ts` (`app`/`version`-tagged JSON), `download.ts`.
- `src/App.tsx` — root layout. `src/ui/` — `ParamsPanel`, `NumberField`, `ExportButtons`, `Preview`, `fit.ts` (bounds, Z-up → Y-up display mapping, camera fit).
- `src/app-config.ts` — `APP.name`, `APP.slug` (used in filenames and settings files).
- `tests/unit/` mirrors `src/`. `tests/e2e/smoke.spec.ts` is the full type → download → reload path.

## Generator contract

A `GeneratorDef` (in `src/core/types.ts`) declares `params` (`number`, `boolean`, `text`, `select` specs), an optional `validate`, an optional `migrate` for legacy saves, an optional `exportLabel`, and `build(values, { wasm })`.

- Generic checks run first (type, finiteness, min/max, maxLength, select options). `validate` runs only when they pass, so `num`/`bool`/`str` accessors are safe inside it.
- `build` returns `{ parts: [{ name, mesh }], warnings?, extraFiles? }`. Part names feed ZIP paths `stl/NN_<name>.stl`.
- Inside `build`, every WASM object goes through `withScope`, which deletes tracked objects on return or throw. Copy mesh data out with `meshFromManifold` (it copies, so no WASM heap views escape).

## Persistence and restore

- Saved shape is `{generator, values}`. The URL `?p=` takes precedence over localStorage (`generator-params-v1`).
- `restoreSnapshot` never throws. It falls back to defaults for an unknown generator or garbage input, and fills any missing or mistyped value from its default. Unknown keys drop.
- Settings files add `app: APP.slug` and a version. `parseSettingsFile` rejects foreign apps, unknown generators, and non-JSON.

## Build flow

One worker, serial builds. Each request has an id, and the newest request wins. Export is enabled only when the result matches the current params. Worker builds cannot be cancelled. The promise rejects on worker error, and the UI resets its busy state in a `finally`.

## Preview

- Geometry stays Z-up. The scene wraps contents in `rotation={[-Math.PI/2, 0, 0]}` so the ViewCube and display are Y-up. `toDisplay` in `fit.ts` maps `(x, y, z) → (x, z, −y)`.
- The camera fits only on the first geometry, on generator switch, on settings load, and on the Fit action. Never on every rebuild.
- Meshes are flat-shaded: `toNonIndexed()` before `computeVertexNormals()`.

## Rules

- `import type` for type-only imports (`verbatimModuleSyntax`).
- Named types in the module that owns them. Use `ComponentRef<typeof Component>` for drei refs, not `ReturnType<typeof …>`.
- Inline one-expression helpers unless they are reused, exported as a stable concept, used as a callback identity, or a type guard.
- `Record` for small static string-keyed tables; `Set`/`Map` for dynamic or non-string keys.
- `NumberField` keeps local string state so users can clear the field or type `5.` without the value snapping back. Don't simplify it to a plain controlled input.
- Don't add a File System Access API path; export and settings use anchor download and `<input type=file>`.
