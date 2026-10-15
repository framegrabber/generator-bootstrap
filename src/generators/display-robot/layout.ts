import { bool, num, str } from "../../core/params";
import {
  boxAround,
  capsule,
  ellipsoid,
  roundBox,
  roundCylinder,
  sphere,
  unionBox,
  type Box3,
  type Sdf,
  type Vec3,
} from "../../core/sdf";
import type { Params } from "../../core/types";
import {
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
 * The robot in the character kit's frame (see src/characters/kit.ts): helmet head, face, cuts,
 * and joints from the kit; ear pods, antenna, torso, arms, and legs here. Pure math, so
 * index.ts can validate with it and build.ts meshes it. Proportions follow the first robot
 * spike, whose torso half-width was 17 mm; small features scale with the torso.
 */

/** How far the torso reaches below the bed before the flat cut it sits on. */
const SEAT_SINK = 2;
const deg = Math.PI / 180;

export type Segment = { a: Vec3; b: Vec3; radius: number };
/** A rounded box: centre, half-extents, corner radius. */
export type Brick = { center: Vec3; half: Vec3; radius: number };
/** A disc along x: centre, radius, half-thickness, edge rounding. */
export type Pod = { center: Vec3; radius: number; half: number; edge: number };
/** A leaf: a flattened ellipsoid in the split plane, turned `angle` degrees about y. */
export type Leaf = { center: Vec3; radii: Vec3; angle: number };

export type RobotLayout = CharacterLayout & {
  torso: Brick;
  pods: Pod[];
  /** Antenna stalk (or sprout stem), with a ball or leaves on top. */
  stalk: Segment | null;
  ball: { center: Vec3; radius: number } | null;
  leaves: Leaf[];
  arms: Segment[];
  hands: { center: Vec3; radius: number }[];
  legs: Segment[];
  feet: Brick[];
  /** Chest badge: a disc on the torso front, centre and radius. */
  badge: { center: Vec3; radius: number };
};

export function robotLayout(values: Params): RobotLayout {
  const head = headSize(values);
  const [rx, , rz] = head.radii;

  // Pillowy torso, slightly behind the head, sitting on a flat seat.
  const bx = (rx * num(values, "bodySize")) / 100;
  const k = bx / 17;
  const half: Vec3 = [bx, 0.82 * bx, 0.94 * bx];
  const torso: Brick = { center: [0, 0.15 * half[1], half[2] - SEAT_SINK], half, radius: 8 * k };
  const torsoTop = torso.center[2] + half[2];
  const front = torso.center[1] - half[1];
  // The head sits on the torso, just overlapping it.
  const cz = torsoTop + rz - 0.15 * rz;
  const anatomyZ = cz - rz - 1;
  const base = characterLayout(values, head, {
    cz,
    anatomyZ,
    neckRadius: 0.4 * Math.min(rx, bx),
  });

  // Headphone ear pods on the sides, across the split plane. With USB-C on a side, the pods
  // sit at the port's depth, so the cable comes out through the middle of the ear.
  const sideUsb = base.edge === "left" || base.edge === "right";
  const podY = base.port.kind === "usb" && sideUsb ? base.port.y : 0;
  const podRadius = 0.4 * rz;
  const pods: Pod[] = bool(values, "earPods")
    ? [-1, 1].map((s) => ({
        center: [s * (rx - 1), podY, cz],
        radius: podRadius,
        half: 0.22 * podRadius,
        edge: 0.11 * podRadius,
      }))
    : [];

  // Antenna on top, upright in the split plane, so each half prints lying flat.
  const style = str(values, "antenna");
  const length = num(values, "antennaLength");
  const crown = cz + rz - 2;
  let stalk: Segment | null = null;
  let ball: RobotLayout["ball"] = null;
  const leaves: Leaf[] = [];
  if (style === "ball") {
    const tip: Vec3 = [0, 0, crown + length];
    stalk = { a: [0, 0, crown], b: tip, radius: 1.8 };
    ball = { center: [0, 0, tip[2] + 2.5], radius: 3.5 };
  } else if (style === "sprout") {
    const tip: Vec3 = [0, 0, crown + 0.7 * length];
    stalk = { a: [0, 0, crown], b: tip, radius: 1.6 };
    for (const s of [-1, 1]) {
      leaves.push({ center: [s * 5, 0, tip[2] + 2], radii: [5.5, 1.8, 3], angle: s * 30 });
    }
  }

  // Stubby arms hanging at the sides with round hands; sitting legs with chunky feet.
  const seat = torso.center[2] - half[2];
  const arms: Segment[] = [];
  const hands: RobotLayout["hands"] = [];
  const legs: Segment[] = [];
  const feet: Brick[] = [];
  for (const s of [-1, 1]) {
    if (bool(values, "arms")) {
      arms.push({
        a: [s * 15 * k, 2 * k, seat + 26 * k],
        b: [s * 21 * k, -3 * k, seat + 11 * k],
        radius: 4.5 * k,
      });
      hands.push({ center: [s * 21 * k, -3.5 * k, seat + 9.5 * k], radius: 5.5 * k });
    }
    if (bool(values, "legs")) {
      legs.push({
        a: [s * 8 * k, front + 7 * k, 7 * k],
        b: [s * 8 * k, front - 5 * k, 7 * k],
        radius: 6.5 * k,
      });
      feet.push({
        center: [s * 8 * k, front - 8 * k, 7 * k],
        half: [7 * k, 5 * k, 7 * k],
        radius: 4 * k,
      });
    }
  }

  const badge = { center: [0, front, torso.center[2] + 0.2 * half[2]] as Vec3, radius: 0.3 * bx };
  return { ...base, torso, pods, stalk, ball, leaves, arms, hands, legs, feet, badge };
}

/** Distance to a leaf: an ellipsoid turned about y around its centre. */
function leafSdf(leaf: Leaf): Sdf {
  const [cx, cy, cz] = leaf.center;
  const [c, s] = [Math.cos(leaf.angle * deg), Math.sin(leaf.angle * deg)];
  const origin: Vec3 = [0, 0, 0];
  return (p) => {
    const [x, z] = [p[0] - cx, p[2] - cz];
    return ellipsoid([c * x + s * z, p[1] - cy, -s * x + c * z], origin, leaf.radii);
  };
}

const segmentBox = (s: Segment) => unionBox([boxAround(s.a, s.radius), boxAround(s.b, s.radius)]);
const brickBox = (b: Brick) => boxAround(b.center, b.half);

function outerTerms(L: RobotLayout): Term[] {
  const k = L.softness;
  const neck: Segment = { a: [0, 0, L.torso.center[2]], b: [0, 0, L.cz], radius: L.neck.radius };
  const brick = (b: Brick, blend: number): Term => ({
    dist: (p) => roundBox(p, b.center, b.half, b.radius),
    k: blend,
    box: brickBox(b),
  });
  const segment = (s: Segment, blend: number): Term => ({
    dist: (p) => capsule(p, s.a, s.b, s.radius),
    k: blend,
    box: segmentBox(s),
  });
  const ballTerm = (b: { center: Vec3; radius: number }, blend: number): Term => ({
    dist: (p) => sphere(p, b.center, b.radius),
    k: blend,
    box: boxAround(b.center, b.radius),
  });
  return [
    brick(L.torso, 1.5 * k),
    segment(neck, k),
    ...L.pods.map((pod): Term => ({
      dist: (p) => roundCylinder(p, pod.center, 0, pod.radius, pod.half, pod.edge),
      k: 0.5 * k,
      box: boxAround(pod.center, [pod.half, pod.radius, pod.radius]),
    })),
    ...(L.stalk ? [segment(L.stalk, 0.5 * k)] : []),
    ...(L.ball ? [ballTerm(L.ball, 0.25 * k)] : []),
    ...L.leaves.map((leaf): Term => ({
      dist: leafSdf(leaf),
      k: 0.25 * k,
      box: boxAround(leaf.center, Math.max(...leaf.radii)),
    })),
    ...L.arms.map((arm) => segment(arm, k)),
    ...L.hands.map((hand) => ballTerm(hand, 0.5 * k)),
    ...L.legs.map((leg) => segment(leg, k)),
    ...L.feet.map((foot) => brick(foot, 0.5 * k)),
  ];
}

/** The whole robot's outer surface: its head core with every term blended on. */
export function outerSdf(L: RobotLayout): Sdf {
  return blendTerms(headCoreSdf(L), outerTerms(L));
}

/** Each term's distance divided by its box distance, at `p`; for checking CULL_FACTOR. */
export function cullRatios(L: RobotLayout, p: Vec3): number[] {
  return termRatios(outerTerms(L), p);
}

/** Box around everything, for meshing the outside. */
export function outerBounds(L: RobotLayout): Box3 {
  return termBounds(headBounds(L), outerTerms(L), L.softness);
}
