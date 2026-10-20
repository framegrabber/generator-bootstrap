import type { CrossSection, Manifold } from "manifold-3d";
import { tools } from "../../characters/assemble";
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
import type { CutPlane, GeneratorBuild, Part, StandIn } from "../../core/types";
import {
  astronautLayout,
  BOSS,
  bodyBounds,
  bodySdf,
  discBounds,
  discSdf,
  DISC,
  eyeRects,
  FENCE,
  GRILLE,
  HEAD_SINK,
  headBounds,
  headSdf,
  PIN_HOLE,
  POCKET,
  POST,
  patchBounds,
  patchSdf,
  STEM,
  TONGUE,
  USB_OPENING,
  WALL,
  type AstronautLayout,
} from "./layout";

/** Gap between parts on the print bed. */
const LAYOUT_GAP = 10;
/** Pieces smaller than this are meshing crumbs, not parts of the model. */
const MIN_PIECE_VOLUME = 1;

/**
 * The printable astronaut: body (with the chest patch printed in place), the head's front and
 * back halves, and two helmet discs, each in its print pose and laid out along x. The screen
 * and eyes are assembled-view stand-ins.
 *
 * Curved surfaces are meshed from the layout's distance functions; every fitting (window,
 * board pocket, USB-C opening, pin holes, bosses, stem, tongue, posts, speaker fences,
 * grille, socket) is an exact Manifold solid, so clearances hold at any mesh detail.
 */
const build: GeneratorBuild = (values, { wasm }) => {
  const L = astronautLayout(values);
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
    /** The stem's frame: lemon points along ±y, swept up from z = `z`. */
    const stemFrame = (z: number): Mat4 => frame([0, L.seamY, z], [0, 1, 0], [-1, 0, 0], [0, 0, 1]);
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
    const { glass, view } = L.head;
    const glassCS = t(
      k
        .roundedRect(2 * (glass.hx + POCKET.fit), 2 * (glass.hz + POCKET.fit), 2)
        .translate([glass.cx, glass.cz]),
    );
    // A shallow frame around the glass locates the board on the inside of the front wall.
    const pocketFrame = k.prismY(
      t(t(outline.offset(-(WALL - 0.3), "Round", 2, 32)).subtract(glassCS)),
      WALL - 0.3,
      WALL + POCKET.depth,
      cz,
    );
    const bosses = ([-1, 1] as const).map((s) =>
      sweep(lemon(BOSS.radius), sideFrame(s, s * (hw - WALL)), WALL + BOSS.length),
    );
    const stem = sweep(lemon(STEM.radius), stemFrame(cz - hh - STEM.length), STEM.length + WALL);
    const openings: Manifold[] = [
      k.prismY(k.roundedRect(2 * (view.hx + 0.6), 2 * (view.hz + 0.6), 2.5), -1, WALL + 0.5, cz),
      // The module is as wide as the inside, so its pocket shaves the wall where it is tight.
      k.prismY(glassCS, WALL - 0.01, WALL + 10.5, cz),
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
    ];
    const head = t(
      t(M.union([t(outer.subtract(inner)), pocketFrame, ...bosses, stem])).subtract(
        t(M.union(openings)),
      ),
    );
    const [backRaw, frontRaw] = head.splitByPlane([0, 1, 0], L.seamY).map(t);

    const tongue = k.prismY(
      ring(TONGUE.outer, TONGUE.inner),
      L.seamY - 0.01,
      L.seamY + TONGUE.height,
      cz,
    );
    const front = t(M.union([frontRaw, tongue]));

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

    // ---- Helmet discs: a rounded disc with the boss's profile as its bore --------------
    const discs = ([-1, 1] as const).map((s) => {
      const bore = sweep(
        lemon(BOSS.radius + DISC.fit),
        sideFrame(s, s * (hw - 0.01)),
        BOSS.length + 0.3,
      );
      return t(mesh(discSdf(L, s), discBounds(L, s)).subtract(bore));
    });

    // ---- Body: one piece, with the socket the split stem plugs into --------------------
    const socketBottom = L.body.top - HEAD_SINK - STEM.length - 0.5;
    const socket = sweep(
      lemon(STEM.radius + STEM.fit),
      stemFrame(socketBottom),
      L.body.top + 1 - socketBottom,
    );
    const patch = L.patch ? mesh(patchSdf(L), patchBounds(L)) : null;
    const solidBody = t(mesh(bodySdf(L), bodyBounds(L)).subtract(socket));
    const body = patch ? t(solidBody.subtract(patch)) : solidBody;

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
    const bodyPose = place(body, IDENTITY);
    add(patch ? "suit" : "body", body, L.colors.suit, bodyPose, patch ? "body" : undefined);
    if (patch) add("patch", patch, L.colors.patch, bodyPose, "body");

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
      WALL,
      WALL + 1.6,
      cz,
    );
    const eyes = t(
      M.union(
        eyeRects(L).map((e) =>
          k.prismY(
            t(k.roundedRect(2 * e.hx, 2 * e.hz, Math.min(e.hx, e.hz)).translate([e.x, e.z - cz])),
            WALL - 0.4,
            WALL + 0.1,
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
  for (let j = -rows; j <= rows; j++) {
    const shift = j % 2 === 0 ? 0 : GRILLE.pitch / 2;
    const cols = Math.floor((hx - r - shift) / GRILLE.pitch);
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
  const [z0, z1] = [cz - hh - STEM.length - 1, cz + hh + 2];
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
  const body = L.patch ? "body (suit and patch, printed together in two colours)" : "body";
  return [
    "Screen astronaut: printing and assembly",
    "",
    "Hardware: Waveshare ESP32-S3-Touch-LCD-2.8 with its two speakers, a 502030 LiPo",
    "(about 5 x 20 x 30 mm), and a USB-C cable.",
    "",
    "Print orientation (already set in the files):",
    `- ${body}: standing on its base.`,
    "- head-front: face down. head-back: back down, seam up.",
    "- disc-left, disc-right: outer face down, bore up.",
    "No supports are needed; the bosses and the neck stem have 45-degree points for that.",
    "",
    "Assembly:",
    "1. Flash the board. Lay it face down in head-front, glass in the shallow pocket, USB-C",
    "   toward the opening on the right side.",
    "2. Press the speakers into the fences in head-back, leads out through the gaps at the",
    "   bottom, and plug them and the battery into the board.",
    "3. Close the head: the tongue of head-front slides into head-back, and the four posts",
    "   press the board onto the front.",
    "4. Push a helmet disc onto each side boss; the discs hold the halves together.",
    "5. Plug the neck stem into the socket on top of the body.",
    "",
    `Buttons: the pin holes on top of the head reach ${buttons} (left to right from`,
    "the middle); press them with a straightened paperclip.",
    "The battery is not held in place; it lies between the posts behind the board.",
    "",
  ].join("\n");
}

export default build;
