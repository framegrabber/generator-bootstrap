import type { Part } from "../core/types";

export type Vec3 = [number, number, number];
export type Bounds = { min: Vec3; max: Vec3 };
export type FitView = { target: Vec3; position: Vec3 };

export function boundsOf(parts: readonly Part[]): Bounds | null {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) {
    const p = part.mesh.positions;
    for (let i = 0; i < p.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (p[i + k] < min[k]) min[k] = p[i + k];
        if (p[i + k] > max[k]) max[k] = p[i + k];
      }
    }
  }
  return min[0] === Infinity ? null : { min, max };
}

/**
 * Geometry is Z-up; the preview wraps it in a -90deg X rotation so drei's gizmo (Y-up) works.
 * That rotation maps geometry (x, y, z) to display (x, z, -y).
 */
export function toDisplay([x, y, z]: Vec3): Vec3 {
  return [x, z, -y];
}

/** Camera target and position (display space) that frame `bounds` in a `fovDeg` view. */
export function fitView(bounds: Bounds, fovDeg = 35): FitView {
  const { min, max } = bounds;
  const center: Vec3 = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const diagonal = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const radius = Math.max(diagonal / 2, 1);
  const distance = (radius / Math.sin((fovDeg * Math.PI) / 360)) * 1.1;

  const target = toDisplay(center);
  const dirLength = Math.hypot(0.7, 0.55, 1);
  const dir: Vec3 = [0.7 / dirLength, 0.55 / dirLength, 1 / dirLength];
  const position: Vec3 = [
    target[0] + dir[0] * distance,
    target[1] + dir[1] * distance,
    target[2] + dir[2] * distance,
  ];
  return { target, position };
}
