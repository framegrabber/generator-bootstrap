import { buildCharacter, skinAccent, type Accent } from "../../characters/assemble";
import { accentMode } from "../../characters/kit";
import { bool, str } from "../../core/params";
import { scale } from "../../core/sdf";
import type { GeneratorBuild } from "../../core/types";
import { outerBounds, outerSdf, robotLayout } from "./layout";

/**
 * The robot's shape and accents; the character kit does the hollowing, cutting, and layout.
 * Every accent is a region of the outer solid: the antenna tip whole, the ear pods and chest
 * badge as a 1.2 mm skin. They cross the head split, so the kit cuts them with the body.
 */
const build: GeneratorBuild = (values, { wasm }) => {
  const L = robotLayout(values);
  const sdf = outerSdf(L);
  return buildCharacter(wasm, {
    noun: "robot",
    L,
    outerSdf: sdf,
    outerBounds: outerBounds(L),
    accentMode: accentMode(values),
    accentNote: "the accents",
    bodyColor: str(values, "bodyColor"),
    accentColor: str(values, "accentColor"),
    warnings: [],
    accents: (outer, k) => {
      const { t, M, CS } = k;
      const accents: Accent[] = [];
      if (bool(values, "accentAntenna")) {
        if (L.ball) {
          // The ball down to just below its equator, where the stalk enters.
          const { center, radius } = L.ball;
          const blob = t(t(M.sphere(radius + 0.6, 48)).translate(center));
          const tool = t(blob.trimByPlane([0, 0, 1], center[2] - 0.6 * radius));
          accents.push({ name: "antenna-ball", solid: t(outer.intersect(tool)) });
        }
        if (L.leaves.length > 0) {
          const tools = L.leaves.map((leaf) =>
            t(
              t(
                t(t(M.sphere(1, 48)).scale(scale(leaf.radii, 1.2))).rotate([0, -leaf.angle, 0]),
              ).translate(leaf.center),
            ),
          );
          accents.push({ name: "leaves", solid: t(outer.intersect(t(M.union(tools)))) });
        }
      }
      if (bool(values, "accentPods") && L.pods.length > 0) {
        // The outer face of each pod and its rounded rim.
        const caps = L.pods.map((pod) => {
          const side = Math.sign(pod.center[0]);
          const face = Math.abs(pod.center[0]) + pod.half;
          const [x0, x1] = side > 0 ? [face - 2.5, face + 2] : [-face - 2, -face + 2.5];
          return k.cylinderX(pod.radius + 1, x0, x1, pod.center[1], pod.center[2]);
        });
        accents.push({
          name: "ear-pods",
          solid: skinAccent(k, outer, sdf, t(M.union(caps)), L.meshEdge),
        });
      }
      if (bool(values, "chestBadge")) {
        const { center, radius } = L.badge;
        const disc = k.prismY(t(CS.circle(radius, 64)), center[1] - 10, center[1] + 5, center[2]);
        accents.push({ name: "chest-badge", solid: skinAccent(k, outer, sdf, disc, L.meshEdge) });
      }
      return accents;
    },
  });
};

export default build;
