import { describe, expect, it } from "vitest";
import { getManifold } from "../../../src/core/manifold";
import { defaultParams, validateParams } from "../../../src/core/params";
import type { Mesh, Params } from "../../../src/core/types";
import { roundedTag } from "../../../src/generators/rounded-tag";

function withOverrides(overrides: Params): Params {
  return { ...defaultParams(roundedTag.params), ...overrides };
}

/** Signed volume via the divergence theorem; positive for outward-facing triangles. */
function signedVolume(mesh: Mesh): number {
  const p = mesh.positions;
  const idx = mesh.indices;
  let total = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3;
    const b = idx[t + 1] * 3;
    const c = idx[t + 2] * 3;
    const triple =
      p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
      p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
      p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
    total += triple / 6;
  }
  return total;
}

async function buildVolume(overrides: Params): Promise<number> {
  const wasm = await getManifold();
  const result = await roundedTag.build(withOverrides(overrides), { wasm });
  return signedVolume(result.parts[0].mesh);
}

describe("rounded-tag validate", () => {
  it("accepts the defaults", () => {
    expect(validateParams(roundedTag, defaultParams(roundedTag.params))).toEqual([]);
  });

  it("rejects a corner radius that consumes the smaller side", () => {
    const issues = validateParams(roundedTag, withOverrides({ corner: 13 }));
    expect(issues.map((i) => i.key)).toContain("corner");
  });

  it("rejects a hole that crosses the left edge", () => {
    const issues = validateParams(roundedTag, withOverrides({ holeInset: 1 }));
    expect(issues.map((i) => i.key)).toContain("holeInset");
  });

  it("ignores hole placement when the hole is disabled", () => {
    const issues = validateParams(roundedTag, withOverrides({ hole: false, holeInset: 0 }));
    expect(issues).toEqual([]);
  });
});

describe("rounded-tag build geometry", () => {
  it("produces one part named tag with a non-empty triangle mesh", async () => {
    const wasm = await getManifold();
    const result = await roundedTag.build(defaultParams(roundedTag.params), { wasm });
    expect(result.parts.map((p) => p.name)).toEqual(["tag"]);
    expect(result.parts[0].mesh.indices.length % 3).toBe(0);
    expect(result.parts[0].mesh.indices.length).toBeGreaterThan(0);
  });

  it("matches the closed-form body volume: area * thickness", async () => {
    // 40x25 with r=4: (32*17) + 2*(32*4) + 2*(17*4) + pi*4^2 = 986.27 mm^2, x3 mm.
    const volume = await buildVolume({ hole: false, width: 40, height: 25, thickness: 3, corner: 4 });
    expect(volume).toBeGreaterThan(2958.8 * 0.99);
    expect(volume).toBeLessThan(2958.8 * 1.01);
  });

  it("removes about pi * r^2 * t when the hole is drilled", async () => {
    const solid = await buildVolume({ hole: false });
    const drilled = await buildVolume({ hole: true, holeDiameter: 4, holeInset: 6 });
    // r=2, t=3: pi * 4 * 3 = 37.7 mm^3; 48-segment polygon is ~0.4% smaller.
    expect(solid - drilled).toBeGreaterThan(36.5);
    expect(solid - drilled).toBeLessThan(38.5);
  });

  it("removes the corner-radius area difference, (4 - pi) * r^2 * t, from a square corner", async () => {
    const square = await buildVolume({ hole: false, corner: 0 });
    const rounded = await buildVolume({ hole: false, corner: 4 });
    // (4 - pi) * 16 * 3 = 41.2 mm^3
    expect(Math.abs(square - rounded - 41.2)).toBeLessThan(2);
  });
});
