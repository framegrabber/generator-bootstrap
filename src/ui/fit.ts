import type { Bounds, Vec3 } from "../core/bounds";

/**
 * Geometry is Z-up; the preview wraps it in a -90deg X rotation so drei's gizmo (Y-up) works.
 * That rotation maps geometry (x, y, z) to display (x, z, -y).
 */
export function toDisplay([x, y, z]: Vec3): Vec3 {
  return [x, z, -y];
}

/** Geometry-space bounds as display-space bounds (the -y flip swaps which corner is min). */
export function displayBounds({ min, max }: Bounds): Bounds {
  return { min: [min[0], min[2], -max[1]], max: [max[0], max[2], -min[1]] };
}

export type ViewPreset = "iso" | "top" | "front" | "right";

/**
 * camera-controls spherical angles in display space: azimuth around +Y from +Z, polar from +Y.
 * Display +Z is geometry -Y, so "front" looks at the model from geometry -Y, as slicers do.
 */
export const VIEW_PRESETS: Record<ViewPreset, { label: string; azimuth: number; polar: number }> = {
  iso: { label: "Iso", azimuth: Math.PI / 4, polar: Math.PI / 3 },
  top: { label: "Top", azimuth: 0, polar: 0 },
  front: { label: "Front", azimuth: 0, polar: Math.PI / 2 },
  right: { label: "Right", azimuth: Math.PI / 2, polar: Math.PI / 2 },
};
