import { roundedRect, throughHole } from "../../core/geom";
import { meshFromManifold, withScope } from "../../core/manifold";
import { bool, num, str } from "../../core/params";
import { textOutline, type TextAlign } from "../../core/text";
import type { GeneratorBuild, Part } from "../../core/types";
import { loadFont } from "../../fonts/load";

const ASSEMBLY = "tag";

const build: GeneratorBuild = async (values, { wasm }) => {
  const font = await loadFont(str(values, "font"));
  const thickness = num(values, "thickness");
  const padding = num(values, "padding");
  const mode = str(values, "mode");
  const hole = bool(values, "hole");
  const holeDiameter = hole ? num(values, "holeDiameter") : 0;
  const plateColor = str(values, "plateColor");
  const textColor = str(values, "textColor");
  const warnings: string[] = [];

  const parts = withScope((scope): Part[] => {
    const geom = { wasm, scope };
    const laidOut = textOutline(geom, font, {
      text: str(values, "text"),
      capHeight: num(values, "capHeight"),
      lineSpacing: num(values, "lineSpacing"),
      // Select params only ever hold one of their declared options.
      align: str(values, "align") as TextAlign,
    });

    // Plate around the text's bounds; the keyring hole gets its own margin on the left. Shift
    // everything so the plate's lower-left corner is the origin.
    const { min, max } = laidOut.bounds();
    const holeSpace = hole ? holeDiameter + padding : 0;
    const [left, bottom] = [min[0] - padding - holeSpace, min[1] - padding];
    const [width, height] = [max[0] + padding - left, max[1] + padding - bottom];
    const outline = scope.track(laidOut.translate([-left, -bottom]));
    const radius = Math.min(num(values, "corner"), 0.49 * Math.min(width, height));
    let plate = scope.track(roundedRect(geom, width, height, radius).extrude(thickness));
    if (hole) {
      const at = [padding + holeDiameter / 2, height / 2] as const;
      plate = scope.track(
        plate.subtract(throughHole(geom, { diameter: holeDiameter, depth: thickness, at })),
      );
    }

    // The text as a solid from z0 up `depth` mm. Recess and inlay come from the same outline,
    // so an embedded text part fills its recess exactly.
    const textSolid = (z0: number, depth: number) =>
      scope.track(scope.track(outline.extrude(depth)).translate([0, 0, z0]));
    const plateMesh = (body: typeof plate) =>
      ({ name: "plate", mesh: meshFromManifold(body), color: plateColor }) satisfies Part;

    if (mode === "raised") {
      const text = textSolid(thickness, num(values, "raisedHeight"));
      return [
        { ...plateMesh(plate), assembly: ASSEMBLY },
        { name: "text", mesh: meshFromManifold(text), color: textColor, assembly: ASSEMBLY },
      ];
    }
    if (mode === "embedded") {
      const depth = num(values, "inlayDepth");
      // The recess tool overshoots the top so the cut leaves no skin at z = thickness.
      const recessed = scope.track(plate.subtract(textSolid(thickness - depth, depth + 1)));
      const inlay = textSolid(thickness - depth, depth);
      return [
        { ...plateMesh(recessed), assembly: ASSEMBLY },
        { name: "text", mesh: meshFromManifold(inlay), color: textColor, assembly: ASSEMBLY },
      ];
    }
    const depth = num(values, "cutDepth");
    const through = depth >= thickness;
    if (through) {
      warnings.push(
        "Text is cut through the plate: enclosed shapes such as the middle of O, A, or B fall out.",
      );
    }
    // A through-cut starts below the plate so no skin remains at z = 0.
    const start = through ? -1 : thickness - depth;
    const cut = scope.track(plate.subtract(textSolid(start, thickness + 1 - start)));
    return [plateMesh(cut)];
  });

  return { parts, warnings };
};

export default build;
