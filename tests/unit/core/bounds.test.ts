import { describe, expect, it } from "vitest";
import { boundsOf } from "../../../src/core/bounds";

const mesh = (positions: number[]) => ({
  positions: new Float32Array(positions),
  indices: new Uint32Array(0),
});

describe("boundsOf", () => {
  it("returns null when there are no vertices", () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([mesh([])])).toBeNull();
  });

  it("spans all meshes", () => {
    expect(boundsOf([mesh([0, 0, 0, 1, 2, 3]), mesh([-4, 5, 0])])).toEqual({
      min: [-4, 0, 0],
      max: [1, 5, 3],
    });
  });
});
