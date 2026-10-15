import { num, str } from "../core/params";
import type { ParamSpec, Params, ValidationIssue } from "../core/types";

/**
 * Hardware a display character is built around: display modules and batteries, their params,
 * and their validation. Main-thread safe (no WASM). All sizes in millimetres.
 */

/** Edge of the display, as seen from the front, that a connector or port faces. */
export type Edge = "left" | "right" | "top" | "bottom";

export type ModuleShape =
  | { kind: "round"; diameter: number; viewDiameter: number }
  | {
      kind: "rect";
      width: number;
      height: number;
      corner: number;
      viewWidth: number;
      viewHeight: number;
    };

export type DisplayModule = {
  /** Outline of the module (glass or board, whichever is larger) and its visible area. */
  shape: ModuleShape;
  /** Front of the glass to the back of the tallest part behind it. */
  thickness: number;
  /** Board area sticking out past the outline at the port edge (pin header, FPC, USB). */
  tab?: { width: number; beyond: number };
  /** USB-C on the tab edge; the head gets a plug opening there and `usbEdge` picks the edge. */
  usb: boolean;
};

export type DisplayId =
  "gc9a01-module" | "waveshare-s3-lcd-128" | "waveshare-s3-touch-lcd-128" | "custom";

/**
 * Catalogue modules. Thicknesses marked "estimate" are guesses (the vendors publish none) and
 * should be replaced with measurements. Sources: the GC9A01 module datasheet and the Waveshare
 * wiki dimension drawings (see docs/ideas/display-dog.md).
 */
export const DISPLAYS: Record<
  Exclude<DisplayId, "custom">,
  { label: string; module: DisplayModule }
> = {
  "gc9a01-module": {
    label: '1.28" round GC9A01 module',
    // 38 x 45.5 x 4.5 board: a round panel with the pin header in a tab below it.
    module: {
      shape: { kind: "round", diameter: 38, viewDiameter: 32.4 },
      thickness: 4.5,
      tab: { width: 20, beyond: 7.5 },
      usb: false,
    },
  },
  "waveshare-s3-lcd-128": {
    label: "Waveshare ESP32-S3-LCD-1.28",
    // Board R18.25; USB-C tab 18.37 wide, 5.48 past the circle. Thickness: estimate.
    module: {
      shape: { kind: "round", diameter: 36.5, viewDiameter: 32.4 },
      thickness: 11,
      tab: { width: 18.37, beyond: 5.48 },
      usb: true,
    },
  },
  "waveshare-s3-touch-lcd-128": {
    label: "Waveshare ESP32-S3-Touch-LCD-1.28",
    // Glass Ø38.51, 40.36 tall with the FPC tab; USB-C on the same edge. Thickness: estimate.
    module: {
      shape: { kind: "round", diameter: 38.51, viewDiameter: 33.4 },
      thickness: 8,
      tab: { width: 12, beyond: 1.85 },
      usb: true,
    },
  },
};

/** LiPo pouches by their name code: thickness (0.1 mm units), width, length. */
export const BATTERIES: Record<string, { label: string; size: readonly [number, number, number] }> =
  {
    "402030": { label: "402030 (~200 mAh)", size: [4, 20, 30] },
    "502030": { label: "502030 (~250 mAh)", size: [5, 20, 30] },
    "503035": { label: "503035 (~500 mAh)", size: [5, 30, 35] },
  };

/**
 * Space reserved around a pouch: thickness for swelling, width for tolerance, length for the
 * protection board and leads at one end.
 */
export const BATTERY_ALLOWANCE = [1.5, 2, 4] as const;

/** Rotation in the face plane (degrees, counter-clockwise seen from the front) from "top". */
export const EDGE_ANGLE: Record<Edge, number> = { top: 0, left: 90, bottom: 180, right: -90 };

/** The module selected by `display`, built from the custom fields when it is "custom". */
export function selectedModule(values: Params): DisplayModule {
  // Select params only ever hold one of their declared options.
  const id = str(values, "display") as DisplayId;
  if (id !== "custom") return DISPLAYS[id].module;
  const thickness = num(values, "customThickness");
  if (str(values, "customShape") === "round") {
    const shape = {
      kind: "round" as const,
      diameter: num(values, "customDiameter"),
      viewDiameter: num(values, "customViewDiameter"),
    };
    return { shape, thickness, usb: false };
  }
  const shape = {
    kind: "rect" as const,
    width: num(values, "customWidth"),
    height: num(values, "customHeight"),
    corner: num(values, "customCorner"),
    viewWidth: num(values, "customViewWidth"),
    viewHeight: num(values, "customViewHeight"),
  };
  return { shape, thickness, usb: false };
}

/** The edge the module's tab and port face: chosen for USB boards, down for the rest. */
export function selectedEdge(values: Params, module: DisplayModule): Edge {
  // Select params only ever hold one of their declared options.
  return module.usb ? (str(values, "usbEdge") as Edge) : "bottom";
}

/** The battery pouch size (thickness, width, length), or null for none. */
export function selectedBattery(values: Params): readonly [number, number, number] | null {
  const id = str(values, "battery");
  if (id === "none") return null;
  if (id === "custom") {
    return [
      num(values, "batteryThickness"),
      num(values, "batteryWidth"),
      num(values, "batteryLength"),
    ];
  }
  return BATTERIES[id].size;
}

const isCustom = (v: Params) => v.display === "custom";
const isCustomRound = (v: Params) => isCustom(v) && v.customShape === "round";
const isCustomRect = (v: Params) => isCustom(v) && v.customShape === "rect";
const hasUsb = (v: Params) =>
  Object.entries(DISPLAYS).some(([id, d]) => id === v.display && d.module.usb);

/** The "Display" param group: catalogue module or custom outline, and the USB-C edge. */
export function displayParams(): ParamSpec[] {
  const mm = (key: string, label: string, value: number, visibleWhen: (v: Params) => boolean) => ({
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
  });
  return [
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
    mm("customDiameter", "Module diameter", 40, isCustomRound),
    mm("customViewDiameter", "Visible diameter", 34, isCustomRound),
    mm("customWidth", "Module width", 40, isCustomRect),
    mm("customHeight", "Module height", 30, isCustomRect),
    mm("customViewWidth", "Visible width", 34, isCustomRect),
    mm("customViewHeight", "Visible height", 24, isCustomRect),
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
  ];
}

/** The "Battery" param group. */
export function batteryParams(): ParamSpec[] {
  const mm = (key: string, label: string, value: number) => ({
    kind: "number" as const,
    key,
    label,
    group: "Battery",
    unit: "mm",
    default: value,
    min: 1,
    max: 60,
    step: 0.5,
    visibleWhen: (v: Params) => v.battery === "custom",
  });
  return [
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
    mm("batteryThickness", "Battery thickness", 5),
    mm("batteryWidth", "Battery width", 20),
    mm("batteryLength", "Battery length", 30),
  ];
}

/** A custom display needs a lip of at least 1 mm and a corner radius that fits. */
export function validateDisplay(values: Params): ValidationIssue[] {
  if (str(values, "display") !== "custom") return [];
  const issues: ValidationIssue[] = [];
  const { shape } = selectedModule(values);
  const lip = (outline: number, view: number, key: string, what: string) => {
    if (view > outline - 1) {
      issues.push({
        key,
        message: `Visible ${what} must be at least 1 mm smaller than the module`,
      });
    }
  };
  if (shape.kind === "round") {
    lip(shape.diameter, shape.viewDiameter, "customViewDiameter", "diameter");
  } else {
    lip(shape.width, shape.viewWidth, "customViewWidth", "width");
    lip(shape.height, shape.viewHeight, "customViewHeight", "height");
    if (shape.corner > Math.min(shape.width, shape.height) / 2) {
      issues.push({
        key: "customCorner",
        message: "Corner radius must be at most half the module's shorter side",
      });
    }
  }
  return issues;
}
