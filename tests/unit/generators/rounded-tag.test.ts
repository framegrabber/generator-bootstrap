import { describe, expect, it } from "vitest";
import { validateParams } from "../../../src/core/params";
import type { Params } from "../../../src/core/types";
import { findGenerator } from "../../../src/generators";
import { buildWith, paramsFor, totalVolume } from "./helpers";

const ID = "rounded-tag";
const def = findGenerator(ID)!;
const issueKeys = (overrides: Params) =>
  validateParams(def, paramsFor(ID, overrides)).map((i) => i.key);

describe("rounded-tag validate", () => {
  it("rejects a corner radius that consumes the smaller side", () => {
    expect(issueKeys({ corner: 13 })).toContain("corner");
  });

  it("rejects a hole that crosses the left edge", () => {
    expect(issueKeys({ holeInset: 1 })).toContain("holeInset");
  });

  it("ignores hole placement and hole ranges when the hole is disabled", () => {
    expect(issueKeys({ hole: false, holeInset: 0, holeDiameter: 0 })).toEqual([]);
  });
});

describe("rounded-tag build geometry", () => {
  it("matches the closed-form body volume: area * thickness", async () => {
    // 40x25 with r=4: (32*17) + 2*(32*4) + 2*(17*4) + pi*4^2 = 986.27 mm^2, x3 mm.
    const volume = await totalVolume(ID, { hole: false, width: 40, height: 25, thickness: 3 });
    expect(volume).toBeGreaterThan(2958.8 * 0.99);
    expect(volume).toBeLessThan(2958.8 * 1.01);
  });

  it("removes about pi * r^2 * t when the hole is drilled", async () => {
    const solid = await totalVolume(ID, { hole: false });
    const drilled = await totalVolume(ID, { hole: true, holeDiameter: 4, holeInset: 6 });
    // r=2, t=3: pi * 4 * 3 = 37.7 mm^3; 48-segment polygon is ~0.3% smaller.
    expect(solid - drilled).toBeGreaterThan(36.5);
    expect(solid - drilled).toBeLessThan(38.5);
  });

  it("removes the corner-radius area difference, (4 - pi) * r^2 * t, from a square corner", async () => {
    const square = await totalVolume(ID, { hole: false, corner: 0 });
    const rounded = await totalVolume(ID, { hole: false, corner: 4 });
    // (4 - pi) * 16 * 3 = 41.2 mm^3
    expect(Math.abs(square - rounded - 41.2)).toBeLessThan(2);
  });

  it("emits the requested number of copies as the part quantity", async () => {
    const result = await buildWith(ID, { copies: 3 });
    expect(result.parts.map((p) => [p.name, p.quantity])).toEqual([["tag", 3]]);
  });
});
