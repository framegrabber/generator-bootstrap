import { describe, expect, it } from "vitest";
import { boundsOf } from "../../../src/core/bounds";
import { validateParams } from "../../../src/core/params";
import type { Params } from "../../../src/core/types";
import { findGenerator } from "../../../src/generators";
import { buildWith, paramsFor } from "./helpers";

/** Width (x) and height (z) of the meshed head. */
async function headSize(overrides: Params): Promise<[number, number]> {
  const result = await buildWith("astronaut", { meshEdge: 1.2, ...overrides });
  const head = result.parts.find((p) => p.name === "head")!;
  const b = boundsOf([head.mesh])!;
  return [b.max[0] - b.min[0], b.max[2] - b.min[2]];
}

describe("astronaut head", () => {
  // The 2.8" board: glass 73.06 x 50.54, its centre 3 mm from the visible area's centre toward
  // USB-C, 6 mm of plug room past one long edge, 2.5 mm wall. The face is centred on the
  // visible area, so each half of the head covers the farther side.
  const long = 73.06 / 2 + 3 + 2.5;
  const short = 50.54 / 2 + 6 + 2.5;

  it(
    "fits the board landscape or portrait, plus the extra margins",
    { timeout: 30_000 },
    async () => {
      const [lw, lh] = await headSize({ screen: "landscape" });
      expect(lw).toBeCloseTo(2 * long, 0);
      expect(lh).toBeCloseTo(2 * short, 0);
      const [pw, ph] = await headSize({ screen: "portrait" });
      expect(pw).toBeCloseTo(2 * short, 0);
      expect(ph).toBeCloseTo(2 * long, 0);
      const [mw, mh] = await headSize({ screen: "landscape", headMarginSide: 5, headMarginTop: 3 });
      expect(mw).toBeCloseTo(2 * long + 10, 0);
      expect(mh).toBeCloseTo(2 * short + 6, 0);
    },
  );
});

describe("astronaut validate", () => {
  const def = findGenerator("astronaut")!;
  const issueKeys = (overrides: Params) =>
    validateParams(def, paramsFor("astronaut", overrides)).map((i) => i.key);

  it("rejects an upper volume that floats free of the lower one", () => {
    // Upper half height 22.5: an offset of 25 leaves a 2.5 mm gap between the volumes.
    expect(issueKeys({ upperOffset: 20, stackBlend: 0 })).toEqual([]);
    expect(issueKeys({ upperOffset: 25, stackBlend: 0 })).toEqual(["upperOffset"]);
    // A volume blend wider than the gap bridges it into a waist.
    expect(issueKeys({ upperOffset: 25, stackBlend: 10 })).toEqual([]);
  });
});
