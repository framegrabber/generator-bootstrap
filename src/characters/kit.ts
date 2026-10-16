import { bool, num, str } from "../core/params";
import {
  boxAround,
  boxDistance,
  ellipsoid,
  roundBox,
  roundCylinder,
  smoothUnion,
  unionBox,
  type Box3,
  type Sdf,
  type Vec3,
} from "../core/sdf";
import type { ParamSpec, Params, ValidationIssue } from "../core/types";
import {
  BATTERY_ALLOWANCE,
  EDGE_ANGLE,
  EDGE_VECTOR,
  selectedBattery,
  selectedEdge,
  selectedModule,
  toFace,
  turnEdge,
  type DisplayModule,
  type Edge,
} from "./hardware";

/**
 * What every display character shares: a hollow ellipsoid head with a flat face for the
 * display, a neck cut and a front/back head split, dowels and a neck peg, a battery behind the
 * display, and the params for all of that. Pure math, main-thread safe; `assemble.ts` turns a
 * `CharacterLayout` into parts in the worker.
 *
 * Frame: Z up, millimetres, the face looking toward -Y, the display's visible area centred on
 * x = 0, the head centred on (0, 0, cz), the head split at y = split.y.
 */

/** Gap between the module and its pocket on every side. */
export const POCKET_CLEARANCE = 0.3;
/** Depth of the pocket rim that locates the module behind the front wall (at most). */
export const POCKET_RIM = 4;
/** Filament dowels that align the head halves: diameter, and hole depth on each side. */
export const DOWEL = { diameter: 1.75, depth: 3 };
/** Bosses inside the head that carry the dowel holes: radius and half-length across the split. */
export const BOSS = { radius: 3.2, half: 4 };
/** Pin holes to the board's side buttons, for a paperclip. */
export const PIN_HOLE = 1.6;
/**
 * The printed spacer between a board's standoffs and the head split: tube radius, the socket
 * that fits over a standoff (radius, depth), the frame joining the tubes at the split (width,
 * thickness), and the gap left to the split face.
 */
export const SPACER = {
  tube: 3.8,
  socket: 3.05,
  socketDepth: 1.5,
  frame: 4,
  thickness: 2,
  gap: 0.2,
};
const MESH_EDGE: Record<string, number> = { draft: 1.4, normal: 1, fine: 0.6 };
const deg = Math.PI / 180;

/**
 * `z` is the neck cut's height on the neck axis (x = y = 0) and `tilt` (degrees) tips it about
 * x; the head's hollow floor sits parallel to it either way. `anatomyZ` is the default cut
 * height, which limbs and features are sized against, so moving the cut never reshapes the
 * character.
 */
export type Neck = {
  cut: boolean;
  z: number;
  tilt: number;
  anatomyZ: number;
  radius: number;
  pegRadius: number;
  pegLength: number;
};
/** Front/back split of the head (or the whole character, without a neck cut) at y = `y`. */
export type Split = { cut: boolean; y: number };
export type Port =
  | {
      kind: "usb";
      /** Depth of the plug's centre. */
      y: number;
      /** Direction the plug points out of the face, degrees from up (see EDGE_ANGLE). */
      angle: number;
      /** Offset across that direction, and the opening's extent along it from the centre. */
      along: number;
      from: number;
      to: number;
      /** The plug's grip: across, and front to back. */
      width: number;
      height: number;
    }
  | { kind: "cable"; z: number; radius: number };

/** Face and head size, which follow from the display; everything but the head's height. */
export type HeadSize = {
  module: DisplayModule;
  /** Edge the module's tab and port face. */
  edge: Edge;
  /** How far the module reaches from the display centre toward each face edge, clearance included. */
  footprint: Record<Edge, number>;
  /** Free space the hollow keeps past the footprint, per face edge (cable plugs, a card). */
  room: Record<Edge, number>;
  /** Half-extents of the visible area on the face (x, z). */
  view: { halfX: number; halfZ: number };
  /** The flat face around the display: round for round displays. */
  pad: { round: boolean; halfX: number; halfZ: number };
  /** Head semi-axes. */
  radii: Vec3;
  /** Corner radius of a rounded-box head (rectangular displays); null for an ellipsoid. */
  corner: number | null;
  faceY: number;
  /** Back face of the module, clearance included. */
  pocketBack: number;
};

export type CharacterLayout = Omit<HeadSize, "radii" | "corner"> & {
  meshEdge: number;
  wall: number;
  fit: number;
  softness: number;
  /** Height of the display centre, which is also the head centre. */
  cz: number;
  head: { radii: Vec3; corner: number | null };
  neck: Neck;
  split: Split;
  /** Dowel boss axes (along y, at the split plane) at these (x, z). */
  bosses: (readonly [number, number])[];
  /** Cable or USB opening. */
  port: Port;
  /** Pin holes to the board's buttons: where each starts (at the actuator) and its direction. */
  pinHoles: { name: string; from: Vec3; dir: Vec3 }[];
  /** The face edge the buttons are on, for the assembly notes; null without buttons. */
  buttonEdge: Edge | null;
  /**
   * Spacer from the board's standoff tips (`front`) to just before the split (`back`), with a
   * tube on each standoff at (x, z); the back half has posts there that press it. Null without
   * standoffs or a head split.
   */
  spacer: Spacer | null;
};

export type Spacer = { posts: (readonly [number, number])[]; front: number; back: number };

/** Signed distance in the split plane (x, z) to the spacer's frame: the posts' bounding box. */
export function spacerDistance(spacer: Spacer, x: number, z: number): number {
  const xs = spacer.posts.map((p) => p[0]);
  const zs = spacer.posts.map((p) => p[1]);
  const r = SPACER.tube;
  const [cx, cz] = [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...zs) + Math.max(...zs)) / 2,
  ];
  const [hx, hz] = [
    (Math.max(...xs) - Math.min(...xs)) / 2 + r,
    (Math.max(...zs) - Math.min(...zs)) / 2 + r,
  ];
  const [dx, dz] = [Math.abs(x - cx) - hx, Math.abs(z - cz) - hz];
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
}

/** Head and face sized around the selected display (params faceMargin, headDepth, wall). */
export function headSize(values: Params): HeadSize {
  const module = selectedModule(values);
  const edge = selectedEdge(values, module);
  const wall = num(values, "wall");
  const c = POCKET_CLEARANCE;
  const { shape, tab } = module;
  const round = shape.kind === "round";
  const offset = module.outlineOffset ?? 0;
  const halfU = (round ? shape.diameter : shape.width) / 2;
  const halfV = round ? halfU : shape.height / 2;
  // Reach toward each edge of the module frame, then turned onto the face.
  const reach: Record<Edge, number> = {
    left: halfU + c,
    right: halfU + c,
    bottom: halfV - offset + c,
    top: halfV + offset + c + (tab ? tab.beyond : 0),
  };
  // The hollow keeps the module's room free past the outline; the pad is a wall thicker.
  const margin = num(values, "faceMargin");
  const footprint: Record<Edge, number> = { top: 0, left: 0, bottom: 0, right: 0 };
  const room = { ...footprint };
  const padReach = { ...footprint };
  for (const side of ["top", "left", "bottom", "right"] as const) {
    const faceSide = turnEdge(side, edge);
    footprint[faceSide] = reach[side];
    room[faceSide] = module.room?.[side] ?? 0;
    padReach[faceSide] = reach[side] + Math.max(margin, room[faceSide] + wall);
  }
  // The face is centred on the visible area, so the pad reaches as far as its farther side.
  const padHalfX = Math.max(padReach.left, padReach.right);
  const padHalfZ = Math.max(padReach.bottom, padReach.top);
  const padRadius = Math.max(padHalfX, padHalfZ);
  const sideways = edge === "left" || edge === "right";
  const [viewU, viewV] = round
    ? [shape.viewDiameter / 2, shape.viewDiameter / 2]
    : [shape.viewWidth / 2, shape.viewHeight / 2];
  const pad = round
    ? { round, halfX: padRadius, halfZ: padRadius }
    : { round, halfX: padHalfX, halfZ: padHalfZ };
  // A head a little larger than the face pad, deep enough for the module: an ellipsoid behind
  // a round display, a pillowy rounded box behind a rectangle (a rectangle's corners only fit
  // an ellipsoid ~1.4 times its size, so the pad would stick out of it like a box).
  const rx = pad.halfX + 3;
  const rz = pad.halfZ + 2;
  const minDepth = (wall + module.thickness + c + 2.5) / 0.85;
  const ry = Math.max((rx * num(values, "headDepth")) / 100, minDepth);
  const faceY = -0.85 * ry;
  return {
    module,
    edge,
    footprint,
    room,
    view: sideways ? { halfX: viewV, halfZ: viewU } : { halfX: viewU, halfZ: viewV },
    pad,
    radii: [rx, ry, rz],
    corner: round ? null : 0.4 * Math.min(rx, ry, rz),
    faceY,
    pocketBack: faceY + wall + module.thickness + c,
  };
}

/**
 * Completes a character's shared layout once it has placed its head at height `cz`.
 * `anatomyZ` is the default neck cut height; `neckRadius` sizes the peg. `keepOut` is the
 * signed distance, in the split plane (x, z), to the character's own features the dowel bosses
 * must stay clear of (speaker pockets).
 */
export function characterLayout(
  values: Params,
  head: HeadSize,
  where: {
    cz: number;
    anatomyZ: number;
    neckRadius: number;
    keepOut?: (x: number, z: number) => number;
  },
): CharacterLayout {
  const { radii, corner, ...face } = head;
  const [rx, , rz] = radii;
  const { cz, anatomyZ, neckRadius } = where;
  const wall = num(values, "wall");
  const neckCut = bool(values, "neckCut");
  const neck: Neck = {
    cut: neckCut,
    z: anatomyZ + (neckCut ? num(values, "neckCutOffset") : 0),
    tilt: neckCut ? num(values, "neckCutTilt") : 0,
    anatomyZ,
    radius: neckRadius,
    pegRadius: neckRadius - wall - 1,
    pegLength: 7,
  };
  const splitCut = bool(values, "headSplit");
  const split: Split = { cut: splitCut, y: splitCut ? num(values, "headSplitOffset") : 0 };

  const standoffs = face.module.standoffs?.at ?? [];
  const spacer: Spacer | null =
    split.cut && standoffs.length > 0
      ? {
          posts: standoffs.map(([u, v]) => {
            const [x, z] = toFace(face.edge, u, v);
            return [x, cz + z] as const;
          }),
          front: face.faceY + wall + face.module.thickness,
          back: split.y - SPACER.gap,
        }
      : null;

  // Dowel bosses on the upper sides of the head's cross-section at the split plane, just inside
  // the wall, found on the actual surface (head and pad blended). They start at 50° from the
  // top and turn away from the spacer and the character's keep-out features when they must.
  const softness = num(values, "softness");
  const core = headCoreSdf({
    head: { radii, corner },
    pad: face.pad,
    faceY: face.faceY,
    cz,
    softness,
  });
  const reach = Math.hypot(rx, rz) + 5;
  const clearance = (x: number, z: number) =>
    Math.min(
      spacer ? spacerDistance(spacer, x, z) : Infinity,
      where.keepOut ? where.keepOut(x, z) : Infinity,
    );
  const bossAt = (side: number, angle: number) => {
    const dir: Vec3 = [side * Math.sin(angle * deg), 0, Math.cos(angle * deg)];
    const surface = surfaceAlong(core, (s) => [dir[0] * s, split.y, cz + dir[2] * s], reach);
    const inward = surface - wall - 2.2;
    return [dir[0] * inward, cz + dir[2] * inward] as const;
  };
  const bosses = [-1, 1].map((side) => {
    for (const angle of [50, 40, 60, 30, 70, 20, 80]) {
      const boss = bossAt(side, angle);
      if (clearance(boss[0], boss[1]) >= BOSS.radius + 1) return boss;
    }
    return bossAt(side, 50);
  });

  const { usb } = face.module;
  const port: Port = usb
    ? {
        kind: "usb",
        y: face.faceY + wall + usb.depth,
        angle: EDGE_ANGLE[face.edge],
        along: usb.along,
        from: 0.5 * Math.min(...Object.values(face.footprint)),
        to: Math.max(rx, rz) + 10,
        width: num(values, "usbPlugWidth"),
        height: num(values, "usbPlugHeight"),
      }
    : { kind: "cable", z: cz - 0.45 * rz, radius: 3 };

  const buttons = face.module.buttons ?? [];
  const pinHoles = buttons.map(({ name, at, depth, edge }) => {
    const [x, z] = toFace(face.edge, at[0], at[1]);
    const outward = EDGE_VECTOR[edge];
    const [dx, dz] = toFace(face.edge, outward[0], outward[1]);
    return { name, from: [x, face.faceY + wall + depth, cz + z] as Vec3, dir: [dx, 0, dz] as Vec3 };
  });
  const buttonEdge = buttons.length > 0 ? turnEdge(buttons[0].edge, face.edge) : null;
  return {
    ...face,
    meshEdge: MESH_EDGE[str(values, "detail")],
    wall,
    fit: num(values, "fit"),
    softness,
    cz,
    head: { radii, corner },
    neck,
    split,
    bosses,
    port,
    pinHoles,
    buttonEdge,
    spacer,
  };
}

/** Unit normal of the neck cut. A positive tilt leans it toward +y, raising the cut's front. */
export function neckNormal(neck: Neck): Vec3 {
  const t = neck.tilt * deg;
  return [0, Math.sin(t), Math.cos(t)];
}

/** Height of the neck cut at depth y: a positive tilt raises the front (under the chin). */
export function neckHeightAt(neck: Neck, y: number): number {
  return neck.z - y * Math.tan(neck.tilt * deg);
}

/**
 * Distance along a ray from inside a solid to its surface: `at(s)` is the point s along the
 * ray, inside at 0 and outside at `reach`. Bisection, so it needs no exact distance field.
 */
export function surfaceAlong(sdf: Sdf, at: (s: number) => Vec3, reach: number): number {
  let [inside, outside] = [0, reach];
  for (let i = 0; i < 30; i++) {
    const mid = (inside + outside) / 2;
    if (sdf(at(mid)) < 0) inside = mid;
    else outside = mid;
  }
  return (inside + outside) / 2;
}

/** Head (ellipsoid or rounded box) plus the face pad, cut flat at the face: what is hollowed. */
export function headCoreSdf(
  L: Pick<CharacterLayout, "head" | "pad" | "faceY" | "cz" | "softness">,
): Sdf {
  const [rx, ry, rz] = L.head.radii;
  const { corner } = L.head;
  const padCenter: Vec3 = [0, L.faceY / 2, L.cz];
  const padHalfY = -L.faceY / 2;
  return (p) => {
    const head =
      corner === null
        ? ellipsoid(p, [0, 0, L.cz], [rx, ry, rz])
        : roundBox(p, [0, 0, L.cz], [rx, ry, rz], corner);
    const pad = L.pad.round
      ? roundCylinder(p, padCenter, 1, L.pad.halfX, padHalfY, 3)
      : roundBox(p, padCenter, [L.pad.halfX, padHalfY, L.pad.halfZ], 3);
    return Math.max(smoothUnion(head, pad, L.softness), L.faceY - p[1]);
  };
}

/** Box around the head core, for meshing the hollow. */
export function headBounds(L: CharacterLayout): Box3 {
  const [rx, ry, rz] = L.head.radii;
  const head = boxAround([0, 0, L.cz], [rx, ry, rz]);
  const pad = {
    min: [-L.pad.halfX, L.faceY, L.cz - L.pad.halfZ],
    max: [L.pad.halfX, 0, L.cz + L.pad.halfZ],
  } as const;
  return unionBox([head, pad], L.softness / 2 + 2);
}

/** A shape blended onto a character's core: its distance, blend radius, and a box around it. */
export type Term = { dist: Sdf; k: number; box: Box3 };

/**
 * A fraction every term's value stays above, relative to its box distance; culling with it
 * never changes the field. Exact distances (spheres, capsules, round boxes and cylinders) give
 * 1. Squashed shapes give at least 1/√f; the dog's ears have f ≤ 2.23, so ≥ 0.67. The
 * ellipsoid approximation is not a strict bound; sampling measured ≥ 0.8, and each
 * character's tests check a sweep of its shapes.
 */
export const CULL_FACTOR = 0.4;

/**
 * `core` with every term smooth-blended on. smoothUnion(d, b, k) is exactly d when b ≥ d + k,
 * so a term is skipped wherever even its box is that far away: most of the meshing grid, which
 * makes meshing several times faster.
 */
export function blendTerms(core: Sdf, terms: readonly Term[]): Sdf {
  return (p) => {
    let d = core(p);
    for (const term of terms) {
      if (CULL_FACTOR * boxDistance(p, term.box) >= d + term.k) continue;
      d = smoothUnion(d, term.dist(p), term.k);
    }
    return d;
  };
}

/** Each term's distance divided by its box distance, at `p`; for checking CULL_FACTOR. */
export function termRatios(terms: readonly Term[], p: Vec3): number[] {
  return terms.flatMap((term) => {
    const box = boxDistance(p, term.box);
    return box > 0 ? [term.dist(p) / box] : [];
  });
}

/** Box around the head and every term, for meshing; blends add at most k/4 outside. */
export function termBounds(head: Box3, terms: readonly Term[], softness: number): Box3 {
  return unionBox([head, ...terms.map((t) => t.box)], softness / 2 + 2);
}

/**
 * Where the battery goes: lying flat behind the module, centred on the display, in whichever
 * of the two in-plane orientations fits the hollow head clear of the dowel bosses. It may sit
 * further back than the module's back face, where a deep head is widest. Null when nothing
 * fits.
 */
export function placeBattery(
  L: CharacterLayout,
  pouch: readonly [number, number, number],
): Box3 | null {
  const [t, w, l] = pouch.map((v, i) => v + BATTERY_ALLOWANCE[i]);
  const core = headCoreSdf(L);
  const normal = neckNormal(L.neck);
  // Distance above the neck cut, along its normal.
  const aboveCut = (p: Vec3) => normal[1] * p[1] + normal[2] * (p[2] - L.neck.z);
  const steps = 4;
  const fits = (box: Box3) => {
    if (L.spacer && !clearOfSpacer(L.spacer, box)) return false;
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; j <= steps; j++) {
        for (let m = 0; m <= steps; m++) {
          const at = (a: 0 | 1 | 2, s: number) =>
            box.min[a] + ((box.max[a] - box.min[a]) * s) / steps;
          const p: Vec3 = [at(0, i), at(1, j), at(2, m)];
          if (core(p) > -(L.wall + 0.2) || aboveCut(p) < L.wall + 2.2) return false;
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

/** Whether a box stays clear of the spacer's tubes, the back half's posts, and the frame. */
function clearOfSpacer(spacer: Spacer, box: Box3): boolean {
  const gap = 0.3;
  const [y0, y1] = [box.min[1], box.max[1]];
  // Tubes from the standoffs and posts behind them run along y from the socket to the back.
  if (y1 > spacer.front - SPACER.socketDepth) {
    for (const [px, pz] of spacer.posts) {
      const dx = Math.max(box.min[0] - px, 0, px - box.max[0]);
      const dz = Math.max(box.min[2] - pz, 0, pz - box.max[2]);
      if (Math.hypot(dx, dz) < SPACER.tube + gap) return false;
    }
  }
  // The frame is a band inside the posts' bounding box, at the back end.
  if (y1 > spacer.back - SPACER.thickness - gap && y0 < spacer.back + gap) {
    const inside = [
      [box.min[0], box.min[2]],
      [box.max[0], box.min[2]],
      [box.min[0], box.max[2]],
      [box.max[0], box.max[2]],
    ].every(([x, z]) => spacerDistance(spacer, x, z) <= -(SPACER.frame + gap));
    if (!inside) return false;
  }
  return true;
}

/** Whether the spacer's frame and tubes stay a wall inside the hollow head at the split. */
function spacerFits(L: CharacterLayout, spacer: Spacer): boolean {
  const core = headCoreSdf(L);
  const y = spacer.back - SPACER.thickness / 2;
  return spacer.posts.every(([px, pz]) =>
    Array.from({ length: 12 }, (_, i) => (i * Math.PI) / 6).every(
      (a) =>
        core([px + SPACER.tube * Math.cos(a), y, pz + SPACER.tube * Math.sin(a)]) <=
        -(L.wall + 0.3),
    ),
  );
}

/**
 * Cut placement and battery fit. `pegFloorZ` is the lowest height the neck peg's socket may
 * reach (the top of the character's solid body core).
 */
export function validateCharacter(
  values: Params,
  L: CharacterLayout,
  pegFloorZ: number,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (L.split.cut && L.split.y < L.pocketBack + 0.5) {
    issues.push({
      key: "headSplitOffset",
      message: "The head split runs through the display pocket; move it back.",
    });
  } else if (L.spacer && L.spacer.back - SPACER.thickness < L.spacer.front) {
    issues.push({
      key: "headSplitOffset",
      message: "The head split is too close to the board for its spacer; move it back.",
    });
  } else if (L.spacer && !spacerFits(L, L.spacer)) {
    issues.push({
      key: "faceMargin",
      message:
        "The board's spacer does not fit inside the head at the split. Increase the face margin or move the head split forward.",
    });
  }
  if (L.neck.cut) {
    // The hollow's floor runs wall + 2 above the cut, parallel to it; under the display it
    // must stay a wall below the display's lowest point (its pocket rim), and below the room
    // the module keeps free there, front and back.
    const cos = Math.cos(L.neck.tilt * deg);
    const floorAt = (y: number) => neckHeightAt(L.neck, y) + (L.wall + 2) / cos;
    const displayBottom = L.cz - L.footprint.bottom;
    const limit = Math.min(displayBottom - L.wall, displayBottom - L.room.bottom);
    if (Math.max(floorAt(L.faceY), floorAt(L.pocketBack)) > limit) {
      issues.push({
        key: "neckCutOffset",
        message: "The neck cut runs into the display; move it down or tilt it less.",
      });
    } else if (L.neck.z - (L.neck.pegLength + 1) * cos < pegFloorZ) {
      issues.push({
        key: "neckCutOffset",
        message: "The neck cut is too low for the neck peg; move it up.",
      });
    }
  }
  const pouch = selectedBattery(values);
  if (pouch && !placeBattery(L, pouch)) {
    issues.push({
      key: "battery",
      message:
        "The battery does not fit behind the display. Increase the head depth or face margin, or pick a smaller battery.",
    });
  }
  return issues;
}

/** faceMargin and headDepth, the head params `headSize` reads (group "Shape"). */
export function headParams(): ParamSpec[] {
  return [
    {
      kind: "number",
      key: "faceMargin",
      label: "Face margin",
      group: "Shape",
      unit: "mm",
      default: 5,
      min: 4,
      max: 20,
      step: 0.5,
      help: "Flat face around the display; sets the head size.",
    },
    {
      kind: "number",
      key: "headDepth",
      label: "Head depth",
      group: "Shape",
      unit: "%",
      default: 80,
      min: 50,
      max: 120,
      step: 1,
      help: "Front to back, relative to the width. Never less than the display needs.",
    },
  ];
}

/** The "Cuts" param group. `splitHelp` explains where the split's zero sits. */
export function cutParams(splitHelp: string): ParamSpec[] {
  return [
    {
      kind: "boolean",
      key: "neckCut",
      label: "Cut head from body",
      group: "Cuts",
      default: true,
      help: "The head plugs onto the body with a peg. Off: head and body print as one piece.",
    },
    {
      kind: "number",
      key: "neckCutOffset",
      label: "Neck cut height",
      group: "Cuts",
      unit: "mm",
      default: 0,
      min: -15,
      max: 15,
      step: 0.5,
      visibleWhen: (v) => v.neckCut === true,
      help: "Up or down from just under the head. Keep it clear of the chin and tail.",
    },
    {
      kind: "number",
      key: "neckCutTilt",
      label: "Neck cut tilt",
      group: "Cuts",
      unit: "°",
      default: 0,
      min: -30,
      max: 30,
      step: 1,
      visibleWhen: (v) => v.neckCut === true,
      help: "Positive raises the front (under the chin), negative raises the back (over the tail).",
    },
    {
      kind: "boolean",
      key: "headSplit",
      label: "Split head front/back",
      group: "Cuts",
      default: true,
      help: "Opens the head for the display. Off: the display cannot be fitted.",
    },
    {
      kind: "number",
      key: "headSplitOffset",
      label: "Head split position",
      group: "Cuts",
      unit: "mm",
      default: 0,
      min: -15,
      max: 15,
      step: 0.5,
      visibleWhen: (v) => v.headSplit === true,
      help: splitHelp,
    },
  ];
}

export type AccentMode = "inplace" | "glue" | "none";

/**
 * The "Print" param group. `accents` names what the accent colour applies to; `glue` offers
 * glued-on accents, which only works when every accent has a flat back.
 */
export function printParams(options: {
  accents: string;
  glue: boolean;
  bodyColor: string;
  accentColor: string;
}): ParamSpec[] {
  return [
    {
      kind: "number",
      key: "wall",
      label: "Wall thickness",
      group: "Print",
      unit: "mm",
      default: 2,
      min: 1.2,
      max: 4,
      step: 0.1,
    },
    {
      kind: "number",
      key: "fit",
      label: "Fit clearance",
      group: "Print",
      unit: "mm",
      default: 0.2,
      min: 0,
      max: 0.6,
      step: 0.05,
      help: "Gap around the neck peg and the filament dowels.",
    },
    {
      kind: "select",
      key: "accentMode",
      label: options.accents,
      group: "Print",
      default: "inplace",
      options: [
        { value: "inplace", label: "Second colour, printed in place" },
        ...(options.glue ? [{ value: "glue", label: "Second colour, glued on" }] : []),
        { value: "none", label: "Same colour" },
      ],
      help: "Printed in place needs a multi-colour printer.",
    },
    {
      kind: "color",
      key: "bodyColor",
      label: "Body colour",
      group: "Print",
      default: options.bodyColor,
    },
    {
      kind: "color",
      key: "accentColor",
      label: "Accent colour",
      group: "Print",
      default: options.accentColor,
      visibleWhen: (v) => v.accentMode !== "none",
    },
    {
      kind: "select",
      key: "detail",
      label: "Mesh detail",
      group: "Print",
      default: "normal",
      options: [
        { value: "draft", label: "Draft (fast)" },
        { value: "normal", label: "Normal" },
        { value: "fine", label: "Fine (slow)" },
      ],
    },
  ];
}

/** The selected accent mode. */
export function accentMode(values: Params): AccentMode {
  const mode = str(values, "accentMode");
  return mode === "glue" || mode === "none" ? mode : "inplace";
}
