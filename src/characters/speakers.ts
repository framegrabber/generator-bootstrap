import { add, cross, dot, scale, sub, type Sdf, type Vec3 } from "../core/sdf";
import type { DisplayModule } from "./hardware";

/**
 * Speaker pockets for boards that come with speakers: pure math, main-thread safe. A character
 * picks a seat for each speaker (in an ear, a pod); the kit cuts the pocket, a grille in front
 * of it, and a channel for its lead into the head's hollow.
 */

/**
 * Pocket clearance on every side; corner radius (rounder than most boxed speakers', so it fits
 * any whose corners are at least this round); the wall in front, which carries the grille; the
 * walls beside and behind it; grille holes (diameter, hex pitch); the lead channel (across,
 * deep), sized for the 4-pin plug.
 */
export const SPEAKER = {
  clearance: 0.3,
  corner: 6,
  front: 1.2,
  side: 1.6,
  hole: 1.6,
  pitch: 2.6,
  channel: [7, 4.5] as const,
};

/**
 * Where a speaker sits: its centre, the unit `normal` its grille faces, the unit `up` its long
 * side runs along (its lead leaves at the -up end), and the lead's channel from the centre:
 * unit direction and length.
 */
export type SpeakerSeat = { center: Vec3; normal: Vec3; up: Vec3; cable: Vec3; channel: number };

/** A pocket's half-extents (across, up, normal), clearance included, and its grille area. */
export type Pocket = { half: Vec3; grille: readonly [number, number] };

/** The pocket the module's speakers need, or null for a board without speakers. */
export function speakerPocket(module: DisplayModule): Pocket | null {
  if (!module.speakers) return null;
  const [w, h, t] = module.speakers.size;
  const c = SPEAKER.clearance;
  return { half: [w / 2 + c, h / 2 + c, t / 2 + c], grille: module.speakers.grille };
}

/** The seat's across axis: its frame is (across, up, normal), right-handed. */
export function seatAcross(seat: Pick<SpeakerSeat, "up" | "normal">): Vec3 {
  return cross(seat.up, seat.normal);
}

/** A point in a seat's frame (across, up, normal) from the pocket centre. */
function local(seat: SpeakerSeat, p: Vec3): Vec3 {
  const d = sub(p, seat.center);
  return [dot(d, seatAcross(seat)), dot(d, seat.up), dot(d, seat.normal)];
}

/** Signed distance from `p` to a pocket's box (its rounded corners only make it smaller). */
export function pocketDistance(seat: SpeakerSeat, pocket: Pocket, p: Vec3): number {
  const q = local(seat, p).map((v, i) => Math.abs(v) - pocket.half[i]);
  const outside = Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0));
  return outside + Math.min(Math.max(q[0], q[1], q[2]), 0);
}

/** A point of the seat's frame: `a` across, `b` up, `n` along the normal from the centre. */
function at(seat: SpeakerSeat, a: number, b: number, n: number): Vec3 {
  const along = add(scale(seatAcross(seat), a), add(scale(seat.up, b), scale(seat.normal, n)));
  return add(seat.center, along);
}

/**
 * Whether a pocket fits its seat: `wall` around it (the grille wall in front) inside `solid`,
 * and its grille opening to the air, not into the head's hollow, so the holes go through ear or
 * pod only. `head` is the head's core.
 */
export function pocketFits(
  seat: SpeakerSeat,
  pocket: Pocket,
  wall: number,
  solid: Sdf,
  head: Sdf,
): boolean {
  const [ha, hu, hn] = pocket.half;
  const r = SPEAKER.corner;
  // The pocket's outline (straight sides and corner arcs), pushed out by the wall.
  const outline: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * 2 * Math.PI;
    const [ca, cu] = [Math.sign(Math.cos(t)) * (ha - r), Math.sign(Math.sin(t)) * (hu - r)];
    outline.push([ca + (r + wall) * Math.cos(t), cu + (r + wall) * Math.sin(t)]);
  }
  for (const [a, b] of [...outline, [0, 0] as [number, number]]) {
    for (const n of [-hn - wall, 0, hn + SPEAKER.front]) {
      if (solid(at(seat, a, b, n)) > 0) return false;
    }
  }
  const [ga, gu] = pocket.grille.map((v) => v / 2);
  for (const [a, b] of [
    [-ga, -gu],
    [ga, -gu],
    [-ga, gu],
    [ga, gu],
    [0, 0],
  ]) {
    if (head(at(seat, a, b, hn + SPEAKER.front + 1)) <= 0) return false;
  }
  return true;
}

/**
 * Length of the lead's channel from the pocket centre along `cable` until it is a wall inside
 * the head's hollow (`hollow` is the head core inset by the wall), or null if it would leave
 * `solid` on the way.
 */
export function channelLength(
  seat: Omit<SpeakerSeat, "channel">,
  pocket: Pocket,
  solid: Sdf,
  hollow: Sdf,
): number | null {
  const start =
    Math.abs(dot(seat.cable, seat.up)) * pocket.half[1] +
    Math.abs(dot(seat.cable, seat.normal)) * pocket.half[2];
  for (let s = start; s < start + 60; s += 0.5) {
    const p = add(seat.center, scale(seat.cable, s));
    if (hollow(p) < -1) return s;
    if (solid(p) > -SPEAKER.channel[1] / 2) return null;
  }
  return null;
}

/** The grille holes' centres on the pocket's front face: a hex grid over the grille area. */
export function grillePoints(pocket: Pocket): [number, number][] {
  const [ga, gu] = pocket.grille.map((v) => v / 2 - SPEAKER.hole / 2);
  const rowStep = SPEAKER.pitch * Math.sin(Math.PI / 3);
  const points: [number, number][] = [];
  const rows = Math.floor(gu / rowStep);
  for (let row = -rows; row <= rows; row++) {
    const shift = row % 2 === 0 ? 0 : SPEAKER.pitch / 2;
    const cols = Math.floor((ga - shift) / SPEAKER.pitch);
    for (let col = -cols - (shift ? 1 : 0); col <= cols; col++) {
      const a = col * SPEAKER.pitch + shift;
      if (Math.abs(a) <= ga) points.push([a, row * rowStep]);
    }
  }
  return points;
}
