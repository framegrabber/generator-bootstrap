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
// Primitives run millions of times per mesh: plain arithmetic, no temporary arrays, and
// Math.sqrt instead of Math.hypot (several times slower in V8).
const len3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);

export function sphere(p: Vec3, center: Vec3, radius: number): number {
  return len3(p[0] - center[0], p[1] - center[1], p[2] - center[2]) - radius;
}

/** Axis-aligned ellipsoid with semi-axes `radii`. Approximate (exact on the axes). */
export function ellipsoid(p: Vec3, center: Vec3, radii: Vec3): number {
  const [x, y, z] = [p[0] - center[0], p[1] - center[1], p[2] - center[2]];
  const [a, b, c] = radii;
  const k0 = len3(x / a, y / b, z / c);
  const k1 = len3(x / (a * a), y / (b * b), z / (c * c));
  return k1 === 0 ? -Math.min(a, b, c) : (k0 * (k0 - 1)) / k1;
}

/** Segment a–b swept by a sphere of `radius`. */
export function capsule(p: Vec3, a: Vec3, b: Vec3, radius: number): number {
  const [px, py, pz] = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const [bx, by, bz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const h = clamp((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz), 0, 1);
  return len3(px - bx * h, py - by * h, pz - bz * h) - radius;
}

/** Cone from a sphere of radius `ra` at `a` to a sphere of radius `rb` at `b`, tangent-blended. */
export function roundCone(p: Vec3, a: Vec3, b: Vec3, ra: number, rb: number): number {
  // Inigo Quilez's exact round-cone distance.
  const [bx, by, bz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const [px, py, pz] = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const l2 = bx * bx + by * by + bz * bz;
  const rr = ra - rb;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const y = px * bx + py * by + pz * bz;
  const z = y - l2;
  const [xx, xy, xz] = [px * l2 - bx * y, py * l2 - by * y, pz * l2 - bz * y];
  const x2 = xx * xx + xy * xy + xz * xz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - ra;
}

/** Axis-aligned box with half-extents `half`, every edge rounded by `radius`. */
export function roundBox(p: Vec3, center: Vec3, half: Vec3, radius: number): number {
  const qx = Math.abs(p[0] - center[0]) - half[0] + radius;
  const qy = Math.abs(p[1] - center[1]) - half[1] + radius;
  const qz = Math.abs(p[2] - center[2]) - half[2] + radius;
  const outside = len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  return outside + Math.min(Math.max(qx, qy, qz), 0) - radius;
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
  const [u, v] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
  const qu = p[u] - center[u];
  const qv = p[v] - center[v];
  const dr = Math.sqrt(qu * qu + qv * qv) - radius + edge;
  const da = Math.abs(p[axis] - center[axis]) - halfLength + edge;
  const [or, oa] = [Math.max(dr, 0), Math.max(da, 0)];
  return Math.min(Math.max(dr, da), 0) + Math.sqrt(or * or + oa * oa) - edge;
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

/** Distance from `p` to `box`; 0 inside. A lower bound on the distance to anything inside it. */
export function boxDistance(p: Vec3, box: Box3): number {
  const dx = Math.max(box.min[0] - p[0], 0, p[0] - box.max[0]);
  const dy = Math.max(box.min[1] - p[1], 0, p[1] - box.max[1]);
  const dz = Math.max(box.min[2] - p[2], 0, p[2] - box.max[2]);
  return Math.hypot(dx, dy, dz);
}
