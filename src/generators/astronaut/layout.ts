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
 * right, or portrait, USB-C down), a torso of two stacked superellipsoids blended together,
 * slab arms, and rounded-box feet, joined with small fillets. Main-thread safe (pure math), so
 * `validate` can use it.
 *
 * Frame: Z up, face toward -Y, millimetres. The face (head front) is the plane y = 0, centred
 * on x = 0 and on the screen's visible area. The body rests on z = 0.
 *
 * The head prints as two halves split at `seamY`, held together by a boss on each side, split
 * by the seam and capped by a helmet disc that twists on (see TWIST). The bosses have a lemon
 * profile (a circle with 45° points toward ±y), so each half's share prints without support.
 * In landscape the neck stands under the front half and twists into the body's socket the same
 * way. In portrait the neck stands on the plug, with two mounts to choose from: the same twist
 * (the body then sits under the plug, forward of the head's middle), or a sleeve that pushes
 * straight down into a neck ring on a body centred under the head (see COLLAR).
 */

const BOARD = DISPLAYS["waveshare-s3-touch-lcd-28"].module;
const BATTERY = BATTERIES["502030"].size;
/** Shell wall; the glass rests on the inside of the front wall. */
export const WALL = 2.5;
/** Depth of the flat front rim before the back starts rounding. */
const RIM = 8;

/** Side bosses: lemon radius and how far they stand out of the wall. */
export const BOSS = { radius: 5, length: 5 };
export const DISC = { thickness: 7 };
/**
 * Twist lock between each boss and its disc. Each lemon point carries a hook at the boss's
 * tip: a square turned 45° (`width` half-diagonal) standing `hook` out of the point, flat for
 * `flat` behind the tip face, then a 45° back face down into the lemon. The disc's bore is
 * round (`boreFit` over the points), with two keyways the hooks slide down, then a groove
 * swept along their path as the disc turns `turn` degrees clockwise (seen from outside) to its
 * stop. The groove's ceiling rises `rise` along the way, so the turn draws the disc onto the
 * head and its 45° ceiling presses the hooks, and with them the halves, together. `fit` is the
 * clearance around the hooks everywhere except that ceiling at the stop.
 */
export const TWIST = {
  hook: 1.5,
  width: 2,
  flat: 0.8,
  fit: 0.25,
  boreFit: 0.2,
  turn: 70,
  rise: 0.8,
};
/** Wall kept round each groove the hooks turn in, in the discs and in the body. */
export const LOCK_WALL = 1.6;
/** Outer radius of that groove, for hooks standing on a profile `point` from the axis. */
export const grooveRadius = (point: number) => point + TWIST.hook + TWIST.fit * Math.SQRT2;
/** Smallest disc that keeps its wall around the groove. */
export const MIN_DISC_RADIUS =
  Math.ceil(2 * (grooveRadius(BOSS.radius * Math.SQRT2) + LOCK_WALL)) / 2;
/**
 * Neck under the head's front half in landscape: radius and length below the head. Round with
 * one 45° point toward the face, clipped to the radius: the point faces the bed when the front
 * half prints face down. Hooks on its front and back twist it into the body's socket (see
 * TWIST).
 */
export const NECK = { radius: 7, length: 8 };
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
/**
 * Portrait neck, on the plug, which passes down its axis through a USB-C opening with
 * `LOCK_WALL` round it. Twist mount: round with hooks, as in landscape. Ring mount: a sleeve
 * with flat sides `SLEEVE_FLAT` from the axis and a square back, which key it in its socket;
 * the front stays round with a 45° point, since it faces the bed.
 */
export const PLUG_NECK_RADIUS =
  Math.ceil(2 * (Math.hypot(USB_OPENING.long, USB_OPENING.short) / 2 + LOCK_WALL)) / 2;
export const SLEEVE_FLAT = USB_OPENING.long / 2 + LOCK_WALL;
/**
 * Portrait neck ring on the body, under the head: as tall as the sleeve is long, wide enough
 * to keep `LOCK_WALL` round the sleeve's socket, and a 45° cone below it down into the torso,
 * so it prints without support. The plug sits 9.7 mm behind the face, in front of the top of a
 * body centred under the head; the ring is what holds it.
 */
export const COLLAR = { height: NECK.length, fit: 0.25 };
/**
 * Portrait cable tunnel down through the base. Twist mount: round (`radius`), so the 12.2 × 6.3
 * plug can turn with the head below the neck. Ring mount: the plug's opening straight down.
 * Either way the cable's far plug threads through; `notch` is the width and height of the
 * groove under the base that leads the 4 mm cable out to the back.
 */
export const TUNNEL = { radius: 7.4, notch: 5 };
export const PIN_HOLE = 1.6;
/** Board pocket: depth of the frame that locates the glass, and its clearance. */
export const POCKET = { depth: 1.5, fit: 0.3 };
/** The window is this much larger than the visible area all round. */
export const WINDOW_MARGIN = 0.6;
/**
 * The chin's ramp starts this far below the window. There are at least 11.3 mm below the
 * window, so the param's 8 mm limit always leaves the ramp and a flat front.
 */
const CHIN_MARGIN = 2;

/**
 * Board stack behind the glass front: board to its standoff tips, the battery, the speakers
 * flat on the back wall with their fences, clearances, the back wall, and 2 mm of rounding.
 * A screen recess adds to it.
 */
export const MIN_HEAD_DEPTH =
  WALL + BOARD.thickness + BATTERY[0] + (BOARD.speakers?.size[2] ?? 0) + 3 + WALL + 2;
/**
 * The torso's centre behind the glass front. The body hangs on the board, not on the head's
 * size, so Depth grows the head backward and the screen recess grows it forward over a body,
 * neck, and plug that stay put.
 */
const BODY_BEHIND_GLASS = 17.75;

type Rect = { cx: number; cz: number; hx: number; hz: number };
/** A rectangle in the face plane: centre and half sizes (x, z). */
export type FaceRect = { x: number; z: number; hx: number; hz: number };

/** A superellipsoid: exponent 2 is an ellipsoid, larger exponents approach a box. */
export type Volume = { center: Vec3; half: Vec3; exponent: number };

export type PatchShape = "rounded" | "circle" | "hexagon" | "shield";
/**
 * Chest badge: the recess is at least `depth` deep, `fit` wider than the badge all round; the
 * badge stands `proud` out of the chest at its highest point; lettering is `letters` tall
 * with capitals `cap` of the badge's height.
 */
export const PATCH = { depth: 1, fit: 0.2, proud: 0.6, letters: 0.8, cap: 0.45 };
/**
 * The chest badge: shape, centred at x = 0 and height `z` inside a box of half sizes (hx, hz)
 * in the face plane, and its lettering (empty for none) in `font`.
 */
export type Patch = {
  shape: PatchShape;
  z: number;
  hx: number;
  hz: number;
  text: string;
  font: string;
};

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
    /** Depth of the glass front behind the face: the front wall plus the screen recess. */
    glassY: number;
    /**
     * How far the front stands out below the screen. The chin is the head's outline pulled
     * `chin` forward, under a 45° ramp that starts `CHIN_MARGIN` below the window.
     */
    chin: number;
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
  /** Neck axis (x, y) under the head's front half, and its radius. */
  neck: { x: number; y: number; radius: number };
  /**
   * Landscape: USB-C out of the right side. Portrait: USB-C down, the plug in the neck, the
   * cable through a tunnel in the body.
   */
  portrait: boolean;
  /**
   * Portrait ring mount: the neck ring's axis and radius, and the fillet that blends it into
   * the torso; it stands `COLLAR.height` on the body's top. Null when the head twists on.
   */
  collar: { x: number; y: number; radius: number; blend: number } | null;
  /** USB-C port centre: in the right side in landscape, in the bottom edge in portrait. */
  usb: { x: number; y: number; z: number };
  /**
   * Pin holes to the board's buttons, from the actuator straight out: up through the top in
   * landscape, out of the right side in portrait.
   */
  pinHoles: { name: string; x: number; y: number; z: number }[];
  /** Standoff tips (x, z), at depth `postTip`. */
  posts: [number, number][];
  postTip: number;
  /** Speaker footprints on the back wall (face plane), long side vertical. */
  speakers: FaceRect[];
  patch: Patch | null;
  colors: { suit: string; trim: string; patch: string; letters: string; eyes: string };
  meshEdge: number;
};

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Module (u, v) in the face (x, z), both from the visible area's centre. Module frame: u
 * right, v toward USB-C. Landscape turns v to the face's right, portrait turns it down (the
 * module's right edge on the face's left).
 */
const moduleToFace = (portrait: boolean, u: number, v: number): [number, number] =>
  portrait ? [-u, -v] : [v, -u];

/** The board's glass and visible area in the face, and the head size they need. */
export function boardInFace(portrait: boolean) {
  if (BOARD.shape.kind !== "rect") throw new Error("The astronaut expects a rectangular board");
  const { width, height, viewWidth, viewHeight } = BOARD.shape;
  const [cx, cz] = moduleToFace(portrait, 0, BOARD.outlineOffset ?? 0);
  // Plug room past the module's right and left edges: the face's bottom and top in
  // landscape, its sides in portrait.
  const room = Math.max(BOARD.room?.right ?? 0, BOARD.room?.left ?? 0);
  const glass: Rect = portrait
    ? { cx, cz, hx: width / 2, hz: height / 2 }
    : { cx, cz, hx: height / 2, hz: width / 2 };
  const view: Rect = portrait
    ? { cx: 0, cz: 0, hx: viewWidth / 2, hz: viewHeight / 2 }
    : { cx: 0, cz: 0, hx: viewHeight / 2, hz: viewWidth / 2 };
  // The face is centred on the visible area, so the head reaches as far as the farther side
  // needs.
  return {
    glass,
    view,
    /** USB-C port centre in the face, in the module's edge. */
    usb: moduleToFace(portrait, BOARD.usb?.along ?? 0, (BOARD.outlineOffset ?? 0) + height / 2),
    minHalfWidth: glass.hx + Math.max(Math.abs(glass.cx), portrait ? room : 0) + WALL,
    minHalfHeight: glass.hz + Math.max(Math.abs(glass.cz), portrait ? 0 : room) + WALL,
  };
}

export function astronautLayout(values: Params): AstronautLayout {
  const portrait = str(values, "screen") === "portrait";
  const ring = portrait && str(values, "portraitMount") === "ring";
  const board = boardInFace(portrait);
  const hw = board.minHalfWidth + num(values, "headMarginSide");
  const hh = board.minHalfHeight + num(values, "headMarginTop");
  const depth = num(values, "headDepth");
  const glassY = WALL + num(values, "screenRecess");

  // The torso sits behind the board, under the head's middle at the default depth. The lower
  // volume reaches a quarter of its height below the base, so the base cut leaves a broad flat
  // foot; the upper one is centred `upperOffset` above the lower one's top, and the torso is
  // cut flat where the upper one is 0.4 of its height above its centre, just under its peak.
  const cy = glassY + BODY_BEHIND_GLASS;
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
  // The head rests on the flat top, so it can turn on its neck to lock; with the portrait neck
  // ring it rests on the ring.
  const cz = top + (ring ? COLLAR.height : 0) + hh;

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

  // Board fittings, behind the glass front.
  const toFace = (u: number, v: number) => moduleToFace(portrait, u, v);
  const usb = { x: board.usb[0], y: glassY + (BOARD.usb?.depth ?? 0), z: cz + board.usb[1] };
  const pinHoles = (BOARD.buttons ?? []).map((b) => {
    const [x, z] = toFace(b.at[0], b.at[1]);
    return { name: b.name, x, y: glassY + b.depth, z: cz + z };
  });
  const discRadius = num(values, "earSize");
  // The seam goes through the middle of the head, but far enough back that the right disc
  // clears what opens in the right side in front of it: the USB-C opening in landscape, the
  // pin holes in portrait.
  const sideOpenings = portrait
    ? pinHoles.map((h) => ({ y: h.y, dz: h.z - cz, r: PIN_HOLE / 2 }))
    : [{ y: usb.y, dz: usb.z - cz, r: USB_OPENING.short / 2 }];
  const seamY = Math.max(
    depth * 0.45,
    ...sideOpenings.map(
      ({ y, dz, r }) => y + Math.sqrt(Math.max((discRadius + r + 1.5) ** 2 - dz * dz, 0)),
    ),
  );
  // In landscape the neck stands as far back as the front half's bottom allows, but no
  // further than the torso's middle; in portrait it stands on the plug. The neck ring, centred
  // on the upper volume, reaches round its socket.
  const neck = portrait
    ? { x: usb.x, y: usb.y, radius: PLUG_NECK_RADIUS }
    : { x: 0, y: Math.min(seamY - NECK.radius - 0.5, cy), radius: NECK.radius };
  const collar = ring
    ? {
        x: 0,
        y: upper.center[1],
        radius: Math.hypot(neck.x, upper.center[1] - neck.y) + neck.radius + COLLAR.fit + LOCK_WALL,
        blend: num(values, "collarBlend"),
      }
    : null;
  const posts = (BOARD.standoffs?.at ?? []).map(([u, v]): [number, number] => {
    const [x, z] = toFace(u, v);
    return [x, cz + z];
  });
  const postTip = glassY + BOARD.thickness;

  // Speakers stand side by side on the back wall, long side vertical, centred on the back. The
  // posts sit off-centre with the board's standoffs, but below and above the fences.
  const [across, long] = BOARD.speakers?.size ?? [0, 0];
  const fx = across / 2 + FENCE.fit + FENCE.wall;
  const fz = long / 2 + FENCE.fit + FENCE.wall;
  const speakers: FaceRect[] = BOARD.speakers
    ? [-1, 1].map((s) => ({ x: s * (fx + 0.5), z: cz, hx: fx, hz: fz }))
    : [];

  const L: AstronautLayout = {
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
      glassY,
      chin: num(values, "chin"),
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
    neck,
    portrait,
    collar,
    usb,
    pinHoles,
    posts,
    postTip,
    speakers,
    patch: bool(values, "chestPatch")
      ? {
          // A select param's value is one of its options.
          shape: str(values, "patchShape") as PatchShape,
          z: 0.61 * top,
          hx: 0.4 * upper.half[0],
          hz: 0.11 * top,
          text: str(values, "patchText").trim(),
          font: str(values, "patchFont"),
        }
      : null,
    colors: {
      suit: str(values, "suitColor"),
      trim: str(values, "trimColor"),
      patch: str(values, "patchColor"),
      letters: str(values, "patchTextColor"),
      eyes: str(values, "eyeColor"),
    },
    meshEdge: num(values, "meshEdge"),
  };
  if (!portrait || ring) return L;
  // Portrait twist mount: the neck stands on the plug, close behind the face. The body keeps
  // the place under the neck it has in landscape, so its own params (Forward, Depth) still move
  // and size it; validation reports when the socket or the tunnel breaks out of it.
  const landscape = astronautLayout({ ...values, screen: "landscape" });
  const dy = neck.y - landscape.neck.y;
  const move = ([x, y, z]: Vec3): Vec3 => [x, y + dy, z];
  return {
    ...L,
    body: {
      ...L.body,
      cy: cy + dy,
      lower: { ...lower, center: move(lower.center) },
      upper: { ...upper, center: move(upper.center) },
    },
    arms: { ...L.arms, shoulder: move(shoulder), hand: move(hand) },
    legs: { ...L.legs, hip: move(hip), toe: move(toe) },
  };
}

// ---- Validation --------------------------------------------------------------------------

/** Rules the shape params can break; each names the param most likely to fix it. */
export function validateLayout(L: AstronautLayout): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (L.head.depth < MIN_HEAD_DEPTH + L.head.glassY - WALL) {
    issues.push({
      key: "headDepth",
      message: `With this screen recess the board, battery, and speakers need a head at least ${(MIN_HEAD_DEPTH + L.head.glassY - WALL).toFixed(1)} mm deep.`,
    });
  }
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
    issues.push(
      L.portrait
        ? {
            key: "upperForward",
            message:
              "The neck socket breaks out of the chest. With the twist mount the neck stands just behind the face: make the upper volume deeper, or move it until the socket sits inside.",
          }
        : {
            key: "upperWidth",
            message:
              "The top of the body is too small for the neck socket; widen or deepen the upper volume.",
          },
    );
  }
  // The neck ring reaches from the plug, just behind the face, as far back again past the
  // upper volume's centre, so a body far back makes it stick out behind the head.
  if (L.collar && L.collar.y + L.collar.radius > depth + 2) {
    issues.push({
      key: "upperForward",
      message:
        "The neck ring sticks out behind the head; move the upper volume forward under the head.",
    });
  }
  if (!tunnelFits(L)) {
    issues.push({
      key: "upperForward",
      message:
        "The cable tunnel under the plug breaks out of the body; move the body or make it deeper.",
    });
  }
  return issues;
}

/** Whether a circle of radius `r` round the neck's axis lies inside the torso at height `z`. */
function ringInside(torso: Sdf, L: AstronautLayout, r: number, z: number): boolean {
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * 2 * Math.PI;
    if (torso([L.neck.x + r * Math.sin(a), L.neck.y + r * Math.cos(a), z]) > 0) return false;
  }
  return true;
}

/**
 * Whether the twist socket, its groove plus `LOCK_WALL`, lies inside the torso from below the
 * neck's tip up to the flat top. The ring mount's socket sits in the neck ring.
 */
function socketFits(L: AstronautLayout): boolean {
  if (L.collar) return true;
  const torso = torsoSdf(L);
  const r = grooveRadius(L.neck.radius) + LOCK_WALL;
  const { top } = L.body;
  return [top - NECK.length - 1, top - 0.5].every((z) => ringInside(torso, L, r, z));
}

/**
 * Whether the portrait cable tunnel, plus `LOCK_WALL`, lies inside the body. Twist mount: the
 * round tunnel below the socket, in the torso. Ring mount: the plug's opening, in the torso or
 * in the ring's 45° cone.
 */
function tunnelFits(L: AstronautLayout): boolean {
  if (!L.portrait) return true;
  const torso = torsoSdf(L);
  const { top } = L.body;
  const { collar } = L;
  if (!collar) {
    for (let z = 1; z < top - NECK.length; z += 3) {
      if (!ringInside(torso, L, TUNNEL.radius + LOCK_WALL, z)) return false;
    }
    return true;
  }
  const hx = USB_OPENING.long / 2 + LOCK_WALL;
  const hy = USB_OPENING.short / 2 + LOCK_WALL;
  for (let z = 1; z < top; z += 2) {
    for (const [sx, sy] of [
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 1],
      [0, 1],
      [1, 1],
    ]) {
      const x = L.neck.x + sx * hx;
      const y = L.neck.y + sy * hy;
      const inCone = Math.hypot(x - collar.x, y - collar.y) <= collar.radius - (top - z);
      if (!inCone && torso([x, y, z]) > 0) return false;
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

/**
 * The head's outside: a flat rim around the face, then a back rounded on `backRadius`, and the
 * chin in front of the face (left out with `chin` false, for the hollow, so the chin is solid).
 */
export function headSdf(L: AstronautLayout, chin = true): Sdf {
  const { hw, hh, depth, cz, corner, frontEdge, backRadius: R } = L.head;
  const outline = (x: number, z: number) => rect2(x, z, 0, cz, hw, hh, corner);
  const front = extrudeY(outline, 0, RIM + 1, frontEdge);
  const d = chin ? L.head.chin : 0;
  const pulled = extrudeY(outline, -d, RIM + 1, frontEdge);
  const rampZ = cz - L.head.view.hz - WINDOW_MARGIN - CHIN_MARGIN;
  const back: Sdf = (p) => {
    // The outline shrinks on a quarter circle over the last R mm: a pillow, not a box.
    const t = Math.max(p[1] - (depth - R), 0);
    const shrink = R - Math.sqrt(Math.max(R * R - t * t, 0));
    const d2 = rect2(p[0], p[2], 0, cz, hw - shrink, hh - shrink, Math.max(corner - shrink, 0.5));
    return Math.max(d2, p[1] - depth, RIM - 2 - p[1]);
  };
  // Plain union: rim and back share the outline where they overlap, so no crease to soften.
  if (d <= 0) return (p) => Math.min(front(p), back(p));
  return (p) =>
    Math.min(front(p), back(p), Math.max(pulled(p), (p[2] - rampZ - p[1]) * Math.SQRT1_2));
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
 * Torso, arms, and legs, flat at the base and at the top the head rests on. In portrait the
 * neck ring stands on the torso, blended into it over the ring's `blend`, and the flat top is the
 * ring's. The neck socket is cut exactly in build.ts.
 */
export function bodySdf(L: AstronautLayout): Sdf {
  const { blend } = L.body;
  const { collar } = L;
  const top = L.body.top + (collar ? COLLAR.height : 0);
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
  return (p) => {
    let d = smoothUnion(torso(p), arm(p), blend);
    d = smoothUnion(d, leg(p), blend);
    if (collar) {
      // The ring, and below the torso's top a cone narrowing 45° downward.
      const rho = Math.hypot(p[0] - collar.x, p[1] - collar.y) - collar.radius;
      const ring = Math.max(rho, (rho + L.body.top - p[2]) * Math.SQRT1_2);
      d = smoothUnion(d, ring, collar.blend);
    }
    return Math.max(d, -p[2], p[2] - top);
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
 * The body's front surface at each (x, z): the first y inside the body, marching back in
 * 0.05 mm steps from in front of it. NaN where the line misses the body.
 */
export function chestSurface(L: AstronautLayout, points: readonly [number, number][]): number[] {
  const body = bodySdf(L);
  const { min, max } = bodyBounds(L);
  return points.map(([x, z]) => {
    for (let y = min[1] - 1; y < max[1]; y += 0.05) if (body([x, y, z]) <= 0) return y;
    return Number.NaN;
  });
}

// ---- Bounds ------------------------------------------------------------------------------

export function headBounds(L: AstronautLayout): Box3 {
  const { hw, hh, depth, cz } = L.head;
  return { min: [-hw, -L.head.chin, cz - hh], max: [hw, depth, cz + hh] };
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
  const box: Box3 = {
    min: [-Math.max(...xs) - bulge, Math.min(...ys) - bulge, 0],
    max: [Math.max(...xs) + bulge, yBack + bulge, top],
  };
  const { collar } = L;
  if (!collar) return box;
  const r = collar.radius + collar.blend / 4;
  return {
    min: [Math.min(box.min[0], -r), Math.min(box.min[1], collar.y - r), 0],
    max: [Math.max(box.max[0], r), Math.max(box.max[1], collar.y + r), top + COLLAR.height],
  };
}

export function discBounds(L: AstronautLayout, s: 1 | -1): Box3 {
  const x0 = L.head.hw;
  const x1 = x0 + DISC.thickness;
  const r = L.discRadius;
  const [lo, hi] = s > 0 ? [x0, x1] : [-x1, -x0];
  return { min: [lo, L.seamY - r, L.head.cz - r], max: [hi, L.seamY + r, L.head.cz + r] };
}

/** The eyes' rectangles in the face, for the stand-in screen. */
export function eyeRects(L: AstronautLayout): FaceRect[] {
  const { cz, view } = L.head;
  const k = Math.min(view.hx, view.hz) / 24.5;
  const ex = Math.min(view.hx * 0.42, 10 * k + 2);
  return [-1, 1].map((s) => ({ x: s * ex, z: cz, hx: 5 * k, hz: 8 * k }));
}
