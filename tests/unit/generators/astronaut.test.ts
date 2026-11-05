import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { describe, expect, it } from "vitest";
import { boundsOf } from "../../../src/core/bounds";
import { getManifold, withScope, type WasmScope } from "../../../src/core/manifold";
import { validateParams } from "../../../src/core/params";
import type { Params, Part } from "../../../src/core/types";
import { findGenerator } from "../../../src/generators";
import {
  astronautLayout,
  chestSurface,
  TWIST,
  WALL,
} from "../../../src/generators/astronaut/layout";
import { buildWith, paramsFor } from "./helpers";

const ID = "astronaut";
// Coarse meshes keep the build tests fast; the fittings are exact solids at any detail.
const draft = (overrides: Params = {}): Params => ({ meshEdge: 1.2, ...overrides });

describe("astronaut head", () => {
  // The 2.8" board: glass 50.54 x 73.06 (the long side toward USB-C), its centre 3 mm toward
  // USB-C from the visible area's centre, 6 mm of plug room past its long sides, 2.5 mm wall.
  // The face is centred on the visible area.
  it.each([
    ["landscape", 73.06 / 2 + 3 + 2.5, 50.54 / 2 + 6 + 2.5],
    ["portrait", 50.54 / 2 + 6 + 2.5, 73.06 / 2 + 3 + 2.5],
  ])(
    "fits the board %s, plus the extra margins",
    { timeout: 30_000 },
    async (screen, halfWidth, halfHeight) => {
      for (const [side, top] of [
        [0, 0],
        [5, 3],
      ]) {
        const result = await buildWith(
          ID,
          draft({ screen, headMarginSide: side, headMarginTop: top }),
        );
        const front = result.parts.find((p) => p.name === "head-front")!;
        const b = boundsOf([front.mesh])!;
        // Face down on the bed: x spans the width plus the 5 mm bosses, y the height plus the
        // 8 mm neck.
        expect(b.max[0] - b.min[0]).toBeCloseTo(2 * (halfWidth + side) + 10, 0);
        expect(b.max[1] - b.min[1]).toBeCloseTo(2 * (halfHeight + top) + 8, 0);
        expect(b.min[2]).toBeCloseTo(0, 3);
      }
    },
  );
});

describe("astronaut validate", () => {
  const def = findGenerator(ID)!;
  const issueKeys = (overrides: Params) =>
    validateParams(def, paramsFor(ID, overrides)).map((i) => i.key);

  it("rejects an upper volume that floats free of the lower one", () => {
    // Upper half height 22.5: an offset of 25 leaves a 2.5 mm gap between the volumes.
    expect(issueKeys({ upperOffset: 20, stackBlend: 0 })).toEqual([]);
    expect(issueKeys({ upperOffset: 25, stackBlend: 0 })).toEqual(["upperOffset"]);
    // A volume blend wider than the gap bridges it into a waist.
    expect(issueKeys({ upperOffset: 25, stackBlend: 10 })).toEqual([]);
  });

  it("keeps the helmet discs on the flat part of the head's sides", () => {
    // Half height 33.77; the R11.5 discs need corners of at most 33.77 - 12.5 = 21.3 mm,
    // 63 % of the half height.
    expect(issueKeys({ headCorner: 60 })).toEqual([]);
    expect(issueKeys({ headCorner: 66 })).toEqual(["earSize"]);
  });

  it("needs a flat back for the speakers and the discs", () => {
    expect(issueKeys({ headBackRound: 20 })).toEqual([]);
    expect(issueKeys({ headBackRound: 60 })).toContain("headBackRound");
  });

  it("keeps the body under a portrait neck and lets Forward move it", () => {
    const layout = (overrides: Params) => astronautLayout(paramsFor(ID, overrides));
    const landscape = layout({});
    const portrait = layout({ screen: "portrait" });
    // The neck stands on the plug, 9.67 mm behind the face, and the body sits under it as it
    // sits under the landscape neck.
    expect(portrait.neck.y).toBeCloseTo(2.5 + 7.17, 5);
    expect(portrait.body.cy - portrait.neck.y).toBeCloseTo(landscape.body.cy - landscape.neck.y, 5);
    expect(issueKeys({ screen: "portrait" })).toEqual([]);
    // Forward moves the volume in portrait too.
    const back = layout({ screen: "portrait", upperForward: -10 });
    expect(portrait.body.upper.center[1] - back.body.upper.center[1]).toBeCloseTo(-9, 5);
    // Moved 2 mm further back, the socket breaks out of the chest's front ...
    expect(issueKeys({ screen: "portrait", upperForward: -3 })).toEqual(["upperForward"]);
    // ... unless the chest is deeper: 60 mm moved 10 mm back puts the head on top of it.
    expect(issueKeys({ screen: "portrait", upperDepth: 60, upperForward: -10 })).toEqual([]);
  });
});

describe("astronaut fit", () => {
  it.each(["landscape", "portrait"])(
    "assembles %s without parts or hardware colliding",
    { timeout: 60_000 },
    async (screen) => {
      const result = await buildWith(ID, draft({ screen }));
      const L = astronautLayout(paramsFor(ID, draft({ screen })));
      const wasm = await getManifold();
      withScope((scope) => {
        const t = <T extends { delete(): void }>(x: T) => scope.track(x);
        const placed = result.parts.map(
          (part) => [part.name, assembledSolid(wasm, scope, part)] as const,
        );
        const overlap = (a: Manifold, b: Manifold) => t(a.intersect(b)).volume();
        for (let i = 0; i < placed.length; i++) {
          for (let j = i + 1; j < placed.length; j++) {
            const [[a, sa], [b, sb]] = [placed[i], placed[j]];
            expect(overlap(sa, sb), `${a} x ${b}`).toBeLessThan(0.5);
          }
        }
        // The module (glass outline with its R2 corners, from the glass front to the standoff
        // tips) and the speakers on the back wall fit their spaces.
        const { glass, cz, depth } = L.head;
        const outline = t(
          t(wasm.CrossSection.square([2 * glass.hx - 4, 2 * glass.hz - 4], true)).offset(
            2,
            "Round",
            2,
            32,
          ),
        );
        const module = t(
          t(t(outline.extrude(10)).rotate([-90, 0, 0])).translate([glass.cx, WALL, cz + glass.cz]),
        );
        const speakers = L.speakers.map((s) =>
          t(t(wasm.Manifold.cube([20, 5.5, 30], true)).translate([s.x, depth - WALL - 2.75, s.z])),
        );
        const halves = placed.filter(([name]) => name.startsWith("head-")).map(([, s]) => s);
        const head = t(wasm.Manifold.union(halves));
        expect(overlap(head, module), "module").toBeLessThan(0.5);
        for (const s of speakers) expect(overlap(head, s), "speaker").toBeLessThan(0.5);
      });
    },
  );

  it("centres the speaker grilles on the back", { timeout: 30_000 }, async () => {
    const result = await buildWith(ID, draft());
    const L = astronautLayout(paramsFor(ID, draft()));
    const { hw, hh, cz, depth, backRadius } = L.head;
    const wasm = await getManifold();
    withScope((scope) => {
      const t = <T extends { delete(): void }>(x: T) => scope.track(x);
      const back = assembledSolid(
        wasm,
        scope,
        result.parts.find((p) => p.name === "head-back")!,
      );
      // The flat middle of the back wall, where the grille holes go, mirrored about x = 0.
      const [fx, fz] = [hw - backRadius - WALL, hh - backRadius - WALL];
      const slab = t(
        t(wasm.Manifold.cube([2 * fx, WALL, 2 * fz], true)).translate([0, depth - WALL / 2, cz]),
      );
      const wall = t(back.intersect(slab));
      const mirrored = t(wall.mirror([1, 0, 0]));
      expect(t(wall.subtract(mirrored)).volume()).toBeLessThan(0.5);
    });
  });

  it("twists the helmet discs on and locks them", { timeout: 60_000 }, async () => {
    const result = await buildWith(ID, draft());
    const L = astronautLayout(paramsFor(ID, draft()));
    const { cz } = L.head;
    const wasm = await getManifold();
    withScope((scope) => {
      const t = <T extends { delete(): void }>(x: T) => scope.track(x);
      const solid = (name: string) =>
        assembledSolid(
          wasm,
          scope,
          result.parts.find((p) => p.name === name)!,
        );
      const head = t(wasm.Manifold.union([solid("head-front"), solid("head-back")]));
      for (const [name, s] of [
        ["disc-left", -1],
        ["disc-right", 1],
      ] as const) {
        const disc = solid(name);
        // The disc turned `turn` degrees back from locked (anticlockwise seen from outside)
        // and `out` mm off the head.
        const overlap = (turn: number, out: number) => {
          const centred = t(disc.translate([0, -L.seamY, -cz]));
          const moved = t(t(centred.rotate([s * turn, 0, 0])).translate([s * out, L.seamY, cz]));
          return t(moved.intersect(head)).volume();
        };
        // On: straight in with the notches over the hooks, then the clockwise turn, which
        // draws the disc the last `rise` onto the head.
        for (const out of [8, 4, 2, 1]) {
          expect(overlap(TWIST.turn, TWIST.rise + out), `${name} in at ${out}`).toBeLessThan(0.5);
        }
        for (const f of [1, 0.75, 0.5, 0.25, 0]) {
          expect(overlap(TWIST.turn * f, TWIST.rise * f), `${name} turn ${f}`).toBeLessThan(0.5);
        }
        // Short of the notches, the hooks hold it: pulled 1 mm off, locked or half-turned.
        expect(overlap(0, 1), `${name} pulled locked`).toBeGreaterThan(2);
        expect(
          overlap(TWIST.turn / 2, TWIST.rise / 2 + 1),
          `${name} pulled mid-turn`,
        ).toBeGreaterThan(2);
      }
    });
  });

  it.each(["landscape", "portrait"])(
    "twists the head onto the body (%s) and locks it",
    { timeout: 60_000 },
    async (screen) => {
      const result = await buildWith(ID, draft({ screen }));
      const L = astronautLayout(paramsFor(ID, draft({ screen })));
      const wasm = await getManifold();
      withScope((scope) => {
        const t = <T extends { delete(): void }>(x: T) => scope.track(x);
        const solid = (name: string) =>
          assembledSolid(
            wasm,
            scope,
            result.parts.find((p) => p.name === name)!,
          );
        const body = solid("body");
        const shell = ["head-front", "head-back", "disc-left", "disc-right"].map(solid);
        // In portrait a 12.2 x 6.3 USB-C plug, 25 mm from the port to the end of its strain
        // relief, hangs from the board's bottom edge through the neck and turns with the head.
        const { usb } = L;
        const plug = t(
          t(wasm.Manifold.cube([12.2, 6.3, 25], true)).translate([usb.x, usb.y, usb.z - 12.5]),
        );
        if (L.portrait) {
          for (const s of shell) expect(t(plug.intersect(s)).volume(), "plug").toBeLessThan(0.5);
        }
        const head = t(wasm.Manifold.union(L.portrait ? [...shell, plug] : shell));
        const [x, y] = [L.neck.x, L.neck.y];
        // The head turned `turn` degrees back from locked (anticlockwise seen from above)
        // about the neck and lifted `up` mm off the body.
        const overlap = (turn: number, up: number) => {
          const centred = t(head.translate([-x, -y, 0]));
          const moved = t(t(centred.rotate([0, 0, turn])).translate([x, y, up]));
          return t(moved.intersect(body)).volume();
        };
        for (const up of [8, 4, 2, 1]) {
          expect(overlap(TWIST.turn, TWIST.rise + up), `in at ${up}`).toBeLessThan(0.5);
        }
        for (const f of [1, 0.75, 0.5, 0.25, 0]) {
          expect(overlap(TWIST.turn * f, TWIST.rise * f), `turn ${f}`).toBeLessThan(0.5);
        }
        expect(overlap(0, 1), "pulled locked").toBeGreaterThan(2);
        expect(overlap(TWIST.turn / 2, TWIST.rise / 2 + 1), "pulled mid-turn").toBeGreaterThan(2);
      });
    },
  );

  it(
    "leads the portrait cable down the body and out under the base",
    { timeout: 30_000 },
    async () => {
      const values = draft({ screen: "portrait" });
      const result = await buildWith(ID, values);
      const L = astronautLayout(paramsFor(ID, values));
      const wasm = await getManifold();
      withScope((scope) => {
        const t = <T extends { delete(): void }>(x: T) => scope.track(x);
        const body = assembledSolid(
          wasm,
          scope,
          result.parts.find((p) => p.name === "body")!,
        );
        // A 4 mm cable from the plug's end straight down to 2 mm above the bed, then back
        // along the bed past the body.
        const { x, y } = L.neck;
        const down = t(t(wasm.Manifold.cylinder(L.usb.z - 25 - 2, 2, 2, 24)).translate([x, y, 2]));
        const back = body.boundingBox().max[1] + 5;
        const along = t(
          t(t(wasm.Manifold.cylinder(back - y, 2, 2, 24)).rotate([-90, 0, 0])).translate([x, y, 2]),
        );
        expect(t(down.intersect(body)).volume(), "down").toBeLessThan(0.1);
        expect(t(along.intersect(body)).volume(), "along").toBeLessThan(0.1);
      });
    },
  );

  it.each(["rounded", "circle", "hexagon", "shield"])(
    "seats a %s badge in its recess, lettering on its face",
    { timeout: 30_000 },
    async (patchShape) => {
      const values = draft({ patchShape, patchText: "FR" });
      const result = await buildWith(ID, values);
      const L = astronautLayout(paramsFor(ID, values));
      const byName = (name: string) => result.parts.find((p) => p.name === name);
      expect(byName("badge")?.assembly).toBe("patch");
      expect(byName("letters")?.assembly).toBe("patch");
      const wasm = await getManifold();
      withScope((scope) => {
        const t = <T extends { delete(): void }>(x: T) => scope.track(x);
        const solid = (name: string) => assembledSolid(wasm, scope, byName(name)!);
        const [body, badge, letters] = ["body", "badge", "letters"].map(solid);
        const overlap = (shift: [number, number, number]) =>
          t(t(badge.translate(shift)).intersect(body)).volume();
        // In the recess: clear of the body, but its back on the floor and its rim 0.2 mm from
        // the walls, so a 0.3 mm nudge back, sideways, or up meets the body.
        expect(overlap([0, 0, 0])).toBeLessThan(0.1);
        expect(t(letters.intersect(body)).volume(), "letters").toBeLessThan(0.1);
        for (const shift of [
          [0, 0.3, 0],
          [0.3, 0, 0],
          [-0.3, 0, 0],
          [0, 0, 0.3],
          [0, 0, -0.3],
        ] as [number, number, number][]) {
          expect(overlap(shift), `nudged ${shift.join(",")}`).toBeGreaterThan(0.01);
        }
        // It stands out of the chest without turning into a slab, and the lettering stands on
        // its face, inside its outline (both as printed: back on the bed, face up).
        const [chest] = chestSurface(L, [[0, L.patch!.z]]);
        expect(badge.boundingBox().min[1]).toBeLessThan(chest - 0.5);
        const b = boundsOf([byName("badge")!.mesh])!;
        const l = boundsOf([byName("letters")!.mesh])!;
        expect(b.max[2] - b.min[2]).toBeLessThan(3);
        expect(l.min[2]).toBeCloseTo(b.max[2], 3);
        expect(l.min[0]).toBeGreaterThan(b.min[0]);
        expect(l.max[0]).toBeLessThan(b.max[0]);
        expect(l.min[1]).toBeGreaterThan(b.min[1]);
        expect(l.max[1]).toBeLessThan(b.max[1]);
      });
    },
  );
});

/** A part as a Manifold in the assembled frame. */
function assembledSolid(wasm: ManifoldToplevel, scope: WasmScope, part: Part): Manifold {
  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: part.mesh.positions,
    triVerts: part.mesh.indices,
  });
  const solid = scope.track(new wasm.Manifold(mesh));
  return scope.track(solid.transform(part.assembled!));
}
