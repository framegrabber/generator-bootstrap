/**
 * Hardware the dog is built around. Main-thread safe (no WASM): index.ts uses it for select
 * options and validation, layout.ts for geometry. All sizes in millimetres.
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
