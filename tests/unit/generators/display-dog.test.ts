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
import { boundsOf } from "../../../src/core/bounds";
import { applyPoint, transformBounds } from "../../../src/core/mat4";
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

  it("keeps the head split behind the display pocket", () => {
    const limit = dogLayout(paramsFor(ID)).pocketBack + 0.5;
    expect(issueKeys({ headSplitOffset: limit })).toEqual([]);
    expect(issueKeys({ headSplitOffset: limit - 0.1 })).toContain("headSplitOffset");
    expect(issueKeys({ headSplitOffset: limit - 0.1, headSplit: false })).toEqual([]);
  });

  it("keeps the neck cut below the display", () => {
    const L = dogLayout(paramsFor(ID));
    // The head's hollow floor sits wall + 2 above the cut and must stay a wall below the display.
    const limit = L.cz - L.footprint.bottom - L.wall - (L.wall + 2) - L.neck.anatomyZ;
    expect(issueKeys({ neckCutOffset: Math.floor(limit) })).toEqual([]);
    expect(issueKeys({ neckCutOffset: limit + 0.1 })).toContain("neckCutOffset");
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
    let lowest = Infinity;
    for (const overrides of shapes) {
      const L = dogLayout(paramsFor(ID, overrides));
      const { min, max } = outerBounds(L);
      for (let i = 0; i < 20_000; i++) {
        const p = [0, 1, 2].map((a) => min[a] - 10 + (max[a] - min[a] + 20) * random());
        for (const ratio of cullRatios(L, [p[0], p[1], p[2]])) lowest = Math.min(lowest, ratio);
      }
    }
    expect(lowest).toBeGreaterThanOrEqual(CULL_FACTOR);
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
    ['2.8" board, USB-C on the left', { display: "waveshare-s3-touch-lcd-28", usbEdge: "left" }],
    ['2.8" board, USB-C on top', { display: "waveshare-s3-touch-lcd-28", usbEdge: "top" }],
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
        .filter((p) => !["head-back", "body", "whole"].includes(p.name))
        .reduce((s, p) => s + signedVolume(p.mesh), 0);
    expect(accented.parts.map((p) => [p.name, p.assembly])).toEqual([
      ["head-front", "face"],
      ["head-back", undefined],
      ["body", undefined],
      ["nose", "face"],
      ["inner-ear-left", "face"],
      ["inner-ear-right", "face"],
      ["whole", undefined],
    ]);
    // Head front plus accents equals the uncut head front: no gap, no overlap.
    expect(Math.abs(total(accented.parts) - total(plain.parts))).toBeLessThan(0.5);
  });

  it.each([
    [{ neckCut: true, headSplit: true }, ["head-front", "head-back", "body", "whole"]],
    [{ neckCut: true, headSplit: false }, ["head", "body", "whole"]],
    [{ neckCut: false, headSplit: true }, ["front", "back", "whole"]],
    [{ neckCut: false, headSplit: false }, ["dog"]],
  ])("cuts %o into %o", async (cuts, names) => {
    const result = await buildWith(ID, draft({ ...cuts, accentMode: "none" }));
    expect(result.parts.map((p) => p.name)).toEqual(names);
    expect(result.cutPlanes?.map((p) => p.name)).toEqual(
      [cuts.neckCut && "Neck cut", cuts.headSplit && "Head split"].filter(Boolean),
    );
  });

  it("places the pieces back together into the whole dog's shape", async () => {
    const result = await buildWith(ID, draft({ neckCut: false, accentMode: "none" }));
    const pieces = result.parts.filter((p) => p.assembled);
    const whole = result.parts.find((p) => p.name === "whole");
    expect(pieces.map((p) => p.name)).toEqual(["front", "back"]);
    const size = (b: { min: number[]; max: number[] }) => b.max.map((v, i) => v - b.min[i]);
    const placed = pieces.map((p) => transformBounds(p.assembled!, boundsOf([p.mesh])!));
    const union = {
      min: [0, 1, 2].map((k) => Math.min(...placed.map((b) => b.min[k]))),
      max: [0, 1, 2].map((k) => Math.max(...placed.map((b) => b.max[k]))),
    };
    // Same size as the uncut dog, standing on the bed with its face toward -y.
    size(union).forEach((v, i) => expect(v).toBeCloseTo(size(boundsOf([whole!.mesh])!)[i], 1));
    expect(union.min[2]).toBeCloseTo(0, 3);
    const front = transformBounds(pieces[0].assembled!, boundsOf([pieces[0].mesh])!);
    expect(front.max[1]).toBeCloseTo(0, 3);
  });

  it("tilts the neck cut: the body's top lies on the tilted plane, front and back", async () => {
    const tilt = -15; // raises the back; a positive tilt this steep would reach the display
    const overrides = { neckCutTilt: tilt, tail: "none" };
    const L = dogLayout(paramsFor(ID, overrides));
    const result = await buildWith(ID, draft(overrides));
    const part = result.parts.find((p) => p.name === "body")!;
    const body = part.mesh.positions;
    const slope = Math.tan((tilt * Math.PI) / 180);
    // Height above the tilted plane z = neck.z - y·tan(tilt); the cut face sits exactly on it.
    let [highest, frontTop, backTop] = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < body.length; i += 3) {
      // Back from the print layout's shift into the assembled frame.
      const [, y, z] = applyPoint(part.assembled!, [body[i], body[i + 1], body[i + 2]]);
      highest = Math.max(highest, z + y * slope - L.neck.z);
      if (y < -5) frontTop = Math.max(frontTop, z);
      if (y > 5) backTop = Math.max(backTop, z);
    }
    expect(highest).toBeCloseTo(0, 2);
    expect(backTop).toBeGreaterThan(frontTop);
  });

  it("stands an unsplit head on its tilted peg", async () => {
    const result = await buildWith(
      ID,
      draft({ neckCutTilt: -20, headSplit: false, accentMode: "none" }),
    );
    expect(result.parts.map((p) => p.name)).toEqual(["head", "body", "whole"]);
    // The only warning is the expected one about the closed head; the head rests on the bed.
    expect(result.warnings).toEqual([
      "The head is not split, so the display cannot be fitted after printing.",
    ]);
    const head = boundsOf([result.parts[0].mesh])!;
    expect(head.min[2]).toBeCloseTo(0, 3);
  });

  it("moves the neck cut by its offset: the body grows by the same height", async () => {
    // No tail: a cut this low would catch the curled tail's tip, which correctly fails.
    const height = async (offset: number) => {
      const result = await buildWith(ID, draft({ neckCutOffset: offset, tail: "none" }));
      const body = result.parts.find((p) => p.name === "body")!;
      return boundsOf([body.mesh])!.max[2];
    };
    expect((await height(-1)) - (await height(-4))).toBeCloseTo(3, 3);
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
