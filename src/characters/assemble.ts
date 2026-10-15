import type { CrossSection, Manifold } from "manifold-3d";
import { solidFromSdf, type Geom } from "../core/geom";
import { IDENTITY, invertRigid, multiply, rotationX, translation, type Mat4 } from "../core/mat4";
import type { WasmScope } from "../core/manifold";
import { meshFromManifold, withScope } from "../core/manifold";
import type { Vec3 } from "../core/bounds";
import type { Box3, Sdf } from "../core/sdf";
import type { CutPlane, GeneratorResult, ManifoldLib, Part } from "../core/types";
import { EDGE_ANGLE } from "./hardware";
import {
  BOSS,
  DOWEL,
  POCKET_CLEARANCE,
  POCKET_RIM,
  USB_OPENING,
  headBounds,
  headCoreSdf,
  neckHeightAt,
  neckNormal,
  type AccentMode,
  type CharacterLayout,
} from "./kit";

/**
 * Worker side of the character kit: meshes a character, hollows its head, cuts the face
 * openings, splits it into printable pieces with their joints, cuts the accents with the same
 * planes, lays everything out for printing, and reports where the cuts are.
 */

const SEGMENTS = 96;
/** Pieces smaller than this (mm³) are meshing crumbs, not features. */
const MIN_PIECE_VOLUME = 1;
/** Gap between parts in the print layout. */
const LAYOUT_GAP = 10;
/** Default thickness of a skin accent. */
export const SKIN_DEPTH = 1.2;

/** Manifold helpers bound to one scope; every result is tracked. */
export type Tools = {
  geom: Geom;
  M: ManifoldLib["Manifold"];
  CS: ManifoldLib["CrossSection"];
  t: <T extends Manifold | CrossSection>(x: T) => T;
  /** A 2D shape in the XZ plane (x right, z up, offset by `z`) swept along y. */
  prismY: (cs: CrossSection, yFront: number, yBack: number, z: number) => Manifold;
  /** A 2D shape in the XY plane swept up from z0 to z1. */
  prismZ: (cs: CrossSection, z0: number, z1: number) => Manifold;
  /** Cylinder along y at (x, z). */
  cylinderY: (radius: number, yFront: number, yBack: number, x: number, z: number) => Manifold;
  /** Cylinder along x at (y, z). */
  cylinderX: (radius: number, x0: number, x1: number, y: number, z: number) => Manifold;
  roundedRect: (w: number, h: number, r: number) => CrossSection;
};

export function tools(wasm: ManifoldLib, scope: WasmScope): Tools {
  const t = <T extends Manifold | CrossSection>(x: T): T => scope.track(x);
  const { Manifold: M, CrossSection: CS } = wasm;
  return {
    geom: { wasm, scope },
    M,
    CS,
    t,
    prismY: (cs, yFront, yBack, z) =>
      t(t(t(cs.extrude(yBack - yFront)).rotate([90, 0, 0])).translate([0, yBack, z])),
    prismZ: (cs, z0, z1) => t(t(cs.extrude(z1 - z0)).translate([0, 0, z0])),
    cylinderY: (radius, yFront, yBack, x, z) =>
      t(
        t(t(M.cylinder(yBack - yFront, radius, radius, 48)).rotate([90, 0, 0])).translate([
          x,
          yBack,
          z,
        ]),
      ),
    cylinderX: (radius, x0, x1, y, z) =>
      t(t(t(M.cylinder(x1 - x0, radius, radius, 48)).rotate([0, 90, 0])).translate([x0, y, z])),
    roundedRect: (w, h, r) =>
      r > 0
        ? t(t(CS.square([w - 2 * r, h - 2 * r], true)).offset(r, "Round", 2, 32))
        : t(CS.square([w, h], true)),
  };
}

/**
 * A coloured skin: the outer `depth` mm of `solid` inside `region`, measured inward from the
 * surface `sdf` describes. The inset surface is meshed only around the region, so a small patch
 * costs little. Works on any curved surface.
 */
export function skinAccent(
  k: Tools,
  solid: Manifold,
  sdf: Sdf,
  region: Manifold,
  edgeLength: number,
  depth = SKIN_DEPTH,
): Manifold {
  const b = region.boundingBox();
  const pad = depth + 2;
  const box: Box3 = {
    min: [b.min[0] - pad, b.min[1] - pad, b.min[2] - pad],
    max: [b.max[0] + pad, b.max[1] + pad, b.max[2] + pad],
  };
  const inset = solidFromSdf(k.geom, sdf, box, edgeLength * 0.75, depth);
  return k.t(k.t(solid.intersect(region)).subtract(inset));
}

/**
 * An accent region in a second colour. `flatAt` (a y plane its flat back lies on, the accent
 * in front of it) lets it be glued on; accents without it can only print in place.
 */
export type Accent = { name: string; solid: Manifold; flatAt?: number };

export type CharacterSpec = {
  /** What it is, for part names and notes: "dog", "robot". */
  noun: string;
  L: CharacterLayout;
  outerSdf: Sdf;
  outerBounds: Box3;
  accentMode: AccentMode;
  /** What the accents are, for the notes: "the nose and inner ears". */
  accentNote: string;
  bodyColor: string;
  accentColor: string;
  /** The accent regions, cut from the meshed outer solid. */
  accents: (outer: Manifold, k: Tools) => Accent[];
  /** Warnings the character found while laying itself out. */
  warnings: string[];
};

/** Where a piece sits: in front of or behind the split, above or below the neck cut. */
const SLOTS = ["front", "back", "upper", "lower"] as const;
type Slot = (typeof SLOTS)[number];
/** Assembly names for in-place accents, by the slot of the piece they print on. */
const GROUP: Record<Slot, string> = { front: "face", upper: "face", back: "rear", lower: "torso" };

export function buildCharacter(wasm: ManifoldLib, spec: CharacterSpec): GeneratorResult {
  const { L, noun, accentMode } = spec;
  const warnings = [...spec.warnings];
  if (!L.split.cut) {
    warnings.push("The head is not split, so the display cannot be fitted after printing.");
  }

  const parts = withScope((scope): Part[] => {
    const k = tools(wasm, scope);
    const { t, M, CS } = k;
    // The neck cut's frame: its point on the neck axis, z along the cut's normal.
    const neckFrame = multiply(translation([0, 0, L.neck.z]), rotationX(-L.neck.tilt));
    const normal = neckNormal(L.neck);
    const cutOffset = normal[2] * L.neck.z; // normal · (0, 0, neck.z)
    /** Cylinder on the neck axis, perpendicular to the neck cut, from `z0` to `z1` along it. */
    const neckCylinder = (radius: number, z0: number, z1: number) =>
      t(
        t(t(M.cylinder(z1 - z0, radius, radius, SEGMENTS)).translate([0, 0, z0])).transform(
          neckFrame,
        ),
      );

    // ---- Display footprint, window, and port --------------------------------------------
    const c = POCKET_CLEARANCE;
    const { shape, tab } = L.module;
    let footprint =
      shape.kind === "round"
        ? t(CS.circle(shape.diameter / 2 + c, SEGMENTS))
        : k.roundedRect(shape.width + 2 * c, shape.height + 2 * c, shape.corner + c);
    if (tab) {
      const reach =
        (shape.kind === "round" ? shape.diameter / 2 : shape.height / 2) + tab.beyond + c;
      const strip = t(
        t(t(CS.square([tab.width + 2 * c, reach])).translate([-tab.width / 2 - c, 0])).rotate(
          EDGE_ANGLE[L.edge],
        ),
      );
      footprint = t(footprint.add(strip));
    }
    const window =
      shape.kind === "round"
        ? t(CS.circle(shape.viewDiameter / 2, SEGMENTS))
        : k.roundedRect(
            shape.viewWidth,
            shape.viewHeight,
            Math.min(1.5, shape.viewWidth / 4, shape.viewHeight / 4),
          );

    // ---- The whole character: hollow head, pocket rim, window, pocket, port ---------------
    const outer = t(
      solidFromSdf(k.geom, spec.outerSdf, spec.outerBounds, L.meshEdge).trimByPlane([0, 0, 1], 0),
    );
    // The hollow's floor sits wall + 2 above the neck cut and parallel to it.
    const inner = t(
      solidFromSdf(k.geom, headCoreSdf(L), headBounds(L), L.meshEdge, L.wall).trimByPlane(
        normal,
        cutOffset + L.wall + 2,
      ),
    );
    const rimDepth = Math.min(L.module.thickness, POCKET_RIM);
    const rimBlock = t(
      k
        .prismY(
          t(footprint.offset(L.wall, "Round", 2, 32)),
          L.faceY,
          L.faceY + L.wall + rimDepth,
          L.cz,
        )
        .intersect(outer),
    );
    const openings: Manifold[] = [
      k.prismY(window, L.faceY - 1, L.faceY + L.wall + 0.5, L.cz),
      k.prismY(footprint, L.faceY + L.wall, L.faceY + L.wall + rimDepth + 1, L.cz),
    ];
    const [, ry] = L.head.radii;
    if (L.port.kind === "usb") {
      const { y, angle, from, to } = L.port;
      const slot = t(
        t(
          t(CS.square([USB_OPENING.width, to - from])).translate([-USB_OPENING.width / 2, from]),
        ).rotate(angle),
      );
      openings.push(k.prismY(slot, y - USB_OPENING.height / 2, y + USB_OPENING.height / 2, L.cz));
    } else {
      openings.push(k.cylinderY(L.port.radius, 0, ry + 10, 0, L.port.z));
    }
    const whole = t(
      t(M.union([t(outer.subtract(inner)), rimBlock])).subtract(t(M.union(openings))),
    );

    // ---- Accents --------------------------------------------------------------------------
    // Clipped to the finished shell, so an accent never fills the window or a port opening.
    const accents =
      accentMode === "none"
        ? []
        : spec.accents(outer, k).map((a) => ({ ...a, solid: t(a.solid.intersect(whole)) }));

    // ---- Cutting: the same planes for the body and its accents ----------------------------
    const splitY = L.split.cut ? L.split.y : 0;
    /** Splits a solid along the enabled cuts; `joints` adds the dowels, peg, and socket. */
    const cut = (solid: Manifold, joints: boolean): Partial<Record<Slot, Manifold>> => {
      let s = solid;
      if (joints && L.split.cut) {
        // Both halves print on the split face, so neither can carry a pin; the dowels are
        // pieces of filament pushed into holes on both sides, in bosses inside the wall.
        const bosses = L.bosses.map(([x, z]) =>
          k.cylinderY(BOSS.radius, splitY - BOSS.half, splitY + BOSS.half, x, z),
        );
        const dowels = L.bosses.map(([x, z]) =>
          k.cylinderY(
            (DOWEL.diameter + L.fit) / 2,
            splitY - DOWEL.depth,
            splitY + DOWEL.depth,
            x,
            z,
          ),
        );
        s = t(t(M.union([s, t(t(M.union(bosses)).intersect(outer))])).subtract(t(M.union(dowels))));
      }
      const out: Partial<Record<Slot, Manifold>> = {};
      let upper = s;
      if (L.neck.cut) {
        // The peg and socket run along the cut's normal, so the head slides straight on.
        const { pegRadius, pegLength } = L.neck;
        const [above, below] = s.splitByPlane(normal, cutOffset).map(t);
        upper = joints ? t(M.union([above, neckCylinder(pegRadius, -pegLength, 1)])) : above;
        out.lower = joints
          ? t(below.subtract(neckCylinder(pegRadius + L.fit, -pegLength - 0.5, 1)))
          : below;
      }
      if (L.split.cut) {
        const [back, front] = upper.splitByPlane([0, 1, 0], splitY).map(t);
        out.front = front;
        out.back = back;
      } else {
        out.upper = upper;
      }
      return out;
    };

    const shell =
      accents.length > 0 ? t(whole.subtract(t(M.union(accents.map((a) => a.solid))))) : whole;
    const bodyPieces = cut(shell, true);

    // Print poses: halves lie on the split face, an unsplit head stands upright on its peg,
    // the body and an uncut character stand on their base.
    const frontDown = (y: number) => multiply(translation([0, 0, y]), rotationX(-90));
    const backDown = (y: number) => multiply(translation([0, 0, -y]), rotationX(90));
    const prefix = L.neck.cut ? "head-" : "";
    const slots: { slot: Slot; name: string; pose: Mat4 }[] = [
      { slot: "front", name: `${prefix}front`, pose: frontDown(splitY) },
      { slot: "back", name: `${prefix}back`, pose: backDown(splitY) },
      {
        slot: "upper",
        name: L.neck.cut ? "head" : noun,
        pose: L.neck.cut
          ? multiply(translation([0, 0, L.neck.pegLength]), invertRigid(neckFrame))
          : IDENTITY,
      },
      { slot: "lower", name: "body", pose: IDENTITY },
    ];
    const shortName: Record<Slot, string> = {
      front: "front",
      back: "back",
      upper: "head",
      lower: "body",
    };

    /**
     * Drops crumbs below print resolution, which boolean cuts through thin, curved regions can
     * leave. A second real piece of a body piece means a cut runs through a thin feature; that
     * is a warning, not an error, so the preview still shows the new cut planes and the user can
     * move them. Accents may be several patches (two ear pods), each fused to its piece, so
     * they pass `patches`.
     */
    const onePiece = (solid: Manifold, label: string, patches = false) => {
      const found = solid.decompose().map(t);
      const real = found.filter((piece) => piece.volume() >= MIN_PIECE_VOLUME);
      if (real.length > 1 && !patches) {
        warnings.push(
          `The ${label} comes out in ${real.length} separate pieces: a cut passes through a thin ` +
            "feature such as the chin, ears, or tail. Move the neck cut or the head split.",
        );
      }
      if (real.length === 0) return null;
      return real.length === found.length ? solid : t(M.union(real));
    };

    // Accent fragments by slot (printed in place), or whole accents laid flat (glued on).
    type Fragment = { name: string; solid: Manifold; slot: Slot | null; pose: Mat4 };
    const fragments: Fragment[] = [];
    for (const accent of accents) {
      if (accentMode === "glue" && accent.flatAt !== undefined) {
        fragments.push({
          name: accent.name,
          solid: accent.solid,
          slot: null,
          pose: frontDown(accent.flatAt),
        });
        continue;
      }
      const accentPieces = cut(accent.solid, false);
      const cutUp = SLOTS.flatMap((slot) => {
        const solid = accentPieces[slot];
        return solid && solid.volume() >= MIN_PIECE_VOLUME ? [{ slot, solid }] : [];
      });
      for (const { slot, solid } of cutUp) {
        const name = cutUp.length === 1 ? accent.name : `${accent.name}-${shortName[slot]}`;
        fragments.push({ name, solid, slot, pose: IDENTITY });
      }
    }
    const grouped = new Set(fragments.flatMap((f) => (f.slot ? [f.slot] : [])));

    // ---- Print layout: side by side along x; in-place accents share their piece's pose ----
    const result: Part[] = [];
    let cursor = 0;
    const place = (solid: Manifold, pose: Mat4): Mat4 => {
      const box = t(solid.transform(pose)).boundingBox();
      const shift = translation([cursor - box.min[0], -(box.min[1] + box.max[1]) / 2, 0]);
      cursor += box.max[0] - box.min[0] + LAYOUT_GAP;
      return multiply(shift, pose);
    };
    const poseOf = new Map<Slot, Mat4>();
    for (const { slot, name, pose } of slots) {
      const piece = bodyPieces[slot];
      if (!piece) continue;
      const solid = onePiece(piece, name.replaceAll("-", " "));
      if (!solid) continue;
      const placed = place(solid, pose);
      poseOf.set(slot, placed);
      result.push({
        name,
        mesh: meshFromManifold(t(solid.transform(placed))),
        color: spec.bodyColor,
        assembled: invertRigid(placed),
        ...(grouped.has(slot) ? { assembly: GROUP[slot] } : {}),
      });
    }
    for (const fragment of fragments) {
      const solid = onePiece(fragment.solid, fragment.name.replaceAll("-", " "), true);
      if (!solid) continue;
      const slotPose = fragment.slot ? poseOf.get(fragment.slot) : undefined;
      const placed = slotPose ?? place(solid, fragment.pose);
      result.push({
        name: fragment.name,
        mesh: meshFromManifold(t(solid.transform(placed))),
        color: spec.accentColor,
        assembled: invertRigid(placed),
        ...(fragment.slot && slotPose ? { assembly: GROUP[fragment.slot] } : {}),
      });
    }
    // The uncut character, for printing in one piece; the assembled view shows the pieces.
    if (L.neck.cut || L.split.cut) {
      const solid = onePiece(whole, `whole ${noun}`) ?? whole;
      const placed = place(solid, IDENTITY);
      result.push({
        name: "whole",
        mesh: meshFromManifold(t(solid.transform(placed))),
        color: spec.bodyColor,
      });
    }
    return result;
  });

  return {
    parts,
    warnings,
    cutPlanes: cutPlanes(L, spec.outerBounds),
    extraFiles: [{ path: "ASSEMBLY.txt", content: assemblyNotes(spec) }],
  };
}

/** The enabled cuts, sized to the character (the head split only spans the head above the neck). */
function cutPlanes(L: CharacterLayout, bounds: Box3): CutPlane[] {
  const { min, max } = bounds;
  const [x0, x1, y0, y1, top] = [min[0], max[0], min[1], max[1], max[2]];
  const planes: CutPlane[] = [];
  if (L.neck.cut) {
    const [front, back] = [neckHeightAt(L.neck, y0), neckHeightAt(L.neck, y1)];
    const corners: [Vec3, Vec3, Vec3, Vec3] = [
      [x0, y0, front],
      [x1, y0, front],
      [x1, y1, back],
      [x0, y1, back],
    ];
    planes.push({ name: "Neck cut", corners });
  }
  if (L.split.cut) {
    const s = L.split.y;
    const bottom = L.neck.cut ? neckHeightAt(L.neck, s) : 0;
    const corners: [Vec3, Vec3, Vec3, Vec3] = [
      [x0, s, bottom],
      [x1, s, bottom],
      [x1, s, top],
      [x0, s, top],
    ];
    planes.push({ name: "Head split", corners });
  }
  return planes;
}

function assemblyNotes(spec: CharacterSpec): string {
  const { L, noun, accentMode, accentNote } = spec;
  const front = L.neck.cut ? "head-front" : "front";
  const back = L.neck.cut ? "head-back" : "back";
  const title = noun.charAt(0).toUpperCase() + noun.slice(1);
  const lines = [
    `Display ${noun}: printing and assembly`,
    "",
    "Print orientation (already set in the files):",
  ];
  if (L.split.cut) {
    lines.push(`- ${front} and ${back} lie on their flat split face.`);
  } else {
    lines.push(
      L.neck.cut
        ? "- head stands on its neck peg and needs supports."
        : `- ${noun} stands on its base and needs supports under the head.`,
    );
  }
  if (L.neck.cut) lines.push("- body stands on its flat base.");
  if (L.neck.cut || L.split.cut) {
    lines.push(`- whole is the ${noun} in one piece, for printing without assembly (no display).`);
  }
  if (accentMode === "inplace") {
    lines.push(
      `- ${accentNote.charAt(0).toUpperCase() + accentNote.slice(1)} print in place on their pieces: assign them a second filament.`,
    );
  } else if (accentMode === "glue") {
    lines.push(
      `- ${title} accents (${accentNote}) are separate; print them flat side down in a second colour.`,
    );
  }
  const steps: string[] = [];
  if (!L.split.cut) {
    steps.push("The head is not split, so the display cannot be fitted after printing.");
  } else {
    steps.push(
      "Press the display into the pocket behind the face window, screen first.",
      L.module.usb
        ? `Turn the board so its USB-C port faces the ${L.edge} opening.`
        : `Route the display wires through the head; the hole low in ${back} is for a cable.`,
      "Lay the battery flat behind the display, if you use one.",
      `Push a ${2 * DOWEL.depth - 0.5} mm piece of ${DOWEL.diameter} mm filament into each hole on the split face of ${back}, then press ${front} on.`,
    );
  }
  if (L.neck.cut) {
    steps.push(
      L.split.cut
        ? "Push the neck peg into the body's socket. The socket clamps both head halves together."
        : "Push the neck peg into the body's socket.",
    );
  }
  if (accentMode === "glue") steps.push(`Glue ${accentNote} onto their flat spots.`);
  lines.push("", "Assembly:", ...steps.map((s, i) => `${i + 1}. ${s}`));
  if (L.neck.cut) {
    lines.push(
      "",
      `Neck fit clearance: ${L.fit} mm. If the head is loose or too tight, change "Fit clearance" and reprint the body only.`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
