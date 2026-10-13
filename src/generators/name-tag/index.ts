import { bool, num, str } from "../../core/params";
import type { GeneratorDef, Params, ValidationIssue } from "../../core/types";
import { DEFAULT_FONT } from "../../fonts/bundled";

const isMode = (mode: string) => (values: Params) => values.mode === mode;

/**
 * Name tag / keychain: text on a rounded plate, embedded flush in a second colour, raised in a
 * second colour, or cut into the plate. Geometry in build.ts.
 */
const nameTag: GeneratorDef = {
  id: "name-tag",
  name: "Name tag",
  description: "Text on a rounded plate: embedded or raised in a second colour, or cut out.",
  params: [
    {
      kind: "text",
      key: "text",
      label: "Text",
      group: "Text",
      default: "Ada",
      maxLength: 120,
      multiline: true,
    },
    { kind: "font", key: "font", label: "Font", group: "Text", default: DEFAULT_FONT },
    {
      kind: "number",
      key: "capHeight",
      label: "Letter height",
      group: "Text",
      help: "Height of capital letters.",
      unit: "mm",
      default: 8,
      min: 2,
      max: 100,
      step: 0.5,
    },
    {
      kind: "select",
      key: "align",
      label: "Alignment",
      group: "Text",
      default: "center",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Centre" },
        { value: "right", label: "Right" },
      ],
    },
    {
      kind: "number",
      key: "lineSpacing",
      label: "Line spacing",
      group: "Text",
      help: "Multiple of the font's line height; matters only for several lines.",
      default: 1,
      min: 0.5,
      max: 3,
      step: 0.1,
    },
    {
      kind: "select",
      key: "mode",
      label: "Text style",
      group: "Style",
      default: "raised",
      options: [
        { value: "embedded", label: "Embedded (flush, second colour)" },
        { value: "raised", label: "Raised (second colour)" },
        { value: "cutout", label: "Cut out" },
      ],
    },
    {
      kind: "number",
      key: "raisedHeight",
      label: "Raised height",
      group: "Style",
      unit: "mm",
      default: 1,
      min: 0.2,
      max: 10,
      step: 0.2,
      visibleWhen: isMode("raised"),
    },
    {
      kind: "number",
      key: "inlayDepth",
      label: "Inlay depth",
      group: "Style",
      help: "How deep the text sits in the plate; two or three layers is usually enough.",
      unit: "mm",
      default: 0.6,
      min: 0.2,
      step: 0.2,
      visibleWhen: isMode("embedded"),
    },
    {
      kind: "number",
      key: "cutDepth",
      label: "Cut depth",
      group: "Style",
      help: "Equal to the plate thickness cuts through; letters like O and A then lose their middles.",
      unit: "mm",
      default: 1,
      min: 0.2,
      step: 0.2,
      visibleWhen: isMode("cutout"),
    },
    {
      kind: "color",
      key: "textColor",
      label: "Text colour",
      group: "Style",
      default: "#1f2937",
      visibleWhen: (values) => values.mode !== "cutout",
    },
    { kind: "color", key: "plateColor", label: "Plate colour", group: "Style", default: "#e8e2d4" },
    {
      kind: "number",
      key: "thickness",
      label: "Plate thickness",
      group: "Plate",
      unit: "mm",
      default: 3,
      min: 0.6,
      max: 20,
      step: 0.2,
    },
    {
      kind: "number",
      key: "padding",
      label: "Margin around text",
      group: "Plate",
      unit: "mm",
      default: 3,
      min: 0,
      max: 50,
      step: 0.5,
    },
    {
      kind: "number",
      key: "corner",
      label: "Corner radius",
      group: "Plate",
      unit: "mm",
      default: 3,
      min: 0,
      max: 50,
      step: 0.5,
    },
    { kind: "boolean", key: "hole", label: "Keyring hole", group: "Keyring", default: true },
    {
      kind: "number",
      key: "holeDiameter",
      label: "Hole diameter",
      group: "Keyring",
      unit: "mm",
      default: 4,
      min: 1,
      max: 30,
      step: 0.5,
      visibleWhen: (values) => values.hole === true,
    },
  ],
  validate(values) {
    const issues: ValidationIssue[] = [];
    if (str(values, "text").trim() === "") issues.push({ key: "text", message: "Enter some text" });
    const thickness = num(values, "thickness");
    const mode = str(values, "mode");
    if (mode === "embedded" && num(values, "inlayDepth") >= thickness) {
      issues.push({
        key: "inlayDepth",
        message: "Inlay depth must be less than the plate thickness",
      });
    }
    if (mode === "cutout" && num(values, "cutDepth") > thickness) {
      issues.push({ key: "cutDepth", message: "Cut depth cannot exceed the plate thickness" });
    }
    // The plate is at least one line of capitals plus the margin on each side tall.
    const minPlateHeight = num(values, "capHeight") + 2 * num(values, "padding");
    if (bool(values, "hole") && num(values, "holeDiameter") > minPlateHeight - 2) {
      issues.push({
        key: "holeDiameter",
        message: "Hole needs 1 mm of plate above and below; enlarge the letters or the margin",
      });
    }
    return issues;
  },
  exportLabel: (values) => str(values, "text").split("\n")[0].trim() || "tag",
};

export default nameTag;
