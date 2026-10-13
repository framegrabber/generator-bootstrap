import { bool, num } from "../../core/params";
import { meshFromManifold, withScope } from "../../core/manifold";
import type { GeneratorDef, ValidationIssue } from "../../core/types";

/**
 * Example generator: a flat rounded-rectangle tag with an optional through-hole.
 * Demonstrates the full contract: params -> validate -> build with WASM scope -> parts.
 */
export const roundedTag: GeneratorDef = {
  id: "rounded-tag",
  name: "Rounded tag",
  description: "Flat rounded-rectangle tag with an optional round hole.",
  params: [
    { kind: "number", key: "width", label: "Width", unit: "mm", default: 40, min: 5, step: 1 },
    { kind: "number", key: "height", label: "Height", unit: "mm", default: 25, min: 5, step: 1 },
    {
      kind: "number",
      key: "thickness",
      label: "Thickness",
      unit: "mm",
      default: 3,
      min: 0.4,
      step: 0.1,
    },
    {
      kind: "number",
      key: "corner",
      label: "Corner radius",
      unit: "mm",
      default: 4,
      min: 0,
      step: 0.5,
    },
    {
      kind: "boolean",
      key: "hole",
      label: "Drill hole",
      default: true,
    },
    {
      kind: "number",
      key: "holeDiameter",
      label: "Hole diameter",
      unit: "mm",
      default: 4,
      min: 0.5,
      step: 0.5,
    },
    {
      kind: "number",
      key: "holeInset",
      label: "Hole centre from left edge",
      unit: "mm",
      default: 6,
      min: 0,
      step: 0.5,
    },
  ],
  validate(values) {
    const issues: ValidationIssue[] = [];
    const width = num(values, "width");
    const height = num(values, "height");
    const corner = num(values, "corner");
    if (corner * 2 >= Math.min(width, height)) {
      issues.push({
        key: "corner",
        message: "Corner radius must be less than half the smaller side",
      });
    }
    if (bool(values, "hole")) {
      const radius = num(values, "holeDiameter") / 2;
      const inset = num(values, "holeInset");
      if (!(inset - radius > 0 && inset + radius < width && radius * 2 < height)) {
        issues.push({ key: "holeInset", message: "Hole must sit fully inside the tag" });
      }
    }
    return issues;
  },
  exportLabel: (values) => `${num(values, "width")}x${num(values, "height")}`,
  async build(values, { wasm }) {
    const width = num(values, "width");
    const height = num(values, "height");
    const thickness = num(values, "thickness");
    const corner = num(values, "corner");

    const mesh = withScope((scope) => {
      // square() is anchored at the origin; shift it so the offset outline spans
      // [0, width] x [0, height], which is the frame holeInset and validate() assume.
      const inner = scope.track(
        wasm.CrossSection.square([width - 2 * corner, height - 2 * corner]),
      );
      const placed = scope.track(inner.translate([corner, corner]));
      const outline = scope.track(placed.offset(corner, "Round"));
      const body = scope.track(outline.extrude(thickness));

      if (!bool(values, "hole")) return meshFromManifold(body);

      const cylinder = scope.track(
        wasm.Manifold.cylinder(thickness + 2, num(values, "holeDiameter") / 2, -1, 48, true),
      );
      const hole = scope.track(
        cylinder.translate([num(values, "holeInset"), height / 2, thickness / 2]),
      );
      const drilled = scope.track(body.subtract(hole));
      if (drilled.isEmpty()) throw new Error("Tag is empty after drilling");
      return meshFromManifold(drilled);
    });

    return { parts: [{ name: "tag", mesh }] };
  },
};
