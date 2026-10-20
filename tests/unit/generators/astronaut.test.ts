import { describe, expect, it } from "vitest";
import { boundsOf } from "../../../src/core/bounds";
import type { Params } from "../../../src/core/types";
import { buildWith } from "./helpers";

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
