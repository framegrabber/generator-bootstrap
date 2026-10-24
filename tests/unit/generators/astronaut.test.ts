import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { describe, expect, it } from "vitest";
import { boundsOf } from "../../../src/core/bounds";
import { getManifold, withScope, type WasmScope } from "../../../src/core/manifold";
import { validateParams } from "../../../src/core/params";
import type { Params, Part } from "../../../src/core/types";
import { findGenerator } from "../../../src/generators";
import { astronautLayout, TWIST, WALL } from "../../../src/generators/astronaut/layout";
import { buildWith, paramsFor } from "./helpers";

const ID = "astronaut";
// Coarse meshes keep the build tests fast; the fittings are exact solids at any detail.
const draft = (overrides: Params = {}): Params => ({ meshEdge: 1.2, ...overrides });

describe("astronaut head", () => {
  // The 2.8" board, landscape: glass 73.06 x 50.54, its centre 3 mm right of the visible area's
  // centre, 6 mm of plug room below, 2.5 mm wall. The face is centred on the visible area.
  const halfWidth = 73.06 / 2 + 3 + 2.5;
  const halfHeight = 50.54 / 2 + 6 + 2.5;

  it("fits the board, plus the extra margins", { timeout: 30_000 }, async () => {
    for (const [side, top] of [
      [0, 0],
      [5, 3],
    ]) {
      const result = await buildWith(ID, draft({ headMarginSide: side, headMarginTop: top }));
      const front = result.parts.find((p) => p.name === "head-front")!;
      const b = boundsOf([front.mesh])!;
      // Face down on the bed: x spans the width plus the 5 mm bosses, y the height plus the
      // 8 mm neck stem.
      expect(b.max[0] - b.min[0]).toBeCloseTo(2 * (halfWidth + side) + 10, 0);
      expect(b.max[1] - b.min[1]).toBeCloseTo(2 * (halfHeight + top) + 8, 0);
      expect(b.min[2]).toBeCloseTo(0, 3);
    }
  });
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
});

describe("astronaut fit", () => {
  it("assembles without parts or hardware colliding", { timeout: 60_000 }, async () => {
    const result = await buildWith(ID, draft());
    const L = astronautLayout(paramsFor(ID, draft()));
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
