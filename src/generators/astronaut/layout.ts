import { BATTERIES, DISPLAYS } from "../../characters/hardware";
import { bool, num, str } from "../../core/params";
import {
  capsule,
  cross,
  dot,
  normalize,
  roundCylinder,
  smoothUnion,
  sub,
  type Box3,
  type Sdf,
  type Vec3,
} from "../../core/sdf";
import type { Params } from "../../core/types";

/**
 * The astronaut's shapes from its params, built Deskimon-style from a few blocks: a flat-
 * fronted pillow head sized around the Waveshare 2.8" board, a torso of two stacked
 * superellipsoids blended together, slab arms, and rounded-box legs, joined with small
 * fillets. Main-thread safe (pure math).
 *
 * Frame: Z up, face toward -Y, millimetres. The face (head front) is the plane y = 0, centred
 * on x = 0 and on the screen's visible area. The body rests on z = 0.
 */

const BOARD = DISPLAYS["waveshare-s3-touch-lcd-28"].module;
/** Wall around the board's outline and plug room. */
const WALL = 2.5;
/** Depth of the flat front rim before the back starts rounding. */
const RIM = 8;
/** How far the head sinks into the top of the body. */
const HEAD_SINK = 3;

/**
 * Board stack behind the glass front: board to its standoff tips, 2 mm spacer, the default
 * battery, the speakers flat on the back wall, 1 mm clearance between the four layers, the
 * back wall, and 2 mm for the back's rounding.
 */
export const MIN_HEAD_DEPTH =
  BOARD.thickness + 2 + BATTERIES["502030"].size[0] + (BOARD.speakers?.size[2] ?? 0) + 3 + WALL + 2;

type Rect = { cx: number; cz: number; hx: number; hz: number };

export type AstronautLayout = {
  head: {
    /** Half width, half height, depth, centre height. */
    hw: number;
    hh: number;
    depth: number;
    cz: number;
    corner: number;
    frontEdge: number;
    /** Radius of the back's rounding. */
    backRadius: number;
    /** The board's glass and visible area, centres relative to the face centre. */
    glass: Rect;
    view: Rect;
  };
  body: {
    /** Torso centre along y. */
    cy: number;
    /** The flat top the head sits on. */
    top: number;
    lower: Volume;
    upper: Volume;
    /** Fillet between the two volumes. */
    stackBlend: number;
    /** Fillet where arms and legs meet the torso. */
    blend: number;
  };
  arms: { shoulder: Vec3; hand: Vec3; thickness: number; width: number; radius: number };
  legs: { hip: Vec3; toe: Vec3; width: number; height: number; radius: number };
  ears: { radius: number; thickness: number } | null;
  antenna: boolean;
  patch: boolean;
  colors: { suit: string; trim: string; patch: string; eyes: string };
  meshEdge: number;
};

/** A superellipsoid: exponent 2 is an ellipsoid, larger exponents approach a box. */
export type Volume = { center: Vec3; half: Vec3; exponent: number };

const rad = (deg: number) => (deg * Math.PI) / 180;

/** The board's glass and visible area in the face, and the head size they need. */
export function boardInFace(landscape: boolean) {
  if (BOARD.shape.kind !== "rect") throw new Error("The astronaut expects a rectangular board");
  const { width, height, viewWidth, viewHeight } = BOARD.shape;
  const off = BOARD.outlineOffset ?? 0;
  const room = { right: BOARD.room?.right ?? 0, left: BOARD.room?.left ?? 0 };
  // Module frame: u right, v toward the USB-C edge. Landscape turns v to the face's right
  // (module right edge at the bottom); portrait turns v down (module right edge on the left).
  const glass: Rect = landscape
    ? { cx: off, cz: 0, hx: height / 2, hz: width / 2 }
    : { cx: 0, cz: -off, hx: width / 2, hz: height / 2 };
  const view: Rect = landscape
    ? { cx: 0, cz: 0, hx: viewHeight / 2, hz: viewWidth / 2 }
    : { cx: 0, cz: 0, hx: viewWidth / 2, hz: viewHeight / 2 };
  const reach = landscape
    ? { x: glass.hx + Math.abs(glass.cx), z: glass.hz + Math.max(room.right, room.left) }
    : { x: glass.hx + Math.max(room.right, room.left), z: glass.hz + Math.abs(glass.cz) };
  // The face is centred on the visible area, so the head is as wide as the farther side needs.
  return { glass, view, minHalfWidth: reach.x + WALL, minHalfHeight: reach.z + WALL };
}

export function astronautLayout(values: Params): AstronautLayout {
  const landscape = str(values, "screen") === "landscape";
  const board = boardInFace(landscape);
  const hw = board.minHalfWidth + num(values, "headMarginSide");
  const hh = board.minHalfHeight + num(values, "headMarginTop");
  const depth = num(values, "headDepth");

  // The torso sits under the head's middle, where the neck stem will go. The lower volume
  // reaches a quarter of its height below the base, so the base cut leaves a broad flat foot;
  // the upper one is centred on the lower one's top, and the torso is cut flat where the
  // upper one is 0.4 of its height above that, just under its peak.
  const cy = depth * 0.45;
  const volume = (prefix: "lower" | "upper", z0: number, z1: number): Volume => ({
    center: [0, cy - num(values, `${prefix}Forward`), (z0 + z1) / 2],
    half: [num(values, `${prefix}Width`) / 2, num(values, `${prefix}Depth`) / 2, (z1 - z0) / 2],
    exponent: 2 + 10 * (1 - num(values, `${prefix}Roundness`) / 100),
  });
  const lowerTop = num(values, "lowerHeight");
  const upperHeight = num(values, "upperHeight");
  const lower = volume("lower", -0.25 * lowerTop, lowerTop);
  const upper = volume("upper", lowerTop - upperHeight / 2, lowerTop + upperHeight / 2);
  const top = lowerTop + 0.4 * upperHeight;

  const armThickness = num(values, "armThickness");
  const armWidth = num(values, "armWidth");
  const shoulder: Vec3 = [upper.half[0] - 0.36 * armThickness, upper.center[1], 0.83 * top];
  const out = rad(num(values, "armAngle"));
  const fwd = rad(num(values, "armForward"));
  const armLength = num(values, "armLength");
  const hand: Vec3 = [
    shoulder[0] + armLength * Math.sin(out) * Math.cos(fwd),
    shoulder[1] - armLength * Math.sin(fwd),
    shoulder[2] - armLength * Math.cos(out) * Math.cos(fwd),
  ];

  const legHeight = num(values, "legHeight");
  const legWidth = num(values, "legWidth");
  const toeOut = rad(num(values, "legAngle"));
  const legLength = num(values, "legLength");
  // Legs start inside the torso's front half and point forward, toes turned out.
  const hip: Vec3 = [
    num(values, "legSpread"),
    lower.center[1] - 0.26 * lower.half[1],
    legHeight / 2 - 1.4,
  ];
  const toe: Vec3 = [
    hip[0] + legLength * Math.sin(toeOut),
    hip[1] - legLength * Math.cos(toeOut),
    hip[2],
  ];
  const limbRound = (key: string, a: number, b: number) =>
    (num(values, key) / 100) * Math.min(a, b) * 0.5;

  return {
    head: {
      hw,
      hh,
      depth,
      cz: top - HEAD_SINK + hh,
      corner: (num(values, "headCorner") / 100) * Math.min(hw, hh),
      frontEdge: num(values, "headFrontEdge"),
      backRadius: (num(values, "headBackRound") / 100) * (depth - RIM),
      glass: board.glass,
      view: board.view,
    },
    body: {
      cy,
      top,
      lower,
      upper,
      stackBlend: num(values, "stackBlend"),
      blend: num(values, "blend"),
    },
    arms: {
      shoulder,
      hand,
      thickness: armThickness,
      width: armWidth,
      radius: limbRound("armRoundness", armThickness, armWidth),
    },
    legs: {
      hip,
      toe,
      width: legWidth,
      height: legHeight,
      radius: limbRound("legRoundness", legWidth, legHeight),
    },
    ears: bool(values, "helmetEars") ? { radius: num(values, "earSize"), thickness: 7 } : null,
    antenna: bool(values, "helmetEars") && bool(values, "antenna"),
    patch: bool(values, "chestPatch"),
    colors: {
      suit: str(values, "suitColor"),
      trim: str(values, "trimColor"),
      patch: str(values, "patchColor"),
      eyes: str(values, "eyeColor"),
    },
    meshEdge: num(values, "meshEdge"),
  };
}

// ---- Distance functions ------------------------------------------------------------------

/** 2D rounded rectangle in the x–z plane: centre, half sizes, corner radius. */
function rect2(x: number, z: number, cx: number, cz: number, hx: number, hz: number, r: number) {
  const qx = Math.abs(x - cx) - hx + r;
  const qz = Math.abs(z - cz) - hz + r;
  const ox = Math.max(qx, 0);
  const oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oz * oz) + Math.min(Math.max(qx, qz), 0) - r;
}

/** A 2D x–z shape extruded along y from `y0` to `y1`, both rims rounded by `edge`. */
function extrudeY(d2: (x: number, z: number) => number, y0: number, y1: number, edge: number): Sdf {
  const cy = (y0 + y1) / 2;
  const hy = (y1 - y0) / 2;
  return (p) => {
    const dr = d2(p[0], p[2]) + edge;
    const da = Math.abs(p[1] - cy) - hy + edge;
    const or = Math.max(dr, 0);
    const oa = Math.max(da, 0);
    return Math.min(Math.max(dr, da), 0) + Math.sqrt(or * or + oa * oa) - edge;
  };
}

/**
 * Rounded box along segment a→b (the segment's ends are the box's ends). `hv` is the half size
 * across the segment perpendicular to `hint`, `hw` the half size toward `hint`.
 */
function slab(a: Vec3, b: Vec3, hv: number, hw: number, r: number, hint: Vec3): Sdf {
  const d = sub(b, a);
  const hu = Math.sqrt(dot(d, d)) / 2;
  const [cx, cy, cz] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const u = normalize(d);
  const v = normalize(cross(hint, u));
  const w = cross(u, v);
  return (p) => {
    const x = p[0] - cx;
    const y = p[1] - cy;
    const z = p[2] - cz;
    const qu = Math.abs(x * u[0] + y * u[1] + z * u[2]) - hu + r;
    const qv = Math.abs(x * v[0] + y * v[1] + z * v[2]) - hv + r;
    const qw = Math.abs(x * w[0] + y * w[1] + z * w[2]) - hw + r;
    const ou = Math.max(qu, 0);
    const ov = Math.max(qv, 0);
    const ow = Math.max(qw, 0);
    return Math.sqrt(ou * ou + ov * ov + ow * ow) + Math.min(Math.max(qu, qv, qw), 0) - r;
  };
}

const mirrored = (side: (s: 1 | -1) => Sdf): Sdf => {
  const left = side(-1);
  const right = side(1);
  return (p) => (p[0] < 0 ? left(p) : right(p));
};

/** The head's outside: a flat rim around the face, then a back rounded on `backRadius`. */
export function headSdf(L: AstronautLayout): Sdf {
  const { hw, hh, depth, cz, corner, frontEdge, backRadius: R, view } = L.head;
  const front = extrudeY((x, z) => rect2(x, z, 0, cz, hw, hh, corner), 0, RIM + 1, frontEdge);
  const window = extrudeY(
    (x, z) => rect2(x, z, view.cx, cz + view.cz, view.hx + 0.6, view.hz + 0.6, 2.5),
    -1,
    1.2,
    0.4,
  );
  const back: Sdf = (p) => {
    // The outline shrinks on a quarter circle over the last R mm: a pillow, not a box.
    const t = Math.max(p[1] - (depth - R), 0);
    const shrink = R - Math.sqrt(Math.max(R * R - t * t, 0));
    const d2 = rect2(p[0], p[2], 0, cz, hw - shrink, hh - shrink, Math.max(corner - shrink, 0.5));
    return Math.max(d2, p[1] - depth, RIM - 2 - p[1]);
  };
  // Plain union: rim and back share the outline where they overlap, so no crease to soften.
  return (p) => Math.max(Math.min(front(p), back(p)), -window(p));
}

/** The board's glass seen through the face window. Preview only. */
export function screenSdf(L: AstronautLayout): Sdf {
  const { cz, glass } = L.head;
  return extrudeY((x, z) => rect2(x, z, glass.cx, cz + glass.cz, glass.hx, glass.hz, 2), 1, 2, 0.3);
}

/** Two tall rounded eyes on the screen. Preview only; the firmware draws the real ones. */
export function eyesSdf(L: AstronautLayout): Sdf {
  const { cz, view } = L.head;
  const k = Math.min(view.hx, view.hz) / 24.5;
  const ex = Math.min(view.hx * 0.42, 10 * k + 2);
  return (p) =>
    Math.max(rect2(Math.abs(p[0]), p[2], ex, cz, 5 * k, 8 * k, 5 * k), Math.abs(p[1] - 0.55) - 0.4);
}

/**
 * Superellipsoid distance, approximate: the normalised radius minus one, scaled by the
 * smallest half size. Right sign and zero set, which is all meshing and blending need.
 */
function superellipsoid(v: Volume): Sdf {
  const [cx, cy, cz] = v.center;
  const [a, b, c] = v.half;
  const n = v.exponent;
  const scale = Math.min(a, b, c);
  return (p) => {
    const f =
      Math.abs((p[0] - cx) / a) ** n +
      Math.abs((p[1] - cy) / b) ** n +
      Math.abs((p[2] - cz) / c) ** n;
    return (f ** (1 / n) - 1) * scale;
  };
}

/** Torso, arms, and legs, flat at the base, with the head's bottom pressed into the top. */
export function bodySdf(L: AstronautLayout): Sdf {
  const { top, stackBlend, blend } = L.body;
  const lower = superellipsoid(L.body.lower);
  const upper = superellipsoid(L.body.upper);
  const { arms, legs } = L;
  const arm = mirrored((s) =>
    slab(
      [s * arms.shoulder[0], arms.shoulder[1], arms.shoulder[2]],
      [s * arms.hand[0], arms.hand[1], arms.hand[2]],
      arms.thickness / 2,
      arms.width / 2,
      arms.radius,
      [0, 1, 0],
    ),
  );
  const leg = mirrored((s) =>
    slab(
      [s * legs.hip[0], legs.hip[1], legs.hip[2]],
      [s * legs.toe[0], legs.toe[1], legs.toe[2]],
      legs.width / 2,
      legs.height / 2,
      legs.radius,
      [0, 0, 1],
    ),
  );
  const head = headSdf(L);
  return (p) => {
    let d = smoothUnion(lower(p), upper(p), stackBlend);
    d = smoothUnion(d, arm(p), blend);
    d = smoothUnion(d, leg(p), blend);
    return Math.max(d, -p[2], p[2] - top, -(head(p) - 0.2));
  };
}

/** Helmet discs on the head's sides, centred on its middle depth. */
export function earsSdf(L: AstronautLayout): Sdf {
  const ears = L.ears;
  if (!ears) throw new Error("No helmet ears");
  const { hw, depth, cz } = L.head;
  const x = hw + ears.thickness / 2;
  return (p) =>
    roundCylinder(
      p,
      [p[0] < 0 ? -x : x, depth * 0.45, cz],
      0,
      ears.radius,
      ears.thickness / 2,
      1.8,
    );
}

/** A thin antenna rising from the right helmet disc. */
export function antennaSdf(L: AstronautLayout): Sdf {
  const { hw, depth, cz } = L.head;
  const x = hw + 5;
  const y = depth * 0.45;
  return (p) => capsule(p, [x, y, cz + 8], [x, y, cz + 26], 1.2);
}

/** A 0.6 mm thick patch on the upper volume's front, following the body's surface. */
export function patchSdf(L: AstronautLayout): Sdf {
  const body = bodySdf(L);
  const { top, upper } = L.body;
  const front = upper.center[1] - upper.half[1] / 2;
  return (p) =>
    Math.max(
      body(p) - 0.6,
      rect2(p[0], p[2], 0, 0.61 * top, 0.4 * upper.half[0], 0.11 * top, 2),
      p[1] - front,
    );
}

// ---- Bounds ------------------------------------------------------------------------------

export function headBounds(L: AstronautLayout): Box3 {
  const { hw, hh, depth, cz } = L.head;
  return { min: [-hw, 0, cz - hh], max: [hw, depth, cz + hh] };
}

/** The extent of a volume along `axis`: [min, max]. */
const span = (v: Volume, axis: 0 | 1 | 2) => [
  v.center[axis] - v.half[axis],
  v.center[axis] + v.half[axis],
];

export function bodyBounds(L: AstronautLayout): Box3 {
  const { top, lower, upper, stackBlend, blend } = L.body;
  // A smooth union can bulge up to a quarter of its blend past both shapes.
  const bulge = (stackBlend + blend) / 4;
  const { arms, legs } = L;
  const armReach = Math.max(arms.thickness, arms.width) / 2;
  const legReach = Math.max(legs.width, legs.height) / 2;
  const xs = [
    lower.half[0],
    upper.half[0],
    arms.shoulder[0] + armReach,
    arms.hand[0] + armReach,
    legs.toe[0] + legReach,
  ];
  const ys = [
    span(lower, 1)[0],
    span(upper, 1)[0],
    arms.hand[1] - armReach,
    legs.toe[1] - legReach,
  ];
  const yBack = Math.max(span(lower, 1)[1], span(upper, 1)[1], arms.shoulder[1] + armReach);
  const x = Math.max(...xs) + bulge;
  return { min: [-x, Math.min(...ys) - bulge, 0], max: [x, yBack + bulge, top] };
}

export function earsBounds(L: AstronautLayout): Box3 {
  const ears = L.ears ?? { radius: 0, thickness: 0 };
  const { hw, depth, cz } = L.head;
  const y = depth * 0.45;
  const x = hw + ears.thickness + 1;
  const r = ears.radius + 1;
  return { min: [-x, y - r, cz - r], max: [x, y + r, cz + r] };
}

export function antennaBounds(L: AstronautLayout): Box3 {
  const { hw, depth, cz } = L.head;
  const y = depth * 0.45;
  return { min: [hw + 3, y - 2, cz + 6], max: [hw + 7, y + 2, cz + 28] };
}

export function patchBounds(L: AstronautLayout): Box3 {
  const { top, upper } = L.body;
  return {
    min: [-0.4 * upper.half[0] - 2, span(upper, 1)[0] - 2, 0.5 * top - 2],
    max: [0.4 * upper.half[0] + 2, upper.center[1] - upper.half[1] / 2 + 1, 0.72 * top + 2],
  };
}
