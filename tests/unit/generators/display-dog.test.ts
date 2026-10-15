import { describe, expect, it } from "vitest";
import { validateParams } from "../../../src/core/params";
import type { Params } from "../../../src/core/types";
import { findGenerator } from "../../../src/generators";
import {
  CULL_FACTOR,
  cullRatios,
  dogLayout,
  outerBounds,
} from "../../../src/generators/display-dog/layout";
import { buildWith, paramsFor, signedVolume } from "./helpers";

const ID = "display-dog";
const def = findGenerator(ID)!;
const issueKeys = (overrides: Params) =>
  validateParams(def, paramsFor(ID, overrides)).map((i) => i.key);
// Coarse meshes keep the build tests fast; the properties checked hold at any detail.
const draft = (overrides: Params = {}): Params => ({ detail: "draft", ...overrides });
const volumeOf = async (overrides: Params, part: string) => {
  const result = await buildWith(ID, draft(overrides));
  const found = result.parts.find((p) => p.name === part);
  if (!found) throw new Error(`no part ${part}`);
  return signedVolume(found.mesh);
};
/** Area of the regular polygon manifold uses for a circle of radius r. */
const polygonArea = (r: number, segments: number) =>
  (segments / 2) * r * r * Math.sin((2 * Math.PI) / segments);

describe("display-dog validate", () => {
  const custom = { display: "custom", customShape: "round", customDiameter: 40 };

  it("needs a lip of at least 1 mm around a custom display's visible area", () => {
    expect(issueKeys({ ...custom, customViewDiameter: 39 })).toEqual([]);
    expect(issueKeys({ ...custom, customViewDiameter: 39.2 })).toContain("customViewDiameter");
  });

  it("limits a custom rectangle's corner radius to half its shorter side", () => {
    const rect = { display: "custom", customShape: "rect", customWidth: 40, customHeight: 30 };
    expect(issueKeys({ ...rect, customCorner: 15 })).toEqual([]);
    expect(issueKeys({ ...rect, customCorner: 15.5 })).toContain("customCorner");
  });

  it("rejects a battery the head cannot hold, until the head is deep enough", () => {
    const big = { display: "waveshare-s3-touch-lcd-128", battery: "503035" };
    expect(issueKeys({ ...big, headDepth: 50 })).toContain("battery");
    expect(issueKeys({ ...big, headDepth: 60 })).toEqual([]);
    expect(issueKeys({ ...big, headDepth: 50, battery: "none" })).toEqual([]);
  });
});

describe("display-dog layout", () => {
  it("culls only shapes that cannot change the surface", () => {
    // outerSdf skips a shape when CULL_FACTOR x its box distance proves it too far away to
    // blend; that is only exact if every shape's distance stays above that fraction.
    const shapes: Params[] = [
      {},
      { earStyle: "floppy", tail: "wag", earWidth: 24 },
      { earStyle: "round", earWidth: 24, earLength: 8, display: "gc9a01-module" },
      { earWidth: 8, earLength: 30, earSpread: 45, softness: 8, bodySize: 100, snout: 8 },
    ];
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const overrides of shapes) {
      const L = dogLayout(paramsFor(ID, overrides));
      const { min, max } = outerBounds(L);
      for (let i = 0; i < 20_000; i++) {
        const p = [0, 1, 2].map((a) => min[a] - 10 + (max[a] - min[a] + 20) * random());
        for (const ratio of cullRatios(L, [p[0], p[1], p[2]])) {
          expect(ratio).toBeGreaterThanOrEqual(CULL_FACTOR);
        }
      }
    }
  });
});

describe("display-dog build", { timeout: 60_000 }, () => {
  it.each([
    [
      "floppy ears, wagging tail, glued accents",
      { earStyle: "floppy", tail: "wag", accentMode: "glue" },
    ],
    [
      "round ears on the bare module",
      { earStyle: "round", display: "gc9a01-module", tail: "stub" },
    ],
    ["no ears, no snout, no legs", { earStyle: "none", snout: 0, frontLegs: false, tail: "none" }],
    [
      "rectangular custom display, wide ears",
      { display: "custom", customShape: "rect", earSpread: 45 },
    ],
    [
      "USB on top of a deep head",
      { display: "waveshare-s3-lcd-128", usbEdge: "top", headDepth: 120 },
    ],
  ])("prints %s as single pieces resting on the bed", async (_, overrides: Params) => {
    // runBuild fails on loose pieces and warns about parts off the bed.
    const result = await buildWith(ID, draft(overrides));
    expect(result.warnings).toEqual([]);
    for (const part of result.parts) expect(signedVolume(part.mesh)).toBeGreaterThan(0);
  });

  it("puts in-place accents exactly into their recesses", async () => {
    const plain = await buildWith(ID, draft({ accentMode: "none" }));
    const accented = await buildWith(ID, draft({ accentMode: "inplace" }));
    const total = (parts: typeof plain.parts) =>
      parts
        .filter((p) => p.name !== "head-back" && p.name !== "body")
        .reduce((s, p) => s + signedVolume(p.mesh), 0);
    expect(accented.parts.map((p) => [p.name, p.assembly])).toEqual([
      ["head-front", "face"],
      ["head-back", undefined],
      ["body", undefined],
      ["nose", "face"],
      ["inner-ear-left", "face"],
      ["inner-ear-right", "face"],
    ]);
    // Head front plus accents equals the uncut head front: no gap, no overlap.
    expect(Math.abs(total(accented.parts) - total(plain.parts))).toBeLessThan(0.5);
  });

  it("sizes the neck socket to the peg plus the fit clearance", async () => {
    const L = dogLayout(paramsFor(ID, draft()));
    const tight = await volumeOf({ fit: 0 }, "body");
    const loose = await volumeOf({ fit: 0.4 }, "body");
    const { pegRadius, pegLength } = L.neck;
    // The socket runs pegLength + 0.5 deep into the body below the neck cut.
    const expected =
      (polygonArea(pegRadius + 0.4, 96) - polygonArea(pegRadius, 96)) * (pegLength + 0.5);
    expect(tight - loose).toBeGreaterThan(expected * 0.98);
    expect(tight - loose).toBeLessThan(expected * 1.02);
  });

  it("cuts the window to the visible diameter through the front wall", async () => {
    // No snout: it sits just below the window, so it would move with the window size.
    const custom = {
      display: "custom",
      customShape: "round",
      customDiameter: 40,
      accentMode: "none",
      snout: 0,
    };
    const small = await volumeOf({ ...custom, customViewDiameter: 30 }, "head-front");
    const large = await volumeOf({ ...custom, customViewDiameter: 34 }, "head-front");
    const wall = paramsFor(ID).wall as number;
    const expected = (polygonArea(17, 96) - polygonArea(15, 96)) * wall;
    expect(small - large).toBeGreaterThan(expected * 0.98);
    expect(small - large).toBeLessThan(expected * 1.02);
  });
});
