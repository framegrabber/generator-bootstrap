import { buildCharacter, type Accent } from "../../characters/assemble";
import { accentMode } from "../../characters/kit";
import { str } from "../../core/params";
import { scale } from "../../core/sdf";
import type { GeneratorBuild } from "../../core/types";
import { EAR_ACCENT_FLOOR, dogLayout, outerBounds, outerSdf } from "./layout";

/** The dog's shape and accents; the character kit does the hollowing, cutting, and layout. */
const build: GeneratorBuild = (values, { wasm }) => {
  const L = dogLayout(values);
  return buildCharacter(wasm, {
    noun: "dog",
    L,
    outerSdf: outerSdf(L),
    outerBounds: outerBounds(L),
    accentMode: accentMode(values),
    accentNote: "the nose and inner ears",
    bodyColor: str(values, "bodyColor"),
    accentColor: str(values, "accentColor"),
    warnings: L.snoutSkipped
      ? ["No room for the snout between the screen and the neck; increase the face margin."]
      : [],
    accents: (outer, k) => {
      const { t, M, CS } = k;
      const accents: Accent[] = [];
      // Nose: the front of the nose bump, flat-backed at its centre plane.
      if (L.nose) {
        const sphere = t(M.sphere(1, 48));
        const blob = t(t(sphere.scale(scale(L.nose.radii, 1.25))).translate(L.nose.center));
        const flatAt = L.nose.center[1];
        const tool = t(blob.trimByPlane([0, -1, 0], -flatAt));
        accents.push({ name: "nose", solid: t(outer.intersect(tool)), flatAt });
      }
      // Inner ears: the front of each ear inside its outline, in front of the head split.
      const splitY = L.split.cut ? L.split.y : 0;
      const earBack = Math.min(0, splitY) - EAR_ACCENT_FLOOR;
      const [, ry] = L.head.radii;
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
        const prism = k.prismY(outline, -ry - 20, earBack, 0);
        const name = ear.base[0] < 0 ? "inner-ear-left" : "inner-ear-right";
        accents.push({ name, solid: t(outer.intersect(prism)), flatAt: earBack });
      }
      return accents;
    },
  });
};

export default build;
