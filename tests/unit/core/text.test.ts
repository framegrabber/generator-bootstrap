import { describe, expect, it } from "vitest";
import { getManifold, withScope } from "../../../src/core/manifold";
import { textOutline, type TextOptions } from "../../../src/core/text";
import { loadFont } from "../../../src/fonts/load";

const wasm = await getManifold();
const font = await loadFont("bundled:inter");

/** Runs textOutline and copies out the numbers, so nothing escapes the WASM scope. */
function measure(options: TextOptions) {
  return withScope((scope) => {
    const outline = textOutline({ wasm, scope }, font, options);
    const { min, max } = outline.bounds();
    return { min, max, area: outline.area() };
  });
}

describe("textOutline", () => {
  it("scales the font so capital letters are exactly capHeight tall, baseline at y = 0", () => {
    const { min, max } = measure({ text: "H", capHeight: 10 });
    expect(min[1]).toBeCloseTo(0, 2);
    expect(max[1]).toBeCloseTo(10, 2);
  });

  it("keeps the counters of letters open", () => {
    const solid = measure({ text: "I", capHeight: 20 });
    const ring = measure({ text: "O", capHeight: 20 });
    // An "O" is mostly hole: its filled area is far below its bounding box area.
    const [w, h] = [ring.max[0] - ring.min[0], ring.max[1] - ring.min[1]];
    expect(ring.area).toBeLessThan(w * h * 0.5);
    expect(solid.area).toBeGreaterThan(0);
  });

  it("stacks lines downwards by the font's line height times lineSpacing", () => {
    const one = measure({ text: "H\nH", capHeight: 10, lineSpacing: 1 });
    const two = measure({ text: "H\nH", capHeight: 10, lineSpacing: 2 });
    const gap1 = 10 - one.min[1];
    const gap2 = 10 - two.min[1];
    // Second line's baseline drops by one more line height when the spacing doubles.
    expect(gap2 - gap1).toBeCloseTo(gap1 - 10, 1);
    expect(one.max[1]).toBeCloseTo(10, 2);
  });

  it("aligns lines left, centre, or right around x = 0", () => {
    const text = "HHHH\nH";
    const left = measure({ text, capHeight: 10, align: "left" });
    const center = measure({ text, capHeight: 10, align: "center" });
    const right = measure({ text, capHeight: 10, align: "right" });
    expect(left.min[0]).toBeGreaterThanOrEqual(0);
    expect(right.max[0]).toBeLessThanOrEqual(0);
    expect(center.min[0]).toBeCloseTo(-center.max[0], 0);
  });

  it("renders every letter, digit, and common punctuation as a valid outline", () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789&@#?!.,:;-+()'\"/ÄÖÜäöüß€";
    for (const ch of chars) {
      expect(measure({ text: ch, capHeight: 10 }).area, `glyph ${ch}`).toBeGreaterThan(0);
    }
  });

  it("throws for text without visible characters", () => {
    expect(() => measure({ text: " \n ", capHeight: 10 })).toThrow(/no visible characters/);
  });
});
