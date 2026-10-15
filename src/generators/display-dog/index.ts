import { str } from "../../core/params";
import type { GeneratorDef, Params, ValidationIssue } from "../../core/types";
import { BATTERIES, DISPLAYS } from "./catalogue";
import { dogLayout, placeBattery, selectedBattery, selectedModule } from "./layout";

const is =
  (key: string, ...options: string[]) =>
  (values: Params) =>
    options.includes(String(values[key]));
const isCustom = is("display", "custom");
const isCustomRound = (v: Params) => isCustom(v) && v.customShape === "round";
const hasUsb = (v: Params) =>
  Object.entries(DISPLAYS).some(([id, d]) => id === v.display && d.module.usb);
const isCustomRect = (v: Params) => isCustom(v) && v.customShape === "rect";

/**
 * A sitting dog whose face is a round (or custom) display. The display sets the head size;
 * the rest are proportions. Geometry in build.ts, dimensions in layout.ts.
 */
const displayDog: GeneratorDef = {
  id: "display-dog",
  name: "Display dog",
  description:
    "A sitting dog enclosure built around a small display: head in two halves, body with a neck socket.",
  params: [
    {
      kind: "select",
      key: "display",
      label: "Display",
      group: "Display",
      default: "waveshare-s3-touch-lcd-128",
      options: [
        ...Object.entries(DISPLAYS).map(([value, d]) => ({ value, label: d.label })),
        { value: "custom", label: "Custom" },
      ],
      help: "Board thicknesses are estimates; check yours with calipers and use Custom if it differs.",
    },
    {
      kind: "select",
      key: "usbEdge",
      label: "USB-C faces",
      group: "Display",
      default: "right",
      options: [
        { value: "right", label: "Right" },
        { value: "left", label: "Left" },
        { value: "top", label: "Top" },
      ],
      visibleWhen: hasUsb,
      help: "Mount the board turned this way and rotate the picture in firmware.",
    },
    {
      kind: "select",
      key: "customShape",
      label: "Shape",
      group: "Display",
      default: "round",
      options: [
        { value: "round", label: "Round" },
        { value: "rect", label: "Rectangle" },
      ],
      visibleWhen: isCustom,
    },
    ...(
      [
        ["customDiameter", "Module diameter", 40, isCustomRound],
        ["customViewDiameter", "Visible diameter", 34, isCustomRound],
        ["customWidth", "Module width", 40, isCustomRect],
        ["customHeight", "Module height", 30, isCustomRect],
        ["customViewWidth", "Visible width", 34, isCustomRect],
        ["customViewHeight", "Visible height", 24, isCustomRect],
      ] as const
    ).map(([key, label, value, visibleWhen]) => ({
      kind: "number" as const,
      key,
      label,
      group: "Display",
      unit: "mm",
      default: value,
      min: 10,
      max: 80,
      step: 0.1,
      visibleWhen,
    })),
    {
      kind: "number",
      key: "customCorner",
      label: "Module corner radius",
      group: "Display",
      unit: "mm",
      default: 2,
      min: 0,
      max: 20,
      step: 0.5,
      visibleWhen: isCustomRect,
    },
    {
      kind: "number",
      key: "customThickness",
      label: "Module thickness",
      group: "Display",
      unit: "mm",
      default: 6,
      min: 1,
      max: 25,
      step: 0.1,
      visibleWhen: isCustom,
      help: "Front of the glass to the back of the tallest part behind it.",
    },
    {
      kind: "number",
      key: "faceMargin",
      label: "Face margin",
      group: "Shape",
      unit: "mm",
      default: 5,
      min: 4,
      max: 20,
      step: 0.5,
      help: "Flat face around the display; sets the head size.",
    },
    {
      kind: "number",
      key: "headDepth",
      label: "Head depth",
      group: "Shape",
      unit: "%",
      default: 80,
      min: 50,
      max: 120,
      step: 1,
      help: "Front to back, relative to the width. Never less than the display needs.",
    },
    {
      kind: "number",
      key: "bodySize",
      label: "Body size",
      group: "Shape",
      unit: "%",
      default: 72,
      min: 55,
      max: 100,
      step: 1,
      help: "Relative to the head.",
    },
    {
      kind: "number",
      key: "softness",
      label: "Softness",
      group: "Shape",
      unit: "mm",
      default: 4,
      min: 1,
      max: 8,
      step: 0.5,
      help: "How smoothly the head, ears, and limbs blend into each other.",
    },
    {
      kind: "select",
      key: "earStyle",
      label: "Ears",
      group: "Dog",
      default: "pointy",
      options: [
        { value: "pointy", label: "Pointy" },
        { value: "round", label: "Round" },
        { value: "floppy", label: "Floppy" },
        { value: "none", label: "None" },
      ],
    },
    {
      kind: "number",
      key: "earLength",
      label: "Ear length",
      group: "Dog",
      unit: "mm",
      default: 18,
      min: 8,
      max: 30,
      step: 0.5,
      visibleWhen: (v) => v.earStyle !== "none",
    },
    {
      kind: "number",
      key: "earWidth",
      label: "Ear width",
      group: "Dog",
      unit: "mm",
      default: 14,
      min: 8,
      max: 24,
      step: 0.5,
      visibleWhen: (v) => v.earStyle !== "none",
    },
    {
      kind: "number",
      key: "earSpread",
      label: "Ear spread",
      group: "Dog",
      unit: "°",
      default: 15,
      min: 0,
      max: 45,
      step: 1,
      visibleWhen: (v) => v.earStyle === "pointy" || v.earStyle === "round",
      help: "Outward lean.",
    },
    {
      kind: "number",
      key: "snout",
      label: "Snout size",
      group: "Dog",
      unit: "mm",
      default: 5,
      min: 0,
      max: 8,
      step: 0.5,
      help: "0 for none. Limited by the room below the screen.",
    },
    {
      kind: "boolean",
      key: "nose",
      label: "Nose",
      group: "Dog",
      default: true,
      visibleWhen: (v) => typeof v.snout === "number" && v.snout > 0,
    },
    { kind: "boolean", key: "frontLegs", label: "Front legs", group: "Dog", default: true },
    {
      kind: "select",
      key: "tail",
      label: "Tail",
      group: "Dog",
      default: "curl",
      options: [
        { value: "curl", label: "Curled up" },
        { value: "wag", label: "Wagging" },
        { value: "stub", label: "Stub" },
        { value: "none", label: "None" },
      ],
    },
    {
      kind: "select",
      key: "battery",
      label: "Battery",
      group: "Battery",
      default: "502030",
      options: [
        { value: "none", label: "None (USB powered)" },
        ...Object.entries(BATTERIES).map(([value, b]) => ({ value, label: b.label })),
        { value: "custom", label: "Custom" },
      ],
      help: "Lies flat behind the display; the head must have room for it.",
    },
    ...(
      [
        ["batteryThickness", "Battery thickness", 5],
        ["batteryWidth", "Battery width", 20],
        ["batteryLength", "Battery length", 30],
      ] as const
    ).map(([key, label, value]) => ({
      kind: "number" as const,
      key,
      label,
      group: "Battery",
      unit: "mm",
      default: value,
      min: 1,
      max: 60,
      step: 0.5,
      visibleWhen: is("battery", "custom"),
    })),
    {
      kind: "boolean",
      key: "neckCut",
      label: "Cut head from body",
      group: "Cuts",
      default: true,
      help: "The head plugs onto the body with a peg. Off: head and body print as one piece.",
    },
    {
      kind: "number",
      key: "neckCutOffset",
      label: "Neck cut height",
      group: "Cuts",
      unit: "mm",
      default: 0,
      min: -15,
      max: 15,
      step: 0.5,
      visibleWhen: (v) => v.neckCut === true,
      help: "Up or down from just under the head. Keep it clear of the chin and tail.",
    },
    {
      kind: "boolean",
      key: "headSplit",
      label: "Split head front/back",
      group: "Cuts",
      default: true,
      help: "Opens the head for the display. Off: the display cannot be fitted.",
    },
    {
      kind: "number",
      key: "headSplitOffset",
      label: "Head split position",
      group: "Cuts",
      unit: "mm",
      default: 0,
      min: -15,
      max: 15,
      step: 0.5,
      visibleWhen: (v) => v.headSplit === true,
      help: "Back (+) or forward (−) from the ears' middle, where half-ears print flat.",
    },
    {
      kind: "number",
      key: "wall",
      label: "Wall thickness",
      group: "Print",
      unit: "mm",
      default: 2,
      min: 1.2,
      max: 4,
      step: 0.1,
    },
    {
      kind: "number",
      key: "fit",
      label: "Fit clearance",
      group: "Print",
      unit: "mm",
      default: 0.2,
      min: 0,
      max: 0.6,
      step: 0.05,
      help: "Gap around the neck peg and the filament dowels.",
    },
    {
      kind: "select",
      key: "accentMode",
      label: "Nose and inner ears",
      group: "Print",
      default: "inplace",
      options: [
        { value: "inplace", label: "Second colour, printed in place" },
        { value: "glue", label: "Second colour, glued on" },
        { value: "none", label: "Same colour" },
      ],
      help: "Printed in place needs a multi-colour printer.",
    },
    { kind: "color", key: "bodyColor", label: "Body colour", group: "Print", default: "#f1e6d6" },
    {
      kind: "color",
      key: "accentColor",
      label: "Accent colour",
      group: "Print",
      default: "#4a3428",
      visibleWhen: (v) => v.accentMode !== "none",
    },
    {
      kind: "select",
      key: "detail",
      label: "Mesh detail",
      group: "Print",
      default: "normal",
      options: [
        { value: "draft", label: "Draft (fast)" },
        { value: "normal", label: "Normal" },
        { value: "fine", label: "Fine (slow)" },
      ],
    },
  ],
  validate(values) {
    const issues: ValidationIssue[] = [];
    if (str(values, "display") === "custom") {
      const module = selectedModule(values);
      const lip = (outline: number, view: number, key: string, what: string) => {
        if (view > outline - 1) {
          issues.push({
            key,
            message: `Visible ${what} must be at least 1 mm smaller than the module`,
          });
        }
      };
      if (module.shape.kind === "round") {
        lip(module.shape.diameter, module.shape.viewDiameter, "customViewDiameter", "diameter");
      } else {
        lip(module.shape.width, module.shape.viewWidth, "customViewWidth", "width");
        lip(module.shape.height, module.shape.viewHeight, "customViewHeight", "height");
        if (module.shape.corner > Math.min(module.shape.width, module.shape.height) / 2) {
          issues.push({
            key: "customCorner",
            message: "Corner radius must be at most half the module's shorter side",
          });
        }
      }
    }
    if (issues.length > 0) return issues;
    const L = dogLayout(values);
    if (L.split.cut && L.split.y < L.pocketBack + 0.5) {
      issues.push({
        key: "headSplitOffset",
        message: "The head split runs through the display pocket; move it back.",
      });
    }
    if (L.neck.cut) {
      const displayBottom = L.cz - L.footprint.halfZ;
      if (L.neck.z + L.wall + 2 > displayBottom - L.wall) {
        issues.push({
          key: "neckCutOffset",
          message: "The neck cut runs into the display; move it down.",
        });
      } else if (L.neck.z - L.neck.pegLength - 1 < L.body.center[2]) {
        issues.push({
          key: "neckCutOffset",
          message: "The neck cut is too low for the neck peg; move it up.",
        });
      }
    }
    const pouch = selectedBattery(values);
    if (pouch && !placeBattery(L, pouch)) {
      issues.push({
        key: "battery",
        message:
          "The battery does not fit behind the display. Increase the head depth or face margin, or pick a smaller battery.",
      });
    }
    return issues;
  },
};

export default displayDog;
