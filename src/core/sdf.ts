/**
 * Signed distance functions for organic shapes. Pure math, no WASM: safe on the main thread
 * (validation can sample them) and in the worker, where `solidFromSdf` in geom.ts meshes them.
 *
 * Convention: negative inside, positive outside, in millimetres. Primitives marked
 * "approximate" return a value with the right sign and zero set but not the exact distance;
 * that is enough for meshing and smooth blending, not for measuring wall thickness.
 */
export type Vec3 = readonly [number, number, number];
export type Sdf = (p: Vec3) => number;
/** Axis-aligned box, the extent of a shape. */
export type Box3 = { min: Vec3; max: Vec3 };

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / length(a));
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function sphere(p: Vec3, center: Vec3, radius: number): number {
  return length(sub(p, center)) - radius;
}

/** Axis-aligned ellipsoid with semi-axes `radii`. Approximate (exact on the axes). */
export function ellipsoid(p: Vec3, center: Vec3, radii: Vec3): number {
  const q = sub(p, center);
  const k0 = Math.hypot(q[0] / radii[0], q[1] / radii[1], q[2] / radii[2]);
  const k1 = Math.hypot(q[0] / radii[0] ** 2, q[1] / radii[1] ** 2, q[2] / radii[2] ** 2);
  return k1 === 0 ? -Math.min(...radii) : (k0 * (k0 - 1)) / k1;
}

/** Segment a–b swept by a sphere of `radius`. */
export function capsule(p: Vec3, a: Vec3, b: Vec3, radius: number): number {
  const pa = sub(p, a);
  const ba = sub(b, a);
  const h = clamp(dot(pa, ba) / dot(ba, ba), 0, 1);
  return length(sub(pa, scale(ba, h))) - radius;
}

/** Cone from a sphere of radius `ra` at `a` to a sphere of radius `rb` at `b`, tangent-blended. */
export function roundCone(p: Vec3, a: Vec3, b: Vec3, ra: number, rb: number): number {
  // Inigo Quilez's exact round-cone distance.
  const ba = sub(b, a);
  const l2 = dot(ba, ba);
  const rr = ra - rb;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pa = sub(p, a);
  const y = dot(pa, ba);
  const z = y - l2;
  const x = sub(scale(pa, l2), scale(ba, y));
  const x2 = dot(x, x);
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - ra;
}

/** Axis-aligned box with half-extents `half`, every edge rounded by `radius`. */
export function roundBox(p: Vec3, center: Vec3, half: Vec3, radius: number): number {
  const q = [0, 1, 2].map((i) => Math.abs(p[i] - center[i]) - half[i] + radius);
  const outside = Math.hypot(...q.map((v) => Math.max(v, 0)));
  return outside + Math.min(Math.max(q[0], q[1], q[2]), 0) - radius;
}

/**
 * Cylinder along axis `axis` (0 = x, 1 = y, 2 = z) with `radius`, half-length `halfLength`,
 * both rims rounded by `edge`.
 */
export function roundCylinder(
  p: Vec3,
  center: Vec3,
  axis: 0 | 1 | 2,
  radius: number,
  halfLength: number,
  edge: number,
): number {
  const q = sub(p, center);
  const [u, v] = [0, 1, 2].filter((i) => i !== axis);
  const dr = Math.hypot(q[u], q[v]) - radius + edge;
  const da = Math.abs(q[axis]) - halfLength + edge;
  return Math.min(Math.max(dr, da), 0) + Math.hypot(Math.max(dr, 0), Math.max(da, 0)) - edge;
}

/**
 * Union of two distances with a fillet of roughly `k` mm where they meet (polynomial smooth
 * minimum). `k` = 0 is a plain union.
 */
export function smoothUnion(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
}

/** The smallest box containing every box in `boxes`, grown by `margin` on every side. */
export function unionBox(boxes: readonly Box3[], margin = 0): Box3 {
  const lo = (i: number) => Math.min(...boxes.map((b) => b.min[i])) - margin;
  const hi = (i: number) => Math.max(...boxes.map((b) => b.max[i])) + margin;
  return { min: [lo(0), lo(1), lo(2)], max: [hi(0), hi(1), hi(2)] };
}

/** Box around a point, grown by `half` (a number or per-axis half-extents). */
export function boxAround(center: Vec3, half: number | Vec3): Box3 {
  const h: Vec3 = typeof half === "number" ? [half, half, half] : half;
  return { min: sub(center, h), max: add(center, h) };
}
