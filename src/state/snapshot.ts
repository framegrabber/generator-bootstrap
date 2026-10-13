import { GENERATORS, findGenerator } from "../generators";
import { defaultParams, matchesSpec } from "../core/params";
import type { GeneratorDef, Params } from "../core/types";

/** The persisted/shared shape: which generator, and its values. */
export type Snapshot = { generator: string; values: Params };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function defaultSnapshot(generators: readonly GeneratorDef[] = GENERATORS): Snapshot {
  const def = generators[0];
  return { generator: def.id, values: defaultParams(def.params) };
}

/** Starts from defaults and overlays only values that match their spec. Unknown keys drop. */
export function mergeValues(def: GeneratorDef, raw: Record<string, unknown>): Params {
  const values = defaultParams(def.params);
  for (const spec of def.params) {
    const candidate = raw[spec.key];
    if (matchesSpec(spec, candidate)) values[spec.key] = candidate;
  }
  return values;
}

/**
 * Never throws: anything unusable (garbage, unknown generator) falls back to defaults, so a
 * stale URL or an old localStorage entry cannot break startup.
 */
export function restoreSnapshot(
  raw: unknown,
  generators: readonly GeneratorDef[] = GENERATORS,
): Snapshot {
  if (!isRecord(raw) || typeof raw.generator !== "string") return defaultSnapshot(generators);
  const def = findGenerator(raw.generator, generators);
  if (!def) return defaultSnapshot(generators);
  const rawValues = isRecord(raw.values) ? raw.values : {};
  const migrated = def.migrate ? def.migrate(rawValues) : rawValues;
  return { generator: def.id, values: mergeValues(def, migrated) };
}
