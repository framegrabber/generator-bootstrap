import { describe, expect, it } from "vitest";
import { meshToBinaryStl } from "../../../src/core/stl";

const triangle = {
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  indices: new Uint32Array([0, 1, 2]),
};

describe("meshToBinaryStl", () => {
  it("writes header, triangle count, and one 50-byte record per triangle", () => {
    const buffer = meshToBinaryStl(triangle, "hello");
    const view = new DataView(buffer);
    expect(buffer.byteLength).toBe(84 + 50);
    expect(view.getUint32(80, true)).toBe(1);
    expect(new TextDecoder().decode(new Uint8Array(buffer, 0, 5))).toBe("hello");
  });

  it("computes a unit normal from counter-clockwise winding", () => {
    const view = new DataView(meshToBinaryStl(triangle));
    expect(view.getFloat32(84, true)).toBeCloseTo(0);
    expect(view.getFloat32(88, true)).toBeCloseTo(0);
    expect(view.getFloat32(92, true)).toBeCloseTo(1);
  });

  it("writes the three vertices after the normal", () => {
    const view = new DataView(meshToBinaryStl(triangle));
    expect(view.getFloat32(96, true)).toBeCloseTo(0);
    expect(view.getFloat32(108, true)).toBeCloseTo(1);
    expect(view.getFloat32(124, true)).toBeCloseTo(1);
  });

  it("truncates headers longer than 79 bytes so the count field is never overwritten", () => {
    const buffer = meshToBinaryStl(triangle, "x".repeat(200));
    expect(new DataView(buffer).getUint32(80, true)).toBe(1);
  });

  it("rejects index lists that do not form whole triangles", () => {
    const bad = { positions: triangle.positions, indices: new Uint32Array([0, 1]) };
    expect(() => meshToBinaryStl(bad)).toThrow(/multiple of 3/);
  });
});
