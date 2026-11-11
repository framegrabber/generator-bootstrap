import type { CrossSection, Manifold } from "manifold-3d";
import { tools, type Tools } from "../../characters/assemble";
import { solidFromSdf } from "../../core/geom";
import { meshFromManifold, withScope } from "../../core/manifold";
import {
  frame,
  IDENTITY,
  invertRigid,
  multiply,
  rotationX,
  translation,
  type Mat4,
} from "../../core/mat4";
import type { Vec3 } from "../../core/bounds";
import type { Box3, Sdf } from "../../core/sdf";
import { textOutline } from "../../core/text";
import type { CutPlane, GeneratorBuild, Part, StandIn } from "../../core/types";
import { loadFont } from "../../fonts/load";
import {
  astronautLayout,
  BOSS,
  COLLAR,
  bodyBounds,
  bodySdf,
  discBounds,
  discSdf,
  DISC,
  eyeRects,
  FENCE,
  GRILLE,
  headBounds,
  headSdf,
  PIN_HOLE,
  POCKET,
  POST,
  PATCH,
  chestSurface,
  NECK,
  SLEEVE_FLAT,
  TONGUE,
  TUNNEL,
  TWIST,
  USB_OPENING,
  WINDOW_MARGIN,
  WALL,
  type AstronautLayout,
  type Patch,
  type PatchShape,
} from "./layout";

/** Gap between parts on the print bed. */
const LAYOUT_GAP = 10;
/** Pieces smaller than this are meshing crumbs, not parts of the model. */
const MIN_PIECE_VOLUME = 1;
/** Share of each badge shape's width the lettering may fill, so it stays clear of the rim. */
const LETTER_WIDTH: Record<PatchShape, number> = {
  rounded: 0.85,
  circle: 0.75,
  hexagon: 0.7,
  shield: 0.8,
};
/**
 * How far above the shape's middle the lettering sits, as a share of the badge box's half
 * height. The shield's point pulls its outline's middle down; its area's centre lies about a
 * quarter of that half height higher, and lettering centred there looks centred.
 */
const LETTER_RISE: Record<PatchShape, number> = { rounded: 0, circle: 0, hexagon: 0, shield: 0.25 };

/** The badge's outline in the face plane, centred on its box (half sizes hx, hz). */
function patchOutline({ t, CS, roundedRect }: Tools, { shape, hx, hz }: Patch) {
  const r = Math.sqrt(hx * hz);
  switch (shape) {
    case "rounded":
      return roundedRect(2 * hx, 2 * hz, 2);
    case "circle":
      return t(CS.circle(r, 64));
    case "hexagon":
      // Points left and right, corners rounded by 1 mm.
      return t(t(CS.circle(1.1 * r - 1, 6)).offset(1, "Round", 2, 32));
    case "shield": {
      // Flat top, straight sides, a point at the bottom; corners rounded by 1.5 mm.
      const pentagon = t(
        new CS([
          [-hx, 1.1 * hz],
          [-hx, -0.15 * hz],
          [0, -1.15 * hz],
          [hx, -0.15 * hz],
          [hx, 1.1 * hz],
        ]),
      );
      return t(t(pentagon.offset(-1.5, "Round", 2, 32)).offset(1.5, "Round", 2, 32));
    }
  }
}

/**
 * The printable astronaut: body, chest badge (with its lettering), the head's front and
 * back halves, and two helmet discs, each in its print pose and laid out along x. The screen
 * and eyes are assembled-view stand-ins.
 *
 * Curved surfaces are meshed from the layout's distance functions; every fitting (window,
 * board pocket, USB-C opening, pin holes, bosses, neck, tongue, posts, speaker fences,
 * grille, socket, the portrait neck ring) is an exact Manifold solid, so clearances hold at
 * any mesh detail.
 */
const build: GeneratorBuild = async (values, { wasm }) => {
  const L = astronautLayout(values);
  const font = L.patch?.text ? await loadFont(L.patch.font) : null;
  return withScope((scope) => {
    const k = tools(wasm, scope);
    const { t, M, CS, geom } = k;
    const edge = L.meshEdge;
    const { hw, hh, depth, cz, corner } = L.head;
    const warnings: string[] = [];

    // Level sets close off flat wherever the surface reaches the bounds, so leave each shape
    // a grid cell and a millimetre of room.
    const mesh = (sdf: Sdf, { min, max }: Box3, inset = 0) => {
      const p = edge + 1;
      const bounds: Box3 = {
        min: [min[0] - p, min[1] - p, min[2] - p],
        max: [max[0] + p, max[1] + p, max[2] + p],
      };
      return solidFromSdf(geom, sdf, bounds, edge, inset);
    };
    /** A 2D shape extruded `length` along the local z of `place`. */
    const sweep = (cs: CrossSection, place: Mat4, length: number) =>
      t(t(cs.extrude(length)).transform(place));
    /** Circle with 45° points toward ±x: each half of a split prints without support. */
    const lemon = (r: number) =>
      t(
        CS.hull([
          t(CS.circle(r, 48)),
          t(t(CS.circle(0.01, 4)).translate([r * Math.SQRT2, 0])),
          t(t(CS.circle(0.01, 4)).translate([-r * Math.SQRT2, 0])),
        ]),
      );
    /** A side boss's frame: lemon points along ±y, swept outward from x = `x` on side `s`. */
    const sideFrame = (s: 1 | -1, x: number): Mat4 =>
      frame([x, L.seamY, cz], [0, 1, 0], [0, 0, s], [s, 0, 0]);
    /** The neck's frame: hooks along ±y, swept down from z = `z`. */
    const neckFrame = (z: number): Mat4 =>
      frame([L.neck.x, L.neck.y, z], [0, 1, 0], [1, 0, 0], [0, 0, -1]);
    const outline = k.roundedRect(2 * hw, 2 * hh, corner);
    const ring = (outer: number, inner: number) =>
      t(
        t(outline.offset(-outer, "Round", 2, 32)).subtract(
          t(outline.offset(-inner, "Round", 2, 32)),
        ),
      );

    // ---- Head: hollow shell with its fittings, split at the seam ------------------------
    const outer = mesh(headSdf(L), headBounds(L));
    const inner = mesh(headSdf(L), headBounds(L), WALL);
    const { glass, view, glassY } = L.head;
    const glassCS = t(
      k
        .roundedRect(2 * (glass.hx + POCKET.fit), 2 * (glass.hz + POCKET.fit), 2)
        .translate([glass.cx, glass.cz]),
    );
    const windowCS = k.roundedRect(
      2 * (view.hx + WINDOW_MARGIN),
      2 * (view.hz + WINDOW_MARGIN),
      2.5,
    );
    const inside = t(outline.offset(-(WALL - 0.3), "Round", 2, 32));
    // A shallow frame around the glass locates the board on the inside of the front wall; a
    // screen recess fills the front solid up to the glass, around the window.
    const pocketFrame = t(
      M.union([
        k.prismY(t(inside.subtract(windowCS)), WALL - 0.3, glassY + 0.01, cz),
        k.prismY(t(inside.subtract(glassCS)), glassY, glassY + POCKET.depth, cz),
      ]),
    );
    // Twist-lock hooks, one on each end of a profile's ±x axis (`end` -1 and +1), `point` from
    // the axis; see TWIST. Their frame starts at the face the boss or neck leaves, z outward,
    // and the profile stands `length` out of it.
    const bossPoint = BOSS.radius * Math.SQRT2;
    const tipFrame = (s: 1 | -1) => sideFrame(s, s * hw);
    const neckTip = neckFrame(cz - hh);
    /** A hook grown by `fit` all round: a hull of 45° squares along the point axis. */
    const hook = (point: number, length: number, end: 1 | -1, fit: number) => {
      const half = TWIST.width + fit * Math.SQRT2;
      const back = TWIST.hook + 0.5;
      return t(
        M.hull(
          (
            [
              [length + fit, 0],
              [length - TWIST.flat, 0],
              [length - TWIST.flat - back, back],
            ] as const
          ).flatMap(([z, inward]) => {
            const c = end * (point + TWIST.hook - TWIST.width - inward);
            return [
              [c + half, 0, z],
              [c, half, z],
              [c - half, 0, z],
              [c, -half, z],
            ] satisfies Vec3[];
          }),
        ),
      );
    };
    const hooks = (point: number, length: number, place: Mat4) =>
      ([-1, 1] as const).map((end) => t(hook(point, length, end, 0).transform(place)));
    // The bore that takes those hooks, in the same frame. It is round so the profile can turn
    // in it. Each hook slides down a keyway, then the bore's part turns clockwise (seen from
    // outside): the hook's path relative to it runs from -turn to 0 degrees, its back face
    // rising `rise` toward the face on the way and meeting the groove's ceiling at the stop
    // (its `fit` taken back there along the 45° face).
    const lockShift = TWIST.fit * Math.SQRT2;
    const STEPS = 14;
    const twistBore = (point: number, length: number, place: Mat4) => {
      const depth = length + TWIST.fit + lockShift + 0.05;
      const cylinder = t(t(CS.circle(point + TWIST.boreFit, 64)).extrude(depth + 0.01));
      const cuts = [t(cylinder.translate([0, 0, -0.01]))];
      for (const end of [-1, 1] as const) {
        const grown = hook(point, length, end, TWIST.fit);
        const at = (i: number) => {
          const angle = -TWIST.turn * (1 - i / STEPS);
          const shift = lockShift + (TWIST.rise * angle) / TWIST.turn;
          return t(t(grown.rotate([0, 0, angle])).translate([0, 0, shift]));
        };
        const entry = at(0);
        cuts.push(t(M.hull([entry, t(entry.translate([0, 0, -length - 3]))])));
        for (let i = 0; i < STEPS; i++) cuts.push(t(M.hull([at(i), at(i + 1)])));
      }
      return t(t(M.union(cuts)).transform(place));
    };
    const bosses = ([-1, 1] as const).map((s) =>
      t(
        M.union([
          sweep(lemon(BOSS.radius), sideFrame(s, s * (hw - WALL)), WALL + BOSS.length),
          ...hooks(bossPoint, BOSS.length, tipFrame(s)),
        ]),
      ),
    );
    // The neck: a circle 0.5 mm under its radius with a 45° point toward the face (-x in its
    // frame), clipped to the radius so it turns in a round bore; the clip leaves a 0.6 mm sag
    // the width of a short bridge. It runs from inside the bottom wall down to its tip.
    // Twist mount: hooks twist it into the body. Portrait ring mount: a sleeve round the plug
    // that pushes straight into the neck ring's socket, keyed by its flat sides (toward ±x)
    // and square back; flats on the round alone engage only 0.9 mm and let it turn.
    const r = L.neck.radius;
    const round = t(
      t(
        CS.hull([
          t(CS.circle(r - 0.5, 64)),
          t(t(CS.circle(0.01, 4)).translate([-(r - 0.5) * Math.SQRT2, 0])),
        ]),
      ).intersect(t(CS.circle(r, 64))),
    );
    const neckProfile = L.collar
      ? t(
          t(round.add(t(t(CS.square([r, 2 * r], true)).translate([r / 2, 0])))).intersect(
            t(CS.square([2 * r + 1, 2 * SLEEVE_FLAT], true)),
          ),
        )
      : round;
    const neck = t(
      M.union([
        sweep(neckProfile, neckFrame(cz - hh + WALL), WALL + NECK.length),
        ...(L.collar ? [] : hooks(r, NECK.length, neckTip)),
      ]),
    );
    const openings: Manifold[] = [
      k.prismY(windowCS, -1, glassY + 0.5, cz),
      // The module is as wide as the inside, so its pocket shaves the wall where it is tight.
      k.prismY(glassCS, glassY - 0.01, glassY + 10.5, cz),
      // Landscape: the USB-C opening in the right side, pin holes up through the top.
      // Portrait: the plug goes down the neck, pin holes out through the right side.
      ...(L.portrait
        ? L.pinHoles.map((h) => k.cylinderX(PIN_HOLE / 2, h.x - 1, hw + 1, h.y, h.z))
        : [
            sweep(
              k.roundedRect(USB_OPENING.short, USB_OPENING.long, USB_OPENING.corner),
              frame([hw - WALL - 1, L.usb.y, L.usb.z], [0, 1, 0], [0, 0, 1], [1, 0, 0]),
              WALL + 3,
            ),
            ...L.pinHoles.map((h) =>
              t(
                t(M.cylinder(cz + hh + 1 - (h.z - 1), PIN_HOLE / 2, PIN_HOLE / 2, 24)).translate([
                  h.x,
                  h.y,
                  h.z - 1,
                ]),
              ),
            ),
          ]),
    ];
    const head = t(
      t(M.union([t(outer.subtract(inner)), pocketFrame, ...bosses])).subtract(t(M.union(openings))),
    );
    const [backRaw, frontRaw] = head.splitByPlane([0, 1, 0], L.seamY).map(t);

    const tongue = k.prismY(
      ring(TONGUE.outer, TONGUE.inner),
      L.seamY - 0.01,
      L.seamY + TONGUE.height,
      cz,
    );
    // The neck joins after the split: with the twist mount its hooks stand past the seam
    // below the head. In portrait the plug goes down through the bottom wall and the neck; R1
    // corners pass even a square-cornered 12.2 × 6.3 plug body.
    const plugway = (cs: CrossSection, z0: number, z1: number) =>
      k.prismZ(t(cs.translate([L.neck.x, L.neck.y])), z0, z1);
    const necked = t(M.union([frontRaw, tongue, neck]));
    const plugOpening = k.roundedRect(USB_OPENING.long, USB_OPENING.short, 1);
    const front = L.portrait
      ? t(necked.subtract(plugway(plugOpening, cz - hh - NECK.length - 1, cz - hh + WALL + 0.5)))
      : necked;

    const groove = k.prismY(
      ring(TONGUE.outer - TONGUE.fit, TONGUE.inner + TONGUE.fit),
      L.seamY - 0.01,
      L.seamY + TONGUE.height + TONGUE.fit,
      cz,
    );
    const backWall = depth - WALL;
    const posts = L.posts.map(([x, z]) => k.cylinderY(POST.radius, L.postTip, backWall + 1, x, z));
    const sockets = L.posts.map(([x, z]) =>
      k.cylinderY(POST.socket, L.postTip - 0.01, L.postTip + POST.socketDepth, x, z),
    );
    const fences = L.speakers.map((s) => {
      const box = k.roundedRect(2 * s.hx, 2 * s.hz, 1.5);
      const hole = k.roundedRect(2 * (s.hx - FENCE.wall), 2 * (s.hz - FENCE.wall), 0.5);
      // The lead leaves through a gap at the bottom end.
      const gap = t(t(CS.square([FENCE.gap, 3 * FENCE.wall], true)).translate([0, -s.hz]));
      const cs = t(t(t(box.subtract(hole)).subtract(gap)).translate([s.x, s.z - cz]));
      return k.prismY(cs, backWall - FENCE.height, backWall + 0.5, cz);
    });
    const grille = L.speakers.flatMap((s) =>
      grillePoints(s.hx - FENCE.wall - FENCE.fit, s.hz - FENCE.wall - FENCE.fit).map(([x, z]) =>
        k.cylinderY(GRILLE.radius, backWall - 1, depth + 1, s.x + x, s.z + z),
      ),
    );
    const fittings = t(t(M.union([...posts, ...fences])).intersect(outer));
    const back = t(
      t(M.union([t(backRaw.subtract(groove)), fittings])).subtract(
        t(M.union([...sockets, ...grille])),
      ),
    );

    // ---- Helmet discs: a rounded disc with a twist-lock bore --------------------------
    const discs = ([-1, 1] as const).map((s) =>
      t(
        mesh(discSdf(L, s), discBounds(L, s)).subtract(
          twistBore(bossPoint, BOSS.length, tipFrame(s)),
        ),
      ),
    );

    // ---- Body: one piece ---------------------------------------------------------------
    // Twist mount: the socket the neck twists into. Portrait ring mount: the sleeve's socket
    // in the neck ring (part of the body's distance function). In portrait a tunnel runs down
    // through the base (round below a twist socket, so the plug can turn in it; the plug's
    // opening below the ring), and a notch under the base leads the cable out to the back.
    const { top } = L.body;
    const cuts = [
      L.collar
        ? sweep(
            t(neckProfile.offset(COLLAR.fit, "Round", 2, 32)),
            neckFrame(cz - hh + 0.01),
            NECK.length + 0.3,
          )
        : twistBore(r, NECK.length, neckTip),
    ];
    if (L.portrait) {
      cuts.push(
        L.collar
          ? plugway(plugOpening, -1, top + 1)
          : plugway(t(CS.circle(TUNNEL.radius, 64)), -1, top - NECK.length),
        plugway(
          t(
            t(CS.square([TUNNEL.notch, bodyBounds(L).max[1] - L.neck.y + 2])).translate([
              -TUNNEL.notch / 2,
              0,
            ]),
          ),
          -1,
          TUNNEL.notch,
        ),
      );
    }
    const solidBody = t(mesh(bodySdf(L), bodyBounds(L)).subtract(t(M.union(cuts))));

    // ---- Chest patch: a flat badge glued into a flat-floored recess ---------------------
    let body = solidBody;
    let badge: Manifold | null = null;
    let letters: Manifold | null = null;
    let badgePose: Mat4 = IDENTITY;
    if (L.patch) {
      const P = L.patch;
      const shape = patchOutline(k, P);
      const { min, max } = shape.bounds();
      const samples: [number, number][] = [];
      for (let i = 0; i <= 6; i++) {
        for (let j = 0; j <= 6; j++) {
          samples.push([
            min[0] + ((max[0] - min[0]) * i) / 6,
            P.z + min[1] + ((max[1] - min[1]) * j) / 6,
          ]);
        }
      }
      const ys = chestSurface(L, samples);
      if (ys.some(Number.isNaN)) {
        throw new Error("The chest patch reaches past the chest; widen the upper volume.");
      }
      // The chest leans back (about 22° at the defaults), so the badge lies in a plane fitted
      // to it, y = y0 + slope · (z - P.z); a badge flat in the face plane came out 9 mm thick.
      // The recess is deep enough where the chest lies furthest behind that plane, and the
      // badge stands proud where it lies furthest in front.
      const y0 = ys.reduce((a, y) => a + y, 0) / ys.length;
      const slope =
        samples.reduce((a, [, z], i) => a + (z - P.z) * (ys[i] - y0), 0) /
        samples.reduce((a, [, z]) => a + (z - P.z) ** 2, 0);
      const n = Math.sqrt(1 + slope * slope);
      const up: Vec3 = [0, slope / n, 1 / n];
      const out: Vec3 = [0, -1 / n, slope / n];
      const heights = samples.map(([, z], i) => (ys[i] - y0) * out[1] + (z - P.z) * out[2]);
      const floor = Math.min(...heights) - PATCH.depth;
      const front = Math.max(...heights) + PATCH.proud;
      /** The badge's frame `h` out from the fitted plane: x across, y up the chest, z out. */
      const plane = (h: number) =>
        frame([0, y0 + h * out[1], P.z + h * out[2]], [1, 0, 0], up, out);
      const recess = sweep(
        t(shape.offset(PATCH.fit, "Round", 2, 32)),
        plane(floor),
        front - floor + 5,
      );
      body = t(solidBody.subtract(recess));
      badge = sweep(shape, plane(floor), front - floor);
      // Printed on its back.
      badgePose = invertRigid(plane(floor));
      if (font) {
        // Capitals a share of the badge's height, smaller if the line is too wide.
        const height = max[1] - min[1];
        const room = LETTER_WIDTH[P.shape] * (max[0] - min[0]);
        const outline = (capHeight: number) =>
          textOutline({ wasm, scope }, font, { text: P.text, capHeight, align: "center" });
        let capHeight = PATCH.cap * height;
        const { min: lo, max: hi } = outline(capHeight).bounds();
        if (hi[0] - lo[0] > room) capHeight *= room / (hi[0] - lo[0]);
        const centred = t(
          outline(capHeight).translate([0, LETTER_RISE[P.shape] * P.hz - capHeight / 2]),
        );
        letters = sweep(centred, plane(front), PATCH.letters);
      }
    }

    // ---- Print layout: side by side along x, each resting on z = 0 ----------------------
    let cursor = 0;
    const place = (solid: Manifold, pose: Mat4): Mat4 => {
      const box = t(solid.transform(pose)).boundingBox();
      const shift = translation([cursor - box.min[0], -(box.min[1] + box.max[1]) / 2, -box.min[2]]);
      cursor += box.max[0] - box.min[0] + LAYOUT_GAP;
      return multiply(shift, pose);
    };
    const onePiece = (solid: Manifold, label: string) => {
      const pieces = solid.decompose().map(t);
      const real = pieces.filter((p) => p.volume() >= MIN_PIECE_VOLUME).length;
      if (real > 1) warnings.push(`The ${label} comes out in ${real} separate pieces.`);
    };
    const parts: Part[] = [];
    const add = (name: string, solid: Manifold, color: string, pose: Mat4, assembly?: string) => {
      parts.push({
        name,
        color,
        mesh: meshFromManifold(t(solid.transform(pose))),
        assembled: invertRigid(pose),
        ...(assembly ? { assembly } : {}),
      });
    };

    onePiece(body, "body");
    add("body", body, L.colors.suit, place(body, IDENTITY));
    if (badge) {
      // Face up, back on the bed.
      const pose = place(badge, badgePose);
      add(letters ? "badge" : "patch", badge, L.colors.patch, pose, letters ? "patch" : undefined);
      if (letters) add("letters", letters, L.colors.letters, pose, "patch");
    }

    onePiece(front, "head's front half");
    // Face down: the flat face on the bed, the seam up.
    add("head-front", front, L.colors.suit, place(front, rotationX(90)));
    onePiece(back, "head's back half");
    // Back down: the back's flat middle on the bed, the seam up, posts and fences pointing up.
    add("head-back", back, L.colors.suit, place(back, rotationX(-90)));
    // Discs lie on their outer face, bore up.
    const [left, right] = discs;
    add(
      "disc-left",
      left,
      L.colors.trim,
      place(left, frame([0, 0, 0], [0, 0, 1], [0, 1, 0], [-1, 0, 0])),
    );
    add(
      "disc-right",
      right,
      L.colors.trim,
      place(right, frame([0, 0, 0], [0, 0, -1], [0, 1, 0], [1, 0, 0])),
    );

    // Stand-ins: the glass behind the window and the eyes on it.
    const screen = k.prismY(
      t(k.roundedRect(2 * glass.hx, 2 * glass.hz, 2).translate([glass.cx, glass.cz])),
      glassY,
      glassY + 1.6,
      cz,
    );
    const eyes = t(
      M.union(
        eyeRects(L).map((e) =>
          k.prismY(
            t(k.roundedRect(2 * e.hx, 2 * e.hz, Math.min(e.hx, e.hz)).translate([e.x, e.z - cz])),
            glassY - 0.4,
            glassY + 0.1,
            cz,
          ),
        ),
      ),
    );
    const standIns: StandIn[] = [
      { name: "screen", mesh: meshFromManifold(screen), color: "#0b0b0d" },
      { name: "eyes", mesh: meshFromManifold(eyes), color: L.colors.eyes },
    ];

    return {
      parts,
      warnings,
      cutPlanes: [seamPlane(L)],
      standIns,
      extraFiles: [{ path: "ASSEMBLY.txt", content: assemblyNotes(L) }],
    };
  });
};

/** Hole centres on a hexagonal grid inside a rectangle of half sizes (hx, hz), centred. */
function grillePoints(hx: number, hz: number): [number, number][] {
  const r = GRILLE.radius;
  const row = GRILLE.pitch * Math.sin(Math.PI / 3);
  const points: [number, number][] = [];
  const rows = Math.floor((hz - r) / row);
  // Odd rows sit half a pitch over; the filter keeps every row symmetric about x = 0.
  const cols = Math.ceil(hx / GRILLE.pitch) + 1;
  for (let j = -rows; j <= rows; j++) {
    const shift = j % 2 === 0 ? 0 : GRILLE.pitch / 2;
    for (let i = -cols; i <= cols; i++) {
      const x = i * GRILLE.pitch + shift;
      if (Math.abs(x) + r <= hx) points.push([x, j * row]);
    }
  }
  return points;
}

function seamPlane(L: AstronautLayout): CutPlane {
  const { hw, hh, cz } = L.head;
  const [x0, x1] = [-hw - DISC.thickness - 2, hw + DISC.thickness + 2];
  const [z0, z1] = [cz - hh - NECK.length - 1, cz + hh + 2];
  const y = L.seamY;
  const corners: [Vec3, Vec3, Vec3, Vec3] = [
    [x0, y, z0],
    [x1, y, z0],
    [x1, y, z1],
    [x0, y, z1],
  ];
  return { name: "Head seam", corners };
}

function assemblyNotes(L: AstronautLayout): string {
  const buttons = L.pinHoles.map((h) => h.name).join(", ");
  const badge = L.patch?.text
    ? ["- patch-badge with patch-letters: face up, printed together in two colours."]
    : L.patch
      ? ["- patch: face up."]
      : [];
  const steps = [
    [
      "Flash the board. Lay it face down in head-front, glass in the shallow pocket, USB-C",
      ...(L.portrait
        ? [
            "down over the hole in the neck. Push the cable's USB-C plug up through the neck",
            "into the board.",
          ]
        : ["toward the opening on the right side."]),
    ],
    [
      "Press the speakers into the fences in head-back, leads out through the gaps at the",
      "bottom, and plug them and the battery into the board.",
    ],
    [
      "Close the head: the tongue of head-front slides into head-back, and the four posts",
      "press the board onto the front.",
    ],
    [
      "Fit a helmet disc on each side boss: turn it so the two notches inside line up with",
      "the hooks on the boss's points, push it on as far as it goes, and turn it clockwise",
      `(seen from that side) about ${TWIST.turn} degrees until it stops. The turn draws the`,
      "disc tight and clamps the halves together; turn it back to open the head.",
    ],
    ...(L.portrait
      ? [
          [
            "Thread the cable's other end down through the hole on top of the body and out",
            "under the base, and lay it in the notch toward the back.",
          ],
        ]
      : []),
    L.collar
      ? [
          "Lower the head straight onto the body: its neck, flat on both sides, slides into",
          "the neck ring. It does not lock; lift it straight off again.",
        ]
      : [
          `Set the head on the body turned about ${TWIST.turn} degrees anticlockwise (seen`,
          "from above), so the notches in the socket line up with the hooks on the neck,",
          "push it down, and turn it clockwise until it faces forward and stops.",
        ],
    ...(L.patch
      ? [["Glue the chest badge into the recess on the chest, its flat back on the floor."]]
      : []),
  ];
  return [
    "Screen astronaut: printing and assembly",
    "",
    "Hardware: Waveshare ESP32-S3-Touch-LCD-2.8 with its two speakers, a 502030 LiPo",
    "(about 5 x 20 x 30 mm), and a USB-C cable.",
    "",
    "Print orientation (already set in the files):",
    "- body: standing on its base.",
    ...badge,
    "- head-front: face down. head-back: back down, seam up.",
    "- disc-left, disc-right: outer face down, bore up.",
    "No supports are needed; the bosses and the neck have 45-degree points for that.",
    "",
    "Assembly:",
    ...steps.flatMap((lines, i) => lines.map((line, j) => (j === 0 ? `${i + 1}. ` : "   ") + line)),
    "",
    L.portrait
      ? `Buttons: the pin holes in the right side of the head reach ${buttons} (from the`
      : `Buttons: the pin holes on top of the head reach ${buttons} (left to right from`,
    L.portrait
      ? "middle upward); press them with a straightened paperclip."
      : "the middle); press them with a straightened paperclip.",
    "The battery is not held in place; it lies between the posts behind the board.",
    "",
  ].join("\n");
}

export default build;
