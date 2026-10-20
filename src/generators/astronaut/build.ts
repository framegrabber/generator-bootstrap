import { solidFromSdf } from "../../core/geom";
import { meshFromManifold, withScope } from "../../core/manifold";
import type { Box3, Sdf } from "../../core/sdf";
import type { GeneratorBuild, Part } from "../../core/types";
import {
  antennaBounds,
  antennaSdf,
  astronautLayout,
  bodyBounds,
  bodySdf,
  earsBounds,
  earsSdf,
  eyesSdf,
  headBounds,
  headSdf,
  patchBounds,
  patchSdf,
  screenSdf,
} from "./layout";

/**
 * Meshes each shape of the layout as its own coloured part, all in one assembly so the model
 * keeps its assembled coordinates and rests on the bed as a whole. Look development only: the
 * head is solid and the screen and eyes are display stand-ins.
 */
const build: GeneratorBuild = (values, { wasm }) => {
  const L = astronautLayout(values);
  const head = headBounds(L);
  const shapes: { name: string; color: string; sdf: Sdf; bounds: Box3 }[] = [
    { name: "body", color: L.colors.suit, sdf: bodySdf(L), bounds: bodyBounds(L) },
    { name: "head", color: L.colors.suit, sdf: headSdf(L), bounds: head },
    { name: "screen", color: "#0b0b0d", sdf: screenSdf(L), bounds: head },
    { name: "eyes", color: L.colors.eyes, sdf: eyesSdf(L), bounds: head },
  ];
  if (L.ears) {
    shapes.push({
      name: "helmet-discs",
      color: L.colors.trim,
      sdf: earsSdf(L),
      bounds: earsBounds(L),
    });
  }
  if (L.antenna) {
    shapes.push({
      name: "antenna",
      color: L.colors.trim,
      sdf: antennaSdf(L),
      bounds: antennaBounds(L),
    });
  }
  if (L.patch) {
    shapes.push({
      name: "chest-patch",
      color: L.colors.patch,
      sdf: patchSdf(L),
      bounds: patchBounds(L),
    });
  }

  // Level sets close off flat wherever the surface reaches the bounds, so leave each shape a
  // grid cell and a millimetre of room.
  const pad = L.meshEdge + 1;
  const parts: Part[] = withScope((scope) =>
    shapes.map(({ name, color, sdf, bounds: { min, max } }) => {
      const bounds: Box3 = {
        min: [min[0] - pad, min[1] - pad, min[2] - pad],
        max: [max[0] + pad, max[1] + pad, max[2] + pad],
      };
      const mesh = meshFromManifold(solidFromSdf({ wasm, scope }, sdf, bounds, L.meshEdge));
      return { name, color, assembly: "astronaut", mesh };
    }),
  );
  return { parts };
};

export default build;
