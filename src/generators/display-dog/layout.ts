import { bool, num, str } from "../../core/params";
import {
  add,
  boxAround,
  capsule,
  cross,
  dot,
  ellipsoid,
  normalize,
  roundCone,
  scale,
  sub,
  unionBox,
  type Box3,
  type Sdf,
  type Vec3,
} from "../../core/sdf";
import type { Params } from "../../core/types";
import {
  CULL_FACTOR,
  blendTerms,
  characterLayout,
  headBounds,
  headCoreSdf,
  headSize,
  termBounds,
  termRatios,
  type CharacterLayout,
  type Term,
} from "../../characters/kit";

/**
 * Everything about the dog that follows from its params, in the character kit's frame (see
 * src/characters/kit.ts): head, face, cuts, and joints from the kit; body, ears, snout, legs,
 * and tail here. Pure math, so index.ts can validate with it and build.ts meshes it.
 */

/** Material left behind an inner-ear accent, toward the split plane. */
export const EAR_ACCENT_FLOOR = 0.8;
/** How far the body ellipsoid reaches below the bed before the flat cut. */
const BASE_SINK = 3;
const deg = Math.PI / 180;

export type Ear = {
  style: "pointy" | "round" | "floppy";
  base: Vec3;
  /** Unit frame: `axis` runs base to tip, `thin` is the direction the ear is flattened in. */
  axis: Vec3;
  thin: Vec3;
  across: Vec3;
  length: number;
  /** Radius at the base and at the tip (pointy, floppy) or half-width (round). */
  r1: number;
  r2: number;
  /** Half-thickness along `thin`. */
  half: number;
  /** Inner-ear accent outline, projected on the XZ plane; null when the style has none. */
  accent:
    | { kind: "hull"; circles: readonly (readonly [number, number, number])[] }
    | {
        kind: "ellipse";
        center: readonly [number, number];
        radii: readonly [number, number];
        angle: number;
      }
    | null;
};

export type Segment = { a: Vec3; b: Vec3; radius: number };
export type Blob = { center: Vec3; radii: Vec3 };

export type DogLayout = CharacterLayout & {
  body: Blob;
  ears: Ear[];
  snout: Blob | null;
  nose: Blob | null;
  /** The snout param asked for a snout but there was no room below the screen. */
  snoutSkipped: boolean;
  legs: Segment[];
  paws: Blob[];
  haunches: Blob[];
  tail: Segment[];
};

export function dogLayout(values: Params): DogLayout {
  const head = headSize(values);
  const [rx, ry, rz] = head.radii;
  const { shape } = head.module;

  // Body below and slightly behind the head, sunk into the bed so it stands on a flat cut.
  const brx = (rx * num(values, "bodySize")) / 100;
  const bry = brx;
  const brz = brx * 1.2;
  const body: Blob = { center: [0, 0.4 * bry, brz - BASE_SINK], radii: [brx, bry, brz] };
  const bcy = body.center[1];
  const bcz = body.center[2];
  const overlap = 0.45 * Math.min(rz, brz);
  const cz = bcz + brz + rz - overlap;
  const anatomyZ = cz - rz - 1;
  const base = characterLayout(values, head, {
    cz,
    anatomyZ,
    neckRadius: 0.42 * Math.min(rx, brx),
  });
  const k = brx / 17; // the spike's body radius; small features scale with it

  const ears = earLayout(values, { rx, ry, rz, cz, neckZ: anatomyZ });

  // Snout under the screen: above the neck cut and clear of the window.
  let snout: Blob | null = null;
  let nose: Blob | null = null;
  let snoutSkipped = false;
  const snoutSize = num(values, "snout");
  if (snoutSize > 0) {
    const viewHalf = shape.kind === "round" ? shape.viewDiameter / 2 : shape.viewHeight / 2;
    const top = cz - viewHalf - 1;
    const bottom = anatomyZ + 2;
    let radii: Vec3 = [1.7 * snoutSize, 0.9 * snoutSize, 0.85 * snoutSize];
    if (2 * radii[2] > top - bottom) radii = scale(radii, (top - bottom) / (2 * radii[2]));
    if (radii[2] < 1.2) {
      snoutSkipped = true;
    } else {
      snout = { center: [0, head.faceY + 0.3 * radii[1], top - radii[2]], radii };
      if (bool(values, "nose")) {
        const [sy, sz] = [snout.center[1], snout.center[2]];
        nose = {
          center: [0, sy - radii[1] * Math.cos(35 * deg), sz + radii[2] * Math.sin(35 * deg)],
          radii: [0.35 * radii[0], 0.42 * radii[1], 0.5 * radii[2]],
        };
      }
    }
  }

  // Sitting legs, paws, haunches: placed like the spike's dog, scaled with the body.
  const legs: Segment[] = [];
  const paws: Blob[] = [];
  const haunches: Blob[] = [];
  for (const side of [-1, 1]) {
    const lx = side * 0.47 * brx;
    if (bool(values, "frontLegs")) {
      const legTop = Math.min(bcz + 0.1 * brz, anatomyZ - 4);
      legs.push({
        a: [lx, bcy - bry, 6 * k],
        b: [lx, bcy - 0.7 * bry, legTop],
        radius: 0.29 * brx,
      });
      paws.push({ center: [lx, bcy - bry - 4 * k, 3.5 * k], radii: [6 * k, 8 * k, 4.5 * k] });
    }
    haunches.push({
      center: [side * 0.76 * brx, bcy + 0.24 * bry, 0.5 * bcz],
      radii: [0.47 * brx, 0.7 * bry, 0.59 * brx],
    });
  }
  const tail = tailLayout(str(values, "tail"), body, k, anatomyZ);

  return { ...base, body, ears, snout, nose, snoutSkipped, legs, paws, haunches, tail };
}

function earLayout(
  values: Params,
  head: { rx: number; ry: number; rz: number; cz: number; neckZ: number },
): Ear[] {
  const style = str(values, "earStyle");
  if (style === "none") return [];
  const { rx, rz, cz, neckZ } = head;
  const width = num(values, "earWidth");
  const half = Math.max(2.5, width * 0.225);
  return [-1, 1].map((side): Ear => {
    if (style === "floppy") {
      // Hangs from the upper side of the head along its surface, widening toward the tip.
      const t = 62 * deg;
      const axis = normalize([side * 0.3, 0, -1]);
      const thin = normalize([side, 0, 0.3]);
      const base = add(
        [side * rx * Math.sin(t) * 0.95, 0, cz + rz * Math.cos(t) * 0.95],
        scale(thin, half * 0.5),
      );
      const r1 = width * 0.375;
      const r2 = width / 2;
      const reach = (base[2] - neckZ - 2 - r2) / -axis[2];
      const length = Math.max(4, Math.min(num(values, "earLength"), reach));
      return {
        style,
        base,
        axis,
        thin,
        across: cross(axis, thin),
        length,
        r1,
        r2,
        half,
        accent: null,
      };
    }
    // Ears lean outward only: they stay centred on the split plane, so each half-ear lies flat
    // on the bed and the inner-ear accent sits on the front half's upward face.
    const spread = num(values, "earSpread") * deg;
    const t = 38 * deg;
    const base: Vec3 = [side * rx * Math.sin(t) * 0.9, 0, cz + rz * Math.cos(t) * 0.9];
    const axis: Vec3 = [side * Math.sin(spread), 0, Math.cos(spread)];
    const up: Vec3 = [0, 1, 0];
    const thin = normalize(sub(up, scale(axis, dot(axis, up))));
    // The base sits inside the head; add that much so the visible ear is `earLength` long.
    const length = num(values, "earLength") + 0.1 * rz;
    const r1 = width / 2;
    const r2 = style === "pointy" ? 1.2 : width / 2;
    const at = (s: number) => add(base, scale(axis, length * s));
    // Keep the accent outline clear of the head's silhouette, so it only covers ear.
    const outside = (x: number, z: number, r: number) =>
      Math.hypot(x / (rx + r + 1), (z - cz) / (rz + r + 1)) >= 1;
    let accent: Ear["accent"];
    if (style === "pointy") {
      const radiusAt = (s: number) => (r1 + (r2 - r1) * s) * 0.55;
      let s0 = 0.3;
      while (s0 < 0.6 && !outside(at(s0)[0], at(s0)[2], radiusAt(s0))) s0 += 0.05;
      const [p0, p1] = [at(s0), at(0.8)];
      accent = {
        kind: "hull",
        circles: [
          [p0[0], p0[2], radiusAt(s0)],
          [p1[0], p1[2], Math.max(0.8, radiusAt(0.8))],
        ],
      };
    } else {
      const center = at(0.55);
      accent = {
        kind: "ellipse",
        center: [center[0], center[2]],
        radii: [r1 * 0.6, (length / 2) * 0.6],
        angle: -Math.atan2(axis[0], axis[2]) / deg,
      };
    }
    // Round ears are an ellipsoid; r1/r2 are its half-width.
    return {
      style: style === "pointy" ? "pointy" : "round",
      base,
      axis,
      thin,
      across: cross(axis, thin),
      length,
      r1,
      r2,
      half,
      accent,
    };
  });
}

function tailLayout(style: string, body: Blob, k: number, neckZ: number): Segment[] {
  const [, bcy, bcz] = body.center;
  const base: Vec3 = [0, bcy + 0.88 * body.radii[1], 0.5 * bcz];
  let segments: Segment[];
  if (style === "curl") {
    const mid = add(base, [0, 7 * k, 12 * k]);
    segments = [
      { a: base, b: mid, radius: 3.5 * k },
      { a: mid, b: add(mid, [0, -k, 4 * k]), radius: 3 * k },
    ];
  } else if (style === "wag") {
    segments = [{ a: base, b: add(base, [5 * k, 6 * k, 10 * k]), radius: 3.2 * k }];
  } else if (style === "stub") {
    segments = [{ a: base, b: add(base, [0, 3 * k, 2 * k]), radius: 4 * k }];
  } else {
    return [];
  }
  // Lower the whole tail if it would reach the neck cut and come off with the head.
  const top = Math.max(...segments.flatMap((s) => [s.a[2] + s.radius, s.b[2] + s.radius]));
  const drop = Math.max(0, top - (neckZ - 2));
  const down = (v: Vec3): Vec3 => [v[0], v[1], v[2] - drop];
  return segments.map((s) => ({ ...s, a: down(s.a), b: down(s.b) }));
}

function earSdf(ear: Ear): Sdf {
  const [bx, by, bz] = ear.base;
  const { across: s, thin: n, axis: a } = ear;
  const local = (p: Vec3): Vec3 => {
    const [qx, qy, qz] = [p[0] - bx, p[1] - by, p[2] - bz];
    return [
      qx * s[0] + qy * s[1] + qz * s[2],
      qx * n[0] + qy * n[1] + qz * n[2],
      qx * a[0] + qy * a[1] + qz * a[2],
    ];
  };
  if (ear.style === "round") {
    const center: Vec3 = [0, 0, ear.length / 2];
    const radii: Vec3 = [ear.r1, ear.half, ear.length / 2];
    return (p) => ellipsoid(local(p), center, radii);
  }
  // Squash the thin direction so a round cone becomes a flat ear. Squashing only stretches
  // distances, so dividing by √f keeps the value above box distance / √f (see CULL_FACTOR).
  const f = Math.max(ear.r1, ear.r2) / ear.half;
  const root = Math.sqrt(f);
  const [origin, tip]: [Vec3, Vec3] = [
    [0, 0, 0],
    [0, 0, ear.length],
  ];
  return (p) => {
    const [u, v, w] = local(p);
    return roundCone([u, v * f, w], origin, tip, ear.r1, ear.r2) / root;
  };
}

export { CULL_FACTOR };

const blobBox = (b: Blob) => boxAround(b.center, b.radii);
const segmentBox = (s: Segment) => unionBox([boxAround(s.a, s.radius), boxAround(s.b, s.radius)]);
const earBox = (e: Ear) => {
  const reach = Math.max(e.r1, e.r2, e.half);
  return unionBox([
    boxAround(e.base, reach),
    boxAround(add(e.base, scale(e.axis, e.length)), reach),
  ]);
};

/**
 * Every shape blended onto the head core: its distance, blend radius, and a box containing it.
 * The box lets outerSdf skip shapes that cannot change the result at a point.
 */
function outerTerms(L: DogLayout): Term[] {
  const k = L.softness;
  const neck: Segment = { a: [0, 0, L.body.center[2]], b: [0, 0, L.cz], radius: L.neck.radius };
  const blob = (b: Blob, blend: number) => ({
    dist: (p: Vec3) => ellipsoid(p, b.center, b.radii),
    k: blend,
    box: blobBox(b),
  });
  const segment = (s: Segment) => ({
    dist: (p: Vec3) => capsule(p, s.a, s.b, s.radius),
    k,
    box: segmentBox(s),
  });
  return [
    blob(L.body, 2 * k),
    segment(neck),
    ...L.ears.map((ear) => ({ dist: earSdf(ear), k, box: earBox(ear) })),
    ...(L.snout ? [blob(L.snout, k)] : []),
    ...(L.nose ? [blob(L.nose, 0.4 * k)] : []),
    ...L.legs.map(segment),
    ...L.paws.map((paw) => blob(paw, 0.75 * k)),
    ...L.haunches.map((h) => blob(h, 1.5 * k)),
    ...L.tail.map(segment),
  ];
}

/** The whole dog's outer surface: its head core with every term blended on. */
export function outerSdf(L: DogLayout): Sdf {
  return blendTerms(headCoreSdf(L), outerTerms(L));
}

/** Each term's distance divided by its box distance, at `p`; for checking CULL_FACTOR. */
export function cullRatios(L: DogLayout, p: Vec3): number[] {
  return termRatios(outerTerms(L), p);
}

/** Box around everything, for meshing the outside. Blends add at most k/4 outside the shapes. */
export function outerBounds(L: DogLayout): Box3 {
  return termBounds(headBounds(L), outerTerms(L), L.softness);
}
