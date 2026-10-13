import { roundedRect, throughHole } from "../../core/geom";
import { meshFromManifold, withScope } from "../../core/manifold";
import { bool, num } from "../../core/params";
import type { GeneratorBuild } from "../../core/types";

const build: GeneratorBuild = (values, { wasm }) => {
  const width = num(values, "width");
  const height = num(values, "height");
  const thickness = num(values, "thickness");

  const mesh = withScope((scope) => {
    const geom = { wasm, scope };
    // The outline spans [0, width] x [0, height], the frame holeInset and validate() assume.
    const outline = roundedRect(geom, width, height, num(values, "corner"));
    const body = scope.track(outline.extrude(thickness));
    if (!bool(values, "hole")) return meshFromManifold(body);

    const hole = throughHole(geom, {
      diameter: num(values, "holeDiameter"),
      depth: thickness,
      at: [num(values, "holeInset"), height / 2],
    });
    const drilled = scope.track(body.subtract(hole));
    if (drilled.isEmpty()) throw new Error("Tag is empty after drilling");
    return meshFromManifold(drilled);
  });

  return { parts: [{ name: "tag", mesh, quantity: num(values, "copies") }] };
};

export default build;
