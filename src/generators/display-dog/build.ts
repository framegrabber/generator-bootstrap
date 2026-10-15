import type { CrossSection, Manifold } from "manifold-3d";
import type { Vec3 } from "../../core/bounds";
import { solidFromSdf, type Geom } from "../../core/geom";
import {
  IDENTITY,
  invertRigid,
  multiply,
  rotationX,
  translation,
  type Mat4,
} from "../../core/mat4";
import { meshFromManifold, withScope } from "../../core/manifold";
import { str } from "../../core/params";
import { scale } from "../../core/sdf";
import type { CutPlane, GeneratorBuild, Part } from "../../core/types";
import {
  BOSS,
  EAR_ACCENT_FLOOR,
  EDGE_ANGLE,
  DOWEL,
  POCKET_CLEARANCE,
  POCKET_RIM,
  USB_OPENING,
  dogLayout,
  headBounds,
  headCoreSdf,
  outerBounds,
  outerSdf,
  type DogLayout,
} from "./layout";

const SEGMENTS = 96;
/** Assembly name for the head front and its in-place accents. */
const FACE = "face";
/** Pieces smaller than this (mm³) are meshing crumbs, not features. */
const MIN_PIECE_VOLUME = 1;
/** Gap between parts in the print layout. */
const LAYOUT_GAP = 10;

const build: GeneratorBuild = (values, { wasm }) => {
  const L = dogLayout(values);
  const accentMode = str(values, "accentMode");
  const bodyColor = str(values, "bodyColor");
  const accentColor = str(values, "accentColor");
  const warnings: string[] = [];
  if (L.snoutSkipped) {
    warnings.push(
      "No room for the snout between the screen and the neck; increase the face margin.",
    );
  }
  if (!L.split.cut) {
    warnings.push("The head is not split, so the display cannot be fitted after printing.");
  }

  const parts = withScope((scope): Part[] => {
    const geom: Geom = { wasm, scope };
    const t = <T extends Manifold | CrossSection>(x: T): T => scope.track(x);
    const { Manifold: M, CrossSection: CS } = wasm;

    /** A 2D shape in the face plane (x right, z up from the display centre) swept along y. */
    const prismY = (cs: CrossSection, yFront: number, yBack: number, zCenter = L.cz) =>
      t(t(t(cs.extrude(yBack - yFront)).rotate([90, 0, 0])).translate([0, yBack, zCenter]));
    /** Cylinder along y at (x, z). */
    const cylinderY = (radius: number, yFront: number, yBack: number, x: number, z: number) =>
      t(
        t(t(M.cylinder(yBack - yFront, radius, radius, 48)).rotate([90, 0, 0])).translate([
          x,
          yBack,
          z,
        ]),
      );
    /** Cylinder along z on the neck axis. */
    const cylinderZ = (radius: number, z0: number, z1: number) =>
      t(t(M.cylinder(z1 - z0, radius, radius, SEGMENTS)).translate([0, 0, z0]));
    const roundedRect = (w: number, h: number, r: number) =>
      r > 0
        ? t(t(CS.square([w - 2 * r, h - 2 * r], true)).offset(r, "Round", 2, 32))
        : t(CS.square([w, h], true));

    // ---- Display footprint, window, and port --------------------------------------------
    const c = POCKET_CLEARANCE;
    const { shape, tab } = L.module;
    let footprint =
      shape.kind === "round"
        ? t(CS.circle(shape.diameter / 2 + c, SEGMENTS))
        : roundedRect(shape.width + 2 * c, shape.height + 2 * c, shape.corner + c);
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
        : roundedRect(
            shape.viewWidth,
            shape.viewHeight,
            Math.min(1.5, shape.viewWidth / 4, shape.viewHeight / 4),
          );

    // ---- The whole dog: hollow head, pocket rim, window, pocket, port ---------------------
    const outer = t(
      solidFromSdf(geom, outerSdf(L), outerBounds(L), L.meshEdge).trimByPlane([0, 0, 1], 0),
    );
    const inner = t(
      solidFromSdf(geom, headCoreSdf(L), headBounds(L), L.meshEdge, L.wall).trimByPlane(
        [0, 0, 1],
        L.neck.z + L.wall + 2,
      ),
    );
    const rimDepth = Math.min(L.module.thickness, POCKET_RIM);
    const rimBlock = t(
      prismY(
        t(footprint.offset(L.wall, "Round", 2, 32)),
        L.faceY,
        L.faceY + L.wall + rimDepth,
      ).intersect(outer),
    );
    const openings: Manifold[] = [
      prismY(window, L.faceY - 1, L.faceY + L.wall + 0.5),
      prismY(footprint, L.faceY + L.wall, L.faceY + L.wall + rimDepth + 1),
    ];
    const [, ry] = L.head.radii;
    if (L.port.kind === "usb") {
      const { y, angle, from, to } = L.port;
      const slot = t(
        t(
          t(CS.square([USB_OPENING.width, to - from])).translate([-USB_OPENING.width / 2, from]),
        ).rotate(angle),
      );
      openings.push(prismY(slot, y - USB_OPENING.height / 2, y + USB_OPENING.height / 2));
    } else {
      openings.push(cylinderY(L.port.radius, 0, ry + 10, 0, L.port.z));
    }
    const whole = t(
      t(M.union([t(outer.subtract(inner)), rimBlock])).subtract(t(M.union(openings))),
    );

    // ---- Accents: regions of the outer surface in a second colour -------------------------
    // They belong to the piece with the face, so they stay in front of the head split.
    const splitY = L.split.cut ? L.split.y : 0;
    type Accent = { name: string; solid: Manifold; flatAt: number };
    const accents: Accent[] = [];
    if (accentMode !== "none") {
      if (L.nose) {
        const sphere = t(M.sphere(1, 48));
        const blob = t(t(sphere.scale(scale(L.nose.radii, 1.25))).translate(L.nose.center));
        const flatAt = L.nose.center[1];
        const tool = t(blob.trimByPlane([0, -1, 0], -flatAt));
        accents.push({ name: "nose", solid: t(outer.intersect(tool)), flatAt });
      }
      const earBack = Math.min(0, splitY) - EAR_ACCENT_FLOOR;
      for (const ear of L.ears) {
        if (!ear.accent) continue;
        const outline =
          ear.accent.kind === "hull"
            ? t(
                CS.hull(
                  ear.accent.circles.map(([x, z, r]) => t(t(CS.circle(r, 32)).translate([x, z]))),
                ),
              )
            : t(
                t(
                  t(t(CS.circle(1, 48)).scale(ear.accent.radii)).rotate(ear.accent.angle),
                ).translate(ear.accent.center),
              );
        const prism = prismY(outline, -ry - 20, earBack, 0);
        const name = ear.base[0] < 0 ? "inner-ear-left" : "inner-ear-right";
        accents.push({ name, solid: t(outer.intersect(prism)), flatAt: earBack });
      }
    }

    // ---- Pieces: the whole dog cut along the enabled planes -------------------------------
    let shell =
      accents.length > 0 ? t(whole.subtract(t(M.union(accents.map((a) => a.solid))))) : whole;
    if (L.split.cut) {
      // Both halves print on the split face, so neither can carry a pin; the dowels are
      // pieces of filament pushed into holes on both sides, in bosses inside the wall.
      const bosses = L.bosses.map(([x, z]) =>
        cylinderY(BOSS.radius, splitY - BOSS.half, splitY + BOSS.half, x, z),
      );
      const dowels = L.bosses.map(([x, z]) =>
        cylinderY((DOWEL.diameter + L.fit) / 2, splitY - DOWEL.depth, splitY + DOWEL.depth, x, z),
      );
      shell = t(
        t(M.union([shell, t(t(M.union(bosses)).intersect(outer))])).subtract(t(M.union(dowels))),
      );
    }
    let upper = shell;
    let lower: Manifold | null = null;
    if (L.neck.cut) {
      const { z, pegRadius, pegLength } = L.neck;
      const [above, below] = shell.splitByPlane([0, 0, 1], z).map(t);
      upper = t(M.union([above, cylinderZ(pegRadius, z - pegLength, z + 1)]));
      lower = t(below.subtract(cylinderZ(pegRadius + L.fit, z - pegLength - 0.5, z + 1)));
    }

    /** A piece in its print pose: `pose` maps assembled coordinates to it. */
    type Piece = { name: string; solid: Manifold; pose: Mat4; color: string; face?: boolean };
    const pieces: Piece[] = [];
    // Head halves (or the whole dog's halves) lie on the split face: front face up, back face up.
    const frontDown = (y: number) => multiply(translation([0, 0, y]), rotationX(-90));
    const backDown = (y: number) => multiply(translation([0, 0, -y]), rotationX(90));
    const prefix = L.neck.cut ? "head-" : "";
    if (L.split.cut) {
      const [back, front] = upper.splitByPlane([0, 1, 0], splitY).map(t);
      pieces.push(
        {
          name: `${prefix}front`,
          solid: front,
          pose: frontDown(splitY),
          color: bodyColor,
          face: true,
        },
        { name: `${prefix}back`, solid: back, pose: backDown(splitY), color: bodyColor },
      );
    } else {
      // An unsplit head stands on its peg; the uncut dog on its base.
      const lift = L.neck.cut ? L.neck.pegLength - L.neck.z : 0;
      const name = L.neck.cut ? "head" : "dog";
      pieces.push({
        name,
        solid: upper,
        pose: translation([0, 0, lift]),
        color: bodyColor,
        face: true,
      });
    }
    if (lower) pieces.push({ name: "body", solid: lower, pose: IDENTITY, color: bodyColor });
    const facePiece = pieces.find((p) => p.face);
    for (const accent of accents) {
      pieces.push({
        name: accent.name,
        solid: accent.solid,
        // Printed in place: same pose as the face piece. Glued on: flat side down.
        pose: accentMode === "inplace" && facePiece ? facePiece.pose : frontDown(accent.flatAt),
        color: accentColor,
      });
    }

    /**
     * Drops crumbs below print resolution, which boolean cuts through thin, curved regions (ear
     * edges at coarse detail) can leave. A second real piece means a cut runs through a thin
     * feature; that is a warning, not an error, so the preview still shows the new cut planes
     * and the user can move them.
     */
    const onePiece = (solid: Manifold, label: string) => {
      const pieces = solid.decompose().map(t);
      const real = pieces.filter((piece) => piece.volume() >= MIN_PIECE_VOLUME);
      if (real.length > 1) {
        warnings.push(
          `The ${label} comes out in ${real.length} separate pieces: a cut passes through a thin ` +
            "feature such as the chin, ears, or tail. Move the neck cut or the head split.",
        );
      }
      return real.length === pieces.length ? solid : t(M.union(real));
    };

    // ---- Print layout: side by side along x, in-place accents with their face piece --------
    const inPlace = accentMode === "inplace" && facePiece !== undefined && accents.length > 0;
    const result: Part[] = [];
    let cursor = 0;
    const place = (solid: Manifold, pose: Mat4): Mat4 => {
      const box = t(solid.transform(pose)).boundingBox();
      const shift = translation([cursor - box.min[0], -(box.min[1] + box.max[1]) / 2, 0]);
      cursor += box.max[0] - box.min[0] + LAYOUT_GAP;
      return multiply(shift, pose);
    };
    let facePose: Mat4 | null = null;
    for (const piece of pieces) {
      const solid = onePiece(piece.solid, piece.name.replaceAll("-", " "));
      const isAccent = accents.some((a) => a.name === piece.name);
      const grouped = inPlace && (piece.face || isAccent);
      const pose: Mat4 = grouped && isAccent && facePose ? facePose : place(solid, piece.pose);
      if (piece.face) facePose = pose;
      result.push({
        name: piece.name,
        mesh: meshFromManifold(t(solid.transform(pose))),
        color: piece.color,
        assembled: invertRigid(pose),
        ...(grouped ? { assembly: FACE } : {}),
      });
    }
    // The uncut dog, for printing in one piece; the assembled view shows the pieces instead.
    if (L.neck.cut || L.split.cut) {
      const pose = place(whole, IDENTITY);
      result.push({
        name: "whole",
        mesh: meshFromManifold(t(onePiece(whole, "whole dog").transform(pose))),
        color: bodyColor,
      });
    }
    return result;
  });

  return {
    parts,
    warnings,
    cutPlanes: cutPlanes(L),
    extraFiles: [{ path: "ASSEMBLY.txt", content: assemblyNotes(L, accentMode) }],
  };
};

/** The enabled cuts, sized to the dog (the head split only spans the head above the neck). */
function cutPlanes(L: DogLayout): CutPlane[] {
  const { min, max } = outerBounds(L);
  const top: Vec3 = [max[0], max[1], max[2]];
  const at = (z: number): Vec3 => [min[0], min[1], z];
  const planes: CutPlane[] = [];
  if (L.neck.cut) {
    planes.push({ name: "Neck cut", axis: 2, at: L.neck.z, bounds: { min: at(0), max: top } });
  }
  if (L.split.cut) {
    const bounds = { min: at(L.neck.cut ? L.neck.z : 0), max: top };
    planes.push({ name: "Head split", axis: 1, at: L.split.y, bounds });
  }
  return planes;
}

function assemblyNotes(L: DogLayout, accentMode: string): string {
  const front = L.neck.cut ? "head-front" : "front";
  const back = L.neck.cut ? "head-back" : "back";
  const lines = [
    "Display dog: printing and assembly",
    "",
    "Print orientation (already set in the files):",
  ];
  if (L.split.cut) {
    lines.push(`- ${front} and ${back} lie on their flat split face.`);
  } else {
    lines.push(
      L.neck.cut
        ? "- head stands on its neck peg and needs supports."
        : "- dog stands on its base and needs supports under the head.",
    );
  }
  if (L.neck.cut) lines.push("- body stands on its flat base.");
  if (L.neck.cut || L.split.cut) {
    lines.push("- whole is the dog in one piece, for printing without assembly (no display).");
  }
  if (accentMode === "inplace") {
    lines.push(
      "- The nose and inner ears print in place on the face piece: assign them a second filament.",
    );
  } else if (accentMode === "glue") {
    lines.push(
      "- The nose and inner ears are separate; print them flat side down in a second colour.",
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
  if (accentMode === "glue") steps.push("Glue the nose and inner ears onto their flat spots.");
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

export default build;
