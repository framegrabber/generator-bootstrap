# generator-bootstrap

**Live app: https://framegrabber.github.io/generator-bootstrap/**

A starter kit for parametric 3D-print generators that run entirely in the browser. Pick a generator, adjust its parameters, check the result in the 3D preview, and download a ZIP with a 3MF (multi-colour, with per-part filaments for Bambu Studio and OrcaSlicer), STL files, and a README that links back to the exact settings. There is no backend: geometry is built in a Web Worker with [manifold-3d](https://manifoldcad.org/) and previewed with Three.js.

## Generators

| Generator | What it makes |
|---|---|
| Display dog | A sitting dog enclosure around a small ESP32 display: head in two halves, body with a neck socket, optional speakers in the ears |
| Display robot | The same idea as a robot: helmet head with ear pods and an antenna |
| Screen astronaut | A sitting astronaut whose face is the Waveshare ESP32-S3-Touch-LCD-2.8; twist-lock helmet discs hold the head halves together |
| Name tag | Text on a rounded plate: embedded or raised in a second colour, or cut out; bundled or uploaded fonts |
| Rounded tag | A flat rounded-rectangle tag with an optional hole; the smallest example |

None of the enclosures has been printed yet; see "Known gaps" in [AGENTS.md](AGENTS.md).

Settings persist in the URL and localStorage, so a link reproduces a design. Settings can also be saved to and loaded from a file.

## Development

Requires Node 22.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (Vitest)
npm run lint
npm run build    # type-check and build to dist/
npx playwright install chromium   # once
npm run e2e      # browser smoke tests
```

## Adding a generator

```bash
npm run new-generator -- my-thing "My thing"
```

This scaffolds `src/generators/my-thing/`: `index.ts` declares the parameters and validation, `build.ts` turns values into printable parts. The app discovers the folder automatically, and a contract test checks that the defaults build closed parts that fit the bed. [AGENTS.md](AGENTS.md) is the full guide: the generator contract, geometry helpers, multi-colour assemblies, the display-character kit, and how to verify output in a slicer.

## Deployment

Every push to `main` runs lint, unit tests, the build, and the e2e tests, then deploys `dist/` to GitHub Pages (`.github/workflows/deploy.yml`). The build uses relative asset paths, so it works under any subpath.

## Licences

The bundled Inter font is under the SIL Open Font License (`src/fonts/files/`).
