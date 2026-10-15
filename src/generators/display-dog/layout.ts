import { bool, num, str } from "../../core/params";
import {
  add,
  boxAround,
  boxDistance,
  capsule,
  cross,
  dot,
  ellipsoid,
  normalize,
  roundBox,
  roundCone,
  roundCylinder,
  scale,
  smoothUnion,
  sub,
  unionBox,
  type Box3,
  type Sdf,
  type Vec3,
} from "../../core/sdf";
import type { Params } from "../../core/types";
import {
  BATTERIES,
  BATTERY_ALLOWANCE,
  DISPLAYS,
  type DisplayId,
  type DisplayModule,
  type Edge,
} from "./catalogue";

/**
 * Everything about the dog that follows from its params, in the assembled frame: Z up,
 * millimetres, the face looking toward -Y, the head/body split plane at y = 0 and the display
 * centred on x = 0. Pure math, so index.ts can validate with it and build.ts meshes it.
 */

/** Gap between the module and its pocket on every side. */
export const POCKET_CLEARANCE = 0.3;
/** Depth of the pocket rim that locates the module behind the front wall (at most). */
export const POCKET_RIM = 4;
/** Material left behind an inner-ear accent, toward the split plane. */
export const EAR_ACCENT_FLOOR = 0.8;
/** Filament dowels that align the head halves: diameter, and hole depth on each side. */
export const DOWEL = { diameter: 1.75, depth: 3 };
/** Bosses inside the head that carry the dowel holes: radius and half-length across the split. */
export const BOSS = { radius: 3.2, half: 4 };
/** How far the body ellipsoid reaches below the bed before the flat cut. */
const BASE_SINK = 3;
/** USB-C plug overmold opening: across the port and front-to-back. */
export const USB_OPENING = { width: 13, height: 7.5 };
/** Height of the USB-C receptacle centre above the module's back face. */
const USB_CENTRE_FROM_BACK = 1.6;

const MESH_EDGE: Record<string, number> = { draft: 1.4, normal: 1, fine: 0.6 };
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

export type DogLayout = {
  meshEdge: number;
  wall: number;
  fit: number;
  softness: number;
  module: DisplayModule;
  /** Edge the module's tab and port face. */
  edge: Edge;
  /** Footprint half-extents in the face plane (x, z), clearance included. */
  footprint: { radius: number; halfX: number; halfZ: number };
  faceY: number;
  /** Back face of the module, clearance included. */
  pocketBack: number;
  /** Height of the display centre, which is also the head centre. */
  cz: number;
  head: { radii: Vec3 };
  pad: { round: boolean; halfX: number; halfZ: number };
  body: Blob;
  /**
   * `z` is where the head comes off (the neck cut, when enabled; the hollow's floor sits above
   * it either way). `anatomyZ` is the default cut height, which ears, snout, legs, and tail are
   * sized against, so moving the cut never reshapes the dog.
   */
  neck: {
    cut: boolean;
    z: number;
    anatomyZ: number;
    radius: number;
    pegRadius: number;
    pegLength: number;
  };
  /** Front/back split of the head (or the whole dog, without a neck cut) at y = `y`. */
  split: { cut: boolean; y: number };
  ears: Ear[];
  snout: Blob | null;
  nose: Blob | null;
  /** The snout param asked for a snout but there was no room below the screen. */
  snoutSkipped: boolean;
  legs: Segment[];
  paws: Blob[];
  haunches: Blob[];
  tail: Segment[];
  /** Dowel boss axes (along y, at the split plane) at these (x, z). */
  bosses: (readonly [number, number])[];
  /** Cable or USB opening. */
  port:
    | { kind: "usb"; y: number; angle: number; from: number; to: number }
    | { kind: "cable"; z: number; radius: number };
};

/** The module selected by `display`, built from the custom fields when it is "custom". */
export function selectedModule(values: Params): DisplayModule {
  // Select params only ever hold one of their declared options.
  const id = str(values, "display") as DisplayId;
  if (id !== "custom") return DISPLAYS[id].module;
  const thickness = num(values, "customThickness");
  if (str(values, "customShape") === "round") {
    const shape = {
      kind: "round" as const,
      diameter: num(values, "customDiameter"),
      viewDiameter: num(values, "customViewDiameter"),
    };
    return { shape, thickness, usb: false };
  }
  const shape = {
    kind: "rect" as const,
    width: num(values, "customWidth"),
    height: num(values, "customHeight"),
    corner: num(values, "customCorner"),
    viewWidth: num(values, "customViewWidth"),
    viewHeight: num(values, "customViewHeight"),
  };
  return { shape, thickness, usb: false };
}

/** The battery pouch size (thickness, width, length), or null for none. */
export function selectedBattery(values: Params): readonly [number, number, number] | null {
  const id = str(values, "battery");
  if (id === "none") return null;
  if (id === "custom") {
    return [
      num(values, "batteryThickness"),
      num(values, "batteryWidth"),
      num(values, "batteryLength"),
    ];
  }
  return BATTERIES[id].size;
}

/** Rotation in the face plane (degrees, counter-clockwise seen from the front) from "top". */
export const EDGE_ANGLE: Record<Edge, number> = { top: 0, left: 90, bottom: 180, right: -90 };

export function dogLayout(values: Params): DogLayout {
  const module = selectedModule(values);
  const wall = num(values, "wall");
  const softness = num(values, "softness");
  const c = POCKET_CLEARANCE;
  // Boards with USB-C let the user turn the port; the bare module's pins always face down.
  const edge: Edge = module.usb ? (str(values, "usbEdge") as Edge) : "bottom";

  // Footprint of the module in the face plane, tab included.
  const { shape, tab } = module;
  const outlineX = (shape.kind === "round" ? shape.diameter : shape.width) / 2 + c;
  const outlineZ = (shape.kind === "round" ? shape.diameter : shape.height) / 2 + c;
  const tabReach = tab
    ? (shape.kind === "round" ? shape.diameter / 2 : outlineZ) + tab.beyond + c
    : 0;
  const sideways = edge === "left" || edge === "right";
  const halfX = Math.max(outlineX, sideways ? tabReach : 0);
  const halfZ = Math.max(outlineZ, sideways ? 0 : tabReach);
  const margin = num(values, "faceMargin");
  const round = shape.kind === "round";
  const padHalfX = round ? Math.max(halfX, halfZ) + margin : halfX + margin;
  const padHalfZ = round ? Math.max(halfX, halfZ) + margin : halfZ + margin;

  // Head: an ellipsoid a little larger than the face pad, deep enough for the module.
  const rx = padHalfX + 3;
  const rz = padHalfZ + 2;
  const minDepth = (wall + module.thickness + c + 2.5) / 0.85;
  const ry = Math.max((rx * num(values, "headDepth")) / 100, minDepth);
  const faceY = -0.85 * ry;

  // Body below and slightly behind the head, sunk into the bed so it stands on a flat cut.
  const brx = (rx * num(values, "bodySize")) / 100;
  const bry = brx;
  const brz = brx * 1.2;
  const body: Blob = { center: [0, 0.4 * bry, brz - BASE_SINK], radii: [brx, bry, brz] };
  const bcy = body.center[1];
  const bcz = body.center[2];
  const overlap = 0.45 * Math.min(rz, brz);
  const cz = bcz + brz + rz - overlap;
  const neckRadius = 0.42 * Math.min(rx, brx);
  const anatomyZ = cz - rz - 1;
  const neckCut = bool(values, "neckCut");
  const neck = {
    cut: neckCut,
    z: anatomyZ + (neckCut ? num(values, "neckCutOffset") : 0),
    anatomyZ,
    radius: neckRadius,
    pegRadius: neckRadius - wall - 1,
    pegLength: 7,
  };
  const splitCut = bool(values, "headSplit");
  const split = { cut: splitCut, y: splitCut ? num(values, "headSplitOffset") : 0 };
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
      snout = { center: [0, faceY + 0.3 * radii[1], top - radii[2]], radii };
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

  // Dowel bosses on the upper sides of the head's cross-section at the split plane, just inside
  // the wall.
  const across = Math.sqrt(Math.max(0, 1 - (split.y / ry) ** 2));
  const bosses = [-1, 1].map((side) => {
    const t = 50 * deg;
    const [ex, ez] = [rx * across, rz * across];
    const px = side * ex * Math.sin(t);
    const pz = ez * Math.cos(t);
    const n = normalize([px / ex ** 2, 0, pz / ez ** 2]);
    const inward = wall + 2.2;
    return [px - n[0] * inward, cz + pz - n[2] * inward] as const;
  });

  const pocketBack = faceY + wall + module.thickness + c;
  const port: DogLayout["port"] = module.usb
    ? {
        kind: "usb",
        y: pocketBack - c - USB_CENTRE_FROM_BACK,
        angle: EDGE_ANGLE[edge],
        from: 0.5 * Math.min(halfX, halfZ),
        to: Math.max(rx, rz) + 10,
      }
    : { kind: "cable", z: cz - 0.45 * rz, radius: 3 };

  return {
    meshEdge: MESH_EDGE[str(values, "detail")],
    wall,
    fit: num(values, "fit"),
    softness,
    module,
    edge,
    footprint: { radius: Math.max(outlineX, outlineZ), halfX, halfZ },
    faceY,
    pocketBack,
    cz,
    head: { radii: [rx, ry, rz] },
    pad: { round, halfX: padHalfX, halfZ: padHalfZ },
    body,
    neck,
    split,
    ears,
    snout,
    nose,
    snoutSkipped,
    legs,
    paws,
    haunches,
    tail,
    bosses,
    port,
  };
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

/** Head ellipsoid plus the face pad, cut flat at the face. This is the part that is hollowed. */
export function headCoreSdf(L: DogLayout): Sdf {
  const [rx, ry, rz] = L.head.radii;
  const padCenter: Vec3 = [0, L.faceY / 2, L.cz];
  const padHalfY = -L.faceY / 2;
  return (p) => {
    const head = ellipsoid(p, [0, 0, L.cz], [rx, ry, rz]);
    const pad = L.pad.round
      ? roundCylinder(p, padCenter, 1, L.pad.halfX, padHalfY, 3)
      : roundBox(p, padCenter, [L.pad.halfX, padHalfY, L.pad.halfZ], 3);
    return Math.max(smoothUnion(head, pad, L.softness), L.faceY - p[1]);
  };
}

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
function outerTerms(L: DogLayout): { dist: Sdf; k: number; box: Box3 }[] {
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

/**
 * A fraction every term's value stays above, relative to its box distance; culling with it
 * never changes the field. Exact distances give 1. Ears give at least 1/√f with squash factor
 * f ≤ 2.23 (ear half-thickness is ≥ 0.225 × width), so ≥ 0.67. The ellipsoid approximation is
 * not a strict bound; sampling measured ≥ 0.8, and tests check a sweep of shapes.
 */
export const CULL_FACTOR = 0.4;

/** The whole dog's outer surface. */
export function outerSdf(L: DogLayout): Sdf {
  const core = headCoreSdf(L);
  const terms = outerTerms(L);
  return (p) => {
    let d = core(p);
    for (const term of terms) {
      // smoothUnion(d, b, k) is exactly d when b >= d + k; skip the shape when even its box
      // is that far away. This is most of the grid, and makes meshing several times faster.
      if (CULL_FACTOR * boxDistance(p, term.box) >= d + term.k) continue;
      d = smoothUnion(d, term.dist(p), term.k);
    }
    return d;
  };
}

/** Each term's distance divided by its box distance, at `p`; for checking CULL_FACTOR. */
export function cullRatios(L: DogLayout, p: Vec3): number[] {
  return outerTerms(L).flatMap((term) => {
    const box = boxDistance(p, term.box);
    return box > 0 ? [term.dist(p) / box] : [];
  });
}

/** Box around the head core, for meshing the hollow. */
export function headBounds(L: DogLayout): Box3 {
  const [rx, ry, rz] = L.head.radii;
  const head = boxAround([0, 0, L.cz], [rx, ry, rz]);
  const pad = {
    min: [-L.pad.halfX, L.faceY, L.cz - L.pad.halfZ],
    max: [L.pad.halfX, 0, L.cz + L.pad.halfZ],
  } as const;
  return unionBox([head, pad], L.softness / 2 + 2);
}

/** Box around everything, for meshing the outside. Blends add at most k/4 outside the shapes. */
export function outerBounds(L: DogLayout): Box3 {
  return unionBox([headBounds(L), ...outerTerms(L).map((t) => t.box)], L.softness / 2 + 2);
}

/**
 * Where the battery goes: lying flat behind the module, centred on the display, in whichever
 * of the two in-plane orientations fits the hollow head clear of the dowel bosses. It may sit
 * further back than the module's back face, where a deep head is widest. Null when nothing
 * fits.
 */
export function placeBattery(L: DogLayout, pouch: readonly [number, number, number]): Box3 | null {
  const [t, w, l] = pouch.map((v, i) => v + BATTERY_ALLOWANCE[i]);
  const core = headCoreSdf(L);
  const floor = L.neck.z + L.wall + 2;

  const steps = 4;
  const fits = (box: Box3) => {
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; j <= steps; j++) {
        for (let m = 0; m <= steps; m++) {
          const at = (a: 0 | 1 | 2, s: number) =>
            box.min[a] + ((box.max[a] - box.min[a]) * s) / steps;
          const p: Vec3 = [at(0, i), at(1, j), at(2, m)];
          if (core(p) > -(L.wall + 0.2) || p[2] < floor + 0.2) return false;
          if (L.split.cut && Math.abs(p[1] - L.split.y) <= BOSS.half + 0.2) {
            for (const [bx, bz] of L.bosses) {
              if (Math.hypot(p[0] - bx, p[2] - bz) < BOSS.radius + 0.2) return false;
            }
          }
        }
      }
    }
    return true;
  };
  const yMax = L.head.radii[1];
  for (let y = L.pocketBack + 0.5; y + t <= yMax; y += 1) {
    for (const [across, up] of [
      [w, l],
      [l, w],
    ]) {
      const box: Box3 = {
        min: [-across / 2, y, L.cz - up / 2],
        max: [across / 2, y + t, L.cz + up / 2],
      };
      if (fits(box)) return box;
    }
  }
  return null;
}
