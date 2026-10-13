import { describe, expect, it } from "vitest";
import { countersunkHole, roundedRect, throughHole } from "../../../src/core/geom";
import { getManifold, withScope, type WasmScope } from "../../../src/core/manifold";

const wasm = await getManifold();

describe("roundedRect", () => {
  it("spans [0, w] x [0, h] with the rounded-corner area", () => {
    withScope((scope) => {
      const rect = roundedRect({ wasm, scope }, 40, 20, 5);
      const bounds = rect.bounds();
      expect([bounds.min, bounds.max]).toEqual([
        [0, 0],
        [40, 20],
      ]);
      // Full rectangle minus the corners' excess over quarter circles; the polygonal arcs
      // cut slightly more, so allow 0.2%.
      const exact = 40 * 20 - (4 - Math.PI) * 25;
      expect(rect.area()).toBeLessThan(exact);
      expect(rect.area()).toBeGreaterThan(exact * 0.998);
    });
  });

  it("returns a sharp rectangle for radius 0", () => {
    withScope((scope) => {
      expect(roundedRect({ wasm, scope }, 10, 5, 0).area()).toBeCloseTo(50);
    });
  });
});

describe("holes", () => {
  const plate = (scope: WasmScope) => scope.track(wasm.Manifold.cube([30, 30, 6]));

  it("throughHole removes a full cylinder through the material", () => {
    withScope((scope) => {
      const hole = throughHole({ wasm, scope }, { diameter: 4, depth: 6, at: [15, 15] });
      const removed = 30 * 30 * 6 - scope.track(plate(scope).subtract(hole)).volume();
      expect(removed).toBeGreaterThan(Math.PI * 4 * 6 * 0.99);
      expect(removed).toBeLessThan(Math.PI * 4 * 6);
    });
  });

  it("countersunkHole adds a 90 degree cone at the top surface", () => {
    withScope((scope) => {
      const opts = { diameter: 4, depth: 6, at: [15, 15] as const };
      const geom = { wasm, scope };
      const plain = scope.track(plate(scope).subtract(throughHole(geom, opts))).volume();
      const sunk = scope.track(plate(scope).subtract(countersunkHole(geom, { ...opts, headDiameter: 8 }))).volume();
      // Frustum r 2 -> 4 over 2 mm, minus the 2 mm shaft already removed.
      const extra = (Math.PI * 2 * (4 + 8 + 16)) / 3 - Math.PI * 4 * 2;
      expect(plain - sunk).toBeGreaterThan(extra * 0.98);
      expect(plain - sunk).toBeLessThan(extra * 1.01);
    });
  });

  it("countersunkHole rejects a head no wider than the shaft", () => {
    withScope((scope) => {
      expect(() =>
        countersunkHole({ wasm, scope }, { diameter: 4, depth: 6, at: [0, 0], headDiameter: 4 }),
      ).toThrow(/wider than the shaft/);
    });
  });
});
