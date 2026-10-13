import { bool, num } from "../../core/params";
import type { GeneratorDef, ValidationIssue } from "../../core/types";

/**
 * Example generator: a flat rounded-rectangle tag with an optional through-hole.
 * Geometry lives in build.ts, which only the worker loads.
 */
const roundedTag: GeneratorDef = {
  id: "rounded-tag",
  name: "Rounded tag",
  description: "Flat rounded-rectangle tag with an optional round hole.",
  params: [
    {
      kind: "number",
      key: "width",
      label: "Width",
      group: "Shape",
      unit: "mm",
      default: 40,
      min: 5,
      max: 250,
      step: 1,
    },
    {
      kind: "number",
      key: "height",
      label: "Height",
      group: "Shape",
      unit: "mm",
      default: 25,
      min: 5,
      max: 250,
      step: 1,
    },
    {
      kind: "number",
      key: "thickness",
      label: "Thickness",
      group: "Shape",
      unit: "mm",
      default: 3,
      min: 0.4,
      max: 50,
      step: 0.1,
    },
    {
      kind: "number",
      key: "corner",
      label: "Corner radius",
      group: "Shape",
      unit: "mm",
      default: 4,
      min: 0,
      step: 0.5,
    },
    {
      kind: "number",
      key: "copies",
      label: "Copies",
      group: "Shape",
      help: "Printed copies; 3MF exports place each one on the plate.",
      default: 1,
      min: 1,
      max: 50,
      integer: true,
    },
    { kind: "boolean", key: "hole", label: "Drill hole", group: "Hole", default: true },
    {
      kind: "number",
      key: "holeDiameter",
      label: "Hole diameter",
      group: "Hole",
      unit: "mm",
      default: 4,
      min: 0.5,
      step: 0.5,
      visibleWhen: (values) => values.hole === true,
    },
    {
      kind: "number",
      key: "holeInset",
      label: "Hole centre from left edge",
      group: "Hole",
      unit: "mm",
      default: 6,
      min: 0,
      step: 0.5,
      visibleWhen: (values) => values.hole === true,
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
};

export default roundedTag;
