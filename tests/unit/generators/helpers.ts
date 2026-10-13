import { runBuild } from "../../../src/build/run";
import { defaultParams } from "../../../src/core/params";
import type { GeneratorResult, Mesh, Params } from "../../../src/core/types";
import { findGenerator } from "../../../src/generators";

/** Signed volume via the divergence theorem; positive for a closed, outward-facing mesh. */
export function signedVolume(mesh: Mesh): number {
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

/** Defaults for generator `id` with `overrides` applied. */
export function paramsFor(id: string, overrides: Params = {}): Params {
  const def = findGenerator(id);
  if (!def) throw new Error(`No generator "${id}"`);
  return { ...defaultParams(def.params), ...overrides };
}

/** Runs the worker's full pipeline (validate, build, checks) for generator `id`. */
export function buildWith(id: string, overrides: Params = {}): Promise<GeneratorResult> {
  return runBuild(id, paramsFor(id, overrides));
}

/** Total printed volume: every part's volume times its quantity. */
export async function totalVolume(id: string, overrides: Params = {}): Promise<number> {
  const result = await buildWith(id, overrides);
  return result.parts.reduce((sum, p) => sum + signedVolume(p.mesh) * (p.quantity ?? 1), 0);
}
