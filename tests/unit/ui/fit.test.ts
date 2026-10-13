import { describe, expect, it } from "vitest";
import { displayBounds, toDisplay } from "../../../src/ui/fit";

describe("toDisplay", () => {
  it("maps Z-up geometry into the Y-up display frame", () => {
    expect(toDisplay([1, 2, 3])).toEqual([1, 3, -2]);
  });
});

describe("displayBounds", () => {
  it("keeps min <= max on every axis after the -y flip", () => {
    const shown = displayBounds({ min: [0, 5, 1], max: [10, 20, 30] });
    expect(shown).toEqual({ min: [0, 1, -20], max: [10, 30, -5] });
  });
});
