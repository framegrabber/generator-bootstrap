import { describe, expect, it } from "vitest";
import { solidFromSdf } from "../../../src/core/geom";
import { getManifold, withScope } from "../../../src/core/manifold";
import {
  capsule,
  ellipsoid,
  roundBox,
  roundCone,
  roundCylinder,
  smoothUnion,
  sphere,
  unionBox,
} from "../../../src/core/sdf";

const wasm = await getManifold();

describe("primitives", () => {
  it("sphere is the exact distance to the surface", () => {
    expect(sphere([13, 4, 5], [1, 0, 2], 5)).toBeCloseTo(13 - 5);
    expect(sphere([1, 0, 2], [1, 0, 2], 5)).toBe(-5);
  });

  it("ellipsoid is zero on each semi-axis and negative at the centre", () => {
    const c = [1, 2, 3] as const;
    const r = [10, 4, 6] as const;
    expect(ellipsoid([11, 2, 3], c, r)).toBeCloseTo(0);
    expect(ellipsoid([1, -2, 3], c, r)).toBeCloseTo(0);
    expect(ellipsoid([1, 2, 9], c, r)).toBeCloseTo(0);
    expect(ellipsoid(c, c, r)).toBe(-4);
    expect(ellipsoid([12, 2, 3], c, r)).toBeGreaterThan(0);
  });

  it("capsule measures from the nearest point of its segment", () => {
    expect(capsule([3, 0, 5], [0, 0, 0], [0, 0, 10], 1)).toBeCloseTo(2);
    expect(capsule([0, 0, 14], [0, 0, 0], [0, 0, 10], 1)).toBeCloseTo(3);
  });

  it("roundCone has its end radii at its end points and tapers between", () => {
    const [a, b] = [
      [0, 0, 0],
      [0, 0, 20],
    ] as const;
    expect(roundCone([0, 0, -6], a, b, 6, 2)).toBeCloseTo(0);
    expect(roundCone([0, 0, 22], a, b, 6, 2)).toBeCloseTo(0);
    // Halfway up, the surface lies between the two radii.
    expect(roundCone([5.9, 0, 10], a, b, 6, 2)).toBeGreaterThan(0);
    expect(roundCone([2.1, 0, 10], a, b, 6, 2)).toBeLessThan(0);
  });

  it("roundBox is exact on faces and rounds its corners by the radius", () => {
    expect(roundBox([12, 0, 0], [0, 0, 0], [10, 5, 3], 1)).toBeCloseTo(2);
    // The corner point of the sharp box lies outside a rounded one by r(√3 - 1).
    expect(roundBox([10, 5, 3], [0, 0, 0], [10, 5, 3], 1)).toBeCloseTo(Math.sqrt(3) - 1);
  });

  it("roundCylinder runs along the chosen axis with rounded rims", () => {
    // Axis y, radius 10, half-length 4, rims rounded by 1.
    expect(roundCylinder([0, 4, 5], [0, 0, 0], 1, 10, 4, 1)).toBeCloseTo(0);
    expect(roundCylinder([0, 0, 10], [0, 0, 0], 1, 10, 4, 1)).toBeCloseTo(0);
    expect(roundCylinder([0, 5, 0], [0, 0, 0], 1, 10, 4, 1)).toBeCloseTo(1);
    // The sharp rim corner lies outside the rounded rim by r(√2 - 1).
    expect(roundCylinder([10, 4, 0], [0, 0, 0], 1, 10, 4, 1)).toBeCloseTo(Math.SQRT2 - 1);
  });
});

describe("smoothUnion", () => {
  it("is a plain union when the shapes are further apart than k", () => {
    expect(smoothUnion(3, 10, 4)).toBe(3);
    expect(smoothUnion(-2, 5, 0)).toBe(-2);
  });

  it("adds material where the shapes are within k of each other", () => {
    expect(smoothUnion(1, 1, 4)).toBeCloseTo(0);
    expect(smoothUnion(2, 3, 4)).toBeLessThan(2);
  });
});

describe("solidFromSdf", () => {
  it("meshes a rounded box to its closed-form volume", () => {
    const [hx, hy, hz, r] = [10, 6, 4, 2];
    const [a, b, c] = [2 * (hx - r), 2 * (hy - r), 2 * (hz - r)];
    const exact =
      a * b * c +
      2 * r * (a * b + b * c + c * a) +
      Math.PI * r * r * (a + b + c) +
      (4 / 3) * Math.PI * r ** 3;
    withScope((scope) => {
      const solid = solidFromSdf(
        { wasm, scope },
        (p) => roundBox(p, [0, 0, 0], [hx, hy, hz], r),
        unionBox([{ min: [-hx, -hy, -hz], max: [hx, hy, hz] }], 2),
        0.5,
      );
      expect(solid.volume()).toBeGreaterThan(exact * 0.99);
      expect(solid.volume()).toBeLessThan(exact * 1.01);
    });
  });

  it("insets the surface by the requested distance", () => {
    withScope((scope) => {
      const ball = (p: readonly [number, number, number]) => sphere(p, [0, 0, 0], 10);
      const bounds = { min: [-12, -12, -12], max: [12, 12, 12] } as const;
      const inner = solidFromSdf({ wasm, scope }, ball, bounds, 0.5, 2);
      const exact = (4 / 3) * Math.PI * 8 ** 3;
      expect(inner.volume()).toBeGreaterThan(exact * 0.98);
      expect(inner.volume()).toBeLessThan(exact * 1.01);
    });
  });
});
