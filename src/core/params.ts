import { parseFontRef } from "../fonts/bundled";
import type {
  GeneratorDef,
  ParamSpec,
  ParamValue,
  Params,
  ValidationIssue,
} from "./types";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function defaultParams(specs: readonly ParamSpec[]): Params {
  const values: Params = {};
  for (const spec of specs) values[spec.key] = spec.default;
  return values;
}

export function num(values: Params, key: string): number {
  const value = values[key];
  if (typeof value !== "number") throw new Error(`Parameter "${key}" must be a number`);
  return value;
}

export function bool(values: Params, key: string): boolean {
  const value = values[key];
  if (typeof value !== "boolean") throw new Error(`Parameter "${key}" must be a boolean`);
  return value;
}

export function str(values: Params, key: string): string {
  const value = values[key];
  if (typeof value !== "string") throw new Error(`Parameter "${key}" must be a string`);
  return value;
}

/** True when `value` is a usable value for `spec` (right type, finite, in-vocabulary). */
export function matchesSpec(spec: ParamSpec, value: unknown): value is ParamValue {
  switch (spec.kind) {
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "text":
      return (
        typeof value === "string" &&
        (spec.maxLength === undefined || value.length <= spec.maxLength) &&
        (spec.multiline === true || !value.includes("\n"))
      );
    case "select":
      return typeof value === "string" && spec.options.some((o) => o.value === value);
    case "color":
      return typeof value === "string" && HEX_COLOR.test(value);
    case "font":
      return typeof value === "string" && parseFontRef(value) !== null;
  }
}

/** Whether `spec`'s field is shown for `values`; hidden params skip range checks. */
export function isVisible(spec: ParamSpec, values: Params): boolean {
  return spec.visibleWhen?.(values) ?? true;
}

/**
 * Generic type/range checks first. The generator's own `validate` runs only when those
 * pass, so it can rely on `num()`/`str()` accessors without throwing.
 */
export function validateParams(def: GeneratorDef, values: Params): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const spec of def.params) {
    const value = values[spec.key];
    if (!matchesSpec(spec, value)) {
      issues.push({ key: spec.key, message: `${spec.label}: invalid value` });
      continue;
    }
    if (spec.kind !== "number" || typeof value !== "number" || !isVisible(spec, values)) continue;
    const fail = (message: string) => issues.push({ key: spec.key, message: `${spec.label} ${message}` });
    if (spec.integer && !Number.isInteger(value)) fail("must be a whole number");
    else if (spec.min !== undefined && value < spec.min) fail(`must be at least ${spec.min}`);
    else if (spec.max !== undefined && value > spec.max) fail(`must be at most ${spec.max}`);
  }
  if (issues.length > 0) return issues;
  return def.validate ? def.validate(values) : [];
}
