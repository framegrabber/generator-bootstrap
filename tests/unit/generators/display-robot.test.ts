import { describe, expect, it } from "vitest";
import { CULL_FACTOR } from "../../../src/characters/kit";
import { validateParams } from "../../../src/core/params";
import type { Params, Part } from "../../../src/core/types";
import { findGenerator } from "../../../src/generators";
import { cullRatios, outerBounds, robotLayout } from "../../../src/generators/display-robot/layout";
import { buildWith, paramsFor, signedVolume } from "./helpers";

const ID = "display-robot";
const def = findGenerator(ID)!;
const issueKeys = (overrides: Params) =>
  validateParams(def, paramsFor(ID, overrides)).map((i) => i.key);
// Coarse meshes keep the build tests fast; the properties checked hold at any detail.
const draft = (overrides: Params = {}): Params => ({ detail: "draft", ...overrides });

describe("display-robot validate", () => {
  it("rejects USB-C on top only while an antenna is in the way", () => {
    expect(issueKeys({ usbEdge: "top" })).toContain("usbEdge");
    expect(issueKeys({ usbEdge: "top", antenna: "none" })).toEqual([]);
    expect(issueKeys({ usbEdge: "right" })).toEqual([]);
  });
});

describe("display-robot layout", () => {
  it("culls only shapes that cannot change the surface", () => {
    const shapes: Params[] = [{}, { antenna: "sprout", softness: 6, bodySize: 100 }];
    let seed = 11;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let lowest = Infinity;
    for (const overrides of shapes) {
      const L = robotLayout(paramsFor(ID, overrides));
      const { min, max } = outerBounds(L);
      for (let i = 0; i < 20_000; i++) {
        const p = [0, 1, 2].map((a) => min[a] - 10 + (max[a] - min[a] + 20) * random());
        for (const ratio of cullRatios(L, [p[0], p[1], p[2]])) lowest = Math.min(lowest, ratio);
      }
    }
    expect(lowest).toBeGreaterThanOrEqual(CULL_FACTOR);
  });
});

describe("display-robot build", { timeout: 60_000 }, () => {
  it.each([
    ["sprout antenna", { antenna: "sprout" }],
    [
      "no pods, antenna, arms, or legs",
      { earPods: false, antenna: "none", arms: false, legs: false },
    ],
    ["bare module with a cable hole", { display: "gc9a01-module" }],
    ["rectangular custom display", { display: "custom", customShape: "rect" }],
    ["USB-C on the left, tilted neck", { usbEdge: "left", neckCutTilt: -15 }],
  ])("prints with %s as single pieces resting on the bed", async (_, overrides: Params) => {
    const result = await buildWith(ID, draft(overrides));
    expect(result.warnings).toEqual([]);
    for (const part of result.parts) expect(signedVolume(part.mesh)).toBeGreaterThan(0);
  });

  it("cuts accents with the pieces and fills their recesses exactly", async () => {
    const plain = await buildWith(ID, draft({ accentMode: "none" }));
    const accented = await buildWith(ID, draft({ accentMode: "inplace" }));
    expect(accented.parts.map((p) => [p.name, p.assembly])).toEqual([
      ["head-front", "face"],
      ["head-back", "rear"],
      ["body", "torso"],
      ["antenna-ball-front", "face"],
      ["antenna-ball-back", "rear"],
      ["ear-pods-front", "face"],
      ["ear-pods-back", "rear"],
      ["chest-badge", "torso"],
      ["whole", undefined],
    ]);
    // Pieces plus accents equal the plain pieces: no gap, no overlap, and no accent filling
    // the window or the USB-C opening through the ear pod.
    const total = (parts: Part[]) =>
      parts.filter((p) => p.name !== "whole").reduce((s, p) => s + signedVolume(p.mesh), 0);
    expect(Math.abs(total(accented.parts) - total(plain.parts))).toBeLessThan(1);
  });
});
