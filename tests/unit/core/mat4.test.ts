import { describe, expect, it } from "vitest";
import {
  applyPoint,
  invertRigid,
  multiply,
  rotationX,
  transformBounds,
  translation,
} from "../../../src/core/mat4";

describe("mat4", () => {
  it("rotates about X counter-clockwise: +Y goes to +Z at 90 degrees, exactly", () => {
    expect(applyPoint(rotationX(90), [0, 1, 0])).toEqual([0, 0, 1]);
    expect(applyPoint(rotationX(-90), [0, 1, 0])).toEqual([0, 0, -1]);
    expect(applyPoint(rotationX(180), [1, 2, 3])).toEqual([1, -2, -3]);
  });

  it("composes right to left: multiply(a, b) applies b first", () => {
    const m = multiply(translation([0, 0, 5]), rotationX(90));
    expect(applyPoint(m, [0, 1, 0])).toEqual([0, 0, 6]);
  });

  it("inverts a rigid transform back to the starting point", () => {
    const m = multiply(translation([3, -4, 5]), rotationX(-90));
    const p = [1.5, 2, -7] as const;
    const back = applyPoint(invertRigid(m), applyPoint(m, p));
    back.forEach((v, i) => expect(v).toBeCloseTo(p[i]));
  });

  it("transforms bounds through their corners", () => {
    const box = { min: [0, 0, 0], max: [10, 20, 30] } as {
      min: [number, number, number];
      max: [number, number, number];
    };
    expect(transformBounds(rotationX(90), box)).toEqual({ min: [0, -30, 0], max: [10, 0, 20] });
  });
});
