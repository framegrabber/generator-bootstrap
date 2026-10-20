import type { ManifoldToplevel } from "manifold-3d";
import type { Vec3 } from "./bounds";
import type { Mat4 } from "./mat4";

export type ManifoldLib = ManifoldToplevel;

export type ParamValue = number | boolean | string;
export type Params = Record<string, ParamValue>;

type ParamBase = {
  key: string;
  label: string;
  /** Section heading. Params sharing a group render together, in order of first appearance. */
  group?: string;
  /** One-line hint shown under the field. */
  help?: string;
  /**
   * Hides the field when false. Hidden params keep their value and type check, but skip range
   * checks, so `validate` must not rely on a hidden param being in range.
   */
  visibleWhen?: (values: Params) => boolean;
  /**
   * Written into share links even at its default, so a link keeps its meaning when the default
   * changes later. Give links written before that a `migrate` that fills in the old default.
   */
  alwaysInLink?: boolean;
};

export type NumberParam = ParamBase & {
  kind: "number";
  default: number;
  unit?: string;
  min?: number;
  max?: number;
  /** Whole numbers only (counts, segment numbers). */
  integer?: boolean;
  step?: number;
};
export type BooleanParam = ParamBase & { kind: "boolean"; default: boolean };
export type TextParam = ParamBase & {
  kind: "text";
  default: string;
  maxLength?: number;
  /** Renders a textarea; values may contain "\n". */
  multiline?: boolean;
};
export type SelectParam = ParamBase & {
  kind: "select";
  default: string;
  options: readonly { value: string; label: string }[];
};
/** A colour as `#rrggbb` (lowercase or uppercase hex). */
export type ColorParam = ParamBase & { kind: "color"; default: string };
/**
 * A font reference: `bundled:<id>` for a font in `src/fonts/bundled.ts`, or `upload:<sha256>`
 * for a font the user stored in this browser. Load it in `build.ts` with `loadFont`.
 */
export type FontParam = ParamBase & { kind: "font"; default: string };

/** Declarative parameter description; the UI form and validation are generated from it. */
export type ParamSpec =
  NumberParam | BooleanParam | TextParam | SelectParam | ColorParam | FontParam;

export type ValidationIssue = {
  /** Parameter key the issue belongs to, or null for a whole-generator issue. */
  key: string | null;
  message: string;
};

/** Triangle mesh in the geometry frame (Z-up, millimetres). `positions` is xyz-interleaved. */
export type Mesh = { positions: Float32Array; indices: Uint32Array };

/**
 * One printable body, already in print orientation: Z-up. A standalone part rests on z = 0.
 * `name` becomes the file name stem, so keep it [A-Za-z0-9_-] and unique within a result.
 */
export type Part = {
  name: string;
  mesh: Mesh;
  /** Copies to print; defaults to 1. 3MF repeats the object, STL notes it in the file name. */
  quantity?: number;
  /** `#rrggbb`; used by the preview and as the 3MF display colour. */
  color?: string;
  /**
   * Parts sharing an assembly name are printed together in place, e.g. a plate and its
   * second-colour text. They keep their coordinates, are checked against the bed as one group
   * (the group rests on z = 0), share one quantity, and export as one multi-part 3MF object and
   * one STL folder. Same naming rules as `name`.
   */
  assembly?: string;
  /**
   * Where this part sits in the assembled model: maps its print-pose coordinates to the
   * assembled frame. Preview only; exports use the print pose. When any part sets it, the
   * preview offers an assembled view showing just those parts, so leave it off a part that
   * duplicates others there (a whole-model print next to its pieces).
   */
  assembled?: Mat4;
};

export type ExtraFile = { path: string; content: string };

/**
 * Where the model is cut into parts: a rectangle (four corners in order, assembled frame) the
 * assembled view draws over the model. Preview only.
 */
export type CutPlane = { name: string; corners: [Vec3, Vec3, Vec3, Vec3] };

/**
 * Hardware drawn in the assembled view only, such as the display a character's face frames:
 * coordinates in the assembled frame. Never exported or checked.
 */
export type StandIn = { name: string; mesh: Mesh; color: string };

export type GeneratorResult = {
  parts: Part[];
  extraFiles?: ExtraFile[];
  warnings?: string[];
  /** Cuts to show in the assembled view. */
  cutPlanes?: CutPlane[];
  /** Hardware to show in the assembled view. */
  standIns?: StandIn[];
};

export type BuildContext = { wasm: ManifoldLib };

/**
 * Generator metadata, loaded on the main thread and in the worker. Lives in
 * `src/generators/<id>/index.ts` as the default export; the folder name must equal `id`.
 */
export type GeneratorDef = {
  id: string;
  name: string;
  description: string;
  params: readonly ParamSpec[];
  /** Runs only after every generic param check passes, so values are type-correct here. */
  validate?: (values: Params) => ValidationIssue[];
  /** Upgrades legacy saved values (renamed keys etc.) before defaults are merged in. */
  migrate?: (raw: Record<string, unknown>) => Record<string, unknown>;
  /** Short label for export filenames; defaults to the generator id. */
  exportLabel?: (values: Params) => string;
};

/**
 * Geometry entry point, the default export of `src/generators/<id>/build.ts`. Loaded lazily in
 * the worker only, so WASM-heavy code stays out of the main bundle. Must delete every WASM
 * object it creates (see withScope).
 */
export type GeneratorBuild = (
  values: Params,
  ctx: BuildContext,
) => GeneratorResult | Promise<GeneratorResult>;
