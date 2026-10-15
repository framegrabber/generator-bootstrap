import type { Bounds, Vec3 } from "./bounds";

/**
 * Rigid transform as a column-major 4x4 matrix, the layout manifold-3d's `transform` and
 * three.js's `Matrix4.fromArray` both read. Pure math, main-thread safe.
 */
export type Mat4 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function translation([x, y, z]: Readonly<Vec3>): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

/** Rotation about the X axis by `degrees`, counter-clockwise looking down +X. */
export function rotationX(degrees: number): Mat4 {
  // Exact for multiples of 90 so print poses land exactly on z = 0.
  const turns = degrees / 90;
  const exact = Number.isInteger(turns);
  const c = exact ? [1, 0, -1, 0][((turns % 4) + 4) % 4] : Math.cos((degrees * Math.PI) / 180);
  const s = exact ? [0, 1, 0, -1][((turns % 4) + 4) % 4] : Math.sin((degrees * Math.PI) / 180);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}

/** a · b: applies b first, then a. */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) out[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
    }
  }
  return out as Mat4;
}

/** Inverse of a rotation-plus-translation matrix: transpose the rotation, undo the move. */
export function invertRigid(m: Mat4): Mat4 {
  const [t0, t1, t2] = [m[12], m[13], m[14]];
  const out: Mat4 = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1];
  out[12] = -(out[0] * t0 + out[4] * t1 + out[8] * t2);
  out[13] = -(out[1] * t0 + out[5] * t1 + out[9] * t2);
  out[14] = -(out[2] * t0 + out[6] * t1 + out[10] * t2);
  return out;
}

export function applyPoint(m: Mat4, [x, y, z]: Readonly<Vec3>): Vec3 {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

/** Axis-aligned bounds of a transformed box (exact for 90-degree rotations). */
export function transformBounds(m: Mat4, { min, max }: Bounds): Bounds {
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
    applyPoint(m, [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]]),
  );
  const pick = (f: (...v: number[]) => number) =>
    [0, 1, 2].map((k) => f(...corners.map((c) => c[k]))) as Vec3;
  return { min: pick(Math.min), max: pick(Math.max) };
}
