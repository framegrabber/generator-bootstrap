import type { ManifoldToplevel } from "manifold-3d";

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
export type TextParam = ParamBase & { kind: "text"; default: string; maxLength?: number };
export type SelectParam = ParamBase & {
  kind: "select";
  default: string;
  options: readonly { value: string; label: string }[];
};

/** Declarative parameter description; the UI form and validation are generated from it. */
export type ParamSpec = NumberParam | BooleanParam | TextParam | SelectParam;

export type ValidationIssue = {
  /** Parameter key the issue belongs to, or null for a whole-generator issue. */
  key: string | null;
  message: string;
};

/** Triangle mesh in the geometry frame (Z-up, millimetres). `positions` is xyz-interleaved. */
export type Mesh = { positions: Float32Array; indices: Uint32Array };

/**
 * One printable body, already in print orientation: Z-up, resting on z = 0.
 * `name` becomes the file name stem, so keep it [A-Za-z0-9_-] and unique within a result.
 */
export type Part = {
  name: string;
  mesh: Mesh;
  /** Copies to print; defaults to 1. 3MF repeats the object, STL notes it in the file name. */
  quantity?: number;
  /** `#rrggbb`; used by the preview and as the 3MF display colour. */
  color?: string;
};

export type ExtraFile = { path: string; content: string };

export type GeneratorResult = {
  parts: Part[];
  extraFiles?: ExtraFile[];
  warnings?: string[];
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
