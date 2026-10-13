import { describe, expect, it } from "vitest";
import { boundsOf } from "../../../src/core/bounds";
import { validateParams } from "../../../src/core/params";
import type { GeneratorResult, Params } from "../../../src/core/types";
import { findGenerator } from "../../../src/generators";
import { buildWith, paramsFor, signedVolume } from "./helpers";

const ID = "name-tag";
const def = findGenerator(ID)!;
const issueKeys = (overrides: Params) =>
  validateParams(def, paramsFor(ID, overrides)).map((i) => i.key);

function volumeOf(result: GeneratorResult, name: string): number {
  const part = result.parts.find((p) => p.name === name);
  if (!part) throw new Error(`no part ${name}`);
  return signedVolume(part.mesh);
}

const base = { text: "Ada\nLovelace", thickness: 3 };

describe("name-tag validate", () => {
  it("requires some text", () => {
    expect(issueKeys({ text: " \n " })).toContain("text");
  });

  it("keeps an inlay shallower than the plate", () => {
    expect(issueKeys({ mode: "embedded", inlayDepth: 3, thickness: 3 })).toContain("inlayDepth");
    expect(issueKeys({ mode: "embedded", inlayDepth: 2.8, thickness: 3 })).toEqual([]);
  });

  it("allows a cut exactly as deep as the plate, not deeper", () => {
    expect(issueKeys({ mode: "cutout", cutDepth: 3, thickness: 3 })).toEqual([]);
    expect(issueKeys({ mode: "cutout", cutDepth: 3.2, thickness: 3 })).toContain("cutDepth");
  });

  it("rejects a keyring hole taller than the smallest possible plate", () => {
    expect(issueKeys({ capHeight: 4, padding: 1, holeDiameter: 5 })).toContain("holeDiameter");
    expect(issueKeys({ capHeight: 4, padding: 1, holeDiameter: 5, hole: false })).toEqual([]);
  });
});

describe("name-tag geometry", () => {
  it("raised: the text part sits on top of the plate, in its own colour, in the plate's assembly", async () => {
    const result = await buildWith(ID, {
      ...base,
      mode: "raised",
      raisedHeight: 1,
      textColor: "#ff0000",
    });
    const [plate, text] = result.parts;
    expect([plate.name, text.name]).toEqual(["plate", "text"]);
    expect([plate.assembly, text.assembly]).toEqual(["tag", "tag"]);
    expect(text.color).toBe("#ff0000");
    expect(boundsOf([text.mesh])!.min[2]).toBeCloseTo(3, 4);
    expect(boundsOf([plate.mesh])!.min[2]).toBeCloseTo(0, 4);
  });

  it("raised: text volume grows linearly with the raised height", async () => {
    const one = volumeOf(await buildWith(ID, { ...base, raisedHeight: 1 }), "text");
    const two = volumeOf(await buildWith(ID, { ...base, raisedHeight: 2 }), "text");
    expect(two / one).toBeCloseTo(2, 3);
  });

  it("embedded: plate and inlay add up to the solid plate, and the inlay is flush with the top", async () => {
    const solid = volumeOf(await buildWith(ID, { ...base, mode: "raised" }), "plate");
    const embedded = await buildWith(ID, { ...base, mode: "embedded", inlayDepth: 0.6 });
    const total = volumeOf(embedded, "plate") + volumeOf(embedded, "text");
    expect(total).toBeCloseTo(solid, 0);
    const inlay = boundsOf([embedded.parts[1].mesh])!;
    expect(inlay.max[2]).toBeCloseTo(3, 4);
    expect(inlay.min[2]).toBeCloseTo(2.4, 4);
  });

  it("cut out: removes exactly the inlay's volume, as a single plate part", async () => {
    const solid = volumeOf(await buildWith(ID, { ...base, mode: "raised" }), "plate");
    const inlay = volumeOf(
      await buildWith(ID, { ...base, mode: "embedded", inlayDepth: 1 }),
      "text",
    );
    const cut = await buildWith(ID, { ...base, mode: "cutout", cutDepth: 1 });
    expect(cut.parts.map((p) => [p.name, p.assembly])).toEqual([["plate", undefined]]);
    expect(solid - volumeOf(cut, "plate")).toBeCloseTo(inlay, 0);
    expect(cut.warnings).toEqual([]);
  });

  it("cut out through the plate warns that letter middles fall out", async () => {
    const result = await buildWith(ID, { ...base, mode: "cutout", cutDepth: 3 });
    expect(result.warnings).toEqual([expect.stringMatching(/cut through the plate/)]);
  });
});
