import type {
  GeneratorDef,
  ParamSpec,
  ParamValue,
  Params,
  ValidationIssue,
} from "./types";

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
        typeof value === "string" && (spec.maxLength === undefined || value.length <= spec.maxLength)
      );
    case "select":
      return typeof value === "string" && spec.options.some((o) => o.value === value);
  }
}

/**
 * Generic range/type checks first. The generator's own `validate` runs only when those
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
    if (spec.kind === "number" && typeof value === "number") {
      if (spec.min !== undefined && value < spec.min) {
        issues.push({ key: spec.key, message: `${spec.label} must be at least ${spec.min}` });
      }
    }
  }
  if (issues.length > 0) return issues;
  return def.validate ? def.validate(values) : [];
}
