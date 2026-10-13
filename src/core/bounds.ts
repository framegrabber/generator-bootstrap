import type { Mesh } from "./types";

export type Vec3 = [number, number, number];
export type Bounds = { min: Vec3; max: Vec3 };

/** Axis-aligned bounds over every vertex of `meshes`, or null when there are none. */
export function boundsOf(meshes: readonly Mesh[]): Bounds | null {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const { positions: p } of meshes) {
    for (let i = 0; i < p.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (p[i + k] < min[k]) min[k] = p[i + k];
        if (p[i + k] > max[k]) max[k] = p[i + k];
      }
    }
  }
  return min[0] === Infinity ? null : { min, max };
}
