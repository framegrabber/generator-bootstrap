import type { CrossSection, Manifold } from "manifold-3d";
import { solidFromSdf, type Geom } from "../../core/geom";
import { scale } from "../../core/sdf";
import { meshFromManifold, withScope } from "../../core/manifold";
import { str } from "../../core/params";
import type { GeneratorBuild, Part } from "../../core/types";
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

    // ---- Outer solid, split into head and body at the neck --------------------------------
    const outer = t(
      solidFromSdf(geom, outerSdf(L), outerBounds(L), L.meshEdge).trimByPlane([0, 0, 1], 0),
    );
    const [headSolid, bodySolid] = outer.splitByPlane([0, 0, 1], L.neck.z).map(t);

    // ---- Head: hollow, pocket rim, pin bosses, neck peg -----------------------------------
    const floorZ = L.neck.z + L.wall + 2;
    const inner = t(
      solidFromSdf(geom, headCoreSdf(L), headBounds(L), L.meshEdge, L.wall).trimByPlane(
        [0, 0, 1],
        floorZ,
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
    const bosses = t(
      t(
        M.union(L.bosses.map(([x, z]) => cylinderY(BOSS.radius, -BOSS.half, BOSS.half, x, z))),
      ).intersect(outer),
    );
    const peg = cylinderZ(L.neck.pegRadius, L.neck.z - L.neck.pegLength, L.neck.z + 1);
    let head = t(M.union([t(headSolid.subtract(inner)), rimBlock, bosses, peg]));

    const cuts: Manifold[] = [
      prismY(window, L.faceY - 1, L.faceY + L.wall + 0.5),
      prismY(footprint, L.faceY + L.wall, L.faceY + L.wall + rimDepth + 1),
    ];
    if (L.port.kind === "usb") {
      const { y, angle, from, to } = L.port;
      const slot = t(
        t(
          t(CS.square([USB_OPENING.width, to - from])).translate([-USB_OPENING.width / 2, from]),
        ).rotate(angle),
      );
      cuts.push(prismY(slot, y - USB_OPENING.height / 2, y + USB_OPENING.height / 2));
    } else {
      const [, ry] = L.head.radii;
      cuts.push(cylinderY(L.port.radius, 0, ry + 10, 0, L.port.z));
    }

    // ---- Accents: regions of the outer surface in a second colour -------------------------
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
        const [, ry] = L.head.radii;
        const prism = prismY(outline, -ry - 20, -EAR_ACCENT_FLOOR, 0);
        const name = ear.base[0] < 0 ? "inner-ear-left" : "inner-ear-right";
        accents.push({ name, solid: t(outer.intersect(prism)), flatAt: -EAR_ACCENT_FLOOR });
      }
      cuts.push(...accents.map((a) => a.solid));
    }
    head = t(head.subtract(t(M.union(cuts))));

    // ---- Split the head front/back, with dowel holes across the split ---------------------
    // Both halves print on the split face, so neither can carry a pin; the dowels are
    // pieces of filament pushed into holes on both sides.
    const dowels = L.bosses.map(([x, z]) =>
      cylinderY((DOWEL.diameter + L.fit) / 2, -DOWEL.depth, DOWEL.depth, x, z),
    );
    const [headBack, headFront] = t(head.subtract(t(M.union(dowels))))
      .splitByPlane([0, 1, 0], 0)
      .map(t);

    // ---- Body with the neck socket -------------------------------------------------------
    const socket = cylinderZ(
      L.neck.pegRadius + L.fit,
      L.neck.z - L.neck.pegLength - 0.5,
      L.neck.z + 1,
    );
    const body = t(bodySolid.subtract(socket));

    /**
     * The solid as one printable piece. Boolean cuts through thin, curved regions (ear edges at
     * coarse detail) can leave crumbs below print resolution; those are dropped. Any second
     * real piece is an error: it would print as a loose part.
     */
    const onePiece = (solid: Manifold, label: string) => {
      const real = solid
        .decompose()
        .map(t)
        .filter((piece) => piece.volume() >= MIN_PIECE_VOLUME);
      if (real.length !== 1) {
        throw new Error(
          `The ${label} came out in ${real.length} separate pieces. Try other ear, tail, or snout settings.`,
        );
      }
      return real[0];
    };

    // Print orientation: head halves lie on the split face, the body stands on its base.
    const faceDown = (m: Manifold, flatAt = 0) =>
      t(t(m.rotate([-90, 0, 0])).translate([0, 0, flatAt]));
    const result: Part[] = [];
    const frontPrint = faceDown(onePiece(headFront, "head front"));
    result.push({
      name: "head-front",
      mesh: meshFromManifold(frontPrint),
      color: bodyColor,
      ...(accentMode === "inplace" && accents.length > 0 ? { assembly: FACE } : {}),
    });
    result.push({
      name: "head-back",
      mesh: meshFromManifold(t(onePiece(headBack, "head back").rotate([90, 0, 0]))),
      color: bodyColor,
    });
    result.push({ name: "body", mesh: meshFromManifold(onePiece(body, "body")), color: bodyColor });
    for (const accent of accents) {
      const solid = onePiece(accent.solid, accent.name.replaceAll("-", " "));
      result.push(
        accentMode === "inplace"
          ? {
              name: accent.name,
              mesh: meshFromManifold(faceDown(solid)),
              color: accentColor,
              assembly: FACE,
            }
          : {
              name: accent.name,
              mesh: meshFromManifold(faceDown(solid, accent.flatAt)),
              color: accentColor,
            },
      );
    }
    return result;
  });

  return {
    parts,
    warnings,
    extraFiles: [{ path: "ASSEMBLY.txt", content: assemblyNotes(L, accentMode) }],
  };
};

function assemblyNotes(L: DogLayout, accentMode: string): string {
  const lines = [
    "Display dog: printing and assembly",
    "",
    "Print orientation (already set in the files):",
    "- head-front and head-back lie on their flat split face; no supports needed.",
    "- body stands on its flat base.",
  ];
  if (accentMode === "inplace") {
    lines.push(
      "- The nose and inner ears print in place on head-front: assign them a second filament.",
    );
  } else if (accentMode === "glue") {
    lines.push(
      "- The nose and inner ears are separate; print them flat side down in a second colour.",
    );
  }
  lines.push(
    "",
    "Assembly:",
    "1. Press the display into the pocket behind the face window, screen first.",
    L.module.usb
      ? `2. Turn the board so its USB-C port faces the ${L.edge} opening.`
      : "2. Route the display wires through the head; the hole low in head-back is for a cable.",
    "3. Lay the battery flat behind the display, if you use one.",
    `4. Push a ${2 * DOWEL.depth - 0.5} mm piece of ${DOWEL.diameter} mm filament into each hole on the split face of head-back, then press head-front on.`,
    "5. Push the neck peg into the body's socket. The socket clamps both head halves together.",
  );
  if (accentMode === "glue") lines.push("6. Glue the nose and inner ears onto their flat spots.");
  lines.push(
    "",
    `Neck fit clearance: ${L.fit} mm. If the head is loose or too tight, change "Fit clearance" and reprint the body only.`,
    "",
  );
  return lines.join("\n");
}

export default build;
