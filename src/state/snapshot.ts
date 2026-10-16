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

/** Query key for the generator id; every other key is a param key. */
const GENERATOR_KEY = "g";
/** The original link format: the whole snapshot as JSON. Read, never written. */
const LEGACY_KEY = "p";

/**
 * The snapshot as readable query parameters: `g=<generator>` plus `key=value` for each value
 * that differs from its default, or whose param is `alwaysInLink`. A default robot is
 * `g=display-robot&display=…`. Other defaults are left out, so a link follows them when they
 * change. Param keys must not be "g" or "p".
 */
export function snapshotQuery(
  snapshot: Snapshot,
  generators: readonly GeneratorDef[] = GENERATORS,
): string {
  const query = new URLSearchParams({ [GENERATOR_KEY]: snapshot.generator });
  const def = findGenerator(snapshot.generator, generators);
  for (const spec of def?.params ?? []) {
    const value = snapshot.values[spec.key];
    if (value !== undefined && (spec.alwaysInLink || value !== spec.default)) {
      query.set(spec.key, String(value));
    }
  }
  return query.toString();
}

/** Reads a query value back as the type its param expects; unknown keys are guessed. */
function parseQueryValue(text: string, spec: GeneratorDef["params"][number] | undefined) {
  const kind = spec?.kind;
  if (kind === "number") return Number(text);
  if (kind === "boolean") return text === "true" ? true : text === "false" ? false : text;
  if (kind !== undefined) return text;
  // An unknown key may be a renamed param that `migrate` still maps, so keep its likely type.
  if (text === "true" || text === "false") return text === "true";
  return text.trim() !== "" && Number.isFinite(Number(text)) ? Number(text) : text;
}

/**
 * The raw snapshot a URL query describes, for `restoreSnapshot`: the readable form written by
 * `snapshotQuery`, or the legacy `p=<json>` form still found in older links and READMEs.
 * Undefined when the query has neither.
 */
export function querySnapshot(
  search: string,
  generators: readonly GeneratorDef[] = GENERATORS,
): unknown {
  const query = new URLSearchParams(search);
  const generator = query.get(GENERATOR_KEY);
  if (generator !== null) {
    const def = findGenerator(generator, generators);
    const values: Record<string, unknown> = {};
    for (const [key, text] of query) {
      if (key === GENERATOR_KEY) continue;
      values[key] = parseQueryValue(
        text,
        def?.params.find((spec) => spec.key === key),
      );
    }
    return { generator, values };
  }
  const legacy = query.get(LEGACY_KEY);
  if (legacy === null) return undefined;
  try {
    return JSON.parse(legacy) as unknown;
  } catch {
    return undefined;
  }
}
