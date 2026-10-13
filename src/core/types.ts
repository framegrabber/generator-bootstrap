import type { ManifoldToplevel } from "manifold-3d";

export type ManifoldLib = ManifoldToplevel;

export type ParamValue = number | boolean | string;
export type Params = Record<string, ParamValue>;

type ParamBase = { key: string; label: string };

export type NumberParam = ParamBase & {
  kind: "number";
  default: number;
  unit?: string;
  min?: number;
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

/** Triangle mesh in the geometry frame (Z-up). `positions` is xyz-interleaved. */
export type Mesh = { positions: Float32Array; indices: Uint32Array };

/** One printable body. `name` becomes the STL filename stem, so keep it [A-Za-z0-9_-]. */
export type Part = { name: string; mesh: Mesh };

export type ExtraFile = { path: string; content: string };

export type GeneratorResult = {
  parts: Part[];
  extraFiles?: ExtraFile[];
  warnings?: string[];
};

export type BuildContext = { wasm: ManifoldLib };

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
  /** Runs in the worker. Must delete every WASM object it creates (see withScope). */
  build: (values: Params, ctx: BuildContext) => Promise<GeneratorResult>;
};
