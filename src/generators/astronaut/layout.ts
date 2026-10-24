import { BATTERIES, DISPLAYS } from "../../characters/hardware";
import { bool, num, str } from "../../core/params";
import {
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
import type { Params, ValidationIssue } from "../../core/types";

/**
 * The astronaut's shapes and fittings from its params, built Deskimon-style from a few
 * blocks: a flat-fronted pillow head around the Waveshare 2.8" board (landscape, USB-C on the
 * right), a torso of two stacked superellipsoids blended together, slab arms, and rounded-box
 * feet, joined with small fillets. Main-thread safe (pure math), so `validate` can use it.
 *
 * Frame: Z up, face toward -Y, millimetres. The face (head front) is the plane y = 0, centred
 * on x = 0 and on the screen's visible area. The body rests on z = 0.
 *
 * The head prints as two halves split at `seamY`, held together by the "triangle": a boss on
 * each side, split by the seam and capped by a helmet disc that snaps on (see SNAP), and the
 * neck stem, split the same way and held in the body's socket. Bosses and stem have a lemon
 * profile (a circle with 45° points toward ±y), so each half's share prints without support.
 */

const BOARD = DISPLAYS["waveshare-s3-touch-lcd-28"].module;
const BATTERY = BATTERIES["502030"].size;
/** Shell wall; the glass rests on the inside of the front wall. */
export const WALL = 2.5;
/** Depth of the flat front rim before the back starts rounding. */
const RIM = 8;
/** How far the head sinks into the top of the body. */
export const HEAD_SINK = 3;

/** Side bosses: lemon radius and how far they stand out of the wall. */
export const BOSS = { radius: 5, length: 5 };
/** Helmet disc thickness; its bore is the boss profile plus `fit`, `length` + 0.3 deep. */
export const DISC = { thickness: 7, fit: 0.15 };
/**
 * Snap latch on each boss half: the lemon's point becomes a finger, a square turned 45°
 * (`finger` across its diagonal) whose outer faces are the lemon's flanks. A `slot` gap frees
 * it from its half toward the seam (and from the side wall where it passes through), so it
 * bends toward the other half. Its root sits `root` inside the wall, on a `knob` inside the
 * head. Near the tip it carries a catch standing `catch` out of the lemon point, with 45° faces
 * (unsupported in print, and a firm pull releases the disc), which clicks into a groove in the
 * disc's bore.
 */
export const SNAP = { finger: 3, slot: 0.5, catch: 0.5, root: 2, knob: 4 };
/** Neck stem: lemon radius, length below the head, and the socket's clearance. */
export const STEM = { radius: 7, length: 8, fit: 0.2 };
/** Posts from the back wall onto the board's standoff tips, with a socket over each tip. */
export const POST = { radius: 3.8, socket: 3.05, socketDepth: 1.5 };
/** Seam tongue on the front half: inset from the outside, and height into the back half. */
export const TONGUE = { outer: 1.2, inner: 3.4, height: 2, fit: 0.15 };
/** Speaker fences on the back wall: wall, height, clearance around the speaker, lead gap. */
export const FENCE = { wall: 1.2, height: 3, fit: 0.3, gap: 7 };
/** Grille holes behind each speaker. */
export const GRILLE = { radius: 1, pitch: 3.2 };
/** USB-C opening (along the edge, across), corner radius. */
export const USB_OPENING = { long: 13, short: 7, corner: 2 };
export const PIN_HOLE = 1.6;
/** Board pocket: depth of the frame that locates the glass, and its clearance. */
export const POCKET = { depth: 1.5, fit: 0.3 };

/**
 * Board stack behind the glass front: board to its standoff tips, the battery, the speakers
 * flat on the back wall with their fences, clearances, the back wall, and 2 mm of rounding.
 */
export const MIN_HEAD_DEPTH =
  WALL + BOARD.thickness + BATTERY[0] + (BOARD.speakers?.size[2] ?? 0) + 3 + WALL + 2;

type Rect = { cx: number; cz: number; hx: number; hz: number };
/** A rectangle in the face plane: centre and half sizes (x, z). */
export type FaceRect = { x: number; z: number; hx: number; hz: number };

/** A superellipsoid: exponent 2 is an ellipsoid, larger exponents approach a box. */
export type Volume = { center: Vec3; half: Vec3; exponent: number };

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
    /** The board's glass and visible area; centres relative to the face centre. */
    glass: Rect;
    view: Rect;
  };
  /** Where the head splits into its front and back half. */
  seamY: number;
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
  /** Helmet disc radius; the discs sit on the seam at the head's sides, centred in height. */
  discRadius: number;
  /** USB-C opening centre on the right side. */
  usb: { y: number; z: number };
  /** Pin holes to the board's buttons, straight up through the top. */
  pinHoles: { name: string; x: number; y: number; z: number }[];
  /** Standoff tips (x, z), at depth `postTip`. */
  posts: [number, number][];
  postTip: number;
  /** Speaker footprints on the back wall (face plane), long side vertical. */
  speakers: FaceRect[];
  patch: boolean;
  colors: { suit: string; trim: string; patch: string; eyes: string };
  meshEdge: number;
};

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * The board's glass and visible area in the face, landscape with USB-C on the right, and the
 * head size they need. Module frame: u right, v toward USB-C; landscape turns v to the face's
 * right and u downward, so module (u, v) is face (x, z) = (v, -u).
 */
export function boardInFace() {
  if (BOARD.shape.kind !== "rect") throw new Error("The astronaut expects a rectangular board");
  const { width, height, viewWidth, viewHeight } = BOARD.shape;
  const off = BOARD.outlineOffset ?? 0;
  const room = Math.max(BOARD.room?.right ?? 0, BOARD.room?.left ?? 0);
  const glass: Rect = { cx: off, cz: 0, hx: height / 2, hz: width / 2 };
  const view: Rect = { cx: 0, cz: 0, hx: viewHeight / 2, hz: viewWidth / 2 };
  // The face is centred on the visible area, so the head is as wide as the farther side needs;
  // the plug room past the module's right edge (now the bottom) sets the height.
  return {
    glass,
    view,
    minHalfWidth: glass.hx + Math.abs(glass.cx) + WALL,
    minHalfHeight: glass.hz + room + WALL,
  };
}

export function astronautLayout(values: Params): AstronautLayout {
  const board = boardInFace();
  const hw = board.minHalfWidth + num(values, "headMarginSide");
  const hh = board.minHalfHeight + num(values, "headMarginTop");
  const depth = num(values, "headDepth");

  // The torso sits under the head's middle. The lower volume reaches a quarter of its height
  // below the base, so the base cut leaves a broad flat foot; the upper one is centred
  // `upperOffset` above the lower one's top, and the torso is cut flat where the upper one is
  // 0.4 of its height above its centre, just under its peak.
  const cy = depth * 0.45;
  const volume = (prefix: "lower" | "upper", z0: number, z1: number): Volume => ({
    center: [0, cy - num(values, `${prefix}Forward`), (z0 + z1) / 2],
    half: [num(values, `${prefix}Width`) / 2, num(values, `${prefix}Depth`) / 2, (z1 - z0) / 2],
    exponent: 2 + 10 * (1 - num(values, `${prefix}Roundness`) / 100),
  });
  const lowerTop = num(values, "lowerHeight");
  const upperHeight = num(values, "upperHeight");
  const upperCenter = lowerTop + num(values, "upperOffset");
  const lower = volume("lower", -0.25 * lowerTop, lowerTop);
  const upper = volume("upper", upperCenter - upperHeight / 2, upperCenter + upperHeight / 2);
  const top = upperCenter + 0.4 * upperHeight;
  const cz = top - HEAD_SINK + hh;

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

  // Board fittings, behind the glass front at y = WALL.
  const usbDepth = BOARD.usb?.depth ?? 0;
  const usb = { y: WALL + usbDepth, z: cz - (BOARD.usb?.along ?? 0) };
  const discRadius = num(values, "earSize");
  // The seam goes through the middle of the head, but far enough back that the right disc
  // clears the USB-C opening in front of it.
  const seamY = Math.max(depth * 0.45, usb.y + USB_OPENING.short / 2 + 1.5 + discRadius);
  const pinHoles = (BOARD.buttons ?? []).map((b) => ({
    name: b.name,
    x: b.at[1],
    y: WALL + b.depth,
    z: cz - b.at[0],
  }));
  const posts = (BOARD.standoffs?.at ?? []).map(([u, v]): [number, number] => [v, cz - u]);
  const postTip = WALL + BOARD.thickness;

  // Speakers stand side by side on the back wall, long side vertical, centred between the
  // posts' columns.
  const [across, long] = BOARD.speakers?.size ?? [0, 0];
  const fx = across / 2 + FENCE.fit + FENCE.wall;
  const fz = long / 2 + FENCE.fit + FENCE.wall;
  const xs = posts.map(([x]) => x);
  const mid = xs.length > 0 ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
  const speakers: FaceRect[] = BOARD.speakers
    ? [-1, 1].map((s) => ({ x: mid + s * (fx + 0.5), z: cz, hx: fx, hz: fz }))
    : [];

  return {
    head: {
      hw,
      hh,
      depth,
      cz,
      corner: (num(values, "headCorner") / 100) * Math.min(hw, hh),
      frontEdge: num(values, "headFrontEdge"),
      backRadius: (num(values, "headBackRound") / 100) * (depth - RIM),
      glass: board.glass,
      view: board.view,
    },
    seamY,
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
    discRadius,
    usb,
    pinHoles,
    posts,
    postTip,
    speakers,
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

// ---- Validation --------------------------------------------------------------------------

/** Rules the shape params can break; each names the param most likely to fix it. */
export function validateLayout(L: AstronautLayout): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!torsoConnected(L)) {
    issues.push({
      key: "upperOffset",
      message:
        "The upper volume no longer reaches the lower one; lower the offset or raise the volume blend.",
    });
  }
  const { hw, hh, depth, corner, frontEdge, backRadius } = L.head;
  // The discs need the flat part of the sides: below the corner rounding, in front of the back's.
  if (L.discRadius > hh - corner - 1) {
    issues.push({
      key: "earSize",
      message:
        "The helmet discs are taller than the flat part of the head's sides; make them smaller or the corners less round.",
    });
  }
  if (L.seamY + L.discRadius > depth - backRadius + 1) {
    issues.push({
      key: "headBackRound",
      message:
        "The helmet discs reach into the rounding of the head's back; deepen the head or round the back less.",
    });
  }
  if (L.seamY - L.discRadius < frontEdge) {
    issues.push({
      key: "earSize",
      message: "The helmet discs reach the face's edge; make them smaller.",
    });
  }
  // Speakers sit on the flat part of the back wall, clear of the posts.
  const flatX = hw - backRadius - WALL;
  const flatZ = hh - backRadius - WALL;
  const onFlat = L.speakers.every(
    (s) => Math.abs(s.x) + s.hx <= flatX && Math.abs(s.z - L.head.cz) + s.hz <= flatZ,
  );
  if (!onFlat) {
    issues.push({
      key: "headBackRound",
      message:
        "The back is too round to hold the speakers flat; round it less or make the head larger.",
    });
  }
  if (!socketFits(L)) {
    issues.push({
      key: "upperWidth",
      message:
        "The top of the body is too small for the neck socket; widen or deepen the upper volume.",
    });
  }
  return issues;
}

/**
 * Whether the neck socket, with 2 mm of wall, lies inside the torso from its bottom up to its
 * rim, the floor of the saddle the head sits in.
 */
function socketFits(L: AstronautLayout): boolean {
  const torso = torsoSdf(L);
  const r = STEM.radius + STEM.fit + 2;
  const rim = L.body.top - HEAD_SINK;
  for (const z of [rim - STEM.length - 0.5, rim - 0.5]) {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * 2 * Math.PI;
      // The lemon's points reach r·√2 along y.
      const ry = Math.abs(Math.cos(a)) > 0.7 ? r * Math.SQRT2 : r;
      const p: Vec3 = [r * Math.sin(a), L.seamY + ry * Math.cos(a), z];
      if (torso(p) > 0) return false;
    }
  }
  return true;
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
  const { hw, hh, depth, cz, corner, frontEdge, backRadius: R } = L.head;
  const front = extrudeY((x, z) => rect2(x, z, 0, cz, hw, hh, corner), 0, RIM + 1, frontEdge);
  const back: Sdf = (p) => {
    // The outline shrinks on a quarter circle over the last R mm: a pillow, not a box.
    const t = Math.max(p[1] - (depth - R), 0);
    const shrink = R - Math.sqrt(Math.max(R * R - t * t, 0));
    const d2 = rect2(p[0], p[2], 0, cz, hw - shrink, hh - shrink, Math.max(corner - shrink, 0.5));
    return Math.max(d2, p[1] - depth, RIM - 2 - p[1]);
  };
  // Plain union: rim and back share the outline where they overlap, so no crease to soften.
  return (p) => Math.min(front(p), back(p));
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

/** The two torso volumes blended together, without limbs or cuts. */
export function torsoSdf(L: AstronautLayout): Sdf {
  const lower = superellipsoid(L.body.lower);
  const upper = superellipsoid(L.body.upper);
  const k = L.body.stackBlend;
  return (p) => smoothUnion(lower(p), upper(p), k);
}

/**
 * Whether the torso volumes form one piece: samples the blended torso every 0.25 mm on the
 * segment between the two volume centres, which is inside both shapes at its ends.
 */
export function torsoConnected(L: AstronautLayout): boolean {
  const torso = torsoSdf(L);
  const a = L.body.lower.center;
  const b = L.body.upper.center;
  const steps = Math.max(1, Math.ceil(Math.sqrt(dot(sub(b, a), sub(b, a))) / 0.25));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p: Vec3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    if (torso(p) > 0) return false;
  }
  return true;
}

/**
 * Torso, arms, and legs, flat at the base, with the head's bottom pressed into the top (0.3 mm
 * clear of it). The neck socket is cut exactly in build.ts.
 */
export function bodySdf(L: AstronautLayout): Sdf {
  const { top, blend } = L.body;
  const torso = torsoSdf(L);
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
    let d = smoothUnion(torso(p), arm(p), blend);
    d = smoothUnion(d, leg(p), blend);
    return Math.max(d, -p[2], p[2] - top, -(head(p) - 0.3));
  };
}

/** A helmet disc's outside on side `s`: inner face on the head's side, rounded outer rim. */
export function discSdf(L: AstronautLayout, s: 1 | -1): Sdf {
  const x = s * (L.head.hw + DISC.thickness / 2);
  const center: Vec3 = [x, L.seamY, L.head.cz];
  const half = DISC.thickness / 2;
  return (p) => roundCylinder(p, center, 0, L.discRadius, half, 1.8);
}

/**
 * The chest patch: a 1.2 mm shell centred on the body's surface over the upper volume's
 * front, so it stands 0.6 mm proud; build.ts cuts it out of the body so the two colours
 * meet without overlapping.
 */
export function patchSdf(L: AstronautLayout): Sdf {
  const body = bodySdf(L);
  const { top, upper } = L.body;
  const front = upper.center[1] - upper.half[1] / 2;
  return (p) =>
    Math.max(
      Math.abs(body(p)) - 0.6,
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

export function discBounds(L: AstronautLayout, s: 1 | -1): Box3 {
  const x0 = L.head.hw;
  const x1 = x0 + DISC.thickness;
  const r = L.discRadius;
  const [lo, hi] = s > 0 ? [x0, x1] : [-x1, -x0];
  return { min: [lo, L.seamY - r, L.head.cz - r], max: [hi, L.seamY + r, L.head.cz + r] };
}

export function patchBounds(L: AstronautLayout): Box3 {
  const { top, lower, upper, stackBlend } = L.body;
  // The patch's height can fall on either volume, so reach past both fronts and the bulge.
  const front = Math.min(span(lower, 1)[0], span(upper, 1)[0]) - stackBlend / 4 - 2;
  return {
    min: [-0.4 * upper.half[0] - 2, front, 0.5 * top - 2],
    max: [0.4 * upper.half[0] + 2, upper.center[1] - upper.half[1] / 2 + 1, 0.72 * top + 2],
  };
}

/** The eyes' rectangles in the face, for the stand-in screen. */
export function eyeRects(L: AstronautLayout): FaceRect[] {
  const { cz, view } = L.head;
  const k = Math.min(view.hx, view.hz) / 24.5;
  const ex = Math.min(view.hx * 0.42, 10 * k + 2);
  return [-1, 1].map((s) => ({ x: s * ex, z: cz, hx: 5 * k, hz: 8 * k }));
}
