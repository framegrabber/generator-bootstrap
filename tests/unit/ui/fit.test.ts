import { describe, expect, it } from "vitest";
import { boundsOf, fitView, toDisplay } from "../../../src/ui/fit";
import type { Part } from "../../../src/core/types";

function partWith(positions: number[]): Part {
  return {
    name: "p",
    mesh: { positions: new Float32Array(positions), indices: new Uint32Array(0) },
  };
}

describe("boundsOf", () => {
  it("returns null when there are no vertices", () => {
    expect(boundsOf([])).toBeNull();
  });

  it("spans all parts", () => {
    const bounds = boundsOf([partWith([0, 0, 0, 1, 2, 3]), partWith([-4, 5, 0])]);
    expect(bounds).toEqual({ min: [-4, 0, 0], max: [1, 5, 3] });
  });
});

describe("toDisplay", () => {
  it("maps Z-up geometry into the Y-up display frame", () => {
    expect(toDisplay([1, 2, 3])).toEqual([1, 3, -2]);
  });
});

describe("fitView", () => {
  it("targets the display-space centre of the bounds", () => {
    const view = fitView({ min: [0, 0, 0], max: [10, 20, 30] });
    expect(view.target).toEqual(toDisplay([5, 10, 15]));
  });

  it("places the camera outside the bounds so the whole box is in view", () => {
    const bounds = { min: [0, 0, 0] as [number, number, number], max: [40, 25, 3] as [number, number, number] };
    const view = fitView(bounds);
    const dx = view.position[0] - view.target[0];
    const dy = view.position[1] - view.target[1];
    const dz = view.position[2] - view.target[2];
    const distance = Math.hypot(dx, dy, dz);
    const radius = Math.hypot(40, 25, 3) / 2;
    expect(distance).toBeGreaterThan(radius);
  });
});
